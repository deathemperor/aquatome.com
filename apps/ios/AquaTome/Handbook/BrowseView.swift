import Handbook
import SwiftUI

/// One shelf of the handbook: a fish group, a placement, a guide subject (nil: the whole kind), the video guides, the
/// glossary, the pages kept for reading offline, what's new on the site, or the whole of a page's long list of pages.
enum Browse: Hashable {
  case fish(String?)
  case plants(String?)
  case guides(String?)
  case videos
  case glossary
  case kept
  case latest
  case pages(String, [String])
}

/// A shelf's pages: fish and plants as photo cards in the site's order, filtered as the site's lists are; guides and
/// videos as a list, which can be kept for reading offline; the glossary by letter.
struct BrowseView: View {
  let browse: Browse
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let s = handbook.shelves
    switch browse {
    case .fish(let group):
      FishShelf(items: group.map { s.fish(group: $0, handbook.labels) } ?? s.all(.fish))
        .navigationTitle(group.map { handbook.labels["group", $0] ?? $0 } ?? String(localized: "Tất cả loài"))
    case .plants(let placement):
      PlantShelf(items: placement.map { s.plants(placement: $0) } ?? s.all(.plant))
        .navigationTitle(placement.map { handbook.labels["placement", $0] ?? $0 } ?? String(localized: "Cây thủy sinh"))
    case .guides(let section):
      let guides = section.map { s.guides(section: $0) } ?? s.all(.guide)
      List(guides) { Row(item: $0) }
        .navigationTitle(section.map { handbook.labels["section", $0] ?? $0 } ?? String(localized: "Tất cả hướng dẫn"))
        .toolbar { KeepOffline(items: guides) }
    case .videos:
      List(s.videoGuides) { Row(item: $0) }
        .navigationTitle("Video")
        .toolbar { KeepOffline(items: s.videoGuides) }
    case .kept:
      // In one place: each let go of with a swipe, or all at once.
      let kept = handbook.keptItems
      List {
        ForEach(kept) { Row(item: $0) }
          .onDelete { rows in
            let gone = rows.map { kept[$0] }
            Task { await handbook.unkeep(gone) }
          }
      }
      .navigationTitle("Đã tải để đọc offline")
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button("Xóa tất cả", role: .destructive) { Task { await handbook.unkeep(kept) } }
            .disabled(kept.isEmpty)
            .accessibilityIdentifier("unkeep-all")
        }
      }
    case .latest:
      LatestList()
    case let .pages(title, paths):
      List(paths.compactMap(handbook.item(at:))) { Row(item: $0) }
        .navigationTitle(title)
    case .glossary:
      List {
        ForEach(s.glossary(), id: \.letter) { group in
          Section { ForEach(group.items) { Row(item: $0) } } header: { Text(verbatim: group.letter) }
        }
      }
      .navigationTitle("Thuật ngữ")
    }
  }
}

/// What's new on the site, as its list has it (/vi/moi-cap-nhat/): each page with the day it was added or updated and
/// the source, newest first; the rest of the list on the web.
private struct LatestList: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    List {
      Section {
        ForEach(handbook.latest) { row in
          NavigationLink(value: row.item) {
            VStack(alignment: .leading, spacing: 6) {
              ItemRow(item: row.item)
              Text(verbatim: Self.change(row.entry)).font(.caption).foregroundStyle(.secondary)
            }
            .accessibilityElement(children: .combine)
          }
          .accessibilityIdentifier("latest")
        }
      } footer: {
        if let web = handbook.latestWeb {
          Link("Xem tất cả trên aquatome.com", destination: web).font(.footnote).accessibilityIdentifier("latest-web")
        }
      }
    }
    .navigationTitle("Mới cập nhật")
  }

  /// "28/10/2026 · Cập nhật · Seriously Fish", as the site's list says it; an action this app doesn't know, no word.
  static func change(_ e: Latest.Entry) -> String {
    let word = e.isNew ? String(localized: "Mới") : e.isUpdate ? String(localized: "Cập nhật") : nil
    return [e.shown, word, e.source].compactMap { $0 }.joined(separator: " · ")
  }
}
