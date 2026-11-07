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
  /// The tab in front. "Đọc gần đây" is as it was when it came to the front, so a page just read stays where it was
  /// tapped, for its zoom back, and the shelves don't move; it takes its new place next time.
  let front: Bool
  @State private var recentShown: [HandbookIndex.Item] = []
  /// The large title has gone up into the bar: the page's words are under the bar from here, and the band would hide the
  /// title before this.
  @State private var titleGone = false
  @ScaledMetric(relativeTo: .largeTitle) private var titleHeight: CGFloat = 44
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen
  @Environment(\.dynamicTypeSize) private var size
  @Namespace private var zoom
  // Sizes growing with the text, so a tile's words stay whole at the larger sizes.
  @ScaledMetric(relativeTo: .title3) private var featuredHeight: CGFloat = 250
  @ScaledMetric(relativeTo: .subheadline) private var tileHeight: CGFloat = 104
  @ScaledMetric(relativeTo: .subheadline) private var tileWidth: CGFloat = 168
  @ScaledMetric(relativeTo: .body) private var rowHeight: CGFloat = 76
  @ScaledMetric(relativeTo: .subheadline) private var guideWidth: CGFloat = 250
  @ScaledMetric(relativeTo: .headline) private var videoWidth: CGFloat = 230
  @ScaledMetric(relativeTo: .headline) private var videoHeight: CGFloat = 176
  @ScaledMetric(relativeTo: .title3) private var toolSymbolHeight: CGFloat = 28

  var body: some View {
    let s = handbook.shelves
    let top = featuredItems(s)
    let saved = handbook.saved(nil).filter { !top.map(\.path).contains($0.path) }
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
          if !saved.isEmpty { columns("Đã lưu để đọc sau", saved) }
          if !recent.isEmpty { columns("Đọc gần đây", recent) }
          if !handbook.keptItems.isEmpty { chips([(String(localized: "Đã tải để đọc offline"), handbook.keptItems.count, Browse.kept)]) }
          if !s.groups.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              ShelfHeader(title: "Cá", more: size.isAccessibilitySize ? nil : Browse.fish(nil))
              groups(s.groups)
            }
          }
          let fish = s.featuredFish.filter { !onTop.contains($0.path) }
          if !fish.isEmpty { columns("Loài quen thuộc", fish, more: Browse.fish(nil)) }
          let plants = s.easyPlants.filter { !onTop.contains($0.path) }
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
          let first = s.firstGuides.filter { !onTop.contains($0.path) }
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
          let series = s.all(.video).filter { !onTop.contains($0.path) }
          if !series.isEmpty {
            if size.isAccessibilitySize { columns("Video", Array(series.prefix(8)), more: Browse.videos) } else { videos(Array(series.prefix(8))) }
          }
          let kit = s.all(.equipment).filter { !onTop.contains($0.path) }
          if !kit.isEmpty { columns("Thiết bị", kit) }
          tools
        }
        .padding(.vertical, 12)
      }
      .onScrollGeometryChange(for: Bool.self) { [titleHeight] in $0.contentOffset.y + $0.contentInsets.top > titleHeight } action: { _, gone in titleGone = gone }
      .modifier(ClearUnderTopBar(shown: titleGone))
      .navigationTitle("Khám phá")
      .profileButton()
      .v2Destinations(zoom: zoom)
      .overlay { if handbook.status == .loading { ProgressView() } }
      .task { await handbook.appear() }
      .refreshable { await handbook.load() }
    }
    // On the stack, not its first screen, which disappears and comes back with a page pushed and popped.
    .onChange(of: front, initial: true) { recentShown = handbook.recent(nil) }
    .onChange(of: handbook.status) { recentShown = handbook.recent(nil) }
  }

  /// The top's pages: the fish and guides the site puts first, with photos.
  private func featuredItems(_ s: HandbookShelves) -> [HandbookIndex.Item] {
    (Array(s.featuredFish.prefix(3)) + Array(s.firstGuides.prefix(2))).filter { $0.img != nil }
  }

  /// The top: wide cards, the next one peeking.
  private func featured(_ items: [HandbookIndex.Item]) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      LazyHStack(spacing: 12) {
        ForEach(items) { item in
          NavigationLink(value: item) {
            FeaturedCard(item: item, height: featuredHeight).containerRelativeFrame(.horizontal) { w, _ in w - 72 }
          }
          .buttonStyle(CardPress())
          .matchedTransitionSource(id: item.path, in: zoom)
        }
      }
      .scrollTargetLayout()
    }
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .scrollTargetBehavior(.viewAligned)
    .scrollClipDisabled()
  }

  /// The fish groups as photo tiles, two rows that page sideways; at the accessibility sizes, the first five down the
  /// screen, then the whole list.
  @ViewBuilder private func groups(_ groups: [HandbookShelves.Shelf]) -> some View {
    if size.isAccessibilitySize {
      VStack(alignment: .leading, spacing: 14) {
        ForEach(groups.prefix(5)) { g in
          NavigationLink(value: Browse.fish(g.key)) {
            HStack(spacing: 12) {
              V2Photo(src: g.img).frame(width: 88, height: 88).clipShape(.rect(cornerRadius: 20, style: .continuous))
              VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: g.label).font(.body.weight(.semibold))
                Text(g.count, format: .number).font(.subheadline).foregroundStyle(.secondary)
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
            V2Photo(src: g.img)
              .frame(width: tileWidth, height: tileHeight)
              .overlay {
                // Enough under the words on a light photo, up to a two-line name's first line: 4.5:1.
                LinearGradient(stops: [.init(color: .clear, location: 0.1), .init(color: .black.opacity(0.6), location: 0.5), .init(color: .black.opacity(0.75), location: 0.85)],
                               startPoint: .top, endPoint: .bottom)
              }
              .overlay(alignment: .bottomLeading) {
                HStack(alignment: .firstTextBaseline) {
                  Text(verbatim: g.label).font(.subheadline.weight(.semibold)).lineLimit(2)
                  Spacer(minLength: 4)
                  Text(g.count, format: .number).font(.caption)
                }
                .foregroundStyle(.white)
                .padding(10)
              }
              .clipShape(.rect(cornerRadius: 14, style: .continuous))
          }
          .buttonStyle(CardPress())
        }
      }
      .scrollTargetLayout()
    }
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .scrollTargetBehavior(.viewAligned)
  }

  /// Pages as lockups in columns of three that page sideways, each with its button, the next column peeking; at the
  /// accessibility sizes, a list down the screen: the first five with a whole list to go to, else them all.
  private func columns(_ title: LocalizedStringKey, _ items: [HandbookIndex.Item], more: Browse? = nil) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      ShelfHeader(title: title, more: size.isAccessibilitySize ? nil : more)
      if size.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 14) {
          ForEach(items.prefix(more == nil ? items.count : 5)) { item in
            Lockup(item: item, line: factsLine(item, handbook.lang))
              .matchedTransitionSource(id: item.path, in: zoom)
          }
          if let more { moreLink(more) }
        }
        .padding(.horizontal, 20)
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHGrid(rows: Array(repeating: GridItem(.fixed(rowHeight), spacing: 12), count: min(3, items.count)), spacing: 16) {
            ForEach(items) { item in
              Lockup(item: item, line: factsLine(item, handbook.lang))
                // One column's worth: the whole width for the words, no next column to peek (`w` is less the margins).
                .containerRelativeFrame(.horizontal) { w, _ in items.count <= 3 ? w : w - 32 }
                .matchedTransitionSource(id: item.path, in: zoom)
            }
          }
          .scrollTargetLayout()
        }
        .contentMargins(.horizontal, 20, for: .scrollContent)
        .scrollTargetBehavior(.viewAligned)
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
                V2Photo(src: item.img)
                  .frame(width: guideWidth, height: guideWidth * 0.62)
                  .clipShape(.rect(cornerRadius: 16, style: .continuous))
                  .matchedTransitionSource(id: item.path, in: zoom)
                Text(verbatim: item.name).font(.subheadline.weight(.semibold)).lineLimit(3)
                  .multilineTextAlignment(.leading)
              }
              .frame(width: guideWidth, alignment: .leading)
            }
            .buttonStyle(CardPress())
          }
        }
        .scrollTargetLayout()
      }
      .contentMargins(.horizontal, 20, for: .scrollContent)
      .scrollTargetBehavior(.viewAligned)
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
              .frame(width: videoWidth, height: videoHeight, alignment: .topLeading)
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
          V2Photo(src: item.img) { colour = $0 }.frame(height: 200)
          words.frame(maxWidth: .infinity, alignment: .leading).background(colour)
        }
      } else {
        V2Photo(src: item.img) { colour = $0 }
          .frame(height: height)
          .modifier(WordsOnPhoto(colour: colour, edge: .bottom, fade: 44) { words })
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
