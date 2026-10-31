import Foundation

/// The handbook index the site publishes for the app (/app/<lang>.json, apps/site/src/lib/app-index.ts): every page
/// of one language the app can search. The app opens the page itself in a web view.
public struct HandbookIndex: Codable, Sendable, Equatable {
  public let version: Int
  public let lang: String
  public let items: [Item]

  public enum Kind: String, Codable, Sendable, CaseIterable { case fish, plant, guide, glossary, tool }

  public struct Item: Codable, Sendable, Hashable, Identifiable {
    public let kind: Kind
    /// The page's content id (fish, plants): what a tank's `species[].id` / `plants[].id` hold.
    public let contentId: String?
    public let name: String
    /// Scientific name (fish, plants).
    public let sub: String?
    /// Other names.
    public let aka: [String]?
    /// The page: "/id/ikan/<slug>/".
    public let path: String
    public let img: String?
    public var id: String { path }

    enum CodingKeys: String, CodingKey { case kind, contentId = "id", name, sub, aka, path, img }

    public init(kind: Kind, contentId: String? = nil, name: String, sub: String? = nil, aka: [String]? = nil, path: String, img: String? = nil) {
      self.kind = kind; self.contentId = contentId; self.name = name; self.sub = sub; self.aka = aka; self.path = path; self.img = img
    }
  }

  public init(version: Int = 1, lang: String, items: [Item]) { self.version = version; self.lang = lang; self.items = items }
}

/// Searching the index the way readers type: without accents ("ca dia" finds "Cá đĩa"), any case, words in any order.
public struct HandbookSearch: Sendable {
  private struct Entry: Sendable {
    let item: HandbookIndex.Item
    let name: String
    let words: [Substring]
    let other: String
  }
  private let entries: [Entry]

  public init(_ items: [HandbookIndex.Item]) {
    entries = items.map { i in
      let name = Self.fold(i.name)
      return Entry(item: i, name: name, words: name.split(separator: " "), other: Self.fold(([i.sub ?? ""] + (i.aka ?? [])).joined(separator: " | ")))
    }
  }

  /// Lowercase, accents and tone marks removed, đ → d: "Cá Đĩa" → "ca dia".
  public static func fold(_ s: String) -> String {
    s.replacingOccurrences(of: "đ", with: "d").replacingOccurrences(of: "Đ", with: "d")
      .folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
      .lowercased()
  }

  /// Items with every word of `query` in their name, scientific name or other names, best first: the name itself, a
  /// name that starts with it, a word of the name that starts with it, the name containing it, then other names.
  /// An empty query lists everything of `kind` in name order.
  public func find(_ query: String, kind: HandbookIndex.Kind? = nil, limit: Int = 200) -> [HandbookIndex.Item] {
    let q = Self.fold(query).trimmingCharacters(in: .whitespaces)
    let pool = entries.filter { kind == nil || $0.item.kind == kind }
    guard !q.isEmpty else {
      return Array(pool.sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending }.prefix(limit).map(\.item))
    }
    let words = q.split(separator: " ")
    let ranked: [(rank: Int, entry: Entry)] = pool.compactMap { e in
      guard words.allSatisfy({ e.name.contains($0) || e.other.contains($0) }) else { return nil }
      let rank = e.name == q ? 0
        : e.name.hasPrefix(q) ? 1
        : e.words.contains(where: { $0.hasPrefix(words[0]) }) && e.name.contains(q) ? 2
        : e.name.contains(q) ? 3
        : 4
      return (rank, e)
    }
    return Array(ranked.sorted { ($0.rank, $0.entry.name.count, $0.entry.name) < ($1.rank, $1.entry.name.count, $1.entry.name) }
      .prefix(limit).map(\.entry.item))
  }
}
