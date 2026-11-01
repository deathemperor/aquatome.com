import Foundation

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

  /// "guide", "fish", "plant", "glossary", or one a newer site adds.
  public let kind: String
  /// The web page: what "open on the web" and sharing use, and the app index's `path` for it.
  public let path: String
  public let title: String
  /// A scientific name.
  public let sub: String?
  /// The line above the title, as the site writes it ("Chăm sóc · đọc khoảng 6 phút").
  public let meta: String?
  /// Whose page this is ("Theo Aquarium Breeder"), linked as on the site; empty when the page has none.
  public let credit: [Run]
  public let lead: Image?
  public let video: Video?
  public let blocks: [Block]

  /// Text, plain or styled. `href` is a site path, an absolute URL, or `#id` (the block with that id on this page).
  public struct Run: Sendable {
    public let text: String
    public var bold = false
    public var italic = false
    public var href: String?
    /// A glossary term's or a citation's explanation, shown when the link is tapped: (term, text).
    public var tip: (term: String, text: String)?

    public init(_ text: String) { self.text = text }

    /// A string, or `{text, b?, i?, href?, tip?}`.
    init?(json v: Any) {
      if let s = v as? String { self.init(s); return }
      guard let o = v as? [String: Any], let text = o["text"] as? String else { return nil }
      self.init(text)
      bold = o["b"] as? Bool ?? false
      italic = o["i"] as? Bool ?? false
      href = o["href"] as? String
      if let t = o["tip"] as? [String: Any], let term = t["term"] as? String, let text = t["text"] as? String { tip = (term, text) }
    }
    static func list(_ v: Any?) -> [Run]? { each(v) { Run(json: $0) } }
  }

  public struct Image: Sendable {
    public let src: String
    public let w: Int
    public let h: Int
    public let alt: String?
    /// The photo's credit as the page shows it: the line ("Ảnh: Aquarium Breeder"), its licence, the photo's own page.
    public let credit: (text: String, licence: String, url: String?)?

    init?(json v: Any?) {
      guard let o = v as? [String: Any], let src = o["src"] as? String, let w = o["w"] as? Int, let h = o["h"] as? Int, w > 0, h > 0 else { return nil }
      self.src = src; self.w = w; self.h = h
      alt = o["alt"] as? String
      let c = o["credit"] as? [String: Any]
      if let text = c?["text"] as? String, let licence = c?["licence"] as? String { credit = (text, licence, c?["url"] as? String) } else { credit = nil }
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

    init?(json v: Any?) {
      guard let o = v as? [String: Any], let id = o["youtubeId"] as? String, let title = o["title"] as? String,
            let channel = o["channel"] as? String, let d = o["durationSec"] as? Int else { return nil }
      youtubeId = id; self.title = title; self.channel = channel; durationSec = d
      subtitles = o["subtitles"] as? String
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
    case summary(title: String, items: [String])
    case faq(title: String, items: [(q: String, a: String)])
    /// The sources the page cites; `id` is the anchor its credit links to.
    case refs(title: String, id: String?, items: [(title: String, url: String)])
    /// Other pages by their paths, each one the app index lists.
    case pages(title: String, paths: [String])
    /// A part only the web page can show (or one this app can't read): the app offers to open the page there.
    case web

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
        self = .summary(title: title, items: items)
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
        self = .refs(title: title, id: o["id"] as? String, items: items)
      case "pages":
        guard let title, let paths = o["paths"] as? [String] else { return nil }
        self = .pages(title: title, paths: paths)
      case "web": self = .web
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
    credit = Run.list(o["credit"]) ?? []
    lead = Image(json: o["lead"])
    video = Video(json: o["video"])
  }

  /// Which shard of `/app/pages/<lang>/<kind>-<n>.json` holds `path`, of `count` (the app index's `pages`): 32-bit
  /// FNV-1a over the path's UTF-8 bytes, as the site picks it.
  public static func shard(of path: String, count: Int) -> Int {
    var h: UInt32 = 0x811c_9dc5
    for b in path.utf8 { h = (h ^ UInt32(b)) &* 0x0100_0193 }
    return Int(h % UInt32(max(count, 1)))
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
