import Handbook
import SwiftUI
import Telemetry

/// A reader's comment, or photo of the page's species, posted from the app as their aquatome.com account
/// (protocols/talk.openapi.json), in place of the site's form and its Turnstile check; signed out, the sign-in first.
/// Its words and checks are the site's form's (apps/site/src/components/Comments.astro, ReaderPhotos.astro).
struct ReaderPost: View {
  enum Kind: String, Identifiable { case comment, photo; var id: String { rawValue } }
  let kind: Kind
  /// The page's key for its comments, or its readers' photos.
  let key: String
  /// The page's (a species').
  let name: String
  /// A comment shown at once.
  let shown: (Readers.Comment) -> Void
  @Environment(AccountModel.self) private var account
  @Environment(HandbookModel.self) private var handbook
  @Environment(TelemetryModel.self) private var telemetry
  @Environment(\.dismiss) private var dismiss
  /// The name the reader last posted under, kept on this phone for the next post (the account keeps no name).
  @AppStorage("readers.name") private var who = ""
  /// The name in its field: kept once a post under it goes through, not as typed (a name refused, or typed and left).
  @State private var draft = ""
  /// The name's field shown: no name kept yet, "Đổi", or a name the site refused. A kept name is a line saying so.
  @State private var naming = false
  @State private var text = ""
  @State private var picked: PickedPhoto?
  @State private var library = false
  @State private var jpeg: Data?
  /// The photo as sent, decoded once for its preview.
  @State private var preview: UIImage?
  /// The photo picked being read and shrunk: not sent until it's ready.
  @State private var reading = false
  @State private var consent = false
  @State private var sending = false
  @State private var said: Said?
  /// The photo just sent and the name it went under, kept in view under the line saying it was received, until another
  /// is picked: a reader looks for it there.
  @State private var sent: (photo: UIImage, name: String)?
  @FocusState private var typing: Field?

  enum Field { case name, body }

  /// What the form says of the reader's last step.
  enum Said: Equatable {
    /// Why nothing was sent, or what went wrong: under the button.
    case refused(String)
    /// A comment shown, or held: under the button.
    case posted(String)
    /// A photo received: a confirmation in the form's place, with where the reader takes it back (shown this once, as
    /// the site shows it).
    case received(delete: URL?)
    /// The photo picked can't be read: at the picker.
    case unreadable

    var text: String {
      switch self {
      case let .refused(s), let .posted(s): s
      case .received: String(localized: "Đã nhận ảnh, cảm ơn bạn! Ảnh sẽ hiện ở đây sau khi được duyệt, thường trong vòng một ngày.")
      case .unreadable: String(localized: "Không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.")
      }
    }
  }

  var body: some View {
    NavigationStack {
      Group {
        if case .signedIn = account.state, case let .received(delete) = said {
          confirmation(delete)
        } else {
          form
        }
      }
      .navigationTitle(kind == .comment ? "Thảo luận" : "Ảnh bạn đọc")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { Button("Đóng") { dismiss() }.disabled(sending) }
    }
    // Not closed while a photo is on its way: its link to take it back, shown once, would be lost with the sheet.
    .interactiveDismissDisabled(sending)
    .onAppear { draft = who; naming = trimmed(who).isEmpty }
    // What the form says, said to VoiceOver as it changes, as the site's status line is read (aria-live).
    .onChange(of: said) { _, s in if let s { AccessibilityNotification.Announcement(s.text).post() } }
    .onChange(of: sending) { _, on in if on { AccessibilityNotification.Announcement(String(localized: "Đang gửi…")).post() } }
    .task(id: picked) {
      reading = picked != nil
      #if DEBUG
      // UI tests can't drive the system's photo picker: a photo as if picked.
      if picked == nil, jpeg == nil, ProcessInfo.processInfo.arguments.contains("-picked-photo") {
        jpeg = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).jpegData(withCompressionQuality: 0.8) { c in
          UIColor.systemGreen.setFill(); c.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
        }
        preview = jpeg.flatMap(UIImage.init(data:))
      }
      #endif
      guard let picked else { return }
      if said == .unreadable { said = nil }
      let data = picked.data
      // Shrunk off the main thread: a phone's photo is tens of megapixels.
      let small = await Task.detached(priority: .userInitiated) { data.flatMap { Readers.shrink($0) } }.value
      // Another photo picked meanwhile: that one's.
      guard !Task.isCancelled else { return }
      reading = false
      sent = nil
      jpeg = small
      preview = small.flatMap(UIImage.init(data:))
      if small == nil { said = .unreadable }
    }
  }

  private var form: some View {
    ScrollViewReader { scroll in
      Form {
        if case .signedIn = account.state {
          Group {
            if naming || trimmed(who).isEmpty {
              TextField(kind == .comment ? "Tên" : "Tên hiển thị", text: $draft).textContentType(.nickname)
                .focused($typing, equals: .name).accessibilityIdentifier("post-name")
            } else {
              HStack {
                Text("Đăng với tên \(Text(trimmed(who)).bold())").accessibilityIdentifier("post-name-kept")
                Spacer()
                Button("Đổi") { naming = true; typing = .name }.buttonStyle(.borderless)
                  .accessibilityLabel(Text("Đổi tên")).accessibilityIdentifier("post-name-change")
              }
            }
            if kind == .comment {
              TextField("Bình luận", text: $text, axis: .vertical).lineLimit(4...12)
                .focused($typing, equals: .body).accessibilityIdentifier("post-body")
            } else {
              Button { library = true } label: { Label("Ảnh", systemImage: "photo") }.accessibilityIdentifier("post-pick")
                .sheet(isPresented: $library) {
                  ImagePicker(source: .photoLibrary, picked: { data in
                    library = false
                    picked = PickedPhoto(data: data)
                  }, cancelled: { library = false })
                  .ignoresSafeArea()
                }
              if reading {
                HStack(spacing: 8) { ProgressView(); Text("Đang chuẩn bị ảnh…") }.foregroundStyle(.secondary)
              } else if said == .unreadable {
                Text(Said.unreadable.text).foregroundStyle(Color.warning).accessibilityIdentifier("post-unreadable")
              }
              if let preview { Image(uiImage: preview).resizable().scaledToFit().frame(maxHeight: 220).accessibilityLabel(Text("Ảnh")) }
              Toggle("Ảnh do tôi chụp. Tôi đồng ý để AquaTome đăng ảnh này kèm tên tôi.", isOn: $consent).accessibilityIdentifier("post-consent")
            }
          }
          .disabled(sending)
          Section {
            Button { Task { await send() } } label: {
              if sending {
                HStack(spacing: 8) { ProgressView(); Text("Đang gửi…") }
              } else {
                Text(kind == .comment ? "Gửi bình luận" : "Gửi ảnh")
              }
            }
            .disabled(sending || reading)
            .accessibilityIdentifier("post-send")
            switch said {
            case let .refused(s):
              Label { Text(s).foregroundStyle(Color.warning).accessibilityIdentifier("post-said") } icon: {
                Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Color.warning).accessibilityHidden(true)
              }
              .id("post-said")
            case let .posted(s):
              Label { Text(s).accessibilityIdentifier("post-said") } icon: {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green).accessibilityHidden(true)
              }
              .id("post-said")
            default:
              EmptyView()
            }
          } footer: {
            Text(kind == .comment ? "Bình luận được kiểm duyệt; quảng cáo và thông tin cá nhân sẽ bị gỡ."
                                  : "Ảnh được kiểm duyệt trước khi hiện: ảnh có người, không đúng loài hoặc không phù hợp sẽ bị loại. Vị trí GPS và thông tin máy trong ảnh được xóa trước khi gửi.")
          }
        } else {
          Text("Đăng nhập tài khoản aquatome.com để bình luận và gửi ảnh.")
          SignInButton()
          AccountMessage()
        }
      }
      // What a press of the button brought, in view beside it: a long form (the photo's preview) or the keyboard would
      // leave it below the screen.
      .onChange(of: said) { _, s in
        switch s {
        case .refused?, .posted?: withAnimation { scroll.scrollTo("post-said") }
        default: break
        }
      }
    }
  }

  /// A photo received: the form gives way to the thanks, the link that takes it back, and what next.
  private func confirmation(_ delete: URL?) -> some View {
    ScrollView {
      VStack(spacing: 20) {
        Image(systemName: "checkmark.circle.fill").font(.system(size: 56)).foregroundStyle(.green).accessibilityHidden(true)
        Text(Said.received(delete: delete).text).font(.headline).multilineTextAlignment(.center).accessibilityIdentifier("post-said")
        if let sent {
          Image(uiImage: sent.photo).resizable().scaledToFit().frame(maxHeight: 220)
            .accessibilityLabel(Text("Ảnh của \(sent.name)")).accessibilityIdentifier("post-sent")
        }
        if let delete {
          VStack(alignment: .leading, spacing: 10) {
            Text("Muốn gỡ ảnh sau này? Lưu link riêng này (chỉ hiện một lần):").font(.subheadline)
            // To keep, not to follow: a tap opened the page that removes the photo, and a reader took it for their photo.
            Text(verbatim: delete.absoluteString).textSelection(.enabled).font(.footnote).accessibilityIdentifier("post-delete")
            ShareLink(item: delete)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(14)
          .background(.fill.quaternary, in: .rect(cornerRadius: 12))
        }
        VStack(spacing: 10) {
          Button { said = nil } label: { Text("Gửi ảnh khác").frame(maxWidth: .infinity) }
            .buttonStyle(.bordered).controlSize(.large).accessibilityIdentifier("post-another")
          Button { dismiss() } label: { Text("Xong").frame(maxWidth: .infinity) }
            .buttonStyle(.borderedProminent).controlSize(.large).accessibilityIdentifier("post-done")
        }
      }
      .padding(20)
    }
  }

  private func send() async {
    guard !sending else { return }
    typing = nil
    // What the Worker would refuse unread, said before sending, in the form's order.
    if kind == .comment, let code = Readers.refusal(comment: draft, body: text) { return refuse(code) }
    if kind == .photo {
      if let code = Readers.refusal(photoName: draft) { return refuse(code) }
      if !consent { return refuse("consent") }
      guard let jpeg else { return refuse("no file") }
      if jpeg.count > 8 << 20 { return refuse("too large") }
    }
    sending = true
    said = nil
    sent = nil
    // The photo and name as sent: another can be picked, and the name changed, while it goes.
    let photo = preview, name = trimmed(draft)
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let answer = await account.post { token in
      kind == .comment
        ? Readers.post(comment: key, name: draft, body: text, site: handbook.site, token: token, version: version)
        : Readers.post(photo: key, name: draft, consent: consent, jpeg: jpeg ?? Data(), site: handbook.site, token: token, version: version)
    }.map { Readers.answer($0.0, status: $0.1) }
    sending = false
    // How it went, for the app's anonymous telemetry: the server's answer alone (here, where it's known), never the text.
    let action: Action = kind == .comment ? .postComment : .postPhoto
    switch answer {
    case .shown?, .held?, .received?: telemetry.telemetry.record(.action(action, ok: true))
    case let .refused(code)?: telemetry.telemetry.record(.action(action, refused: code))
    case .signedOut?: telemetry.telemetry.record(.action(action, ok: false, kind: .signedOut))
    case nil: telemetry.telemetry.record(.action(action, ok: false, kind: .noAnswer))
    }
    switch answer {
    case let .shown(c)?:
      shown(c)
      text = ""
      keepName()
      said = .posted(String(localized: "Đã đăng bình luận."))
    case .held?:
      text = ""
      keepName()
      said = .posted(String(localized: "Bình luận đang chờ duyệt."))
    case let .received(delete)?:
      sent = photo.map { ($0, name) }
      picked = nil; jpeg = nil; preview = nil; consent = false
      keepName()
      said = .received(delete: delete.flatMap { URL(string: $0, relativeTo: handbook.site)?.absoluteURL })
    case .signedOut? where !signedIn:
      // Signed out: the form gives way to the sign-in, which says so.
      said = nil
    case let .refused(code)?:
      refuse(code)
    case .signedOut?, nil:
      refuse("")
    }
  }

  /// Why the post isn't sent, by the site's code; a name it refuses, the name's field to put it right in.
  private func refuse(_ code: String) {
    if code == "bad name" || code == "name must be 1–40 characters" { naming = true }
    said = .refused(Self.refusal(code, kind))
  }

  /// A post gone through: its name kept for the next.
  private func keepName() {
    who = trimmed(draft)
    naming = false
  }

  private var signedIn: Bool { if case .signedIn = account.state { true } else { false } }

  private func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

  /// The site's words for each refusal by the Worker's code, the photo form's (apps/site/src/scripts/reader-photos.ts)
  /// and the comment form's (its fields' limits, comments.ts); anything else, "try again".
  private static func refusal(_ code: String, _ kind: Kind) -> String {
    switch (kind, code) {
    case (.comment, "name must be 1–40 characters"), (.comment, "comment must be 2–2000 characters"), (.comment, "too large"):
      String(localized: "Tên từ 1 đến 40 ký tự, bình luận từ 2 đến 2.000 ký tự.")
    case (.comment, "verification_required"):
      String(localized: "Bình luận cần xác minh người dùng theo quy định; tính năng này sẽ sớm mở.")
    case (.comment, _):
      String(localized: "Không gửi được bình luận, vui lòng thử lại.")
    case (.photo, "rate"): String(localized: "Bạn đã gửi đủ 5 ảnh hôm nay. Hãy quay lại ngày mai.")
    case (.photo, "not an image"): String(localized: "Chỉ nhận ảnh JPEG, PNG hoặc WebP.")
    case (.photo, "too large"): String(localized: "Ảnh quá lớn (tối đa 8 MB).")
    case (.photo, "bad name"): String(localized: "Tên chỉ gồm chữ, 1–40 ký tự, không chứa đường link.")
    case (.photo, "consent"): String(localized: "Vui lòng xác nhận ảnh do bạn chụp.")
    case (.photo, "no file"): String(localized: "Chọn một ảnh trước đã.")
    case (.photo, _): String(localized: "Không gửi được ảnh, vui lòng thử lại.")
    }
  }
}
