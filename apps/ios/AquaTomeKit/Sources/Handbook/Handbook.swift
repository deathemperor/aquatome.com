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
    /// A fish's figures and behaviour (none for other kinds, nor for a fish the site has none for).
    public let facts: Facts
    /// A guide's subject, as the site's guide list groups them: "setup", "care", "plantCare", "aquascaping",
    /// "breeding", "disease", "discovery", or one a newer site adds.
    public let section: String?
    /// The fish and plants a guide names, by content id (what a tank lists them by).
    public let about: [String]
    public var id: String { path }

    enum CodingKeys: String, CodingKey { case kind, contentId = "id", name, sub, aka, path, img, section, about }

    public init(kind: Kind, contentId: String? = nil, name: String, sub: String? = nil, aka: [String]? = nil, path: String, img: String? = nil,
                facts: Facts = Facts(), section: String? = nil, about: [String] = []) {
      self.kind = kind; self.contentId = contentId; self.name = name; self.sub = sub; self.aka = aka; self.path = path; self.img = img
      self.facts = facts; self.section = section; self.about = about
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
      try facts.encode(to: encoder)
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
    /// 1 (easy) to 10.
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

  public init(version: Int = 1, lang: String, items: [Item]) { self.version = version; self.lang = lang; self.items = items }

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
  }

  private enum CodingKeys: String, CodingKey { case version, lang, items }
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
