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

/// A model on the main actor reads a stream with its own closure (the chat screen's).
@MainActor private final class MainActorReader {
  var names: [String] = []
  func read(_ s: String) async throws { try await ServerEvents.read(stream(s)) { self.names.append($0.name); return true } }
}

@Test @MainActor func aModelOnTheMainActorReadsTheStreamWithItsOwnClosure() async throws {
  let m = MainActorReader()
  try await m.read("event: step\ndata: {}\n\nevent: done\ndata: {}\n\n")
  #expect(m.names == ["step", "done"])
}

/// The app's session, served a recorded answer by a stand-in for the network: a stream (or `status` and `type`'s), the
/// request left open after it when `open`, as a turn still being answered is; `stopped` counts the requests ended.
private final class Recorded: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var body = Data()
  nonisolated(unsafe) static var status = 200
  nonisolated(unsafe) static var type = "text/event-stream"
  nonisolated(unsafe) static var open = false
  nonisolated(unsafe) static var stopped = 0
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let res = HTTPURLResponse(url: request.url!, statusCode: Self.status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": Self.type])!
    client?.urlProtocol(self, didReceive: res, cacheStoragePolicy: .notAllowed)
    // In pieces, as the network brings them: some cut in the middle of a line, or of a letter.
    var at = Self.body.startIndex
    while at < Self.body.endIndex {
      let end = Self.body.index(at, offsetBy: 37, limitedBy: Self.body.endIndex) ?? Self.body.endIndex
      client?.urlProtocol(self, didLoad: Self.body[at..<end])
      at = end
    }
    if !Self.open { client?.urlProtocolDidFinishLoading(self) }
  }
  override func stopLoading() { Self.stopped += 1 }

  static func session(_ body: Data, status: Int = 200, type: String = "text/event-stream", open: Bool = false) -> ServerEvents.Send {
    (Self.body, Self.status, Self.type, Self.open, Self.stopped) = (body, status, type, open, 0)
    let c = URLSessionConfiguration.ephemeral
    c.protocolClasses = [Recorded.self]
    return ServerEvents.urlSession(URLSession(configuration: c))
  }
}

// One at a time: they share the stand-in's answer.
@Suite(.serialized) struct TheAppsSession {
@Test func givesTheStreamsEventsAsTheRecordedStreamHasThem() async throws {
  let data = try recorded("chat-stream-species.sse")
  let (response, bytes) = try await Recorded.session(data)(URLRequest(url: site.appending(path: "api/chat")))
  #expect(response.statusCode == 200 && response.value(forHTTPHeaderField: "Content-Type") == "text/event-stream")
  var got: [ServerEvent] = []
  try await ServerEvents.read(bytes) { got.append($0); return true }
  let want = try await ServerEvents.events(in: data)
  #expect(got == want)
  #expect(got.map(\.name) == ["step", "step", "step", "text", "text", "block", "block", "block", "done"])
}

/// The first event of an answer still coming, then no more read, as a model stops at a turn's end: the stream let go of.
private func firstEventOnly(_ send: ServerEvents.Send) async throws -> Int {
  let (_, bytes) = try await send(URLRequest(url: site.appending(path: "api/chat")))
  var seen = 0
  try await ServerEvents.read(bytes) { _ in seen += 1; return false }
  return seen
}

@Test func endsTheRequestWhenTheStreamIsNoLongerRead() async throws {
  // A turn still being answered: the request stays open until the reading stops.
  let seen = try await firstEventOnly(Recorded.session(Data("event: step\ndata: {}\n\n".utf8), open: true))
  #expect(seen == 1)
  let until = Date().addingTimeInterval(5)
  while Recorded.stopped == 0 && Date() < until { try await Task.sleep(for: .milliseconds(20)) }
  #expect(Recorded.stopped == 1)
}

@Test func givesARefusalsStatusTypeAndBody() async throws {
  // The recorded refusal: its status, type and body as the Worker sends them.
  let fixture = try #require(JSONSerialization.jsonObject(with: recorded("chat-rate.json")) as? [String: Any])
  let status = try #require(fixture["status"] as? Int), type = try #require((fixture["headers"] as? [String: String])?["content-type"])
  let sent = try JSONSerialization.data(withJSONObject: try #require(fixture["body"]))
  let (response, bytes) = try await Recorded.session(sent, status: status, type: type)(URLRequest(url: site.appending(path: "api/chat")))
  #expect(response.statusCode == 429 && response.value(forHTTPHeaderField: "Content-Type") == "application/json")
  let body = try await ServerEvents.collect(bytes)
  #expect(Chat.refusal(body, status: response.statusCode) == .refused("rate", limit: 30))
}
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
  guard case .species(let card) = try #require(blocks.first) else { Issue.record("no card first"); return }
  #expect(card.page.id == "paracheirodon-innesi" && card.page.kind == "species" && card.page.path == "/vi/ca/ca-neon-xanh/")
  #expect(card.page.img?.host == "media.aquatome.com")
  let facts = try #require(card.facts)
  #expect(facts.tempC != nil && facts.ph != nil && facts.schoolMin != nil && card.plant == nil)
  try #require(blocks.count == 3)
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
  // Figures that aren't an object: none, and the card stays (JSONSerialization would raise on them).
  for odd in ["null", #""warm""#, "4", "true", "[1]"] {
    guard case .block(.species(let o))? = block(#"{"t":"species","page":\#(linked),"facts":\#(odd),"plant":\#(odd)}"#)
    else { Issue.record("the card went with figures \(odd)"); continue }
    #expect(o.facts == nil && o.plant == nil)
  }
  // A comparison of more than four: its first four (the contract's most).
  let five = (1...5).map { #"{"page":{"id":"s\#($0)","kind":"species","name":"S"}}"# }.joined(separator: ",")
  guard case .block(.compare(let cards))? = block(#"{"t":"compare","items":[\#(five)]}"#) else { Issue.record("no comparison"); return }
  #expect(cards.map(\.page.id) == ["s1", "s2", "s3", "s4"])
  // A section stops at a heading in it, one without words too: what's under it is another section's.
  let guide = #""page":{"kind":"guide","title":"G","url":"/vi/g/"}"#
  for h in [#"{"t":"h","text":"Khác","id":"khac"}"#, #"{"t":"h"}"#] {
    guard case .block(.section(_, _, let cut))? = block(#"{"t":"section",\#(guide),"blocks":[{"t":"p","c":["Một."]},\#(h),{"t":"p","c":["Hai."]}]}"#)
    else { Issue.record("the section went"); continue }
    #expect(cut.map(\.t) == ["p"])
  }
  // A heading it can't read (no id): not shown as the page's opening; a null one is the opening.
  #expect(block(#"{"t":"section",\#(guide),"heading":{"text":"H"},"blocks":[{"t":"p","c":["Một."]}]}"#) == nil)
  guard case .block(.section(_, nil, _))? = block(#"{"t":"section",\#(guide),"heading":null,"blocks":[{"t":"p","c":["Một."]}]}"#)
  else { Issue.record("a null heading isn't the opening"); return }
  // A plant's figures, read as a plant's (its difficulty on the plants' scale, not in a fish's figures).
  guard case .block(.species(let p))? = block(#"{"t":"species","page":{"id":"b","kind":"plant","name":"B"},"plant":{"difficulty":2,"light":"low"}}"#)
  else { Issue.record("the plant went"); return }
  #expect(p.plant?.difficulty == 2 && p.plant?.light == "low" && p.facts == nil)
  // A section's page block this app can't read is kept as one to see on the web.
  guard case .block(.section(_, nil, let blocks))? = block(#"{"t":"section","page":{"kind":"guide","title":"G","url":"/vi/g/"},"blocks":[{"t":"p","c":["Một."]},{"t":"hologram"}]}"#)
  else { Issue.record("the opening went"); return }
  #expect(blocks.map(\.t) == ["p", "web"])
}

@Test func anAnswerOrErrorItCantReadStillEndsTheTurn() {
  func error(_ name: String, _ data: String) -> String? {
    if case .error(let code)? = Chat.event(ServerEvent(name: name, data: data)) { code } else { nil }
  }
  // A done that isn't a turn (its conversation no UUID), or not JSON; an error without its code.
  #expect(error("done", #"{"conversation":"x","n":1,"text":"","covered":true}"#) == "failed")
  #expect(error("done", "not json") == "failed")
  #expect(error("error", "{}") == "failed")
  #expect(error("error", #"{"error":"resting"}"#) == "resting")
}

@Test func aRefusedQuestionSaysWhy() throws {
  let rate = try JSONSerialization.jsonObject(with: recorded("chat-rate.json")) as! [String: Any]
  let body = try JSONSerialization.data(withJSONObject: rate["body"]!)
  #expect(Chat.refusal(body, status: rate["status"] as! Int) == .refused("rate", limit: 30))
  #expect(Chat.refusal(Data(#"{"error":"session"}"#.utf8), status: 401) == .signedOut)
  #expect(Chat.refusal(Data(#"{"error":"ended"}"#.utf8), status: 410) == .refused("ended", limit: nil))
  #expect(Chat.refusal(Data("<html>".utf8), status: 502) == .refused("failed", limit: nil))
}

/// Chat may be on for the owner's account alone: GET goes as the account when signed in, with no cookie either way.
@Test func theChatsStateIsAskedAsTheAccountWhenSignedIn() {
  let signedIn = Chat.status(site: site, version: "1.4", ownCopy: nil, token: "t0k")
  #expect(signedIn.value(forHTTPHeaderField: "Authorization") == "Bearer t0k")
  #expect((signedIn.httpMethod ?? "GET") == "GET" && signedIn.url?.path == "/api/chat" && !signedIn.httpShouldHandleCookies)
  let signedOut = Chat.status(site: site, version: "1.4", ownCopy: nil)
  #expect(signedOut.value(forHTTPHeaderField: "Authorization") == nil)
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
  // 140 letters, each two UTF-16 units (e and its accent apart): cut between letters, within the Worker's 100 units.
  let long = String(repeating: "e\u{301}", count: 140)
  let f = FishId.Identification(verdict: "fish", results: [g("Paracheirodon innesi", "paracheirodon-innesi", 0.9), g(long, String(repeating: "i", count: 101), -0.2), g("C c", "c", .nan), g("D d", "d", 0.05)])
  let start = Chat.Start(from: .fishId, about: "paracheirodon-innesi", identified: Chat.Identified(f))
  let r = Chat.ask("Nuôi sao?", conversation: UUID(), lang: "th", start: start, key: UUID(), site: site, token: "t", version: "1", ownCopy: nil)
  let sent = try #require(r.httpBody)
  let body = try #require(JSONSerialization.jsonObject(with: sent) as? [String: Any])
  #expect(body["from"] as? String == "fish-id" && body["about"] as? String == "paracheirodon-innesi" && body["lang"] as? String == "th")
  let identified = try #require(body["identified"] as? [String: Any])
  let results = try #require(identified["results"] as? [[String: Any]])
  #expect(identified["verdict"] as? String == "fish" && results.count == 3)
  // The long name cut to 50 letters (100 units), an id too long for a page dropped, a confidence below 0 or none at all 0.
  #expect((results[1]["scientificName"] as? String)?.utf16.count == 100 && (results[1]["scientificName"] as? String)?.count == 50)
  #expect(results[1]["id"] == nil && results[1]["confidence"] as? Double == 0 && results[2]["confidence"] as? Double == 0)
  // A verdict the contract doesn't have: no guesses sent.
  #expect(Chat.Identified(FishId.Identification(verdict: "maybe", results: [])) == nil)
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
  // Asked, then refused (never answered): no 24 hours running either.
  c.asked(at: t0)
  #expect(!c.ended(account: "a", now: t0.addingTimeInterval(48 * 3600)))
  // Retried an hour on (the same question), then answered: its 24 hours from when it was first asked.
  c.asked(at: t0.addingTimeInterval(3600))
  let answered = c.answered(n: 1)
  #expect(!answered)
  #expect(c.started == t0)
  #expect(!c.ended(account: "a", now: t0.addingTimeInterval(24 * 3600 - 1)))
  #expect(c.ended(account: "a", now: t0.addingTimeInterval(24 * 3600)))
  #expect(c.ended(account: "b", now: t0))
}

@Test func anAnswerNumberedOneOverEarlierTurnsStartsTheConversationAgain() {
  let t0 = Date(timeIntervalSince1970: 1_700_000_000)
  var c = Chat.Conversation(account: "a")
  c.asked(at: t0)
  let first = c.answered(n: 1)
  c.asked(at: t0.addingTimeInterval(60))
  let second = c.answered(n: 2)
  #expect(!first && !second)
  // The same answer again (a retry's replay): nothing changes.
  let replay = c.answered(n: 2)
  #expect(!replay && c.turns == 2)
  // The Worker didn't hold it: its 24 hours from that question.
  let later = t0.addingTimeInterval(3 * 3600)
  c.asked(at: later)
  let anew = c.answered(n: 1)
  #expect(anew)
  #expect(c.started == later && c.turns == 1)
  #expect(!c.ended(account: "a", now: later.addingTimeInterval(23 * 3600)))
}

@Test func aQuestionThatGotNoAnswerIsAskedAgainAsAnother() {
  let t0 = Date(timeIntervalSince1970: 1_700_000_000)
  var c = Chat.Conversation(account: "a")
  c.asked(at: t0)
  // Its stream ended in an error: "Hỏi lại" sends it with a new key, an hour on, and its 24 hours count from then.
  c.failed()
  let later = t0.addingTimeInterval(3600)
  c.asked(at: later)
  _ = c.answered(n: 1)
  #expect(c.started == later)
}

@Test func theConversationIsKeptAsItWas() throws {
  var c = Chat.Conversation(account: "a")
  c.asked(at: Date(timeIntervalSince1970: 1_700_000_000))
  _ = c.answered(n: 1)
  c.asked(at: Date(timeIntervalSince1970: 1_700_000_600))
  let back = try JSONDecoder().decode(Chat.Conversation.self, from: JSONEncoder().encode(c))
  #expect(back == c)
  let start = Chat.Start(from: .fishId, identified: Chat.Identified(verdict: "fish", results: [.init(scientificName: "Betta splendens", id: "betta-splendens", confidence: 0.9)]))
  #expect(try JSONDecoder().decode(Chat.Start.self, from: JSONEncoder().encode(start)) == start)
}

// MARK: The answer on the screen

private let neonPage = Chat.PageRef(kind: "fish", title: "Cá neon xanh", path: "/vi/ca/ca-neon-xanh/")
private let guidePage = Chat.PageRef(kind: "guide", title: "Nuôi cá neon", path: "/vi/huong-dan/nuoi-ca-neon/")

@Test func theRecordedAnswerIsDrawnAsItStreamsThenWhole() async throws {
  var r = Chat.Reply()
  var foldedAt: Int?
  for (i, e) in try await chat("chat-stream-species.sse").enumerated() {
    r.take(e)
    if r.writing, foldedAt == nil { foldedAt = i }
  }
  let t = try #require(r.turn)
  #expect(!r.whole && r.error == nil && r.text == t.text && r.blocks.count == t.blocks.count)
  // The text started after the three steps.
  #expect(foldedAt == 3 && r.steps.count == 3)
}

@Test func textInDozensOfPiecesIsJoinedAsItComesThenDoneReplacesIt() async throws {
  // The Worker streams the text as Claude writes it: dozens of pieces, some cut mid-word. Before `done`, the screen holds
  // all of them so far, never only the last.
  let t = try #require(try await chat("chat-stream-species.sse").lazy.compactMap { if case .done(let t) = $0 { t } else { nil } }.first)
  let words = Array(t.text)
  var r = Chat.Reply()
  // About thirty pieces, whatever the recorded answer's length.
  let size = max(1, words.count / 30)
  var at = 0, pieces = 0
  while at < words.count {
    let end = min(at + size, words.count)
    r.take(.text(String(words[at..<end])))
    pieces += 1
    #expect(r.text == String(words[..<end]), "piece \(pieces) didn't join what came before it")
    at = end
  }
  #expect(pieces >= 24)
  #expect(r.turn == nil && r.writing)
  r.take(.done(t))
  #expect(r.text == t.text && r.turn != nil)
}

@Test func eachPageShowsOnceATurnAndNoStepAfterTheText() {
  var r = Chat.Reply()
  r.take(.step(.read(neonPage)))
  r.take(.step(.search("cá neon")))
  // Its outline, then a section of it: the same page.
  r.take(.step(.read(neonPage)))
  r.take(.step(.read(guidePage)))
  #expect(r.steps == [.read(neonPage), .search("cá neon"), .read(guidePage)])
  #expect(!r.writing)
  r.take(.text("Dễ."))
  r.take(.step(.tanks))
  #expect(r.writing && r.steps.count == 3)
}

@Test func aTurnThatComesWholeIsDrawnAtOnceAndNothingAfterItsEnd() async throws {
  // Back from the background: the retry's replay is its `done` alone.
  guard case .done(let t) = try #require(try await chat("chat-stream-species.sse").last) else { Issue.record("no done"); return }
  var r = Chat.Reply()
  r.take(.done(t))
  #expect(r.whole && r.text == t.text && r.steps.count == 3)
  r.take(.text(" Thêm."))
  r.take(.error("failed"))
  #expect(r.text == t.text && r.error == nil)
  // An error ends it as `done` does.
  var failed = Chat.Reply()
  failed.take(.step(.search("cá neon")))
  failed.take(.error("failed"))
  failed.take(.text("x"))
  #expect(failed.ended && failed.error == "failed" && failed.text.isEmpty)
}

@Test func theStepsFoldIntoThePagesReadElseTheSearchElseTheLastStep() {
  #expect(Chat.fold([]) == nil)
  #expect(Chat.fold([.search("a"), .search("b")]) == .searched)
  #expect(Chat.fold([.search("a"), .read(neonPage), .tanks, .read(guidePage), .read(neonPage)]) == .pages(2))
  #expect(Chat.fold([.tanks, .search("a")]) == .tanks)
  #expect(Chat.fold([.search("a"), .tanks, .mates]) == .mates)
}

@Test func numberedLinesAreAListAndTheRestStaysText() {
  let text = """
  Rêu nâu thường do bể mới và thiếu ánh sáng.
  1. Lau kính mỗi tuần.
  2. Thả ốc nerita.

  Sau 1 tuần rêu không lan nữa là đúng hướng.
  Năm 2024. Không phải bước.
  """
  #expect(Chat.paragraphs(text) == [
    .text("Rêu nâu thường do bể mới và thiếu ánh sáng."),
    .list([.init(n: 1, text: "Lau kính mỗi tuần."), .init(n: 2, text: "Thả ốc nerita.")]),
    .text("Sau 1 tuần rêu không lan nữa là đúng hướng.\nNăm 2024. Không phải bước."),
  ])
  #expect(Chat.paragraphs("Dễ.\n\n\nVừa đủ.") == [.text("Dễ."), .text("Vừa đủ.")])
  // Still streaming: a number with no words yet is text until they come.
  #expect(Chat.paragraphs("Vậy:\n1.") == [.text("Vậy:\n1.")])
}

@Test func theDayStartsAgainAtMidnightUTC() {
  // 01:00 in Vietnam is 18:00 UTC the day before: again at 07:00 the same morning.
  let at = ISO8601DateFormatter().date(from: "2026-11-07T18:00:00Z")!
  #expect(Chat.dayResets(after: at) == ISO8601DateFormatter().date(from: "2026-11-08T00:00:00Z")!)
  let midnight = ISO8601DateFormatter().date(from: "2026-11-08T00:00:00Z")!
  #expect(Chat.dayResets(after: midnight) == ISO8601DateFormatter().date(from: "2026-11-09T00:00:00Z")!)
}

@Test func theMatesStepIsRead() {
  guard case .step(.mates)? = Chat.event(ServerEvent(name: "step", data: #"{"kind":"mates"}"#)) else { Issue.record("no mates step"); return }
}

// MARK: Blocks

@Test func aComparisonSaysWhatDiffersAndBoldsOnlyTheOneThatAloneDoes() {
  #expect(Chat.differs([60, 60, 60]) == .init(differ: false, alone: nil))
  // A missing figure is never a difference.
  #expect(Chat.differs([60, 60, nil]) == .init(differ: false, alone: nil))
  #expect(Chat.differs([60, 60, 80]) == .init(differ: true, alone: 2))
  #expect(Chat.differs([60, 80, 60, nil]) == .init(differ: true, alone: 1))
  // Two species, all different, two and two: "khác", none bold.
  #expect(Chat.differs([60, 80]) == .init(differ: true, alone: nil))
  #expect(Chat.differs([60, 80, 100]) == .init(differ: true, alone: nil))
  #expect(Chat.differs([60, 60, 80, 80]) == .init(differ: true, alone: nil))
  #expect(Chat.differs([60, nil, 80]) == .init(differ: true, alone: nil))
}

@Test func aSectionShowsWholeBlocksAndCountsWhatsLeft() {
  let p = PageDoc.Block.paragraph([])
  let steps = PageDoc.Block.list(ordered: true, items: [[p], [p], [p]])
  let points = PageDoc.Block.list(ordered: false, items: [[p], [p]])
  let parts = Chat.parts([p, steps, points, .heading("x", id: "x"), .web])
  #expect(parts.count == 6)
  guard case .item(let n, _) = parts[3] else { Issue.record("no third step"); return }
  #expect(n == 3)
  var rest = Chat.Rest(parts.dropFirst(2))
  #expect(rest.steps == 2 && rest.items == 2 && rest.paragraphs == 0 && rest.photos == 0)
  rest = Chat.Rest([])
  #expect(rest.isEmpty)
}

@Test func aTankMatesBlockCarriesItsCheckAndTheReadersTankAndMayHaveNoLink() throws {
  let data = #"""
  {"t":"tool","tool":"tank-mates","name":"Nuôi chung","check":{"verdict":{"level":"no","text":"Không nên nuôi chung: Cá betta (cá xiêm) hung dữ."},"warnings":[]},
   "tank":{"id":"t1","name":"Bể phòng khách","dims":{"l":60,"w":30,"h":36},"fish":[{"name":"Cá neon xanh","count":6},{"name":"Ốc lạ"}],"added":[{"name":"Cá betta","count":1}]}}
  """#
  guard case .block(.tool(let t))? = Chat.event(ServerEvent(name: "block", data: data)) else { Issue.record("no tool"); return }
  #expect(t.path == nil)
  let check = try #require(t.check.flatMap { try JSONSerialization.jsonObject(with: $0) as? [String: Any] })
  #expect((check["verdict"] as? [String: Any])?["level"] as? String == "no")
  let tank = try #require(t.tank)
  #expect(tank.id == "t1" && tank.dims == [60, 30, 36] && tank.litres == nil)
  #expect(tank.fish == [.init(name: "Cá neon xanh", count: 6), .init(name: "Ốc lạ", count: nil)] && tank.added == [.init(name: "Cá betta", count: 1)])
  // Another tool needs its link; a link that isn't the site's own is no tool.
  for d in [#"{"t":"tool","tool":"tank-volume","name":"Thể tích"}"#, #"{"t":"tool","tool":"tank-mates","name":"Nuôi chung","url":"https://x.com/"}"#] {
    if case .block? = Chat.event(ServerEvent(name: "block", data: d)) { Issue.record("a tool read from \(d)") }
  }
}

@Test func aPhotoTheTurnShowedIsLeftOutOfASectionAtAnySize() throws {
  // As the recording has it: the card's at a width, the section's whole.
  let image = #"{"t":"figure","img":{"src":"https://media.aquatome.com/a/4286e57c.webp","w":640,"h":402},"caption":[]}"#
  let data = #"{"t":"section","page":{"kind":"guide","title":"G","url":"/vi/g/"},"blocks":[\#(image),{"t":"p","c":["x"]}]}"#
  guard case .block(.section(_, _, let blocks))? = Chat.event(ServerEvent(name: "block", data: data)) else { Issue.record("no section"); return }
  #expect(Chat.parts(blocks).count == 2)
  #expect(Chat.parts(blocks, shown: ["https://media.aquatome.com/a/4286e57c-480.webp"]).count == 1)
  #expect(Chat.parts(blocks, shown: ["https://media.aquatome.com/a/4286e57c.webp"]).count == 1)
  #expect(Chat.parts(blocks, shown: ["https://media.aquatome.com/a/other-480.webp"]).count == 2)
}

@Test func aVietnamesePageAtTheRootIsStillTheSitesOwn() {
  func block(_ json: String) -> Chat.Event? { Chat.event(ServerEvent(name: "block", data: json)) }
  guard case .block(.species(let c))? = block(#"{"t":"species","page":{"id":"a","kind":"species","name":"A","url":"/ca/ca-neon/"}}"#)
  else { Issue.record("the card went"); return }
  #expect(c.page.path == "/ca/ca-neon/")
}
