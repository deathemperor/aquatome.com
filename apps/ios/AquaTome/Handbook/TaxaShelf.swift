import Handbook
import SwiftUI

/// A taxon page (/vi/phan-loai/…) or an origin page (/vi/nguon-goc/…), drawn by the app as the site draws it
/// (pages/phan-loai/[...path].astro, pages/nguon-goc/[...path].astro): its line, the pages under it (a lower rank's taxa
/// with their counts, a continent's countries) and a country's rivers and regions, then its fish as a shelf the reader
/// can filter. The section's first page lists the orders or the continents alone.
struct TaxaShelf: View {
  let page: HandbookShelves.Page
  /// A country's rivers and regions, all of them: three lines until the reader asks.
  @State private var allWords = false
  /// Their line's height in three lines, and all of it, at its width: "Xem thêm" when they don't fit, however many they are.
  @State private var three: CGFloat = 0
  @State private var full: CGFloat = 0

  var body: some View {
    Group {
      if page.fish.isEmpty && page.intro == nil {
        ScrollView { header.padding() }
      } else {
        FishShelf(items: page.fish, header: AnyView(header))
      }
    }
    .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
    .navigationTitle(page.title)
    .navigationBarTitleDisplayMode(.inline)
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 16) {
      if !page.up.isEmpty { trail }
      Group {
        if let intro = page.intro { Text(verbatim: intro) }
        else if page.kind == .taxon { Text("Duyệt loài theo bộ, họ và chi.") }
        else { Text("Duyệt loài theo châu lục, quốc gia và dòng sông nơi chúng sinh ra.") }
      }
      .foregroundStyle(.secondary)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityIdentifier("shelf-intro")
      links
      if !page.words.isEmpty {
        let words = Text(verbatim: page.words.joined(separator: " · ")).font(.footnote)
        VStack(alignment: .leading, spacing: 4) {
          words.foregroundStyle(.secondary)
            .lineLimit(allWords ? nil : 3)
            .background {
              ZStack {
                words.lineLimit(3).fixedSize(horizontal: false, vertical: true).hidden()
                  .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { three = $0 }
                words.lineLimit(nil).fixedSize(horizontal: false, vertical: true).hidden()
                  .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { full = $0 }
              }
            }
            .accessibilityIdentifier("shelf-words")
          if !allWords && full > three + 1 {
            Button("Xem thêm") { allWords = true }.font(.footnote).accessibilityIdentifier("shelf-words-more")
          }
        }
      }
      if !page.fish.isEmpty {
        Text("Danh sách loài").font(.title3.bold()).padding(.top, 4).accessibilityAddTraits(.isHeader)
      }
    }
  }

  /// The pages above it, as the site's trail: the section's first page, then each rank or the continent.
  private var trail: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 6) {
        ForEach(Array(page.up.enumerated()), id: \.offset) { i, link in
          if i > 0 { Text(verbatim: "/").foregroundStyle(.tertiary) }
          NavigationLink(value: item(link)) { Text(verbatim: link.title).italic(link.italic) }
            .accessibilityIdentifier("shelf-up")
        }
      }
      .font(.subheadline)
      .v2YieldsToEdgeSwipe()
    }
  }

  /// The pages under it as tiles, several to a row: a rank below with how many fish each lists (a genus in italics),
  /// or a continent's countries.
  private var links: some View {
    LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 8, alignment: .leading)], alignment: .leading, spacing: 8) {
      ForEach(page.links) { link in
        NavigationLink(value: item(link)) {
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: link.title).italic(link.italic).multilineTextAlignment(.leading)
            if let n = link.count { Text("\(n) loài").font(.caption).foregroundStyle(.secondary) }
          }
          .font(.subheadline)
          .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
          .padding(.horizontal, 12).padding(.vertical, 6)
          .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("shelf-link")
      }
    }
  }

  /// A page under this one, opened as the index's pages open: its shelf, on the tab it's in.
  private func item(_ link: HandbookShelves.Page.Link) -> HandbookIndex.Item {
    .init(kind: page.kind, name: link.title, path: link.path)
  }
}
