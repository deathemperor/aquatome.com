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
/// event every 3 s, not 0.5 s, so a flow can leave mid-answer. `-chat-lost`: a question asked again with its key is 410
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
  /// The number after a launch argument (`-chat-max 1500`).
  private func number(_ flag: String) -> Int? {
    args.firstIndex(of: flag).flatMap { $0 + 1 < args.count ? Int(args[$0 + 1]) : nil }
  }
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
    let body = args.contains("-chat-off") ? #"{"on":false}"# : #"{"on":true,"perAccount":30,"maxTurns":20,"maxChars":\#(number("-chat-max") ?? 500)}"#
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
    // `-chat-refuses-over`: a Worker that takes less than its status said.
    let over = number("-chat-refuses-over") ?? number("-chat-max") ?? 500
    guard question.utf16.count <= over else { return refuse(413, #"{"error":"too long","limit":\#(over)}"#) }
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
    return whole.components(separatedBy: "\n\n").filter { !$0.isEmpty }.map { e in
      guard e.hasPrefix("event: done\ndata: "), let o = try? JSONSerialization.jsonObject(with: Data(e.dropFirst("event: done\ndata: ".count).utf8)) as? [String: Any]
      else { return e + "\n\n" }
      var turn = o
      turn["conversation"] = conversation
      turn["n"] = n
      let data = (try? JSONSerialization.data(withJSONObject: turn)).map { String(decoding: $0, as: UTF8.self) } ?? ""
      return "event: done\ndata: \(data)\n\n"
    }
  }

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
