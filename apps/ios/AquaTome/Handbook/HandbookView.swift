import Handbook
import SwiftUI

/// Search and browse the handbook natively; a result opens the site's page.
struct HandbookView: View {
  @Environment(HandbookModel.self) private var handbook
  /// The Chihiros tool is this app's own Lights tab, not a web page.
  let openLights: () -> Void

  var body: some View {
    @Bindable var handbook = handbook
    NavigationStack {
      List {
        Section {
          Picker("Loại", selection: $handbook.kind) {
            Text("Tất cả").tag(HandbookIndex.Kind?.none)
            ForEach(HandbookIndex.Kind.allCases, id: \.self) { k in Text(k.title).tag(Optional(k)) }
          }
          .pickerStyle(.menu)
          .accessibilityIdentifier("kind")
        } footer: {
          StatusText()
        }
        Section {
          ForEach(handbook.results) { item in
            if item.path.hasSuffix(chihirosSuffix(handbook.lang)) {
              Button { openLights() } label: { ItemRow(item: item) }
            } else {
              NavigationLink(value: item) { ItemRow(item: item) }
            }
          }
        }
      }
      .listStyle(.insetGrouped)
      .searchable(text: $handbook.query, prompt: Text("Tìm loài cá, cây, hướng dẫn"))
      .navigationTitle("Tìm")
      .navigationDestination(for: HandbookIndex.Item.self) { item in PageView(item: item, url: handbook.url(item)) }
      .overlay {
        if handbook.status == .loading { ProgressView() }
        else if handbook.results.isEmpty && !handbook.query.isEmpty { ContentUnavailableView.search(text: handbook.query) }
      }
      .task { await handbook.appear() }
      .refreshable { await handbook.load() }
    }
  }

  /// The Chihiros page's last segment in each language (apps/site/src/lib/i18n.ts).
  private func chihirosSuffix(_ lang: String) -> String {
    ["id": "/lampu-chihiros/", "th": "/chihiros-light/"][lang] ?? "/den-chihiros/"
  }
}

private struct StatusText: View {
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

private struct ItemRow: View {
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
      VStack(alignment: .leading, spacing: 2) {
        Text(item.name).foregroundStyle(.primary)
        if let sub = item.sub { Text(sub).font(.caption).italic().foregroundStyle(.secondary) }
        else { Text(item.kind.title).font(.caption).foregroundStyle(.secondary) }
      }
    }
    .accessibilityElement(children: .combine)
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
    }
  }
  var symbol: String {
    switch self {
    case .fish: "fish"
    case .plant: "leaf"
    case .guide: "book"
    case .glossary: "character.book.closed"
    case .tool: "wrench.and.screwdriver"
    }
  }
}
