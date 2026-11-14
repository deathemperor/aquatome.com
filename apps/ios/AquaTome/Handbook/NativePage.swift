import Handbook
import SwiftUI
import Telemetry
import UIKit

/// A page the app draws itself from the site's blocks (PageDoc, kept on the phone by PageCache): the site's page, read
/// offline once opened. The blocks become a few kinds of piece (styled text, photos, links to pages, the web page for a
/// part it can't draw): one view per kind of block cost the app 90 kB. A page opens on its photo, across the screen,
/// with its name under it; a fish's or plant's then its facts, the summary (the answer), the care text ("Thông tin
/// nhanh" folded, the climate and tank-mates in the sections they answer), then its photos, its videos, its readers,
/// where to go next and its sources, as the site's page on a phone has them.
struct NativePage: View {
  let pieces: [Piece]
  /// A fish's facts or a plant's care (FactsCard), where the page puts them (`.facts`).
  var facts: FactsCard?
  /// A fish's or plant's: onto one of the reader's tanks, from under its name (`.facts`), not a button in the bar.
  var put: (() -> Void)?
  /// A fish's or plant's, while the chat is on: asking about it, under its facts.
  var ask: ChatRoute?
  let web: () -> Void
  /// Told whether the page's name is on the screen (iOS 18 on): the bar shows it only once it has scrolled away.
  var nameInView: (Bool) -> Void = { _ in }
  /// The page's path on the site, for the app's anonymous telemetry (PageReading).
  var path: String?
  /// A part to open the page at (its heading's id): v2's page offers this one where it holds a part it can't draw.
  var at: String?
  /// A smaller copy of its photo, already on the screen, shown until the photo itself has come (`NativePage.head`).
  var stillPhoto: String?
  @Environment(HandbookModel.self) private var handbook
  @Environment(TelemetryModel.self) private var telemetry
  @Environment(\.scenePhase) private var phase
  /// This page being read: how far down and how long, its shop links (made when it first shows).
  @State private var reading: PageReading?
  @Environment(\.openScreen) private var openScreen
  @State private var tip: Tip?
  /// A page of the site the app can't show itself (one the index leaves out, a tool set by the link): the web page, in
  /// the app.
  @State private var onSite: URL?
  /// The page's photo grid, open where its way in opens it.
  @State private var gridAt: PhotoGrid.Place?
  /// Its readers' photos, as the site answered: nil until it has. Shared by the page's part and the grid.
  @State private var readerPhotos: [Readers.Photo]?
  /// Its videos' player, one at a time (PagePlayer).
  @State private var player = PagePlayer()
  /// VoiceOver's place: moved with a `#id` link, as the scroll is.
  @AccessibilityFocusState private var focus: String?

  /// What the page shows, in order.
  enum Piece {
    /// Text: a heading, paragraphs, a list, questions, sources. `anchor` is the id a `#id` link scrolls to;
    /// `look`, its place on the page.
    case text(AttributedString, anchor: String? = nil, look: Look = .body)
    /// A photo with its caption (its links live, as a video's moments and a figure's fish are) and its credit (a quiet
    /// link); tapped, `href` (the page it shows, or the video at a moment). `hero`: the page's own, across the screen
    /// above its name.
    case photo(src: String, ratio: CGFloat, alt: String?, caption: AttributedString, credit: AttributedString? = nil, href: URL?, play: Bool = false,
               hero: Bool = false)
    /// A video, played in the page (VideoSlot); its caption's chapters seek it. `head`: the page's own (a video guide's).
    case video(id: String, title: String, caption: AttributedString, head: PageDoc.Video? = nil)
    /// Other pages the index lists, each opening in the app.
    case pages(String, [String])
    /// Other pages as rows drawn from what they carry (tank-mates, breeds), each opening in the app, or else on the web;
    /// under a subheading (tank-mates' "Hợp với", marked `good`, and "Tránh") or none (the section's heading is its own
    /// piece).
    case cards(String?, [Card], good: Bool? = nil)
    /// A gallery's row of photos, each credited; tapped, all of its photos, full size.
    case gallery(title: String, note: String, photos: [PageDoc.Image], strip: [Int])
    /// Text shown once its title is tapped (the sources behind each figure).
    case more(String, AttributedString)
    /// A section whose text shows once its heading is tapped ("Thông tin nhanh", which the facts and the summary above
    /// mostly give), as the site's page folds it on a phone. `anchor`, the heading's id.
    case fold(AttributedString, anchor: String?, AttributedString)
    /// Lines each marked fine or a warning (the climate in each region, keepers' mistakes), under a title, with a note.
    case notes(String?, [Note], note: String?)
    /// Where a fish's facts or a plant's care go: under its name.
    case facts
    /// A part the app can't draw: the web page instead.
    case web
    /// Its readers' photos and comments, read from the site when the page opens; `name`, the page's (a species').
    case readers(PageDoc.Talk, name: String)
    /// A table: its columns' names (the site's header row) and its rows' cells.
    case table(head: [AttributedString]?, rows: [[AttributedString]])
  }

  /// A text's place on the page, which sets the space above it: a heading sits close to what it heads and far from what
  /// came before; the lines under the name, close to it.
  enum Look { case body, boxed, lead, title, line, heading, subheading }

  /// A card for another page: `sub`, the line under its name (a breed's kind, why to keep a fish away).
  struct Card {
    let path: String
    let name: String
    let sub: String?
    let img: PageDoc.Image?
  }

  /// A line marked fine (`ok`) or a warning.
  struct Note {
    let ok: Bool
    let text: AttributedString
  }

  var body: some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(pieces.indices, id: \.self) { i in
            let hero = if case .photo(_, _, _, _, _, _, _, true) = pieces[i] { true } else { false }
            piece(i).padding(.horizontal, hero ? 0 : nil).padding(.top, gap(i))
          }
        }
        .padding(.bottom, 32)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      // Links in the text: a page the index lists opens in the app, `#id` scrolls to it, a word's tip shows.
      .environment(\.openURL, OpenURLAction { open($0, proxy) })
      // Laid out first, then at its part.
      .task {
        guard let at else { return }
        await Task.yield()
        proxy.scrollTo(at, anchor: .top)
      }
      // A chapter or a still tapped: its video in view.
      .onChange(of: player.asked) { withAnimation { proxy.scrollTo(PagePlayer.anchor(player.id), anchor: .center) } }
      .modifier(SeenDown { reading?.scrolled(to: $0) })
    }
    .environment(player)
    .accessibilityIdentifier("native-page")
    .onAppear {
      if reading == nil, let path { reading = PageReading(path: path, telemetry: telemetry.telemetry) }
      reading?.shown(true)
    }
    .onDisappear { reading?.shown(false) }
    .onChange(of: phase) { reading?.inFront(phase == .active) }
    .navigationDestination(item: $onSite) { WebScreen(url: $0) }
    .navigationDestination(item: $gridAt) { place in
      if let gallery { PhotoGrid(gallery: gallery, talk: talk, at: place, readerPhotos: $readerPhotos).ownerScreen("photos") }
    }
    .alert(tip?.term ?? "", isPresented: Binding(get: { tip != nil }, set: { if !$0 { tip = nil } }), presenting: tip) { t in
      if let h = t.href, let u = URL(string: h) { Button("Xem thêm") { _ = open(u, nil) } }
      Button("Đóng", role: .cancel) {}
    } message: { t in
      Text(t.text)
    }
  }

  /// The page's gallery, for its grid: a page has one at most, after its name.
  private var gallery: PhotoGrid.Gallery? {
    let title = pieces.lazy.compactMap { if case let .text(s, _, .title) = $0 { String(s.characters) } else { nil } }.first
    return PhotoGrid.Gallery(pieces: pieces, name: title ?? "")
  }

  private var talk: PageDoc.Talk? {
    for p in pieces { if case let .readers(t, _) = p { return t } }
    return nil
  }

  /// The space above a piece. A part that heads itself (a gallery) takes a heading's; one that may show nothing (the
  /// pages it names, its readers) puts its own above what it shows.
  private func gap(_ i: Int) -> CGFloat {
    // The sources behind a species' facts, close under them.
    if i > 0, case .more = pieces[i], case .facts = pieces[i - 1] { return 12 }
    return switch pieces[i] {
    case .photo(_, _, _, _, _, _, _, true), .pages, .readers: 0
    case .text(_, _, .title): i == 0 ? 12 : 20
    case _ where i == 0: 12
    case .text(_, _, .line): 4
    case .text(_, _, .heading), .gallery, .fold: 40
    case .text(_, _, .subheading), .facts, .more: 24
    case .cards(.some, _, _): 20
    default: 12
    }
  }

  @ViewBuilder private func piece(_ i: Int) -> some View {
    switch pieces[i] {
    case let .text(s, anchor, look):
      Text(s)
        .lineSpacing([.body, .boxed, .lead].contains(look) ? 3 : 0)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(look == .boxed ? 14 : 0)
        .background(look == .boxed ? AnyShapeStyle(.fill.quaternary) : AnyShapeStyle(Color.clear), in: .rect(cornerRadius: 12))
        .accessibilityAddTraits([.title, .heading, .subheading].contains(look) ? .isHeader : [])
        .accessibilityFocused($focus, equals: anchor ?? "piece-\(i)")
        .id(anchor ?? "piece-\(i)")
        .modifier(InView(report: look == .title ? nameInView : nil))
    case let .photo(src, ratio, alt, caption, credit, href, play, hero):
      VStack(alignment: hero ? .trailing : .leading, spacing: 6) {
        // The page's own photo no taller than 4:3, cut to fit: a fish's side, not a screen of water.
        let image = PageImage(src: src, ratio: hero ? max(ratio, 4 / 3) : ratio, alt: alt, corner: hero ? 0 : 10, until: hero ? stillPhoto : nil)
          .overlay { if play { Image(systemName: "play.circle.fill").font(.system(size: 56)).foregroundStyle(.white, .black.opacity(0.5)) } }
        if let href {
          // Tapped, the page it shows or the video at that moment; read as its words, or else its caption.
          Button { _ = open(href, nil) } label: { image }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: alt ?? String((caption + (credit ?? AttributedString())).characters)))
        } else if hero, let gallery {
          // The page's own photo, carrying how many it has: the whole of it opens them all.
          Button { gridAt = .photos } label: {
            image.overlay(alignment: .bottomTrailing) { PhotosBadge(count: gallery.photos.count).padding(12) }
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text(verbatim: (alt ?? gallery.title) + ", ") + Text("Xem tất cả \(gallery.photos.count) ảnh"))
          .accessibilityIdentifier("lead-photo-grid")
        } else {
          image
        }
        if !caption.characters.isEmpty { Text(caption).font(.footnote).foregroundStyle(.secondary) }
        if let credit { Text(credit).foregroundStyle(.secondary).tint(Color.secondary).padding(.horizontal, hero ? nil : 0) }
      }
    case let .video(id, title, caption, head):
      VideoSlot(id: id, title: title, caption: caption, head: head)
    case let .pages(title, paths):
      PagesBlock(title: title, paths: paths)
    case let .cards(title, cards, good):
      CardsPart(title: title, cards: cards, good: good) { _ = open($0, nil) }
    case let .gallery(title, note, photos, strip):
      GalleryRow(title: title, note: note, photos: photos, strip: strip, grid: { gridAt = .photos })
    case let .more(title, text):
      DisclosureGroup {
        Text(text).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
      } label: {
        Text(title).font(.headline)
      }
      .accessibilityIdentifier("page-more")
    case let .fold(heading, anchor, text):
      DisclosureGroup {
        Text(text).lineSpacing(3).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 12)
      } label: {
        // In the text's colour, as the page's other headings: only the chevron in the tint, which the links in the
        // text keep too.
        Text(heading).foregroundStyle(Color.primary).accessibilityAddTraits(.isHeader)
      }
      .accessibilityFocused($focus, equals: anchor ?? "piece-\(i)")
      .id(anchor ?? "piece-\(i)")
      .accessibilityIdentifier("page-fold")
    case let .notes(title, notes, note):
      VStack(alignment: .leading, spacing: 8) {
        if let title { Text(title).font(.headline).accessibilityAddTraits(.isHeader) }
        VStack(alignment: .leading, spacing: 0) {
          ForEach(notes.indices, id: \.self) { j in
            if j > 0 { Divider() }
            HStack(alignment: .firstTextBaseline, spacing: 10) {
              // What the line says says it too: the mark is for the eye.
              Image(systemName: notes[j].ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                .foregroundStyle(notes[j].ok ? Color.green : Color.warning)
                .accessibilityHidden(true)
              Text(notes[j].text).lineSpacing(2).frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(.vertical, 12)
          }
        }
        .padding(.horizontal, 14)
        .background(.fill.quaternary, in: .rect(cornerRadius: 12))
        if let note { Text(note).font(.footnote).foregroundStyle(.secondary) }
      }
    case .facts:
      VStack(alignment: .leading, spacing: 16) {
        if let put { PutButton(put: put) }
        if let facts { facts }
        if let ask { AskEntry(route: ask) }
      }
    case .web:
      Button(action: web) { Label("Xem phần này trên web", systemImage: "safari") }
        .buttonStyle(.bordered)
        .accessibilityIdentifier("page-web")
    case let .readers(talk, name):
      ReadersPart(talk: talk, name: name, photos: $readerPhotos, grid: gallery != nil ? { gridAt = .readers } : nil)
    case let .table(head, rows):
      TablePart(head: head, rows: rows)
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
    case "page-video":
      // A chapter or a still: the page's player at its time; a video the page doesn't show, on YouTube.
      guard let (id, at) = PagePlayer.asked(url) else { return .handled }
      if pieces.contains(where: { if case let .video(v, _, _, _) = $0 { v == id } else { false } }) {
        player.ask(id, at: at, lang: handbook.lang, site: handbook.site)
      } else {
        UIApplication.shared.open(youtube(id, at: at))
      }
      return .handled
    default:
      let u = url.scheme == nil ? URL(string: url.relativeString, relativeTo: handbook.site)?.absoluteURL ?? url : url
      if let screen = AppScreen.of(u, site: handbook.site, lang: handbook.lang, listed: { handbook.item(at: $0) != nil },
                                   group: { !handbook.shelves.fish(group: $0, handbook.labels).isEmpty }) {
        openScreen(screen)
        return .handled
      }
      // A shop: outside, as the site opens it in a new tab (not a page here that only redirects away).
      if ShopLink.is(u, site: handbook.site) {
        reading?.tapped(u)
        Task { await OwnCopy.open(u, site: handbook.site) }
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

  /// The top of a page not read yet: its photo and name, which whatever opened it already holds, where the page will put
  /// them. A card zooms into this, not into an empty screen. The photo's credit keeps its line, so the name doesn't move
  /// when the page comes.
  static func head(_ item: HandbookIndex.Item) -> [Piece] {
    var out: [Piece] = []
    if let src = item.img {
      var line = AttributedString(" ")
      line.font = .caption2
      let ratio = PageImages.cached(src).map { $0.size.width / $0.size.height } ?? 3 / 2
      out.append(.photo(src: src, ratio: ratio, alt: nil, caption: AttributedString(), credit: line, href: nil, hero: true))
    }
    out.append(.text(styled(item.name, .pageTitle), look: .title))
    return out
  }

  /// The page as pieces: worked out once, when it's read, not on every redraw. `traits`: a fish's temperament and
  /// smallest school, from the index, for under its tank-mates' heading.
  static func pieces(_ doc: PageDoc, traits: AttributedString? = nil) -> [Piece] {
    var out: [Piece] = []
    let species = doc.kind == "fish" || doc.kind == "plant"
    // Its photo first, then its name and the lines under it: never a line above the name.
    if doc.video == nil, let lead = doc.lead { out.append(photo(lead, caption: [], href: nil, hero: true)) }
    out.append(.text(styled(doc.title, .pageTitle), look: .title))
    if let sub = HandbookIndex.Item.line(under: doc.title, doc.sub) { out.append(.text(styled(sub, .system(.title3, design: .serif).italic(), secondary: true), look: .line)) }
    if let meta = doc.meta { out.append(.text(styled(meta, .subheadline, secondary: true), look: .line)) }
    if !doc.where.isEmpty { out.append(.text(styled(doc.where, font: .subheadline), look: .line)) }
    if let aka = doc.aka { out.append(.text(styled(aka, .subheadline, secondary: true), look: .line)) }
    let credit = Piece.text(styled(doc.credit, font: .footnote, secondary: true), look: .line)
    // A species' credit goes under its facts, as on the site's page.
    if !species, !doc.credit.isEmpty { out.append(credit) }
    if let v = doc.video {
      // No channel: a page names no YouTube channel (the owner, 2026-11-06); its sources, the video first, say whose it is.
      var cap = styled("\(v.title) · \(clock(v.durationSec))")
      if let s = v.subtitles { cap += styled("\n" + s, .caption.bold()) }
      for ch in v.chapters ?? [] {
        // The link its line alone, not the line break before it: tapped and read where it shows.
        var line = AttributedString("\(clock(ch.at))  \(ch.title)")
        line.link = PagePlayer.link(v.youtubeId, at: ch.at)
        cap += AttributedString("\n") + line
      }
      out.append(.video(id: v.youtubeId, title: v.title, caption: cap, head: v))
    }
    if species {
      // As the site's data card: the facts, the sources behind them, then whose text the page is.
      out.append(.facts)
      for b in doc.blocks { if case .trust = b { add(b, to: &out) } }
      if !doc.credit.isEmpty { out.append(credit) }
    }
    // A species' parts in the order its reader asks (rank); a guide's as written. A fish's page (one with tank-mates or
    // the tank-mates tool's link, which a breed's hasn't) reads as the site's on a phone: the summary, the care text,
    // then its photos (`answerFirst`), its climate and tank-mates at the end of the sections they answer (slot). The
    // tool's link is a paragraph before the summary and sections, sent alone when the page shows no tank-mates: it goes
    // where they would. A plant's or a breed's: the summary, a breed's line before it (its parents), the photos, the text.
    let lead = doc.blocks.firstIndex { if case .summary = $0 { true } else if case .heading = $0 { true } else { false } } ?? doc.blocks.count
    let slot = { (i: Int) -> String? in
      switch doc.blocks[i] {
      case .climate: "waterConditions"
      case .mates: "behaviour"
      // The tool's link alone (fishDoc's), not a breed's line naming its parents.
      case let .paragraph(runs) where i < lead && runs.count == 1 && runs[0].href != nil: "behaviour"
      default: nil
      }
    }
    let answerFirst = doc.kind == "fish" && doc.blocks.indices.contains { slot($0) != nil }
    let rank = { (b: PageDoc.Block, i: Int) in Self.rank(b, answerFirst: answerFirst, lead: species && i < lead) }
    var order = doc.blocks.indices.map { $0 }
    if species {
      order = order.filter { !answerFirst || slot($0) == nil }.sorted { (rank(doc.blocks[$0], $0), $0) < (rank(doc.blocks[$1], $1), $1) }
      if answerFirst {
        let slotted = doc.blocks.indices.filter { slot($0) != nil }.sorted { (sectionOrder.firstIndex(of: slot($0)!)!, $0) < (sectionOrder.firstIndex(of: slot($1)!)!, $1) }
        for i in slotted { order.insert(i, at: place(slot(i)!, in: order.map { doc.blocks[$0] })) }
      }
    }
    var readers = doc.talk.map { Piece.readers($0, name: doc.title) }
    var webBefore = false
    var at = 0
    while at < order.count {
      let b = doc.blocks[order[at]]
      at += 1
      if species, rank(b, order[at - 1]) > 6, let r = readers { out.append(r); readers = nil }
      // A run of parts it can't draw is one offer of the web page.
      if case .web = b { if !webBefore { out.append(.web) }; webBefore = true; continue }
      webBefore = false
      if species, case .trust = b { continue }
      // A fish's "Thông tin nhanh" folded under its heading, as the site's page on a phone has it, when all of it is
      // text: its blocks up to the next heading, photo, or climate or tank-mates put after it. Else open, as it was.
      if answerFirst, case let .heading(text, id) = b, id == "muc-quickFacts" {
        var part: [Piece] = []
        var end = at
        while end < order.count, slot(order[end]) == nil, rank(doc.blocks[order[end]], order[end]) == 3 {
          if case .heading = doc.blocks[order[end]] { break }
          if case .figure = doc.blocks[order[end]] { break }
          add(doc.blocks[order[end]], to: &part)
          end += 1
        }
        let texts = part.compactMap { if case let .text(t, _, _) = $0 { t } else { nil } }
        if !part.isEmpty, texts.count == part.count {
          out.append(.fold(styled(text, .pageHeading), anchor: id, texts.dropFirst().reduce(texts[0]) { $0 + AttributedString("\n\n") + $1 }))
          at = end
          continue
        }
      }
      let before = out.count
      add(b, to: &out)
      // Under "Nuôi chung", before its fish, as the site's has them.
      if case .mates = b, let traits { out.insert(.text(traits, look: .line), at: before + 1) }
    }
    if let readers { out.append(readers) }
    return out
  }

  /// The site's order of a species' sections (DISPLAY_ORDER, apps/site/src/lib/sections.ts), each heading's id
  /// `muc-<key>`: where the climate and tank-mates go when the page has no section of their own.
  private static let sectionOrder = ["quickFacts", "beforeYouBuy", "aquariumSize", "waterConditions", "maintenance", "equipment", "diet", "behaviour",
                                     "dimorphism", "reproduction", "distribution", "habitat", "notes", "references"]

  /// Where a part that answers section `key` goes among a fish's blocks (in rank order), as the site's page puts it
  /// (Sections.astro): at the end of that section, before the photo the site puts between it and the next; else where it
  /// would be, before the first section that comes after it (one the order doesn't name, such as the wild range, counts
  /// as after); else at the end of the care text.
  private static func place(_ key: String, in blocks: [PageDoc.Block]) -> Int {
    let mine = sectionOrder.firstIndex(of: key)!
    var inside = false
    for (i, b) in blocks.enumerated() {
      if rank(b, answerFirst: true, lead: false) > 3 { return i }
      if inside, case .figure = b { return i }
      guard case let .heading(_, id) = b, let id, id.hasPrefix("muc-") else { continue }
      let k = String(id.dropFirst(4))
      if inside { return i }
      if k == key { inside = true; continue }
      if (sectionOrder.firstIndex(of: k) ?? .max) > mine { return i }
    }
    return blocks.count
  }

  /// Where a species' block goes: the answer first (the summary), then the text; a fish's photos after it, as the site's
  /// page on a phone has them (`answerFirst`), a plant's or breed's before it, after a breed's line under its summary
  /// (`lead`: a paragraph before the summary and sections); then its videos, where to go next, its sources last.
  private static func rank(_ b: PageDoc.Block, answerFirst: Bool, lead: Bool) -> Int {
    switch b {
    case .summary: 0
    case .paragraph where lead: 1
    case .gallery: answerFirst ? 4 : 2
    case .videos: 6
    case .cards: 7
    case .pages: 8
    case .refs: 9
    case .trust: 10
    default: 3
    }
  }

  /// A block as pieces, for v1's page and v2's (SpeciesPage), which draws a page's sections from them.
  static func add(_ b: PageDoc.Block, to out: inout [Piece]) {
    switch b {
    case let .heading(text, id):
      out.append(.text(styled(text, .pageHeading), anchor: id, look: .heading))
    case let .paragraph(c):
      out.append(.text(styled(c)))
    case let .list(ordered, items):
      var text = AttributedString()
      list(ordered, items, depth: 0, into: &text, out: &out)
      if !text.characters.isEmpty { out.append(.text(text)) }
    case let .table(head, rows):
      out.append(.table(head: head.map { $0.map { styled($0) } }, rows: rows.map { $0.map { styled($0) } }))
    case let .figure(img, caption, href):
      out.append(photo(img, caption: caption, href: href.flatMap(URL.init(string:))))
    case let .moments(title, id, items):
      out.append(.text(styled(title, .headline), look: .subheading))
      for s in items {
        out.append(.photo(src: s.img.src, ratio: CGFloat(s.img.w) / CGFloat(s.img.h), alt: s.img.alt, caption: styled("\(clock(s.at)) · \(s.caption)"),
                          href: PagePlayer.link(id, at: s.at), play: true))
      }
    case let .summary(title, items, paragraph, mistakes, by):
      out.append(.text(styled(title, .pageHeading), look: .heading))
      // A fish's summary: one paragraph, the page's answer, read first and larger; a guide's key points, a list.
      if let paragraph {
        out.append(.text(styled(paragraph, .system(.title3, design: .serif)), look: .lead))
      } else {
        out.append(.text(styled(items.map { "• " + $0 }.joined(separator: "\n")), look: .boxed))
      }
      // Then the mistakes keepers make, then whose summary it is, as the site's summary has them.
      if let m = mistakes { out.append(.notes(m.title, m.items.map { Note(ok: false, text: styled($0)) }, note: nil)) }
      if let by { out.append(.text(styled(by, .footnote, secondary: true), look: mistakes == nil ? .line : .body)) }
    case let .faq(title, items):
      out.append(.text(styled(title, .pageHeading), look: .heading))
      for qa in items { out.append(.text(styled(qa.q, .body.bold()) + styled("\n" + qa.a))) }
    case let .refs(title, id, items, note):
      out.append(.text(styled(title, .pageHeading), anchor: id, look: .heading))
      // Numbered as the text's citations number them.
      var text = AttributedString()
      for (i, r) in items.enumerated() {
        var line = AttributedString(r.title)
        line.link = URL(string: r.url)
        text += styled((i > 0 ? "\n" : "") + "\(i + 1). ", secondary: true) + line
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
      if !strip.isEmpty, let row = GalleryViewer.row(title: title, note: note, photos: photos, strip: strip) { out.append(row) }
    case let .trust(title, legend, rows):
      // The mark on a figure the sources disagree on, in the warning colour, as its legend says.
      var dot = AttributedString("●")
      dot.foregroundColor = Color.warning
      var text = AttributedString()
      // Only where the sources disagree by enough to change how the fish is kept (`marked`), as the site's card has it.
      if let legend, rows.contains(where: \.marked) { text += dot + styled(" " + legend + "\n\n", .footnote, secondary: true) }
      for (i, r) in rows.enumerated() {
        text += styled((i > 0 ? "\n\n" : "") + r.label + (r.marked ? " " : ""), .subheadline.bold()) + (r.marked ? dot : AttributedString())
        if let note = r.note { text += styled("\n" + note, .footnote, secondary: true) }
        text += styled(r.items.map { "\n" + $0 }.joined(), .subheadline)
      }
      out.append(.more(title, text))
    case let .mates(m):
      out.append(.text(styled(m.title, .pageHeading), look: .heading))
      for (g, good) in [(m.good, true), (m.avoid, false)] {
        if let g, !g.items.isEmpty { out.append(.cards(g.title, g.items.map { Card(path: $0.path, name: $0.name, sub: $0.why, img: $0.img) }, good: good)) }
      }
      let text = m.note.map { styled($0 + "\n", .footnote, secondary: true) } ?? AttributedString()
      var tool = AttributedString(m.tool.text)
      tool.font = .subheadline.weight(.semibold)
      tool.link = URL(string: m.tool.href)
      out.append(.text(text + tool))
    case let .climate(title, items, note):
      out.append(.text(styled(title, .pageHeading), look: .heading))
      out.append(.notes(nil, items.map { Note(ok: $0.ok, text: styled($0.label, .body.bold()) + styled("\n" + $0.text)) }, note: note))
    case let .cards(title, items):
      out.append(.text(styled(title, .pageHeading), look: .heading))
      out.append(.cards(nil, items.map { Card(path: $0.path, name: $0.name, sub: $0.sub, img: $0.img) }))
    case let .videos(title, items):
      out.append(.text(styled(title, .pageHeading), look: .heading))
      for v in items {
        let length = v.durationSec > 0 ? " · \(clock(v.durationSec))" : ""
        out.append(.video(id: v.youtubeId, title: v.title, caption: styled("\(v.title)\(length) · \(v.lang)")))
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


  private static func photo(_ img: PageDoc.Image, caption: [PageDoc.Run], href: URL?, hero: Bool = false) -> Piece {
    .photo(src: img.src, ratio: CGFloat(img.w) / CGFloat(img.h), alt: img.alt, caption: styled(caption), credit: credit(img), href: href, hero: hero)
  }
}

/// A word's explanation (a glossary term, a citation), shown when its link is tapped.
struct Tip {
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

/// A photo's credit as the site gives it, wherever the app shows the photo: who took it, its licence, linking its own page;
/// an Unsplash photo's, its photographer's name linking their page and "Unsplash" Unsplash's (PageDoc.Image.Credit).
func credit(_ img: PageDoc.Image) -> AttributedString? {
  img.credit.map { credit($0) }
}

/// A credit's line, each piece linking where it says. `photo` false: the photo's own page linked nowhere in it.
func credit(_ c: PageDoc.Image.Credit, photo: Bool = true) -> AttributedString {
  let parts = c.parts(photo: photo)
  var line = parts.reduce(into: AttributedString()) { s, p in
    var a = AttributedString(p.text)
    a.link = p.link.flatMap(URL.init(string:))
    // Some of the line linking and the rest not: its links underlined, as the site's are, so it's seen which words are.
    if parts.count > 1, a.link != nil { a[AttributeScopes.SwiftUIAttributes.UnderlineStyleAttribute.self] = .single }
    s += a
  }
  line.font = .caption2
  return line
}

func styled(_ s: String, _ font: Font? = nil, secondary: Bool = false) -> AttributedString {
  var a = AttributedString(s)
  a.font = font
  if secondary { a.foregroundColor = .secondary }
  return a
}

/// Runs as styled text; links as URLs the page's `openURL` understands (a site path is left relative). A source's number
/// after a sentence is raised and small, as a printed note's; `secondary`, the words but its links.
func styled(_ runs: [PageDoc.Run], font: Font? = nil, secondary: Bool = false) -> AttributedString {
  runs.reduce(into: AttributedString()) { s, r in
    var a = AttributedString(r.text)
    a.font = font
    if secondary && r.href == nil && r.tip == nil { a.foregroundColor = .secondary }
    if r.isSourceMark {
      // As the site's `.cite`: small, raised and a little apart from the words it backs, not a number run into them;
      // never carried alone to the next line (a no-break space), raised as much more as the reader's text is larger.
      var gap = AttributedString("\u{202F}")
      gap.font = font
      s += gap
      a.font = .caption2.weight(.semibold).monospacedDigit()
      a.baselineOffset = UIFontMetrics(forTextStyle: .caption2).scaledValue(for: 6)
    }
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

extension Font {
  /// A page's name and its headings: the serif of a printed field guide, at the reader's text size.
  static let pageTitle = Font.system(.largeTitle, design: .serif, weight: .bold)
  static let pageHeading = Font.system(.title2, design: .serif, weight: .bold)
}

/// Other pages as rows in one panel (tank-mates, breeds), each with its photo, opening in the app or else on the web;
/// under the rows, the photos' credits, linking each photo's own page (a link inside a row would be the row).
struct CardsPart: View {
  let title: String?
  let cards: [NativePage.Card]
  /// Tank-mates' "Hợp với" (true) or "Tránh" (false), marked so for the eye.
  let good: Bool?
  let open: (URL) -> Void
  /// Its photos' credits under it; v2's page has them at its foot.
  var credits = true
  /// v2's rows (docs/design/v2-fish-page.md): a small photo, none where a page has none, and plain titles.
  var v2 = false
  @Environment(\.dynamicTypeSize) private var size
  @ScaledMetric(relativeTo: .body) private var thumb: CGFloat = 56
  /// The width each of a credit's numbers takes: 44 points to tap, as the app's other small controls have.
  @ScaledMetric(relativeTo: .caption2) private var number: CGFloat = 44
  private typealias CreditRow = (line: AttributedString, who: String, licence: String, profile: String?, urls: [String?])

  var body: some View {
    let thumbs = cards.contains { $0.img != nil }
    let credits = creditRows
    VStack(alignment: .leading, spacing: 8) {
      if let title {
        HStack(spacing: 6) {
          if let good, !v2 {
            Image(systemName: good ? "checkmark.circle.fill" : "xmark.circle.fill")
              .foregroundStyle(good ? Color.green : Color.red)
              .accessibilityHidden(true)
          }
          Text(title)
        }
        .font(v2 && good != nil ? .subheadline.weight(.semibold) : .headline)
        .accessibilityAddTraits(.isHeader)
      }
      VStack(spacing: 0) {
        ForEach(cards.indices, id: \.self) { j in
          if j > 0 { Divider().padding(.leading, v2 ? 0 : thumbs ? thumb + 24 : 12) }
          if v2 { v2Row(cards[j]) } else { row(cards[j], thumbs: thumbs) }
        }
      }
      .background(.fill.quaternary, in: .rect(cornerRadius: 12))
      if self.credits, !credits.isEmpty {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(credits.indices, id: \.self) { creditRow(credits[$0]) }
        }
        .foregroundStyle(.secondary).tint(Color.secondary)
      }
    }
  }

  /// The cards' photos as the site's credits list has them: one row per line (an Unsplash photo's names its photographer),
  /// licence and photographer's page (two Unsplash photographers can share a name), first seen first, each with its line (linking the photo's page while it's
  /// the only one and no photographer's page is linked), who took them, their page and every photo's own page, the same
  /// page once (nil: a photo without one).
  private var creditRows: [CreditRow] {
    cards.compactMap(\.img).reduce(into: []) { rows, img in
      guard let c = img.credit else { return }
      if let i = rows.firstIndex(where: { $0.who == c.text && $0.licence == c.licence && $0.profile == c.authorUrl }) {
        if c.url == nil || !rows[i].urls.contains(c.url) {
          rows[i].urls.append(c.url)
          // Each photo's page is its number now: the line keeps a photographer's page and Unsplash's.
          rows[i].line = credit(c, photo: false)
        }
      } else {
        rows.append((credit(c, photo: c.authorUrl == nil), c.text, c.licence, c.authorUrl, [c.url]))
      }
    }
  }

  /// One photo: its line, linking its page. Several, or one whose line links its photographer's page (an Unsplash
  /// photo's): the line once with how many, then a number for each linking its own page (none for a photo without one),
  /// each read to VoiceOver as whose photo it is, as the site's are.
  @ViewBuilder private func creditRow(_ row: CreditRow) -> some View {
    if row.urls.count == 1 && row.profile == nil {
      Text(row.line)
    } else {
      Text(row.line) + Text(verbatim: " · ").font(.caption2) + Text("\(row.urls.count) ảnh").font(.caption2)
      LazyVGrid(columns: [GridItem(.adaptive(minimum: number), spacing: 0, alignment: .leading)], alignment: .leading, spacing: 0) {
        ForEach(Array(row.urls.compactMap { $0.flatMap(URL.init(string:)) }.enumerated()), id: \.offset) { i, url in
          Link(destination: url) {
            // Small to the eye, 44 points to the finger.
            Text(verbatim: String(i + 1)).font(.caption2).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(.rect)
          }
          .accessibilityLabel(Text("\(row.who), ảnh \(i + 1)"))
          .accessibilityRemoveTraits(.isButton)
          .accessibilityAddTraits(.isLink)
        }
      }
    }
  }

  /// v2's row: its photo at 44 × 33, or none, its name and its line, a chevron. At the accessibility sizes the photo is over
  /// the words: beside them it left a few letters a line.
  private func v2Row(_ c: NativePage.Card) -> some View {
    Button { if let u = URL(string: c.path) { open(u) } } label: {
      HStack(spacing: 12) {
        let words = VStack(alignment: .leading, spacing: 0) {
          Text(c.name).font(.callout)
          if let sub = HandbookIndex.Item.line(under: c.name, c.sub) { Text(sub).font(.footnote).foregroundStyle(.secondary) }
        }
        let photo = c.img.map { V2Photo(src: $0.thumb ?? $0.src, box: $0.box).frame(width: 44, height: 33).clipShape(.rect(cornerRadius: 5)) }
        if size.isAccessibilitySize {
          VStack(alignment: .leading, spacing: 8) {
            photo
            words
          }
        } else {
          photo
          words
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 9)
      .frame(minHeight: 48)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("card")
  }

  private func row(_ c: NativePage.Card, thumbs: Bool) -> some View {
    Button { if let u = URL(string: c.path) { open(u) } } label: {
      HStack(spacing: 12) {
        if thumbs {
          if let img = c.img {
            V2Photo(src: img.thumb ?? img.src, box: img.box).frame(width: thumb, height: thumb).clipShape(.rect(cornerRadius: 10))
          } else {
            RoundedRectangle(cornerRadius: 10).fill(.fill.tertiary).frame(width: thumb, height: thumb)
          }
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(c.name).font(.body.weight(.semibold))
          if let sub = HandbookIndex.Item.line(under: c.name, c.sub) { Text(sub).font(.subheadline).foregroundStyle(.secondary) }
        }
        Spacer(minLength: 0)
        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 10)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("card")
  }
}

/// Other pages the index lists, each opening in the app.
struct PagesBlock: View {
  let title: String
  let paths: [String]
  /// Its own heading, set apart from what's above it, as v1's page has it; v2's page gives it its own.
  var titled = true
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let items = paths.compactMap(handbook.item(at:))
    if !items.isEmpty {
      let shown = PageList.inPlace(items.count)
      VStack(alignment: .leading, spacing: 8) {
        if titled { Text(title).font(.pageHeading).accessibilityAddTraits(.isHeader) }
        // As in a list of results: a tool opens its tab (AppScreen), a page pushes on this one. In one panel, as the
        // page's other rows of pages (CardsPart) are.
        VStack(alignment: .leading, spacing: 0) {
          ForEach(Array(items.prefix(shown).enumerated()), id: \.element.id) { j, item in
            if j > 0 { Divider().padding(.leading, 12) }
            Row(item: item, chevron: true, inPanel: true).buttonStyle(.plain)
          }
          // The whole list, in a list that draws its rows as they scroll in.
          if shown < items.count {
            Divider().padding(.leading, 12)
            NavigationLink(value: Browse.pages(title, paths)) {
              HStack {
                Text("Xem tất cả \(items.count)")
                Spacer()
                Image(systemName: "chevron.right").foregroundStyle(.tertiary)
              }
              .padding(12)
              .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("pages-all")
          }
        }
        .background(.fill.quaternary, in: .rect(cornerRadius: 12))
      }
      .padding(.top, titled ? 40 : 0)
    }
  }
}

/// How many photos a page has, over its own photo, as the mock draws it: a photo's icon then "N ảnh", white on a dark
/// rounded blur, the same over a light photo or a dark one. v2's banner shows this one too.
struct PhotosBadge: View {
  let count: Int
  @Environment(\.dynamicTypeSize) private var type
  @ScaledMetric(relativeTo: .subheadline) private var scale: CGFloat = 1

  var body: some View {
    // The mock's two sizes: 14 on 32 with 12 at the sides, and 28 on 52 with 18 at the accessibility sizes, past which
    // it would cover the photo. The sizes between grow with the text.
    let ax = type.isAccessibilitySize
    HStack(spacing: 6) {
      Image(systemName: "photo.on.rectangle").font(.system(size: ax ? 23 : 12.25 * scale, weight: .medium))
      Text("\(count) ảnh")
    }
    .font(.system(size: ax ? 28 : 14 * scale, weight: .semibold))
    .lineLimit(1)
    .foregroundStyle(.white)
    .padding(.horizontal, ax ? 18 : 12 * scale)
    .frame(height: ax ? 52 : 32 * scale)
    .background(.black.opacity(0.46), in: .capsule)
    .background(.ultraThinMaterial, in: .capsule)
    .environment(\.colorScheme, .dark)
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
  /// Readers' photos, each as the reader can report it or block who sent it (in the viewer); a page's own, none.
  var readers: [ReaderItem]?
  /// Opens the page's grid, for its "all photos" button: without one (readers' photos on a page with no gallery), the
  /// viewer.
  var grid: (() -> Void)?
  @State private var shown: Int?
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title).font(.pageHeading).accessibilityAddTraits(.isHeader)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 10) {
          ForEach(PhotoRow.strip(strip), id: \.self) { i in
            let p = photos[i]
            let ratio = CGFloat(p.w) / CGFloat(p.h)
            VStack(alignment: .leading, spacing: 4) {
              Button { show(i) } label: { PageImage(src: p.thumb ?? p.src, ratio: ratio, alt: p.alt).frame(height: 140) }
                .buttonStyle(.plain)
                // A photo without words of its own is still a button VoiceOver can name.
                .accessibilityLabel(Text(verbatim: p.alt ?? title))
              // Its credit whole, as narrow as the photo: the licence is never cut off.
              if let c = credit(p) { Text(c).foregroundStyle(.secondary).tint(Color.secondary).fixedSize(horizontal: false, vertical: true) }
            }
            .frame(width: 140 * ratio)
          }
        }
        .v2YieldsToEdgeSwipe()
      }
      Button("Xem tất cả \(photos.count) ảnh") {
        if let grid { grid() } else { show(strip.first ?? 0) }
      }
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .controlSize(.small)
        // Read with whose photos they are: a fish's page has its own and its readers'.
        .accessibilityLabel(Text(verbatim: title + ", ") + Text("Xem tất cả \(photos.count) ảnh"))
        .accessibilityIdentifier(all)
    }
    // Full screen, on black (PhotoViewer).
    .fullScreenCover(isPresented: Binding(get: { shown != nil }, set: { if !$0 { shown = nil } })) {
      GalleryViewer(note: note, photos: photos, readers: readers, index: shown ?? 0)
    }
  }

  /// The viewer at photo `i`: sliding up, or with Reduce Motion there at once.
  private func show(_ i: Int) {
    var t = Transaction()
    t.disablesAnimations = reduceMotion
    withTransaction(t) { shown = i }
  }
}

/// A page's readers' photos and comments (Readers), read when it opens: shown once the site has some, as its web page
/// shows those sections only once the site answers; with accounts on, also with none yet, and a reader signed in posts
/// to them (ReaderPost). The photos are a gallery's row, each credited with the reader's name.
struct ReadersPart: View {
  let talk: PageDoc.Talk
  let name: String
  /// What the site answered: nil until it has (still reading, or offline), so "none yet" is said only of a page that has none.
  @Binding var photos: [Readers.Photo]?
  /// Opens the page's grid at this part: on a page with a gallery.
  var grid: (() -> Void)?
  /// Its headings' font: v1's page's own, v2's its.
  var heading: Font = .pageHeading
  /// The room it keeps from the next part (v1: above it), only when it shows something.
  var space: (edge: Edge.Set, length: CGFloat) = (.top, 40)
  @Environment(HandbookModel.self) private var handbook
  @Environment(AccountModel.self) private var account
  @State private var comments: [Readers.Comment]?
  @State private var posting: ReaderPost.Kind?
  @State private var reporting: ReaderItem?
  @State private var blocking: ReaderItem?
  @State private var managing = false
  #if DEBUG
  /// This page's read has ended (answered, or failed): only then can a UI test say the page shows none (debug builds).
  /// Each time the page shows, it reads again and this is false until that read ends. It says nothing of the section
  /// shown for posting: that one shows whenever accounts are open, read or not.
  @State private var answered = false
  #endif

  var body: some View {
    // Posting needs an account: where the site has none, a section with nothing in it would only be empty.
    let open = account.state != .unknown && account.state != .off
    // Less what the reader reported or whose poster they blocked, on this phone.
    let safety = handbook.safety
    let shownPhotos = (photos ?? []).filter { !safety.hides(ReaderItem($0)) }, shownComments = (comments ?? []).filter { !safety.hides(ReaderItem($0)) }
    let hidden = (photos ?? []).count - shownPhotos.count + (comments ?? []).count - shownComments.count
    let showsPhotos = talk.photos != nil && (open || !shownPhotos.isEmpty)
    let showsComments = talk.comments != nil && (open || !shownComments.isEmpty)
    VStack(alignment: .leading, spacing: 14) {
      if showsPhotos {
        if shownPhotos.isEmpty {
          Text("Ảnh bạn đọc").font(heading).accessibilityAddTraits(.isHeader)
          // None at all: hidden ones the note below says.
          if photos?.isEmpty == true { Text("Chưa có ảnh nào. Bạn nuôi \(name)? Gửi một tấm ảnh cho mọi người cùng xem.").foregroundStyle(.secondary) }
        } else {
          GalleryRow(title: String(localized: "Ảnh bạn đọc"), note: "", photos: shownPhotos.map(PageDoc.Image.init(reader:)),
                     strip: Array(shownPhotos.indices), all: "readers-all", readers: shownPhotos.map(ReaderItem.init), grid: grid)
        }
        if open { Button("Gửi ảnh \(name) của bạn") { posting = .photo }.buttonStyle(.bordered).accessibilityIdentifier("post-photo") }
      }
      if showsComments {
        Text("Thảo luận").font(heading).accessibilityAddTraits(.isHeader).padding(.top, showsPhotos ? 26 : 0)
        if comments?.isEmpty == true { Text("Chưa có bình luận. Hãy là người đầu tiên chia sẻ kinh nghiệm.").foregroundStyle(.secondary) }
        ForEach(shownComments, id: \.id) { c in
          Divider()
          HStack(alignment: .top, spacing: 4) {
            Text(line(c)).lineSpacing(2).frame(maxWidth: .infinity, alignment: .leading).accessibilityIdentifier("comment")
            // Another reader's: not one of the reader's own.
            if !safety.isOwn(ReaderItem(c)) { ReaderMenu(item: ReaderItem(c), reporting: $reporting, blocking: $blocking) }
          }
        }
        if open { Button("Gửi bình luận") { posting = .comment }.buttonStyle(.bordered).accessibilityIdentifier("post-comment") }
      }
      if hidden > 0 {
        // What's kept off this page, and where to let a poster back.
        VStack(alignment: .leading, spacing: 4) {
          Text("Đang ẩn \(hidden) mục bạn đã chặn hoặc báo cáo.").foregroundStyle(.secondary).accessibilityIdentifier("readers-hidden")
          if !safety.blocked.isEmpty { Button("Người đã chặn") { managing = true }.accessibilityIdentifier("blocked-open") }
        }
        .font(.footnote)
      }
    }
    .readerActions(reporting: $reporting, blocking: $blocking)
    .sheet(isPresented: $managing) {
      NavigationStack {
        List { BlockedList() }
          .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
          .ownerScreen("sheet blocked-readers")
          .navigationTitle("Người đã chặn")
          .navigationBarTitleDisplayMode(.inline)
          .toolbar { Button("Đóng") { managing = false } }
      }
    }
    // Its own space above, when it shows anything (or says what it hides): none for a page with no readers' part.
    .padding(space.edge, showsPhotos || showsComments || hidden > 0 ? space.length : 0)
    #if DEBUG
    .background {
      if answered { Text(verbatim: "read").font(.system(size: 1)).fixedSize().opacity(0.01).accessibilityIdentifier("readers-read") }
    }
    #endif
    .task(id: talk) {
      // Read again each time the page shows; one that fails (offline, or left before it came) keeps what was shown.
      #if DEBUG
      answered = false
      #endif
      let (c, p) = await handbook.readers(talk)
      guard !Task.isCancelled else { return }
      if let c { comments = c }
      if let p { photos = p }
      #if DEBUG
      answered = true
      #endif
    }
    .sheet(item: $posting) { kind in
      ReaderPost(kind: kind, key: (kind == .comment ? talk.comments : talk.photos) ?? "", name: name) { c in
        if let key = talk.comments { handbook.posted(c, on: key) }
        handbook.safety.posted(c)
        comments = (comments ?? []) + [c]
      }
    }
  }

  /// Who, when, whether the site marks it a good answer, then what they wrote: as the site's comment.
  private func line(_ c: Readers.Comment) -> AttributedString {
    var out = styled(c.name, .body.bold())
    out += styled("  " + Readers.day(c.createdAt, lang: handbook.lang), .footnote, secondary: true)
    if c.helpful {
      // The site's mark, in the page's green: a mark on the answer, not a heading over it.
      var mark = styled("  " + String(localized: "Trả lời hay"), .footnote.weight(.semibold))
      mark.foregroundColor = .accentColor
      out += mark
    }
    return out + styled("\n" + c.body)
  }
}

func youtube(_ id: String, at: Int) -> URL { URL(string: "https://www.youtube.com/watch?v=\(id)" + (at > 0 ? "&t=\(at)s" : ""))! }

/// 75 → "1:15", 3725 → "1:02:05", as the site writes a video's times (lib/video.ts), in every language: not the
/// phone's own time style, which writes "1.15" in Indonesian.
func clock(_ s: Int) -> String {
  s >= 3600 ? String(format: "%d:%02d:%02d", s / 3600, s / 60 % 60, s % 60) : String(format: "%d:%02d", s / 60, s % 60)
}

/// Reports whether a view is on the screen as the page scrolls, where the system can say (iOS 18 on).
private struct InView: ViewModifier {
  let report: ((Bool) -> Void)?
  func body(content: Content) -> some View {
    if #available(iOS 18, *), let report {
      content.onScrollVisibilityChange(threshold: 0.3, report)
    } else {
      content
    }
  }
}

/// Reports the share of the page seen down to as it scrolls past each of the site beacon's marks, 50 and 90% (iOS 18
/// on; as the site's pages measure it: the bottom of the screen against the page's height).
private struct SeenDown: ViewModifier {
  let report: (Double) -> Void
  func body(content: Content) -> some View {
    if #available(iOS 18, *) {
      content.onScrollGeometryChange(for: Int.self) { g in
        let share = g.contentSize.height > 0 ? 100 * g.visibleRect.maxY / g.contentSize.height : 0
        return Event.depths.last { share >= Double($0) } ?? 0
      } action: { _, mark in
        report(Double(mark) / 100)
      }
    } else {
      content
    }
  }
}

/// A fish's or plant's page: onto one of the reader's tanks (TankLife.swift), under its name, to see on opening.
private struct PutButton: View {
  let put: () -> Void
  @Environment(TanksModel.self) private var tanks

  var body: some View {
    Button(action: put) { Label("Thêm vào bể", systemImage: "plus").frame(maxWidth: .infinity) }
      .buttonStyle(.bordered)
      .controlSize(.large)
      // Not into a store this app must leave alone (newer, unreadable).
      .disabled(!tanks.canEdit)
      .accessibilityIdentifier("put-on-tank")
  }
}

/// A table as the site's, in a panel: a grid with its columns' names over them while they fit side by side; else each
/// row's cells one under another, each under its column's name. No cell is shown without its column's name, the first
/// column's too (a pros-and-cons table's "Ưu điểm").
struct TablePart: View {
  let head: [AttributedString]?
  let rows: [[AttributedString]]

  private var columns: Int { max(head?.count ?? 0, rows.map(\.count).max() ?? 0) }

  var body: some View {
    ViewThatFits(in: .horizontal) {
      grid
      stacked
    }
    .font(.callout)
    .padding(14)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(.fill.quaternary, in: .rect(cornerRadius: 12))
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("page-table")
  }

  /// Columns side by side, as wide as their longest line: chosen only when that fits the screen.
  private var grid: some View {
    Grid(alignment: .topLeading, horizontalSpacing: 20, verticalSpacing: 10) {
      if let head {
        GridRow {
          ForEach(0..<columns, id: \.self) { c in name(head[safe: c], header: true).fixedSize(horizontal: true, vertical: false) }
        }
        // As wide as the columns, not widening them.
        Divider().gridCellUnsizedAxes(.horizontal)
      }
      ForEach(rows.indices, id: \.self) { r in
        if r > 0 { Divider().gridCellUnsizedAxes(.horizontal) }
        GridRow {
          ForEach(0..<columns, id: \.self) { c in
            Text(rows[r][safe: c] ?? AttributedString()).fixedSize(horizontal: true, vertical: false)
          }
        }
      }
    }
  }

  /// Each row's cells one under another, each under its column's name.
  private var stacked: some View {
    VStack(alignment: .leading, spacing: 12) {
      ForEach(rows.indices, id: \.self) { r in
        if r > 0 { Divider() }
        VStack(alignment: .leading, spacing: 10) {
          ForEach(rows[r].indices, id: \.self) { c in
            VStack(alignment: .leading, spacing: 2) {
              if let h = head?[safe: c], !h.characters.isEmpty { name(h, header: false) }
              Text(rows[r][c]).lineSpacing(2).frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }
      }
    }
  }

  /// A column's name, over its cells; an empty one keeps its column. A heading to VoiceOver in the grid's top row only,
  /// not each time it's repeated over a cell.
  private func name(_ h: AttributedString?, header: Bool) -> some View {
    Text(h ?? AttributedString()).font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
      .accessibilityAddTraits(header ? .isHeader : [])
      .accessibilityHidden(h?.characters.isEmpty ?? true)
  }
}
