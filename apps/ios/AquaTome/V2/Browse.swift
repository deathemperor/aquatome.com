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
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size
  @Namespace private var zoom
  // Sizes growing with the text, so a tile's words stay whole at the larger sizes.
  @ScaledMetric(relativeTo: .title3) private var featuredHeight: CGFloat = 230
  @ScaledMetric(relativeTo: .subheadline) private var tileHeight: CGFloat = 104
  @ScaledMetric(relativeTo: .subheadline) private var tileWidth: CGFloat = 168
  @ScaledMetric(relativeTo: .body) private var rowHeight: CGFloat = 76
  @ScaledMetric(relativeTo: .subheadline) private var guideWidth: CGFloat = 250
  @ScaledMetric(relativeTo: .headline) private var videoWidth: CGFloat = 200
  @ScaledMetric(relativeTo: .headline) private var videoHeight: CGFloat = 190

  var body: some View {
    let s = handbook.shelves
    let top = featuredItems(s)
    let saved = handbook.saved(nil).filter { !top.map(\.path).contains($0.path) }
    let recent = handbook.recent(nil).filter { r in !(top + saved).contains { $0.path == r.path } }
    // A page on one shelf only, the first it's on (its zoom starts there).
    let onTop = Set((top + saved + recent).map(\.path))
    NavigationStack(path: $path) {
      ScrollView {
        VStack(alignment: .leading, spacing: 34) {
          featured(top)
          if !saved.isEmpty { columns("Đã lưu để đọc sau", saved, action: .view) }
          if !recent.isEmpty { columns("Đọc gần đây", recent, action: .view) }
          if !handbook.keptItems.isEmpty { chips([(String(localized: "Đã tải để đọc offline"), handbook.keptItems.count, Browse.kept)]) }
          if !s.groups.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              ShelfHeader(title: "Cá", more: Browse.fish(nil))
              groups(s.groups)
            }
          }
          let fish = s.featuredFish.filter { !onTop.contains($0.path) }
          if !fish.isEmpty { columns("Loài quen thuộc", fish, more: Browse.fish(nil)) }
          let plants = s.easyPlants.filter { !onTop.contains($0.path) }
          if !plants.isEmpty || !s.placements.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              if !plants.isEmpty { columns("Cây thủy sinh", plants, more: Browse.plants(nil)) }
              chips(s.placements.map { ($0.label, $0.count, Browse.plants($0.key)) })
            }
          }
          let first = s.firstGuides.filter { !onTop.contains($0.path) }
          VStack(alignment: .leading, spacing: 12) {
            if !first.isEmpty { guides(first) }
            chips(s.sections.map { ($0.label, $0.count, Browse.guides($0.key)) })
          }
          let series = s.all(.video)
          if !series.isEmpty { videos(Array(series.prefix(8))) }
          let kit = s.all(.equipment).filter { !onTop.contains($0.path) }
          if !kit.isEmpty { columns("Thiết bị", kit, action: .view) }
          tools
        }
        .padding(.vertical, 12)
      }
      .navigationTitle("Khám phá")
      .profileButton()
      .v2Destinations(zoom: zoom)
      .overlay { if handbook.status == .loading { ProgressView() } }
      .task { await handbook.appear() }
      .refreshable { await handbook.load() }
    }
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

  /// The fish groups as photo tiles, two rows that page sideways.
  private func groups(_ groups: [HandbookShelves.Shelf]) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      LazyHGrid(rows: [GridItem(.fixed(tileHeight), spacing: 10), GridItem(.fixed(tileHeight))], spacing: 10) {
        ForEach(groups) { g in
          NavigationLink(value: Browse.fish(g.key)) {
            V2Photo(src: g.img)
              .frame(width: tileWidth, height: tileHeight)
              .overlay {
                LinearGradient(colors: [.clear, .black.opacity(0.6)], startPoint: .center, endPoint: .bottom)
              }
              .overlay(alignment: .bottomLeading) {
                HStack(alignment: .firstTextBaseline) {
                  Text(verbatim: g.label).font(.subheadline.weight(.semibold)).lineLimit(2)
                  Spacer(minLength: 4)
                  Text(g.count, format: .number).font(.caption).opacity(0.85)
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
  /// accessibility sizes, a list of the first five down the screen.
  private func columns(_ title: LocalizedStringKey, _ items: [HandbookIndex.Item], more: Browse? = nil,
                       action: LockupAction = .add) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      ShelfHeader(title: title, more: more)
      if size.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 14) {
          ForEach(items.prefix(5)) { item in
            Lockup(item: item, line: factsLine(item, handbook.lang) ?? item.sub, action: action)
              .matchedTransitionSource(id: item.path, in: zoom)
          }
        }
        .padding(.horizontal, 20)
      } else {
        ScrollView(.horizontal, showsIndicators: false) {
          LazyHGrid(rows: Array(repeating: GridItem(.fixed(rowHeight), spacing: 12), count: min(3, items.count)), spacing: 16) {
            ForEach(items) { item in
              Lockup(item: item, line: factsLine(item, handbook.lang) ?? item.sub, action: action)
                .containerRelativeFrame(.horizontal) { w, _ in w - 72 }
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
              Text(p.count, format: .number).foregroundStyle(.secondary)
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

  /// The tools and the glossary, as tiles (one to a row at the accessibility sizes).
  private var tools: some View {
    VStack(alignment: .leading, spacing: 12) {
      ShelfHeader<Browse>(title: "Công cụ")
      LazyVGrid(columns: size.isAccessibilitySize ? [GridItem(.flexible())] : [GridItem(.flexible(), spacing: 10), GridItem(.flexible())],
                spacing: 10) {
        tool("Đây là cá gì?", "camera", FishIdRoute())
        tool("Nuôi chung", "fish", TankMatesTool())
        tool("Bể bao nhiêu lít?", "cube.transparent", VolumeTool())
        tool("Mới cập nhật", "sparkles", Browse.latest)
        tool("Thuật ngữ", "character.book.closed", Browse.glossary)
      }
      .padding(.horizontal, 20)
    }
  }

  private func tool(_ title: LocalizedStringKey, _ symbol: String, _ value: some Hashable) -> some View {
    NavigationLink(value: value) {
      VStack(alignment: .leading, spacing: 10) {
        Image(systemName: symbol).font(.title3).foregroundStyle(Color.accentColor)
        Text(title).font(.subheadline.weight(.semibold)).lineLimit(3).multilineTextAlignment(.leading)
      }
      .frame(maxWidth: .infinity, minHeight: 84, alignment: .topLeading)
      .padding(14)
      .background(.fill.quaternary, in: .rect(cornerRadius: 16, style: .continuous))
    }
    .buttonStyle(CardPress())
  }
}

/// A featured page: a wide photo with its kind and name at the foot.
private struct FeaturedCard: View {
  let item: HandbookIndex.Item
  let height: CGFloat
  @State private var colour = PhotoColour.fallback

  var body: some View {
    V2Photo(src: item.img) { colour = $0 }
      .frame(height: height)
      .overlay {
        LinearGradient(stops: [.init(color: colour.opacity(0), location: 0.4), .init(color: colour.opacity(0.92), location: 1)],
                       startPoint: .top, endPoint: .bottom)
      }
      .overlay(alignment: .bottomLeading) {
        VStack(alignment: .leading, spacing: 3) {
          Text(verbatim: item.kind.title).font(.caption.weight(.bold)).textCase(.uppercase).opacity(0.8)
          Text(verbatim: item.name).font(.title3.weight(.heavy)).lineLimit(2).multilineTextAlignment(.leading)
        }
        .foregroundStyle(.white)
        .padding(16)
      }
      .animation(.easeInOut(duration: 0.4), value: colour)
      .clipShape(.rect(cornerRadius: 20, style: .continuous))
  }
}
