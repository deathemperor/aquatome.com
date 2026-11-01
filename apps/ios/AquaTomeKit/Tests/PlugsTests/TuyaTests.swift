import Foundation
import Testing
@testable import Plugs
import Tanks

// TuyaPlugs against FakeTuya, Tuya's cloud as its docs describe it (the parked server route's tests,
// apps/site/worker/test/plugs.test.ts, check the same). Keys and device ids here are made up.

let keys = TuyaKeys(accessId: "test-access-id", accessSecret: "test-access-secret", dataCenter: .westernAmerica)

func strip(_ id: String = "fake-strip-1") -> FakeTuya.Device {
  FakeTuya.Device(id: id, name: "Ổ cắm bể 60", status: [
    ("switch_1", .bool(true)), ("switch_2", .bool(false)), ("switch_usb1", .bool(true)), ("switch_led", .bool(true)), ("countdown_1", .number(0)),
  ], names: [("switch_1", "Đèn"), ("switch_2", "CO2"), ("switch_usb1", " "), ("main", "Ổ cắm bể 60")])
}
let sensor = FakeTuya.Device(id: "fake-sensor", name: "Nhiệt kế", status: [("va_temperature", .number(260))])

/// A clock the tests move.
final class Clock: @unchecked Sendable {
  private let lock = NSLock()
  private var t = Date(timeIntervalSince1970: 1_790_000_000)
  var now: Date { lock.withLock { t } }
  func advance(_ s: TimeInterval) { lock.withLock { t += s } }
}

actor Waits {
  private(set) var all: [Duration] = []
  func add(_ d: Duration) { all.append(d) }
}

/// A project on the stand-in cloud, and the source with its keys (or others).
@MainActor
struct Cloud {
  let fake: FakeTuya
  let clock = Clock()
  let waits = Waits()

  init(_ devices: [FakeTuya.Device] = [strip()]) {
    fake = FakeTuya(accessId: keys.accessId, accessSecret: keys.accessSecret, devices: devices)
  }

  func source(_ k: TuyaKeys = keys, wait: Duration = .zero) -> TuyaPlugs {
    let fake = fake, clock = clock, waits = waits
    return TuyaPlugs(keys: k, send: { try await fake.send($0) }, now: { clock.now }, wait: { d in
      await waits.add(d)
      if wait > .zero { try? await Task.sleep(for: wait) }
    })
  }

  var tokens: Int { fake.log.filter { $0.path.hasPrefix("/v1.0/token") }.count }
  var lists: Int { fake.log.filter { $0.path.hasPrefix("/v1.0/iot-01/associated-users/devices") }.count }
  var reads: Int { fake.log.filter { $0.path.hasSuffix("/status") }.count }
  var posts: Int { fake.log.filter { $0.method == "POST" }.count }
}

@Test("Signs as Tuya's worked examples do (a token request, then a business request)")
func signsAsTuyasExamples() {
  // https://developer.tuya.com/en/docs/iot/new-singnature: the documentation's own example values.
  let headers = [("area_id", "29a33e8796834b1efa6"), ("call_id", "8afdb70ab2ed11eb85290242ac130003")]
  let base = (id: "1KAD46OrT9HafiKdsXeg", secret: "4OHBOnWOqaEC1mWXOpVL3yV50s0qGSRC", t: "1588925778000", nonce: "5138cc3a9033d69856923fd07b491173")
  #expect(tuyaSign(id: base.id, secret: base.secret, t: base.t, nonce: base.nonce, method: "GET", path: "/v1.0/token?grant_type=1", headers: headers)
    == "9E48A3E93B302EEECC803C7241985D0A34EB944F40FB573C7B5C2A82158AF13E")
  #expect(tuyaSign(id: base.id, secret: base.secret, t: base.t, nonce: base.nonce, token: "3f4eda2bdec17232f67c0b188af3eec1", method: "GET",
                   path: "/v2.0/apps/schema/users?page_size=50&page_no=1", headers: headers)
    == "AE4481C692AA80B25F3A7E12C3A5FD9BBF6251539DD78E565A1A72A508A88784")
}

@Test("Each data center's host, as Tuya's docs list them")
func dataCenters() {
  #expect(TuyaDataCenter.allCases.map(\.host.absoluteString) == [
    "https://openapi.tuyaus.com", "https://openapi-ueaz.tuyaus.com", "https://openapi.tuyaeu.com", "https://openapi-weaz.tuyaeu.com",
    "https://openapi.tuyain.com", "https://openapi.tuyacn.com",
  ])
}

@MainActor @Test("The project's plugs: outlets only (not the indicator light or a countdown), their Smart Life names, other devices counted")
func listsThePlugs() async throws {
  let c = Cloud([strip(), sensor])
  let l = try await c.source().list()
  #expect(l == PlugList(plugs: [LivePlug(provider: "tuya", id: "fake-strip-1", name: "Ổ cắm bể 60", online: true, outlets: [
    LiveOutlet(code: "switch_1", name: "Đèn", on: true), LiveOutlet(code: "switch_2", name: "CO2", on: false), LiveOutlet(code: "switch_usb1", name: nil, on: true),
  ])], others: 1))
  #expect(c.posts == 0, "listing switches nothing")
  // The list carries the status: no device is asked for it.
  #expect(c.reads == 0)
  #expect(TuyaPlugs.isOutlet("switch") && !TuyaPlugs.isOutlet("switch_led") && !TuyaPlugs.isOutlet("switch_usb") && !TuyaPlugs.isOutlet("switch_1a"))
}

@MainActor @Test("The list page by page while there's more; a device listed without its status is asked for it; one without names still lists")
func listsEveryPage() async throws {
  let c = Cloud([strip("fake-a"), strip("fake-b"), sensor, strip("fake-c")])
  c.fake.pageSize = 1
  #expect(try await c.source().list().plugs.map(\.id) == ["fake-a", "fake-b", "fake-c"])
  #expect(c.lists == 4)
  let bare = Cloud([{ var d = strip(); d.names = nil; return d }()])
  bare.fake.listsStatus = false
  let l = try await bare.source().list()
  #expect(l.plugs.first?.outlets == [LiveOutlet(code: "switch_1", name: nil, on: true), LiveOutlet(code: "switch_2", name: nil, on: false), LiveOutlet(code: "switch_usb1", name: nil, on: true)])
  #expect(bare.reads == 1)
}

@MainActor @Test("A token is used until a minute before it runs out; a revoked one is replaced and the request asked once more, never twice")
func tokens() async throws {
  let c = Cloud()
  let s = c.source()
  _ = try await s.list()
  _ = try await s.list()
  #expect(c.tokens == 1)
  c.clock.advance(7140 + 1) // past expire_time less the minute
  _ = try await s.list()
  #expect(c.tokens == 2)
  c.fake.revoke()
  #expect(try await s.list().plugs.count == 1)
  #expect(c.tokens == 3)
  // Refused as stale again: not asked a third time.
  c.fake.failing = 1010
  let before = c.fake.log.count
  await #expect(throws: PlugError.maker(1010)) { try await c.source().list() }
  #expect(c.fake.log.count - before == 2)
}

@MainActor @Test("A command refused for a stale token goes once more with a new one, and only once")
func staleTokenOnACommand() async throws {
  let c = Cloud()
  let s = c.source()
  _ = try await s.list()
  c.fake.revoke()
  #expect(try await s.set(provider: "tuya", device: "fake-strip-1", outlet: "switch_2", on: true) == Switched(on: true, confirmed: true))
  // The first refused before acting (1010), the second carried out.
  #expect(c.posts == 2 && c.tokens == 2)
  // Every request refused as stale: the command, then the new token it asks for; no other command, no read.
  c.fake.failing = 1011
  let (reads, tokens) = (c.reads, c.tokens)
  await #expect(throws: PlugError.maker(1011)) { try await s.set(provider: "tuya", device: "fake-strip-1", outlet: "switch_2", on: false) }
  #expect(c.posts == 3 && c.tokens == tokens + 1 && c.reads == reads)
}

@MainActor @Test("Every request: signed with the project's keys, to its data center, the switch's command as Tuya's docs give it")
func requests() async throws {
  let c = Cloud()
  let fake = c.fake
  let recorder = Recorder()
  let s = TuyaPlugs(keys: TuyaKeys(accessId: keys.accessId, accessSecret: keys.accessSecret, dataCenter: .centralEurope), send: { r in
    await recorder.add(r)
    return try await fake.send(r)
  }, wait: { _ in })
  _ = try await s.list()
  _ = try await s.set(provider: "tuya", device: "fake-strip-1", outlet: "switch_2", on: true)
  for r in await recorder.all {
    #expect(r.url!.host == "openapi.tuyaeu.com" && r.url!.scheme == "https")
    #expect(r.value(forHTTPHeaderField: "client_id") == keys.accessId && r.value(forHTTPHeaderField: "sign_method") == "HMAC-SHA256")
    #expect(r.httpShouldHandleCookies == false && r.value(forHTTPHeaderField: "Cookie") == nil)
    #expect(r.value(forHTTPHeaderField: "access_token") != nil || r.url!.path == "/v1.0/token")
  }
  #expect(c.fake.commands == [.object(["commands": .array([.object(["code": .string("switch_2"), "value": .bool(true)])])])])
}

actor Recorder {
  private(set) var all: [URLRequest] = []
  func add(_ r: URLRequest) { all.append(r) }
}

@MainActor @Test("A switch sends one command, then reads the outlet back every 600 ms for up to 3 s; it answers what the plug reports")
func switches() async throws {
  let c = Cloud([strip(), { var d = strip("fake-slow"); d.lags = 3; return d }(), { var d = strip("fake-stuck"); d.ignores = true; return d }(),
                 { var d = strip("fake-mute"); d.unreadable = true; return d }()])
  let s = c.source()
  _ = try await s.list()
  #expect(try await s.set(provider: "tuya", device: "fake-strip-1", outlet: "switch_2", on: true) == Switched(on: true, confirmed: true))
  #expect(c.reads == 1 && c.posts == 1)
  // Set, not toggled: the same request again leaves it on.
  #expect(try await s.set(provider: "tuya", device: "fake-strip-1", outlet: "switch_2", on: true) == Switched(on: true, confirmed: true))
  #expect(c.fake.device("fake-strip-1")?.status[1].value == .bool(true))
  // A plug that reports the new state on the third read: read back until it does.
  let r0 = c.reads
  #expect(try await s.set(provider: "tuya", device: "fake-slow", outlet: "switch_2", on: true) == Switched(on: true, confirmed: true))
  #expect(c.reads - r0 == 3)
  // One that never does: 5 reads, 600 ms apart, then says so; the command isn't sent again.
  let (r1, p1) = (c.reads, c.posts)
  #expect(try await s.set(provider: "tuya", device: "fake-stuck", outlet: "switch_2", on: true) == Switched(on: false, confirmed: false))
  #expect(c.reads - r1 == 5 && c.posts - p1 == 1)
  // One whose state can't be read back: unknown, unconfirmed.
  #expect(try await s.set(provider: "tuya", device: "fake-mute", outlet: "switch_2", on: true) == Switched(on: nil, confirmed: false))
  let waits = await c.waits.all
  #expect(Set(waits) == [.milliseconds(600)] && waits.count == 1 + 1 + 3 + 5 + 5)
}

@MainActor @Test("Refused without a command: a plug the last list didn't have, an outlet it doesn't have, one listed offline")
func refusedBeforeSending() async throws {
  let c = Cloud([strip(), { var d = strip("fake-offline"); d.online = false; return d }()])
  let s = c.source()
  await #expect(throws: PlugError.noSuchPlug) { try await s.set(provider: "tuya", device: "fake-strip-1", outlet: "switch_1", on: true) }
  _ = try await s.list()
  await #expect(throws: PlugError.noSuchPlug) { try await s.set(provider: "tuya", device: "fake-not-mine", outlet: "switch_1", on: true) }
  await #expect(throws: PlugError.noSuchPlug) { try await s.set(provider: "tuya", device: "fake-strip-1", outlet: "switch_led", on: false) }
  await #expect(throws: PlugError.noSuchPlug) { try await s.set(provider: "ewelink", device: "fake-strip-1", outlet: "switch_1", on: true) }
  await #expect(throws: PlugError.plugOffline) { try await s.set(provider: "tuya", device: "fake-offline", outlet: "switch_1", on: true) }
  #expect(c.posts == 0)
}

@MainActor @Test("Tuya refusing a command: its error, one command sent, never again; gone offline since the list: offline")
func refusedCommands() async throws {
  let c = Cloud([{ var d = strip(); d.refuses = 2008; return d }(), { var d = strip("fake-drops"); d.dropsOff = true; return d }()])
  let s = c.source()
  _ = try await s.list()
  await #expect(throws: PlugError.maker(2008)) { try await s.set(provider: "tuya", device: "fake-strip-1", outlet: "switch_1", on: false) }
  #expect(c.posts == 1 && c.reads == 0)
  await #expect(throws: PlugError.plugOffline) { try await s.set(provider: "tuya", device: "fake-drops", outlet: "switch_1", on: false) }
  #expect(c.posts == 2)
}

@MainActor @Test("What goes wrong said plainly: wrong keys, an expired trial, no plan, calls used up, the phone's clock, no network, not Tuya's answer")
func problems() async throws {
  let c = Cloud()
  await #expect(throws: PlugError.badKeys) { try await c.source(TuyaKeys(accessId: keys.accessId, accessSecret: "wrong", dataCenter: .westernAmerica)).list() }
  await #expect(throws: PlugError.badKeys) { try await c.source(TuyaKeys(accessId: "wrong", accessSecret: keys.accessSecret, dataCenter: .westernAmerica)).list() }
  for (code, e) in [(28841002, PlugError.expired), (28841004, .quota), (28841101, .notSubscribed), (1013, .clock), (1111, .busy), (1106, .maker(1106))] {
    c.fake.failing = code
    await #expect(throws: e) { try await c.source().list() }
  }
  c.fake.failing = nil
  c.fake.down = true
  await #expect(throws: PlugError.badReply) { try await c.source().list() }
  c.fake.offline = true
  await #expect(throws: PlugError.offline) { try await c.source().list() }
}

@Test("Tuya's error codes as the app tells them apart (https://developer.tuya.com/en/docs/iot/error-code)")
func errorCodes() {
  let expected: [Int: PlugError] = [
    1001: .badKeys, 1004: .badKeys, 1005: .badKeys, 1013: .clock,
    28841001: .notSubscribed, 28841002: .expired, 28841003: .expired, 28841004: .quota,
    28841101: .notSubscribed, 28841102: .expired, 28841103: .expired, 28841104: .quota, 28841105: .notSubscribed, 28841106: .notSubscribed,
    1110: .busy, 1111: .busy, 1112: .busy, 1113: .busy, 2001: .plugOffline, 2010: .noSuchPlug, 2008: .maker(2008), 1010: .maker(1010),
  ]
  for (code, e) in expected { #expect(TuyaPlugs.error(code) == e, "\(code)") }
  // A refusal that came before anything reached a plug is known not to have switched it.
  let before: [PlugError] = [.badKeys, .expired, .notSubscribed, .quota, .busy, .clock, .plugOffline, .noSuchPlug]
  let maybe: [PlugError] = [.offline, .maker(2008), .badReply]
  #expect(before.filter { !$0.nothingSent } == [] && maybe.filter { $0.nothingSent } == [])
}

@MainActor @Test("Another project's keys are another owner")
func owners() {
  let c = Cloud()
  #expect(c.source().owner == c.source().owner)
  #expect(c.source().owner != c.source(TuyaKeys(accessId: keys.accessId, accessSecret: keys.accessSecret, dataCenter: .india)).owner)
  #expect(!c.source().owner.contains(keys.accessId) && !c.source().owner.contains(keys.accessSecret))
}
