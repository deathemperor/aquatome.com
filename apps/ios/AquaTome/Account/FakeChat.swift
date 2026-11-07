#if DEBUG
import Foundation
import Handbook

/// The UI tests' chat (`/api/chat`, protocols/chat.openapi.json): the contract's recorded answers
/// (protocols/chat-stream-*.sse, read from this checkout, as `-fake-owner` reads its vectors), streamed an event at a
/// time, so a flow sees the wait, the steps and the text arrive. Each `done` is the asking conversation's, numbered in it.
/// An account's session as FakeAccounts holds it, so signing out or a session ended elsewhere is a 401.
///
/// `-chat-off`: GET says chat is off. `-chat-uncovered`: every question gets the answer the handbook doesn't cover;
/// `-chat-failed`, the one that ends in `failed`; `-chat-unavailable`, a step then `unavailable` (Claude unreachable).
/// `-chat-rate`: every question is refused as the reader's day used (protocols/chat-rate.json); `-chat-busy`, as the
/// site's. `-chat-turns N`: a conversation ends after N questions (410 `ended`, as past `maxTurns`). `-chat-slow`: an
/// event every 3 s, not 0.5 s, so a flow can leave mid-answer. `-chat-blocks`: the answer has one of each kind of block,
/// as the fixed handbook has them, where the recording has only some. `-chat-lost`: a question asked again with its key is 410
/// `ended`, as past its conversation's 24 hours. The answer to a question is fixed when it's first asked, as the
/// Worker's run goes on without the app: asked again with its key, it comes back as its `done` (or `error`) alone.
@MainActor
final class FakeChat {
  private let account: (String) -> String?
  private let args: [String]
  private let protocols: URL
  /// Each question's answer by its key: its account, and the stream's last event, as the Worker keeps a turn.
  private var kept: [String: (account: String, last: String)] = [:]
  /// Questions answered in each conversation, by account and id.
  private var turns: [String: Int] = [:]
  private var gap: Duration { args.contains("-chat-slow") ? .seconds(3) : .milliseconds(500) }

  init(_ args: [String], account: @escaping (String) -> String?) {
    self.args = args
    self.account = account
    var repo = URL(fileURLWithPath: #filePath)
    for _ in 0..<5 { repo.deleteLastPathComponent() }
    protocols = repo.appending(path: "protocols")
  }

  typealias Answer = (response: HTTPURLResponse, bytes: AsyncThrowingStream<UInt8, any Error>)

  /// GET's answer, or nil for a request that isn't the chat's.
  func status(_ r: URLRequest) -> (Data, HTTPURLResponse)? {
    guard r.url?.path == "/api/chat", (r.httpMethod ?? "GET") == "GET" else { return nil }
    let body = args.contains("-chat-off") ? #"{"on":false}"# : #"{"on":true,"perAccount":30,"maxTurns":20,"maxChars":500}"#
    return (Data(body.utf8), Self.response(r, 200, type: "application/json"))
  }

  /// A question's answer: a refusal's JSON, or the stream.
  func ask(_ r: URLRequest) throws -> Answer {
    func refuse(_ status: Int, _ body: String) -> Answer {
      (Self.response(r, status, type: "application/json"), AsyncThrowingStream { c in Data(body.utf8).forEach { c.yield($0) }; c.finish() })
    }
    let bearer = r.value(forHTTPHeaderField: "Authorization").map { String($0.dropFirst("Bearer ".count)) }
    guard let sub = bearer.flatMap(account) else { return refuse(401, #"{"error":"session"}"#) }
    guard let data = r.httpBody, let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let conversation = body["conversation"] as? String, let question = body["question"] as? String, let key = r.value(forHTTPHeaderField: "Idempotency-Key")
    else { return refuse(400, #"{"error":"bad request"}"#) }
    if let k = kept[key], k.account == sub {
      if args.contains("-chat-lost") { return refuse(410, #"{"error":"ended"}"#) }
      return (Self.response(r, 200, type: "text/event-stream"), stream([k.last], gap: .zero))
    }
    guard question.utf16.count <= 500 else { return refuse(413, #"{"error":"too long"}"#) }
    if args.contains("-chat-rate") { return refuse(429, #"{"error":"rate","limit":30}"#) }
    if args.contains("-chat-busy") { return refuse(429, #"{"error":"busy"}"#) }
    let at = "\(sub) \(conversation)"
    if let i = args.firstIndex(of: "-chat-turns"), i + 1 < args.count, let max = Int(args[i + 1]), turns[at, default: 0] >= max {
      return refuse(410, #"{"error":"ended"}"#)
    }
    turns[at, default: 0] += 1
    let events = try recorded(conversation: conversation, n: turns[at]!)
    kept[key] = (sub, events.last!)
    return (Self.response(r, 200, type: "text/event-stream"), stream(events, gap: gap))
  }

  /// The recorded answer this question gets, an event each, its `done` the asking conversation's turn `n`.
  private func recorded(conversation: String, n: Int) throws -> [String] {
    if args.contains("-chat-unavailable") {
      return ["event: step\ndata: {\"kind\":\"search\",\"query\":\"cá neon\"}\n\n", "event: error\ndata: {\"error\":\"unavailable\"}\n\n"]
    }
    let name = args.contains("-chat-failed") ? "chat-stream-failed.sse" : args.contains("-chat-uncovered") ? "chat-stream-uncovered.sse" : "chat-stream-species.sse"
    let whole = try String(contentsOf: protocols.appending(path: name), encoding: .utf8)
    var events = whole.components(separatedBy: "\n\n").filter { !$0.isEmpty }
    let every = args.contains("-chat-blocks") ? try JSONSerialization.jsonObject(with: Data(Self.everyBlock.utf8)) as? [[String: Any]] : nil
    if let every, let done = events.firstIndex(where: { $0.hasPrefix("event: done") }) {
      let streamed = try every.map { "event: block\ndata: " + String(decoding: try JSONSerialization.data(withJSONObject: $0), as: UTF8.self) }
      events = events[..<done].filter { !$0.hasPrefix("event: block") } + streamed + events[done...]
    }
    return events.map { e in
      guard e.hasPrefix("event: done\ndata: "), let o = try? JSONSerialization.jsonObject(with: Data(e.dropFirst("event: done\ndata: ".count).utf8)) as? [String: Any]
      else { return e + "\n\n" }
      var turn = o
      turn["conversation"] = conversation
      turn["n"] = n
      if let every { turn["blocks"] = every }
      let data = (try? JSONSerialization.data(withJSONObject: turn)).map { String(decoding: $0, as: UTF8.self) } ?? ""
      return "event: done\ndata: \(data)\n\n"
    }
  }

  /// `-chat-blocks`: the fish the chat started from and another, with the same facts' rows; a comparison of four, one with no
  /// figures and no page, one figure alone differing; a section longer than it opens to, and a short one with a link in its
  /// text, a summary and a block this screen doesn't draw; the tank-mates tool, set by its link and checked against a tank
  /// (`-seed-tanks litres`'s).
  private static let everyBlock: String = {
    let steps = (1...24).map { #"[{"t":"p","c":["Bước \#($0): thay một phần ba nước, rồi cho ăn một lượng nhỏ và xem đàn cá ăn hết trong bao lâu."]}]"# }.joined(separator: ",")
    let neon = #""id":"paracheirodon-innesi","kind":"species","name":"Cá neon","sci":"Paracheirodon innesi","url":"/vi/ca/ca-neon/","img":"https://media.aquatome.com/a/neon.webp""#
    let discus = #""id":"symphysodon-aequifasciatus","kind":"species","name":"Cá đĩa","sci":"Symphysodon aequifasciatus","url":"/vi/ca/ca-dia/","img":"https://media.aquatome.com/a/dia.webp""#
    let neonFacts = #""facts":{"tempC":{"min":20,"max":26},"ph":{"min":5,"max":7},"sizeCm":4,"tankCm":60,"temperament":"peaceful","schoolMin":6,"difficulty":2}"#
    let discusFacts = #""facts":{"tempC":{"min":20,"max":26},"ph":{"min":5,"max":6},"sizeCm":15,"tankCm":120,"temperament":"peaceful","schoolMin":6,"difficulty":7}"#
    return #"""
    [{"t":"species","page":{\#(neon)},\#(neonFacts)},
     {"t":"species","page":{\#(discus)},\#(discusFacts)},
     {"t":"compare","items":[{"page":{\#(neon)},\#(neonFacts)},{"page":{\#(discus)},\#(discusFacts)},
      {"page":{"id":"hyphessobrycon-herbertaxelrodi","kind":"species","name":"Cá neon đen","url":"/vi/ca/ca-neon/"},\#(neonFacts)},{"page":{"id":"khong-co","kind":"species","name":"Cá lạ"}}]},
     {"t":"section","page":{"kind":"guide","title":"Nuôi cá neon trong bể nhỏ","url":"/vi/huong-dan/nuoi-ca-neon/"},"heading":{"text":"Cho ăn","id":"cho-an"},
      "blocks":[{"t":"p","c":["Ngày hai lần, lượng ăn hết trong hai phút."]},{"t":"list","ordered":true,"items":[\#(steps)]},{"t":"p","c":["Cá ăn ít hơn khi nước lạnh."]}]},
     {"t":"section","page":{"kind":"guide","title":"Cách hạn chế rêu hại","url":"/vi/huong-dan/cach-han-che-reu-hai/"},
      "blocks":[{"t":"summary","title":"Tóm tắt nhanh","items":["Ít đèn hơn."]},{"t":"p","c":[{"text":"Cá neon sống theo đàn","href":"/vi/ca/ca-neon/"}]},{"t":"carousel","items":[{"src":"https://media.aquatome.com/a/neon.webp"}]}]},
     {"t":"tool","tool":"tank-mates","name":"Nuôi chung","url":"/vi/cong-cu/nuoi-chung/?ca=ca-neon:6"},
     {"t":"tool","tool":"tank-mates","name":"Nuôi chung","check":{"verdict":{"level":"no","text":"Không nên nuôi chung: Cá betta (cá xiêm) hung dữ."},"warnings":[]},
      "tank":{"id":"00000000-0000-4000-8000-000000000001","name":"Bể cũ","dims":{"l":100,"w":40,"h":50},"fish":[{"name":"Cá neon","count":6},{"name":"Ốc lạ"}],"added":[{"name":"Cá betta","count":1}]}}]
    """#
  }()

  /// The events' bytes, `gap` apart, the first at once.
  private func stream(_ events: [String], gap: Duration) -> AsyncThrowingStream<UInt8, any Error> {
    AsyncThrowingStream { c in
      let task = Task {
        for (i, e) in events.enumerated() {
          if i > 0 { try? await Task.sleep(for: gap) }
          if Task.isCancelled { break }
          Data(e.utf8).forEach { c.yield($0) }
        }
        c.finish()
      }
      c.onTermination = { _ in task.cancel() }
    }
  }

  private static func response(_ r: URLRequest, _ status: Int, type: String) -> HTTPURLResponse {
    HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": type, "Cache-Control": "no-store"])!
  }
}
#endif
