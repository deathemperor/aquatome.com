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
  /// How many shards of pages each kind has (`/app/pages/<lang>/<kind>-<n>.json`, PageDoc.shard): the kinds this app
  /// draws itself. The site's `shards` gives each kind's level, and this app takes those at or below the one it knows
  /// (PageDoc.level); a site without it, its `pages` (guides only: left as they were for apps older than levels). Empty
  /// from a site older than both.
  public let pages: [String: Int]
  /// The places with an origin page, in the order the pages list them: the continents (/vi/nguon-goc/<id>/) and the
  /// countries under one (/vi/nguon-goc/<parent>/<id>/). Empty from a site older than that.
  public let places: [Place]
  /// Whether the site takes the app's anonymous telemetry (`telemetry: true`): absent or anything else, it doesn't, and
  /// the app sends none. The one place the app reads it.
  public let telemetry: Bool
  /// What's new on the site (Latest): its file's path ("/app/latest/vi.json"), where the language's site has the page;
  /// nil from one without it.
  public let latest: String?

  /// `video`: a series of video guides (its page lists them). `equipment`: a kind of kit (filters, lights), the site's
  /// /vi/thiet-bi/<category>/. `taxon`, `origin`: a taxon page (/vi/phan-loai/…) or an origin page (/vi/nguon-goc/…),
  /// drawn as the app's shelf of the fish it lists. Never in the index: the app makes them from its fish
  /// (HandbookShelves.page(at:)).
  public enum Kind: String, Codable, Sendable, CaseIterable { case fish, plant, guide, glossary, tool, video, equipment, taxon, origin }

  public struct Item: Codable, Sendable, Hashable, Identifiable {
    public let kind: Kind
    /// The page's content id (fish, plants): what a tank's `species[].id` / `plants[].id` hold.
    public let contentId: String?
    public let name: String
    /// Scientific name (fish, plants); a video series' channel.
    public let sub: String?
    /// Other names.
    public let aka: [String]?
    /// The page: "/id/ikan/<slug>/".
    public let path: String
    public let img: String?
    /// Where the fish is in `img` (PhotoBox): its card's frame keeps it by it. Packed in 8 bytes (`box`): every item is
    /// copied as a list scrolls.
    public var imgBox: PhotoBox? { PhotoBox(packed: box) }
    /// Its scientific name as a list's second line: none where its name holds it already.
    public var subUnderName: String? { Self.line(under: name, sub) }

    /// `sub` under `name`, unless `name` holds it: "Cá bám đá Schistura spilota" over "Schistura spilota" said it twice
    /// (the owner's report of 14 Nov, Khám phá's loach list).
    public static func line(under name: String, _ sub: String?) -> String? {
      guard let sub, !sub.isEmpty else { return nil }
      return name.range(of: sub, options: [.caseInsensitive, .diacriticInsensitive]) == nil ? sub : nil
    }
    private let box: UInt64
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
    /// A video guide: the video's length in seconds.
    public let video: Int?
    /// A video series: how many guides its page lists.
    public let parts: Int?
    /// A tool page's own title, the line under its heading and its description: found by search, not shown.
    public let words: [String]
    /// A species' order, family and genus, as the site writes them ("Cypriniformes", "Cyprinidae", "Danio"). Its taxon
    /// pages are these lowercased, each level and the ones above it (/vi/phan-loai/cypriniformes/cyprinidae/danio/), and
    /// list it. Breeds have none.
    public let tax: [String]?
    /// The places with an origin page (`HandbookIndex.places`) a species names itself, by id: those pages list it.
    public let from: [String]
    /// A breed that is a form of a species: the species' content id. A tank's check counts the breed as that species, so
    /// it has no `facts` of its own.
    public var of: String? { rare?.of }
    /// A breed's own figures, as its page's data card shows them: what its facts card shows.
    public var card: Facts? { rare?.card }
    /// A tool's short name, as its card on the site's tools page has it: what Tìm's tool tiles say. None from a site older
    /// than that, nor for the tools page itself.
    public var short: String? { rare?.short }
    /// `of`, `card` and `short`, behind one reference: only breeds and tools have them, and every item is copied as a list
    /// scrolls, so held in each item they cost a fling through the fish about 2 MB (perf-budgets.json).
    private let rare: Rare?
    public var id: String { path }

    /// Of `kind`, as a search narrowed to it or a list of it takes it: a video guide is a guide, and a video too.
    public func `is`(_ kind: Kind) -> Bool { self.kind == kind || (kind == .video && video != nil) }

    enum CodingKeys: String, CodingKey { case kind, contentId = "id", name, sub, aka, path, img, imgBox, section, about, group, plant, video, parts, words, tax, from, of, card, short }

    public init(kind: Kind, contentId: String? = nil, name: String, sub: String? = nil, aka: [String]? = nil, path: String, img: String? = nil,
                imgBox: PhotoBox? = nil, facts: Facts = Facts(), section: String? = nil, about: [String] = [], group: String? = nil, plant: Plant? = nil,
                video: Int? = nil, parts: Int? = nil, words: [String] = [], tax: [String]? = nil, from: [String] = [],
                of: String? = nil, card: Facts? = nil, short: String? = nil) {
      self.kind = kind; self.contentId = contentId; self.name = name; self.sub = sub; self.aka = aka; self.path = path; self.img = img
      box = PhotoBox.pack(imgBox); self.facts = facts; self.section = section; self.about = about; self.group = group; self.plant = plant
      self.video = video; self.parts = parts; self.words = words; self.tax = tax; self.from = from
      self.rare = Rare(of: of, card: card, short: short)
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
      box = PhotoBox.pack((try? c.decodeIfPresent(PhotoBox.self, forKey: .imgBox)) ?? nil)
      facts = try Facts(from: decoder)
      // Read leniently, as the facts are: a value this app can't read is left out, never the item.
      section = (try? c.decodeIfPresent(String.self, forKey: .section)) ?? nil
      about = ((try? c.decodeIfPresent([String].self, forKey: .about)) ?? nil) ?? []
      group = (try? c.decodeIfPresent(String.self, forKey: .group)) ?? nil
      plant = (try? c.decodeIfPresent(Plant.self, forKey: .plant)) ?? nil
      video = (try? c.decodeIfPresent(Int.self, forKey: .video)) ?? nil
      parts = (try? c.decodeIfPresent(Int.self, forKey: .parts)) ?? nil
      words = ((try? c.decodeIfPresent([String].self, forKey: .words)) ?? nil) ?? []
      // All three ranks, or none: a page's path needs each.
      tax = ((try? c.decodeIfPresent([String].self, forKey: .tax)) ?? nil).flatMap { $0.count == 3 ? $0 : nil }
      from = ((try? c.decodeIfPresent([String].self, forKey: .from)) ?? nil) ?? []
      rare = Rare(of: (try? c.decodeIfPresent(String.self, forKey: .of)) ?? nil,
                  card: (try? c.decodeIfPresent(Facts.self, forKey: .card)) ?? nil,
                  short: (try? c.decodeIfPresent(String.self, forKey: .short)) ?? nil)
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
      try c.encodeIfPresent(imgBox, forKey: .imgBox)
      try c.encodeIfPresent(section, forKey: .section)
      if !about.isEmpty { try c.encode(about, forKey: .about) }
      try c.encodeIfPresent(group, forKey: .group)
      try c.encodeIfPresent(plant, forKey: .plant)
      try c.encodeIfPresent(video, forKey: .video)
      try c.encodeIfPresent(parts, forKey: .parts)
      if !words.isEmpty { try c.encode(words, forKey: .words) }
      try c.encodeIfPresent(tax, forKey: .tax)
      if !from.isEmpty { try c.encode(from, forKey: .from) }
      try c.encodeIfPresent(of, forKey: .of)
      try c.encodeIfPresent(card, forKey: .card)
      try c.encodeIfPresent(short, forKey: .short)
      try facts.encode(to: encoder)
    }

    /// What a breed's or a tool's item has that others don't: none for an item with none of it.
    final class Rare: Sendable, Hashable {
      let of: String?
      let card: Facts?
      let short: String?

      init?(of: String?, card: Facts?, short: String?) {
        guard of != nil || card != nil || short != nil else { return nil }
        self.of = of; self.card = card; self.short = short
      }

      static func == (a: Rare, b: Rare) -> Bool { a.of == b.of && a.card == b.card && a.short == b.short }
      func hash(into h: inout Hasher) { h.combine(of); h.combine(card); h.combine(short) }
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
  /// guides by their item's path. And the editors' calendar for Hôm nay (`days`, docs/curation.md).
  public struct Home: Codable, Sendable, Equatable {
    public struct Group: Codable, Sendable, Hashable {
      public let id: String
      public let img: String?
      /// Where the fish is in `img`.
      public let imgBox: PhotoBox?
      public init(id: String, img: String? = nil, imgBox: PhotoBox? = nil) { self.id = id; self.img = img; self.imgBox = imgBox }
      enum CodingKeys: String, CodingKey { case id, img, imgBox }
      public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        img = (try? c.decodeIfPresent(String.self, forKey: .img)) ?? nil
        imgBox = ((try? c.decodeIfPresent(PhotoBox.self, forKey: .imgBox)) ?? nil)?.valid
      }
    }

    /// A day of the editors' calendar, from yesterday on (`apps/site/src/lib/curation.ts`): its fish and the fish card's
    /// photo, its guide and the guide card's photo, and a story, by their item's path. A slot left out is empty that day,
    /// not one for the app to fill; a date not listed is the app's own.
    public struct Day: Codable, Sendable, Equatable {
      /// A page told in a few words, in this index's language where the editors wrote them.
      public struct Story: Codable, Sendable, Equatable {
        public let path: String
        public var img: String?
        /// Where the fish is in `img`.
        public var imgBox: PhotoBox?
        public var eyebrow: String?
        public var title: String?
        public var dek: String?
        public init(path: String, img: String? = nil, eyebrow: String? = nil, title: String? = nil, dek: String? = nil) {
          self.path = path; self.img = img; self.eyebrow = eyebrow; self.title = title; self.dek = dek
        }
        enum CodingKeys: String, CodingKey { case path, img, imgBox, eyebrow, title, dek }
        public init(from decoder: any Decoder) throws {
          let c = try decoder.container(keyedBy: CodingKeys.self)
          func read(_ k: CodingKeys) -> String? { (try? c.decodeIfPresent(String.self, forKey: k)) ?? nil }
          path = try c.decode(String.self, forKey: .path)
          img = read(.img); eyebrow = read(.eyebrow); title = read(.title); dek = read(.dek)
          imgBox = ((try? c.decodeIfPresent(PhotoBox.self, forKey: .imgBox)) ?? nil)?.valid
        }
      }
      /// "2026-11-13", the reader's own date (`key(_:)`).
      public let date: String
      public var fish: String?
      /// The fish card's photo, big enough for it: the card shows this one, or none.
      public var img: String?
      /// Where the fish is in `img`.
      public var imgBox: PhotoBox?
      public var guide: String?
      /// The guide card's photo, likewise.
      public var guideImg: String?
      /// Where the fish is in `guideImg`.
      public var guideImgBox: PhotoBox?
      public var story: Story?

      public init(date: String, fish: String? = nil, img: String? = nil, guide: String? = nil, guideImg: String? = nil, story: Story? = nil) {
        self.date = date; self.fish = fish; self.img = img; self.guide = guide; self.guideImg = guideImg; self.story = story
      }

      enum CodingKeys: String, CodingKey { case date, fish, img, imgBox, guide, guideImg, guideImgBox, story }

      public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func read<T: Decodable>(_ k: CodingKeys) -> T? { (try? c.decodeIfPresent(T.self, forKey: k)) ?? nil }
        date = try c.decode(String.self, forKey: .date)
        fish = read(.fish); img = read(.img); guide = read(.guide); guideImg = read(.guideImg); story = read(.story)
        imgBox = (read(.imgBox) as PhotoBox?)?.valid; guideImgBox = (read(.guideImgBox) as PhotoBox?)?.valid
      }

      /// A date as the calendar names it, on the reader's clock: always the Gregorian year, as a Thai phone's own
      /// calendar would put 2569.
      public static func key(_ date: Date, in zone: TimeZone = .current) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = zone
        let d = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", d.year ?? 0, d.month ?? 0, d.day ?? 0)
      }
    }

    /// Khám phá's longer shelves, by item path: the fish start with `fish` in its order and go on with those hobbyists
    /// keep most; the plants and guides are Curation's lists in its order, then the home's own ranking. A list missing or
    /// unreadable is nil, and its shelf shows the home's own list, not an empty one.
    public struct Browse: Codable, Sendable, Equatable {
      public var fish: [String]?
      public var plants: [String]?
      public var guides: [String]?
      public init(fish: [String]? = nil, plants: [String]? = nil, guides: [String]? = nil) { self.fish = fish; self.plants = plants; self.guides = guides }

      enum CodingKeys: String, CodingKey { case fish, plants, guides }
      public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func read(_ k: CodingKeys) -> [String]? { (try? c.decodeIfPresent([String].self, forKey: k)) ?? nil }
        fish = read(.fish); plants = read(.plants); guides = read(.guides)
      }
    }

    public var groups: [Group]
    public var fish: [String]
    public var plants: [String]
    public var guides: [String]
    /// Nil from a site before it: Khám phá shows `fish`, `plants` and `guides`.
    public var browse: Browse?
    public var days: [Day]

    public init(groups: [Group] = [], fish: [String] = [], plants: [String] = [], guides: [String] = [], browse: Browse? = nil, days: [Day] = []) {
      self.groups = groups; self.fish = fish; self.plants = plants; self.guides = guides; self.browse = browse; self.days = days
    }

    enum CodingKeys: String, CodingKey { case groups, fish, plants, guides, browse, days }

    public init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      func read<T: Decodable>(_ k: CodingKeys) -> T? { (try? c.decodeIfPresent(T.self, forKey: k)) ?? nil }
      groups = read(.groups) ?? []; fish = read(.fish) ?? []; plants = read(.plants) ?? []; guides = read(.guides) ?? []
      browse = read(.browse)
      // Day by day: one this app can't read costs only that day, which goes to the app's own picks.
      days = (read(.days) as [Lenient<Day>]?)?.compactMap(\.value) ?? []
    }
  }

  /// An element of a list, or nil where it can't be read, so the rest of the list stays.
  struct Lenient<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: any Decoder) throws { value = try? T(from: decoder) }
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
    /// How long it lives, in years, as its data card resolves it ("Tuổi thọ"): one figure is min = max, months a
    /// fraction. None when no source states it.
    public var lifeYears: Range?

    public init(tempC: Range? = nil, ph: Range? = nil, gh: Range? = nil, sizeCm: Double? = nil, tankCm: Double? = nil,
                temperament: String? = nil, finNipper: Bool? = nil, schoolMin: Int? = nil, difficulty: Double? = nil,
                lifeYears: Range? = nil) {
      self.tempC = tempC; self.ph = ph; self.gh = gh; self.sizeCm = sizeCm; self.tankCm = tankCm
      self.temperament = temperament; self.finNipper = finNipper; self.schoolMin = schoolMin; self.difficulty = difficulty
      self.lifeYears = lifeYears
    }

    enum CodingKeys: String, CodingKey { case tempC, ph, gh, sizeCm, tankCm, temperament, finNipper, schoolMin, difficulty, lifeYears }

    public init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      func read<T: Decodable>(_ k: CodingKeys) -> T? { (try? c.decodeIfPresent(T.self, forKey: k)) ?? nil }
      tempC = read(.tempC); ph = read(.ph); gh = read(.gh); sizeCm = read(.sizeCm); tankCm = read(.tankCm)
      temperament = read(.temperament); finNipper = read(.finNipper); schoolMin = read(.schoolMin); difficulty = read(.difficulty)
      lifeYears = read(.lifeYears)
    }
  }

  /// A place with an origin page, named in the index's language.
  public struct Place: Codable, Sendable, Equatable, Identifiable {
    public enum Kind: String, Codable, Sendable { case continent, country }
    public let id: String
    public let name: String
    public let kind: Kind
    /// A country's continent.
    public let parent: String?
    /// A country's regions and rivers, as its page names them: words, with no page of their own.
    public let kids: [String]

    public init(id: String, name: String, kind: Kind, parent: String? = nil, kids: [String] = []) {
      self.id = id; self.name = name; self.kind = kind; self.parent = parent; self.kids = kids
    }

    enum CodingKeys: String, CodingKey { case id, name, kind, parent, kids }

    public init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      id = try c.decode(String.self, forKey: .id)
      name = try c.decode(String.self, forKey: .name)
      kind = try c.decode(Kind.self, forKey: .kind)
      parent = (try? c.decodeIfPresent(String.self, forKey: .parent)) ?? nil
      kids = ((try? c.decodeIfPresent([String].self, forKey: .kids)) ?? nil) ?? []
    }

    public func encode(to encoder: any Encoder) throws {
      var c = encoder.container(keyedBy: CodingKeys.self)
      try c.encode(id, forKey: .id)
      try c.encode(name, forKey: .name)
      try c.encode(kind, forKey: .kind)
      try c.encodeIfPresent(parent, forKey: .parent)
      if !kids.isEmpty { try c.encode(kids, forKey: .kids) }
    }
  }

  public init(version: Int = 1, lang: String, items: [Item], home: Home? = nil, labels: Labels = Labels(), pages: [String: Int] = [:],
              places: [Place] = [], telemetry: Bool = false, latest: String? = nil) {
    self.version = version; self.lang = lang; self.items = items; self.home = home; self.labels = labels; self.pages = pages
    self.places = places; self.telemetry = telemetry
    self.latest = latest
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
    // Each kind on its own: one this app can't read is left out, the others drawn.
    let shards = ((try? c.decodeIfPresent([String: Shards].self, forKey: .shards)) ?? nil) ?? [:]
    pages = !shards.isEmpty ? Self.drawn(shards, level: PageDoc.level) : ((try? c.decodeIfPresent([String: Int].self, forKey: .pages)) ?? nil) ?? [:]
    // Each place on its own, as items are: one this app can't read (a kind a newer site adds) is left out.
    var places: [Place] = []
    if var list = try? c.nestedUnkeyedContainer(forKey: .places) {
      while !list.isAtEnd {
        if let p = try? list.decode(Place.self) { places.append(p) } else if (try? list.decode(Skipped.self)) == nil { break }
      }
    }
    self.places = places
    telemetry = ((try? c.decodeIfPresent(Bool.self, forKey: .telemetry)) ?? nil) ?? false
    latest = (try? c.decodeIfPresent(String.self, forKey: .latest)) ?? nil
  }

  public func encode(to encoder: any Encoder) throws {
    var c = encoder.container(keyedBy: CodingKeys.self)
    try c.encode(version, forKey: .version)
    try c.encode(lang, forKey: .lang)
    try c.encode(items, forKey: .items)
    try c.encodeIfPresent(home, forKey: .home)
    if !labels.words.isEmpty { try c.encode(labels, forKey: .labels) }
    if !pages.isEmpty { try c.encode(pages, forKey: .pages) }
    if !places.isEmpty { try c.encode(places, forKey: .places) }
    if telemetry { try c.encode(telemetry, forKey: .telemetry) }
    try c.encodeIfPresent(latest, forKey: .latest)
  }

  // The copy kept on the phone writes `pages` alone: the kinds this app draws, already chosen.
  private enum CodingKeys: String, CodingKey { case version, lang, items, home, labels, pages, shards, places, telemetry, latest }
  private struct Skipped: Decodable { init(from decoder: any Decoder) {} }
  /// The kinds an app knowing `level` draws itself, of the site's `shards`, with their shard counts: those at that level
  /// or a lower one (protocols/page-vectors.json, `levels`).
  static func drawn(_ shards: [String: Shards], level: Int) -> [String: Int] {
    shards.compactMapValues { s in s.level.flatMap { $0 <= level ? s.n : nil } }.filter { $0.value > 0 }
  }

  /// A kind's entry in the site's `shards`: a part this app can't read is nil (all of it, for an entry that isn't one),
  /// and that kind alone stays on the web.
  struct Shards: Decodable {
    let n: Int?
    let level: Int?
    init(from decoder: any Decoder) {
      let c = try? decoder.container(keyedBy: Keys.self)
      n = try? c?.decode(Int.self, forKey: .n)
      level = try? c?.decode(Int.self, forKey: .level)
    }
    private enum Keys: String, CodingKey { case n, level }
  }
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
  /// Opens in the browser or the app that handles it: other sites, links that ask for a new window, mail and phone, and
  /// the site's pages about itself (AboutTheSite).
  case outside
  /// Not followed: a new blank window.
  case none

  /// `newWindow`: the link asked for one (`target="_blank"`); a web view without windows can't open it itself.
  /// `mainFrame`: the page itself, not an embed inside it.
  public static func of(_ url: URL, site: URL, mainFrame: Bool, newWindow: Bool) -> PageRoute {
    let scheme = url.scheme?.lowercased() ?? ""
    if ["about", "data", "blob"].contains(scheme) { return newWindow ? .none : .app }
    if !newWindow && !mainFrame { return .app }
    if !newWindow && ["http", "https"].contains(scheme) && bare(url.host) == bare(site.host) {
      return AboutTheSite.is(url) ? .outside : .app
    }
    return .outside
  }

  static func bare(_ host: String?) -> String? {
    guard let h = host?.lowercased() else { return nil }
    return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
  }
}

/// The site's pages about itself: what it is (with its data table), how to reach it, its privacy policy. The app opens
/// them in the browser, not in its web view (the owner's call, 2026-11-02): they aren't the handbook.
enum AboutTheSite {
  /// Their Vietnamese segments; each language's are its words for them (SiteLanguage).
  static let sections = ["gioi-thieu", "lien-he", "chinh-sach-bao-mat"]

  /// `url` is one of them or a page below one ("/th/privacy/", "/vi/gioi-thieu/bang-du-lieu/"), the Vietnamese under
  /// "/vi/" or at the root ("/lien-he/").
  static func `is`(_ url: URL) -> Bool {
    var parts = url.path(percentEncoded: false).split(separator: "/").map(String.init)
    var lang = SiteLanguage.vietnamese
    if let l = SiteLanguage.served(parts.first ?? "") { lang = l; parts.removeFirst() }
    return parts.first.map { first in sections.contains { lang.word($0) == first } } ?? false
  }
}

/// A page of the site that our own copies of the app open in the browser, marked (`aqcheck=1`): the site then leaves that
/// browser's visits out of its reader stats, as it leaves out the app's own web view under `AccountsClient.ourCopy`.
public enum SiteMark {
  public static let item = URLQueryItem(name: "aqcheck", value: "1")

  /// `url` with the mark when it's on the site (www. or not); anything else as it is.
  public static func marked(_ url: URL, site: URL) -> URL {
    guard ["http", "https"].contains(url.scheme?.lowercased() ?? ""), PageRoute.bare(url.host) == PageRoute.bare(site.host),
          var parts = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return url }
    parts.queryItems = (parts.queryItems ?? []) + [item]
    return parts.url ?? url
  }
}

/// A shop link on the site (/go/<network>/…, the "Shopee", "Lazada" and "Tiki" buttons): the site counts the click and
/// sends the reader on to the shop. Our own copies of the app ask it where the link leads under their mark, so the site
/// doesn't count their taps, then open the shop itself.
public enum ShopLink {
  public static func `is`(_ url: URL, site: URL) -> Bool {
    PageRoute.of(url, site: site, mainFrame: true, newWindow: false) == .app && url.path.hasPrefix("/go/")
  }

  /// The shop the site's redirect names, asked by `send` without following it, as `userAgent`; the link itself when
  /// the site answers anything else or can't be reached, so a tap always opens something. A redirect to the site's own
  /// shop link (www. sent to the bare domain) is asked once more, so it isn't opened unmarked. Asked briefly: a tap waits.
  public static func target(of url: URL, userAgent: String, send: @Sendable (URLRequest) async throws -> HTTPURLResponse) async -> URL {
    var link = url
    for _ in 0..<2 {
      var r = URLRequest(url: link)
      r.setValue(userAgent, forHTTPHeaderField: "User-Agent")
      r.timeoutInterval = 3
      guard let answer = try? await send(r), (300..<400).contains(answer.statusCode),
            let location = answer.value(forHTTPHeaderField: "Location"), let to = URL(string: location, relativeTo: link)?.absoluteURL,
            ["http", "https"].contains(to.scheme?.lowercased() ?? "") else { return url }
      guard Self.is(to, site: link) else { return to }
      link = to
    }
    return url
  }
}

/// Searching the index the way readers type: without accents ("ca dia" finds "Cá đĩa"), any case, words in any order.
public struct HandbookSearch: Sendable {
  private struct Entry: Sendable {
    let item: HandbookIndex.Item
    let name: String
    let words: [Substring]
    let other: String
    /// A tool page's own words.
    let more: String
    /// Its name, scientific name and other names as `nameKey` makes them.
    let keys: [String]
  }
  private let entries: [Entry]

  public init(_ items: [HandbookIndex.Item]) {
    entries = items.map { i in
      let name = Self.fold(i.name), other = Self.fold(([i.sub ?? ""] + (i.aka ?? [])).joined(separator: " | "))
      // Keyed from the names as folded here: folding is most of what keying costs.
      return Entry(item: i, name: name, words: name.split(separator: " "), other: other, more: Self.fold(i.words.joined(separator: " | ")),
                   keys: ([name[...]] + other.split(separator: "|")).map(Self.key))
    }
    .sorted { $0.name.localizedStandardCompare($1.name) == .orderedAscending } // name order, once
  }

  /// Lowercase, accents and tone marks removed, đ → d: "Cá Đĩa" → "ca dia".
  public static func fold(_ s: String) -> String {
    s.replacingOccurrences(of: "đ", with: "d").replacingOccurrences(of: "Đ", with: "d")
      .folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil)
      .lowercased()
  }

  /// A name as readers type it, as the site's search compares a page's names with what was searched for (`nameKey`,
  /// apps/site/src/scripts/search-rank.ts): folded, nothing in brackets, only letters and digits a space apart, no leading
  /// "cá". "Cá betta (cá xiêm)" → "betta".
  private static func nameKey(_ s: String) -> String { key(fold(s)[...]) }

  /// `nameKey` of a name `fold` has made already.
  private static func key(_ folded: Substring) -> String {
    var rest = folded.drop(while: { $0 == " " }), bare = "", space = false
    while rest.last == " " { rest = rest.dropLast() }
    // Most names, once folded, are already a–z and 0–9 words one space apart: their own key, without the costlier work below.
    if rest.utf8.allSatisfy({ b in defer { space = b == 32 }; return b == 32 ? !space : (97...122).contains(b) || (48...57).contains(b) }) {
      return String(rest.hasPrefix("ca ") ? rest.dropFirst(3) : rest)
    }
    while let open = rest.firstIndex(of: "("), let close = rest[open...].firstIndex(of: ")") {
      bare += rest[..<open] + " "
      rest = rest[rest.index(after: close)...]
    }
    let key = (bare + rest).split(whereSeparator: { !$0.isLetter && !$0.isNumber }).joined(separator: " ")
    return key.hasPrefix("ca ") ? String(key.dropFirst(3)) : key
  }

  /// Items with every word of `query` in their name, scientific name, other names or a tool page's own words, best first:
  /// a page named what was searched for (its name, scientific name or another name, compared as `nameKey` makes them, as
  /// the site's search puts it first: "bảy màu" finds Cá bảy màu before Bảy màu Koi), the name itself, a name that starts
  /// with it, a word of the name that starts with it, the name containing it, then other names, then a tool page's words.
  /// An empty query lists everything of `kind` (Item.is) in name order, all of it (`limit` is for searches).
  public func find(_ query: String, kind: HandbookIndex.Kind? = nil, limit: Int = 200) -> [HandbookIndex.Item] {
    findAndCount(query, kind: kind, limit: limit).items
  }

  /// What `find` lists, and how many pages the query finds of each kind, as `find` narrowed to that kind takes them
  /// (Item.is: a video guide counts as a guide and as a video), and in all under nil. Every match is counted, not only
  /// the best 200 listed. Counted in the pass that finds them: matching is what a keystroke costs, and a second pass to
  /// count would nearly double it.
  public func findAndCount(_ query: String, kind: HandbookIndex.Kind? = nil, limit: Int = 200)
    -> (items: [HandbookIndex.Item], counts: [HandbookIndex.Kind?: Int]) {
    let q = Self.fold(query).trimmingCharacters(in: .whitespaces)
    let words = q.split(separator: " ")
    let key = Self.nameKey(query)
    var counts: [HandbookIndex.Kind?: Int] = [:]
    var ranked: [(rank: Int, entry: Entry)] = []
    for e in entries where Self.matches(e, words) {
      counts[nil, default: 0] += 1
      for k in HandbookIndex.Kind.allCases where e.item.is(k) { counts[k, default: 0] += 1 }
      if kind.map(e.item.is) ?? true { ranked.append((q.isEmpty ? 0 : Self.rank(e, q, words, key), e)) }
    }
    guard !q.isEmpty else { return (ranked.map(\.entry.item), counts) }
    let best = ranked.sorted { ($0.rank, $0.entry.name.count, $0.entry.name) < ($1.rank, $1.entry.name.count, $1.entry.name) }
      .prefix(limit).map(\.entry.item)
    return (Array(best), counts)
  }

  private static func rank(_ e: Entry, _ q: String, _ words: [Substring], _ key: String) -> Int {
    !key.isEmpty && e.keys.contains(key) ? 0
      : e.name == q ? 1
      : e.name.hasPrefix(q) ? 2
      : e.words.contains(where: { $0.hasPrefix(words[0]) }) && e.name.contains(q) ? 3
      : e.name.contains(q) ? 4
      : words.allSatisfy({ e.name.contains($0) || e.other.contains($0) }) ? 5
      : 6
  }

  /// Every word of a search somewhere in the page's names or a tool page's own words.
  private static func matches(_ e: Entry, _ words: [Substring]) -> Bool {
    words.allSatisfy { e.name.contains($0) || e.other.contains($0) || e.more.contains($0) }
  }
}
