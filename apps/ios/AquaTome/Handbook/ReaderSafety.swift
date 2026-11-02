import Handbook
import SwiftUI

/// What the reader keeps off their screen of other readers' comments and photos, on this phone only (App Store guideline
/// 1.2): the posters they block, by the site's opaque `author` (Readers.blockKey), and each item they report, hidden
/// at once while moderation looks at it. Kept in the app's defaults; nothing about it goes to the site but the report.
@MainActor @Observable
final class ReaderSafety {
  struct Blocked: Codable, Hashable, Identifiable {
    let key: String
    /// The name they posted under when blocked, for the list to unblock them by.
    let name: String
    var id: String { key }
  }

  private(set) var blocked: [Blocked]
  private(set) var reported: Set<String>
  @ObservationIgnored private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    blocked = defaults.data(forKey: "readers.blocked").flatMap { try? JSONDecoder().decode([Blocked].self, from: $0) } ?? []
    reported = Set(defaults.stringArray(forKey: "readers.reported") ?? [])
  }

  func hides(_ item: ReaderItem) -> Bool {
    reported.contains("\(item.kind):\(item.id)") || blocked.contains { $0.key == Readers.blockKey(author: item.author, id: item.id) }
  }

  func block(_ item: ReaderItem) {
    let key = Readers.blockKey(author: item.author, id: item.id)
    guard !blocked.contains(where: { $0.key == key }) else { return }
    blocked.append(Blocked(key: key, name: item.name))
    defaults.set(try? JSONEncoder().encode(blocked), forKey: "readers.blocked")
  }

  func unblock(_ key: String) {
    blocked.removeAll { $0.key == key }
    defaults.set(try? JSONEncoder().encode(blocked), forKey: "readers.blocked")
  }

  func reported(_ item: ReaderItem) {
    reported.insert("\(item.kind):\(item.id)")
    defaults.set(Array(reported).sorted(), forKey: "readers.reported")
  }
}

/// A reader's comment or photo, as the reader acts on it: `kind` as the site names it ("comment", "photo").
struct ReaderItem: Identifiable, Equatable {
  let kind: String
  let id: String
  let author: String?
  let name: String

  init(_ c: Readers.Comment) { kind = "comment"; id = c.id; author = c.author; name = c.name }
  init(_ p: Readers.Photo) { kind = "photo"; id = p.id; author = p.author; name = p.name }
}

/// "…" beside another reader's comment or photo: report it, or block who posted it.
struct ReaderMenu: View {
  let item: ReaderItem
  @Binding var reporting: ReaderItem?
  @Binding var blocking: ReaderItem?

  var body: some View {
    Menu {
      Button("Báo cáo", systemImage: "flag") { reporting = item }
      Button("Chặn người này", systemImage: "hand.raised") { blocking = item }
    } label: {
      Image(systemName: "ellipsis").frame(width: 44, height: 44).contentShape(.rect)
    }
    .accessibilityLabel(Text(item.kind == "comment" ? "Tùy chọn cho bình luận của \(item.name)" : "Tùy chọn cho ảnh của \(item.name)"))
    .accessibilityIdentifier("reader-menu")
  }
}

extension View {
  /// The report and block a ReaderMenu starts: asked, sent, and said, on the view that stays while the item goes.
  /// `done`: after the item is reported or blocked (a photo's viewer closes).
  func readerActions(reporting: Binding<ReaderItem?>, blocking: Binding<ReaderItem?>, done: @escaping () -> Void = {}) -> some View {
    modifier(ReaderActions(reporting: reporting, blocking: blocking, done: done))
  }
}

private struct ReaderActions: ViewModifier {
  @Binding var reporting: ReaderItem?
  @Binding var blocking: ReaderItem?
  let done: () -> Void
  @Environment(HandbookModel.self) private var handbook
  @Environment(AccountModel.self) private var account
  @State private var said: String?
  /// Reported, kept on screen until the reader has read the thanks: a photo's viewer stays open for it.
  @State private var sent: ReaderItem?

  /// The reasons offered, each sent as its code for moderation; the last, none.
  private static let reasons: [(LocalizedStringKey, String?)] = [
    ("Spam hoặc quảng cáo", "spam"), ("Xúc phạm hoặc quấy rối", "harassment"), ("Nội dung không phù hợp", "inappropriate"), ("Lý do khác", nil),
  ]

  func body(content: Content) -> some View {
    content
      .confirmationDialog(reporting?.kind == "photo" ? String(localized: "Báo cáo ảnh này?") : String(localized: "Báo cáo bình luận này?"),
                          isPresented: shown($reporting), titleVisibility: .visible, presenting: reporting) { item in
        ForEach(Self.reasons.indices, id: \.self) { i in Button(Self.reasons[i].0) { send(item, Self.reasons[i].1) } }
      } message: { _ in
        Text("Nội dung này sẽ ẩn trên máy này ngay, và AquaTome xem lại trong vòng 24 giờ.")
      }
      .confirmationDialog(String(localized: "Chặn \(blocking?.name ?? "")?"), isPresented: shown($blocking), titleVisibility: .visible, presenting: blocking) { item in
        Button("Chặn", role: .destructive) {
          handbook.safety.block(item)
          done()
        }
      } message: { _ in
        Text("Bình luận và ảnh của người này sẽ ẩn trên máy này. Bỏ chặn trong Bể của tôi, mục Người đã chặn.")
      }
      .alert(said ?? "", isPresented: Binding(get: { said != nil }, set: { if !$0 { said = nil } })) {
        Button("Đóng") {
          if let sent { handbook.safety.reported(sent) }
          sent = nil
          done()
        }
      }
  }

  private func shown(_ item: Binding<ReaderItem?>) -> Binding<Bool> {
    Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } })
  }

  private func send(_ item: ReaderItem, _ reason: String?) {
    Task {
      let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
      let answer = await account.report { token in
        Readers.report(item.kind, id: item.id, reason: reason, site: handbook.site, token: token, version: version)
      }.map { Readers.reported($0.0, status: $0.1) }
      switch answer {
      case .received?:
        sent = item
        said = String(localized: "Đã gửi báo cáo. Cảm ơn bạn.")
      case .refused("rate")?:
        said = String(localized: "Hôm nay bạn đã báo cáo nhiều lần. Hãy thử lại vào ngày mai.")
      default:
        said = String(localized: "Không gửi được báo cáo, vui lòng thử lại.")
      }
    }
  }
}

/// The posters the reader blocks, each to unblock: in the tanks tab (Tài khoản) and from a page's readers' part.
struct BlockedList: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    ForEach(handbook.safety.blocked) { b in
      HStack {
        Text(verbatim: b.name)
        Spacer()
        Button("Bỏ chặn") { handbook.safety.unblock(b.key) }
          .accessibilityLabel(Text("Bỏ chặn \(b.name)"))
          .accessibilityIdentifier("unblock")
      }
    }
  }
}

/// "Người đã chặn", in the tanks tab under the account: there with accounts on or off, once anyone is blocked.
struct BlockedSection: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    if !handbook.safety.blocked.isEmpty {
      Section {
        BlockedList()
      } header: {
        Text("Người đã chặn").accessibilityIdentifier("blocked-header")
      } footer: {
        Text("Bình luận và ảnh của những người này đang ẩn trên máy này.")
      }
    }
  }
}
