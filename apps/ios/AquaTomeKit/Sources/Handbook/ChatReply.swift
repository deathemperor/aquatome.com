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
  /// While the text is `streaming`, a last line that is only a number (with or without its full stop: a piece ended on
  /// "\n2.") waits for the next piece, so it never shows as a paragraph and then turns into a step.
  public static func paragraphs(_ text: String, streaming: Bool = false) -> [Para] {
    var out: [Para] = []
    var lines: [String] = []
    var items: [Para.Item] = []
    func end() {
      if !lines.isEmpty { out.append(.text(lines.joined(separator: "\n"))) }
      if !items.isEmpty { out.append(.list(items)) }
      (lines, items) = ([], [])
    }
    var raws = text.split(separator: "\n", omittingEmptySubsequences: false)
    if streaming, let last = raws.last, last.trimmingCharacters(in: .whitespaces).wholeMatch(of: /\d{1,2}\.?/) != nil { raws.removeLast() }
    for raw in raws {
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

extension Chat {
  /// The pieces of a streaming answer still fading in: where each starts in the text (in UTF-16) and when it came. A
  /// piece is what the text gained between two draws, so pieces coming within one frame fade in as one. Only their
  /// opacity changes, never the text laid out, so the words already there don't move or flicker, and `done`, the same
  /// text, changes nothing.
  public struct Pieces: Sendable {
    public static let fade: TimeInterval = 0.15
    private var list: [(at: Int, came: Date)] = []

    public init() {}

    public var isEmpty: Bool { list.isEmpty }
    /// When the newest piece came: its fade, the last, ends `fade` later.
    public var newest: Date? { list.last?.came }

    /// The text went from `old` to `new` at `now`. The same text (done's) changes nothing; only a piece added to the end
    /// fades in; anything else, or text not `fading` (drawn at once), ends every fade. Compared by scalars: a piece may
    /// start inside a letter (its marks).
    public mutating func changed(from old: String, to new: String, at now: Date, fading: Bool) {
      if new.unicodeScalars.elementsEqual(old.unicodeScalars) { return }
      guard fading, new.unicodeScalars.starts(with: old.unicodeScalars) else {
        list = []
        return
      }
      settle(at: now)
      list.append((old.utf16.count, now))
    }

    /// Fades over by `now` are let go.
    public mutating func settle(at now: Date) { list.removeAll { now.timeIntervalSince($0.came) >= Self.fade } }

    /// A run of words drawn at one opacity.
    public struct Run: Sendable, Equatable {
      public let words: String
      public let opacity: Double
      public init(_ words: String, _ opacity: Double = 1) { self.words = words; self.opacity = opacity }
    }

    /// Each part's words (a paragraph's, or a step's, as `paragraphs` left them), in order, cut where the pieces still
    /// fading at `now` start. A part's lines are found in `text` in order, since `paragraphs` trims them and takes a
    /// step's number off; a line not found is drawn whole.
    public func runs(of parts: [String], in text: String, at now: Date) -> [[Run]] {
      let fading = list.map { (at: $0.at, opacity: max(0, now.timeIntervalSince($0.came)) / Self.fade) }.filter { $0.opacity < 1 }
      guard !fading.isEmpty else { return parts.map { [Run($0)] } }
      var cursor = text.startIndex
      return parts.map { words in
        var out: [Run] = []
        func add(_ s: String, _ opacity: Double) {
          guard !s.isEmpty else { return }
          if let last = out.last, last.opacity == opacity { out[out.count - 1] = Run(last.words + s, opacity) } else { out.append(Run(s, opacity)) }
        }
        for (k, line) in words.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
          if k > 0 { add("\n", out.last?.opacity ?? 1) }
          guard let r = text.range(of: line, options: .literal, range: cursor..<text.endIndex) else {
            add(String(line), 1)
            continue
          }
          cursor = r.upperBound
          let start = text.utf16.distance(from: text.startIndex, to: r.lowerBound)
          let u = Array(line.utf16)
          var from = 0, opacity = 1.0
          for f in fading where f.at < start + u.count {
            let cut = max(from, f.at - start)
            add(String(decoding: u[from..<cut], as: UTF16.self), opacity)
            (from, opacity) = (cut, f.opacity)
          }
          add(String(decoding: u[from...], as: UTF16.self), opacity)
        }
        return out
      }
    }
  }
}
