import Handbook
import SwiftUI

/// The handbook: before a search, a home arranged as the site arranges it (HomeList: fish by group, plants by where
/// they go, guides by subject, equipment, the tools, the glossary); while searching, every page that matches, of one kind if
/// picked. A page opens as the app draws it (guides), the site's page, or the app's own screen for it (the Chihiros
/// tool is the Lights tab, "Bể của tôi" the tanks tab, the fish-ID tool a screen of its own).
struct HandbookView: View {
  /// The pages open in the tab: a link in a page the app draws pushes onto it (AppScreen.page).
  @Binding var path: NavigationPath
  @Environment(HandbookModel.self) private var handbook
  /// On v2's search tab: a fish's or plant's page as v2 draws it (SpeciesPage), with v1's for a part it can't (FullPage).
  @Environment(\.v2Pages) private var v2Pages

  var body: some View {
    @Bindable var handbook = handbook
    NavigationStack(path: $path) {
      List {
        if handbook.query.isEmpty {
          HomeList()
        } else {
          Section {
            ForEach(handbook.results) { item in Row(item: item) }
            // The kind picked has none but others have some: said under the chips, as a row the list scrolls. Laid over
            // the list, at the largest text it covered the chips, and with the keyboard up its button was under it.
            if handbook.results.isEmpty, let kind = handbook.kind, handbook.counts[nil, default: 0] > 0 {
              NoneOfKind(kind: kind).listRowBackground(Color.clear)
            }
          } header: {
            // The kinds found, under the search field and right above their results, as the reader types (and none
            // before: the home shows then, which a kind doesn't change). In the list, not a bar over it: a bar's
            // scroll view reaches up under the navigation bar, and iOS 26 drew none of its chips.
            KindChips().padding(.bottom, 4).listRowInsets(EdgeInsets()).textCase(nil)
          } footer: {
            // More found than listed (a search lists its best 200): says so, under chips that count them all.
            if handbook.left > 0 { MoreResults() }
          }
        }
      }
      .listStyle(.insetGrouped)
      // The chips right under the search field, not a section's space below it; the home keeps its own.
      .contentMargins(.top, handbook.query.isEmpty ? nil : 4, for: .scrollContent)
      // Placed, not left to iOS: iOS 27 keeps a search tab's field out of sight until the page is pulled down.
      .searchable(text: $handbook.query, placement: .navigationBarDrawer(displayMode: .always), prompt: Text("Tìm loài cá, cây, hướng dẫn"))
      .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
      .navigationTitle("Tìm")
      .profileButton()
      .navigationDestination(for: HandbookIndex.Item.self) { item in
        if #available(iOS 18, *), v2Pages, item.kind == .fish || item.kind == .plant { SpeciesPage(item: item) } else {
          PageView(item: item, url: handbook.url(item))
        }
      }
      .navigationDestination(for: FullPage.self) { PageView(item: $0.item, url: handbook.url($0.item), at: $0.at) }
      .navigationDestination(for: Browse.self) { BrowseView(browse: $0) }
      .navigationDestination(for: VolumeTool.self) { TankVolumeView(query: $0.query) }
      .navigationDestination(for: FishIdRoute.self) { _ in FishIdView() }
      .navigationDestination(for: SitePage.self) { WebScreen(url: $0.url) }
      .navigationDestination(for: TankMatesTool.self) { TankMatesView(query: $0.query) }
      .navigationDestination(for: ChatRoute.self) { ChatView(route: $0) }
      .overlay {
        if handbook.status == .loading { ProgressView() }
        // Nothing found of any kind (none of one, with others found, is a row: NoneOfKind).
        else if !handbook.query.isEmpty && handbook.counts[nil, default: 0] == 0 { ContentUnavailableView.search(text: handbook.query) }
      }
      #if DEBUG
      // UI tests (`-watch-tank-searches`): how many times what the tanks tab searches has changed (HandbookModel).
      .overlay(alignment: .bottomLeading) {
        if let n = handbook.tankSearchChanges { Text(verbatim: "\(n)").font(.caption2).accessibilityIdentifier("tank-search-changes") }
      }
      #endif
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
        // Faded only off the picked chip (faded on its green, the count falls under 4.5:1), and less than the system's
        // secondary there, which measured 3.1:1 on the chip's fill.
        Text(count, format: .number).monospacedDigit().opacity(picked ? 1 : 0.6)
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

/// Under results that stop short of what the kind picked finds: how many show, and a page more, as the site's search
/// page has it. A page more is the next part of what the search ranked (SearchState): no search.
private struct MoreResults: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let shown = handbook.results.count
    VStack(alignment: .leading, spacing: 4) {
      Text("Đang hiện \(shown.formatted(.number.locale(.app))) trong \((shown + handbook.left).formatted(.number.locale(.app))) kết quả. Gõ thêm để thu hẹp.")
        // As the chips' counts: the footer's secondary measured 3.3:1 on the light look's background.
        .foregroundStyle(Color.primary.opacity(0.6))
        .accessibilityIdentifier("more-note")
      Button("Xem thêm kết quả") { handbook.showMore() }
        .font(.subheadline.weight(.medium))
        .frame(minHeight: 44)
        .accessibilityIdentifier("more")
    }
  }
}

/// The kind picked finds nothing the search finds elsewhere: which kinds have some, and a way to all of them.
private struct NoneOfKind: View {
  let kind: HandbookIndex.Kind
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let found = HandbookIndex.Kind.allCases.compactMap { k in handbook.counts[k].map { "\(k.title) (\($0.formatted(.number.locale(.app))))" } }
    ContentUnavailableView {
      Label("Không có kết quả trong “\(kind.title)”", systemImage: "magnifyingglass")
    } description: {
      Text("“\(handbook.query)” có kết quả trong \(found.formatted(.list(type: .and).locale(.app))).")
    } actions: {
      Button("Xem tất cả") { handbook.kind = nil }.accessibilityIdentifier("see-all")
    }
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
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    // At the accessibility text sizes, no picture: beside one, the name and the scientific name broke mid-word.
    let pictured = !size.isAccessibilitySize
    let lengthInLine = !pictured && item.sub == nil && item.video != nil
    HStack(spacing: 12) {
      if pictured { picture }
      VStack(alignment: .leading, spacing: 2) {
        Text(item.name).foregroundStyle(.primary)
        // A scientific name in italics; a video series' channel; else what it is (a video guide: a video, and its length
        // when there's no picture to show it on).
        if let sub = item.subUnderName { Text(sub).font(.caption).italic(item.kind != .video).foregroundStyle(.secondary) }
        else if lengthInLine, let s = item.video { Text(verbatim: "\(HandbookIndex.Kind.video.title) · \(clock(s))").font(.caption).foregroundStyle(.secondary) }
        else { Text(item.video != nil ? HandbookIndex.Kind.video.title : item.kind.title).font(.caption).foregroundStyle(.secondary) }
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityValue(Text(verbatim: lengthInLine ? "" : item.video.map(clock) ?? ""))
    .accessibilityIdentifier("item")
  }

  private var picture: some View {
    // By the frame rule, the whole fish in the square. No photo: the kind's glyph in the square a photo fills, so the names
    // beside them line up.
    V2Photo(src: item.img, box: item.imgBox)
      .overlay { if item.img == nil { Image(systemName: item.kind.symbol).font(.system(size: 22)).foregroundStyle(.secondary) } }
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
    case .equipment: String(localized: "Thiết bị")
    case .taxon: String(localized: "Phân loại")
    case .origin: String(localized: "Nguồn gốc")
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
    case .equipment: "gearshape"
    case .taxon: "list.bullet.indent"
    case .origin: "globe.asia.australia"
    }
  }
}

/// A page of the site the app has no screen for, opened from outside the app (AppLink): its web page, on the Tìm tab.
struct SitePage: Hashable {
  let url: URL
}
