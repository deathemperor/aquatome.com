import Handbook
import SwiftUI

/// The handbook before a search, about three screens of it (docs/design/tim.md): the tools first, fish ID leading them;
/// what the reader read last and saved; then a shelf for each kind (fish, plants, guides, video series), each as one
/// pattern (BrowseShelf); equipment as a grid; the glossary and what's new. Each way in leads to one shelf of pages
/// (BrowseView), never to everything at once.
struct HomeList: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    // The kept copy in use, or none at all: said first. (Each shelf says how many pages it holds.)
    if handbook.status == .offline || handbook.status == .failed {
      Section { StatusText().font(.footnote) }
    }
    Tools()
    ReadOn()
    // Nothing yet (loading, or no copy and no network): the status alone, not shelves of nothing.
    if handbook.count > 0 { Shelves(shelves: handbook.shelves) }
  }
}

/// "Đọc tiếp", once something has been read: the last pages read as small cards in a row that scrolls sideways (three
/// rows at the accessibility text sizes), then the pages saved to read later, how many, their list a tap away. A new
/// phone has neither, and no section.
private struct ReadOn: View {
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    let recent = handbook.recent(nil), saved = handbook.saved(nil)
    if !recent.isEmpty || !saved.isEmpty {
      Section("Đọc tiếp") {
        if !recent.isEmpty {
          if size.isAccessibilitySize {
            ForEach(recent.prefix(3)) { Row(item: $0) }
          } else {
            Picks(items: recent, width: 130) { RecentCard(item: $0) }.accessibilityIdentifier("recent")
          }
        }
        if !saved.isEmpty {
          NavigationLink(value: Browse.saved) {
            LabeledContent { Text(saved.count, format: .number).monospacedDigit() } label: {
              Label { Text("Đã lưu để đọc sau") } icon: { Tile(symbol: "bookmark.fill", color: .orange) }
            }
          }
          .accessibilityIdentifier("all-saved")
        }
      }
    }
  }
}

/// A shelf of each kind, as one pattern, then equipment and the closing card. A shelf with nothing in it isn't drawn
/// (Indonesian and Thai have no videos).
private struct Shelves: View {
  let shelves: HandbookShelves
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let fish = shelves.all(.fish), plants = shelves.all(.plant), guides = shelves.all(.guide), series = shelves.all(.video)
    if !fish.isEmpty {
      BrowseShelf(title: "Cá", chips: shelves.groups.map { ($0, Browse.fish($0.key)) }, chipsTitle: "Nhóm cá", ways: .fish,
                  caption: "Loài quen thuộc", picks: shelves.featuredFish, all: fish.count, allTitle: "Tất cả loài",
                  allValue: Text(fish.count, format: .number), browse: .fish(nil), id: "all-fish") { Card(item: $0) }
    }
    if !plants.isEmpty {
      BrowseShelf(title: "Cây thủy sinh", chips: shelves.placements.map { ($0, Browse.plants($0.key)) }, chipsTitle: "Vị trí trồng",
                  ways: .plant, caption: "Dễ trồng, không cần CO₂", picks: shelves.easyPlants, all: plants.count,
                  allTitle: "Tất cả cây", allValue: Text(plants.count, format: .number), browse: .plants(nil), id: "all-plants") {
        Card(item: $0)
      }
    }
    if !guides.isEmpty {
      BrowseShelf(title: "Hướng dẫn", chips: shelves.sections.map { ($0, Browse.guides($0.key)) }, chipsTitle: "Chủ đề",
                  ways: .guide, caption: "Bắt đầu từ đây", picks: shelves.firstGuides, width: 200, all: guides.count,
                  allTitle: "Tất cả hướng dẫn", allValue: Text(guides.count, format: .number), browse: .guides(nil), id: "all-guides") {
        GuideCard(item: $0)
      }
    }
    if !series.isEmpty {
      // Eight series as cards; the whole list counts series too, so its one number matches its label.
      BrowseShelf(title: "Video hướng dẫn", chips: [], chipsTitle: nil, ways: .video, caption: nil, picks: Array(series.prefix(8)),
                  width: 170, all: series.count, allTitle: "Tất cả video", allValue: Text("\(series.count) bộ"), browse: .videos,
                  id: "all-videos") { SeriesCard(item: $0) }
    }
    let kit = shelves.all(.equipment)
    if !kit.isEmpty {
      Section("Thiết bị") { KitGrid(items: kit) }
    }
    Closing(glossary: shelves.all(.glossary).count)
  }
}

/// One shelf, as every shelf on Tìm is (docs/design/tim.md): its chips that browse it, a named row of picks, and the whole
/// shelf with its count, which isn't there when the picks are all of it. At the accessibility text sizes the chips are
/// one row that lists them ("Nhóm cá · 14"), and the picks three rows.
private struct BrowseShelf<Pick: View>: View {
  let title: LocalizedStringKey
  let chips: [(shelf: HandbookShelves.Shelf, browse: Browse)]
  let chipsTitle: LocalizedStringKey?
  let ways: HandbookIndex.Kind
  let caption: LocalizedStringKey?
  let picks: [HandbookIndex.Item]
  var width: CGFloat = 150
  let all: Int
  let allTitle: LocalizedStringKey
  let allValue: Text
  let browse: Browse
  let id: String
  @ViewBuilder let pick: (HandbookIndex.Item) -> Pick
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    let large = size.isAccessibilitySize
    let shown = large ? Array(picks.prefix(3)) : picks
    Section {
      if !chips.isEmpty, let chipsTitle {
        if large {
          NavigationLink(value: Browse.ways(ways)) {
            LabeledContent { Text(chips.count, format: .number).monospacedDigit() } label: { Text(chipsTitle) }
          }
          .accessibilityIdentifier("ways")
        } else {
          Chips(chips)
        }
      }
      if !shown.isEmpty {
        if large {
          if let caption { Text(caption).font(.subheadline.weight(.semibold)) }
          ForEach(shown) { ShelfRow(item: $0) }
        } else {
          VStack(alignment: .leading, spacing: 8) {
            if let caption { Text(caption).font(.subheadline.weight(.semibold)).accessibilityAddTraits(.isHeader) }
            Picks(items: shown, width: width, pick: pick)
          }
          .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 0))
        }
      }
      if all > shown.count {
        NavigationLink(value: browse) {
          LabeledContent { allValue.monospacedDigit() } label: { Text(allTitle) }
        }
        .accessibilityIdentifier(id)
      }
    } header: {
      Text(title)
    }
  }
}

/// A shelf's chips: each way into it (a group, where plants go, a subject), its word and how many pages it holds, with
/// its photo when the site picked one, in a row that scrolls sideways.
private struct Chips: View {
  let chips: [(shelf: HandbookShelves.Shelf, browse: Browse)]
  init(_ chips: [(shelf: HandbookShelves.Shelf, browse: Browse)]) { self.chips = chips }

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 10) {
        ForEach(chips, id: \.shelf.key) { t in
          NavigationLink(value: t.browse) {
            HStack(spacing: 8) {
              if t.shelf.img != nil {
                V2Photo(src: t.shelf.img, box: t.shelf.imgBox)
                  .frame(width: 36, height: 36)
                  .clipShape(Circle())
              }
              VStack(alignment: .leading, spacing: 0) {
                Text(verbatim: t.shelf.label).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
                Text(t.shelf.count, format: .number).font(.caption).foregroundStyle(.secondary).monospacedDigit()
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

/// Pages as cards in a row that scrolls sideways, each opening its page.
private struct Picks<Pick: View>: View {
  let items: [HandbookIndex.Item]
  let width: CGFloat
  @ViewBuilder let pick: (HandbookIndex.Item) -> Pick

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(alignment: .top, spacing: 12) {
        ForEach(items) { item in
          NavigationLink(value: item) { pick(item).frame(width: width, alignment: .leading) }.buttonStyle(.plain)
        }
      }
      .padding(.trailing, 16)
    }
    .scrollClipDisabled()
  }
}

/// A page of a shelf as a row, at the accessibility text sizes: its name with the row's width (ItemRow's, with no
/// picture), its scientific name, or a series' count of videos as its card says (no channel: the series' page credits
/// it); a kind of kit with its tile's symbol. No line saying what it is: the shelf's header says it.
private struct ShelfRow: View {
  let item: HandbookIndex.Item

  var body: some View {
    NavigationLink(value: item) {
      HStack(spacing: 12) {
        if item.kind == .equipment {
          Image(systemName: KitGrid.symbol(item)).foregroundStyle(.tint).accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(item.name).foregroundStyle(.primary)
          if item.kind == .video {
            if let n = item.parts { Text("\(n) video").font(.caption).foregroundStyle(.secondary) }
          } else if let sub = item.subUnderName {
            Text(sub).font(.caption).italic().foregroundStyle(.secondary)
          }
        }
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("item")
    }
  }
}

/// A page as a card: its photo, its name and its scientific name.
struct Card: View {
  let item: HandbookIndex.Item

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Photo(item: item)
      Text(item.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(2)
      if let sub = item.subUnderName { Text(sub).font(.caption).italic().foregroundStyle(.secondary).lineLimit(1) }
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("item")
  }
}

/// A page read lately: its photo, its name on two lines, and what it is.
private struct RecentCard: View {
  let item: HandbookIndex.Item

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Photo(item: item)
      Text(item.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(2, reservesSpace: true)
      Text(item.video != nil ? HandbookIndex.Kind.video.title : item.kind.title).font(.caption).foregroundStyle(.secondary)
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("item")
  }
}

/// A guide to start from: its photo and its title on up to three lines.
private struct GuideCard: View {
  let item: HandbookIndex.Item

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Photo(item: item)
      Text(item.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(3)
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("item")
  }
}

/// A video series as a tinted card: a play symbol, its title on up to three lines, and how many videos it has. No
/// thumbnail: YouTube's show faces, hands and channels' logos, which the site's photo rules keep off its pages
/// (docs/governance.md, Photos). No channel: the series' page credits it.
private struct SeriesCard: View {
  let item: HandbookIndex.Item

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Image(systemName: "play.rectangle.fill").font(.title3).foregroundStyle(.tint).accessibilityHidden(true)
      Text(item.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(3, reservesSpace: true)
        .multilineTextAlignment(.leading)
      // Not `.secondary`: 3.9:1 on the card's tint.
      if let n = item.parts { Text("\(n) video").font(.caption).foregroundStyle(.primary.opacity(0.7)) }
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .topLeading)
    .background(Color.accentColor.opacity(0.12), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("series")
  }
}

/// A card's photo, 4:3, by the frame rule: the whole fish, on its blur where the frame would cut it (the owner's report
/// of 14 Nov: the loaches' list showed a kuhli's middle); the kind's symbol where there's none.
private struct Photo: View {
  let item: HandbookIndex.Item

  var body: some View {
    V2Photo(src: item.img, box: item.imgBox)
      .aspectRatio(4 / 3, contentMode: .fit)
      .overlay { if item.img == nil { Image(systemName: item.kind.symbol).font(.title2).foregroundStyle(.secondary) } }
      .clipShape(RoundedRectangle(cornerRadius: 10))
  }
}

/// The kinds of kit, three to a row as small tiles, each its symbol and name (the index's photos of them don't show the
/// kit); a list at the accessibility text sizes.
private struct KitGrid: View {
  let items: [HandbookIndex.Item]
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    if size.isAccessibilitySize {
      ForEach(items) { ShelfRow(item: $0) }
    } else {
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8, alignment: .top), count: 3), spacing: 8) {
        ForEach(items) { item in
          NavigationLink(value: item) {
            VStack(alignment: .leading, spacing: 6) {
              Image(systemName: Self.symbol(item)).font(.title3).foregroundStyle(.tint).accessibilityHidden(true)
              Text(item.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary).lineLimit(2)
                .multilineTextAlignment(.leading)
            }
            .frame(maxWidth: .infinity, minHeight: 64, alignment: .topLeading)
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .contentShape(.rect)
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("kit")
        }
      }
      .listRowInsets(EdgeInsets(top: 8, leading: 0, bottom: 0, trailing: 0))
      .listRowBackground(Color.clear)
      .listRowSeparator(.hidden)
      // A grid of one kind is a row with one link, which List gives its own chevron, outside the tile.
      .navigationLinkIndicatorVisibility(.hidden)
    }
  }

  /// A kind of kit's symbol, by its category (the last part of its path, the same in every language); a gear for one
  /// the app doesn't know yet.
  static func symbol(_ item: HandbookIndex.Item) -> String {
    switch item.path.split(separator: "/").last.map(String.init) ?? "" {
    case "be-ca": "cube"
    case "cay-thuy-sinh": "leaf"
    case "co2": "bubbles.and.sparkles"
    case "den": "lightbulb"
    case "loc": "arrow.triangle.2.circlepath"
    case "phan-nen": "mountain.2"
    case "suoi": "thermometer.medium"
    case "test-nuoc": "testtube.2"
    case "thuc-an": "fork.knife"
    default: "gearshape"
    }
  }
}

/// The page's end: the glossary, with how many terms, and what's new on the site, as its menu and footer offer them.
/// How to reach AquaTome is in the account sheet's "Về AquaTome".
private struct Closing: View {
  let glossary: Int
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    if glossary > 0 || !handbook.latest.isEmpty {
      Section {
        if glossary > 0 {
          NavigationLink(value: Browse.glossary) {
            LabeledContent { Text(glossary, format: .number).monospacedDigit() } label: {
              Label { Text("Từ điển thuật ngữ") } icon: { Tile(symbol: "character.book.closed.fill", color: .blue) }
            }
          }
          .accessibilityIdentifier("all-glossary")
        }
        if !handbook.latest.isEmpty {
          NavigationLink(value: Browse.latest) {
            Label { Text("Mới cập nhật") } icon: { Tile(symbol: "sparkles", color: Tile.green) }
          }
          .accessibilityIdentifier("all-latest")
        }
      }
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
    // The tools page: the one every other tool's page is under (and there are others).
    let page = tools.first { t in tools.count > 1 && tools.allSatisfy { $0.path.hasPrefix(t.path) } }
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
