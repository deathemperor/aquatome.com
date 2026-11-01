import Foundation

/// The handbook index the site publishes for the app (/app/<lang>.json, apps/site/src/lib/app-index.ts): every page
/// of one language the app can search. The app opens the page itself in a web view.
public struct HandbookIndex: Codable, Sendable, Equatable {
  public let version: Int
  public let lang: String
  /// Fish come in the site's list order: the well-known ones first.
  public let items: [Item]
  /// What the site's home page leads with; nil from a site older than that.
  public let home: Home?
  /// The site's words for the keys items carry, in this language; empty from a site older than that.
  public let labels: Labels

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
    /// A fish's figures and behaviour (none for other kinds, nor for a fish the site has none for).
    public let facts: Facts
    /// A guide's subject, as the site's guide list groups them: "setup", "care", "plantCare", "aquascaping",
    /// "breeding", "disease", "discovery", or one a newer site adds.
    public let section: String?
    /// The species and plants a guide names, by content id (what a tank lists them by); not breeds.
    public let about: [String]
    /// A fish's group, as the site groups species: "tetras", "cichlids", …, "other" (the keys of `Labels.group`).
    public let group: String?
    /// A plant's care, as its page gives it.
    public let plant: Plant?
    public var id: String { path }

    enum CodingKeys: String, CodingKey { case kind, contentId = "id", name, sub, aka, path, img, section, about, group, plant }

    public init(kind: Kind, contentId: String? = nil, name: String, sub: String? = nil, aka: [String]? = nil, path: String, img: String? = nil,
                facts: Facts = Facts(), section: String? = nil, about: [String] = [], group: String? = nil, plant: Plant? = nil) {
      self.kind = kind; self.contentId = contentId; self.name = name; self.sub = sub; self.aka = aka; self.path = path; self.img = img
      self.facts = facts; self.section = section; self.about = about; self.group = group; self.plant = plant
    }

    public init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      kind = try c.decode(Kind.self, forKey: .kind)
      contentId = try c.decodeIfPresent(String.self, forKey: .contentId)
      name = try c.decode(String.self, forKey: .name)
      sub = try c.decodeIfPresent(String.self, forKey: .sub)
      aka = try c.decodeIfPresent([String].self, forKey: .aka)
      path = try c.decode(String.self, forKey: .path)
      img = try c.decodeIfPresent(String.self, forKey: .img)
      facts = try Facts(from: decoder)
      // Read leniently, as the facts are: a value this app can't read is left out, never the item.
      section = (try? c.decodeIfPresent(String.self, forKey: .section)) ?? nil
      about = ((try? c.decodeIfPresent([String].self, forKey: .about)) ?? nil) ?? []
      group = (try? c.decodeIfPresent(String.self, forKey: .group)) ?? nil
      plant = (try? c.decodeIfPresent(Plant.self, forKey: .plant)) ?? nil
    }

    public func encode(to encoder: any Encoder) throws {
      var c = encoder.container(keyedBy: CodingKeys.self)
      try c.encode(kind, forKey: .kind)
      try c.encodeIfPresent(contentId, forKey: .contentId)
      try c.encode(name, forKey: .name)
      try c.encodeIfPresent(sub, forKey: .sub)
      try c.encodeIfPresent(aka, forKey: .aka)
      try c.encode(path, forKey: .path)
      try c.encodeIfPresent(img, forKey: .img)
      try c.encodeIfPresent(section, forKey: .section)
      if !about.isEmpty { try c.encode(about, forKey: .about) }
      try c.encodeIfPresent(group, forKey: .group)
      try c.encodeIfPresent(plant, forKey: .plant)
      try facts.encode(to: encoder)
    }
  }

  /// A plant's care, with the site's keys (the keys of `Labels`); each one this app can't read is left out.
  public struct Plant: Codable, Sendable, Hashable {
    /// 1 (easy) to 3.
    public var difficulty: Int?
    /// "low", "medium", "high".
    public var light: String?
    /// "none", "optional", "required".
    public var co2: String?
    /// "slow", "medium", "fast".
    public var growth: String?
    /// "foreground", "midground", "background", "epiphyte", "floating": where in a tank it goes, one or more.
    public var placement: [String]

    public init(difficulty: Int? = nil, light: String? = nil, co2: String? = nil, growth: String? = nil, placement: [String] = []) {
      self.difficulty = difficulty; self.light = light; self.co2 = co2; self.growth = growth; self.placement = placement
    }

    enum CodingKeys: String, CodingKey { case difficulty, light, co2, growth, placement }

    public init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      func read<T: Decodable>(_ k: CodingKeys) -> T? { (try? c.decodeIfPresent(T.self, forKey: k)) ?? nil }
      difficulty = read(.difficulty); light = read(.light); co2 = read(.co2); growth = read(.growth); placement = read(.placement) ?? []
    }
  }

  /// What the site's home page leads with, in its order: fish groups (with a photo of one), then fish, plants and
  /// guides by their item's path.
  public struct Home: Codable, Sendable, Equatable {
    public struct Group: Codable, Sendable, Hashable {
      public let id: String
      public let img: String?
      public init(id: String, img: String? = nil) { self.id = id; self.img = img }
    }
    public var groups: [Group]
    public var fish: [String]
    public var plants: [String]
    public var guides: [String]

    public init(groups: [Group] = [], fish: [String] = [], plants: [String] = [], guides: [String] = []) {
      self.groups = groups; self.fish = fish; self.plants = plants; self.guides = guides
    }

    enum CodingKeys: String, CodingKey { case groups, fish, plants, guides }

    public init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      func read<T: Decodable>(_ k: CodingKeys) -> T? { (try? c.decodeIfPresent(T.self, forKey: k)) ?? nil }
      groups = read(.groups) ?? []; fish = read(.fish) ?? []; plants = read(.plants) ?? []; guides = read(.guides) ?? []
    }
  }

  /// The site's words, in the index's language, for each key items carry: by key, then by value ("group" → "tetras" →
  /// "Cá tetra"). A key or value missing is nil, for the app to fall back on. "difficulty" is a plant's ("1" to "3"),
  /// not a fish's 1–8.
  public struct Labels: Codable, Sendable, Equatable {
    public var words: [String: [String: String]]
    public init(_ words: [String: [String: String]] = [:]) { self.words = words }
    public subscript(key: String, value: String) -> String? { words[key]?[value] }

    public init(from decoder: any Decoder) throws {
      // Each key on its own: one this app can't read costs only its words.
      let c = try decoder.container(keyedBy: AnyKey.self)
      words = Dictionary(uniqueKeysWithValues: c.allKeys.compactMap { k in (try? c.decode([String: String].self, forKey: k)).map { (k.stringValue, $0) } })
    }
    public func encode(to encoder: any Encoder) throws { try words.encode(to: encoder) }

    private struct AnyKey: CodingKey {
      let stringValue: String
      init(stringValue: String) { self.stringValue = stringValue }
      var intValue: Int? { nil }
      init?(intValue: Int) { nil }
    }
  }

  /// A species' figures and behaviour, beside the other fields of its item and named as the site's tank-mates tool
  /// names them (`SpeciesIndexItem`, apps/site/src/scripts/filter.ts). Each is optional, and one this app can't read
  /// (a new temperament is kept as it is) never costs the item.
  public struct Facts: Codable, Sendable, Hashable {
    public struct Range: Codable, Sendable, Hashable {
      public let min: Double
      public let max: Double
      public init(min: Double, max: Double) { self.min = min; self.max = max }
    }
    public var tempC: Range?
    public var ph: Range?
    /// General hardness, dGH.
    public var gh: Range?
    /// Adult length, cm.
    public var sizeCm: Double?
    /// The shortest tank it should live in, cm.
    public var tankCm: Double?
    /// "peaceful", "semi-aggressive", "aggressive", "predator", or one a newer site adds.
    public var temperament: String?
    public var finNipper: Bool?
    /// The smallest group to keep.
    public var schoolMin: Int?
    /// 1 (easy) to 8, as the site grades it.
    public var difficulty: Double?

    public init(tempC: Range? = nil, ph: Range? = nil, gh: Range? = nil, sizeCm: Double? = nil, tankCm: Double? = nil,
                temperament: String? = nil, finNipper: Bool? = nil, schoolMin: Int? = nil, difficulty: Double? = nil) {
      self.tempC = tempC; self.ph = ph; self.gh = gh; self.sizeCm = sizeCm; self.tankCm = tankCm
      self.temperament = temperament; self.finNipper = finNipper; self.schoolMin = schoolMin; self.difficulty = difficulty
    }

    enum CodingKeys: String, CodingKey { case tempC, ph, gh, sizeCm, tankCm, temperament, finNipper, schoolMin, difficulty }

    public init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      func read<T: Decodable>(_ k: CodingKeys) -> T? { (try? c.decodeIfPresent(T.self, forKey: k)) ?? nil }
      tempC = read(.tempC); ph = read(.ph); gh = read(.gh); sizeCm = read(.sizeCm); tankCm = read(.tankCm)
      temperament = read(.temperament); finNipper = read(.finNipper); schoolMin = read(.schoolMin); difficulty = read(.difficulty)
    }
  }

  public init(version: Int = 1, lang: String, items: [Item], home: Home? = nil, labels: Labels = Labels()) {
    self.version = version; self.lang = lang; self.items = items; self.home = home; self.labels = labels
  }

  /// The index format this app reads. A site that changes it on purpose bumps `version`; the app then keeps its copy.
  public static let supportedVersion = 1

  /// An item this app can't read (a kind a newer site added) is left out; the rest of the index still loads.
  public init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try c.decode(Int.self, forKey: .version)
    guard version == Self.supportedVersion else {
      throw DecodingError.dataCorruptedError(forKey: .version, in: c, debugDescription: "index version \(version)")
    }
    lang = try c.decode(String.self, forKey: .lang)
    var list = try c.nestedUnkeyedContainer(forKey: .items)
    var items: [Item] = []
    while !list.isAtEnd {
      if let i = try? list.decode(Item.self) { items.append(i) } else { _ = try list.decode(Skipped.self) }
    }
    self.items = items
    // Read leniently: a home or words this app can't read are left out, never the index.
    home = (try? c.decodeIfPresent(Home.self, forKey: .home)) ?? nil
    labels = ((try? c.decodeIfPresent(Labels.self, forKey: .labels)) ?? nil) ?? Labels()
  }

  public func encode(to encoder: any Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(version, forKey: .version)
    try c.encode(lang, forKey: .lang)
    try c.encode(items, forKey: .items)
    try c.encodeIfPresent(home, forKey: .home)
    if !labels.words.isEmpty { try c.encode(labels, forKey: .labels) }
  }

  private enum CodingKeys: String, CodingKey { case version, lang, items, home, labels }
  private struct Skipped: Decodable { init(from decoder: any Decoder) {} }
}

/// A load that stopped because something else took its place (the reader moved on, the tab went away): not a failure
/// to show, and nothing to fall back on.
public func isInterruption(_ error: any Error) -> Bool {
  if error is CancellationError { return true }
  let e = error as NSError
  // WebKit's "frame load interrupted": a navigation replaced by another, or turned away by the app.
  return (e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled) || (e.domain == "WebKitErrorDomain" && e.code == 102)
}

/// Where a navigation in a page's web view goes.
public enum PageRoute: Equatable, Sendable {
  /// Stays in the app: the site's own pages, and anything inside a page (embeds).
  case app
  /// Opens in the browser or the app that handles it: other sites, links that ask for a new window, mail and phone.
  case outside
  /// Not followed: a new blank window.
  case none

  /// `newWindow`: the link asked for one (`target="_blank"`); a web view without windows can't open it itself.
  /// `mainFrame`: the page itself, not an embed inside it.
  public static func of(_ url: URL, site: URL, mainFrame: Bool, newWindow: Bool) -> PageRoute {
    let scheme = url.scheme?.lowercased() ?? ""
    if ["about", "data", "blob"].contains(scheme) { return newWindow ? .none : .app }
    if !newWindow && !mainFrame { return .app }
    if !newWindow && ["http", "https"].contains(scheme) && bare(url.host) == bare(site.host) { return .app }
    return .outside
  }

  private static func bare(_ host: String?) -> String? {
    guard let h = host?.lowercased() else { return nil }
    return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
  }
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
    .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending } // name order, once
  }

  /// Lowercase, accents and tone marks removed, đ → d: "Cá Đĩa" → "ca dia".
  public static func fold(_ s: String) -> String {
    s.replacingOccurrences(of: "đ", with: "d").replacingOccurrences(of: "Đ", with: "d")
      .folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
      .lowercased()
  }

  /// Items with every word of `query` in their name, scientific name or other names, best first: the name itself, a
  /// name that starts with it, a word of the name that starts with it, the name containing it, then other names.
  /// An empty query lists everything of `kind` in name order, all of it (`limit` is for searches).
  public func find(_ query: String, kind: HandbookIndex.Kind? = nil, limit: Int = 200) -> [HandbookIndex.Item] {
    let q = Self.fold(query).trimmingCharacters(in: .whitespaces)
    let pool = entries.filter { kind == nil || $0.item.kind == kind }
    guard !q.isEmpty else { return pool.map(\.item) }
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
