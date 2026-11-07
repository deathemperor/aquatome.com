import Foundation

/// The chat (protocols/chat.openapi.json): a reader's questions about a fish, a plant or their tank, asked as their
/// aquatome.com account, answered by Claude from the handbook (apps/site/worker/chat/). An answer streams (ServerEvents):
/// what the agent looked at (`step`), the text in pieces, the blocks the Worker filled from our data, then the whole turn
/// (`done`), which replaces what streamed, or `error`. Read leniently, as fish ID's answer is: an event, block or figure
/// this app doesn't know or can't read is left out, not the turn.
public enum Chat {
  /// What GET says: whether the chat is on, every key resting, and its limits.
  public struct Status: Sendable, Equatable {
    public let on: Bool
    public let resting: Bool
    /// Questions a day for an account.
    public let perAccount: Int?
    /// Questions in one conversation.
    public let maxTurns: Int?
    /// The longest question, in characters.
    public let maxChars: Int?
  }

  // MARK: Where a chat starts

  public enum From: String, Sendable, Hashable { case fishId = "fish-id", species, search }

  /// Fish ID's answer, handed to the chat's first question: its verdict and guesses, most likely first. Never the photo.
  public struct Identified: Sendable, Hashable {
    public struct Guess: Sendable, Hashable {
      public let scientificName: String
      /// The guess's page, when it has one.
      public let id: String?
      public let confidence: Double
      public init(scientificName: String, id: String?, confidence: Double) {
        self.scientificName = scientificName; self.id = id; self.confidence = confidence
      }
    }
    public let verdict: String
    public let results: [Guess]
    public init(verdict: String, results: [Guess]) { self.verdict = verdict; self.results = results }

    /// Fish ID's identification as the contract takes it: three guesses at most, names no longer than 100 characters, a
    /// guess's id its page's (a breed's, else the species' or plant's).
    public init(_ f: FishId.Identification) {
      verdict = f.verdict
      results = f.results.prefix(3).map { g in
        Guess(scientificName: String(g.scientificName.prefix(100)), id: g.page.map { String($0.id.prefix(100)) }, confidence: g.confidence)
      }
    }
  }

  /// Where a chat starts: what its first question carries.
  public struct Start: Sendable, Hashable {
    public let from: From
    /// The page it starts from, by its id as fish ID links one (a species, breed or plant).
    public let about: String?
    public let identified: Identified?
    public init(from: From, about: String? = nil, identified: Identified? = nil) {
      self.from = from; self.about = about; self.identified = identified
    }
  }

  // MARK: The answer

  /// A species', breed's or plant's page, as fish ID links one.
  public struct Linked: Sendable, Hashable {
    public let id: String
    /// "species", "breed" or "plant".
    public let kind: String
    public let name: String
    public let sci: String?
    /// Its path in the reader's language ("/vi/ca/ca-neon-xanh/"): nil when it has none there, or the answer gives one
    /// that isn't this site's.
    public let path: String?
    /// Its photo, on our media host (https only).
    public let img: URL?
  }

  /// A fish's, breed's or plant's card: a species' or breed's figures, or a plant's, as the app index has them.
  public struct Card: Sendable, Hashable {
    public let page: Linked
    public let facts: HandbookIndex.Facts?
    public let plant: HandbookIndex.Plant?
  }

  /// A handbook page, in the reader's language.
  public struct PageRef: Sendable, Hashable {
    /// "guide", "fish", "plant", "glossary", "video" or "equipment".
    public let kind: String
    public let title: String
    public let path: String
  }

  /// A tool, filled from the conversation: its page with its inputs in the query, as the page reads them.
  public struct Tool: Sendable, Hashable {
    /// "tank-mates", "tank-volume" or "tank-budget".
    public let tool: String
    /// The tool's short name, as its card on the tools page has it.
    public let name: String
    /// Its path and query ("/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:6").
    public let path: String
  }

  /// One block of a turn, in the order to show them.
  public enum Block: Sendable {
    case species(Card)
    /// Two to four, side by side.
    case compare([Card])
    /// One section of a page: the heading Claude picked (nil: the page's opening) and every block under it, from the
    /// app's copy of the page; never a heading among them.
    case section(page: PageRef, heading: (text: String, id: String)?, blocks: [PageDoc.Block])
    case tool(Tool)
  }

  /// One thing the agent did.
  public enum Step: Sendable, Hashable {
    /// It searched the handbook: Claude's own words, to show as text.
    case search(String)
    /// It opened a page.
    case read(PageRef)
    /// It read the reader's synced tanks.
    case tanks
  }

  /// A whole answer.
  public struct Turn: Sendable {
    public let conversation: UUID
    /// The question's number in its conversation, from 1.
    public let n: Int
    public let text: String
    public let blocks: [Block]
    /// Next questions, a chip each.
    public let suggestions: [String]
    /// false: the handbook doesn't cover the question; the text says so, the blocks hold the nearest page.
    public let covered: Bool
    public let steps: [Step]
  }

  /// A stream's event, by its name.
  public enum Event: Sendable {
    case step(Step)
    /// The next piece of the text.
    case text(String)
    case block(Block)
    /// The whole turn: it replaces what streamed.
    case done(Turn)
    /// No answer: `failed` (counted), `unavailable` or `resting` (the reader's count given back).
    case error(String)
  }

  /// A request the Worker refused, not a stream.
  public enum Refusal: Sendable, Equatable {
    /// The account's session is over: the reader signs in again.
    case signedOut
    /// With the Worker's code (`rate` with the reader's limit, `busy`, `resting`, `chat_off`, `ended`, `answering`, `too
    /// long`, …), or `failed` for an answer that isn't the contract's.
    case refused(String, limit: Int?)
  }

  // MARK: Requests

  /// The model's own limit on a turn: the contract's 60 s for the client (a turn ends on the Worker within 30).
  public static let turnSeconds: Double = 60

  /// GET /api/chat.
  public static func status(site: URL, version: String, ownCopy: String?) -> URLRequest {
    var r = URLRequest(url: site.appending(path: "api/chat"))
    r.httpShouldHandleCookies = false
    // The app as `Readers` and fish ID name it, with our own copies' mark after it.
    r.setValue(["AquaTome-iOS/\(version)", ownCopy].compactMap { $0 }.joined(separator: " "), forHTTPHeaderField: "User-Agent")
    return r
  }

  /// POST /api/chat as the account, asking for the stream: one question in `conversation`, `start` with its first only.
  /// `key` is the question's: the same again for a retry of it (back from the background mid-answer), which gets its
  /// turn, counted once.
  public static func ask(_ question: String, conversation: UUID, lang: String, start: Start?, key: UUID, site: URL, token: String,
                         version: String, ownCopy: String?) -> URLRequest {
    var r = status(site: site, version: version, ownCopy: ownCopy)
    r.httpMethod = "POST"
    // A limit on the time between bytes, not on the turn: the Worker pings every 10 s, and the model ends a turn at
    // `turnSeconds`. Above it, so the turn's limit is what ends one; not URLRequest's own 60, so a test can tell it set.
    r.timeoutInterval = 65
    r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    r.setValue("text/event-stream", forHTTPHeaderField: "Accept")
    r.setValue(key.uuidString.lowercased(), forHTTPHeaderField: "Idempotency-Key")
    var body: [String: Any] = ["conversation": conversation.uuidString.lowercased(), "question": question, "lang": lang]
    if let start {
      body["from"] = start.from.rawValue
      if let about = start.about { body["about"] = about }
      if let i = start.identified {
        body["identified"] = ["verdict": i.verdict, "results": i.results.map { g -> [String: Any] in
          var o: [String: Any] = ["scientificName": g.scientificName, "confidence": g.confidence]
          if let id = g.id { o["id"] = id }
          return o
        }]
      }
    }
    r.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
    return r
  }

  // MARK: Answers

  public static func status(_ data: Data, status: Int) -> Status? {
    guard status == 200, let o = object(data), let on = o["on"] as? Bool else { return nil }
    return Status(on: on, resting: o["resting"] as? Bool ?? false, perAccount: o["perAccount"] as? Int, maxTurns: o["maxTurns"] as? Int,
                  maxChars: o["maxChars"] as? Int)
  }

  /// A refused request's answer (any status but a stream's 200).
  public static func refusal(_ data: Data, status: Int) -> Refusal {
    let o = object(data)
    let code = o?["error"] as? String
    if status == 401 && code == "session" { return .signedOut }
    return .refused(code ?? "failed", limit: o?["limit"] as? Int)
  }

  /// A stream's event, or nil for one this app doesn't know or can't read (a newer event, a block of a newer `t`).
  public static func event(_ e: ServerEvent) -> Event? {
    guard let o = object(Data(e.data.utf8)) else { return nil }
    switch e.name {
    case "step": return step(o).map(Event.step)
    case "text": return (o["text"] as? String).map(Event.text)
    case "block": return block(o).map(Event.block)
    case "done": return turn(o).map(Event.done)
    case "error": return (o["error"] as? String).map(Event.error)
    default: return nil
    }
  }

  private static func object(_ data: Data) -> [String: Any]? { (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] }

  private static func turn(_ o: [String: Any]) -> Turn? {
    guard let c = (o["conversation"] as? String).flatMap(UUID.init(uuidString:)), let n = o["n"] as? Int, let text = o["text"] as? String,
          let covered = o["covered"] as? Bool else { return nil }
    return Turn(conversation: c, n: n, text: text, blocks: (o["blocks"] as? [Any] ?? []).compactMap { ($0 as? [String: Any]).flatMap(block) },
                suggestions: (o["suggestions"] as? [Any] ?? []).compactMap { $0 as? String }.prefix(3).map { $0 }, covered: covered,
                steps: (o["steps"] as? [Any] ?? []).compactMap { ($0 as? [String: Any]).flatMap(step) })
  }

  private static func step(_ o: [String: Any]) -> Step? {
    switch o["kind"] as? String {
    case "search": (o["query"] as? String).map(Step.search)
    case "read": page(o["page"]).map(Step.read)
    case "tanks": .tanks
    default: nil
    }
  }

  private static func block(_ o: [String: Any]) -> Block? {
    switch o["t"] as? String {
    case "species":
      return card(o).map(Block.species)
    case "compare":
      let items = (o["items"] as? [Any] ?? []).compactMap { ($0 as? [String: Any]).flatMap(card) }
      return items.count >= 2 ? .compare(items) : nil
    case "section":
      guard let page = page(o["page"]), let raw = o["blocks"] as? [Any] else { return nil }
      let h = o["heading"] as? [String: Any]
      let heading = (h?["text"] as? String).flatMap { text in (h?["id"] as? String).map { (text: text, id: $0) } }
      // Never a heading in it (the contract's rule): one would start another section.
      let blocks = raw.map(PageDoc.Block.read).filter { $0.t != "h" }
      return blocks.isEmpty ? nil : .section(page: page, heading: heading, blocks: blocks)
    case "tool":
      guard let tool = o["tool"] as? String, let name = o["name"] as? String, let path = own(o["url"]) else { return nil }
      return .tool(Tool(tool: tool, name: name, path: path))
    default:
      return nil
    }
  }

  private static func card(_ o: [String: Any]) -> Card? {
    guard let p = o["page"] as? [String: Any], let id = p["id"] as? String, let kind = p["kind"] as? String, let name = p["name"] as? String else { return nil }
    let img = (p["img"] as? String).flatMap { $0.hasPrefix("https://") ? URL(string: $0) : nil }
    func decoded<T: Decodable>(_ key: String) -> T? {
      (o[key]).flatMap { try? JSONSerialization.data(withJSONObject: $0) }.flatMap { try? JSONDecoder().decode(T.self, from: $0) }
    }
    return Card(page: Linked(id: id, kind: kind, name: name, sci: p["sci"] as? String, path: own(p["url"]), img: img),
                facts: decoded("facts"), plant: decoded("plant"))
  }

  private static func page(_ v: Any?) -> PageRef? {
    guard let o = v as? [String: Any], let kind = o["kind"] as? String, let title = o["title"] as? String, let path = own(o["url"]) else { return nil }
    return PageRef(kind: kind, title: title, path: path)
  }

  /// Only this site's own pages, in one of its languages, whatever the answer holds.
  private static func own(_ v: Any?) -> String? {
    (v as? String).flatMap { ["/vi/", "/id/", "/th/"].contains(String($0.prefix(4))) ? $0 : nil }
  }

  // MARK: The conversation

  /// A conversation as the app keeps it: its id, made when the chat opens, under the account that asks. A question goes in
  /// a new one when another account asks, or 24 hours after its first question (the Worker's own limit: past it, 410). An
  /// answer numbered 1 over earlier turns says the Worker no longer holds them: it is a new conversation from there.
  public struct Conversation: Sendable, Equatable {
    public static let lasts: TimeInterval = 24 * 60 * 60
    public private(set) var id: UUID
    public private(set) var account: String
    /// When its first question was asked.
    public private(set) var started: Date?
    /// The questions answered in it.
    public private(set) var turns = 0

    public init(account: String, id: UUID = UUID()) { self.account = account; self.id = id }

    /// Whether a question asked now, as `account`, can't go in this conversation.
    public func ended(account: String, now: Date) -> Bool {
      account != self.account || started.map { now.timeIntervalSince($0) >= Self.lasts } == true
    }

    /// A question asked: the first one starts its 24 hours.
    public mutating func asked(at now: Date) { if started == nil { started = now } }

    /// A turn answered, numbered `n`: true when it starts the conversation again on the Worker (1, over earlier turns),
    /// its 24 hours counted from `now`.
    public mutating func answered(n: Int, at now: Date) -> Bool {
      let anew = n == 1 && turns > 0
      if anew { started = now }
      turns = n
      return anew
    }
  }
}
