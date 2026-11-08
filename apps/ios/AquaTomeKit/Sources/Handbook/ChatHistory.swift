import Foundation

/// Stopping a question and the reader's past conversations (protocols/chat.openapi.json): each list row a conversation and
/// those that carried it on; hiding one hides its whole row on every device, and deletes nothing.
extension Chat {
  // MARK: Stopping a question

  /// Which came first. `cancelled`: the stop, before the text's first piece: nothing kept, the reader's count given back.
  /// `tooLate`: the text had begun, or the question had ended: its turn stands, and its own request brings it.
  public enum Stopped: Sendable, Equatable { case cancelled, tooLate }

  /// POST /api/chat/cancel: the question sent with `key`.
  public static func cancel(key: UUID, site: URL, token: String, version: String, ownCopy: String?) -> URLRequest {
    var r = signed("api/chat/cancel", method: "POST", site: site, token: token, version: version, ownCopy: ownCopy)
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    r.httpBody = try? JSONSerialization.data(withJSONObject: ["key": key.uuidString.lowercased()])
    return r
  }

  /// A stop's answer, or nil for one that isn't the contract's (the question goes on).
  public static func stopped(_ data: Data, status: Int) -> Stopped? {
    guard status == 200 else { return nil }
    return switch object(data)?["result"] as? String {
    case "cancelled": .cancelled
    case "too late": .tooLate
    default: nil
    }
  }

  /// What a stop that came in time cost, as the Worker counted it when the question was stopped.
  public struct StopCount: Sendable, Equatable {
    /// The stop counted toward the reader's day (the 11th of the day and after).
    public let counted: Bool
    /// Free stops left after this one.
    public let freeLeft: Int
    /// This was the day's last free stop: the next one counts. The one time the screen warns.
    public var lastFree: Bool { !counted && freeLeft == 0 }
  }

  /// The count a `cancelled` carries: the cancel's answer, the stopped question's own 410, or the stream's error's data.
  /// A retry's 410 repeats the figures from when the question was stopped, so the screen takes them from the first two.
  /// Nil without them (a Worker from before the stop limit).
  public static func stopCount(_ data: Data) -> StopCount? {
    guard let o = object(data), (o["result"] ?? o["error"]) as? String == "cancelled", let counted = o["counted"] as? Bool,
          let left = o["freeLeft"] as? Int, left >= 0 else { return nil }
    return StopCount(counted: counted, freeLeft: left)
  }

  // MARK: Reporting a wrong answer (Báo sai)

  /// A report's answer: kept now, or kept before (a turn's first report stands).
  public enum Reported: Sendable, Equatable { case saved, already }

  /// The longest reason, in characters as the reader sees them.
  public static let reasonLimit = 140

  /// A reason as it's sent: trimmed; nil when nothing's left of it.
  public static func reason(_ typed: String) -> String? {
    let t = typed.trimmingCharacters(in: .whitespacesAndNewlines)
    return t.isEmpty ? nil : t
  }

  /// The contract takes it: one line of at most `reasonLimit` characters, once trimmed. No reason fits too.
  public static func reasonFits(_ typed: String) -> Bool {
    guard let r = reason(typed) else { return true }
    return r.count <= reasonLimit && !r.contains(where: \.isNewline)
  }

  /// POST /api/chat/conversations/{id}/report: the conversation's answer `turn` reported as wrong, with the reader's reason
  /// when they gave one.
  public static func report(_ id: UUID, turn: Int, reason typed: String?, site: URL, token: String, version: String,
                            ownCopy: String?) -> URLRequest {
    var r = signed("api/chat/conversations/\(id.uuidString.lowercased())/report", method: "POST", site: site, token: token,
                   version: version, ownCopy: ownCopy)
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    var body: [String: Any] = ["turn": turn]
    if let reason = typed.flatMap(reason) { body["reason"] = reason }
    r.httpBody = try? JSONSerialization.data(withJSONObject: body)
    return r
  }

  /// A report's answer, or nil for one that isn't the contract's (not kept).
  public static func reported(_ data: Data, status: Int) -> Reported? {
    guard status == 200 else { return nil }
    return switch object(data)?["result"] as? String {
    case "saved": .saved
    case "already": .already
    default: nil
    }
  }

  // MARK: Past conversations

  /// A conversation in the list.
  public struct Summary: Sendable, Hashable, Identifiable {
    public let id: UUID
    /// Its first question, as asked.
    public let question: String
    /// Its short title, from its first answered question; none from before titles, or with nothing answered on topic.
    public let title: String?
    public let from: From?
    /// The page it started from; from fish ID, only its first guess's, for the row's name. In the language it was asked in.
    public let about: Linked?
    public let identified: Identified?
    public let started: Date
    public let last: Date
    /// Its questions answered.
    public let n: Int
    /// It takes another question.
    public let open: Bool
    public let continues: UUID?

    public init(id: UUID, question: String, title: String? = nil, from: From?, about: Linked?, identified: Identified?, started: Date, last: Date, n: Int,
                open: Bool, continues: UUID?) {
      self.id = id; self.question = question; self.title = title; self.from = from; self.about = about; self.identified = identified
      self.started = started; self.last = last; self.n = n; self.open = open; self.continues = continues
    }
  }

  /// A conversation and those that carried it on, oldest first; never empty.
  public struct Row: Sendable, Hashable, Identifiable {
    public let conversations: [Summary]
    public var id: UUID { conversations[0].id }
    /// Its first conversation: the row's subject, and its words when none has a title.
    public var first: Summary { conversations[0] }
    /// The first title in the row, oldest first: a first conversation opened off topic and carried on after a day has none,
    /// though one carrying it on may. None: the row shows its first question's opening words.
    public var title: String? { conversations.lazy.compactMap(\.title).first }
    /// The one to carry on: in itself while `open`, else in a new one that continues it.
    public var last: Summary { conversations[conversations.count - 1] }
    /// Its questions, over all its conversations.
    public var asked: Int { conversations.reduce(0) { $0 + $1.n } }
    public func holds(_ conversation: UUID?) -> Bool { conversations.contains { $0.id == conversation } }

    /// What a conversation carrying this row on sends with its first question: what its first question sent. A fish-ID
    /// row's `about` is only for its picture: it sends `identified` alone.
    public var start: Start {
      Start(from: first.from ?? .search, about: first.from == .species ? first.about?.id : nil, identified: first.identified)
    }

    public init?(_ conversations: [Summary]) {
      guard !conversations.isEmpty else { return nil }
      self.conversations = conversations
    }
  }

  /// A page of the list: by their last question, newest first.
  public struct History: Sendable {
    public let rows: [Row]
    /// The next page's cursor, none on the last.
    public let next: String?
  }

  /// One conversation, to draw it again.
  public struct Past: Sendable {
    public struct Kept: Sendable {
      public let question: String
      public let asked: Date
      public let turn: Turn
      /// The turn as JSON, as a stream's `done` brings it: what the app keeps of an answer.
      public let data: String
    }
    public let id: UUID
    public let open: Bool
    /// In order. A stopped or failed question isn't among them, and a turn this app can't read is left out.
    public let turns: [Kept]
  }

  /// GET /api/chat/conversations: a page of the list; `about`, only the rows that started on that page.
  public static func conversations(before: String? = nil, limit: Int? = nil, about: String? = nil, site: URL, token: String, version: String,
                                   ownCopy: String?) -> URLRequest {
    var r = signed("api/chat/conversations", method: "GET", site: site, token: token, version: version, ownCopy: ownCopy)
    var items: [URLQueryItem] = []
    if let before { items.append(URLQueryItem(name: "before", value: before)) }
    if let limit { items.append(URLQueryItem(name: "limit", value: String(limit))) }
    if let about { items.append(URLQueryItem(name: "about", value: about)) }
    if !items.isEmpty, let u = r.url { r.url = u.appending(queryItems: items) }
    return r
  }

  /// GET /api/chat/conversations/{id}.
  public static func conversation(_ id: UUID, site: URL, token: String, version: String, ownCopy: String?) -> URLRequest {
    signed("api/chat/conversations/\(id.uuidString.lowercased())", method: "GET", site: site, token: token, version: version, ownCopy: ownCopy)
  }

  /// POST /api/chat/conversations/{id}/hide: the conversation's whole row, on all the reader's devices.
  public static func hide(_ id: UUID, site: URL, token: String, version: String, ownCopy: String?) -> URLRequest {
    signed("api/chat/conversations/\(id.uuidString.lowercased())/hide", method: "POST", site: site, token: token, version: version, ownCopy: ownCopy)
  }

  private static func signed(_ path: String, method: String, site: URL, token: String, version: String, ownCopy: String?) -> URLRequest {
    var r = status(site: site, version: version, ownCopy: ownCopy)
    r.url = site.appending(path: path)
    r.httpMethod = method
    r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    return r
  }

  public static func history(_ data: Data, status: Int) -> History? {
    guard status == 200, let o = object(data), let rows = o["rows"] as? [Any] else { return nil }
    return History(rows: rows.compactMap { row in
      Row(((row as? [String: Any])?["conversations"] as? [Any] ?? []).compactMap { ($0 as? [String: Any]).flatMap(summary) })
    }, next: o["next"] as? String)
  }

  public static func past(_ data: Data, status: Int) -> Past? {
    guard status == 200, let o = object(data), let id = (o["id"] as? String).flatMap(UUID.init(uuidString:)), let open = o["open"] as? Bool,
          let turns = o["turns"] as? [Any] else { return nil }
    return Past(id: id, open: open, turns: turns.compactMap { v in
      guard let k = v as? [String: Any], let question = k["question"] as? String, let asked = date(k["asked"]), let raw = k["turn"] as? [String: Any],
            let turn = turn(raw), let data = try? JSONSerialization.data(withJSONObject: raw) else { return nil }
      return Past.Kept(question: question, asked: asked, turn: turn, data: String(decoding: data, as: UTF8.self))
    })
  }

  /// The conversations a hide hid: every one in the row. None for an id the account doesn't hold.
  public static func hidden(_ data: Data, status: Int) -> [UUID]? {
    guard status == 200, let ids = object(data)?["hidden"] as? [String] else { return nil }
    return ids.compactMap(UUID.init(uuidString:))
  }

  private static func summary(_ o: [String: Any]) -> Summary? {
    guard let id = (o["id"] as? String).flatMap(UUID.init(uuidString:)), let question = o["question"] as? String, let started = date(o["started"]),
          let last = date(o["last"]), let n = o["n"] as? Int, let open = o["open"] as? Bool else { return nil }
    return Summary(id: id, question: question, title: (o["title"] as? String).flatMap { $0.isEmpty ? nil : $0 },
                   from: (o["from"] as? String).flatMap(From.init(rawValue:)), about: linked(o["about"]),
                   identified: identified(o["identified"]), started: started, last: last, n: n, open: open,
                   continues: (o["continues"] as? String).flatMap(UUID.init(uuidString:)))
  }

  private static func identified(_ v: Any?) -> Identified? {
    (v as? [String: Any]).flatMap { try? JSONSerialization.data(withJSONObject: $0) }.flatMap { try? JSONDecoder().decode(Identified.self, from: $0) }
  }

  /// The Worker's times, with or without their fraction of a second.
  private static func date(_ v: Any?) -> Date? {
    guard let s = v as? String else { return nil }
    return (try? Date(s, strategy: Date.ISO8601FormatStyle())) ?? (try? Date(s, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true)))
  }

  // MARK: The list's periods

  /// Which heading a row goes under: "Hôm nay", "Hôm qua", "7 ngày qua", "Trước đó".
  public enum Period: Sendable, Equatable, CaseIterable { case today, yesterday, week, earlier }

  /// By the reader's calendar days, not 24-hour spans; a time ahead of the phone's clock is today.
  public static func period(of date: Date, now: Date, calendar: Calendar = .current) -> Period {
    let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
    return switch days {
    case ...0: .today
    case 1: .yesterday
    case ...7: .week
    default: .earlier
    }
  }

  /// `rows` under their headings, by each row's last question: only the headings with rows, in order.
  public static func sections(_ rows: [Row], now: Date, calendar: Calendar = .current) -> [(period: Period, rows: [Row])] {
    Period.allCases.compactMap { p in
      let those = rows.filter { period(of: $0.last.last, now: now, calendar: calendar) == p }
      return those.isEmpty ? nil : (p, those)
    }
  }
}
