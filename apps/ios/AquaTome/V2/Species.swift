import Handbook
import SwiftUI
import Telemetry

/// v1's page for a fish or plant, as v2's species page links to it ("Xem trang đầy đủ"): the whole page as the app
/// draws it, with every part v2's doesn't show yet.
struct FullPage: Hashable {
  let item: HandbookIndex.Item
}

/// A fish's page, as an app's page in the App Store: its photo across the top and the photo's colour washing down
/// behind the name, "Thêm vào bể", the facts strip and the rest of its photos (each full screen, tapped); then the
/// summary with its common mistakes, the tank-mates shelves with the tank-mates tool, and the whole page (v1's) one tap
/// away.
@available(iOS 18, *)
struct SpeciesPage: View {
  let item: HandbookIndex.Item

  init(item: HandbookIndex.Item) {
    self.item = item
    _colour = State(initialValue: PhotoColour.cached(item.img) ?? PhotoColour.fallback)
  }

  @Environment(HandbookModel.self) private var handbook
  @Environment(TanksModel.self) private var tanks
  @Environment(\.openScreen) private var openScreen
  @Environment(\.v2OpenFull) private var openFull
  @Environment(\.dismiss) private var dismiss
  @Environment(TelemetryModel.self) private var telemetry
  @Environment(\.scenePhase) private var phase
  @Environment(\.colorScheme) private var scheme
  /// This page being read, how far down and how long, as v1's page reports it (made when it first shows).
  @State private var reading: PageReading?
  @State private var doc: PageDoc?
  /// The page has been asked for: nil after this, it didn't come (offline, and not kept).
  @State private var asked = false
  /// "Thử lại" pressed, so many times.
  @State private var retries = 0
  @State private var colour: Color
  @State private var putting = false
  /// The gallery's photo shown full screen.
  @State private var viewing: Int?
  /// The name scrolled up under the bar: the bar takes its background and the name.
  @State private var scrolled = false
  /// The bar's foot on the screen, whether the bar is showing or not.
  @State private var barFoot: CGFloat = 106

  /// The page's own photo, at the top.
  private var hero: String? { item.img ?? doc?.lead?.src }

  /// The page's other photos, its galleries' in order: the one at the top isn't repeated under it.
  private var photos: [PageDoc.Image] {
    guard let doc else { return [] }
    let top = Set([doc.lead?.src, item.img.map(V2Photo.full)].compactMap { $0 })
    var out: [PageDoc.Image] = []
    for case let .gallery(_, _, list, _, _) in doc.blocks {
      out += list.filter { p in !top.contains(V2Photo.full(p.src)) && !out.contains { $0.src == p.src } }
    }
    return out
  }

  /// Its figures from the index; a breed's from its own card, as v1's page has them.
  private var facts: HandbookIndex.Facts { item.facts.any ? item.facts : item.card ?? item.facts }

  var body: some View {
    ScrollView {
      VStack(spacing: 0) {
        if let hero {
          V2Photo(src: hero) { colour = $0 }
            .frame(height: 420)
            // A shade under the status bar, so it reads on a light photo.
            .overlay(alignment: .top) {
              LinearGradient(colors: [.black.opacity(0.45), .clear], startPoint: .top, endPoint: .bottom).frame(height: 130)
            }
            .overlay(alignment: .bottom) {
              LinearGradient(colors: [colour.opacity(0), colour], startPoint: .top, endPoint: .bottom).frame(height: 140)
            }
            .accessibilityElement()
            .accessibilityLabel(Text(verbatim: doc?.lead?.alt ?? item.name))
            .accessibilityAddTraits(.isImage)
        } else {
          // No photo (a third of the fish): the page starts at the name, under its buttons, not at an empty box.
          Color.clear.frame(height: 116)
        }
        header
        FactsStrip(facts: facts, onDark: true, temperament: asked && !hasMates).padding(.vertical, 14)
        if !photos.isEmpty { gallery.padding(.bottom, 24) }
      }
      .background(colour)
      .animation(.easeInOut(duration: 0.45), value: colour)
      VStack(alignment: .leading, spacing: 28) {
        if !asked {
          ProgressView().frame(maxWidth: .infinity)
        } else if doc == nil, handbook.status != .ready {
          // Online, nil is a page this build can't read, not the network: "Xem trang đầy đủ" below is the way to it.
          VStack(alignment: .leading, spacing: 4) {
            Text("Không tải được trang. Kiểm tra kết nối mạng.").font(.footnote).foregroundStyle(.secondary)
            Button("Thử lại") {
              asked = false
              retries += 1
            }
            .frame(minHeight: 44)
            .accessibilityIdentifier("v2-retry")
          }
          .padding(.horizontal, 20)
        }
        if hasSummary { summary } else { firstParagraph }
        climate
        mates
        Button { openFull(item) } label: {
          HStack {
            Text("Xem trang đầy đủ").font(.body.weight(.semibold))
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
          }
          .padding(16)
          .background(.fill.quaternary, in: .rect(cornerRadius: 14))
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("v2-full-page")
        .padding(.horizontal, 20)
      }
      .padding(.top, 24)
      .padding(.bottom, 40)
    }
    .v2ClearOfTheFade()
    .ignoresSafeArea(edges: .top)
    // Once its text is in: the photo and name alone fit the screen, "read to the end" at once.
    .onScrollGeometryChange(for: Int?.self) { [loaded = doc != nil] g in
      guard loaded else { return nil }
      let share = g.contentSize.height > 0 ? 100 * g.visibleRect.maxY / g.contentSize.height : 0
      return Event.depths.last { share >= Double($0) } ?? 0
    } action: { _, mark in
      if let mark { reading?.scrolled(to: Double(mark) / 100) }
    }
    .onAppear {
      if reading == nil { reading = PageReading(path: item.path, telemetry: telemetry.telemetry) }
      reading?.shown(true)
    }
    .onDisappear { reading?.shown(false) }
    .onChange(of: phase) { reading?.inFront(phase == .active) }
    // The top inset counts the bar once it shows: the status bar's alone without it.
    .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top } action: { barFoot = scrolled ? $0 : $0 + 44 }
    .accessibilityIdentifier("v2-species")
    .navigationTitle(scrolled ? item.name : "")
    .navigationBarTitleDisplayMode(.inline)
    // Over the photo, the page's own round buttons: iOS 26's bar draws its glass light on any photo, under white symbols
    // in a dark bar. The bar itself once the name has gone under it.
    .toolbarVisibility(scrolled ? .visible : .hidden, for: .navigationBar)
    .overlay(alignment: .top) { if !scrolled { overPhoto } }
    .modifier(ClearUnderTopBar(shown: scrolled))
    // Over the photo and the colour under it, the status bar in white. The page's own after it, never nil: iOS can keep the
    // dark one after nil, white words on the white band.
    .toolbarColorScheme(scrolled ? scheme : .dark, for: .navigationBar)
    .toolbar {
      ToolbarItemGroup(placement: .topBarTrailing) {
        // Saved to read later, as v1's page saves it (the Tìm tab lists them).
        let saved = handbook.isSaved(item)
        Button { handbook.toggleSaved(item) } label: {
          Label(saved ? "Bỏ lưu" : "Lưu để đọc sau", systemImage: saved ? "bookmark.fill" : "bookmark")
        }
        .accessibilityIdentifier("save-for-later")
        ShareLink(item: handbook.url(item)) { Image(systemName: "square.and.arrow.up") }
      }
    }
    .sheet(isPresented: $putting) { if let life = Life(item) { NavigationStack { PutOnTank(life: life) } } }
    .fullScreenCover(isPresented: Binding(get: { viewing != nil }, set: { if !$0 { viewing = nil } })) {
      GalleryViewer(title: galleryTitle, note: "", photos: photos, readers: nil, index: viewing ?? 0)
    }
    .task(id: "\(item.path) \(retries)") {
      if retries > 0 { await handbook.load() }
      doc = await handbook.doc(item)
      asked = true
      handbook.read(item)
    }
  }

  /// Back, save and share, over the photo.
  private var overPhoto: some View {
    HStack(spacing: 10) {
      Button { dismiss() } label: { round("chevron.left") }
        .accessibilityLabel(Text("Quay lại"))
        .accessibilityIdentifier("v2-back")
      Spacer()
      let saved = handbook.isSaved(item)
      Button { handbook.toggleSaved(item) } label: { round(saved ? "bookmark.fill" : "bookmark") }
        .accessibilityLabel(Text(saved ? "Bỏ lưu" : "Lưu để đọc sau"))
        .accessibilityIdentifier("save-for-later")
      ShareLink(item: handbook.url(item)) { round("square.and.arrow.up") }
        .accessibilityLabel(Text("Chia sẻ"))
    }
    .buttonStyle(.plain)
    .padding(.horizontal, 16)
    .padding(.top, 4)
  }

  private func round(_ symbol: String) -> some View {
    Image(systemName: symbol)
      .font(.body.weight(.semibold))
      // It stays inside its circle at the largest text.
      .dynamicTypeSize(...DynamicTypeSize.xLarge)
      .foregroundStyle(.white)
      .frame(width: 44, height: 44)
      .background(.black.opacity(0.45), in: Circle())
      .contentShape(Circle())
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 6) {
      leadCredit
      Text(verbatim: item.name).font(.largeTitle.weight(.bold)).foregroundStyle(.white)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
      if let sub = item.sub { Text(verbatim: sub).font(.title3).italic().foregroundStyle(.white.opacity(0.75)) }
      if Life(item) != nil {
        Button { putting = true } label: {
          Label("Thêm vào bể", systemImage: "plus")
            .font(.body.weight(.semibold))
            .lineLimit(1).minimumScaleFactor(0.6)
            .foregroundStyle(colour)
            .padding(.horizontal, 18)
            .frame(minHeight: 44)
            .background(Capsule().fill(.white))
        }
        .buttonStyle(.plain)
        // Not into a store this app must leave alone (newer, unreadable), as v1's page.
        .disabled(!tanks.canEdit)
        .opacity(tanks.canEdit ? 1 : 0.5)
        .accessibilityIdentifier("v2-add")
        .padding(.top, 10)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
    .padding(.top, 4)
    // The first words reach the bar: the band comes now and the bar says the name, so no words go under the status bar or
    // the round buttons on the way up, however many lines they run to.
    .onGeometryChange(for: Bool.self) { [barFoot] in $0.frame(in: .scrollView).minY < barFoot } action: { under in
      withAnimation(.easeInOut(duration: 0.2)) { scrolled = under }
    }
  }

  /// The photo's credit, quietly on it, each piece linking where it says, as on v1's page.
  @ViewBuilder private var leadCredit: some View {
    if let line = doc?.lead.flatMap({ credit($0) }) {
      // On the colour under the photo: its licence reads at 4.5:1 whatever the photo, however many lines it wraps to.
      Text(line).foregroundStyle(.white.opacity(0.75)).tint(.white).multilineTextAlignment(.trailing)
        .frame(maxWidth: .infinity, alignment: .trailing)
    }
  }

  /// The first gallery's title, the full-screen viewer's.
  private var galleryTitle: String {
    for case let .gallery(title, _, _, _, _) in doc?.blocks ?? [] { return title }
    return item.name
  }

  /// The page's other photos as a carousel, each opening full screen.
  private var gallery: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      LazyHStack(alignment: .top, spacing: 10) {
        ForEach(Array(photos.enumerated()), id: \.element.src) { i, p in
          VStack(alignment: .leading, spacing: 4) {
            Button { viewing = i } label: {
              V2Photo(src: p.thumb ?? p.src)
                .aspectRatio(1.6, contentMode: .fit)
                .clipShape(.rect(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(CardPress())
            .accessibilityLabel(Text(verbatim: p.alt ?? item.name))
            // Its credit whole, as wide as the photo, on the page's colour: the licence is never cut off.
            if let line = credit(p) {
              Text(line).foregroundStyle(.white.opacity(0.75)).tint(.white).fixedSize(horizontal: false, vertical: true)
            }
          }
          .containerRelativeFrame(.horizontal) { w, _ in shelfCard(w, across: 1, spacing: 10) }
        }
      }
      .scrollTargetLayout()
    }
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .scrollTargetBehavior(.viewAligned)
  }

  private var hasMates: Bool {
    doc?.blocks.contains { if case .mates = $0 { true } else { false } } == true
  }

  /// The tank-mates tool's link where the page lists no tank-mates: a paragraph of that link alone, before its summary
  /// and sections (as v1's page reads it; a breed's line naming its parents has more to it).
  private var toolLink: (text: String, href: String)? {
    guard let doc else { return nil }
    let lead = doc.blocks.firstIndex { if case .summary = $0 { true } else if case .heading = $0 { true } else { false } } ?? doc.blocks.count
    for case let .paragraph(runs) in doc.blocks[..<lead] where runs.count == 1 {
      if let href = runs[0].href { return (runs[0].text, href) }
    }
    return nil
  }

  private var hasSummary: Bool {
    doc?.blocks.contains { if case let .summary(_, items, text, _, _) = $0 { text != nil || !items.isEmpty } else { false } } == true
  }

  /// A page with no summary (none approved yet): its text's first real paragraph, so it isn't figures alone. Not a short
  /// one: those are notes (a source's figure that differs from the table's), which say nothing without the table beside
  /// them. Its sources' numbers left out: they mark the page's own list, not shown here.
  @ViewBuilder private var firstParagraph: some View {
    if let text = doc?.blocks.lazy.compactMap({ b -> String? in
      guard case let .paragraph(runs) = b else { return nil }
      let text = runs.filter { !$0.isSourceMark }.map(\.text).joined()
      return text.count >= 140 ? text : nil
    }).first {
      Text(verbatim: text).font(.body).lineSpacing(3).padding(.horizontal, 20)
    }
  }

  /// The page's answer: its paragraph, or its points where it has no paragraph.
  @ViewBuilder private var summary: some View {
    if let doc, let s = doc.blocks.lazy.compactMap({ b -> (title: String, text: String?, items: [String], mistakes: (title: String, items: [String])?, by: String?)? in
      if case let .summary(title, items, text, mistakes, by) = b { return (title, text, items, mistakes, by) }
      return nil
    }).first, s.text != nil || !s.items.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Text(verbatim: s.title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
        if let text = s.text {
          Text(verbatim: text).font(.body).lineSpacing(3)
        } else {
          ForEach(s.items, id: \.self) { Text(verbatim: "• " + $0).font(.body) }
        }
        if let mistakes = s.mistakes, !mistakes.items.isEmpty {
          Text(verbatim: mistakes.title).font(.headline).accessibilityAddTraits(.isHeader).padding(.top, 8)
          ForEach(mistakes.items, id: \.self) { Text(verbatim: "• " + $0).font(.body) }
        }
        if let by = s.by { Text(verbatim: by).font(.footnote).foregroundStyle(.secondary).padding(.top, 4) }
      }
      .padding(.horizontal, 20)
    }
  }

  /// Whether it gets through a northern winter, as v1's page says: the question a fish's facts don't answer.
  @ViewBuilder private var climate: some View {
    if let c = doc?.blocks.lazy.compactMap({ b -> (title: String, items: [(label: String, ok: Bool, text: String)], note: String)? in
      if case let .climate(title, items, note) = b { return (title, items, note) }
      return nil
    }).first {
      VStack(alignment: .leading, spacing: 10) {
        Text(verbatim: c.title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
        ForEach(c.items.indices, id: \.self) { i in
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            // A warning, not "can't keep it": what to do about it follows, and red is "Tránh"'s.
            Image(systemName: c.items[i].ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
              .foregroundStyle(c.items[i].ok ? Color.green : Color.warning)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: c.items[i].label).font(.body.weight(.semibold))
              Text(verbatim: c.items[i].text).font(.body)
            }
          }
          .accessibilityElement(children: .combine)
        }
        if !c.note.isEmpty { Text(verbatim: c.note).font(.footnote).foregroundStyle(.secondary) }
      }
      .padding(.horizontal, 20)
    }
  }

  /// "Nuôi chung": its temperament and smallest school, the fish to keep with it, then those to keep away, each with
  /// why, as shelves; what they rest on, and the tank-mates tool set to it.
  @ViewBuilder private var mates: some View {
    if let doc, let m = doc.blocks.lazy.compactMap({ b -> PageDoc.Mates? in
      if case let .mates(m) = b { return m }
      return nil
    }).first {
      VStack(alignment: .leading, spacing: 18) {
        VStack(alignment: .leading, spacing: 4) {
          Text(verbatim: m.title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
          if let traits = FactsCard.traits(facts) { Text(traits) }
        }
        .padding(.horizontal, 20)
        if let good = m.good, !good.items.isEmpty { MatesRow(title: good.title, mates: good.items, good: true) }
        if let avoid = m.avoid, !avoid.items.isEmpty { MatesRow(title: avoid.title, mates: avoid.items, good: false) }
        // What explains the shelves straight under them, the credits last.
        VStack(alignment: .leading, spacing: 6) {
          if let note = m.note { Text(verbatim: note).font(.footnote).foregroundStyle(.secondary) }
          toolButton(m.tool.text, m.tool.href)
          MatesCredits(photos: ((m.good?.items ?? []) + (m.avoid?.items ?? [])).compactMap(\.img))
        }
        .padding(.horizontal, 20)
      }
    } else if let link = toolLink {
      toolButton(link.text, link.href).padding(.horizontal, 20)
    }
  }

  private func toolButton(_ text: String, _ href: String) -> some View {
    Button { open(href) } label: {
      // Its words end in their own arrow.
      Text(verbatim: text).font(.subheadline.weight(.semibold)).multilineTextAlignment(.leading)
        .frame(minHeight: 44)
        .contentShape(.rect)
    }
    .accessibilityIdentifier("v2-mates-tool")
  }

  /// A link of the page's to one of the app's screens (the tank-mates tool), as v1's page opens it.
  private func open(_ href: String) {
    guard let url = URL(string: href, relativeTo: handbook.site)?.absoluteURL,
          let screen = AppScreen.of(url, site: handbook.site, lang: handbook.lang, listed: { handbook.item(at: $0) != nil },
                                    group: { !handbook.shelves.fish(group: $0, handbook.labels).isEmpty }) else { return }
    openScreen(screen)
  }
}

/// One side of "Nuôi chung": its fish as tiles that open their pages, why under each.
/// The tank-mates' photos' credits under their shelves, as v1's page lists a row of cards' (CardsPart): one row per who
/// took them, with its line; several photos, or a photographer's page in the line, then a number for each photo's page.
private struct MatesCredits: View {
  let photos: [PageDoc.Image]
  /// Small to the eye, 44 points to the finger.
  @ScaledMetric(relativeTo: .caption2) private var number: CGFloat = 44
  private typealias Row = (line: AttributedString, who: String, licence: String, profile: String?, urls: [String?])

  private var rows: [Row] {
    photos.reduce(into: []) { rows, img in
      guard let c = img.credit else { return }
      if let i = rows.firstIndex(where: { $0.who == c.text && $0.licence == c.licence && $0.profile == c.authorUrl }) {
        if c.url == nil || !rows[i].urls.contains(c.url) {
          rows[i].urls.append(c.url)
          rows[i].line = credit(c, photo: false)
        }
      } else {
        rows.append((credit(c, photo: c.authorUrl == nil), c.text, c.licence, c.authorUrl, [c.url]))
      }
    }
  }

  var body: some View {
    let rows = rows
    if !rows.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(rows.indices, id: \.self) { i in
          let row = rows[i]
          if row.urls.count == 1 && row.profile == nil {
            Text(row.line)
          } else {
            Text(row.line) + Text(verbatim: " · ").font(.caption2) + Text("\(row.urls.count) ảnh").font(.caption2)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: number), spacing: 0, alignment: .leading)], alignment: .leading, spacing: 0) {
              ForEach(Array(row.urls.compactMap { $0.flatMap(URL.init(string:)) }.enumerated()), id: \.offset) { j, url in
                Link(destination: url) {
                  Text(verbatim: String(j + 1)).font(.caption2).frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(.rect)
                }
                .accessibilityLabel(Text("\(row.who), ảnh \(j + 1)"))
                .accessibilityRemoveTraits(.isButton)
                .accessibilityAddTraits(.isLink)
              }
            }
          }
        }
      }
      .foregroundStyle(.secondary).tint(Color.secondary)
    }
  }
}

private struct MatesRow: View {
  let title: String
  let mates: [PageDoc.Mates.Mate]
  let good: Bool
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size
  @ScaledMetric(relativeTo: .subheadline) private var photoHeight: CGFloat = 120

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Label { Text(verbatim: title) } icon: {
        Image(systemName: good ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(good ? .green : .red)
      }
      .font(.headline)
      .padding(.horizontal, 20)
      // Why to keep a fish away is what decides: whole, down the screen at the accessibility sizes.
      if size.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 16) {
          ForEach(mates, id: \.path) { m in tile(m, photo: 88, why: nil) }
        }
        .padding(.horizontal, 20)
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(alignment: .top, spacing: 12) {
            ForEach(mates, id: \.path) { m in
              tile(m, photo: photoHeight, why: 3).containerRelativeFrame(.horizontal, alignment: .leading) { w, _ in shelfCard(w, across: 2, spacing: 12) }
            }
          }
        }
        .contentMargins(.horizontal, 20, for: .scrollContent)
      }
    }
  }

  private func tile(_ m: PageDoc.Mates.Mate, photo: CGFloat, why lines: Int?) -> some View {
    let item = handbook.item(at: m.path)
    return NavigationLink(value: item) {
      VStack(alignment: .leading, spacing: 6) {
        let src = m.img?.src ?? item?.img
        V2Photo(src: src)
          .frame(width: lines == nil ? photo * 1.5 : nil, height: photo)
          .clipShape(.rect(cornerRadius: 14, style: .continuous))
          // A third of the fish have no photo: the tile says what it is, not an empty box.
          .overlay { if src == nil { Image(systemName: item?.kind.symbol ?? "fish").font(.title2).foregroundStyle(.secondary) } }
        Text(verbatim: m.name).font(.subheadline.weight(.semibold)).lineLimit(lines == nil ? nil : 2)
        // Its lines whole: a row across a scroll view would give it its one line's height.
        if let why = m.why { Text(verbatim: why).font(.caption).foregroundStyle(.secondary).lineLimit(lines).fixedSize(horizontal: false, vertical: true) }
      }
      .multilineTextAlignment(.leading)
    }
    .buttonStyle(.plain)
    .disabled(item == nil)
  }
}
