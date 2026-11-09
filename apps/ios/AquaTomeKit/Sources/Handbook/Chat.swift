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

  public enum From: String, Sendable, Hashable, Codable { case fishId = "fish-id", species, search }

  /// Fish ID's answer, handed to the chat's first question: its verdict and guesses, most likely first. Never the photo.
  public struct Identified: Sendable, Hashable, Codable {
    public struct Guess: Sendable, Hashable, Codable {
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

    /// The contract's verdicts.
    static let verdicts: Set = ["fish", "plant", "other", "unclear"]

    /// Fish ID's identification as the contract takes it, or nil for a verdict it doesn't have: three guesses at most,
    /// names no longer than 100 UTF-16 units (as the Worker counts them, cut between letters), a guess's id its page's (a
    /// breed's, else the species' or plant's) and none when longer than that (cut, it would name no page), a confidence
    /// no lower than 0.
    public init?(_ f: FishId.Identification) {
      guard Self.verdicts.contains(f.verdict) else { return nil }
      verdict = f.verdict
      results = f.results.prefix(3).map { g in
        Guess(scientificName: Self.cut(g.scientificName, 100), id: g.page.flatMap { $0.id.utf16.count <= 100 ? $0.id : nil },
              confidence: g.confidence.isFinite ? max(0, g.confidence) : 0)
      }
    }

    /// The letters of `s` that fit in `max` UTF-16 units.
    static func cut(_ s: String, _ max: Int) -> String {
      var out = "", n = 0
      for c in s {
        n += c.utf16.count
        if n > max { break }
        out.append(c)
      }
      return out
    }
  }

  /// Where a chat starts: what its first question carries.
  public struct Start: Sendable, Hashable, Codable {
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

  /// A tool, filled from the conversation: its page with its inputs in the query, as the page reads them; for the
  /// tank-mates tool, also the check Claude read and the reader's tank it was of.
  public struct Tool: Sendable, Hashable {
    /// "tank-mates", "tank-volume" or "tank-budget".
    public let tool: String
    /// The tool's short name, as its card on the tools page has it.
    public let name: String
    /// Its path and query ("/vi/cong-cu/nuoi-chung/?ca=ca-neon-xanh:6"). None for a tank-mates check the tool's page
    /// can't hold (past six kinds, a tank saved as litres): the reader's tank opens instead, or nothing.
    public let path: String?
    /// The tank-mates check, as JSON of the tool's own shape (TankCheck reads it); none from an older Worker or for one
    /// fish.
    public let check: Data?
    /// The reader's tank it checked.
    public let tank: CheckedTank?

    public init(tool: String, name: String, path: String?, check: Data? = nil, tank: CheckedTank? = nil) {
      self.tool = tool; self.name = name; self.path = path; self.check = check; self.tank = tank
    }
  }

  /// The reader's saved tank a tank-mates check was of: its fish as saved, and those the reader would add (not saved).
  public struct CheckedTank: Sendable, Hashable {
    public struct Fish: Sendable, Hashable {
      public let name: String
      public let count: Int?
      public init(name: String, count: Int?) { self.name = name; self.count = count }
    }
    public let id: String
    public let name: String
    /// Its inside length, width and height in cm, when saved.
    public let dims: [Double]?
    public let litres: Double?
    public let fish: [Fish]
    public let added: [Fish]
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
    /// It checked fish together, as the tank-mates tool does.
    case mates
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

  /// GET /api/chat, as the account when signed in (`token`): chat may be on for some accounts alone (the owner's, at
  /// first), and off to everyone else.
  public static func status(site: URL, version: String, ownCopy: String?, token: String? = nil) -> URLRequest {
    var r = URLRequest(url: site.appending(path: "api/chat"))
    r.httpShouldHandleCookies = false
    // The app as `Readers` and fish ID name it, with our own copies' mark after it.
    r.setValue(["AquaTome-iOS/\(version)", ownCopy].compactMap { $0 }.joined(separator: " "), forHTTPHeaderField: "User-Agent")
    if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
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

  /// A stream's event, or nil for one this app doesn't know or can't read (a newer event, a block of a newer `t`). A
  /// `done` or `error` it can't read ends the turn all the same, as `error("failed")`. A stream that ends with neither
  /// was cut short (the connection, or the reading stopped): ask again with the same key, which gets the turn.
  public static func event(_ e: ServerEvent) -> Event? {
    let o = object(Data(e.data.utf8))
    switch e.name {
    case "step": return o.flatMap(step).map(Event.step)
    case "text": return (o?["text"] as? String).map(Event.text)
    case "block": return o.flatMap(block).map(Event.block)
    case "done": return o.flatMap(turn).map(Event.done) ?? .error("failed")
    case "error": return .error(o?["error"] as? String ?? "failed")
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
    case "mates": .mates
    default: nil
    }
  }

  private static func block(_ o: [String: Any]) -> Block? {
    switch o["t"] as? String {
    case "species":
      return card(o).map(Block.species)
    case "compare":
      // Two to four (the contract's): past four, the first four.
      let items = (o["items"] as? [Any] ?? []).compactMap { ($0 as? [String: Any]).flatMap(card) }.prefix(4)
      return items.count >= 2 ? .compare(Array(items)) : nil
    case "section":
      guard let page = page(o["page"]), let raw = o["blocks"] as? [Any] else { return nil }
      var heading: (text: String, id: String)?
      if let h = o["heading"], !(h is NSNull) {
        // A heading it can't read: not the page's opening, which the section would show as and open at.
        guard let h = h as? [String: Any], let text = h["text"] as? String, let id = h["id"] as? String else { return nil }
        heading = (text, id)
      }
      // Up to a heading, never one (the contract's rule): one would start another section, which isn't this one.
      let blocks = raw.prefix { ($0 as? [String: Any])?["t"] as? String != "h" }.map(PageDoc.Block.read)
      return blocks.isEmpty ? nil : .section(page: page, heading: heading, blocks: blocks)
    case "tool":
      guard let tool = o["tool"] as? String, let name = o["name"] as? String else { return nil }
      let path = own(o["url"])
      // A link that isn't this site's own: not a tool to open. Only a tank-mates check goes without one.
      guard path != nil || (o["url"] == nil && tool == "tank-mates") else { return nil }
      let check = (o["check"] as? [String: Any]).flatMap { try? JSONSerialization.data(withJSONObject: $0) }
      return .tool(Tool(tool: tool, name: name, path: path, check: check, tank: (o["tank"] as? [String: Any]).flatMap(checkedTank)))
    default:
      return nil
    }
  }

  private static func checkedTank(_ o: [String: Any]) -> CheckedTank? {
    guard let id = o["id"] as? String, let name = o["name"] as? String else { return nil }
    func fish(_ v: Any?) -> [CheckedTank.Fish] {
      (v as? [Any] ?? []).compactMap { ($0 as? [String: Any]).flatMap { f in (f["name"] as? String).map { CheckedTank.Fish(name: $0, count: f["count"] as? Int) } } }
    }
    let d = o["dims"] as? [String: Any]
    let dims = d.flatMap { d in [d["l"], d["w"], d["h"]].map { ($0 as? NSNumber)?.doubleValue }.reduce([Double]()) { a, v in v.map { a + [$0] } ?? a } }
    return CheckedTank(id: id, name: name, dims: dims?.count == 3 ? dims : nil, litres: (o["litres"] as? NSNumber)?.doubleValue,
                       fish: fish(o["fish"]), added: fish(o["added"]))
  }

  private static func card(_ o: [String: Any]) -> Card? {
    guard let p = o["page"] as? [String: Any], let id = p["id"] as? String, let kind = p["kind"] as? String, let name = p["name"] as? String else { return nil }
    let img = (p["img"] as? String).flatMap { $0.hasPrefix("https://") ? URL(string: $0) : nil }
    func decoded<T: Decodable>(_ key: String) -> T? {
      // An object only: JSONSerialization raises (it can't throw) on a value that isn't one, as `null`.
      (o[key] as? [String: Any]).flatMap { try? JSONSerialization.data(withJSONObject: $0) }.flatMap { try? JSONDecoder().decode(T.self, from: $0) }
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
    // Vietnamese under "/vi/" or at the root, however the site then has it (PathForm).
    (v as? String).flatMap { SiteLanguage.of(path: PathForm.underVi.path($0)) != nil ? $0 : nil }
  }

  // MARK: The conversation

  /// A conversation as the app keeps it: its id, made when the chat opens, under the account that asks. A question goes in
  /// a new one when another account asks, or 24 hours after its first question (the Worker's own limit: past it, 410). An
  /// answer numbered 1 over earlier turns says the Worker no longer holds them: it is a new conversation from there.
  public struct Conversation: Sendable, Equatable, Codable {
    public static let lasts: TimeInterval = 24 * 60 * 60
    public private(set) var id: UUID
    public private(set) var account: String
    /// When its first answered question was asked: the Worker counts its 24 hours from then.
    public private(set) var started: Date?
    /// The questions answered in it.
    public private(set) var turns = 0
    /// The question being asked, when it was: nil once answered.
    private var asking: Date?

    public init(account: String, id: UUID = UUID()) { self.account = account; self.id = id }

    /// Whether a question asked now, as `account`, can't go in this conversation.
    public func ended(account: String, now: Date) -> Bool {
      account != self.account || started.map { now.timeIntervalSince($0) >= Self.lasts } == true
    }

    /// A question asked. A retry of it (the same key) isn't another.
    public mutating func asked(at now: Date) { if asking == nil { asking = now } }

    /// The question asked got no answer (refused, or its stream ended in an error): asked again, it goes with a new key,
    /// and is another question.
    public mutating func failed() { asking = nil }

    /// The question asked, answered as turn `n`: true when it starts the conversation again on the Worker (1, over
    /// earlier turns). The first answered starts the 24 hours, from when it was asked: a refused question starts none. The
    /// same answer again (a retry's replay) changes nothing.
    public mutating func answered(n: Int) -> Bool {
      guard let at = asking else { return false }
      asking = nil
      let anew = n == 1 && turns > 0
      if started == nil || anew { started = at }
      turns = n
      return anew
    }
  }
}
