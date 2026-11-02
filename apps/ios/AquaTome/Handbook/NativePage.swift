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
  /// A page of the site the app can't show itself (one the index leaves out, a tool set by the link): the web page, in
  /// the app.
  @State private var onSite: URL?
  /// VoiceOver's place: moved with a `#id` link, as the scroll is.
  @AccessibilityFocusState private var focus: String?

  /// What the page shows, in order.
  enum Piece {
    /// Text: a heading, paragraphs, a list, a table, questions, sources. `anchor` is the id a `#id` link scrolls to;
    /// `header`, a title or heading (VoiceOver's headings rotor).
    case text(AttributedString, anchor: String? = nil, boxed: Bool = false, header: Bool = false)
    /// A photo with its caption and credit; tapped, `href` (the page it shows, or the video at a moment).
    case photo(src: String, ratio: CGFloat, alt: String?, caption: AttributedString, href: URL?, play: Bool = false)
    /// Other pages the index lists, each opening in the app.
    case pages(String, [String])
    /// Other pages as cards drawn from what they carry (tank-mates, breeds), each opening in the app, or else on the web;
    /// under a subheading (tank-mates' "Hợp với") or none (the section's heading is its own piece).
    case cards(String?, [Card])
    /// A gallery's row of photos, each credited; tapped, all of its photos, full size.
    case gallery(title: String, note: String, photos: [PageDoc.Image], strip: [Int])
    /// Text shown once its title is tapped (the sources behind each figure).
    case more(String, AttributedString)
    /// A part the app can't draw: the web page instead.
    case web
    /// Its readers' photos and comments, read from the site when the page opens.
    case readers(PageDoc.Talk)
  }

  /// A card for another page: `sub`, the line under its name (a breed's kind, why to keep a fish away).
  struct Card {
    let path: String
    let name: String
    let sub: String?
    let img: PageDoc.Image?
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
    .navigationDestination(item: $onSite) { WebScreen(url: $0) }
    .alert(tip?.term ?? "", isPresented: Binding(get: { tip != nil }, set: { if !$0 { tip = nil } }), presenting: tip) { t in
      if let h = t.href, let u = URL(string: h) { Button("Xem thêm") { _ = open(u, nil) } }
      Button("Đóng", role: .cancel) {}
    } message: { t in
      Text(t.text)
    }
  }

  @ViewBuilder private func piece(_ i: Int) -> some View {
    switch pieces[i] {
    case let .text(s, anchor, boxed, header):
      Text(s)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(boxed ? 12 : 0)
        .background(boxed ? AnyShapeStyle(.fill.tertiary) : AnyShapeStyle(Color.clear), in: .rect(cornerRadius: 10))
        .accessibilityAddTraits(header ? .isHeader : [])
        .accessibilityFocused($focus, equals: anchor ?? "piece-\(i)")
        .id(anchor ?? "piece-\(i)")
    case let .photo(src, ratio, alt, caption, href, play):
      VStack(alignment: .leading, spacing: 4) {
        let image = PageImage(src: src, ratio: ratio, alt: alt)
          .overlay { if play { Image(systemName: "play.circle.fill").font(.system(size: 56)).foregroundStyle(.white, .black.opacity(0.5)) } }
        if let href {
          // Tapped, the page it shows or the video at that moment; read as its words, or else its caption.
          Button { _ = open(href, nil) } label: { image }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: alt ?? String(caption.characters)))
        } else {
          image
        }
        if !caption.characters.isEmpty { Text(caption).font(.footnote).foregroundStyle(.secondary) }
      }
    case let .pages(title, paths):
      PagesBlock(title: title, paths: paths)
    case let .cards(title, cards):
      VStack(alignment: .leading, spacing: 8) {
        if let title { Text(title).font(.headline).accessibilityAddTraits(.isHeader) }
        ForEach(cards.indices, id: \.self) { j in
          let c = cards[j]
          Button { if let u = URL(string: c.path) { _ = open(u, nil) } } label: {
            HStack(spacing: 12) {
              if let img = c.img { PageImage(src: img.thumb ?? img.src, ratio: CGFloat(img.w) / CGFloat(img.h)).frame(width: 72) }
              VStack(alignment: .leading, spacing: 2) {
                Text(c.name).font(.body.weight(.semibold))
                if let sub = c.sub { Text(sub).font(.subheadline).foregroundStyle(.secondary) }
              }
              Spacer(minLength: 0)
              Image(systemName: "chevron.right").font(.footnote).foregroundStyle(.tertiary)
            }
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("card")
          // Its photo's credit, linking the photo's own page, under the card (a link inside the card would be the card).
          if let credit = c.img.flatMap(credit) { Text(credit) }
        }
      }
    case let .gallery(title, note, photos, strip):
      GalleryRow(title: title, note: note, photos: photos, strip: strip)
    case let .more(title, text):
      DisclosureGroup {
        Text(text).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
      } label: {
        Text(title).font(.headline)
      }
      .accessibilityIdentifier("page-more")
    case .web:
      Button(action: web) { Label("Xem phần này trên web", systemImage: "safari") }
        .buttonStyle(.bordered)
        .accessibilityIdentifier("page-web")
    case let .readers(talk):
      ReadersPart(talk: talk)
    }
  }

  private func open(_ url: URL, _ proxy: ScrollViewProxy?) -> OpenURLAction.Result {
    switch url.scheme {
    case "page-anchor":
      let id = String(url.absoluteString.dropFirst("page-anchor:".count)).removingPercentEncoding ?? ""
      withAnimation { proxy?.scrollTo(id, anchor: .top) }
      focus = id
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
      if PageRoute.of(u, site: handbook.site, mainFrame: true, newWindow: false) == .app {
        onSite = u
        return .handled
      }
      // Another site: the browser.
      UIApplication.shared.open(u)
      return .handled
    }
  }

  /// The page as pieces: worked out once, when it's read, not on every redraw.
  static func pieces(_ doc: PageDoc) -> [Piece] {
    var out: [Piece] = []
    if let meta = doc.meta { out.append(.text(styled(meta, .subheadline, secondary: true))) }
    if !doc.where.isEmpty { out.append(.text(styled(doc.where, font: .subheadline))) }
    out.append(.text(styled(doc.title, .title.bold()), header: true))
    if let sub = doc.sub { out.append(.text(styled(sub, .body.italic(), secondary: true))) }
    if let aka = doc.aka { out.append(.text(styled(aka, .footnote, secondary: true))) }
    if !doc.credit.isEmpty { out.append(.text(styled(doc.credit, font: .footnote))) }
    if let v = doc.video {
      var cap = styled("\(v.title) · \(v.channel) · \(clock(v.durationSec))")
      if let s = v.subtitles { cap += styled("\n" + s, .caption.bold()) }
      for ch in v.chapters ?? [] {
        var line = AttributedString("\n\(clock(ch.at))  \(ch.title)")
        line.link = youtube(v.youtubeId, at: ch.at)
        cap += line
      }
      out.append(.photo(src: PageDoc.thumbnail(v.youtubeId), ratio: 16 / 9, alt: String(localized: "Phát video: \(v.title)"), caption: cap,
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
    if let talk = doc.talk { out.append(.readers(talk)) }
    return out
  }

  private static func add(_ b: PageDoc.Block, to out: inout [Piece]) {
    switch b {
    case let .heading(text, id):
      out.append(.text(styled(text, .title3.bold()), anchor: id, header: true))
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
      out.append(.text(styled(title, .headline), header: true))
      for s in items {
        out.append(.photo(src: s.img.src, ratio: CGFloat(s.img.w) / CGFloat(s.img.h), alt: s.img.alt, caption: styled("\(clock(s.at)) · \(s.caption)"),
                          href: youtube(id, at: s.at), play: true))
      }
    case let .summary(title, items, paragraph, mistakes, by):
      out.append(.text(styled(title, .headline), header: true))
      // A guide's key points as a list; a fish's summary, one paragraph, as it is.
      var text = paragraph.map { styled($0) } ?? styled(items.map { "• " + $0 }.joined(separator: "\n"))
      if let m = mistakes { text += styled("\n\n" + m.title, .body.bold()) + styled(m.items.map { "\n• " + $0 }.joined()) }
      if let by { text += styled("\n\n" + by, .footnote, secondary: true) }
      out.append(.text(text, boxed: true))
    case let .faq(title, items):
      out.append(.text(styled(title, .title3.bold()), header: true))
      for qa in items { out.append(.text(styled(qa.q, .body.bold()) + styled("\n" + qa.a))) }
    case let .refs(title, id, items, note):
      out.append(.text(styled(title, .title3.bold()), anchor: id, header: true))
      var text = AttributedString()
      for (i, r) in items.enumerated() {
        var line = AttributedString((i > 0 ? "\n" : "") + r.title)
        line.link = URL(string: r.url)
        text += line
      }
      // On what terms the text uses them.
      if let note { text += styled("\n\n" + note, .footnote, secondary: true) }
      out.append(.text(text))
    case let .pages(title, paths):
      out.append(.pages(title, paths))
    case .web:
      out.append(.web)
    case let .gallery(title, note, photos, strip, _):
      // No row on the page (too few photos for one): none here either.
      if !strip.isEmpty { out.append(.gallery(title: title, note: note, photos: photos, strip: strip)) }
    case let .trust(title, legend, rows):
      var text = AttributedString()
      if let legend, rows.contains(where: \.conflict) { text += styled("● " + legend + "\n\n", .footnote, secondary: true) }
      for (i, r) in rows.enumerated() {
        text += styled((i > 0 ? "\n\n" : "") + r.label + (r.conflict ? " ●" : ""), .subheadline.bold())
        if let note = r.note { text += styled("\n" + note, .footnote, secondary: true) }
        text += styled(r.items.map { "\n" + $0 }.joined(), .subheadline)
      }
      out.append(.more(title, text))
    case let .mates(m):
      out.append(.text(styled(m.title, .title3.bold()), header: true))
      for g in [m.good, m.avoid].compactMap({ $0 }) where !g.items.isEmpty {
        out.append(.cards(g.title, g.items.map { Card(path: $0.path, name: $0.name, sub: $0.why, img: $0.img) }))
      }
      let text = m.note.map { styled($0 + "\n", .footnote, secondary: true) } ?? AttributedString()
      var tool = AttributedString(m.tool.text)
      tool.link = URL(string: m.tool.href)
      out.append(.text(text + tool))
    case let .climate(title, items, note):
      out.append(.text(styled(title, .title3.bold()), header: true))
      var text = AttributedString()
      for (i, it) in items.enumerated() { text += styled((i > 0 ? "\n" : "") + (it.ok ? "✓ " : "⚠︎ ") + it.label + ": ", .body.bold()) + styled(it.text) }
      out.append(.text(text + styled("\n\n" + note, .footnote, secondary: true), boxed: true))
    case let .cards(title, items):
      out.append(.text(styled(title, .title3.bold()), header: true))
      out.append(.cards(nil, items.map { Card(path: $0.path, name: $0.name, sub: $0.sub, img: $0.img) }))
    case let .videos(title, items):
      out.append(.text(styled(title, .title3.bold()), header: true))
      for v in items {
        let length = v.durationSec > 0 ? " · \(clock(v.durationSec))" : ""
        out.append(.photo(src: PageDoc.thumbnail(v.youtubeId), ratio: 16 / 9, alt: String(localized: "Phát video: \(v.title)"),
                          caption: styled("\(v.title)\(length) · \(v.lang)"), href: youtube(v.youtubeId, at: 0), play: true))
      }
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
    if let c = credit(img) { cap += (cap.characters.isEmpty ? AttributedString() : AttributedString("\n")) + c }
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

/// A photo's credit as the site gives it, wherever the app shows the photo: who took it, its licence, linking its own page.
private func credit(_ img: PageDoc.Image) -> AttributedString? {
  guard let c = img.credit else { return nil }
  var line = AttributedString(c.licence.isEmpty ? c.text : c.text + " · " + c.licence)
  line.font = .caption2
  line.link = c.url.flatMap(URL.init(string:))
  return line
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
        Text(title).font(.title3.bold()).accessibilityAddTraits(.isHeader)
        // As in a list of results: a tool opens its tab (AppScreen), a page pushes on this one.
        ForEach(items) { item in Row(item: item, chevron: true).buttonStyle(.plain) }
      }
    }
  }
}

/// A gallery's row on its page: its photos as the site's row shows them, each with its credit; tapped, every photo of the
/// gallery full size, credited, in the gallery page's order.
private struct GalleryRow: View {
  let title: String
  let note: String
  let photos: [PageDoc.Image]
  let strip: [Int]
  /// Its "all photos" button's identifier: a page's own gallery's, or its readers'.
  var all = "gallery-all"
  @State private var shown: Int?

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title).font(.title3.bold()).accessibilityAddTraits(.isHeader)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 10) {
          ForEach(strip, id: \.self) { i in
            let p = photos[i]
            let ratio = CGFloat(p.w) / CGFloat(p.h)
            VStack(alignment: .leading, spacing: 2) {
              Button { shown = i } label: { PageImage(src: p.thumb ?? p.src, ratio: ratio, alt: p.alt).frame(height: 120) }
                .buttonStyle(.plain)
                // A photo without words of its own is still a button VoiceOver can name.
                .accessibilityLabel(Text(verbatim: p.alt ?? title))
              // Its credit whole, as narrow as the photo: the licence is never cut off.
              if let c = credit(p) { Text(c).fixedSize(horizontal: false, vertical: true) }
            }
            .frame(width: 120 * ratio)
          }
        }
      }
      Button("Xem tất cả \(photos.count) ảnh") { shown = strip.first ?? 0 }
        // Read with whose photos they are: a fish's page has its own and its readers'.
        .accessibilityLabel(Text(verbatim: title + ", ") + Text("Xem tất cả \(photos.count) ảnh"))
        .accessibilityIdentifier(all)
    }
    .sheet(isPresented: Binding(get: { shown != nil }, set: { if !$0 { shown = nil } })) {
      GalleryViewer(title: title, note: note, photos: photos, index: shown ?? 0)
    }
  }
}

/// Every photo of a gallery, one at a time, each with who took it, its licence and its own page.
private struct GalleryViewer: View {
  let title: String
  let note: String
  let photos: [PageDoc.Image]
  @State var index: Int
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      TabView(selection: $index) {
        ForEach(photos.indices, id: \.self) { i in
          let p = photos[i]
          ScrollView {
            VStack(alignment: .leading, spacing: 8) {
              // Its words read once, under it, not as the picture's label too.
              PageImage(src: p.src, ratio: CGFloat(p.w) / CGFloat(p.h))
              if let alt = p.alt, !alt.isEmpty { Text(alt).font(.subheadline) }
              if let c = credit(p) { Text(c) }
            }
            .padding()
          }
          .tag(i)
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .never))
      .safeAreaInset(edge: .bottom) {
        Text(verbatim: "\(index + 1)/\(photos.count)" + (note.isEmpty ? "" : " · \(note)")).font(.caption).foregroundStyle(.secondary).padding(8).frame(maxWidth: .infinity).background(.bar)
      }
      .navigationTitle(title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { Button("Đóng") { dismiss() } }
      .accessibilityIdentifier("gallery")
    }
  }
}

/// A page's readers' photos and comments (Readers), read when it opens: shown once the site has some, as its web page
/// shows those sections only once the site answers. The photos are a gallery's row, each credited with the reader's name.
private struct ReadersPart: View {
  let talk: PageDoc.Talk
  @Environment(HandbookModel.self) private var handbook
  @State private var comments: [Readers.Comment] = []
  @State private var photos: [Readers.Photo] = []

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      if !photos.isEmpty {
        GalleryRow(title: String(localized: "Ảnh bạn đọc"), note: "", photos: photos.map {
          PageDoc.Image(src: $0.url, w: $0.width, h: $0.height, alt: String(localized: "Ảnh của \($0.name)"), thumb: $0.thumb, credit: ($0.name, "", nil))
        }, strip: Array(photos.indices.prefix(10)), all: "readers-all")
      }
      if !comments.isEmpty {
        Text("Thảo luận").font(.title3.bold()).accessibilityAddTraits(.isHeader)
        ForEach(comments, id: \.id) { c in
          Text(line(c)).frame(maxWidth: .infinity, alignment: .leading).accessibilityIdentifier("comment")
        }
      }
    }
    .task(id: talk) {
      // Read again each time the page shows; one that fails (offline, or left before it came) keeps what was shown.
      let (c, p) = await handbook.readers(talk)
      guard !Task.isCancelled else { return }
      if let c { comments = c }
      if let p { photos = p }
    }
  }

  /// Who, when, whether the site marks it a good answer, then what they wrote: as the site's comment.
  private func line(_ c: Readers.Comment) -> AttributedString {
    var out = styled(c.name, .body.bold())
    out += styled("  " + Readers.day(c.createdAt, lang: handbook.lang), .footnote, secondary: true)
    if c.helpful { out += styled("  " + String(localized: "Trả lời hay"), .footnote.bold()) }
    return out + styled("\n" + c.body)
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
      // No words for it: VoiceOver reads the caption under it instead (a linked one, its button, as the caption).
      .accessibilityHidden(alt == nil)
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

  /// The pictures of pages kept for offline: in Application Support, which the system doesn't empty when the phone is
  /// short of room (the caches folder it does), and not in the phone's backup (they're the site's, read again).
  static let kept: KeptPictures = {
    var dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "kept-pictures")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? dir.setResourceValues(values)
    return KeptPictures(dir: dir)
  }()

  static func load(_ src: String) async -> UIImage? {
    #if DEBUG
    // UI tests read no network.
    if ProcessInfo.processInfo.arguments.contains("-fixed-handbook") { return nil }
    #endif
    if let data = kept.data(src) { return UIImage(data: data) }
    guard let u = URL(string: src), let (data, _) = try? await session.data(from: u) else { return nil }
    return UIImage(data: data)
  }

  /// Kept on the phone now, for a page kept for offline: true when it's there.
  static func keep(_ src: String) async -> Bool {
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("-fixed-handbook") {
      // `-slow-keep`: each picture takes 20 s to come, so a test can act while a keep is on its way.
      if ProcessInfo.processInfo.arguments.contains("-slow-keep") { try? await Task.sleep(for: .seconds(20)) }
      return true
    }
    #endif
    if kept.data(src) != nil { return true }
    guard let u = URL(string: src), let (data, r) = try? await session.data(from: u), (r as? HTTPURLResponse)?.statusCode == 200 else { return false }
    return kept.save(data, for: src)
  }

  /// Off the phone: a page no longer kept for offline.
  static func forget(_ src: String) {
    kept.remove(src)
    if let u = URL(string: src) { session.configuration.urlCache?.removeCachedResponse(for: URLRequest(url: u)) }
  }
}

private func youtube(_ id: String, at: Int) -> URL { URL(string: "https://www.youtube.com/watch?v=\(id)" + (at > 0 ? "&t=\(at)s" : ""))! }

/// 75 → "1:15", 3725 → "1:02:05", as the site writes a video's times (lib/video.ts), in every language: not the
/// phone's own time style, which writes "1.15" in Indonesian.
func clock(_ s: Int) -> String {
  s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
}
