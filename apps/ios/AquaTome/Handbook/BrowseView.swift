import Handbook
import SwiftUI
import Telemetry

/// One shelf of the handbook: a fish group, a placement, a guide subject (nil: the whole kind), the video guides, the
/// glossary, the pages kept for reading offline, what's new on the site, or the whole of a page's long list of pages.
enum Browse: Hashable {
  case fish(String?)
  case plants(String?)
  case guides(String?)
  case videos
  case glossary
  case kept
  /// The pages saved to read later (Tìm's "Đọc tiếp").
  case saved
  /// A kind's ways in, as a list: the fish groups, where plants go, the guides' subjects (Tìm's chips, at the
  /// accessibility text sizes).
  case ways(HandbookIndex.Kind)
  case latest
  case pages(String, [String])
}

/// A shelf's pages: fish and plants as photo cards in the site's order, filtered as the site's lists are; guides and
/// videos as a list, which can be kept for reading offline; the glossary by letter.
struct BrowseView: View {
  let browse: Browse
  @Environment(HandbookModel.self) private var handbook
  @Environment(TelemetryModel.self) private var telemetry

  var body: some View {
    shelf.onAppear { telemetry.telemetry.record(.view(.shelf)) }
  }

  @ViewBuilder private var shelf: some View {
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
        #if DEBUG
        .background {
          // For the UI tests (debug builds only): how many keeps are still at work.
          Text(verbatim: "\(handbook.keepsWorking)").font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("keeps-working")
        }
        #endif
    case .videos:
      // The series (Tìm's "Tất cả video", counted in series); kept to read offline, every video guide in them.
      List(s.all(.video)) { Row(item: $0) }
        .navigationTitle("Video hướng dẫn")
        .toolbar { KeepOffline(items: s.videoGuides) }
    case .saved:
      let saved = handbook.saved(nil)
      List(saved) { item in
        Row(item: item).swipeActions { Button("Bỏ lưu", role: .destructive) { handbook.toggleSaved(item) } }
      }
      .navigationTitle("Đã lưu để đọc sau")
      .accessibilityIdentifier("saved")
    case .ways(let kind):
      let ways: [(HandbookShelves.Shelf, Browse)] = switch kind {
      case .fish: s.groups.map { ($0, .fish($0.key)) }
      case .plant: s.placements.map { ($0, .plants($0.key)) }
      default: s.sections.map { ($0, .guides($0.key)) }
      }
      List(ways, id: \.0.key) { way in
        NavigationLink(value: way.1) {
          LabeledContent { Text(way.0.count, format: .number).monospacedDigit() } label: { Text(verbatim: way.0.label) }
        }
        .accessibilityIdentifier("shelf")
      }
      .navigationTitle(kind == .fish ? LocalizedStringKey("Nhóm cá") : kind == .plant ? "Vị trí trồng" : "Chủ đề")
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
