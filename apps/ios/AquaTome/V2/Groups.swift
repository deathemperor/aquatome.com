import Handbook
import SwiftUI

/// Khám phá's ways in by the groups readers know, under its title, as the App Store's chips (Action, Family, Kids): a
/// small photo and the group's name, sideways. The site's own groups where they are one (tetras, loaches), and finer
/// ones from each fish's family and where it comes from (African and American cichlids, plecos, Corydoras), which the
/// site's groups lump into cichlids and catfish.
enum FishChip: String, CaseIterable, Hashable {
  case africanCichlids, americanCichlids, plecos, corydoras, shrimp, tetras, labyrinth, livebearers, loaches, rasboras,
       killifish, snails, plants

  /// A group with fewer isn't worth opening.
  static let fewest = 10

  /// The site's group this is, if it's one.
  var siteGroup: String? {
    switch self {
    case .shrimp: "shrimp"
    case .tetras: "tetras"
    case .labyrinth: "labyrinth"
    case .livebearers: "livebearers"
    case .loaches: "loaches"
    case .rasboras: "rasboras"
    case .killifish: "killifish"
    case .snails: "snails"
    default: nil
    }
  }

  /// Its name: the site's for its own groups, in the reader's language; the app's for the finer ones.
  func title(_ labels: HandbookIndex.Labels) -> String {
    switch self {
    case .africanCichlids: String(localized: "Cichlid châu Phi")
    case .americanCichlids: String(localized: "Cichlid châu Mỹ")
    case .plecos: String(localized: "Cá lau kính")
    case .corydoras: String(localized: "Cá chuột")
    case .labyrinth: String(localized: "Betta và cá sặc")
    case .plants: String(localized: "Cây thủy sinh")
    default: labels["group", siteGroup ?? ""] ?? siteGroup ?? rawValue
    }
  }

  /// Its pages, in the site's list order.
  func items(_ s: HandbookShelves) -> [HandbookIndex.Item] {
    if self == .plants { return s.all(.plant) }
    return s.all(.fish).filter(matches)
  }

  private func matches(_ i: HandbookIndex.Item) -> Bool {
    let family = (i.tax?.count ?? 0) > 1 ? i.tax?[1] : nil
    let from = Set(i.from)
    switch self {
    case .africanCichlids: return i.group == "cichlids" && from.contains("africa")
    case .americanCichlids: return i.group == "cichlids" && !from.isDisjoint(with: ["south-america", "central-america", "north-america"])
    case .plecos: return family == "Loricariidae"
    case .corydoras: return family == "Callichthyidae"
    default: return i.group == siteGroup
    }
  }

}

/// The chips' row, each with a photo of one of its well-known fish (the site's featured first), or its kind's mark.
@available(iOS 18, *)
struct FishChips: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let s = handbook.shelves
    let chips = FishChip.allCases.compactMap { c -> (FishChip, [HandbookIndex.Item])? in
      let items = c.items(s)
      return items.count >= FishChip.fewest ? (c, items) : nil
    }
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(chips, id: \.0) { chip, items in
          let featured = Set(s.featuredFish.map(\.path))
          let face = items.first { $0.img != nil && featured.contains($0.path) } ?? items.first { $0.img != nil }
          link(chip) {
            HStack(spacing: 8) {
              V2Photo(src: face?.img)
                .frame(width: 30, height: 30)
                .clipShape(Circle())
                .overlay { if face == nil { Image(systemName: chip == .plants ? "leaf" : "fish").font(.caption).foregroundStyle(.secondary) } }
                .accessibilityHidden(true)
              Text(verbatim: chip.title(handbook.labels)).font(.subheadline.weight(.semibold)).lineLimit(1)
            }
            .padding(.leading, 6)
            .padding(.trailing, 14)
            .frame(minHeight: 44)
            .background(.fill.tertiary, in: Capsule())
            .contentShape(Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("v2-chip-\(chip.rawValue)")
        }
      }
    }
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .v2ShelfEdge()
  }
}

@available(iOS 18, *)
extension FishChips {
  /// Where a chip opens: the site's group as Khám phá's "Cá" tiles open it; plants as their shelf; a finer one as its own.
  @ViewBuilder private func link(_ chip: FishChip, @ViewBuilder label: () -> some View) -> some View {
    if let g = chip.siteGroup {
      NavigationLink(value: Browse.fish(g), label: label)
    } else if chip == .plants {
      NavigationLink(value: Browse.plants(nil), label: label)
    } else {
      NavigationLink(value: chip, label: label)
    }
  }
}

/// A finer group's fish, as a site's group shows them.
@available(iOS 18, *)
struct FishChipShelf: View {
  let chip: FishChip
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    FishShelf(items: chip.items(handbook.shelves)).navigationTitle(chip.title(handbook.labels))
  }
}
