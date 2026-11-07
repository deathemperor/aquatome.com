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
  /// Reported from a photo's viewer: kept, and hidden once the viewer closes (`hidePending`), so the viewer stays to
  /// show the thanks.
  @ObservationIgnored private var pending: Set<String> = []
  /// A photo's viewer on screen: a report from it waits for it to close. Its answer may come after it has.
  @ObservationIgnored var viewing = false
  /// The reader's own `author`s, from the comments they posted that showed at once: no "…" on their own.
  private(set) var own: Set<String>
  @ObservationIgnored private let defaults: UserDefaults

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    blocked = defaults.data(forKey: "readers.blocked").flatMap { try? JSONDecoder().decode([Blocked].self, from: $0) } ?? []
    reported = Set(defaults.stringArray(forKey: "readers.reported") ?? [])
    own = Set(defaults.stringArray(forKey: "readers.own") ?? [])
  }

  /// Hidden: reported, or by a poster blocked, by their `author` or, blocked from a post that carried none, that post
  /// (a block made before the site sent `author` still holds once it does).
  func hides(_ item: ReaderItem) -> Bool {
    reported.contains("\(item.kind):\(item.id)")
      || blocked.contains { Readers.blocks($0.key, author: item.author, id: item.id) }
  }

  func isOwn(_ item: ReaderItem) -> Bool { item.author.map(own.contains) ?? false }

  func posted(_ c: Readers.Comment) {
    guard let a = c.author, !own.contains(a) else { return }
    own.insert(a)
    defaults.set(Array(own).sorted(), forKey: "readers.own")
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

  /// Kept at once, as the app may close before the thanks does; hidden now, or with `hide: false` at `hidePending`
  /// while a viewer is still open.
  func reported(_ item: ReaderItem, hide: Bool = true) {
    let key = "\(item.kind):\(item.id)"
    if hide || !viewing { reported.insert(key) } else { pending.insert(key) }
    defaults.set(Array(reported.union(pending)).sorted(), forKey: "readers.reported")
  }

  func hidePending() {
    guard !pending.isEmpty else { return }
    reported.formUnion(pending)
    pending = []
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
  /// `done`: after the item is reported or blocked (a photo's viewer closes). `inViewer`: a reported item stays until its
  /// thanks closes; hidden at once, a page's last photo would take its viewer, and the thanks on it, away first.
  func readerActions(reporting: Binding<ReaderItem?>, blocking: Binding<ReaderItem?>, inViewer: Bool = false, done: @escaping () -> Void = {}) -> some View {
    modifier(ReaderActions(reporting: reporting, blocking: blocking, inViewer: inViewer, done: done))
  }
}

private struct ReaderActions: ViewModifier {
  @Binding var reporting: ReaderItem?
  @Binding var blocking: ReaderItem?
  let inViewer: Bool
  let done: () -> Void
  @Environment(HandbookModel.self) private var handbook
  @Environment(AccountModel.self) private var account
  @State private var said: String?
  /// Reported: the thanks closes a photo's viewer too; a report not sent leaves it open to try again.
  @State private var sent = false

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
        Text("Bình luận và ảnh của người này sẽ ẩn trên máy này. Bỏ chặn trong Tài khoản, mục Người đã chặn.")
      }
      .alert(said ?? "", isPresented: Binding(get: { said != nil }, set: { if !$0 { said = nil } })) {
        Button("Đóng") {
          if sent {
            handbook.safety.hidePending()
            done()
          }
          sent = false
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
        // Kept at once: the page or the app may close before the thanks does. Hidden at once on the page; from a
        // photo's viewer, as the thanks closes, or a page's last photo would take its viewer and the thanks with it.
        handbook.safety.reported(item, hide: !inViewer)
        sent = true
        said = String(localized: "Đã gửi báo cáo. Cảm ơn bạn.")
      case .refused("rate")?:
        said = String(localized: "Hôm nay bạn đã báo cáo nhiều lần. Hãy thử lại vào ngày mai.")
      default:
        said = String(localized: "Không gửi được báo cáo, vui lòng thử lại.")
      }
    }
  }
}

/// The posters the reader blocks, each to unblock: in the Tài khoản sheet and from a page's readers' part.
struct BlockedList: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    ForEach(handbook.safety.blocked) { b in
      HStack {
        Text(verbatim: b.name)
        Spacer()
        // The button alone, not the row: a tap on the name doesn't let them back.
        Button("Bỏ chặn") { handbook.safety.unblock(b.key) }
          .buttonStyle(.bordered)
          .buttonBorderShape(.capsule)
          .controlSize(.small)
          .accessibilityLabel(Text("Bỏ chặn \(b.name)"))
          .accessibilityIdentifier("unblock")
      }
    }
  }
}

/// "Người đã chặn", opened from the Tài khoản sheet's privacy section: each poster blocked on this phone, to let back.
/// After the last, it says nobody is (and the sheet's row goes).
struct BlockedPage: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    List {
      if !handbook.safety.blocked.isEmpty {
        Section {
          BlockedList()
        } footer: {
          Text("Bình luận và ảnh của những người này đang ẩn trên máy này.")
        }
      }
    }
    .overlay {
      if handbook.safety.blocked.isEmpty {
        ContentUnavailableView("Bạn chưa chặn ai", systemImage: "hand.raised",
                               description: Text("Bình luận và ảnh của mọi người đều hiện trên máy này."))
          .accessibilityIdentifier("blocked-none")
      }
    }
    .navigationTitle("Người đã chặn")
    .navigationBarTitleDisplayMode(.inline)
  }
}
