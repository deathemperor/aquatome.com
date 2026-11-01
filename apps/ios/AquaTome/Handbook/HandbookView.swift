import Handbook
import SwiftUI

/// The handbook: before a search, a home arranged as the site arranges it (HomeList: fish by group, plants by where
/// they go, guides by subject, the tools, the glossary); while searching, every page that matches, of one kind if
/// picked. A page opens as the app draws it (guides), the site's page, or the app's own screen for it (the Chihiros
/// tool is the Lights tab, "Bể của tôi" the tanks tab).
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
          }
        }
      }
      .listStyle(.insetGrouped)
      .searchable(text: $handbook.query, prompt: Text("Tìm loài cá, cây, hướng dẫn"))
      // Shown once the reader types: before that, the home shows, which a scope doesn't change.
      .searchScopes($handbook.kind, activation: .onTextEntry) {
        Text("Tất cả").tag(HandbookIndex.Kind?.none)
        ForEach(HandbookIndex.Kind.allCases, id: \.self) { k in Text(k.title).tag(Optional(k)) }
      }
      .navigationTitle("Tìm")
      .navigationDestination(for: HandbookIndex.Item.self) { item in PageView(item: item, url: handbook.url(item)) }
      .navigationDestination(for: Browse.self) { BrowseView(browse: $0) }
      .overlay {
        if handbook.status == .loading { ProgressView() }
        else if handbook.results.isEmpty && !handbook.query.isEmpty { ContentUnavailableView.search(text: handbook.query) }
      }
      .task { await handbook.appear() }
      .refreshable { await handbook.load() }
    }
  }
}

/// A page in a list: the site's page, or the app's own screen for it.
struct Row: View {
  let item: HandbookIndex.Item
  /// Outside a list (a page's "pages" block), which draws no chevron of its own.
  var chevron = false
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
        Image(systemName: item.kind.symbol).foregroundStyle(.secondary)
      }
      .frame(width: 56, height: 56)
      .clipShape(RoundedRectangle(cornerRadius: 8))
      // A video guide's length on its picture, as the site's cards show it (read after the name, as the row's value).
      .overlay(alignment: .bottomTrailing) {
        if let s = item.video {
          Text(verbatim: length(s))
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
    .accessibilityValue(Text(verbatim: item.video.map(length) ?? ""))
    .accessibilityIdentifier("item")
  }

  /// 1755 → "29:15", as the site writes a video's length.
  private func length(_ s: Int) -> String { Duration.seconds(s).formatted(.time(pattern: s >= 3600 ? .hourMinuteSecond : .minuteSecond)) }
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
