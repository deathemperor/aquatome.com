import Handbook
import SwiftUI

/// The handbook before a search, as the site's home and lists arrange it: what the reader saved and read last; fish by
/// group, then the well-known ones; plants by where they go, then easy ones; the first guides, then guides by subject;
/// the video series and every video guide; the tools; the glossary. Each way in leads to one shelf of pages
/// (BrowseView), never to everything at once.
struct HomeList: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let shelves = handbook.shelves
    let saved = handbook.saved(nil), recent = handbook.recent(nil)
    // The kept copy in use, or none at all: said first. (Each shelf says how many pages it holds.)
    if handbook.status == .offline || handbook.status == .failed {
      Section { StatusText().font(.footnote) }
    }
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

    // Nothing yet (loading, or no copy and no network): the status alone, not shelves of nothing.
    if handbook.count > 0 { Shelves(shelves: shelves) }
  }
}

/// The ways into each kind, as the site's home and lists arrange them.
private struct Shelves: View {
  let shelves: HandbookShelves

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

    let tools = shelves.all(.tool)
    if !tools.isEmpty {
      Section("Công cụ") { ForEach(tools) { Row(item: $0) } }
    }
    Section("Thuật ngữ") {
      AllLink(browse: .glossary, count: shelves.all(.glossary).count, title: "Tất cả", id: "all-glossary")
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
