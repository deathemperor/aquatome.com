import Handbook
import SwiftUI
import UIKit

/// A page the app draws itself from the site's blocks (PageDoc, kept on the phone by PageCache): the site's page, read
/// offline once opened. The blocks become a few kinds of piece (styled text, photos, links to pages, the web page for a
/// part it can't draw): one view per kind of block cost the app 90 kB.
struct NativePage: View {
  let pieces: [Piece]
  let web: () -> Void
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen
  @State private var tip: Tip?

  /// What the page shows, in order.
  enum Piece {
    /// Text: a heading, paragraphs, a list, a table, questions, sources. `anchor` is the id a `#id` link scrolls to.
    case text(AttributedString, anchor: String? = nil, boxed: Bool = false)
    /// A photo with its caption and credit; tapped, `href` (the page it shows, or the video at a moment).
    case photo(src: String, ratio: CGFloat, alt: String?, caption: AttributedString, href: URL?, play: Bool = false)
    /// Other pages the index lists, each opening in the app.
    case pages(String, [String])
    /// A part the app can't draw: the web page instead.
    case web
  }

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 14) {
          ForEach(pieces.indices, id: \.self) { i in piece(i) }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      // Links in the text: a page the index lists opens in the app, `#id` scrolls to it, a word's tip shows.
      .environment(\.openURL, OpenURLAction { open($0, proxy) })
    }
    .accessibilityIdentifier("native-page")
    .alert(tip?.term ?? "", isPresented: Binding(get: { tip != nil }, set: { if !$0 { tip = nil } }), presenting: tip) { t in
      if let h = t.href, let u = URL(string: h) { Button("Xem thêm") { _ = open(u, nil) } }
      Button("Đóng", role: .cancel) {}
    } message: { t in
      Text(t.text)
    }
  }

  @ViewBuilder private func piece(_ i: Int) -> some View {
    switch pieces[i] {
    case let .text(s, anchor, boxed):
      Text(s)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(boxed ? 12 : 0)
        .background(boxed ? AnyShapeStyle(.fill.tertiary) : AnyShapeStyle(Color.clear), in: .rect(cornerRadius: 10))
        .id(anchor ?? "piece-\(i)")
    case let .photo(src, ratio, alt, caption, href, play):
      VStack(alignment: .leading, spacing: 4) {
        Button { if let href { _ = open(href, nil) } } label: {
          PageImage(src: src, ratio: ratio, alt: alt)
            .overlay { if play { Image(systemName: "play.circle.fill").font(.system(size: 56)).foregroundStyle(.white, .black.opacity(0.5)) } }
        }
        .buttonStyle(.plain)
        .disabled(href == nil)
        if !caption.characters.isEmpty { Text(caption).font(.footnote).foregroundStyle(.secondary) }
      }
    case let .pages(title, paths):
      PagesBlock(title: title, paths: paths)
    case .web:
      Button(action: web) { Label("Xem phần này trên web", systemImage: "safari") }
        .buttonStyle(.bordered)
        .accessibilityIdentifier("page-web")
    }
  }

  private func open(_ url: URL, _ proxy: ScrollViewProxy?) -> OpenURLAction.Result {
    switch url.scheme {
    case "page-anchor":
      let id = String(url.absoluteString.dropFirst("page-anchor:".count)).removingPercentEncoding ?? ""
      withAnimation { proxy?.scrollTo(id, anchor: .top) }
      return .handled
    case "page-tip":
      tip = Tip(url)
      return .handled
    default:
      let u = url.scheme == nil ? URL(string: url.relativeString, relativeTo: handbook.site)?.absoluteURL ?? url : url
      if let screen = AppScreen.of(u, site: handbook.site, listed: { handbook.item(at: $0) != nil }) {
        openScreen(screen)
        return .handled
      }
      // Another site, or a page of the site the app index leaves out: the browser.
      UIApplication.shared.open(u)
      return .handled
    }
  }

  /// The page as pieces: worked out once, when it's read, not on every redraw.
  static func pieces(_ doc: PageDoc) -> [Piece] {
    var out: [Piece] = []
    if let meta = doc.meta { out.append(.text(styled(meta, .subheadline, secondary: true))) }
    out.append(.text(styled(doc.title, .title.bold())))
    if let sub = doc.sub { out.append(.text(styled(sub, .body.italic(), secondary: true))) }
    if !doc.credit.isEmpty { out.append(.text(styled(doc.credit, font: .footnote))) }
    if let v = doc.video {
      var cap = styled("\(v.title) · \(v.channel) · \(clock(v.durationSec))")
      if let s = v.subtitles { cap += styled("\n" + s, .caption.bold()) }
      for ch in v.chapters ?? [] {
        var line = AttributedString("\n\(clock(ch.at))  \(ch.title)")
        line.link = youtube(v.youtubeId, at: ch.at)
        cap += line
      }
      out.append(.photo(src: "https://i.ytimg.com/vi/\(v.youtubeId)/hqdefault.jpg", ratio: 16 / 9, alt: String(localized: "Phát video: \(v.title)"), caption: cap,
                        href: youtube(v.youtubeId, at: 0), play: true))
    } else if let lead = doc.lead {
      out.append(photo(lead, caption: [], href: nil))
    }
    var webBefore = false
    for b in doc.blocks {
      // A run of parts it can't draw is one offer of the web page.
      if case .web = b { if !webBefore { out.append(.web) }; webBefore = true; continue }
      webBefore = false
      add(b, to: &out)
    }
    return out
  }

  private static func add(_ b: PageDoc.Block, to out: inout [Piece]) {
    switch b {
    case let .heading(text, id):
      out.append(.text(styled(text, .title3.bold()), anchor: id))
    case let .paragraph(c):
      out.append(.text(styled(c)))
    case let .list(ordered, items):
      var text = AttributedString()
      list(ordered, items, depth: 0, into: &text, out: &out)
      if !text.characters.isEmpty { out.append(.text(text)) }
    case let .table(head, rows):
      out.append(.text(table(head, rows)))
    case let .figure(img, caption, href):
      out.append(photo(img, caption: caption, href: href.flatMap(URL.init(string:))))
    case let .moments(title, id, items):
      out.append(.text(styled(title, .headline)))
      for s in items {
        out.append(.photo(src: s.img.src, ratio: CGFloat(s.img.w) / CGFloat(s.img.h), alt: s.img.alt, caption: styled("\(clock(s.at)) · \(s.caption)"),
                          href: youtube(id, at: s.at), play: true))
      }
    case let .summary(title, items):
      out.append(.text(styled(title, .headline)))
      out.append(.text(styled(items.map { "• " + $0 }.joined(separator: "\n")), boxed: true))
    case let .faq(title, items):
      out.append(.text(styled(title, .title3.bold())))
      for qa in items { out.append(.text(styled(qa.q, .body.bold()) + styled("\n" + qa.a))) }
    case let .refs(title, id, items):
      out.append(.text(styled(title, .title3.bold()), anchor: id))
      var text = AttributedString()
      for (i, r) in items.enumerated() {
        var line = AttributedString((i > 0 ? "\n" : "") + r.title)
        line.link = URL(string: r.url)
        text += line
      }
      out.append(.text(text))
    case let .pages(title, paths):
      out.append(.pages(title, paths))
    case .web:
      out.append(.web)
    }
  }

  /// A list's items as lines ("• " or "1. ", nested ones indented); a part of an item that isn't text comes after.
  private static func list(_ ordered: Bool, _ items: [[PageDoc.Block]], depth: Int, into text: inout AttributedString, out: inout [Piece]) {
    let indent = String(repeating: "    ", count: depth)
    for (i, item) in items.enumerated() {
      var first = true
      for b in item {
        switch b {
        case let .paragraph(c):
          let lead = first ? (ordered ? "\(i + 1). " : "• ") : "  "
          text += AttributedString((text.characters.isEmpty ? "" : "\n") + indent + lead) + styled(c)
        case let .list(o, sub):
          list(o, sub, depth: depth + 1, into: &text, out: &out)
        default:
          if !text.characters.isEmpty { out.append(.text(text)); text = AttributedString() }
          add(b, to: &out)
        }
        first = false
      }
    }
  }

  /// A table as lines, which read on a phone where columns don't fit: with a header, each row's first cell, then each
  /// other cell under its column's name.
  private static func table(_ head: [[PageDoc.Run]]?, _ rows: [[[PageDoc.Run]]]) -> AttributedString {
    var text = AttributedString()
    for (r, row) in rows.enumerated() {
      if r > 0 { text += AttributedString("\n\n") }
      for (c, cell) in row.enumerated() {
        if c > 0 { text += AttributedString("\n") }
        if c == 0 { text += styled(cell, font: .body.bold()); continue }
        if let h = head?[safe: c], !h.isEmpty { text += styled(h) + AttributedString(": ") }
        text += styled(cell)
      }
    }
    return text
  }

  private static func photo(_ img: PageDoc.Image, caption: [PageDoc.Run], href: URL?) -> Piece {
    var cap = styled(caption)
    if let c = img.credit {
      var line = AttributedString((cap.characters.isEmpty ? "" : "\n") + c.text + " · " + c.licence)
      line.font = .caption2
      line.link = c.url.flatMap(URL.init(string:))
      cap += line
    }
    return .photo(src: img.src, ratio: CGFloat(img.w) / CGFloat(img.h), alt: img.alt, caption: cap, href: href)
  }
}

/// A word's explanation (a glossary term, a citation), shown when its link is tapped.
private struct Tip {
  let term: String
  let text: String
  let href: String?

  init?(_ url: URL) {
    let q = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    func v(_ k: String) -> String? { q.first { $0.name == k }?.value }
    guard let term = v("term"), let text = v("text") else { return nil }
    self.term = term; self.text = text; href = v("href")
  }
}

private func styled(_ s: String, _ font: Font? = nil, secondary: Bool = false) -> AttributedString {
  var a = AttributedString(s)
  a.font = font
  if secondary { a.foregroundColor = .secondary }
  return a
}

/// Runs as styled text; links as URLs the page's `openURL` understands (a site path is left relative).
private func styled(_ runs: [PageDoc.Run], font: Font? = nil) -> AttributedString {
  runs.reduce(into: AttributedString()) { s, r in
    var a = AttributedString(r.text)
    a.font = font
    var intent: InlinePresentationIntent = []
    if r.bold { intent.insert(.stronglyEmphasized) }
    if r.italic { intent.insert(.emphasized) }
    if !intent.isEmpty { a.inlinePresentationIntent = intent }
    if let tip = r.tip {
      var c = URLComponents()
      c.scheme = "page-tip"
      c.queryItems = [.init(name: "term", value: tip.term), .init(name: "text", value: tip.text)] + (r.href.map { [.init(name: "href", value: $0)] } ?? [])
      a.link = c.url
    } else if let h = r.href {
      a.link = h.hasPrefix("#") ? URL(string: "page-anchor:" + (h.dropFirst().addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "")) : URL(string: h)
    }
    s += a
  }
}

private extension Array {
  subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

/// Other pages the index lists, each opening in the app.
private struct PagesBlock: View {
  let title: String
  let paths: [String]
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let items = paths.compactMap(handbook.item(at:))
    if !items.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Text(title).font(.title3.bold())
        ForEach(items) { item in
          NavigationLink(value: item) {
            HStack {
              ItemRow(item: item)
              Spacer()
              Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            }
          }
          .buttonStyle(.plain)
        }
      }
    }
  }
}

/// A picture of a page the app draws, the size the page gives it before it's here.
struct PageImage: View {
  let src: String
  let ratio: CGFloat
  var alt: String?
  @State private var image: UIImage?

  var body: some View {
    Rectangle().fill(.fill.tertiary)
      .aspectRatio(ratio, contentMode: .fit)
      .overlay { if let image { Image(uiImage: image).resizable().scaledToFill() } }
      .clipShape(.rect(cornerRadius: 8))
      .accessibilityElement()
      .accessibilityLabel(Text(verbatim: alt ?? ""))
      .task(id: src) { image = await PageImages.load(src) }
  }
}

/// The pictures of pages the app draws, kept on the phone (up to 200 MB, in the caches folder) so a page read once
/// shows them offline. Not bundled.
enum PageImages {
  static let session: URLSession = {
    let c = URLSessionConfiguration.default
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "page-images")
    c.urlCache = URLCache(memoryCapacity: 16 << 20, diskCapacity: 200 << 20, directory: dir)
    c.requestCachePolicy = .returnCacheDataElseLoad
    return URLSession(configuration: c)
  }()

  static func load(_ src: String) async -> UIImage? {
    #if DEBUG
    // UI tests read no network.
    if ProcessInfo.processInfo.arguments.contains("-fixed-handbook") { return nil }
    #endif
    guard let u = URL(string: src), let (data, _) = try? await session.data(from: u) else { return nil }
    return UIImage(data: data)
  }
}

private func youtube(_ id: String, at: Int) -> URL { URL(string: "https://www.youtube.com/watch?v=\(id)" + (at > 0 ? "&t=\(at)s" : ""))! }

/// 75 → "1:15", 3725 → "1:02:05", as the site writes a video's times (lib/video.ts).
private func clock(_ s: Int) -> String {
  s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
}
