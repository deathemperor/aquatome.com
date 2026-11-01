import Foundation

/// The handbook arranged to browse, as the site arranges it: fish by group, plants by where they go in a tank, guides
/// by subject, the glossary by letter, and what the site's home page leads with. Worked out once per index.
public struct HandbookShelves: Sendable {
  /// One way into a kind: its key ("tetras", "foreground", "setup"), the site's word for it, how many pages it holds,
  /// and a photo for it when the site picked one.
  public struct Shelf: Hashable, Sendable, Identifiable {
    public let key: String
    public let label: String
    public let count: Int
    public let img: String?
    public var id: String { key }
  }

  /// The fish groups, as the site's home orders them (the biggest first), then "other" for every fish of no group the
  /// site names; each with its fish.
  public let groups: [Shelf]
  /// Where plants go, front to back, then on wood and floating.
  public let placements: [Shelf]
  /// The guides' subjects, as the site's guide list orders them.
  public let sections: [Shelf]
  /// What the site's home page leads with.
  public let featuredFish: [HandbookIndex.Item]
  public let easyPlants: [HandbookIndex.Item]
  public let firstGuides: [HandbookIndex.Item]

  private let byKind: [HandbookIndex.Kind: [HandbookIndex.Item]]
  /// The index's language: the glossary's letters go as it sorts them.
  private let lang: String

  /// The site's orders for keys whose words come as a map (a newer key goes after these, by name).
  static let placementOrder = ["foreground", "midground", "background", "epiphyte", "floating"]
  static let sectionOrder = ["setup", "care", "plantCare", "aquascaping", "breeding", "disease"]
  /// The shops' news ("Khám phá"): guides in the index, but not in the site's guide list, so not on these shelves.
  static let news = "discovery"
  /// The group fish go in when the site names none for them.
  public static let otherGroup = "other"

  public init(_ ix: HandbookIndex) {
    var byKind = Dictionary(grouping: ix.items, by: \.kind)
    byKind[.guide]?.removeAll { $0.section == Self.news }
    self.byKind = byKind
    lang = ix.lang
    let words = ix.labels
    let byPath = Dictionary(ix.items.map { ($0.path, $0) }, uniquingKeysWith: { a, _ in a })
    let fish = byKind[.fish] ?? []
    let plants = byKind[.plant] ?? []
    let guides = byKind[.guide] ?? []

    // Groups: the site's tiles first, then the rest of the groups it has words for, then "other".
    let groupCounts = Dictionary(grouping: fish.filter { $0.group != nil }, by: { Self.group(of: $0, words) }).mapValues(\.count)
    let tiles = ix.home?.groups ?? []
    var keys = tiles.map(\.id).filter { $0 != Self.otherGroup }
    keys += groupCounts.keys.filter { !keys.contains($0) && $0 != Self.otherGroup }.sorted()
    keys.append(Self.otherGroup)
    let img = Dictionary(tiles.map { ($0.id, $0.img) }, uniquingKeysWith: { a, _ in a })
    groups = keys.compactMap { k in
      guard let n = groupCounts[k], n > 0 else { return nil }
      return Shelf(key: k, label: words["group", k] ?? k, count: n, img: img[k] ?? nil)
    }

    let placementCounts = plants.reduce(into: [String: Int]()) { n, p in for k in Set(p.plant?.placement ?? []) { n[k, default: 0] += 1 } }
    placements = Self.ordered(placementCounts, Self.placementOrder).map { Shelf(key: $0, label: words["placement", $0] ?? $0, count: placementCounts[$0]!, img: nil) }

    let sectionCounts = Dictionary(grouping: guides.compactMap(\.section), by: { $0 }).mapValues(\.count)
    sections = Self.ordered(sectionCounts, Self.sectionOrder).map { Shelf(key: $0, label: words["section", $0] ?? $0, count: sectionCounts[$0]!, img: nil) }

    let home = ix.home ?? HandbookIndex.Home()
    featuredFish = home.fish.compactMap { byPath[$0] }
    easyPlants = home.plants.compactMap { byPath[$0] }
    firstGuides = home.guides.compactMap { byPath[$0] }
  }

  /// Every page of a kind, in the index's order (fish: the site's list order, the well-known ones first).
  public func all(_ kind: HandbookIndex.Kind) -> [HandbookIndex.Item] { byKind[kind] ?? [] }

  /// The fish of one group ("other": those of no group the site names), in the site's list order.
  public func fish(group: String, _ words: HandbookIndex.Labels) -> [HandbookIndex.Item] {
    all(.fish).filter { $0.group != nil && Self.group(of: $0, words) == group }
  }

  public func plants(placement: String) -> [HandbookIndex.Item] { all(.plant).filter { $0.plant?.placement.contains(placement) == true } }

  public func guides(section: String) -> [HandbookIndex.Item] { all(.guide).filter { $0.section == section } }

  /// The glossary under its first letters, as the index's language sorts them (Vietnamese: Đ after D), each letter once.
  public func glossary() -> [(letter: String, items: [HandbookIndex.Item])] {
    let locale = Locale(identifier: lang)
    let sorted = all(.glossary).sorted { $0.name.compare($1.name, options: [.caseInsensitive], locale: locale) == .orderedAscending }
    var out: [(letter: String, items: [HandbookIndex.Item])] = []
    var at: [String: Int] = [:]
    for item in sorted {
      let letter = Self.letter(item.name, locale)
      if let i = at[letter] { out[i].items.append(item) } else { at[letter] = out.count; out.append((letter, [item])) }
    }
    return out
  }

  /// A fish's group, or "other" for one the site has no word for.
  static func group(of item: HandbookIndex.Item, _ words: HandbookIndex.Labels) -> String {
    guard let g = item.group, g != otherGroup, words["group", g] != nil || words.words["group"] == nil else { return otherGroup }
    return g
  }

  /// A name's first letter without its marks: "Ánh sáng" → "A", "Đệm pH" → "Đ", "ค่า pH" → "ค". A Thai vowel written
  /// before its consonant (เ แ โ ใ ไ) is passed over, as Thai sorts by the consonant: "ไนเตรต" → "น".
  static func letter(_ name: String, _ locale: Locale) -> String {
    guard let c = name.unicodeScalars.first(where: { !(0x0E40...0x0E44).contains($0.value) }) else { return "#" }
    // One scalar: a Thai tone or vowel mark after it isn't part of the letter.
    let s = String(c).uppercased(with: locale)
    return s == "Đ" ? s : s.folding(options: .diacriticInsensitive, locale: locale)
  }

  /// Keys in the site's order, then any newer ones by name.
  private static func ordered(_ counts: [String: Int], _ order: [String]) -> [String] {
    order.filter { counts[$0] != nil } + counts.keys.filter { !order.contains($0) }.sorted()
  }
}
