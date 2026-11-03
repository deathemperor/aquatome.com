import Handbook
import SwiftUI

/// The handbook: before a search, a home arranged as the site arranges it (HomeList: fish by group, plants by where
/// they go, guides by subject, the tools, the glossary); while searching, every page that matches, of one kind if
/// picked. A page opens as the app draws it (guides), the site's page, or the app's own screen for it (the Chihiros
/// tool is the Lights tab, "Bể của tôi" the tanks tab, the fish-ID tool a screen of its own).
struct HandbookView: View {
  /// The pages open in the tab: a link in a page the app draws pushes onto it (AppScreen.page).
  @Binding var path: NavigationPath
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    @Bindable var handbook = handbook
    NavigationStack(path: $path) {
      List {
        if handbook.query.isEmpty {
          HomeList()
        } else {
          Section {
            ForEach(handbook.results) { item in Row(item: item) }
          } header: {
            // The kinds found, under the search field and right above their results, as the reader types (and none
            // before: the home shows then, which a kind doesn't change). In the list, not a bar over it: a bar's
            // scroll view reaches up under the navigation bar, and iOS 26 drew none of its chips.
            KindChips().padding(.bottom, 4).listRowInsets(EdgeInsets()).textCase(nil)
          }
        }
      }
      .listStyle(.insetGrouped)
      // The chips right under the search field, not a section's space below it; the home keeps its own.
      .contentMargins(.top, handbook.query.isEmpty ? nil : 4, for: .scrollContent)
      .searchable(text: $handbook.query, prompt: Text("Tìm loài cá, cây, hướng dẫn"))
      .navigationTitle("Tìm")
      .navigationDestination(for: HandbookIndex.Item.self) { item in PageView(item: item, url: handbook.url(item)) }
      .navigationDestination(for: Browse.self) { BrowseView(browse: $0) }
      .navigationDestination(for: FishIdRoute.self) { _ in FishIdView() }
      .overlay {
        if handbook.status == .loading { ProgressView() }
        else if handbook.results.isEmpty && !handbook.query.isEmpty { ContentUnavailableView.search(text: handbook.query) }
      }
      .task { await handbook.appear() }
      .refreshable { await handbook.load() }
    }
  }
}

/// The kinds a search finds, under the search field, each with how many it finds: picking one narrows the results to
/// it. A kind with nothing found has no chip, except the one picked, so there's always a way back to the others.
private struct KindChips: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let counts = handbook.counts
    let kinds = [nil] + HandbookIndex.Kind.allCases.filter { counts[$0, default: 0] > 0 || $0 == handbook.kind }
    ScrollViewReader { proxy in
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(spacing: 8) {
          ForEach(kinds, id: \.self) { k in
            KindChip(title: k?.title ?? String(localized: "Tất cả"), count: counts[k, default: 0], picked: handbook.kind == k) { handbook.kind = k }
              .id(k)
              .accessibilityIdentifier("kind-\(k?.rawValue ?? "all")")
          }
        }
      }
      // Lined up with the results' edge, and running on to the screen's.
      .scrollClipDisabled()
      // The chip picked stays in view, as kinds come and go while the reader types and when one is picked at the edge.
      .onChange(of: kinds) { withAnimation { proxy.scrollTo(handbook.kind) } }
      .onChange(of: handbook.kind) { withAnimation { proxy.scrollTo(handbook.kind) } }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Lọc kết quả")
    .accessibilityIdentifier("kinds")
  }
}

private struct KindChip: View {
  let title: String
  let count: Int
  let picked: Bool
  let pick: () -> Void

  var body: some View {
    Button(action: pick) {
      HStack(spacing: 6) {
        Text(title)
        // Faded only off the picked chip: faded on its green, the count falls under 4.5:1.
        Text(count, format: .number).monospacedDigit().foregroundStyle(picked ? HierarchicalShapeStyle.primary : .secondary)
      }
      .font(.subheadline.weight(.medium))
      .lineLimit(1)
      // White on the light look's dark green, black on the dark look's light green: the contrast each needs.
      .foregroundStyle(picked ? Color(.systemBackground) : Color.primary)
      .padding(.horizontal, 14)
      .padding(.vertical, 8)
      .background(Capsule().fill(picked ? Color.accentColor : Color(.tertiarySystemFill)))
      // 44 points to tap, the space above and below the capsule too.
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(title)
    .accessibilityValue(Text(count, format: .number))
    .accessibilityAddTraits(picked ? .isSelected : [])
  }
}

/// A page in a list: the site's page, or the app's own screen for it.
struct Row: View {
  let item: HandbookIndex.Item
  /// Outside a list (a page's "pages" block), which draws no chevron of its own.
  var chevron = false
  /// In a panel of rows (the page's "pages" block): its margins inside what answers a tap, none dead at its edges.
  var inPanel = false
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen

  var body: some View {
    if item.kind == .tool, let screen = AppScreen.of(handbook.url(item), site: handbook.site) {
      Button { openScreen(screen) } label: { label }
    } else {
      NavigationLink(value: item) { label }
    }
  }

  private var label: some View {
    HStack {
      ItemRow(item: item)
      if chevron {
        Spacer()
        Image(systemName: "chevron.right").foregroundStyle(.tertiary)
      }
    }
    .padding(.horizontal, inPanel ? 12 : 0)
    .padding(.vertical, inPanel ? 10 : 0)
    // The whole row answers a tap, the space before the chevron too (a plain button takes only what it draws).
    .contentShape(.rect)
  }
}

struct StatusText: View {
  @Environment(HandbookModel.self) private var handbook
  var body: some View {
    switch handbook.status {
    case .offline: Text("Đang dùng bản đã lưu trên máy (\(handbook.count) trang).")
    case .failed: Text("Không tải được cẩm nang. Kiểm tra kết nối mạng rồi kéo xuống để thử lại.").foregroundStyle(Color.warning)
    case .ready: Text("\(handbook.count) trang")
    case .loading: EmptyView()
    }
  }
}

struct ItemRow: View {
  let item: HandbookIndex.Item
  var body: some View {
    HStack(spacing: 12) {
      AsyncImage(url: item.img.flatMap(URL.init(string:))) { image in
        image.resizable().scaledToFill()
      } placeholder: {
        // No photo, or not yet: the kind's glyph in the square a photo fills, so the names beside them line up.
        ZStack {
          Color(.tertiarySystemFill)
          Image(systemName: item.kind.symbol).font(.system(size: 22)).foregroundStyle(.secondary)
        }
      }
      .frame(width: 56, height: 56)
      .clipShape(RoundedRectangle(cornerRadius: 8))
      // A video guide's length on its picture, as the site's cards show it (read after the name, as the row's value).
      .overlay(alignment: .bottomTrailing) {
        if let s = item.video {
          Text(verbatim: clock(s))
            .font(.caption2.weight(.semibold)).monospacedDigit()
            .foregroundStyle(.white).padding(.horizontal, 3).background(.black.opacity(0.75), in: RoundedRectangle(cornerRadius: 3))
            .padding(2)
            .accessibilityHidden(true)
        }
      }
      VStack(alignment: .leading, spacing: 2) {
        Text(item.name).foregroundStyle(.primary)
        // A scientific name in italics; a video series' channel; else what it is (a video guide: a video).
        if let sub = item.sub { Text(sub).font(.caption).italic(item.kind != .video).foregroundStyle(.secondary) }
        else { Text(item.video != nil ? HandbookIndex.Kind.video.title : item.kind.title).font(.caption).foregroundStyle(.secondary) }
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityValue(Text(verbatim: item.video.map(clock) ?? ""))
    .accessibilityIdentifier("item")
  }

}

extension HandbookIndex.Kind {
  var title: String {
    switch self {
    case .fish: String(localized: "Loài cá")
    case .plant: String(localized: "Cây")
    case .guide: String(localized: "Hướng dẫn")
    case .glossary: String(localized: "Thuật ngữ")
    case .tool: String(localized: "Công cụ")
    case .video: String(localized: "Video")
    }
  }
  var symbol: String {
    switch self {
    case .fish: "fish"
    case .plant: "leaf"
    case .guide: "book"
    case .glossary: "character.book.closed"
    case .tool: "wrench.and.screwdriver"
    case .video: "play.rectangle"
    }
  }
}
