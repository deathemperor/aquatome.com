import Handbook
import SwiftUI

/// The handbook before a search, as the site's home and lists arrange it: the tools first, fish ID leading them; what the
/// reader saved and read last; fish by group, then the well-known ones; plants by where they go, then easy ones; the
/// first guides, then guides by subject; the video series and every video guide; equipment; the glossary. Each way in
/// leads to one shelf of pages (BrowseView), never to everything at once.
struct HomeList: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let shelves = handbook.shelves
    let saved = handbook.saved(nil), recent = handbook.recent(nil)
    // The kept copy in use, or none at all: said first. (Each shelf says how many pages it holds.)
    if handbook.status == .offline || handbook.status == .failed {
      Section { StatusText().font(.footnote) }
    }
    Tools()
    if !saved.isEmpty {
      Section("Đã lưu để đọc sau") {
        ForEach(saved) { item in
          Row(item: item).swipeActions { Button("Bỏ lưu", role: .destructive) { handbook.toggleSaved(item) } }
        }
      }
      .accessibilityIdentifier("saved")
    }
    if !recent.isEmpty {
      Section("Đọc gần đây") { ForEach(recent) { item in Row(item: item) } }
    }
    let kept = handbook.keptItems
    if !kept.isEmpty {
      Section { AllLink(browse: .kept, count: kept.count, title: "Đã tải để đọc offline", id: "all-kept") }
    }

    // Nothing yet (loading, or no copy and no network): the status alone, not shelves of nothing.
    if handbook.count > 0 { Shelves(shelves: shelves) }
  }
}

/// The ways into each kind, as the site's home and lists arrange them.
private struct Shelves: View {
  let shelves: HandbookShelves
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    Section {
      if !shelves.groups.isEmpty {
        Tiles(shelves.groups.map { ($0, Browse.fish($0.key)) })
      }
      AllLink(browse: .fish(nil), count: shelves.all(.fish).count, title: "Tất cả loài", id: "all-fish")
    } header: {
      Text("Loài cá")
    }
    if !shelves.featuredFish.isEmpty {
      Section("Loài quen thuộc") { Cards(items: shelves.featuredFish) }
    }

    Section("Cây thủy sinh") {
      if !shelves.placements.isEmpty {
        Tiles(shelves.placements.map { ($0, Browse.plants($0.key)) })
      }
      AllLink(browse: .plants(nil), count: shelves.all(.plant).count, title: "Tất cả", id: "all-plants")
    }
    if !shelves.easyPlants.isEmpty {
      Section("Cây dễ trồng, không cần CO₂") { Cards(items: shelves.easyPlants) }
    }

    if !shelves.firstGuides.isEmpty {
      Section("Bắt đầu từ đây") { ForEach(shelves.firstGuides) { Row(item: $0) } }
    }
    Section("Hướng dẫn") {
      if !shelves.sections.isEmpty {
        Tiles(shelves.sections.map { ($0, Browse.guides($0.key)) })
      }
      AllLink(browse: .guides(nil), count: shelves.all(.guide).count, title: "Tất cả hướng dẫn", id: "all-guides")
    }
    if !shelves.videoGuides.isEmpty {
      Section("Video") {
        ForEach(shelves.all(.video)) { Row(item: $0) }
        AllLink(browse: .videos, count: shelves.videoGuides.count, title: "Tất cả", id: "all-videos")
      }
    }

    let kit = shelves.all(.equipment)
    if !kit.isEmpty {
      Section("Thiết bị") { ForEach(kit) { Row(item: $0) } }
    }

    Section("Thuật ngữ") {
      AllLink(browse: .glossary, count: shelves.all(.glossary).count, title: "Tất cả", id: "all-glossary")
    }
    // What's new on the site, as its menu and footer offer it, with the day of its newest: the list stops at the site's
    // 200, so a count would say nothing.
    if let newest = handbook.latest.first {
      Section {
        NavigationLink(value: Browse.latest) {
          LabeledContent { Text(verbatim: newest.entry.shown).monospacedDigit() } label: { Text("Mới cập nhật") }
        }
        .accessibilityIdentifier("all-latest")
      }
    }
    // How to reach AquaTome, signed in or not: the site's contact page, in the browser.
    Section {
      Link("Liên hệ", destination: URL(string: String(localized: "https://aquatome.com/lien-he/"))!).accessibilityIdentifier("contact")
    }
  }
}

/// Tìm's tools, first under search (the owner's ask): fish ID as the one card that leads, then the index's other tools as
/// tiles, each by the short name its card on the site's tools page has, two to a row (one at accessibility sizes, so a
/// name never squeezes). Left out: the tools a tab holds (the lights, the tanks) and the tools page itself. The card needs
/// no index; the tiles come with it, so a tool the site adds shows here without an app release.
private struct Tools: View {
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    let tiles = self.tiles
    Section {
      FishIdCard { openScreen(.fishId) }
      if !tiles.isEmpty {
        LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .top), count: size.isAccessibilitySize ? 1 : 2),
                  spacing: 8) {
          ForEach(tiles) { ToolTile(item: $0) }
        }
        .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 0, trailing: 0))
        .listRowBackground(Color.clear)
        .listRowSeparator(.hidden)
      }
    } header: {
      Text("Công cụ")
    }
  }

  private var tiles: [HandbookIndex.Item] {
    let tools = handbook.shelves.all(.tool)
    // The tools page: the one every other tool's page is under.
    let page = tools.first { t in tools.allSatisfy { $0.path.hasPrefix(t.path) } }
    return tools.filter { item in
      guard item.path != page?.path else { return false }
      switch AppScreen.of(handbook.url(item), site: handbook.site) {
      case .fishId, .lights, .tanks: return false
      default: return true
      }
    }
  }
}

/// Fish ID, leading Tìm's tools: the one card on Tìm filled with the accent colour, a button to its screen (which asks
/// for the photo). Its words and icon take the ink that reads on that fill: white on light mode's dark green, near-black
/// on dark mode's light green, where white would be 1.7:1. A card of its own on the list's background, as the tiles under
/// it are; at accessibility sizes its icon goes above its words, which then have the card's whole width.
private struct FishIdCard: View {
  let open: () -> Void
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    let ink = scheme == .dark ? Color(white: 0.07) : Color.white
    let stacked = size.isAccessibilitySize
    let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
    Button(action: open) {
      HStack(spacing: 12) {
        layout {
          Image(systemName: "camera.fill")
            .font(.title3)
            .padding(10)
            .background(ink.opacity(0.15), in: Circle())
            .accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text("Đây là cá gì?").font(.headline)
            Text("Chụp hoặc chọn ảnh: cá, tép, ốc hay cây").font(.subheadline)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        if !stacked { Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).accessibilityHidden(true) }
      }
      .foregroundStyle(ink)
      .padding(16)
      .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .listRowInsets(EdgeInsets())
    .listRowBackground(Color.clear)
    .listRowSeparator(.hidden)
    .accessibilityIdentifier("tool-fish-id")
  }
}

/// A tool as a tile: its symbol and short name (its page's title from a site that gives none), on a card like the list's
/// rows. Its own screen when the app has one, else its page; a button either way, so the list adds no chevron of its own.
private struct ToolTile: View {
  let item: HandbookIndex.Item
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen

  var body: some View {
    let screen = AppScreen.of(handbook.url(item), site: handbook.site)
    Button { openScreen(screen ?? .page(item.path)) } label: {
      VStack(alignment: .leading, spacing: 6) {
        Image(systemName: symbol(screen)).font(.title3).foregroundStyle(.tint).accessibilityHidden(true)
        Text(verbatim: item.short ?? item.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
          .multilineTextAlignment(.leading)
      }
      .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
      .padding(12)
      .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("tool-tile")
  }

  /// A known tool's symbol, by its screen or (one the app shows as its page) its page's name in any language; a wrench
  /// for a tool the app doesn't know yet.
  private func symbol(_ screen: AppScreen?) -> String {
    switch screen {
    case .some(.tankMates): return "fish"
    case .some(.tankVolume): return "cube.transparent"
    default:
      let slug = item.path.split(separator: "/").last.map(String.init) ?? ""
      return ["du-toan-be", "anggaran-akuarium", "tank-budget"].contains(slug) ? "banknote" : "wrench.and.screwdriver"
    }
  }
}

/// A shelf's way in: its word and how many pages it holds, with its photo when the site picked one, in a row that
/// scrolls sideways.
private struct Tiles: View {
  let tiles: [(shelf: HandbookShelves.Shelf, browse: Browse)]
  init(_ tiles: [(HandbookShelves.Shelf, Browse)]) { self.tiles = tiles.map { (shelf: $0.0, browse: $0.1) } }

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 10) {
        ForEach(tiles, id: \.shelf.key) { t in
          NavigationLink(value: t.browse) {
            HStack(spacing: 8) {
              if let img = t.shelf.img.flatMap(URL.init(string:)) {
                AsyncImage(url: img) { $0.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.15) }
                  .frame(width: 36, height: 36)
                  .clipShape(Circle())
              }
              VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: t.shelf.label).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                Text(verbatim: "\(t.shelf.count)").font(.caption).foregroundStyle(.secondary).monospacedDigit()
              }
            }
            .padding(.vertical, 6)
            .padding(.leading, t.shelf.img == nil ? 12 : 6)
            .padding(.trailing, 12)
            .background(.quaternary.opacity(0.5), in: Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityElement(children: .combine)
          .accessibilityIdentifier("shelf")
        }
      }
      .padding(.vertical, 4)
    }
    .listRowInsets(EdgeInsets(top: 6, leading: 12, bottom: 6, trailing: 12))
  }
}

/// Pages the site leads with, as photo cards in a row that scrolls sideways.
private struct Cards: View {
  let items: [HandbookIndex.Item]

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(alignment: .top, spacing: 12) {
        ForEach(items) { item in
          NavigationLink(value: item) { Card(item: item).frame(width: 150) }.buttonStyle(.plain)
        }
      }
      .padding(.vertical, 4)
    }
    .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
  }
}

/// A page as a card: its photo, its name and its scientific name.
struct Card: View {
  let item: HandbookIndex.Item

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Color.secondary.opacity(0.12)
        .aspectRatio(4 / 3, contentMode: .fit)
        .overlay {
          AsyncImage(url: item.img.flatMap(URL.init(string:))) { $0.resizable().scaledToFill() } placeholder: {
            Image(systemName: item.kind.symbol).font(.title2).foregroundStyle(.secondary)
          }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10))
      Text(item.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(2)
      if let sub = item.sub { Text(sub).font(.caption).italic().foregroundStyle(.secondary).lineLimit(1) }
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("item")
  }
}

/// The whole shelf of a kind, with how many pages it holds.
private struct AllLink: View {
  let browse: Browse
  let count: Int
  let title: LocalizedStringKey
  let id: String

  var body: some View {
    NavigationLink(value: browse) {
      LabeledContent { Text(verbatim: "\(count)").monospacedDigit() } label: { Text(title) }
    }
    .accessibilityIdentifier(id)
  }
}
