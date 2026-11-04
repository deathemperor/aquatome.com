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
    runs += 1
  }
}
