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
                       ours: Bool = false) async -> Telemetry {
  let t = Telemetry(about: about, readerAllows: reader, file: file, site: site, send: { try await fake.send($0) },
                    userAgent: { ours ? "AquaTome-iOS AquaTomeCheck/1" : nil }, now: { clock.now })
  if let on { await t.siteAllows(on) }
  return t
}

private func json(_ d: Data) -> NSDictionary { (try? JSONSerialization.jsonObject(with: d)) as? NSDictionary ?? [:] }
private func events(_ r: FakeCollector.Received) -> [NSDictionary] { json(r.body)["events"] as? [NSDictionary] ?? [] }
private func tempFile() -> URL { FileManager.default.temporaryDirectory.appending(path: "telemetry-\(UUID().uuidString)/queue.json") }

/// One of each event the app sends, as its hooks record them.
private let everyKind: [Event] = [.view(path: "/vi/ca/ca-neon/")] + Screen.allCases.map { Event.view($0) } + [
  .scroll(path: "/vi/ca/ca-neon/", depth: 50), .time(path: "/vi/ca/ca-neon/", seconds: 30),
  .aff(path: "/vi/ca/ca-neon/", link: URL(string: "https://aquatome.com/go/shopee/?k=ca+neon&c=fish")!)!,
] + Action.allCases.flatMap { [Event.action($0, ok: true), Event.action($0, ok: false, kind: "timeout")] }

@Test("A batch as the contract has it: the app, iOS, the phone's model, the language, the session, and each event's fields")
func encodesABatch() async throws {
  var b = Batch(about, session: "6f1c9a52-6d0e-4a8e-9a43-0f5a1d2c3b4e", events: [
    .view(path: "/vi/ca/ca-neon/"), .view(.tanks), .scroll(path: "/vi/ca/ca-neon/", depth: 50), .time(path: "/vi/ca/ca-neon/", seconds: 30),
    .aff(path: "/vi/ca/ca-neon/", link: URL(string: "https://aquatome.com/go/shopee/?k=ca%20neon&c=fish")!)!,
    .action(.lightConnect, ok: true), .action(.plugSwitch, ok: false, kind: "plugOffline"),
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
  #expect(Set(body.allKeys as! [String]).isSubset(of: Wire.batchFields))
  #expect((body["events"] as! [NSDictionary]).count == everyKind.count)
  for e in body["events"] as! [NSDictionary] {
    let keys = Set(e.allKeys as! [String])
    #expect(keys.isSubset(of: Wire.eventFields), "\(keys.subtracting(Wire.eventFields)) in \(e)")
  }
  let report = json(Wire.body(Diagnostic(kind: .diagnostic, about: about, payload: "{}")))
  #expect(Set(report.allKeys as! [String]).isSubset(of: Wire.diagnosticFields))
  #expect(report["lang"] == nil)

  // An error's message, or a light's name in it, is not a code: sent as "other".
  #expect(Event.action(.lightConnect, ok: false, kind: "DYSL30A1B2C3 không trả lời").kind == "other")
  #expect(Event.action(.postComment, refused: "rate_limited").kind == "refused:rate_limited")
  #expect(Event.action(.lightWrite, ok: false, kind: String(repeating: "a", count: 41)).kind == "other")
  // An error by its case alone, in lowercase: not the text or the name it carries.
  enum LinkError: Error { case timeout, notFound, failed(String) }
  #expect(Event.action(.lightConnect, error: LinkError.failed("DYSL30A1B2C3 không trả lời")).kind == "failed")
  #expect(Event.action(.lightConnect, error: LinkError.notFound).kind == "not-found")
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
  for i in 0..<250 { t.record(.view(path: "/vi/p\(i)/")) }
  await t.flush()
  #expect(fake.received.map { events($0).count } == [100, 100, 50])
  #expect(fake.received.flatMap(events).map { $0["path"] as! String } == (0..<250).map { "/vi/p\($0)/" })
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
  for i in 0..<600 { t.record(.view(path: "/vi/p\(i)/")) }
  #expect(t.recorded.count == 500 && t.recorded.first?.path == "/vi/p100/")
  await t.flush()
  for i in 600..<900 { t.record(.view(path: "/vi/p\(i)/")) }
  await t.flush()
  let queued = await t.queued.events
  #expect(queued.count == 500)
  #expect(queued.first?.path == "/vi/p400/" && queued.last?.path == "/vi/p899/")
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
  let path = "/vi/" + String(repeating: "c", count: 195) + "/"
  let largest = Event.aff(path: path, link: link)!
  #expect(largest.href?.count == 300 && largest.path?.count == 200 && largest.fits)
  for _ in 0..<Wire.batchSize { t.record(largest) }
  await t.flush()
  #expect(fake.received.count == 1 && events(fake.received[0]).count == 100)
  #expect(fake.received[0].body.count <= Wire.maxBatch, "\(fake.received[0].body.count) bytes")
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

  await t.readerAllows(false)
  let after = await t.queued.events
  #expect(after.isEmpty && t.recorded.isEmpty)
  #expect(!FileManager.default.fileExists(atPath: file.path), "the file is still there")
  t.record(.view(.handbook))
  t.diagnostic(.metric, json: Data("{}".utf8))
  fake.answer(nil)
  await t.flush()
  #expect(t.recorded.isEmpty && fake.received.count == 1)

  await t.readerAllows(true)
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
  await t.siteAllows(true)
  await t.flush()
  #expect(fake.received.count == 1)

  // Off: what waits goes, and nothing more is kept.
  t = await telemetry(fake, file: file, site: nil)
  t.record(.view(.handbook))
  t.diagnostic(.diagnostic, json: Data("{}".utf8))
  await t.siteAllows(false)
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
  await later.siteAllows(false)
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
  for i in 0..<10 { t.diagnostic(.diagnostic, json: Data(#"{"n":\#(i)}"#.utf8)) }
  t.record(.view(.tanks))
  await t.flush()
  #expect(fake.received.map(\.path) == ["/api/v1/app/events"] + Array(repeating: "/api/v1/app/diagnostics", count: 8))
  let first = json(fake.received[1].body)
  #expect(first["kind"] as? String == "diagnostic" && (first["payload"] as? NSDictionary)?["n"] as? Int == 2)
  #expect(first["device"] as? String == "iPhone17,3")

  // One larger than the Worker takes (1 MiB with its wrapper) isn't kept.
  let big = Data(("{\"x\":\"" + String(repeating: "a", count: Wire.maxReport) + "\"}").utf8)
  t.diagnostic(.diagnostic, json: big)
  t.record(.view(.tanks))
  await t.flush()
  #expect(fake.received.count == 10 && fake.received.last?.path == "/api/v1/app/events")
}
