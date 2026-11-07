import Handbook
import SwiftUI

/// "Khám phá": the handbook's shelves, as the App Store's Apps tab: featured cards at the top, then the fish groups, the
/// well-known fish in columns of three, the easy plants, the guides to start with, the video series, the tools and the
/// glossary. Each shelf has its whole list one tap away. Links from pages and from outside the app open here, as on
/// v1's Tìm.
@available(iOS 18, *)
struct BrowseHome: View {
  @Binding var path: NavigationPath
  @Environment(HandbookModel.self) private var handbook
  @Namespace private var zoom

  var body: some View {
    let s = handbook.shelves
    NavigationStack(path: $path) {
      ScrollView {
        VStack(alignment: .leading, spacing: 34) {
          featured(s)
          if !s.groups.isEmpty {
            VStack(alignment: .leading, spacing: 12) {
              ShelfHeader(title: "Cá", more: Browse.fish(nil))
              groups(s.groups)
            }
          }
          if !s.featuredFish.isEmpty { columns("Loài quen thuộc", s.featuredFish, more: Browse.fish(nil)) }
          if !s.easyPlants.isEmpty { columns("Cây thủy sinh", s.easyPlants, more: Browse.plants(nil)) }
          if !s.firstGuides.isEmpty { guides(s.firstGuides) }
          let series = s.all(.video)
          if !series.isEmpty { videos(Array(series.prefix(8))) }
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

  /// The top: wide cards, the next one peeking, for the fish and guides the site puts first.
  private func featured(_ s: HandbookShelves) -> some View {
    let items = Array(s.featuredFish.prefix(3)) + Array(s.firstGuides.prefix(2))
    return ScrollView(.horizontal, showsIndicators: false) {
      LazyHStack(spacing: 12) {
        ForEach(items.filter { $0.img != nil }) { item in
          NavigationLink(value: item) { FeaturedCard(item: item) }
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
      LazyHGrid(rows: [GridItem(.fixed(104), spacing: 10), GridItem(.fixed(104))], spacing: 10) {
        ForEach(groups) { g in
          NavigationLink(value: Browse.fish(g.key)) {
            V2Photo(src: g.img)
              .frame(width: 168, height: 104)
              .overlay {
                LinearGradient(colors: [.clear, .black.opacity(0.55)], startPoint: .center, endPoint: .bottom)
              }
              .overlay(alignment: .bottomLeading) {
                HStack(alignment: .firstTextBaseline) {
                  Text(verbatim: g.label).font(.subheadline.weight(.semibold)).lineLimit(1)
                  Spacer(minLength: 4)
                  Text(g.count, format: .number).font(.caption).opacity(0.8)
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

  /// Pages as lockups in columns of three that page sideways, each with its button.
  private func columns(_ title: LocalizedStringKey, _ items: [HandbookIndex.Item], more: Browse) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      ShelfHeader(title: title, more: more)
      ScrollView(.horizontal, showsIndicators: false) {
        LazyHGrid(rows: Array(repeating: GridItem(.fixed(64), spacing: 12), count: 3), spacing: 16) {
          ForEach(items) { item in
            Lockup(item: item, line: factsLine(item, handbook.lang) ?? item.sub)
              .frame(width: 330)
              .matchedTransitionSource(id: item.path, in: zoom)
          }
        }
        .scrollTargetLayout()
      }
      .contentMargins(.horizontal, 20, for: .scrollContent)
      .scrollTargetBehavior(.viewAligned)
    }
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
                  .frame(width: 250, height: 156)
                  .clipShape(.rect(cornerRadius: 16, style: .continuous))
                  .matchedTransitionSource(id: item.path, in: zoom)
                Text(verbatim: item.name).font(.subheadline.weight(.semibold)).lineLimit(3)
                  .multilineTextAlignment(.leading)
              }
              .frame(width: 250, alignment: .leading)
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
                Text(verbatim: item.name).font(.headline).lineLimit(3).multilineTextAlignment(.leading)
                Spacer(minLength: 0)
                if let n = item.parts { Text("\(n) video").font(.caption.weight(.semibold)).opacity(0.75) }
              }
              .foregroundStyle(.white)
              .padding(14)
              .frame(width: 200, height: 170, alignment: .topLeading)
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

  /// The tools and the glossary, as tiles.
  private var tools: some View {
    VStack(alignment: .leading, spacing: 12) {
      ShelfHeader<Browse>(title: "Công cụ")
      LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible())], spacing: 10) {
        tool("Đây là cá gì?", "camera", FishIdRoute())
        tool("Nuôi chung", "fish", TankMatesTool())
        tool("Bể bao nhiêu lít?", "cube.transparent", VolumeTool())
        tool("Mới cập nhật", "sparkles", Browse.latest)
      }
      .padding(.horizontal, 20)
    }
  }

  private func tool(_ title: LocalizedStringKey, _ symbol: String, _ value: some Hashable) -> some View {
    NavigationLink(value: value) {
      VStack(alignment: .leading, spacing: 10) {
        Image(systemName: symbol).font(.title3).foregroundStyle(Color.accentColor)
        Text(title).font(.subheadline.weight(.semibold)).lineLimit(2).multilineTextAlignment(.leading)
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
  @State private var colour = PhotoColour.fallback

  var body: some View {
    V2Photo(src: item.img) { colour = $0 }
      .frame(width: 330, height: 230)
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
