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
    /// Where the fish is in `img`.
    public var imgBox: PhotoBox?
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
  /// Khám phá's longer lists (`HandbookIndex.Home.Browse`): the fish starting with those above in their order, the
  /// plants and guides Curation's, then the home's ranking; a list the index doesn't have, or that this app can't read,
  /// is the one above.
  public let browseFish: [HandbookIndex.Item]
  public let browsePlants: [HandbookIndex.Item]
  public let browseGuides: [HandbookIndex.Item]

  /// How many of its list each of Khám phá's shelves shows, after the pages shown above it: seven columns at most, as the
  /// App Store's shelves (the owner, 11 Nov: "Appstore gives up to 7 columns in total"); fish and plants three to a
  /// column, guides and video series one.
  public enum Shown {
    public static let columns = 7
    public static let fish = columns * 3
    public static let plants = columns * 3
    public static let guides = columns
    public static let videos = columns
    /// "Đã lưu để đọc sau": the first 21 saved, then "Xem tất cả" to them all.
    public static let saved = columns * 3
  }

  /// A shelf of `list`: the first `count` of it not among `shown` (the pages on a shelf above). Never more than the list
  /// holds, so a bigger drop leaves a shorter shelf rather than one filled from further down a ranking.
  public static func shelf(_ list: [HandbookIndex.Item], showing count: Int, after shown: Set<String>) -> [HandbookIndex.Item] {
    Array(list.lazy.filter { !shown.contains($0.path) }.prefix(count))
  }
  /// The editors' calendar for Hôm nay, by date ("2026-11-13", `HandbookIndex.Home.Day.key`), its pages found in the
  /// index. A date not here is the app's own to fill.
  public let plan: [String: Planned]
  /// The guides made from videos, in the index's order: on a shelf of their own, as the site keeps them off its guide
  /// list. (The series are `all(.video)`.)
  public let videoGuides: [HandbookIndex.Item]

  /// A day of the editors' calendar: its fish and the photo for its card, its guide and the photo for its card, and a
  /// story with the editors' words for it. A slot is empty when the day has none, or names a page the index doesn't list.
  public struct Planned: Sendable {
    public let fish: HandbookIndex.Item?
    public let img: String?
    public let imgBox: PhotoBox?
    public let guide: HandbookIndex.Item?
    public let guideImg: String?
    public let guideImgBox: PhotoBox?
    public let story: HandbookIndex.Item?
    public let words: HandbookIndex.Home.Day.Story?
  }

  private let byKind: [HandbookIndex.Kind: [HandbookIndex.Item]]
  /// The index's language: the glossary's letters go as it sorts them.
  private let lang: String
  /// The places with an origin page, and the site's words for the taxon and origin pages.
  private let places: [HandbookIndex.Place]
  private let words: HandbookIndex.Labels
  /// The form of the index's Vietnamese paths: a shelf's links are given in it.
  private let form: PathForm?

  /// The site's orders for keys whose words come as a map (a newer key goes after these, by name).
  static let placementOrder = ["foreground", "midground", "background", "epiphyte", "floating"]
  static let sectionOrder = ["setup", "care", "plantCare", "aquascaping", "breeding", "disease"]
  /// The shops' news ("Khám phá"): guides in the index, but not in the site's guide list, so not on these shelves.
  static let news = "discovery"
  /// The group fish go in when the site names none for them.
  public static let otherGroup = "other"

  public init(_ ix: HandbookIndex) {
    var byKind = Dictionary(grouping: ix.items, by: \.kind)
    videoGuides = (byKind[.guide] ?? []).filter { $0.video != nil }
    byKind[.guide]?.removeAll { $0.section == Self.news || $0.video != nil }
    self.byKind = byKind
    lang = ix.lang
    places = ix.places
    form = PathForm(ix)
    let words = ix.labels
    self.words = words
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
    let img = Dictionary(tiles.map { ($0.id, ($0.img, $0.imgBox)) }, uniquingKeysWith: { a, _ in a })
    groups = keys.compactMap { k in
      guard let n = groupCounts[k], n > 0 else { return nil }
      return Shelf(key: k, label: words["group", k] ?? k, count: n, img: img[k]?.0, imgBox: img[k]?.1)
    }

    let placementCounts = plants.reduce(into: [String: Int]()) { n, p in for k in Set(p.plant?.placement ?? []) { n[k, default: 0] += 1 } }
    placements = Self.ordered(placementCounts, Self.placementOrder).map { Shelf(key: $0, label: words["placement", $0] ?? $0, count: placementCounts[$0]!, img: nil) }

    let sectionCounts = Dictionary(grouping: guides.compactMap(\.section), by: { $0 }).mapValues(\.count)
    sections = Self.ordered(sectionCounts, Self.sectionOrder).map { Shelf(key: $0, label: words["section", $0] ?? $0, count: sectionCounts[$0]!, img: nil) }

    let home = ix.home ?? HandbookIndex.Home()
    featuredFish = home.fish.compactMap { byPath[$0] }
    easyPlants = home.plants.compactMap { byPath[$0] }
    firstGuides = home.guides.compactMap { byPath[$0] }
    browseFish = home.browse?.fish.map { $0.compactMap { byPath[$0] } } ?? featuredFish
    browsePlants = home.browse?.plants.map { $0.compactMap { byPath[$0] } } ?? easyPlants
    browseGuides = home.browse?.guides.map { $0.compactMap { byPath[$0] } } ?? firstGuides
    plan = Dictionary(home.days.map { d in
      let fish = d.fish.flatMap { byPath[$0] }, guide = d.guide.flatMap { byPath[$0] }, story = d.story.flatMap { byPath[$0.path] }
      return (d.date, Planned(fish: fish, img: fish == nil ? nil : d.img, imgBox: fish == nil ? nil : d.imgBox, guide: guide,
                              guideImg: guide == nil ? nil : d.guideImg, guideImgBox: guide == nil ? nil : d.guideImgBox,
                              story: story, words: story == nil ? nil : d.story))
    }, uniquingKeysWith: { a, _ in a })
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

  // MARK: Taxon and origin pages

  /// A taxon page (/vi/phan-loai/…) or an origin page (/vi/nguon-goc/…), as the app draws it: its heading, the line
  /// under it, the pages under it, and the fish it lists.
  public struct Page: Sendable {
    /// A page under this one: a lower rank's taxon with how many fish it lists, or a continent's country.
    public struct Link: Sendable, Identifiable {
      public let title: String
      public let path: String
      public let count: Int?
      /// A genus, written in italics as the site writes it.
      public let italic: Bool
      public var id: String { path }
    }
    public let kind: HandbookIndex.Kind
    /// The taxon's name, the place's own title or its name; the section's title for its first page.
    public let title: String
    /// A genus: in italics.
    public let italic: Bool
    /// The pages above it, from the section's first page down, as the site's trail above the heading: the way up.
    public let up: [Link]
    /// The site's line under the heading; nil on a section's first page (the app says what it lists).
    public let intro: String?
    public let links: [Link]
    /// A country's regions and rivers: words, with no page of their own.
    public let words: [String]
    /// The fish it lists, in the site's list order; none on a section's first page.
    public let fish: [HandbookIndex.Item]
    /// The page as an item, to open as the index's pages open (AppScreen's `.page`, a navigation value).
    public let item: HandbookIndex.Item
  }


  /// The taxon or origin page at `path` (a Vietnamese one under "/vi/" or at the root), when the index has what it lists
  /// in its own language; nil for any other path, a taxon none of its fish is in, or a place it has no page for: those
  /// open as the web page.
  public func page(at path: String) -> Page? {
    let end = path.firstIndex(where: { $0 == "?" || $0 == "#" }) ?? path.endIndex
    let parts = PathForm.underVi.path(String(path[..<end])).split(separator: "/").map { $0.lowercased() }
    // Its language's words for the two sections (SiteLanguage).
    guard parts.count >= 2, parts[0] == lang, let words = SiteLanguage.served(lang) else { return nil }
    let (taxa, origins) = (words.word("phan-loai"), words.word("nguon-goc"))
    let rest = Array(parts.dropFirst(2))
    switch parts[1] {
    case taxa: return taxon(rest)
    case origins: return origin(rest)
    default: return nil
    }
  }

  /// The taxon at `path`: its names down from the order, lowercased, a rank with no name skipped (as the site's
  /// addresses skip it: a family with no order is /vi/phan-loai/lymnaeidae/); none for the section's first page, which
  /// lists the orders.
  private func taxon(_ path: [String]) -> Page? {
    guard path.count <= 3, let title = words["taxon", "title"] else { return nil }
    // Fish with a taxonomy (breeds have none): the first page lists them by their first named rank.
    let fish = all(.fish).filter { f in
      let s = Self.steps(f)
      return s.count >= max(path.count, 1) && path.indices.allSatisfy { s[$0].name.lowercased() == path[$0] }
    }
    guard !fish.isEmpty else { return nil }
    // Its own rank, whatever its depth (Lymnaeidae is a family at /vi/phan-loai/lymnaeidae/); the rank below is the
    // next one, or the orders on the first page.
    let own = path.isEmpty ? nil : Self.steps(fish[0])[path.count - 1]
    let next = own.map { $0.rank + 1 } ?? 0
    // The next step down, as the site's page lists it: the most fish first, then the Latin name in plain character
    // order. One of a lower rank than that (a family with no order, among the orders) says its rank.
    var below: [String: (name: String, rank: Int, count: Int)] = [:]
    for f in fish {
      let s = Self.steps(f)
      guard s.count > path.count else { continue }
      let step = s[path.count]
      below[step.name.lowercased(), default: (step.name, step.rank, 0)].count += 1
    }
    let links = below.values.sorted { $0.count != $1.count ? $0.count > $1.count : $0.name < $1.name }.map { b in
      let word = b.rank == next ? nil : words["taxon", Self.ranks[b.rank]]
      return Page.Link(title: word.map { "\($0) \(b.name)" } ?? b.name, path: link(taxa: path + [b.name.lowercased()]), count: b.count,
                       italic: b.rank == 2)
    }
    let at = link(taxa: path)
    guard let step = own else {
      return Page(kind: .taxon, title: title, italic: false, up: [], intro: nil, links: links, words: [], fish: [],
                  item: .init(kind: .taxon, name: title, path: at))
    }
    let above = Self.steps(fish[0]).prefix(path.count - 1).enumerated().map { i, s in
      Page.Link(title: s.name, path: link(taxa: Array(path[...i])), count: nil, italic: s.rank == 2)
    }
    let up = [Page.Link(title: title, path: link(taxa: []), count: nil, italic: false)] + above
    let level = words["taxon", Self.ranks[step.rank]] ?? ""
    let intro = words["taxon", "intro"].map { fill($0, ["level": level, "name": step.name, "n": "\(fish.count)"]) }
    return Page(kind: .taxon, title: step.name, italic: step.rank == 2, up: up, intro: intro, links: links, words: [], fish: fish,
                item: .init(kind: .taxon, name: step.name, path: at))
  }

  /// The words' keys for the order, the family and the genus.
  static let ranks = ["order", "family", "genus"]

  /// A fish's ranks that have a name, with which rank each is (0 order, 1 family, 2 genus): its taxon pages' addresses.
  static func steps(_ f: HandbookIndex.Item) -> [(rank: Int, name: String)] {
    (f.tax ?? []).enumerated().compactMap { $0.element.isEmpty ? nil : ($0.offset, $0.element) }
  }

  /// The origin page at `path`: a continent's id, or its id and a country's; none for the section's first page, which
  /// lists the continents.
  private func origin(_ path: [String]) -> Page? {
    guard let title = words["origin", "title"] else { return nil }
    let continents = places.filter { $0.kind == .continent }
    if path.isEmpty {
      guard !continents.isEmpty else { return nil }
      let links = continents.map { Page.Link(title: $0.name, path: link(origin: [$0.id]), count: nil, italic: false) }
      return Page(kind: .origin, title: title, italic: false, up: [], intro: nil, links: links, words: [], fish: [],
                  item: .init(kind: .origin, name: title, path: link(origin: [])))
    }
    let place: HandbookIndex.Place?
    switch path.count {
    case 1: place = continents.first { $0.id == path[0] }
    case 2: place = places.first { $0.kind == .country && $0.id == path[1] && $0.parent == path[0] }
    default: place = nil
    }
    guard let place else { return nil }
    let fish = all(.fish).filter { $0.from.contains(place.id) }
    let links = place.kind == .continent
      ? places.filter { $0.kind == .country && $0.parent == place.id }.map { Page.Link(title: $0.name, path: link(origin: [place.id, $0.id]), count: nil, italic: false) }
      : []
    let name = words["placeTitle", place.id] ?? place.name
    let intro = words["placeIntro", place.id] ?? words["origin", "intro"].map { fill($0, ["n": "\(fish.count)", "place": place.name]) }
    let continent = place.kind == .country ? continents.first { $0.id == place.parent } : nil
    let up = [Page.Link(title: title, path: link(origin: []), count: nil, italic: false)]
      + (continent.map { [Page.Link(title: $0.name, path: link(origin: [$0.id]), count: nil, italic: false)] } ?? [])
    return Page(kind: .origin, title: name, italic: false, up: up, intro: intro, links: links, words: place.kids, fish: fish,
                item: .init(kind: .origin, name: name, path: link(origin: path)))
  }

  /// A page's path in the index's language and form: "/vi/phan-loai/cypriniformes/", "/nguon-goc/asia/".
  private func link(taxa path: [String]) -> String { link(SiteLanguage.served(lang)?.word("phan-loai"), path) }
  private func link(origin path: [String]) -> String { link(SiteLanguage.served(lang)?.word("nguon-goc"), path) }
  private func link(_ section: String?, _ path: [String]) -> String {
    let p = "/" + ([lang, section ?? ""] + path).joined(separator: "/") + "/"
    return form?.path(p) ?? p
  }

  /// The site's words with their placeholders filled: "{n} loài có nguồn gốc từ {place}." → "3 loài có nguồn gốc từ Peru."
  private func fill(_ text: String, _ values: [String: String]) -> String {
    values.reduce(text) { $0.replacingOccurrences(of: "{\($1.key)}", with: $1.value) }
  }

  /// Keys in the site's order, then any newer ones by name.
  private static func ordered(_ counts: [String: Int], _ order: [String]) -> [String] {
    order.filter { counts[$0] != nil } + counts.keys.filter { !order.contains($0) }.sorted()
  }
}
