import Foundation

/// Where the fish is in a photo: fractions of the photo from its top-left corner (`x`, `y`, `w`, `h`, each 0…1), its whole
/// area where no frame may cut it. The app's one box type: a page's photos (`box`) and, with the v2 Lab's frames, the
/// index's `imgBox`. A frame keeps the fish by it (protocols/photo-crop-vectors.json).
public struct PhotoBox: Codable, Sendable, Hashable {
  public let x, y, w, h: Double
  public init(x: Double, y: Double, w: Double, h: Double) { (self.x, self.y, self.w, self.h) = (x, y, w, h) }
}

extension PhotoBox {
  /// `{x, y, w, h}` as the site sends it; none where one is missing or falls outside the photo.
  init?(json v: Any?) {
    guard let o = v as? [String: Any], let x = (o["x"] as? NSNumber)?.doubleValue, let y = (o["y"] as? NSNumber)?.doubleValue,
          let w = (o["w"] as? NSNumber)?.doubleValue, let h = (o["h"] as? NSNumber)?.doubleValue,
          x >= 0, y >= 0, w > 0, h > 0, x + w <= 1.0001, y + h <= 1.0001 else { return nil }
    self.init(x: x, y: y, w: w, h: h)
  }
}

/// A content page as blocks, for the app to draw itself (packages/schema/src/app-page.ts; JSON Schema
/// protocols/page.schema.json; shared cases protocols/page-vectors.json): the page the site shows at `path`.
///
/// Read leniently, as the format asks: a block this app doesn't know (from a newer site) or can't read is `.web`, "open
/// this page on the web", and a field it doesn't know is nothing. So one bad block costs that block, never the page.
/// Read from JSONSerialization's objects, not Codable: Codable's machinery for these types cost the app 70 kB.
public struct PageDoc: Sendable {
  /// The format this app reads. A site changes it only when a known block changes meaning; a page of another version is
  /// unreadable, and the app opens it on the web.
  public static let version = 1
  /// The kinds this app draws itself: those the index's `shards` gives this level or a lower one. Level 1, guides; 2,
  /// fish, plants and glossary terms, with the blocks added for them. A kind needing a block this app doesn't know gets
  /// the next level, so the app keeps it on the web instead of offering the web for one part after another.
  public static let level = 2

  /// "guide", "fish", "plant", "glossary", or one a newer site adds.
  public let kind: String
  /// The web page: what "open on the web" and sharing use, and the app index's `path` for it.
  public let path: String
  public let title: String
  /// A scientific name.
  public let sub: String?
  /// The line above the title, as the site writes it ("Chăm sóc · đọc khoảng 6 phút").
  public let meta: String?
  /// A fish's line above its name: its family and country, the country linked to its origin page; empty when none.
  public let `where`: [Run]
  /// Its other names, as the site writes them under the name ("Tên khác: …").
  public let aka: String?
  /// Whose page this is ("Theo Aquarium Breeder"; a fish's "Dịch và tổng hợp từ …"), linked as on the site; empty when
  /// the page has none.
  public let credit: [Run]
  public let lead: Image?
  public let video: Video?
  /// Where its readers' comments and photos are (Readers), by the keys its web page reads them by; nil when it has
  /// neither.
  public let talk: Talk?
  public let blocks: [Block]

  /// The keys of a page's readers' sections: its comments (`/_c?e=`) and its readers' photos (`/_p?e=`).
  public struct Talk: Sendable, Equatable {
    public let comments: String?
    public let photos: String?
  }

  /// Text, plain or styled. `href` is a site path, an absolute URL, or `#id` (the block with that id on this page).
  public struct Run: Sendable {
    public let text: String
    public var bold = false
    public var italic = false
    public var href: String?
    /// A glossary term's or a citation's explanation, shown when the link is tapped: (term, text).
    public var tip: (term: String, text: String)?
    /// A source's note on a figure that differs from the page's data table ("… ghi khác bảng dữ liệu: …"): read beside
    /// the figures, not as the part's opening line.
    public var note = false

    public init(_ text: String) { self.text = text }

    /// A source's mark (the site's `.cite`): the source's number, its tip naming the source, as the page numbers its
    /// sources (`refs`). Shown small and raised after the words it backs; a word's tip has the word, not a number.
    public var isSourceMark: Bool { tip != nil && !text.isEmpty && text.allSatisfy { $0.isASCII && $0.isNumber } }

    /// A string, or `{text, b?, i?, href?, tip?, note?}`.
    init?(json v: Any) {
      if let s = v as? String { self.init(s); return }
      guard let o = v as? [String: Any], let text = o["text"] as? String else { return nil }
      self.init(text)
      bold = o["b"] as? Bool ?? false
      italic = o["i"] as? Bool ?? false
      href = o["href"] as? String
      note = o["note"] as? Bool ?? false
      if let t = o["tip"] as? [String: Any], let term = t["term"] as? String, let text = t["text"] as? String { tip = (term, text) }
    }
    static func list(_ v: Any?) -> [Run]? { each(v) { Run(json: $0) } }
  }

  public struct Image: Sendable {
    public let src: String
    public let w: Int
    public let h: Int
    public let alt: String?
    /// A smaller copy (about 480 px wide) for a grid of them: a gallery's photos have one.
    public let thumb: String?
    /// The photo's credit as the page shows it: the line ("Ảnh: Aquarium Breeder"), its licence, the photo's own page.
    public let credit: Credit?
    /// Where the fish is in the photo (PhotoBox); the whole area where no frame may cut it. Each frame keeps the fish by it
    /// (PhotoFrame).
    public let box: PhotoBox?

    /// A photo the page doesn't carry (a reader's): `credit`, who took it.
    public init(src: String, w: Int, h: Int, alt: String?, thumb: String?, credit: Credit?, box: PhotoBox? = nil) {
      self.src = src; self.w = w; self.h = h; self.alt = alt; self.thumb = thumb; self.credit = credit; self.box = box
    }

    init?(json v: Any?) {
      guard let o = v as? [String: Any], let src = o["src"] as? String, let w = o["w"] as? Int, let h = o["h"] as? Int, w > 0, h > 0 else { return nil }
      self.src = src; self.w = w; self.h = h
      alt = o["alt"] as? String
      thumb = o["thumb"] as? String
      credit = Credit(json: o["credit"])
      box = PhotoBox(json: o["box"])
    }

    /// A photo's credit: the line ("Ảnh: Aquarium Breeder"), its licence, the photo's own page. An Unsplash photo's line
    /// is "Ảnh: <name> trên Unsplash", with the name as the line writes it (`author`) and the photographer's Unsplash
    /// page (`authorUrl`), once the site's engine has it.
    public struct Credit: Sendable {
      public let text: String
      public let licence: String
      public let url: String?
      public let author: String?
      public let authorUrl: String?

      /// Unsplash's home, linked as its guidelines ask: with AquaTome's UTM, as the site links it (lib/unsplash.ts).
      public static let unsplashHome = "https://unsplash.com/?utm_source=aquatome&utm_medium=referral"

      public init(text: String, licence: String, url: String?, author: String? = nil, authorUrl: String? = nil) {
        self.text = text; self.licence = licence; self.url = url; self.author = author; self.authorUrl = authorUrl
      }

      init?(json v: Any?) {
        guard let o = v as? [String: Any], let text = o["text"] as? String, let licence = o["licence"] as? String else { return nil }
        self.init(text: text, licence: licence, url: o["url"] as? String, author: o["author"] as? String, authorUrl: o["authorUrl"] as? String)
      }

      /// The line and its licence ("Ảnh: Aquarium Breeder · CC BY 4.0") in pieces, each with where it links. One with an
      /// `author`, the site's Unsplash line: the name linking the photographer's page (the photo's own until the site has
      /// it) and "Unsplash" Unsplash's home, the rest unlinked; if the line doesn't hold the name, the line linking the
      /// photo's own page as before and "Unsplash" still its home. Any other, the whole of it linking the photo's own page.
      /// `photo` false: the photo's own page linked nowhere, for a list that links each photo's page by a number.
      public func parts(photo: Bool = true) -> [(text: String, link: String?)] {
        let page = photo ? url : nil
        let tail = licence.isEmpty ? "" : " · " + licence
        guard let author else { return [(text + tail, page)] }
        // The name with its spaces as the line has them: the site collapses a line's spaces, not always the name's.
        // Looked for after "Ảnh: " ("Foto: ", "ภาพ: "), so a name that is that word isn't found in it.
        let wanted = author.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        let from = text.range(of: ": ")?.upperBound ?? text.startIndex
        var links: [(at: Range<String.Index>, link: String?)] = []
        if !wanted.isEmpty, let name = text.range(of: wanted, range: from..<text.endIndex) {
          links.append((name, authorUrl ?? page))
          // "Unsplash" outside the name: after it, as each language's line has it, else before it.
          if let site = text.range(of: "Unsplash", range: name.upperBound..<text.endIndex)
              ?? text.range(of: "Unsplash", range: from..<name.lowerBound) {
            links.append((site, Self.unsplashHome))
          }
        } else if let site = text.range(of: "Unsplash", options: .backwards) {
          links = [(text.startIndex..<site.lowerBound, page), (site, Self.unsplashHome)]
        } else {
          return [(text + tail, page)]
        }
        links.sort { $0.at.lowerBound < $1.at.lowerBound }
        var out: [(text: String, link: String?)] = []
        var i = text.startIndex
        for l in links where !l.at.isEmpty {
          if i < l.at.lowerBound { out.append((String(text[i..<l.at.lowerBound]), nil)) }
          out.append((String(text[l.at]), l.link))
          i = l.at.upperBound
        }
        let rest = String(text[i...]) + tail
        if !rest.isEmpty { out.append((rest, nil)) }
        return out
      }
    }
  }

  /// A guide's video: its thumbnail, played on YouTube, from a chapter's start (`at`, seconds) if picked.
  public struct Video: Sendable {
    public let youtubeId: String
    public let title: String
    public let channel: String
    public let durationSec: Int
    /// The badge when the video has Vietnamese subtitles; none when it's in the page's language.
    public let subtitles: String?
    public let chapters: [(at: Int, title: String)]?
    /// The guide's card photo, shown in the video's place until it plays, so its card and its page lead with one picture
    /// (the Design Lead's line, 13 Nov): YouTube's own thumbnail never shows. None for a guide whose card has no photo.
    public let poster: Image?

    init?(json v: Any?) {
      guard let o = v as? [String: Any], let id = o["youtubeId"] as? String, let title = o["title"] as? String,
            let channel = o["channel"] as? String, let d = o["durationSec"] as? Int else { return nil }
      youtubeId = id; self.title = title; self.channel = channel; durationSec = d
      subtitles = o["subtitles"] as? String
      poster = Image(json: o["poster"])
      chapters = each(o["chapters"]) { c in
        guard let c = c as? [String: Any], let at = c["at"] as? Int, let t = c["title"] as? String else { return nil }
        return (at, t)
      }
    }
  }

  /// A still from a video, playing it from that moment (`at`, seconds).
  public struct Still: Sendable {
    public let at: Int
    public let img: Image
    public let caption: String
  }

  /// One figure's sources: `field` is the index's name for it (tempC, ph, gh, sizeCm, tankCm, difficulty); where the
  /// sources disagree (`conflict`), each one's own figure and which the facts show (`note`); `marked`, they disagree by
  /// enough to change how the fish is kept (the site's card puts its dot on these only).
  public struct TrustRow: Sendable {
    public let field: String
    public let label: String
    public let conflict: Bool
    public let marked: Bool
    public let note: String?
    public let items: [String]

    init?(json v: Any) {
      guard let o = v as? [String: Any], let field = o["field"] as? String, let label = o["label"] as? String, let items = o["items"] as? [String] else { return nil }
      self.field = field; self.label = label; self.items = items
      conflict = o["conflict"] as? Bool ?? false
      marked = o["marked"] as? Bool ?? false
      note = o["note"] as? String
    }
  }

  /// "Nuôi chung": fish to keep with this one (`good`) and away from it (`avoid`, each with why), what the suggestions
  /// rest on (`note`), and the tank-mates tool set to this fish.
  public struct Mates: Sendable {
    public struct Mate: Sendable {
      public let path: String
      public let name: String
      public let img: Image?
      public let why: String?
    }
    public let title: String
    public let good: (title: String, items: [Mate])?
    public let avoid: (title: String, items: [Mate])?
    public let note: String?
    public let tool: (text: String, href: String)

    init?(json o: [String: Any]) {
      guard let title = o["title"] as? String, let t = o["tool"] as? [String: Any], let text = t["text"] as? String, let href = t["href"] as? String else { return nil }
      func group(_ v: Any?) -> (title: String, items: [Mate])?? {
        guard let v else { return .some(nil) }
        guard let g = v as? [String: Any], let title = g["title"] as? String, let items = each(g["items"], { m -> Mate? in
          guard let m = m as? [String: Any], let path = m["path"] as? String, let name = m["name"] as? String else { return nil }
          return Mate(path: path, name: name, img: Image(json: m["img"]), why: m["why"] as? String)
        }) else { return nil }
        return (title, items)
      }
      guard let good = group(o["good"]), let avoid = group(o["avoid"]) else { return nil }
      self.title = title; self.good = good; self.avoid = avoid
      note = o["note"] as? String
      tool = (text, href)
    }
  }

  /// A card for another page: its path, name, the line under it (a breed's kind) and its photo.
  public struct Card: Sendable {
    public let path: String
    public let name: String
    public let sub: String?
    public let img: Image?

    init?(json v: Any) {
      guard let o = v as? [String: Any], let path = o["path"] as? String, let name = o["name"] as? String else { return nil }
      self.path = path; self.name = name
      sub = o["sub"] as? String
      img = Image(json: o["img"])
    }
  }

  /// A video about a fish: `lang` is its language as the page names it ("EN", "tiếng Việt").
  public struct VideoItem: Sendable {
    public let youtubeId: String
    public let title: String
    public let durationSec: Int
    public let lang: String

    init?(json v: Any) {
      guard let o = v as? [String: Any], let id = o["youtubeId"] as? String, let title = o["title"] as? String,
            let d = o["durationSec"] as? Int, let lang = o["lang"] as? String else { return nil }
      youtubeId = id; self.title = title; durationSec = d; self.lang = lang
    }
  }

  public indirect enum Block: Sendable {
    /// A heading; `id` is its anchor (the contents and `#id` links point at it).
    case heading(String, id: String?)
    case paragraph([Run])
    /// Each item is blocks: mostly one paragraph, sometimes a list inside it.
    case list(ordered: Bool, items: [[Block]])
    /// Rows of cells; `head` is the header row, when the table has one.
    case table(head: [[Run]]?, rows: [[[Run]]])
    /// A photo in the text; `href` is the page it shows (a fish or plant named there).
    case figure(Image, caption: [Run], href: String?)
    /// Stills from the guide's video, each playing it from that moment.
    case moments(title: String, youtubeId: String, items: [Still])
    /// A guide's key points; a fish's summary (`text`, one paragraph; its `items` the same, for older apps), the mistakes
    /// keepers make, and who wrote it.
    case summary(title: String, items: [String], text: String?, mistakes: (title: String, items: [String])?, by: String?)
    case faq(title: String, items: [(q: String, a: String)])
    /// The sources the page cites; `id` is the anchor its credit links to. On a fish's or plant's page they're numbered
    /// as the marks in its text, and `note` says on what terms the text uses them.
    case refs(title: String, id: String?, items: [(title: String, url: String)], note: String?)
    /// Other pages by their paths, each one the app index lists.
    case pages(title: String, paths: [String])
    /// A part only the web page can show (or one this app can't read): the app offers to open the page there.
    case web
    /// A fish's or plant's photo gallery, each photo credited. `strip`: the photos the page's row shows, by their place
    /// in `photos`. `note`: where the photos come from and under what licences. `href`: the gallery's web page.
    case gallery(title: String, note: String, photos: [Image], strip: [Int], href: String?)
    /// What each figure of a fish's facts rests on (the figures themselves are the index's).
    case trust(title: String, legend: String?, rows: [TrustRow])
    /// Fish to keep with this one and away from it, and the tank-mates tool set to this fish.
    case mates(Mates)
    /// What a fish's temperatures mean for a tank in Vietnam with no heater or chiller, region by region.
    case climate(title: String, items: [(label: String, ok: Bool, text: String)], note: String)
    /// Cards for other pages, drawn from what they carry (a fish's breeds, which the index may not list).
    case cards(title: String, items: [Card])
    /// Videos about a fish (not guides), each played on YouTube.
    case videos(title: String, items: [VideoItem])

    /// The block's `t` in the format.
    public var t: String {
      switch self {
      case .heading: "h"
      case .paragraph: "p"
      case .list: "list"
      case .table: "table"
      case .figure: "figure"
      case .moments: "moments"
      case .summary: "summary"
      case .faq: "faq"
      case .refs: "refs"
      case .pages: "pages"
      case .web: "web"
      case .gallery: "gallery"
      case .trust: "trust"
      case .mates: "mates"
      case .climate: "climate"
      case .cards: "cards"
      case .videos: "videos"
      }
    }

    /// The block as typed, `.web` for one this app doesn't know or can't read.
    static func read(_ v: Any) -> Block { Block(json: v) ?? .web }

    private init?(json v: Any) {
      guard let o = v as? [String: Any], let t = o["t"] as? String else { return nil }
      let title = o["title"] as? String
      let cells = { (row: Any) in each(row) { Run.list($0) } }
      switch t {
      case "h":
        guard let text = o["text"] as? String else { return nil }
        self = .heading(text, id: o["id"] as? String)
      case "p":
        guard let c = Run.list(o["c"]) else { return nil }
        self = .paragraph(c)
      case "list":
        guard let items = each(o["items"], { each($0) { Block.read($0) } }) else { return nil }
        self = .list(ordered: o["ordered"] as? Bool ?? false, items: items)
      case "table":
        guard let rows = each(o["rows"], cells) else { return nil }
        var head: [[Run]]?
        if let h = o["head"] {
          guard let r = cells(h) else { return nil }
          head = r
        }
        self = .table(head: head, rows: rows)
      case "figure":
        var caption: [Run] = []
        if let c = o["caption"] {
          guard let r = Run.list(c) else { return nil }
          caption = r
        }
        guard let img = Image(json: o["img"]) else { return nil }
        self = .figure(img, caption: caption, href: o["href"] as? String)
      case "moments":
        let items = each(o["items"]) { s -> Still? in
          guard let s = s as? [String: Any], let at = s["at"] as? Int, let img = Image(json: s["img"]), let caption = s["caption"] as? String else { return nil }
          return Still(at: at, img: img, caption: caption)
        }
        guard let title, let id = o["youtubeId"] as? String, let items else { return nil }
        self = .moments(title: title, youtubeId: id, items: items)
      case "summary":
        guard let title, let items = o["items"] as? [String] else { return nil }
        let m = o["mistakes"] as? [String: Any]
        var mistakes: (title: String, items: [String])?
        if let t = m?["title"] as? String, let i = m?["items"] as? [String] { mistakes = (t, i) }
        self = .summary(title: title, items: items, text: o["text"] as? String, mistakes: mistakes, by: o["by"] as? String)
      case "faq":
        let items = each(o["items"]) { i -> (q: String, a: String)? in
          guard let i = i as? [String: Any], let q = i["q"] as? String, let a = i["a"] as? String else { return nil }
          return (q, a)
        }
        guard let title, let items else { return nil }
        self = .faq(title: title, items: items)
      case "refs":
        let items = each(o["items"]) { i -> (title: String, url: String)? in
          guard let i = i as? [String: Any], let t = i["title"] as? String, let u = i["url"] as? String else { return nil }
          return (t, u)
        }
        guard let title, let items else { return nil }
        self = .refs(title: title, id: o["id"] as? String, items: items, note: o["note"] as? String)
      case "pages":
        guard let title, let paths = o["paths"] as? [String] else { return nil }
        self = .pages(title: title, paths: paths)
      case "web": self = .web
      case "gallery":
        guard let title, let note = o["note"] as? String, let photos = each(o["photos"], { Image(json: $0) }), let strip = o["strip"] as? [Int],
              strip.allSatisfy(photos.indices.contains) else { return nil }
        self = .gallery(title: title, note: note, photos: photos, strip: strip, href: o["href"] as? String)
      case "trust":
        guard let title, let rows = each(o["rows"], { TrustRow(json: $0) }) else { return nil }
        self = .trust(title: title, legend: o["legend"] as? String, rows: rows)
      case "mates":
        guard let m = Mates(json: o) else { return nil }
        self = .mates(m)
      case "climate":
        let items = each(o["items"]) { i -> (label: String, ok: Bool, text: String)? in
          guard let i = i as? [String: Any], let l = i["label"] as? String, let ok = i["ok"] as? Bool, let t = i["text"] as? String else { return nil }
          return (l, ok, t)
        }
        guard let title, let items, let note = o["note"] as? String else { return nil }
        self = .climate(title: title, items: items, note: note)
      case "cards":
        guard let title, let items = each(o["items"], { Card(json: $0) }) else { return nil }
        self = .cards(title: title, items: items)
      case "videos":
        guard let title, let items = each(o["items"], { VideoItem(json: $0) }) else { return nil }
        self = .videos(title: title, items: items)
      default: return nil
      }
    }
  }

  /// A page as the site writes it; nil if it isn't one this app can read (another version, no title, no blocks).
  public init?(data: Data) {
    guard let o = try? JSONSerialization.jsonObject(with: data) else { return nil }
    self.init(json: o)
  }

  init?(json v: Any) {
    guard let o = v as? [String: Any], o["v"] as? Int == Self.version, let kind = o["kind"] as? String, let path = o["path"] as? String,
          let title = o["title"] as? String, let blocks = o["blocks"] as? [Any] else { return nil }
    self.kind = kind; self.path = path; self.title = title
    self.blocks = blocks.map(Block.read)
    // The parts around the text, read as leniently: one this app can't read is left out, never the page.
    sub = o["sub"] as? String
    meta = o["meta"] as? String
    `where` = Run.list(o["where"]) ?? []
    aka = o["aka"] as? String
    credit = Run.list(o["credit"]) ?? []
    lead = Image(json: o["lead"])
    video = Video(json: o["video"])
    let talk = o["talk"] as? [String: Any]
    let comments = talk?["comments"] as? String, photos = talk?["photos"] as? String
    self.talk = comments == nil && photos == nil ? nil : Talk(comments: comments, photos: photos)
  }

  /// Which shard of `/app/pages/<lang>/<kind>-<n>.json` holds `path`, of `count` (the app index's `pages`): 32-bit
  /// FNV-1a over the path's UTF-8 bytes, as the site picks it.
  public static func shard(of path: String, count: Int) -> Int {
    var h: UInt32 = 0x811c_9dc5
    for b in path.utf8 { h = (h ^ UInt32(b)) &* 0x0100_0193 }
    return Int(h) % max(count, 1)
  }
}

/// One file of pages, `/app/pages/<lang>/<kind>-<n>.json`: every page of that kind whose path falls in it. A page this
/// app can't read is left out (the app opens it on the web); a shard of another version is unreadable.
public struct PageShard: Sendable {
  public let pages: [String: PageDoc]

  public init?(data: Data) {
    guard let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], o["v"] as? Int == PageDoc.version,
          let list = o["pages"] as? [String: Any] else { return nil }
    var pages: [String: PageDoc] = [:]
    for (path, v) in list { if let d = PageDoc(json: v), d.path == path { pages[path] = d } }
    self.pages = pages
  }
}

/// Every element of the list `v` read by `f`, or nil if it isn't a list or one of them can't be read.
private func each<T>(_ v: Any?, _ f: (Any) -> T?) -> [T]? {
  guard let a = v as? [Any] else { return nil }
  var out: [T] = []
  out.reserveCapacity(a.count)
  for x in a {
    guard let y = f(x) else { return nil }
    out.append(y)
  }
  return out
}

extension PageDoc {
  /// Every picture the page shows at first, in order: the video's or the lead photo, then each photo and video still in
  /// the text (in lists too), a gallery's row (not every photo of it: the oscar's has 131), the tank-mates', breeds' and
  /// videos' pictures. What keeping the page for offline keeps with it.
  public var pictures: [String] {
    var out: [String] = []
    if let video { out.append(Self.thumbnail(video.youtubeId)) } else if let lead { out.append(lead.src) }
    func walk(_ blocks: [Block]) {
      for b in blocks {
        switch b {
        case let .figure(img, _, _): out.append(img.src)
        case let .moments(_, _, items): out += items.map(\.img.src)
        case let .list(_, items): items.forEach(walk)
        case let .gallery(_, _, photos, strip, _): out += strip.map { photos[$0].thumb ?? photos[$0].src }
        case let .mates(m): out += ((m.good?.items ?? []) + (m.avoid?.items ?? [])).compactMap { $0.img.map { $0.thumb ?? $0.src } }
        case let .cards(_, items): out += items.compactMap { $0.img.map { $0.thumb ?? $0.src } }
        case let .videos(_, items): out += items.map { Self.thumbnail($0.youtubeId) }
        default: break
        }
      }
    }
    walk(blocks)
    return out
  }

  /// A YouTube video's picture, as a page shows it.
  public static func thumbnail(_ youtubeId: String) -> String { "https://i.ytimg.com/vi/\(youtubeId)/hqdefault.jpg" }

  /// Whether `id` is a video id as YouTube gives them, 11 of A–Z, a–z, 0–9, `-` and `_`: the app plays only those in a
  /// page. Any other (one starting `//` makes no link, one with markup would break the player's page) opens on YouTube.
  public static func isYouTubeId(_ id: String) -> Bool {
    id.utf8.count == 11 && id.utf8.allSatisfy { c in
      (UInt8(ascii: "a")...UInt8(ascii: "z")).contains(c) || (UInt8(ascii: "A")...UInt8(ascii: "Z")).contains(c)
        || (UInt8(ascii: "0")...UInt8(ascii: "9")).contains(c) || c == UInt8(ascii: "-") || c == UInt8(ascii: "_")
    }
  }
}

/// A page's list of other pages. One longer than 30 (the fish a kind of kit is for: over a thousand on the site) shows
/// 12 in place and the rest a tap away, so what follows it on the page stays in reach.
public enum PageList {
  public static func inPlace(_ count: Int) -> Int { count > 30 ? 12 : count }
}

/// Whether to keep a shelf of pages for offline now: on Wi-Fi, go; on mobile data or in Low Data Mode, ask first; with
/// no network or too little room on the phone, say so instead.
public enum KeepPlan: Equatable, Sendable {
  case go, ask, offline, noRoom

  /// `freeBytes`: room for the app's important data (volumeAvailableCapacityForImportantUsage), nil if unknown.
  public static func of(online: Bool, expensive: Bool, constrained: Bool, freeBytes: Int64?) -> KeepPlan {
    guard online else { return .offline }
    if let freeBytes, freeBytes < minimumFree { return .noRoom }
    return expensive || constrained ? .ask : .go
  }

  /// The pictures' cache holds 200 MB at most; the pages themselves are small. With less room than that and some to
  /// spare, keeping a shelf could fill the phone.
  public static let minimumFree: Int64 = 250 << 20
}
