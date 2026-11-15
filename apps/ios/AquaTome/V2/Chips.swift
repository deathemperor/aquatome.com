import Handbook
import SwiftUI

/// Khám phá's chips, under its title (Design's spec-chips.md, 13 and 14 Nov): the groups as keepers name them, in the
/// owner's order, each a capsule with a fish of the group and its name, in one row sideways to the screen's edge, as the
/// Games tab's. Part of the header: it scrolls away with it.
@available(iOS 18, *)
struct ChipsRow: View {
  let chips: [HandbookShelves.ChipShelf]
  @ScaledMetric(relativeTo: .body) private var height: CGFloat = 38
  /// The picture's height: 3:2, 33 × 22 at size L.
  @ScaledMetric(relativeTo: .body) private var picture: CGFloat = 22

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(chips) { c in
          link(c) {
            HStack(spacing: 8) {
              // Its fish's picture only where the chip's page can name that fish; else the name alone (Design, 16 Nov).
              if c.photoOf != nil {
                V2Photo(src: c.chip.img, box: c.chip.imgBox)
                  .frame(width: picture * 1.5, height: picture)
                  .clipShape(.rect(cornerRadius: 6, style: .continuous))
                  .accessibilityHidden(true)
              }
              Text(verbatim: c.chip.name).font(.body.weight(.semibold)).lineLimit(1)
            }
            .padding(.leading, c.photoOf == nil ? 14 : 8)
            .padding(.trailing, 14)
            .frame(minHeight: height)
            .background(.fill.tertiary, in: Capsule())
            .contentShape(Capsule())
          }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("\(c.chip.name), nhóm cá"))
          .accessibilityIdentifier("v2-chip")
        }
      }
    }
    // From the title's left edge to the screen's right one, where a chip is cut, with no fade (unlike the shelves).
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .padding(.horizontal, -20)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(Text("Nhóm cá, \(chips.count) mục"))
    .accessibilityIdentifier("v2-chips")
  }

  /// A group of one page with no guide or video opens that page: no list of one between.
  @ViewBuilder private func link(_ c: HandbookShelves.ChipShelf, @ViewBuilder label: () -> some View) -> some View {
    if c.pages.count == 1, c.guides.isEmpty, c.videos.isEmpty {
      NavigationLink(value: c.pages[0], label: label)
    } else {
      NavigationLink(value: ChipRoute(shelf: c), label: label)
    }
  }
}

extension HandbookShelves.ChipShelf {
  /// The page whose photo the chip shows, as the site names it (`imgOf`). The chip's page names and links that fish (the
  /// chief, 15 Nov), so the chip shows its photo only with it: never a photo whose fish it can't name.
  var photoOf: HandbookIndex.Item? { chip.img == nil ? nil : pages.first { $0.contentId == chip.imgOf } }
}

/// A chip's page, pushed (`ChipPage`).
struct ChipRoute: Hashable {
  let shelf: HandbookShelves.ChipShelf
}

/// A chip's page (spec-chips.md, "What a chip opens"): the group's name as the big title, what it holds under it, its fish
/// and breed pages, then the guides and video guides about it. From six pages, the list's tiles with the filter, as a
/// group's list; under six, a wide card each: a grid of one or two small tiles reads as a page that failed to load.
@available(iOS 18, *)
struct ChipPage: View {
  let shelf: HandbookShelves.ChipShelf
  /// From this many pages, the grid.
  static let grid = 6

  var body: some View {
    Group {
      if shelf.pages.count >= Self.grid {
        FishShelf(items: shelf.pages, header: AnyView(holds), footer: AnyView(writing.padding(.top, 16)), large: true)
      } else {
        ScrollView {
          VStack(alignment: .leading, spacing: 24) {
            holds
            ForEach(shelf.pages) { WideCard(item: $0) }
            writing
          }
          .padding(.horizontal, 20)
          .padding(.bottom, 24)
        }
        .navigationBarTitleDisplayMode(.large)
      }
    }
    .modifier(ClearUnderLargeTitle())
    .navigationTitle(shelf.chip.name)
    .accessibilityIdentifier("v2-chip-page")
  }

  /// "153 trang", or "1 trang · 4 bài viết" when guides are about it; under it, whose photo the chip shows, "Ảnh đại
  /// diện nhóm: Cá ngựa vằn", one link to that fish's page (Design, 16 Nov). It leads to the credit, which stays on the
  /// fish's page with the photo.
  private var holds: some View {
    let n = shelf.pages.count, g = shelf.guides.count
    return VStack(alignment: .leading, spacing: 0) {
      Text(g > 0 ? "\(n) trang · \(g) bài viết" : "\(n) trang")
      if let fish = shelf.photoOf {
        NavigationLink(value: fish) {
          Text("Ảnh đại diện nhóm: \(Text(verbatim: fish.name).foregroundStyle(.tint))")
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
        }
        .buttonStyle(Dims())
        // Drawn at the text's height, tapped over 44 points.
        .frame(minHeight: 44, alignment: .leading)
        .contentShape(.rect)
        .padding(.vertical, -max(0, (44 - line) / 2))
        .accessibilityRemoveTraits(.isButton)
        .accessibilityAddTraits(.isLink)
        .accessibilityIdentifier("v2-chip-photo-of")
      }
    }
    .font(.subheadline)
    .foregroundStyle(.v2Faint)
  }

  /// A line of the subheadline, for the photo line's tap beyond its text.
  @ScaledMetric(relativeTo: .subheadline) private var line: CGFloat = 20

  /// The press dims the line.
  private struct Dims: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View { configuration.label.opacity(configuration.isPressed ? 0.5 : 1) }
  }

  /// Its guides, then its video guides, as Tìm's results; no heading where there are none.
  @ViewBuilder private var writing: some View {
    VStack(alignment: .leading, spacing: 24) {
      if !shelf.guides.isEmpty { rows("Bài viết", shelf.guides) }
      if !shelf.videos.isEmpty { rows("Video", shelf.videos) }
    }
  }

  private func rows(_ title: LocalizedStringKey, _ items: [HandbookIndex.Item]) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      Text(title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
      ForEach(items) { Row(item: $0, chevron: true) }
    }
  }
}

/// A page of a small group, wide: its photo at 3:2, then its name, the row's line and "Thêm".
@available(iOS 18, *)
private struct WideCard: View {
  let item: HandbookIndex.Item
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      NavigationLink(value: item) {
        Color.clear.aspectRatio(3 / 2, contentMode: .fit)
          .overlay { V2Photo(src: item.img, box: item.imgBox) }
          .overlay { if item.img == nil { Image(systemName: item.kind.symbol).font(.title).foregroundStyle(.secondary) } }
          .background(.fill.quaternary)
          .clipShape(.rect(cornerRadius: 16, style: .continuous))
      }
      .buttonStyle(CardPress())
      .accessibilityLabel(Text(verbatim: item.name))
      Lockup(item: item, line: factsLine(item, handbook.lang), icon: false)
    }
  }
}
