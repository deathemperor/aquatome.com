extension HandbookIndex {
  /// Guides in `items` that name any of these fish and plants (a tank's), the most of them first, in `items`' order
  /// among equals; at most `limit`. Video guides count (the index can't tell them apart yet); the "Khám phá" news (new
  /// arrivals in shops) doesn't, as the site's guide list leaves it out. A breed isn't in a guide's `about`, so a tank
  /// of breeds gets none. Counted and picked without a sort: a sort's code costs more than the feature's.
  public static func guides(about ids: [String], in items: [Item], limit: Int = 5) -> [Item] {
    let wanted = Set(ids)
    let named = items.map { i in i.kind == .guide && i.section != "discovery" ? i.about.filter(wanted.contains).count : 0 }
    var out: [Item] = []
    for n in stride(from: named.max() ?? 0, to: 0, by: -1) {
      for (i, c) in zip(items, named) where c == n {
        if out.count == limit { return out }
        out.append(i)
      }
    }
    return out
  }
}
