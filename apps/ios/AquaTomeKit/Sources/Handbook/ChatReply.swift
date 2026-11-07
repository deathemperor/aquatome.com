import Foundation

extension Chat {
  /// One question's answer as the chat screen draws it, from its stream's events (Chat.event) in order: the steps until
  /// the text starts (every step comes before it), the text as its pieces come, the blocks, then the whole turn, which
  /// replaces what streamed; or the error that ended it. Past either end, an event changes nothing.
  public struct Reply: Sendable {
    public private(set) var steps: [Step] = []
    public private(set) var text = ""
    public private(set) var blocks: [Block] = []
    public private(set) var turn: Turn?
    /// The stream's error (`failed`, `unavailable`, `resting`).
    public private(set) var error: String?
    /// The turn came whole, its text never streamed (a retry's replay: back from the background, the answer landed
    /// meanwhile): drawn at once, not written in.
    public private(set) var whole = false

    public init() {}

    /// The text has started: the steps fold.
    public var writing: Bool { !text.isEmpty }
    public var ended: Bool { turn != nil || error != nil }

    public mutating func take(_ e: Event) {
      guard !ended else { return }
      switch e {
      case .step(let s):
        if text.isEmpty { add(s) }
      case .text(let piece):
        text += piece
      case .block(let b):
        blocks.append(b)
      case .done(let t):
        whole = text.isEmpty
        turn = t
        text = t.text
        blocks = t.blocks
        steps = []
        t.steps.forEach { add($0) }
      case .error(let code):
        error = code
      }
    }

    /// Each page once a turn: Claude reads a page's outline, then a section of it.
    private mutating func add(_ s: Step) {
      if case .read(let p) = s, steps.contains(where: { if case .read(let q) = $0 { q.path == p.path } else { false } }) { return }
      steps.append(s)
    }
  }

  /// The one row the steps fold into once the text starts.
  public enum Fold: Sendable, Equatable {
    /// It read this many pages.
    case pages(Int)
    /// It only searched.
    case searched
    case tanks
    case mates
  }

  /// The fold's row for these steps: the pages read, when it read any; else, after searches only, the search; else the
  /// last other step. None with no steps.
  public static func fold(_ steps: [Step]) -> Fold? {
    let pages = Set(steps.compactMap { if case .read(let p) = $0 { p.path } else { nil } })
    if !pages.isEmpty { return .pages(pages.count) }
    switch steps.last(where: { if case .search = $0 { false } else { true } }) {
    case .tanks?: return .tanks
    case .mates?: return .mates
    default: return steps.isEmpty ? nil : .searched
    }
  }

  /// A part of an answer's text, as the screen sets it: plain text, or numbered steps ("1. …" lines) drawn as a list.
  public enum Para: Sendable, Equatable {
    case text(String)
    case list([Item])

    public struct Item: Sendable, Equatable {
      public let n: Int
      public let text: String
      public init(n: Int, text: String) { self.n = n; self.text = text }
    }
  }

  /// `text` in its parts: a blank line ends one; a line opening with a number and a full stop ("1. Thay 30% nước") is a
  /// step, and steps in a row are one list. Lines in a row that aren't steps stay one text, their line breaks kept.
  public static func paragraphs(_ text: String) -> [Para] {
    var out: [Para] = []
    var lines: [String] = []
    var items: [Para.Item] = []
    func end() {
      if !lines.isEmpty { out.append(.text(lines.joined(separator: "\n"))) }
      if !items.isEmpty { out.append(.list(items)) }
      (lines, items) = ([], [])
    }
    for raw in text.split(separator: "\n", omittingEmptySubsequences: false) {
      let line = raw.trimmingCharacters(in: .whitespaces)
      if line.isEmpty {
        end()
      } else if let m = line.wholeMatch(of: /(\d{1,2})\.\s+(.+)/), let n = Int(m.1) {
        if !lines.isEmpty { end() }
        items.append(Para.Item(n: n, text: String(m.2)))
      } else {
        if !items.isEmpty { end() }
        lines.append(line)
      }
    }
    end()
    return out
  }

  /// When a reader's day of questions starts again after `now`: the Worker counts days in UTC (api.ts), so the next
  /// midnight UTC (7:00 in Vietnam).
  public static func dayResets(after now: Date) -> Date {
    var utc = Calendar(identifier: .gregorian)
    utc.timeZone = TimeZone(identifier: "UTC")!
    return utc.date(byAdding: .day, value: 1, to: utc.startOfDay(for: now))!
  }
}
