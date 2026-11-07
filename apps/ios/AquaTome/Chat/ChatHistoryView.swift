import Handbook
import SwiftUI

/// "Cuộc trò chuyện": the reader's past conversations, a row for each and those that carried it on, under "Hôm nay", "Hôm
/// qua", "7 ngày qua" and "Trước đó". A tap opens one in the chat screen, and the sheet goes. A swipe hides a row, on all
/// the reader's devices, which deletes nothing, and says so; the conversation on screen has no swipe.
struct ChatHistoryView: View {
  /// The conversation on screen: its row says "Đang mở".
  let on: UUID?
  let open: (Chat.Row) async -> Bool
  /// Conversations just hidden.
  let hid: ([UUID]) -> Void
  @Environment(AccountModel.self) private var account
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dismiss) private var dismiss
  @Environment(\.dynamicTypeSize) private var size
  @State private var rows: [Chat.Row] = []
  @State private var next: String?
  /// nil: still reading the first page.
  @State private var read: Bool?
  @State private var hiding: Chat.Row?
  /// The row being opened: read back before the sheet goes.
  @State private var opening: UUID?
  @State private var problem: LocalizedStringKey?

  var body: some View {
    NavigationStack {
      Group {
        if rows.isEmpty { empty } else { list }
      }
      .navigationTitle("Cuộc trò chuyện")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .topBarTrailing) {
          Button { dismiss() } label: { Label("Đóng", systemImage: "xmark") }.accessibilityIdentifier("chat-history-close")
        }
      }
    }
    // Medium, dragged to full height; at the largest text, full height at once.
    .presentationDetents(size.isAccessibilitySize ? [.large] : [.medium, .large])
    .presentationDragIndicator(.visible)
    .task { await load() }
    .alert(problem ?? "", isPresented: Binding(get: { problem != nil }, set: { if !$0 { problem = nil } })) {
      Button("Đóng", role: .cancel) {}
    }
    .confirmationDialog("Ẩn cuộc trò chuyện này?", isPresented: Binding(get: { hiding != nil }, set: { if !$0 { hiding = nil } }), titleVisibility: .visible, presenting: hiding) { row in
      // Nothing is destroyed: not the red of a delete.
      Button("Ẩn") { Task { await hide(row) } }
      Button("Hủy", role: .cancel) {}
    } message: { _ in
      Text("Chỉ ẩn khỏi danh sách của bạn, không bị xóa. Xóa tài khoản sẽ xóa toàn bộ.")
    }
  }

  @ViewBuilder private var empty: some View {
    switch read {
    case nil:
      ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
    case true?:
      Text("Chưa có cuộc trò chuyện nào.").foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
    case false?:
      VStack(spacing: 10) {
        Text("Chưa tải được danh sách.").foregroundStyle(.secondary)
        Button("Thử lại") { Task { await load() } }.accessibilityIdentifier("chat-history-again")
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
  }

  private var list: some View {
    List {
      ForEach(Chat.sections(rows, now: .now), id: \.period) { section in
        Section {
          ForEach(section.rows) { row in
            let here = row.holds(on)
            Button { tap(row) } label: { ChatHistoryRow(row: row, here: here, opening: opening == row.id) }
              .buttonStyle(.plain)
              .accessibilityIdentifier("chat-row")
              .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                if !here {
                  Button { hiding = row } label: { Label("Ẩn", systemImage: "eye.slash") }.tint(.gray)
                }
              }
              .onAppear { if row.id == rows.last?.id { Task { await more() } } }
          }
        } header: {
          Text(ChatTimes.section(section.period))
        }
      }
    }
  }

  private func tap(_ row: Chat.Row) {
    guard !row.holds(on) else { return dismiss() }
    guard opening == nil else { return }
    opening = row.id
    Task {
      let opened = await open(row)
      opening = nil
      if opened { dismiss() } else { problem = "Chưa mở được cuộc này. Thử lại sau nhé." }
    }
  }

  private func page(before: String?) async -> Chat.History? {
    guard let (data, status) = try? await account.send({ Chat.conversations(before: before, site: handbook.site, token: $0, version: ChatModel.version, ownCopy: ChatModel.ownCopy) })
    else { return nil }
    return Chat.history(data, status: status)
  }

  private func load() async {
    read = nil
    guard let first = await page(before: nil) else {
      read = false
      return
    }
    rows = first.rows
    next = first.next
    read = true
  }

  /// The next page, once the last row shows. One that doesn't come is asked for again when that row shows again.
  private func more() async {
    guard let cursor = next else { return }
    next = nil
    guard let page = await page(before: cursor) else {
      next = cursor
      return
    }
    let have = Set(rows.map(\.id))
    rows += page.rows.filter { !have.contains($0.id) }
    next = page.next
  }

  private func hide(_ row: Chat.Row) async {
    guard let (data, status) = try? await account.send({ Chat.hide(row.last.id, site: handbook.site, token: $0, version: ChatModel.version, ownCopy: ChatModel.ownCopy) }),
          let ids = Chat.hidden(data, status: status) else {
      problem = "Chưa ẩn được cuộc này. Thử lại sau nhé."
      return
    }
    rows.removeAll { $0.id == row.id }
    hid(ids)
  }
}

/// A row: the page's photo (a camera for fish ID, whose photo never went to the chat), its first question on up to two
/// lines, and one grey line: whose, how many questions, and when. The conversation on screen says so first.
private struct ChatHistoryRow: View {
  let row: Chat.Row
  let here: Bool
  let opening: Bool
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size
  @ScaledMetric private var side: CGFloat = 44

  private var item: HandbookIndex.Item? { row.first.about.flatMap { handbook.page($0.id) } }
  private var name: String? { item?.name ?? row.first.about?.name }
  private var photo: Bool { row.first.from == .fishId }

  var body: some View {
    HStack(spacing: 12) {
      picture
      VStack(alignment: .leading, spacing: 3) {
        Text(row.first.question).font(.subheadline.weight(.medium)).lineLimit(size.isAccessibilitySize ? nil : 2).multilineTextAlignment(.leading)
        line.font(.footnote).lineLimit(size.isAccessibilitySize ? nil : 1)
      }
      Spacer(minLength: 0)
      if opening { ProgressView() }
    }
    .contentShape(.rect)
    .accessibilityElement(children: .combine)
  }

  @ViewBuilder private var picture: some View {
    Group {
      if photo {
        Image(systemName: "camera.fill").font(.body).foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity).background(.fill.tertiary)
      } else if let img = item?.img.flatMap(URL.init(string:)) ?? row.first.about?.img {
        PageImage(src: img.absoluteString, ratio: 1, corner: 0).frame(width: side, height: side)
      } else {
        Image(systemName: "photo").font(.body).foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity).background(.fill.tertiary)
      }
    }
    .frame(width: side, height: side)
    .clipShape(.rect(cornerRadius: 8))
    .accessibilityHidden(true)
  }

  private var line: Text {
    let whose = photo ? name.map { String(localized: "Ảnh của bạn: \($0)") } ?? String(localized: "Ảnh của bạn") : name
    let rest = [whose, String(localized: "\(row.asked) câu"), ChatTimes.row(row.last.last)].compactMap { $0 }.joined(separator: " · ")
    let words = Text(verbatim: rest).foregroundStyle(.secondary)
    guard here else { return words }
    return Text("Đang mở").fontWeight(.semibold).foregroundStyle(.tint) + Text(verbatim: " · ").foregroundStyle(.secondary) + words
  }
}

/// A past conversation's times, as the list and the chat screen say them, in the reader's language.
enum ChatTimes {
  /// A row's: the time today and yesterday, the day of the week this week, the date before.
  static func row(_ d: Date, now: Date = .now) -> String {
    switch Chat.period(of: d, now: now) {
    case .today, .yesterday: d.formatted(date: .omitted, time: .shortened)
    case .week: d.formatted(.dateTime.weekday(.wide))
    case .earlier: d.formatted(.dateTime.day().month(.abbreviated))
    }
  }

  /// Above a reopened conversation's first question: "Hôm qua, 21:05".
  static func heading(_ d: Date, now: Date = .now) -> String {
    let time = d.formatted(date: .omitted, time: .shortened)
    return switch Chat.period(of: d, now: now) {
    case .today: String(localized: "Hôm nay, \(time)")
    case .yesterday: String(localized: "Hôm qua, \(time)")
    case .week, .earlier: d.formatted(.dateTime.day().month(.abbreviated)) + ", " + time
    }
  }

  /// The row offered under the starters: "Hôm qua".
  static func day(_ d: Date, now: Date = .now) -> String {
    switch Chat.period(of: d, now: now) {
    case .today: String(localized: "Hôm nay")
    case .yesterday: String(localized: "Hôm qua")
    case .week: d.formatted(.dateTime.weekday(.wide))
    case .earlier: d.formatted(.dateTime.day().month(.abbreviated))
    }
  }

  static func section(_ p: Chat.Period) -> String {
    switch p {
    case .today: String(localized: "Hôm nay")
    case .yesterday: String(localized: "Hôm qua")
    case .week: String(localized: "7 ngày qua")
    case .earlier: String(localized: "Trước đó")
    }
  }
}
