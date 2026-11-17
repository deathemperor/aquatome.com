/// The index's items found by a key (a path, a content id): the index's own list, shared (an array isn't copied while no
/// one changes it), and each key's place in it. A table of items by key held a second copy of every item: two of them,
/// by path and by content id, were about 1 MB each with 800 fish. With the site's index the list they share is now
/// kept for them (it was freed once the tables were built), about 40% of one old table.
/// The first item with a key wins; an item without one isn't found by it.
public struct ItemsByKey: Sendable {
  private let items: [HandbookIndex.Item]
  private let at: [String: Int]

  public init(_ items: [HandbookIndex.Item], key: (HandbookIndex.Item) -> String?) {
    self.items = items
    var at: [String: Int] = [:]
    at.reserveCapacity(items.count)
    for (i, item) in items.enumerated() {
      if let k = key(item), at[k] == nil { at[k] = i }
    }
    self.at = at
  }

  public subscript(_ key: String) -> HandbookIndex.Item? { at[key].map { items[$0] } }
}
