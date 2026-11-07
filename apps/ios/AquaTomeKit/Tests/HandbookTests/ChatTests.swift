import Foundation
import Testing
@testable import Handbook

// protocols/chat.openapi.json, the contract the site's Worker answers the chat by, and its recorded answers
// (chat-stream-*.sse, chat-rate.json), which the site's tests check against the contract too.
private let protocols: URL = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return url.appendingPathComponent("protocols")
}()
nonisolated(unsafe) private let contract = try! JSONSerialization.jsonObject(with: Data(contentsOf: protocols.appendingPathComponent("chat.openapi.json"))) as! [String: Any]
private func schema(_ name: String) -> [String: Any] {
  ((contract["components"] as! [String: Any])["schemas"] as! [String: Any])[name] as! [String: Any]
}
private func recorded(_ name: String) throws -> Data { try Data(contentsOf: protocols.appendingPathComponent(name)) }
private let site = URL(string: "https://aquatome.com")!

/// Bytes as a stream would bring them.
private func stream(_ s: String) -> AsyncThrowingStream<UInt8, any Error> {
  AsyncThrowingStream { c in Data(s.utf8).forEach { c.yield($0) }; c.finish() }
}
private func events(_ s: String) async throws -> [ServerEvent] {
  var out: [ServerEvent] = []
  try await ServerEvents.read(stream(s)) { out.append($0); return true }
  return out
}

// MARK: Server-sent events

@Test func anEventsNameAndDataLinesAreReadAsTheStandardReadsThem() async throws {
  #expect(try await events("event: text\ndata: {\"a\":1}\n\n") == [ServerEvent(name: "text", data: "{\"a\":1}")])
  // Data lines joined by a line break; one space after the colon dropped, a second kept; no name is "message".
  #expect(try await events("data: one\ndata:  two\ndata\n\n") == [ServerEvent(name: "message", data: "one\n two\n")])
  // A comment (the Worker's ping), an id and a field the standard doesn't know: none an event.
  #expect(try await events(": ping\n\nid: 7\nretry: 10\nfoo: bar\n\n").isEmpty)
  // A byte order mark opening the stream.
  #expect(try await events("\u{FEFF}event: done\ndata: {}\n\n") == [ServerEvent(name: "done", data: "{}")])
}

@Test func linesEndInALineFeedACarriageReturnOrBoth() async throws {
  let want = [ServerEvent(name: "step", data: "1"), ServerEvent(name: "text", data: "2")]
  #expect(try await events("event: step\ndata: 1\n\nevent: text\ndata: 2\n\n") == want)
  #expect(try await events("event: step\r\ndata: 1\r\n\r\nevent: text\r\ndata: 2\r\n\r\n") == want)
  #expect(try await events("event: step\rdata: 1\r\revent: text\rdata: 2\r\r") == want)
}

@Test func anEventTheStreamEndsInTheMiddleOfIsntOne() async throws {
  // Its blank line never came: its data may be cut short.
  #expect(try await events("event: step\ndata: 1\n\nevent: done\ndata: {\"n\":") == [ServerEvent(name: "step", data: "1")])
}

@Test func readingStopsWhenToldTo() async throws {
  var seen = 0
  try await ServerEvents.read(stream("data: 1\n\ndata: 2\n\ndata: 3\n\n")) { _ in seen += 1; return seen < 2 }
  #expect(seen == 2)
}

/// The app's session, served the recorded stream by a stand-in for the network.
private final class Recorded: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var body = Data()
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let res = HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/event-stream"])!
    client?.urlProtocol(self, didReceive: res, cacheStoragePolicy: .notAllowed)
    // In pieces, as the network brings them: some cut in the middle of a line, or of a letter.
    var at = Self.body.startIndex
    while at < Self.body.endIndex {
      let end = Self.body.index(at, offsetBy: 37, limitedBy: Self.body.endIndex) ?? Self.body.endIndex
      client?.urlProtocol(self, didLoad: Self.body[at..<end])
      at = end
    }
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}

@Test func theAppsSessionGivesTheStreamsEventsAsTheRecordedStreamHasThem() async throws {
  let data = try recorded("chat-stream-species.sse")
  Recorded.body = data
  let c = URLSessionConfiguration.ephemeral
  c.protocolClasses = [Recorded.self]
  let (status, bytes) = try await ServerEvents.urlSession(URLSession(configuration: c))(URLRequest(url: site.appending(path: "api/chat")))
  #expect(status == 200)
  var got: [ServerEvent] = []
  try await ServerEvents.read(bytes) { got.append($0); return true }
  let want = try await ServerEvents.events(in: data)
  #expect(got == want)
  #expect(got.map(\.name) == ["step", "step", "step", "text", "text", "block", "block", "block", "done"])
}

// MARK: The recorded answers

/// A stream's chat events, each one the app reads.
private func chat(_ name: String) async throws -> [Chat.Event] {
  let raw = try await ServerEvents.events(in: recorded(name))
  let read = raw.compactMap(Chat.event)
  #expect(read.count == raw.count, "an event of \(name) the app doesn't read")
  return read
}

/// What a block is, to compare a streamed one with `done`'s.
private func key(_ b: Chat.Block) -> String {
  switch b {
  case .species(let c): "species \(c.page.id) \(c.page.path ?? "-")"
  case .compare(let cs): "compare " + cs.map(\.page.id).joined(separator: "+")
  case let .section(page, heading, blocks): "section \(page.path)#\(heading?.id ?? "-") " + blocks.map(\.t).joined(separator: ",")
  case .tool(let t): "tool \(t.tool) \(t.path)"
  }
}

@Test func theRecordedAnswerFromAFishIsReadWholeAndDoneHoldsWhatStreamed() async throws {
  let all = try await chat("chat-stream-species.sse")
  var steps: [Chat.Step] = [], text = "", blocks: [Chat.Block] = [], turn: Chat.Turn?
  for e in all {
    switch e {
    case .step(let s): steps.append(s)
    case .text(let t): text += t
    case .block(let b): blocks.append(b)
    case .done(let t): turn = t
    case .error: Issue.record("an error in an answer")
    }
  }
  let t = try #require(turn)
  #expect(t.text == text && t.steps == steps && t.blocks.map(key) == blocks.map(key))
  #expect(t.n == 1 && t.covered && t.conversation == UUID(uuidString: "6f1c2a52-8d3e-4b7a-9c41-2e5d7f80b913"))
  #expect(!t.suggestions.isEmpty && t.suggestions.count <= 3)
  #expect(steps.first == .read(Chat.PageRef(kind: "fish", title: "Cá neon xanh", path: "/vi/ca/ca-neon-xanh/")))
  #expect(steps.contains(.search("cá neon nuôi đàn")))
  // The neon's card with its figures as the index has them; its guide's section, whole, with no heading in it; the
  // tank-mates tool set to six neons.
  guard case .species(let card) = blocks[0] else { Issue.record("no card first"); return }
  #expect(card.page.id == "paracheirodon-innesi" && card.page.kind == "species" && card.page.path == "/vi/ca/ca-neon-xanh/")
  #expect(card.page.img?.host == "media.aquatome.com")
  let facts = try #require(card.facts)
  #expect(facts.tempC != nil && facts.ph != nil && facts.schoolMin != nil && card.plant == nil)
  guard case let .section(page, heading, body) = blocks[1] else { Issue.record("no section second"); return }
  #expect(page.kind == "guide" && heading != nil && !body.isEmpty && !body.contains { $0.t == "h" || $0.t == "web" })
  guard case .tool(let tool) = blocks[2] else { Issue.record("no tool third"); return }
  #expect(tool == Chat.Tool(tool: "tank-mates", name: "Nuôi chung", path: "/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:6"))
}

@Test func theRecordedAnswerTheHandbookDoesntCoverSaysSoWithItsNearestSection() async throws {
  let all = try await chat("chat-stream-uncovered.sse")
  guard case .done(let t) = try #require(all.last) else { Issue.record("no done last"); return }
  #expect(!t.covered && !t.text.isEmpty)
  #expect(t.blocks.contains { if case .section = $0 { true } else { false } })
}

@Test func theRecordedFailedAnswerEndsInItsError() async throws {
  let all = try await chat("chat-stream-failed.sse")
  #expect(all.count == 2)
  guard case .step(.search("cá neon")) = all[0], case .error("failed") = all[1] else { Issue.record("not a step then failed"); return }
}

@Test func whatTheAppDoesntKnowIsLeftOutNotTheTurn() {
  func block(_ json: String) -> Chat.Event? { Chat.event(ServerEvent(name: "block", data: json)) }
  // A newer event; a block of a newer `t`; data that isn't JSON.
  #expect(Chat.event(ServerEvent(name: "thinking", data: "{}")) == nil)
  #expect(block(#"{"t":"gallery","page":{}}"#) == nil)
  #expect(Chat.event(ServerEvent(name: "text", data: "not json")) == nil)
  // A comparison of one; a section with only a heading; a tool on another site.
  let linked = #"{"id":"a","kind":"species","name":"A"}"#
  #expect(block(#"{"t":"compare","items":[{"page":\#(linked)}]}"#) == nil)
  #expect(block(#"{"t":"section","page":{"kind":"guide","title":"G","url":"/vi/g/"},"blocks":[{"t":"h","text":"H"}]}"#) == nil)
  #expect(block(#"{"t":"tool","tool":"tank-mates","name":"N","url":"https://example.com/x/"}"#) == nil)
  // A figure it can't read costs that figure, not the card; a page on another site, its link.
  guard case .block(.species(let c))? = block(#"{"t":"species","page":{"id":"a","kind":"species","name":"A","url":"https://example.com/a/"},"facts":{"tempC":"warm","sizeCm":4}}"#)
  else { Issue.record("the card went"); return }
  #expect(c.facts?.tempC == nil && c.facts?.sizeCm == 4 && c.page.path == nil)
  // A plant's figures, on its own 1–3 scale.
  guard case .block(.species(let p))? = block(#"{"t":"species","page":{"id":"b","kind":"plant","name":"B"},"plant":{"difficulty":2,"light":"low"}}"#)
  else { Issue.record("the plant went"); return }
  #expect(p.plant?.difficulty == 2 && p.plant?.light == "low" && p.facts == nil)
  // A section's page block this app can't read is kept as one to see on the web.
  guard case .block(.section(_, nil, let blocks))? = block(#"{"t":"section","page":{"kind":"guide","title":"G","url":"/vi/g/"},"blocks":[{"t":"p","c":["Một."]},{"t":"hologram"}]}"#)
  else { Issue.record("the opening went"); return }
  #expect(blocks.map(\.t) == ["p", "web"])
}

@Test func aRefusedQuestionSaysWhy() throws {
  let rate = try JSONSerialization.jsonObject(with: recorded("chat-rate.json")) as! [String: Any]
  let body = try JSONSerialization.data(withJSONObject: rate["body"]!)
  #expect(Chat.refusal(body, status: rate["status"] as! Int) == .refused("rate", limit: 30))
  #expect(Chat.refusal(Data(#"{"error":"session"}"#.utf8), status: 401) == .signedOut)
  #expect(Chat.refusal(Data(#"{"error":"ended"}"#.utf8), status: 410) == .refused("ended", limit: nil))
  #expect(Chat.refusal(Data("<html>".utf8), status: 502) == .refused("failed", limit: nil))
}

@Test func theChatsStateIsReadAsGetGivesIt() {
  #expect(Chat.status(Data(#"{"on":true,"perAccount":20,"maxTurns":12,"maxChars":500}"#.utf8), status: 200)
          == Chat.Status(on: true, resting: false, perAccount: 20, maxTurns: 12, maxChars: 500))
  #expect(Chat.status(Data(#"{"on":false}"#.utf8), status: 200)?.on == false)
  #expect(Chat.status(Data(#"{"on":true}"#.utf8), status: 503) == nil)
  // Every name GET gives is one the contract has.
  let props = Set((schema("Status")["properties"] as! [String: Any]).keys)
  #expect(props == ["on", "resting", "perAccount", "maxTurns", "maxChars"])
}

// MARK: Requests

@Test func aQuestionIsAskedAsTheAccountForTheStreamWithItsKey() throws {
  let conv = UUID(), key = UUID()
  let r = Chat.ask("Nuôi chung với cá gì?", conversation: conv, lang: "vi", start: nil, key: key, site: site, token: "tok", version: "1.4", ownCopy: nil)
  #expect(r.httpMethod == "POST" && r.url?.absoluteString == "https://aquatome.com/api/chat")
  #expect(r.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
  #expect(r.value(forHTTPHeaderField: "Accept") == "text/event-stream")
  #expect(r.value(forHTTPHeaderField: "Content-Type") == "application/json")
  #expect(r.value(forHTTPHeaderField: "Idempotency-Key") == key.uuidString.lowercased())
  #expect(r.value(forHTTPHeaderField: "User-Agent") == "AquaTome-iOS/1.4")
  #expect(r.value(forHTTPHeaderField: "Cookie") == nil && !r.httpShouldHandleCookies)
  // A limit between bytes past the turn's own, set (unset reads URLRequest's 60).
  #expect(r.timeoutInterval == 65 && Chat.turnSeconds == 60)
  let sent = try #require(r.httpBody)
  let body = try #require(JSONSerialization.jsonObject(with: sent) as? [String: Any])
  #expect(body as NSDictionary == ["conversation": conv.uuidString.lowercased(), "question": "Nuôi chung với cá gì?", "lang": "vi"] as NSDictionary)
}

@Test func theFirstQuestionSaysWhereTheChatStartedAndFishIdsGuessesWithinTheContractsLimits() throws {
  let g = { (sci: String, id: String?, c: Double) -> FishId.Guess in
    FishId.Guess(scientificName: sci, commonName: "", variety: nil, confidence: c, reason: "",
                 page: id.map { FishId.Linked(id: $0, name: $0, sci: sci, path: nil, img: nil) }, species: nil, sameGenus: [])
  }
  let long = String(repeating: "x", count: 140)
  let f = FishId.Identification(verdict: "fish", results: [g("Paracheirodon innesi", "paracheirodon-innesi", 0.9), g(long, nil, 0.2), g("C c", "c", 0.1), g("D d", "d", 0.05)])
  let start = Chat.Start(from: .fishId, about: "paracheirodon-innesi", identified: Chat.Identified(f))
  let r = Chat.ask("Nuôi sao?", conversation: UUID(), lang: "th", start: start, key: UUID(), site: site, token: "t", version: "1", ownCopy: nil)
  let sent = try #require(r.httpBody)
  let body = try #require(JSONSerialization.jsonObject(with: sent) as? [String: Any])
  #expect(body["from"] as? String == "fish-id" && body["about"] as? String == "paracheirodon-innesi" && body["lang"] as? String == "th")
  let identified = try #require(body["identified"] as? [String: Any])
  let results = try #require(identified["results"] as? [[String: Any]])
  #expect(identified["verdict"] as? String == "fish" && results.count == 3)
  #expect((results[1]["scientificName"] as? String)?.count == 100 && results[1]["id"] == nil)
  #expect(results[0]["id"] as? String == "paracheirodon-innesi" && results[0]["confidence"] as? Double == 0.9)
  // Every name sent is one the contract's question has, and each guess's, one its guesses have.
  let question = schema("Question")["properties"] as! [String: Any]
  #expect(Set(body.keys).isSubset(of: Set(question.keys)))
  let guess = ((((question["identified"] as! [String: Any])["properties"] as! [String: Any])["results"] as! [String: Any])["items"] as! [String: Any])["properties"] as! [String: Any]
  for r in results { #expect(Set(r.keys).isSubset(of: Set(guess.keys))) }
  // From a species' page: where, and which, only.
  let page = Chat.ask("?", conversation: UUID(), lang: "vi", start: Chat.Start(from: .species, about: "betta-splendens"), key: UUID(), site: site, token: "t", version: "1", ownCopy: nil)
  let pageSent = try #require(page.httpBody)
  let p = try #require(JSONSerialization.jsonObject(with: pageSent) as? [String: Any])
  #expect(p["from"] as? String == "species" && p["about"] as? String == "betta-splendens" && p["identified"] == nil)
}

// MARK: The conversation

@Test func aQuestionGoesInANewConversationForAnotherAccountOr24HoursOn() {
  let t0 = Date(timeIntervalSince1970: 1_700_000_000)
  var c = Chat.Conversation(account: "a")
  // Not asked yet: no 24 hours running.
  #expect(!c.ended(account: "a", now: t0.addingTimeInterval(48 * 3600)))
  c.asked(at: t0)
  c.asked(at: t0.addingTimeInterval(3600))
  #expect(c.started == t0)
  #expect(!c.ended(account: "a", now: t0.addingTimeInterval(24 * 3600 - 1)))
  #expect(c.ended(account: "a", now: t0.addingTimeInterval(24 * 3600)))
  #expect(c.ended(account: "b", now: t0))
}

@Test func anAnswerNumberedOneOverEarlierTurnsStartsTheConversationAgain() {
  let t0 = Date(timeIntervalSince1970: 1_700_000_000)
  var c = Chat.Conversation(account: "a")
  c.asked(at: t0)
  let first = c.answered(n: 1, at: t0), second = c.answered(n: 2, at: t0.addingTimeInterval(60))
  #expect(!first && !second)
  // The Worker no longer held it (deleted a day after its last question): its 24 hours from now.
  let later = t0.addingTimeInterval(30 * 3600)
  let anew = c.answered(n: 1, at: later)
  #expect(anew)
  #expect(c.started == later && c.turns == 1)
  #expect(!c.ended(account: "a", now: later.addingTimeInterval(3600)))
}
