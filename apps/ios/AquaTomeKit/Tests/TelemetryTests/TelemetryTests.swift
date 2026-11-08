import Foundation
import os
import Testing
@testable import Telemetry

// The app's anonymous telemetry: what it sends (POST /api/v1/app/events and /api/v1/app/diagnostics, as
// protocols/app-telemetry.openapi.json describes them, ContractTests; only the privacy policy's fields), when (batches,
// the cap, waiting after a failure), and the site's and the reader's switches.

private let about = About(app: "1.0 (114)", os: "26.5", device: "iPhone17,3", lang: "vi")
private let site = URL(string: "https://aquatome.com")!

/// A clock the test moves by hand.
private final class Clock: Sendable {
  private let t = OSAllocatedUnfairLock(initialState: 1000.0)
  var now: Double { t.withLock { $0 } }
  func pass(_ s: Double) { t.withLock { $0 += s } }
}

private func telemetry(_ fake: FakeCollector, file: URL? = nil, clock: Clock = Clock(), site on: Bool? = true, reader: Bool = true,
                       ours: Bool = false, install: Install? = nil) async -> Telemetry {
  let t = Telemetry(about: about, readerAllows: reader, file: file, site: site, send: { try await fake.send($0) },
                    userAgent: { ours ? "AquaTome-iOS AquaTomeCheck/1" : nil }, install: install, now: { clock.now })
  if let on { await t.siteAllows(on)?.value }
  return t
}

private func json(_ d: Data) -> NSDictionary { (try? JSONSerialization.jsonObject(with: d)) as? NSDictionary ?? [:] }
private func events(_ r: FakeCollector.Received) -> [NSDictionary] { json(r.body)["events"] as? [NSDictionary] ?? [] }
private func tempFile() -> URL { FileManager.default.temporaryDirectory.appending(path: "telemetry-\(UUID().uuidString)/queue.json") }

/// One of each event the app sends, as its hooks record them.
private let everyKind: [Event] = [.view(path: "/vi/ca/ca-neon/")] + Screen.allCases.map { Event.view($0) } + [
  .scroll(path: "/vi/ca/ca-neon/", depth: 50), .time(path: "/vi/ca/ca-neon/", seconds: 30),
  .aff(path: "/vi/ca/ca-neon/", link: URL(string: "https://aquatome.com/go/shopee/?k=ca+neon&c=fish")!)!,
] + Action.allCases.flatMap { [Event.action($0, ok: true), Event.action($0, ok: false, kind: .timeout)] }

@Test("A batch as the contract has it: the app, iOS, the phone's model, the language, the session, and each event's fields")
func encodesABatch() async throws {
  var b = Batch(about, session: "6f1c9a52-6d0e-4a8e-9a43-0f5a1d2c3b4e", events: [
    .view(path: "/vi/ca/ca-neon/"), .view(.tanks), .scroll(path: "/vi/ca/ca-neon/", depth: 50), .time(path: "/vi/ca/ca-neon/", seconds: 30),
    .aff(path: "/vi/ca/ca-neon/", link: URL(string: "https://aquatome.com/go/shopee/?k=ca%20neon&c=fish")!)!,
    .action(.lightConnect, ok: true), .action(.plugSwitch, ok: false, kind: .plugOffline),
  ])
  for i in b.events.indices { b.events[i].at = 1000 * i }
  let expected = """
  {"app":"1.0 (114)","os":"26.5","device":"iPhone17,3","lang":"vi","session":"6f1c9a52-6d0e-4a8e-9a43-0f5a1d2c3b4e","events":[
    {"t":"view","at":0,"path":"/vi/ca/ca-neon/"},
    {"t":"view","at":1000,"screen":"tanks"},
    {"t":"scroll","at":2000,"path":"/vi/ca/ca-neon/","depth":50},
    {"t":"time","at":3000,"path":"/vi/ca/ca-neon/","seconds":30},
    {"t":"aff","at":4000,"path":"/vi/ca/ca-neon/","shop":"shopee","href":"/go/shopee/?k=ca%20neon&c=fish"},
    {"t":"action","at":5000,"name":"light.connect","ok":true},
    {"t":"action","at":6000,"name":"plug.switch","ok":false,"kind":"plug-offline"}
  ]}
  """
  #expect(json(Wire.body(b)) == json(Data(expected.utf8)))

  let d = Diagnostic(kind: .metric, about: about, payload: #"{"appVersion":"1.0","cpuMetrics":{"cumulativeCPUTime":"12 sec"}}"#)
  let report = #"{"kind":"metric","app":"1.0 (114)","os":"26.5","device":"iPhone17,3","payload":{"appVersion":"1.0","cpuMetrics":{"cumulativeCPUTime":"12 sec"}}}"#
  #expect(json(Wire.body(d)) == json(Data(report.utf8)))
}

@Test("Field audit: every event, batch and report carries only the privacy policy's fields, and a code is never free text")
func carriesOnlyThePolicysFields() async throws {
  let b = Batch(about, session: "s", events: everyKind)
  let body = json(Wire.body(b))
  #expect(Set(body.allKeys as! [String]).isSubset(of: Policy.batchFields))
  #expect((body["events"] as! [NSDictionary]).count == everyKind.count)
  for e in body["events"] as! [NSDictionary] {
    let keys = Set(e.allKeys as! [String])
    #expect(keys.isSubset(of: Policy.eventFields), "\(keys.subtracting(Policy.eventFields)) in \(e)")
  }
  let report = json(Wire.body(Diagnostic(kind: .diagnostic, about: about, payload: "{}")))
  #expect(Set(report.allKeys as! [String]).isSubset(of: Policy.diagnosticFields))
  #expect(report["lang"] == nil)

  // A code is from a fixed list (Event.Kind), and a refusal's is one of the site's: any other refusal, such as a message
  // or a light's name in it, is sent as "other".
  #expect(Event.action(.plugSwitch, ok: false, kind: .noSuchPlug).kind == "no-such-plug")
  #expect(Event.action(.postComment, refused: "rate").kind == "refused:rate")
  #expect(Event.action(.postComment, refused: "DYSL30A1B2C3 không trả lời").kind == "refused:other")
  #expect(Event.action(.postPhoto, refused: "name must be 1–40 characters").kind == "refused:other")
  #expect(Event.action(.postPhoto, refused: "rate_limited").kind == "refused:other")
  // A path with a query (a search's words) isn't sent.
  let t = await telemetry(FakeCollector())
  t.record(.view(path: "/vi/tim/?q=ca+dia"))
  t.record(.view(path: "/vi/ca/ca-neon/"))
  #expect(t.recorded.map(\.path) == ["/vi/ca/ca-neon/"])
  // Only the site's shop links are shop taps.
  #expect(Event.aff(path: "/vi/ca/ca-neon/", link: URL(string: "https://aquatome.com/vi/ca/ca-dia/")!) == nil)
}

@Test("Events go in batches of at most 100, in order, one session; the request is a JSON POST with no cookie or sign-in")
func batches() async throws {
  let fake = FakeCollector()
  let t = await telemetry(fake, ours: true)
  for i in 0..<250 { t.record(.view(path: "/vi/ca/p\(i)/")) }
  await t.flush()
  #expect(fake.received.map { events($0).count } == [100, 100, 50])
  #expect(fake.received.flatMap(events).map { $0["path"] as! String } == (0..<250).map { "/vi/ca/p\($0)/" })
  let ats = fake.received.flatMap(events).map { $0["at"] as! Int }
  #expect(ats == ats.sorted() && ats[0] >= 0)
  #expect(Set(fake.received.map { json($0.body)["session"] as! String }) == [t.session])
  for r in fake.received {
    #expect(r.path == "/api/v1/app/events" && r.cookie == nil && r.authorization == nil)
    #expect(r.userAgent == "AquaTome-iOS AquaTomeCheck/1")
  }
  // Nothing new: nothing sent.
  await t.flush()
  #expect(fake.received.count == 3)
}

@Test("Past 500 events waiting, the oldest go first, whether still recorded or already queued")
func capsTheQueue() async throws {
  let fake = FakeCollector()
  fake.answer(503)
  let clock = Clock()
  let t = await telemetry(fake, clock: clock)
  for i in 0..<600 { t.record(.view(path: "/vi/ca/p\(i)/")) }
  #expect(t.recorded.count == 500 && t.recorded.first?.path == "/vi/ca/p100/")
  await t.flush()
  for i in 600..<900 { t.record(.view(path: "/vi/ca/p\(i)/")) }
  await t.flush()
  let queued = await t.queued.events
  #expect(queued.count == 500)
  #expect(queued.first?.path == "/vi/ca/p400/" && queued.last?.path == "/vi/ca/p899/")
  clock.pass(3600)
  fake.answer(nil)
  await t.flush()
  #expect(await t.queued.events.isEmpty)
}

@Test("After a failure, nothing is sent until a wait that doubles each time (30 s, 60 s…, at most 30 minutes); a refused batch is dropped, not retried; too many this hour (429) is dropped and waited out")
func backsOff() async throws {
  #expect((1...8).map { Outbox.wait(afterFailures: $0) } == [30, 60, 120, 240, 480, 960, 1800, 1800])
  let fake = FakeCollector()
  fake.answer(503)
  let clock = Clock()
  let t = await telemetry(fake, clock: clock)
  t.record(.view(.tanks))
  await t.flush()
  #expect(fake.received.count == 1)
  clock.pass(29)
  await t.flush()
  #expect(fake.received.count == 1, "tried again before 30 s")
  clock.pass(1)
  await t.flush()
  #expect(fake.received.count == 2)
  clock.pass(59)
  await t.flush()
  #expect(fake.received.count == 2, "the wait didn't double")
  clock.pass(1)
  fake.answer(nil)
  await t.flush()
  var queued = await t.queued.events
  #expect(fake.received.count == 3 && queued.isEmpty)

  // Refused as it is: dropped, and the next goes at once.
  fake.answer(400)
  t.record(.view(.lights))
  t.record(.view(.handbook))
  await t.flush()
  queued = await t.queued.events
  #expect(fake.received.count == 4 && queued.isEmpty)
  fake.answer(nil)
  t.record(.view(.lights))
  await t.flush()
  #expect(fake.received.count == 5)

  // Too many this hour: that batch dropped, as the contract asks, and the next waits.
  fake.answer(429)
  t.record(.view(.lights))
  await t.flush()
  queued = await t.queued.events
  #expect(fake.received.count == 6 && queued.isEmpty)
  fake.answer(nil)
  t.record(.view(.tanks))
  await t.flush()
  #expect(fake.received.count == 6, "sent again before the wait after a 429")
  clock.pass(30)
  await t.flush()
  #expect(fake.received.count == 7)
}

@Test("A batch of 100 of the largest events the contract takes is under 64 KiB, so 100 events a batch is the only limit needed")
func aFullBatchIsUnder64KiB() async throws {
  let fake = FakeCollector()
  let t = await telemetry(fake)
  let link = URL(string: "https://aquatome.com/go/" + String(repeating: "s", count: 24) + "/?k=" + String(repeating: "x", count: 268))!
  let path = "/vi/ca/" + String(repeating: "c", count: 192) + "/"
  let largest = Event.aff(path: path, link: link)!
  #expect(largest.href?.count == 300 && largest.path?.count == 200 && largest.fits)
  for _ in 0..<Wire.batchSize { t.record(largest) }
  await t.flush()
  let sent = try #require(fake.received.first)
  #expect(fake.received.count == 1 && events(sent).count == 100)
  #expect(sent.body.count <= Wire.maxBatch, "\(sent.body.count) bytes")
}

@Test("The reader's switch off drops what waits, on the phone and in the file, and records nothing more; on again, it records")
func readersSwitchClearsTheQueue() async throws {
  let fake = FakeCollector()
  fake.answer(503)
  let file = tempFile()
  let clock = Clock()
  let t = await telemetry(fake, file: file, clock: clock)
  t.record(.view(.tanks))
  await t.flush()
  t.record(.view(.lights))
  #expect(FileManager.default.fileExists(atPath: file.path), "not kept in the file")
  let queued = await t.queued.events
  #expect(queued.count == 1 && t.recorded.count == 1)

  await t.readerAllows(false)?.value
  let after = await t.queued.events
  #expect(after.isEmpty && t.recorded.isEmpty)
  #expect(!FileManager.default.fileExists(atPath: file.path), "the file is still there")
  t.record(.view(.handbook))
  t.diagnostic(.metric, json: metricSample)
  fake.answer(nil)
  await t.flush()
  #expect(t.recorded.isEmpty && fake.received.count == 1)

  #expect(t.readerAllows(true) == nil)
  t.record(.view(.handbook))
  clock.pass(30) // the first failure's wait
  await t.flush()
  #expect(fake.received.count == 2 && events(fake.received[1]).map { $0["screen"] as? String } == ["handbook"])
}

@Test("Until the site's flag is on, nothing is sent or written; the flag absent or off drops what waits")
func waitsForTheSite() async throws {
  let fake = FakeCollector()
  let file = tempFile()
  // Not known yet: kept on the phone only.
  var t = await telemetry(fake, file: file, site: nil)
  t.record(.view(.handbook))
  await t.flush()
  #expect(fake.received.isEmpty && !FileManager.default.fileExists(atPath: file.path))
  #expect(t.recorded.count == 1)
  // Known now, and on.
  t.siteAllows(true)
  await t.flush()
  #expect(fake.received.count == 1)

  // Off: what waits goes, and nothing more is kept.
  t = await telemetry(fake, file: file, site: nil)
  t.record(.view(.handbook))
  t.diagnostic(.diagnostic, json: diagnosticSample())
  await t.siteAllows(false)?.value
  #expect(t.recorded.isEmpty)
  t.record(.view(.lights))
  await t.flush()
  #expect(t.recorded.isEmpty && fake.received.count == 1)
  // Turned off with a queue in the file from before: it goes.
  fake.answer(503)
  let before = await telemetry(fake, file: file)
  before.record(.view(.tanks))
  await before.flush()
  #expect(FileManager.default.fileExists(atPath: file.path))
  let later = await telemetry(fake, file: file, site: nil)
  await later.siteAllows(false)?.value
  #expect(!FileManager.default.fileExists(atPath: file.path))
}

@Test("A batch left in the file is sent at the next launch with its own session, before the new one's")
func outlastsALaunch() async throws {
  let fake = FakeCollector()
  fake.answer(503)
  let file = tempFile()
  let first = await telemetry(fake, file: file)
  first.record(.view(.tanks))
  await first.flush()
  fake.answer(nil)
  let second = await telemetry(fake, file: file)
  #expect(first.session != second.session)
  second.record(.view(.lights))
  await second.flush()
  let sent = fake.received.dropFirst().map { (json($0.body)["session"] as! String, events($0).map { $0["screen"] as! String }) }
  #expect(sent.map(\.0) == [first.session, second.session] && sent.map(\.1) == [["tanks"], ["lights"]])
  #expect(!FileManager.default.fileExists(atPath: file.path), "sent, and still in the file")
}

@Test("iOS's reports go through the same sending, to /api/v1/app/diagnostics, at most 8 waiting")
func sendsDiagnostics() async throws {
  let fake = FakeCollector()
  let t = await telemetry(fake)
  for i in 0..<10 { t.diagnostic(.diagnostic, json: diagnosticSample(hang: "\(i) sec")) }
  t.record(.view(.tanks))
  await t.flush()
  #expect(fake.received.map(\.path) == ["/api/v1/app/events"] + Array(repeating: "/api/v1/app/diagnostics", count: 8))
  let first = json(fake.received[1].body)
  let hang = ((first["payload"] as? NSDictionary)?["hangDiagnostics"] as? [NSDictionary])?.first?["diagnosticMetaData"] as? NSDictionary
  #expect(first["kind"] as? String == "diagnostic" && hang?["hangDuration"] as? String == "2 sec")
  #expect(first["device"] as? String == "iPhone17,3")

  // One larger than the Worker takes (1 MiB with its wrapper) isn't kept.
  let big = Data(("{\"hangDiagnostics\":[{\"version\":\"" + String(repeating: "a", count: Wire.maxReport) + "\"}]}").utf8)
  t.diagnostic(.diagnostic, json: big)
  t.record(.view(.tanks))
  await t.flush()
  #expect(fake.received.count == 10 && fake.received.last?.path == "/api/v1/app/events")
}

/// Holds the Telemetry a stand-in's callback turns off, and the switch's task.
private final class Turning: @unchecked Sendable {
  var t: Telemetry?
  var clearing: Task<Void, Never>?
}

@Test("A switch takes hold at once: turned on then off, nothing is sent; turned off while the queue is being sent, no request follows")
func aSwitchTakesHoldAtOnce() async throws {
  // On, then off at once (a quick tap and tap again), then a send: nothing goes.
  let fake = FakeCollector()
  let t = await telemetry(fake, reader: false)
  t.readerAllows(true)
  t.record(.view(.tanks))
  t.readerAllows(false)
  await t.flush()
  #expect(fake.received.isEmpty && t.recorded.isEmpty)
  // And it stays off: what comes next isn't recorded or sent either.
  t.record(.view(.lights))
  await t.flush()
  #expect(fake.received.isEmpty && t.recorded.isEmpty)

  // Three batches waiting; either switch turned off as the first is received: the other two aren't sent, and go.
  for off in ["reader", "site"] {
    let turning = Turning()
    let fake = FakeCollector(told: { _ in
      guard turning.clearing == nil else { return }
      turning.clearing = off == "reader" ? turning.t?.readerAllows(false) : turning.t?.siteAllows(false)
    })
    let file = tempFile()
    let t = await telemetry(fake, file: file)
    turning.t = t
    for _ in 0..<(2 * Wire.batchSize + 1) { t.record(.view(.tanks)) }
    await t.flush()
    #expect(fake.received.count == 1, "\(off): \(fake.received.count) requests")
    await turning.clearing?.value
    let left = await t.queued.events
    #expect(left.isEmpty && !FileManager.default.fileExists(atPath: file.path), "\(off): still queued")
  }
}

/// Both switches as the queue asks them, set by hand.
private final class Switches: Sendable {
  private let on = OSAllocatedUnfairLock(initialState: true)
  var allowed: Bool { on.withLock { $0 } }
  func set(_ v: Bool) { on.withLock { $0 = v } }
}

private func pages(_ n: Int) -> [Event] { (0..<n).map { Event.view(path: "/vi/ca/p\($0)/") } }

@Test("The queue asks the switches before each request: turned off as the first is received, no other request follows")
func asksTheSwitchesBeforeEachRequest() async throws {
  let switches = Switches()
  let fake = FakeCollector(told: { _ in switches.set(false) })
  let file = tempFile()
  let outbox = Outbox(file: file, site: site, send: { try await fake.send($0) }, userAgent: { nil }, now: { 0 }, allowed: { switches.allowed })
  await outbox.add(pages(2 * Wire.batchSize + 1), about: about, session: "s")
  await outbox.add([Diagnostic(kind: .metric, about: about, payload: "{}")])
  await outbox.flush()
  #expect(fake.received.count == 1, "\(fake.received.count) requests")
  // Not sent, and not counted as a failure: the switch's own task empties the queue.
  let left = await outbox.state
  #expect(left.batches.count == 2 && left.diagnostics.count == 1)
}

@Test("What reaches the queue after a switch went off (taken just before) isn't kept: nothing in the file, nothing sent when it's on again")
func dropsWhatReachesTheQueueAfterASwitchWentOff() async throws {
  let switches = Switches()
  let fake = FakeCollector()
  let file = tempFile()
  let outbox = Outbox(file: file, site: site, send: { try await fake.send($0) }, userAgent: { nil }, now: { 0 }, allowed: { switches.allowed })
  switches.set(false)
  await outbox.add(pages(3), about: about, session: "s")
  await outbox.add([Diagnostic(kind: .metric, about: about, payload: "{}")])
  await outbox.flush()
  #expect(!FileManager.default.fileExists(atPath: file.path), "kept in the file")
  switches.set(true)
  await outbox.flush()
  #expect(fake.received.isEmpty, "sent when on again: \(fake.received.map(\.path))")
}

/// UserDefaults of the test's own.
private func defaults() -> UserDefaults { UserDefaults(suiteName: "telemetry-\(UUID().uuidString)")! }
private func installOf(_ r: FakeCollector.Received) -> String? { json(r.body)["install"] as? String }
/// A lowercase UUID v4.
private func isUUIDv4(_ s: String) -> Bool { s.wholeMatch(of: #/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/#) != nil }

@Test("The install id: a lowercase UUID v4 made at the first batch, the same in every batch after and at a later launch, made anew 13 months on; never in a report")
func anInstallIdLastsThirteenMonths() async throws {
  let fake = FakeCollector()
  let d = defaults()
  let day = OSAllocatedUnfairLock(initialState: Date(timeIntervalSince1970: 1_800_000_000))
  let install = Install(defaults: d, today: { day.withLock { $0 } })
  var t = await telemetry(fake, install: install)
  t.diagnostic(.metric, json: metricSample)
  await t.flush()
  #expect(d.string(forKey: Install.idKey) == nil, "made with nothing to send")
  t.record(.view(.tanks))
  t.diagnostic(.metric, json: metricSample)
  await t.flush()
  t.record(.view(.lights))
  await t.flush()
  #expect(fake.received.map(\.path) == ["/api/v1/app/diagnostics", "/api/v1/app/events", "/api/v1/app/diagnostics", "/api/v1/app/events"])
  #expect(installOf(fake.received[0]) == nil && installOf(fake.received[2]) == nil, "an install id in a report")
  let first = try #require(installOf(fake.received[1]))
  #expect(isUUIDv4(first), "\(first)")
  #expect(installOf(fake.received[3]) == first)

  // A later launch, 12 months on: the same.
  day.withLock { $0 = Calendar(identifier: .gregorian).date(byAdding: .month, value: 12, to: $0)! }
  t = await telemetry(fake, install: install)
  t.record(.view(.tanks))
  await t.flush()
  #expect(installOf(fake.received[4]) == first)
  // 13 months on: a new one.
  day.withLock { $0 = Calendar(identifier: .gregorian).date(byAdding: .month, value: 1, to: $0)! }
  t.record(.view(.tanks))
  await t.flush()
  let renewed = try #require(installOf(fake.received[5]))
  #expect(renewed != first && isUUIDv4(renewed))
}

@Test("The reader's switch off deletes the install id and none is made while it's off; on again, a new one; a launch with it off deletes one left")
func theReadersSwitchOffDeletesTheInstallId() async throws {
  let fake = FakeCollector()
  let d = defaults()
  let t = await telemetry(fake, install: Install(defaults: d))
  t.record(.view(.tanks))
  await t.flush()
  let first = try #require(installOf(fake.received[0]))

  await t.readerAllows(false)?.value
  #expect(d.string(forKey: Install.idKey) == nil && d.object(forKey: Install.madeKey) == nil)
  t.record(.view(.tanks))
  await t.flush()
  #expect(d.string(forKey: Install.idKey) == nil && fake.received.count == 1)

  t.readerAllows(true)
  t.record(.view(.lights))
  await t.flush()
  let second = try #require(installOf(fake.received[1]))
  #expect(second != first)

  _ = await telemetry(fake, reader: false, install: Install(defaults: d))
  #expect(d.string(forKey: Install.idKey) == nil)
}
