import Handbook
import SwiftUI

/// One shelf of the handbook: a fish group, a placement, a guide subject (nil: the whole kind), the video guides, or the
/// glossary.
enum Browse: Hashable {
  case fish(String?)
  case plants(String?)
  case guides(String?)
  case videos
  case glossary
}

/// A shelf's pages: fish and plants as photo cards in the site's order, filtered as the site's lists are; guides and
/// videos as a list; the glossary by letter.
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
      List(section.map { s.guides(section: $0) } ?? s.all(.guide)) { Row(item: $0) }
        .navigationTitle(section.map { handbook.labels["section", $0] ?? $0 } ?? String(localized: "Tất cả hướng dẫn"))
    case .videos:
      List(s.videoGuides) { Row(item: $0) }
        .navigationTitle("Video")
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
