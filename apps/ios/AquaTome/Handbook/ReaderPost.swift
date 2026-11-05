import Handbook
import PhotosUI
import SwiftUI

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
  @Environment(\.dismiss) private var dismiss
  /// The name the reader posts under, kept for the next post.
  @AppStorage("readers.name") private var who = ""
  @State private var text = ""
  @State private var picked: PhotosPickerItem?
  @State private var jpeg: Data?
  /// The photo as sent, decoded once for its preview.
  @State private var preview: UIImage?
  @State private var consent = false
  @State private var sending = false
  @State private var said: String?
  /// Where the reader takes back the photo just sent: shown this once, as the site shows it.
  @State private var deleteLink: URL?
  /// The photo just sent and the name it went under, kept in view under the line saying it was received, until another
  /// is picked: a reader looks for it there.
  @State private var sent: (photo: UIImage, name: String)?

  var body: some View {
    NavigationStack {
      Form {
        if case .signedIn = account.state {
          TextField(kind == .comment ? "Tên" : "Tên hiển thị", text: $who).textContentType(.nickname).accessibilityIdentifier("post-name")
          if kind == .comment {
            TextField("Bình luận", text: $text, axis: .vertical).lineLimit(4...12).accessibilityIdentifier("post-body")
          } else {
            PhotosPicker(selection: $picked, matching: .images) { Label("Ảnh", systemImage: "photo") }
            if let preview { Image(uiImage: preview).resizable().scaledToFit().frame(maxHeight: 220).accessibilityLabel(Text("Ảnh")) }
            Toggle("Ảnh do tôi chụp. Tôi đồng ý để AquaTome đăng ảnh này kèm tên tôi.", isOn: $consent).accessibilityIdentifier("post-consent")
          }
          Section {
            Button(kind == .comment ? "Gửi bình luận" : "Gửi ảnh") { Task { await send() } }
              .disabled(sending)
              .accessibilityIdentifier("post-send")
            if let said { Text(said).accessibilityIdentifier("post-said") }
            if let sent {
              Image(uiImage: sent.photo).resizable().scaledToFit().frame(maxHeight: 220)
                .accessibilityLabel(Text("Ảnh của \(sent.name)")).accessibilityIdentifier("post-sent")
            }
            if let deleteLink {
              Text("Muốn gỡ ảnh sau này? Lưu link riêng này (chỉ hiện một lần):")
              // To keep, not to follow: a tap opened the page that removes the photo, and a reader took it for their photo.
              Text(verbatim: deleteLink.absoluteString).textSelection(.enabled).accessibilityIdentifier("post-delete")
              ShareLink(item: deleteLink)
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
      .navigationTitle(kind == .comment ? "Thảo luận" : "Ảnh bạn đọc")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { Button("Đóng") { dismiss() } }
      // What the form says, said to VoiceOver as it changes, as the site's status line is read (aria-live).
      .onChange(of: said) { _, s in if let s { AccessibilityNotification.Announcement(s).post() } }
      .task(id: picked) {
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
        let data = try? await picked.loadTransferable(type: Data.self)
        // Shrunk off the main thread: a phone's photo is tens of megapixels.
        let small = await Task.detached(priority: .userInitiated) { data.flatMap { Readers.shrink($0) } }.value
        // Another photo picked meanwhile: that one's.
        guard !Task.isCancelled else { return }
        sent = nil
        jpeg = small
        preview = small.flatMap(UIImage.init(data:))
        said = small == nil ? String(localized: "Không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.") : nil
      }
    }
  }

  private func send() async {
    guard !sending else { return }
    // What the Worker would refuse unread, said before sending, in the form's order.
    if kind == .comment, let code = Readers.refusal(comment: who, body: text) { return said = Self.refusal(code, .comment) }
    if kind == .photo {
      if let code = Readers.refusal(photoName: who) { return said = Self.refusal(code, .photo) }
      if !consent { return said = Self.refusal("consent", .photo) }
      guard let jpeg else { return said = Self.refusal("no file", .photo) }
      if jpeg.count > 8 << 20 { return said = Self.refusal("too large", .photo) }
    }
    sending = true
    deleteLink = nil
    sent = nil
    // The photo and name as sent: another can be picked, and the name changed, while it goes.
    let photo = preview, name = who
    said = String(localized: "Đang gửi…")
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let answer = await account.post { token in
      kind == .comment
        ? Readers.post(comment: key, name: who, body: text, site: handbook.site, token: token, version: version)
        : Readers.post(photo: key, name: who, consent: consent, jpeg: jpeg ?? Data(), site: handbook.site, token: token, version: version)
    }.map { Readers.answer($0.0, status: $0.1) }
    sending = false
    switch answer {
    case let .shown(c)?:
      shown(c)
      text = ""
      said = String(localized: "Đã đăng bình luận.")
    case .held?:
      text = ""
      said = String(localized: "Bình luận đang chờ duyệt.")
    case let .received(delete)?:
      sent = photo.map { ($0, name) }
      picked = nil; jpeg = nil; preview = nil; consent = false
      deleteLink = delete.flatMap { URL(string: $0, relativeTo: handbook.site)?.absoluteURL }
      said = String(localized: "Đã nhận ảnh, cảm ơn bạn! Ảnh sẽ hiện ở đây sau khi được duyệt, thường trong vòng một ngày.")
    case .signedOut? where !signedIn:
      // Signed out: the form gives way to the sign-in, which says so.
      said = nil
    case let .refused(code)?:
      said = Self.refusal(code, kind)
    case .signedOut?, nil:
      said = Self.refusal("", kind)
    }
  }

  private var signedIn: Bool { if case .signedIn = account.state { true } else { false } }

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
