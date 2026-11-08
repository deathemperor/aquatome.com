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
///
/// A stop (`/api/chat/cancel`) wins until the text's first piece, and then the question's own stream or request says
/// `cancelled`, as the Worker's does, and the question isn't counted; `-chat-cancel-late` makes every stop too late, its
/// answer 3 s coming. A question's run goes on whatever happens to its stream, and its turn is kept when the run ends; another
/// question in that conversation meanwhile gets 409 `answering`. `-chat-read-fails`: a conversation can't be read back. The list (`/api/chat/conversations`)
/// holds what was asked here, each conversation that `continues` another in its row. `-chat-history`: four rows already
/// there, as the design's list has them (today, open; yesterday; this week from fish ID; a chain, weeks ago);
/// `-chat-history-open`, yesterday's about the neon is open. `-chat-list-page N`: pages of N rows. `-chat-hidden-elsewhere`:
/// a conversation is hidden once answered, as from another device.
@MainActor
final class FakeChat {
  private let account: (String) -> String?
  private let args: [String]
  private let protocols: URL
  /// Each question's answer by its key: its account, and the stream's last event, as the Worker keeps a turn.
  private var kept: [String: (account: String, last: String)] = [:]
  /// Questions answered in each conversation, by account and id.
  private var turns: [String: Int] = [:]
  /// A question stopped, by its key: asked again, it stays stopped.
  private var cancelled: Set<String> = []
  /// Questions whose text has begun: too late to stop.
  private var begun: Set<String> = []
  /// The questions still running, by key.
  private var runs: [String: Run] = [:]
  private var records: [Record] = []
  private var seeded: Set<String> = []

  private struct Run {
    let account: String
    let conversation: String
    let question: String
    /// Its `done`; none for one that ends in an error.
    let turn: [String: Any]?
  }

  /// A conversation as the Worker keeps it.
  private struct Record {
    let id: String
    let account: String
    let question: String
    let from: String?
    let about: [String: Any]?
    let identified: Any?
    var started: Date
    var last: Date
    var continues: String?
    var hidden = false
    var closed = false
    var kept: [(question: String, asked: Date, turn: [String: Any])] = []
    /// `-chat-titles`: the seeded conversations' titles.
    var title: String?
  }

  /// The number after a launch argument (`-chat-max 1500`).
  private func number(_ flag: String) -> Int? {
    args.firstIndex(of: flag).flatMap { $0 + 1 < args.count ? Int(args[$0 + 1]) : nil }
  }
  private var gap: Duration { args.contains("-chat-slower") ? .seconds(6) : args.contains("-chat-slow") ? .seconds(3) : .milliseconds(500) }

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
    if cancelled.contains(key) { return refuse(410, #"{"error":"cancelled"}"#) }
    if let k = kept[key], k.account == sub {
      if args.contains("-chat-lost") { return refuse(410, #"{"error":"ended"}"#) }
      finished(key)
      return (Self.response(r, 200, type: "text/event-stream"), stream([k.last], gap: .zero, key: key))
    }
    // `-chat-refuses-over`: a Worker that takes less than its status said.
    let over = number("-chat-refuses-over") ?? number("-chat-max") ?? 500
    guard question.utf16.count <= over else { return refuse(413, #"{"error":"too long","limit":\#(over)}"#) }
    if args.contains("-chat-rate") { return refuse(429, #"{"error":"rate","limit":30}"#) }
    if args.contains("-chat-busy") { return refuse(429, #"{"error":"busy"}"#) }
    let at = "\(sub) \(conversation)"
    seed(sub)
    if args.contains("-chat-hidden-elsewhere"), let i = records.firstIndex(where: { $0.id == conversation && $0.account == sub && !$0.kept.isEmpty }) {
      records[i].hidden = true
    }
    if records.contains(where: { $0.id == conversation && $0.account == sub && $0.hidden }) { return refuse(410, #"{"error":"ended"}"#) }
    if runs.values.contains(where: { $0.conversation == conversation && $0.account == sub }) { return refuse(409, #"{"error":"answering"}"#) }
    if let i = args.firstIndex(of: "-chat-turns"), i + 1 < args.count, let max = Int(args[i + 1]), turns[at, default: 0] >= max {
      return refuse(410, #"{"error":"ended"}"#)
    }
    turns[at, default: 0] = max(turns[at, default: 0], records.first { $0.id == conversation && $0.account == sub }?.kept.count ?? 0) + 1
    let events = try recorded(conversation: conversation, n: turns[at]!)
    kept[key] = (sub, events.last!)
    note(sub, conversation, body, question: question)
    let done = events.last!.hasPrefix("event: done\ndata: ") ? (try? JSONSerialization.jsonObject(with: Data(events.last!.dropFirst("event: done\ndata: ".count).utf8))) as? [String: Any] : nil
    runs[key] = Run(account: sub, conversation: conversation, question: question, turn: done)
    let length = gap * (events.count - 1)
    Task { [weak self] in
      try? await Task.sleep(for: length)
      self?.finished(key)
    }
    return (Self.response(r, 200, type: "text/event-stream"), stream(events, gap: gap, key: key))
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
  private func stream(_ events: [String], gap: Duration, key: String) -> AsyncThrowingStream<UInt8, any Error> {
    AsyncThrowingStream { c in
      let task = Task { [weak self] in
        for (i, e) in events.enumerated() {
          if i > 0 { try? await Task.sleep(for: gap) }
          if Task.isCancelled { break }
          if self?.cancelled.contains(key) == true {
            Data("event: error\ndata: {\"error\":\"cancelled\"}\n\n".utf8).forEach { c.yield($0) }
            break
          }
          if e.hasPrefix("event: text") { self?.begun.insert(key) }
          Data(e.utf8).forEach { c.yield($0) }
        }
        c.finish()
      }
      c.onTermination = { _ in task.cancel() }
    }
  }

  // MARK: Stopping, and past conversations

  /// The answer to a stop or to the list's requests, or nil for a request that isn't one.
  func answer(_ r: URLRequest) -> (Data, HTTPURLResponse)? {
    guard let path = r.url?.path, path.hasPrefix("/api/chat/") else { return nil }
    func json(_ status: Int, _ o: Any) -> (Data, HTTPURLResponse) {
      ((try? JSONSerialization.data(withJSONObject: o)) ?? Data(), Self.response(r, status, type: "application/json"))
    }
    let bearer = r.value(forHTTPHeaderField: "Authorization").map { String($0.dropFirst("Bearer ".count)) }
    guard let sub = bearer.flatMap(account) else { return json(401, ["error": "session"]) }
    seed(sub)
    let parts = path.split(separator: "/").map(String.init)
    if path == "/api/chat/cancel" {
      guard let body = r.httpBody.flatMap({ try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }), let key = body["key"] as? String else {
        return json(400, ["error": "bad request"])
      }
      // Too late: its text has begun, or it has ended. One the Worker hasn't seen yet holds, for when it comes.
      if args.contains("-chat-cancel-late") || begun.contains(key) || (kept[key] != nil && runs[key] == nil) { return json(200, ["result": "too late"]) }
      cancelled.insert(key)
      if let run = runs.removeValue(forKey: key) {
        turns["\(sub) \(run.conversation)", default: 1] -= 1
        records.removeAll { $0.id == run.conversation && $0.account == sub && $0.kept.isEmpty }
      }
      return json(200, ["result": "cancelled"])
    }
    if path == "/api/chat/conversations" { return json(200, list(sub, query: URLComponents(url: r.url!, resolvingAgainstBaseURL: false)?.queryItems ?? [])) }
    guard parts.count >= 4, let i = records.firstIndex(where: { $0.id == parts[3] && $0.account == sub }) else {
      return parts.last == "hide" ? json(200, ["hidden": [String]()]) : json(404, ["error": "unknown"])
    }
    if parts.last == "hide" {
      let row = chains(sub).first { $0.contains { $0.id == parts[3] } }?.map(\.id) ?? [parts[3]]
      for k in records.indices where row.contains(records[k].id) { records[k].hidden = true }
      return json(200, ["hidden": row])
    }
    guard !records[i].hidden else { return json(404, ["error": "unknown"]) }
    if args.contains("-chat-read-fails") { return json(500, ["error": "unavailable"]) }
    return json(200, whole(records[i]))
  }

  /// A question's run over: its turn kept, unless it was stopped or ended in an error.
  private func finished(_ key: String) {
    guard let run = runs.removeValue(forKey: key), let turn = run.turn, !cancelled.contains(key),
          let i = records.firstIndex(where: { $0.id == run.conversation && $0.account == run.account }) else { return }
    let now = Date()
    records[i].kept.append((run.question, now, turn))
    records[i].last = now
  }

  /// A question taken: its conversation, made with its first. From fish ID, about its first guess's page, for the row's name.
  private func note(_ sub: String, _ conversation: String, _ body: [String: Any], question: String) {
    let now = Date()
    if !records.contains(where: { $0.id == conversation && $0.account == sub }) {
      let guess = ((body["identified"] as? [String: Any])?["results"] as? [[String: Any]])?.first?["id"] as? String
      let about = ((body["about"] as? String) ?? guess).map { page($0) }
      let continues = (body["continues"] as? String).flatMap { c in records.contains { $0.id == c && $0.account == sub && !$0.hidden } ? c : nil }
      records.append(Record(id: conversation, account: sub, question: question, from: body["from"] as? String, about: about, identified: body["identified"],
                            started: now, last: now, continues: continues))
    }
  }

  private func page(_ id: String) -> [String: Any] {
    let name = id == "paracheirodon-innesi" ? "Cá neon" : id == "betta-splendens" ? "Cá betta" : "Cá đĩa"
    return ["id": id, "kind": "species", "name": name, "url": "/vi/ca/\(id)/"]
  }

  private func isOpen(_ c: Record) -> Bool {
    let most = args.firstIndex(of: "-chat-turns").flatMap { $0 + 1 < args.count ? Int(args[$0 + 1]) : nil } ?? 20
    return !c.closed && Date().timeIntervalSince(c.started) < 24 * 60 * 60 && c.kept.count < most
  }

  private func stamp(_ d: Date) -> String { d.formatted(.iso8601) }

  private func summary(_ c: Record) -> [String: Any] {
    var o: [String: Any] = ["id": c.id, "question": c.question, "started": stamp(c.started), "last": stamp(c.last), "n": c.kept.count, "open": isOpen(c)]
    if let from = c.from { o["from"] = from }
    if let about = c.about { o["about"] = about }
    if let i = c.identified { o["identified"] = i }
    if let k = c.continues { o["continues"] = k }
    if let t = c.title { o["title"] = t }
    return o
  }

  private func whole(_ c: Record) -> [String: Any] {
    var o = summary(c)
    o["turns"] = c.kept.map { ["question": $0.question, "asked": stamp($0.asked), "turn": $0.turn] as [String: Any] }
    return o
  }

  /// The account's conversations in rows, oldest first in each; those hidden and those with nothing answered aren't listed.
  private func chains(_ sub: String) -> [[Record]] {
    var rows: [[Record]] = []
    for c in records.filter({ $0.account == sub && !$0.hidden && !$0.kept.isEmpty }).sorted(by: { $0.started < $1.started }) {
      if let k = c.continues, let i = rows.firstIndex(where: { $0.contains { $0.id == k } }) { rows[i].append(c) } else { rows.append([c]) }
    }
    return rows.sorted { ($0.last?.last ?? .distantPast) > ($1.last?.last ?? .distantPast) }
  }

  private func list(_ sub: String, query: [URLQueryItem]) -> [String: Any] {
    func item(_ n: String) -> String? { query.first { $0.name == n }?.value }
    var rows = chains(sub)
    if let about = item("about") { rows = rows.filter { $0.first?.from == "species" && $0.first?.about?["id"] as? String == about } }
    let size = args.firstIndex(of: "-chat-list-page").flatMap { $0 + 1 < args.count ? Int(args[$0 + 1]) : nil } ?? item("limit").flatMap(Int.init) ?? 20
    let from = item("before").flatMap(Int.init) ?? 0
    var o: [String: Any] = ["rows": rows.dropFirst(from).prefix(size).map { ["conversations": $0.map(summary)] }]
    if from + size < rows.count { o["next"] = String(from + size) }
    return o
  }

  /// `-chat-history`: what the list opens with, once for each account.
  private func seed(_ sub: String) {
    guard args.contains("-chat-history"), seeded.insert(sub).inserted, let turn = try? recordedTurn() else { return }
    // By the calendar, so a row stays under its heading just after midnight too.
    func back(_ days: Int) -> Date {
      let now = Date()
      return days == 0 ? max(Calendar.current.startOfDay(for: now), now.addingTimeInterval(-3600)) : Calendar.current.date(byAdding: .day, value: -days, to: now)!
    }
    let titled = args.contains("-chat-titles")
    func add(_ question: String, about: String?, from: String = "species", identified: Any? = nil, days: Int, n: Int = 1, closed: Bool = true, continues: String? = nil,
             title: String? = nil) -> String {
      let id = UUID().uuidString.lowercased(), at = back(days)
      var r = Record(id: id, account: sub, question: question, from: from, about: about.map { page($0) }, identified: identified, started: at, last: at,
                     continues: continues, closed: closed)
      r.title = titled ? title : nil
      for k in 1...n {
        var t = turn
        t["title"] = nil
        t["conversation"] = id
        t["n"] = k
        r.kept.append((k == 1 ? question : "Câu thứ \(k)?", at, t))
      }
      records.append(r)
      return id
    }
    let first = add("Thả bao nhiêu con thì vừa bể của tôi?", about: "symphysodon-aequifasciatus", days: 29)
    _ = add("Cá đĩa ăn gì?", about: "symphysodon-aequifasciatus", days: 28, continues: first, title: "Thức ăn hằng ngày")
    _ = add("Nuôi chung với cá neon được không?", about: "betta-splendens", from: "fish-id",
            identified: ["verdict": "fish", "results": [["scientificName": "Betta splendens", "confidence": 0.9]]], days: 3)
    let open = args.contains("-chat-history-open")
    _ = add("Bể neon của mình rêu tóc mọc kín, làm sao hết?", about: "paracheirodon-innesi", days: open ? 0 : 1, closed: !open, title: "Rêu tóc mọc kín bể")
    _ = add("Cá betta nhà mình bỏ ăn hai ngày nay, phải làm sao?", about: "betta-splendens", days: 0, n: 2, closed: false, title: "Bỏ ăn hai ngày liền")
  }

  /// The recorded turn, for the conversations the list opens with.
  private func recordedTurn() throws -> [String: Any] {
    let whole = try String(contentsOf: protocols.appending(path: "chat-stream-species.sse"), encoding: .utf8)
    guard let e = whole.components(separatedBy: "\n\n").first(where: { $0.hasPrefix("event: done\ndata: ") }),
          let o = try JSONSerialization.jsonObject(with: Data(e.dropFirst("event: done\ndata: ".count).utf8)) as? [String: Any]
    else { return [:] }
    return o
  }

  private static func response(_ r: URLRequest, _ status: Int, type: String) -> HTTPURLResponse {
    HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": type, "Cache-Control": "no-store"])!
  }
}
#endif
