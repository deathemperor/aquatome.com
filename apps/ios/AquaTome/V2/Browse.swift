import Handbook
import SwiftUI

/// "Khám phá": the handbook's shelves, as the App Store's Apps tab: featured cards at the top; what the reader saved and
/// read last; the fish groups and the well-known fish in columns of three; plants, by where they go and the easy ones;
/// the guides to start with and guides by subject; the video series; equipment; the tools and the glossary. Each shelf
/// has its whole list one tap away, and a page is on one shelf only (it zooms from there). Links from pages and from
/// outside the app open here, as on v1's Tìm.
@available(iOS 18, *)
struct BrowseHome: View {
  @Binding var path: NavigationPath
  /// The tab in front. "Đã lưu" and "Đọc gần đây" are as they were when it came to the front, so a page just read or saved
  /// stays where it was tapped, for its zoom back, and the shelves don't move; it takes its new place next time.
  let front: Bool
  @State private var recentShown: [HandbookIndex.Item] = []
  @State private var savedShown: [HandbookIndex.Item] = []
  @State private var held = false
  @State private var refreshes = 0
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen
  @Environment(\.dynamicTypeSize) private var size
  @Environment(\.colorScheme) private var scheme
  @Namespace private var zoom
  // Sizes growing with the text, so a tile's words stay whole at the larger sizes.
  @ScaledMetric(relativeTo: .title3) private var featuredHeight: CGFloat = 250
  @ScaledMetric(relativeTo: .subheadline) private var tileHeight: CGFloat = 104
  @ScaledMetric(relativeTo: .body) private var rowHeight: CGFloat = 76
  @ScaledMetric(relativeTo: .headline) private var videoHeight: CGFloat = 190
  @ScaledMetric(relativeTo: .title3) private var toolSymbolHeight: CGFloat = 28

  var body: some View {
    let s = handbook.shelves
    let top = featuredItems(s)
    // Its first 21, then "Xem tất cả": only those come off the shelves below.
    let saved = Array(savedShown.filter { !top.map(\.path).contains($0.path) }.prefix(HandbookShelves.Shown.saved))
    let recent = recentShown.filter { r in !(top + saved).contains { $0.path == r.path } }
    // A page on one shelf only, the first it's on (its zoom starts there).
    let onTop = Set((top + saved + recent).map(\.path))
    NavigationStack(path: $path) {
      ScrollView {
        VStack(alignment: .leading, spacing: 34) {
          // The kept copy in use, or none at all, as v1's Tìm says.
          if handbook.status == .offline || handbook.status == .failed {
            StatusText().font(.footnote).padding(.horizontal, 20)
          }
          if !top.isEmpty { featured(top) }
          if !saved.isEmpty { columns("Đã lưu để đọc sau", saved, more: Browse.saved) }
          if !recent.isEmpty { columns("Đọc gần đây", recent) }
          if !handbook.keptItems.isEmpty { chips([(String(localized: "Đã tải để đọc offline"), handbook.keptItems.count, Browse.kept)]) }
          if !s.groups.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              ShelfHeader(title: "Cá", more: size.isAccessibilitySize ? nil : Browse.fish(nil))
              groups(s.groups)
            }
          }
          // Each shelf its count after what's shown above it, from its own list only (HandbookShelves.shelf).
          let fish = HandbookShelves.shelf(s.browseFish, showing: HandbookShelves.Shown.fish, after: onTop)
          if !fish.isEmpty { columns("Loài quen thuộc", fish, more: Browse.fish(nil)) }
          let plants = HandbookShelves.shelf(s.browsePlants, showing: HandbookShelves.Shown.plants, after: onTop)
          if !plants.isEmpty || !s.placements.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              // Its chips never without a heading.
              if plants.isEmpty {
                ShelfHeader(title: "Cây thủy sinh", more: size.isAccessibilitySize ? nil : Browse.plants(nil))
              } else {
                columns("Cây thủy sinh", plants, more: Browse.plants(nil))
              }
              if !s.placements.isEmpty { chips(s.placements.map { ($0.label, $0.count, Browse.plants($0.key)) }) }
            }
          }
          let first = HandbookShelves.shelf(s.browseGuides, showing: HandbookShelves.Shown.guides, after: onTop)
          if !first.isEmpty || !s.sections.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              if first.isEmpty {
                ShelfHeader(title: "Hướng dẫn", more: size.isAccessibilitySize ? nil : Browse.guides(nil))
              } else if size.isAccessibilitySize {
                columns("Bắt đầu từ đây", first, more: Browse.guides(nil))
              } else {
                guides(first)
              }
              if !s.sections.isEmpty { chips(s.sections.map { ($0.label, $0.count, Browse.guides($0.key)) }) }
            }
          }
          let series = HandbookShelves.shelf(s.all(.video), showing: HandbookShelves.Shown.videos, after: onTop)
          if !series.isEmpty {
            if size.isAccessibilitySize { columns("Video", series, more: Browse.videos) } else { videos(series) }
          }
          let kit = s.all(.equipment).filter { !onTop.contains($0.path) }
          if !kit.isEmpty { columns("Thiết bị", kit) }
          tools
        }
        .padding(.vertical, 12)
      }
      .v2ClearOfTheFade()
      .modifier(ClearUnderLargeTitle())
      .accessibilityIdentifier("v2-browse")
      .v2ClearsFootGoingBack(path.count)
      .navigationTitle("Khám phá")
      // Its own, not one iOS picks from what passes under the bar, as Hôm nay's.
      .toolbarColorScheme(scheme, for: .navigationBar)
      .profileButton()
      .v2Destinations(zoom: zoom)
      .overlay { if handbook.status == .loading { ProgressView() } }
      .task { await handbook.appear() }
      .refreshable {
        await handbook.load()
        holdShelves()
        refreshes += 1
      }
      .environment(\.v2PhotoTries, refreshes)
    }
    // On the stack, not its first screen, which disappears and comes back with a page pushed and popped. Never with a page
    // open: for the zoom back to where it was tapped.
    .onAppear {
      if !held {
        held = true
        holdShelves()
      }
    }
    .onChange(of: front) { if path.isEmpty { holdShelves() } }
    .onChange(of: handbook.status) { if path.isEmpty { holdShelves() } }
  }

  private func holdShelves() {
    recentShown = handbook.recent(nil)
    savedShown = handbook.saved(nil)
  }

  /// The top's pages: the fish and guides the site puts first, with photos.
  private func featuredItems(_ s: HandbookShelves) -> [HandbookIndex.Item] {
    (Array(s.featuredFish.prefix(3)) + Array(s.firstGuides.prefix(2))).filter { $0.img != nil }
  }

  /// The top: wide cards, the next one peeking.
  private func featured(_ items: [HandbookIndex.Item]) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      LazyHStack(alignment: .top, spacing: 12) {
        ForEach(items) { item in
          NavigationLink(value: item) {
            FeaturedCard(item: item, height: featuredHeight).containerRelativeFrame(.horizontal) { w, _ in shelfCard(w, across: 1, spacing: 12) }
          }
          .buttonStyle(CardPress())
          .matchedTransitionSource(id: item.path, in: zoom)
        }
      }
      .scrollTargetLayout()
    }
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .scrollTargetBehavior(.viewAligned)
    .v2ShelfEdge()
  }

  /// The fish groups as photo tiles, two rows that page sideways; at the accessibility sizes, the first five down the
  /// screen, then the whole list.
  @ViewBuilder private func groups(_ groups: [HandbookShelves.Shelf]) -> some View {
    if size.isAccessibilitySize {
      VStack(alignment: .leading, spacing: 14) {
        ForEach(groups.prefix(5)) { g in
          NavigationLink(value: Browse.fish(g.key)) {
            HStack(spacing: 12) {
              V2Photo(src: g.img, box: g.imgBox).frame(width: 88, height: 88).clipShape(.rect(cornerRadius: 20, style: .continuous))
                // No photo: the kind's mark, as a row's.
                .overlay { if g.img == nil { Image(systemName: HandbookIndex.Kind.fish.symbol).font(.title3).foregroundStyle(.secondary).accessibilityHidden(true) } }
              VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: g.label).font(.body.weight(.semibold))
                Text("\(g.count) loài").font(.subheadline).foregroundStyle(.v2Faint)
              }
              Spacer(minLength: 0)
            }
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityElement(children: .combine)
        }
        moreLink(Browse.fish(nil))
      }
      .padding(.horizontal, 20)
    } else {
      groupTiles(groups)
    }
  }

  /// A list's end at the accessibility sizes, where its header has no room for it.
  private func moreLink(_ to: Browse) -> some View {
    NavigationLink(value: to) { Text("Xem tất cả").font(.body.weight(.semibold)).frame(minHeight: 44).contentShape(.rect) }
  }

  private func groupTiles(_ groups: [HandbookShelves.Shelf]) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      LazyHGrid(rows: [GridItem(.fixed(tileHeight), spacing: 10), GridItem(.fixed(tileHeight))], spacing: 10) {
        ForEach(groups) { g in
          NavigationLink(value: Browse.fish(g.key)) {
            GroupTile(group: g, height: tileHeight)
              .containerRelativeFrame(.horizontal) { w, _ in shelfCard(w, across: 2, spacing: 10) }
              .clipShape(.rect(cornerRadius: 14, style: .continuous))
          }
          .buttonStyle(CardPress())
        }
      }
      .scrollTargetLayout()
    }
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .scrollTargetBehavior(.viewAligned)
    .v2ShelfEdge()
  }

  /// Pages as lockups in columns of three that page sideways, each with its button, the next column peeking; at the
  /// accessibility sizes, a list down the screen: the first five with a whole list to go to, else them all.
  private func columns(_ title: LocalizedStringKey, _ items: [HandbookIndex.Item], more: Browse? = nil) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      ShelfHeader(title: title, more: size.isAccessibilitySize ? nil : more)
      if size.isAccessibilitySize {
        // A line between rows, as Hôm nay's lists: with each row's photo above its words, one ran into the next.
        let shown = Array(items.prefix(more == nil ? items.count : 5))
        VStack(alignment: .leading, spacing: 0) {
          ForEach(shown) { item in
            Lockup(item: item, line: factsLine(item, handbook.lang))
              .padding(.vertical, 12)
              .matchedTransitionSource(id: item.path, in: zoom)
            if item.path != shown.last?.path { Divider() }
          }
          if let more { moreLink(more).padding(.top, 4) }
        }
        .padding(.horizontal, 20)
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHGrid(rows: Array(repeating: GridItem(.fixed(rowHeight), spacing: 12), count: min(3, items.count)), spacing: 16) {
            ForEach(items) { item in
              Lockup(item: item, line: factsLine(item, handbook.lang))
                // One column's worth: the whole width for the words, no next column to peek (`w` is less the margins).
                .containerRelativeFrame(.horizontal) { w, _ in items.count <= 3 ? w : shelfCard(w, across: 1, spacing: 16) }
                .matchedTransitionSource(id: item.path, in: zoom)
            }
          }
          .scrollTargetLayout()
        }
        .contentMargins(.horizontal, 20, for: .scrollContent)
        .scrollTargetBehavior(.viewAligned)
        .v2ShelfEdge()
      }
    }
  }

  /// Ways into a shelf by its parts (plants by where they go, guides by subject), each with how many it holds.
  private func chips(_ parts: [(label: String, count: Int, to: Browse)]) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(parts, id: \.to) { p in
          NavigationLink(value: p.to) {
            HStack(spacing: 6) {
              Text(verbatim: p.label)
              // Less than the system's secondary, which measured 3.2:1 on the chip's fill (v1's KindChip the same).
              Text(p.count, format: .number).opacity(0.6)
            }
            .font(.subheadline.weight(.semibold))
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .background(.fill.tertiary, in: Capsule())
          }
          .buttonStyle(.plain)
        }
      }
    }
    .contentMargins(.horizontal, 20, for: .scrollContent)
  }

  private func guides(_ items: [HandbookIndex.Item]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      ShelfHeader(title: "Bắt đầu từ đây", more: Browse.guides(nil))
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(alignment: .top, spacing: 12) {
          ForEach(items) { item in
            NavigationLink(value: item) {
              VStack(alignment: .leading, spacing: 8) {
                V2Photo(src: item.img, box: item.imgBox)
                  .aspectRatio(1.8, contentMode: .fit)
                  .overlay { if item.img == nil { Image(systemName: item.kind.symbol).font(.title2).foregroundStyle(.secondary).accessibilityHidden(true) } }
                  .clipShape(.rect(cornerRadius: 16, style: .continuous))
                  .matchedTransitionSource(id: item.path, in: zoom)
                Text(verbatim: item.name).font(.subheadline.weight(.semibold)).lineLimit(3)
                  .multilineTextAlignment(.leading)
              }
              .containerRelativeFrame(.horizontal, alignment: .leading) { w, _ in shelfCard(w, across: 1, spacing: 12) }
            }
            .buttonStyle(CardPress())
          }
        }
        .scrollTargetLayout()
      }
      .contentMargins(.horizontal, 20, for: .scrollContent)
      .scrollTargetBehavior(.viewAligned)
      .v2ShelfEdge()
    }
  }

  /// Video series: tinted cards with a play symbol, never a thumbnail (the photo rules).
  private func videos(_ items: [HandbookIndex.Item]) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      ShelfHeader(title: "Video", more: Browse.videos)
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHStack(spacing: 12) {
          ForEach(Array(items.enumerated()), id: \.element.id) { i, item in
            NavigationLink(value: item) {
              VStack(alignment: .leading, spacing: 10) {
                Image(systemName: "play.fill").font(.callout)
                  .frame(width: 36, height: 36).background(Circle().fill(.white.opacity(0.2)))
                Text(verbatim: item.name).font(.headline).lineLimit(4).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                if let n = item.parts { Text("\(n) video").font(.caption.weight(.semibold)).opacity(0.8) }
              }
              .foregroundStyle(.white)
              .padding(14)
              .frame(maxWidth: .infinity, alignment: .topLeading)
              .frame(height: videoHeight, alignment: .topLeading)
              .containerRelativeFrame(.horizontal) { w, _ in shelfCard(w, across: 2, spacing: 12) }
              .background(Self.tints[i % Self.tints.count], in: .rect(cornerRadius: 16, style: .continuous))
            }
            .buttonStyle(CardPress())
            .matchedTransitionSource(id: item.path, in: zoom)
          }
        }
        .scrollTargetLayout()
      }
      .contentMargins(.horizontal, 20, for: .scrollContent)
      .scrollTargetBehavior(.viewAligned)
      .v2ShelfEdge()
    }
  }

  private static let tints: [Color] = [
    Color(red: 0.17, green: 0.23, blue: 0.4), Color(red: 0.1, green: 0.33, blue: 0.3), Color(red: 0.36, green: 0.2, blue: 0.3),
    Color(red: 0.25, green: 0.3, blue: 0.16),
  ]

  /// Fish ID, the site's tools as v1's Tìm lists them, what's new and the glossary, as tiles (one to a row at the
  /// accessibility sizes).
  private var tools: some View {
    VStack(alignment: .leading, spacing: 12) {
      ShelfHeader<Browse>(title: "Công cụ")
      LazyVGrid(columns: size.isAccessibilitySize ? [GridItem(.flexible())] : [GridItem(.flexible(), spacing: 10), GridItem(.flexible())],
                spacing: 10) {
        tool("Đây là cá gì?", "camera", FishIdRoute())
        ForEach(siteTools) { item in
          let screen = AppScreen.of(handbook.url(item), site: handbook.site)
          Button { openScreen(screen ?? .page(item.path)) } label: {
            toolLabel(Text(verbatim: item.short ?? item.name), toolSymbol(item, screen))
          }
          .buttonStyle(CardPress())
        }
        tool("Mới cập nhật", "sparkles", Browse.latest)
        tool("Thuật ngữ", "character.book.closed", Browse.glossary)
      }
      .padding(.horizontal, 20)
    }
  }

  /// The handbook's tools, less the page listing them and those with their own places (v1's Tìm the same).
  private var siteTools: [HandbookIndex.Item] {
    let tools = handbook.shelves.all(.tool)
    let page = tools.first { t in tools.count > 1 && tools.allSatisfy { $0.path.hasPrefix(t.path) } }
    return tools.filter { item in
      guard item.path != page?.path else { return false }
      switch AppScreen.of(handbook.url(item), site: handbook.site) {
      case .fishId, .lights, .tanks: return false
      default: return true
      }
    }
  }

  private func toolSymbol(_ item: HandbookIndex.Item, _ screen: AppScreen?) -> String {
    switch screen {
    case .some(.tankMates): return "fish"
    case .some(.tankVolume): return "cube.transparent"
    default:
      let slug = item.path.split(separator: "/").last.map(String.init) ?? ""
      return ["du-toan-be", "anggaran-akuarium", "tank-budget"].contains(slug) ? "banknote" : "wrench.and.screwdriver"
    }
  }

  private func tool(_ title: LocalizedStringKey, _ symbol: String, _ value: some Hashable) -> some View {
    NavigationLink(value: value) { toolLabel(Text(title), symbol) }.buttonStyle(CardPress())
  }

  private func toolLabel(_ title: Text, _ symbol: String) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      // One height for every symbol: the words start on one line across a row.
      Image(systemName: symbol).font(.title3).foregroundStyle(Color.accentColor).frame(height: toolSymbolHeight, alignment: .leading)
      title.font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(3).multilineTextAlignment(.leading)
    }
    .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
    .padding(14)
    .background(.fill.quaternary, in: .rect(cornerRadius: 16, style: .continuous))
  }
}

/// A featured page: a wide photo with its kind and name at the foot.
/// A family of fish on its shelf: its words on its photo's colour, as the cards have them, not a dark scrim.
private struct GroupTile: View {
  let group: HandbookShelves.Shelf
  let height: CGFloat
  @State private var colour: Color

  init(group: HandbookShelves.Shelf, height: CGFloat) {
    self.group = group
    self.height = height
    _colour = State(initialValue: PhotoColour.cached(group.img) ?? PhotoColour.fallback)
  }

  var body: some View {
    V2Photo(src: group.img, box: group.imgBox, ground: colour) { colour = $0 }
      // No photo: the kind's mark on the colour, as a row's, not an empty block.
      .overlay { if group.img == nil { Image(systemName: HandbookIndex.Kind.fish.symbol).font(.title2).foregroundStyle(.white.opacity(0.4)).accessibilityHidden(true) } }
      // No fade with no photo to fade: it dimmed the mark under a name on two lines.
      .modifier(WordsOnPhoto(colour: colour, edge: .bottom, height: height, fade: group.img == nil ? 0 : 20) {
        HStack(alignment: .firstTextBaseline) {
          Text(verbatim: group.label).font(.subheadline.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
          Spacer(minLength: 4)
          Text("\(group.count) loài").font(.caption)
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
      })
      .animation(.easeInOut(duration: 0.4), value: colour)
  }
}

private struct FeaturedCard: View {
  let item: HandbookIndex.Item
  let height: CGFloat
  @Environment(\.dynamicTypeSize) private var size
  @State private var colour: Color

  init(item: HandbookIndex.Item, height: CGFloat) {
    self.item = item
    self.height = height
    _colour = State(initialValue: PhotoColour.cached(item.img) ?? PhotoColour.fallback)
  }

  var body: some View {
    Group {
      // At the accessibility sizes the words would cover the photo: they go under it, on its colour.
      if size.isAccessibilitySize {
        VStack(spacing: 0) {
          V2Photo(src: item.img, box: item.imgBox, ground: colour) { colour = $0 }.frame(height: 200)
          words.frame(maxWidth: .infinity, alignment: .leading).background(colour)
        }
      } else {
        V2Photo(src: item.img, box: item.imgBox, ground: colour) { colour = $0 }
          .modifier(WordsOnPhoto(colour: colour, edge: .bottom, height: height, fade: 44) { words })
      }
    }
    .animation(.easeInOut(duration: 0.4), value: colour)
    .clipShape(.rect(cornerRadius: 20, style: .continuous))
  }

  private var words: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(verbatim: item.kind.title).font(.caption.weight(.bold)).textCase(.uppercase).opacity(0.8)
      Text(verbatim: item.name).font(.title3.weight(.heavy)).lineLimit(size.isAccessibilitySize ? nil : 2).multilineTextAlignment(.leading)
    }
    .foregroundStyle(.white)
    .padding(16)
  }
}
