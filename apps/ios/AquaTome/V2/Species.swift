import Handbook
import SwiftUI

/// v1's page for a fish or plant, as v2's species page links to it ("Xem trang đầy đủ"): the whole page as the app
/// draws it, with every part v2's doesn't show yet.
struct FullPage: Hashable {
  let item: HandbookIndex.Item
}

/// A fish's page, as an app's page in the App Store: its photo across the top and the photo's colour washing down
/// behind the name, "Thêm vào bể", the facts strip and the rest of its photos (each full screen, tapped); then the
/// summary, the tank-mates shelves with the tank-mates tool, and the whole page (v1's) one tap away.
@available(iOS 18, *)
struct SpeciesPage: View {
  let item: HandbookIndex.Item
  @Environment(HandbookModel.self) private var handbook
  @Environment(TanksModel.self) private var tanks
  @Environment(\.openScreen) private var openScreen
  @Environment(\.v2OpenFull) private var openFull
  @State private var doc: PageDoc?
  @State private var colour = PhotoColour.fallback
  @State private var putting = false
  /// The gallery's photo shown full screen.
  @State private var viewing: Int?
  /// The name scrolled up under the bar: the bar takes its background and the name.
  @State private var scrolled = false
  /// The bar's foot on the screen (the status bar's height and the bar's).
  @State private var barFoot: CGFloat = 106
  @ScaledMetric(relativeTo: .body) private var shot: CGFloat = 180

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
        V2Photo(src: hero) { colour = $0 }
          .frame(height: 420)
          // A shade under the status bar and the bar's buttons, so they read on a light photo.
          .overlay(alignment: .top) {
            LinearGradient(colors: [.black.opacity(0.4), .clear], startPoint: .top, endPoint: .bottom).frame(height: 150)
          }
          .overlay(alignment: .bottom) {
            LinearGradient(colors: [colour.opacity(0), colour], startPoint: .top, endPoint: .bottom).frame(height: 140)
          }
          .overlay(alignment: .bottomTrailing) { credit }
          .accessibilityElement()
          .accessibilityLabel(Text(verbatim: doc?.lead?.alt ?? item.name))
          .accessibilityAddTraits(.isImage)
        header
        FactsStrip(facts: facts, onDark: true).padding(.vertical, 14)
        if !photos.isEmpty { gallery.padding(.bottom, 24) }
      }
      .background(colour)
      .animation(.easeInOut(duration: 0.45), value: colour)
      VStack(alignment: .leading, spacing: 28) {
        summary
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
    .ignoresSafeArea(edges: .top)
    .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top + 44 } action: { barFoot = $0 }
    .accessibilityIdentifier("v2-species")
    .navigationTitle(scrolled ? item.name : "")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarBackgroundVisibility(scrolled ? .visible : .hidden, for: .navigationBar)
    .modifier(TopEdge(shown: scrolled))
    // Over the photo and the colour under it, the status bar and the bar's buttons in white.
    .toolbarColorScheme(scrolled ? nil : .dark, for: .navigationBar)
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
    .task(id: item.path) {
      doc = await handbook.doc(item)
      handbook.read(item)
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(verbatim: item.name).font(.largeTitle.weight(.bold)).foregroundStyle(.white)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
        // Gone up under the bar: the bar says it instead.
        .onGeometryChange(for: Bool.self) { [barFoot] in $0.frame(in: .scrollView).maxY < barFoot } action: { under in
          withAnimation(.easeInOut(duration: 0.2)) { scrolled = under }
        }
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
        .accessibilityIdentifier("v2-add")
        .padding(.top, 10)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
    .padding(.top, 4)
  }

  /// The photo's credit, quietly on it: the line and its licence, as the page has them.
  @ViewBuilder private var credit: some View {
    if let c = doc?.lead?.credit {
      Text(verbatim: c.licence.isEmpty ? c.text : "\(c.text) · \(c.licence)")
        .font(.caption2).foregroundStyle(.white.opacity(0.75))
        .padding(.horizontal, 20).padding(.bottom, 8)
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
      LazyHStack(spacing: 10) {
        ForEach(Array(photos.enumerated()), id: \.element.src) { i, p in
          Button { viewing = i } label: {
            V2Photo(src: p.thumb ?? p.src)
              .frame(width: shot * 1.45, height: shot)
              .clipShape(.rect(cornerRadius: 16, style: .continuous))
          }
          .buttonStyle(CardPress())
          .accessibilityLabel(Text(verbatim: p.alt ?? item.name))
        }
      }
      .scrollTargetLayout()
    }
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .scrollTargetBehavior(.viewAligned)
  }

  /// The page's answer: its paragraph, or its points where it has no paragraph.
  @ViewBuilder private var summary: some View {
    if let doc, let s = doc.blocks.lazy.compactMap({ b -> (title: String, text: String?, items: [String])? in
      if case let .summary(title, items, text, _, _) = b { return (title, text, items) }
      return nil
    }).first, s.text != nil || !s.items.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Text(verbatim: s.title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
        if let text = s.text {
          Text(verbatim: text).font(.body).lineSpacing(3)
        } else {
          ForEach(s.items, id: \.self) { Text(verbatim: "• " + $0).font(.body) }
        }
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
        VStack(alignment: .leading, spacing: 6) {
          if let note = m.note { Text(verbatim: note).font(.footnote).foregroundStyle(.secondary) }
          Button { open(m.tool.href) } label: {
            // Its words end in their own arrow.
            Text(verbatim: m.tool.text).font(.subheadline.weight(.semibold)).multilineTextAlignment(.leading)
              .frame(minHeight: 44)
            .contentShape(.rect)
          }
          .accessibilityIdentifier("v2-mates-tool")
        }
        .padding(.horizontal, 20)
      }
    }
  }

  /// A link of the page's to one of the app's screens (the tank-mates tool), as v1's page opens it.
  private func open(_ href: String) {
    guard let url = URL(string: href, relativeTo: handbook.site)?.absoluteURL,
          let screen = AppScreen.of(url, site: handbook.site, lang: handbook.lang, listed: { handbook.item(at: $0) != nil },
                                    group: { !handbook.shelves.fish(group: $0, handbook.labels).isEmpty }) else { return }
    openScreen(screen)
  }
}

/// iOS 26's bars have no background of their own: the scroll view's top edge effect, hard (the page's words go under
/// it), once the page is past its photo, and none over the photo.
private struct TopEdge: ViewModifier {
  let shown: Bool

  func body(content: Content) -> some View {
    if #available(iOS 26, *) {
      content.scrollEdgeEffectStyle(.hard, for: .top).scrollEdgeEffectHidden(!shown, for: .top)
    } else {
      content
    }
  }
}

/// One side of "Nuôi chung": its fish as tiles that open their pages, why under each.
private struct MatesRow: View {
  let title: String
  let mates: [PageDoc.Mates.Mate]
  let good: Bool
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Label { Text(verbatim: title) } icon: {
        Image(systemName: good ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(good ? .green : .red)
      }
      .font(.headline)
      .padding(.horizontal, 20)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 12) {
          ForEach(mates, id: \.path) { m in
            let item = handbook.item(at: m.path)
            NavigationLink(value: item) {
              VStack(alignment: .leading, spacing: 6) {
                V2Photo(src: m.img?.src ?? item?.img)
                  .frame(width: 150, height: 100)
                  .clipShape(.rect(cornerRadius: 14, style: .continuous))
                Text(verbatim: m.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                if let why = m.why { Text(verbatim: why).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
              }
              .frame(width: 150, alignment: .leading)
            }
            .buttonStyle(.plain)
            .disabled(item == nil)
          }
        }
        .padding(.horizontal, 20)
      }
    }
  }
}
