/// A search as the reader types it: the query, the kind picked, and what they find, searched again once for each
/// change. A new query or kind lists its best `page` (200), and `showMore` a page more, as the site's search page does.
public struct SearchState: Sendable {
  /// At least 1: a page of none would never list more.
  public let page: Int

  /// Cleared, the kind goes back to all: the next search starts with every kind, not one picked for the last. Putting it
  /// back searches, so that's the one search.
  public var query = "" {
    didSet {
      guard query != oldValue else { return }
      if query.isEmpty && kind != nil { kind = nil } else { limit = page; run() }
    }
  }
  public var kind: HandbookIndex.Kind? { didSet { if kind != oldValue { limit = page; run() } } }
  /// The pages searched: a new index searches again.
  public var search: HandbookSearch { didSet { run() } }
  /// What the list shows: the best `limit` of what the search found.
  public private(set) var results: [HandbookIndex.Item] = []
  /// How many pages the query finds of each kind, and in all under nil: what the chips say.
  public private(set) var counts: [HandbookIndex.Kind?: Int] = [:]
  /// How many searches it has run: one a change, which the tests count.
  public private(set) var runs = 0
  /// "Tất cả" picked and two kinds or more found: each kind's best three of all it found, past the list's 200 too, the
  /// kinds in the order of their best (Design's videos spec, 14 Nov). Otherwise none, and the list as it was.
  public private(set) var sections: [Section] = []

  public struct Section: Sendable, Equatable {
    public let kind: HandbookIndex.Kind
    public let items: [HandbookIndex.Item]
    /// All it found of the kind, as its chip says: "Xem tất cả" when more than `items`.
    public let count: Int
  }
  /// Every match of the kind picked, best first: a page more is the next part of it, with no search.
  private var found: [HandbookIndex.Item] = []
  private var limit: Int

  public init(_ search: HandbookSearch, page: Int = 200) {
    self.search = search
    self.page = max(1, page)
    limit = self.page
    run()
  }

  /// How many the kind picked finds that the list doesn't show yet.
  public var left: Int { found.count - results.count }

  public mutating func showMore() {
    limit += page
    results = Array(found.prefix(limit))
  }

  private mutating func run() {
    (found, counts) = search.findAndCount(query, kind: kind, limit: .max)
    results = Array(found.prefix(limit))
    sections = kind == nil && !query.isEmpty ? Self.sections(found, counts) : []
    runs += 1
  }

  private static func sections(_ found: [HandbookIndex.Item], _ counts: [HandbookIndex.Kind?: Int]) -> [Section] {
    guard counts.count > 2 else { return [] } // The total and at least two kinds.
    var byKind: [HandbookIndex.Kind: [HandbookIndex.Item]] = [:]
    var order: [HandbookIndex.Kind] = []
    for item in found {
      let kind = item.searchKind
      if byKind[kind] == nil { order.append(kind) }
      if byKind[kind, default: []].count < 3 { byKind[kind, default: []].append(item) }
    }
    return order.map { Section(kind: $0, items: byKind[$0, default: []], count: counts[$0, default: 0]) }
  }
}
