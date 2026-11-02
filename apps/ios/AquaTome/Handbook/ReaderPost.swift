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
  @State private var consent = false
  @State private var sending = false
  @State private var said: String?

  var body: some View {
    NavigationStack {
      Form {
        if case .signedIn = account.state {
          TextField(kind == .comment ? "Tên" : "Tên hiển thị", text: $who).textContentType(.nickname).accessibilityIdentifier("post-name")
          if kind == .comment {
            TextField("Bình luận", text: $text, axis: .vertical).lineLimit(4...12).accessibilityIdentifier("post-body")
          } else {
            PhotosPicker(selection: $picked, matching: .images) { Label("Ảnh", systemImage: "photo") }
            if let jpeg, let image = UIImage(data: jpeg) { Image(uiImage: image).resizable().scaledToFit().frame(maxHeight: 220) }
            Toggle("Ảnh do tôi chụp. Tôi đồng ý để AquaTome đăng ảnh này kèm tên tôi.", isOn: $consent).accessibilityIdentifier("post-consent")
          }
          Button(kind == .comment ? "Gửi bình luận" : "Gửi ảnh") { Task { await send() } }
            .disabled(sending)
            .accessibilityIdentifier("post-send")
          if let said { Text(said).accessibilityIdentifier("post-said") }
        } else {
          Text("Đăng nhập tài khoản aquatome.com để bình luận và gửi ảnh.")
          SignInButton()
          AccountMessage()
        }
      }
      .navigationTitle(kind == .comment ? "Thảo luận" : "Ảnh bạn đọc")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { Button("Đóng") { dismiss() } }
      .task(id: picked) {
        guard let picked else { return }
        jpeg = (try? await picked.loadTransferable(type: Data.self)).flatMap { Readers.shrink($0) }
        if jpeg == nil { said = String(localized: "Không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.") }
      }
    }
  }

  private func send() async {
    if kind == .photo && jpeg == nil { return said = String(localized: "Chọn một ảnh trước đã.") }
    if kind == .photo && (jpeg?.count ?? 0) > 8 << 20 { return said = String(localized: "Ảnh quá lớn (tối đa 8 MB).") }
    sending = true
    said = String(localized: "Đang gửi…")
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let answer = await account.post { token in
      kind == .comment
        ? Readers.post(comment: key, name: who, body: text, site: handbook.site, token: token, version: version)
        : Readers.post(photo: key, name: who, jpeg: jpeg ?? Data(), site: handbook.site, token: token, version: version)
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
    case .received?:
      picked = nil; jpeg = nil; consent = false
      said = String(localized: "Đã nhận ảnh, cảm ơn bạn! Ảnh sẽ hiện ở đây sau khi được duyệt, thường trong vòng một ngày.")
    case .signedOut?:
      said = nil
    case let .refused(code)?:
      said = Self.refusal[code] ?? (kind == .comment ? String(localized: "Không gửi được bình luận, vui lòng thử lại.") : String(localized: "Không gửi được ảnh, vui lòng thử lại."))
    case nil:
      said = kind == .comment ? String(localized: "Không gửi được bình luận, vui lòng thử lại.") : String(localized: "Không gửi được ảnh, vui lòng thử lại.")
    }
  }

  /// The site's words for each refusal (apps/site/src/scripts/reader-photos.ts), by the Worker's code.
  private static let refusal: [String: String] = [
    "rate": String(localized: "Bạn đã gửi đủ 5 ảnh hôm nay. Hãy quay lại ngày mai."),
    "not an image": String(localized: "Chỉ nhận ảnh JPEG, PNG hoặc WebP."),
    "too large": String(localized: "Ảnh quá lớn (tối đa 8 MB)."),
    "bad name": String(localized: "Tên chỉ gồm chữ, 1–40 ký tự, không chứa đường link."),
    "name must be 1–40 characters": String(localized: "Tên chỉ gồm chữ, 1–40 ký tự, không chứa đường link."),
    "consent": String(localized: "Vui lòng xác nhận ảnh do bạn chụp."),
  ]
}
