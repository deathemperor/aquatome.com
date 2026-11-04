import Handbook
import SwiftUI

/// A taxon page (/vi/phan-loai/…) or an origin page (/vi/nguon-goc/…), drawn by the app as the site draws it
/// (pages/phan-loai/[...path].astro, pages/nguon-goc/[...path].astro): its line, the pages under it (a lower rank's taxa
/// with their counts, a continent's countries) and a country's rivers and regions, then its fish as a shelf the reader
/// can filter. The section's first page lists the orders or the continents alone.
struct TaxaShelf: View {
  let page: HandbookShelves.Page

  var body: some View {
    Group {
      if page.fish.isEmpty && page.intro == nil {
        ScrollView { header.padding() }
      } else {
        FishShelf(items: page.fish, header: AnyView(header))
      }
    }
    .navigationTitle(page.title)
    .navigationBarTitleDisplayMode(.inline)
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 16) {
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
        Text(verbatim: page.words.joined(separator: " · ")).font(.footnote).foregroundStyle(.secondary)
          .accessibilityIdentifier("shelf-words")
      }
      if !page.fish.isEmpty {
        Text("Danh sách loài").font(.title3.bold()).padding(.top, 4).accessibilityAddTraits(.isHeader)
      }
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
