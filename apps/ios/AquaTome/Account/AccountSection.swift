import AccountSync
import SwiftUI

/// The account on the Tài khoản tab, as on the site's page: signing in, the sync, adding a passkey, signing out and
/// deleting the account. When the server offers no accounts, or the tanks can't be sent, a line says so: the tab is never
/// blank.
struct AccountSection: View {
  @Environment(AccountModel.self) private var account
  @State private var confirmDelete = false

  var body: some View {
    switch account.state {
    case .unknown, .off:
      // Off on the server, or not reached yet.
      Section {
        Text("Lúc này chưa đăng nhập được tài khoản aquatome.com. Các bể vẫn lưu trên máy này.").accessibilityIdentifier("account-off")
      }
    case .signedOut where !account.canSync:
      // A store on the phone this app can't keep whole (the tanks list says why): nothing to send.
      Section {
        Text("Các bể trên máy này chưa đồng bộ được: xem lý do trong Bể của tôi.").accessibilityIdentifier("account-cant-sync")
      }
    case .signedOut:
      Section {
        Text("Muốn xem các bể của bạn trên aquatome.com hoặc trên máy khác? Đăng nhập để đồng bộ. Không bắt buộc: không đăng nhập thì bể vẫn lưu trên máy này.")
        SignInButton()
        AccountMessage()
      } header: {
        Text("Tài khoản aquatome.com").accessibilityIdentifier("account-header")
      } footer: {
        Fine()
      }
    case .signedIn:
      Section {
        Text(status).accessibilityIdentifier("account-status").accessibilityValue(syncsForTests)
        Button("Đồng bộ ngay") { Task { await account.sync() } }
          .disabled(account.syncing || !account.canSync)
          .accessibilityIdentifier("sync-now")
        // An account with a passkey isn't offered another: the passkey syncs to the reader's other Apple devices.
        if account.offersPasskey && account.hasPasskey {
          Text("Tài khoản đã có passkey: đăng nhập bằng Face ID, vân tay hoặc mã PIN của máy.")
            .accessibilityIdentifier("passkey-had")
        } else if account.offersPasskey {
          Button("Thêm passkey") { Task { await account.addPasskey() } }
            .disabled(account.working || account.signingInAgain)
            .accessibilityIdentifier("passkey-add")
        }
        if account.signingInAgain {
          Text("Vì an toàn, đăng nhập lại trước khi thêm: chọn một cách tài khoản này đang dùng (\(account.ways)).")
            .accessibilityIdentifier("sign-in-again")
          SignInButton()
          Button("Hủy") { account.cancelSigningInAgain() }
            .disabled(account.working)
            .accessibilityIdentifier("cancel-sign-in-again")
        }
        Button("Đăng xuất") { Task { await account.signOut() } }
          .disabled(account.working)
          .accessibilityIdentifier("sign-out")
        Button("Xóa tài khoản", role: .destructive) { confirmDelete = true }
          .disabled(account.working)
          .accessibilityIdentifier("delete-account")
        AccountMessage()
      } header: {
        Text("Tài khoản aquatome.com")
      } footer: {
        Text("Xóa tài khoản là xóa ngay tài khoản, các cách đăng nhập và mọi bể lưu trong tài khoản. Bể trên máy này vẫn còn.")
      }
      .confirmationDialog(String(localized: "Xóa vĩnh viễn tài khoản và các bể trong tài khoản? Bể trên máy này vẫn còn."), isPresented: $confirmDelete, titleVisibility: .visible) {
        Button("Xóa tài khoản vĩnh viễn", role: .destructive) { Task { await account.deleteAccount() } }
      }
    }
  }

  /// The UI tests wait for a sync by this count; nothing for VoiceOver in a release build.
  private var syncsForTests: String {
    #if DEBUG
    String(account.syncs)
    #else
    ""
    #endif
  }

  private var status: String {
    let list = account.ways
    guard let at = account.syncedAt else { return String(localized: "Đã đăng nhập bằng \(list).") }
    return String(localized: "Đã đăng nhập bằng \(list). Đồng bộ lúc \(at.formatted(date: .omitted, time: .shortened)).")
  }
}

/// For the empty tanks list, signed out: tanks saved on aquatome.com or another phone come back by signing in, on the
/// Tài khoản tab.
struct SignInHint: View {
  @Environment(AccountModel.self) private var account
  @Environment(\.openScreen) private var openScreen

  var body: some View {
    if account.state == .signedOut {
      Button("Đã lưu bể trên aquatome.com hoặc máy khác? Đăng nhập để lấy về.") { openScreen(.account) }
        .font(.subheadline)
        .multilineTextAlignment(.center)
        .padding(.top, 8)
        .accessibilityIdentifier("sign-in-hint")
    }
  }
}

/// Sign in with Apple, with a passkey added on aquatome.com, and with a code sent by email when the server offers them
/// (the address used on aquatome.com, or with Google there, opens that account). Also where a reader posts to a page.
/// In a list, each row's separator starts at the row's leading edge, not where a centred title starts.
struct SignInButton: View {
  @Environment(AccountModel.self) private var account
  @State private var email = false
  var body: some View {
    AppleButton { Task { await account.signInWithApple() } }
      .frame(height: 44)
      .disabled(account.working || !account.canSync)
      .opacity(account.working ? 0.5 : 1)
      .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
    if account.offersPasskey {
      Button("Đăng nhập bằng passkey") { Task { await account.signInWithPasskey() } }
        .frame(maxWidth: .infinity, minHeight: 44)
        .disabled(account.working || !account.canSync)
        .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
        .accessibilityIdentifier("passkey-sign-in")
    }
    if account.offersEmail {
      Button("Đăng nhập bằng email") { email = true }
        .frame(maxWidth: .infinity, minHeight: 44)
        .disabled(account.working || !account.canSync)
        .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
        .accessibilityIdentifier("email-sign-in")
        .sheet(isPresented: $email) { EmailSignIn() }
    }
  }
}

struct AccountMessage: View {
  @Environment(AccountModel.self) private var account
  var body: some View {
    if let m = account.message {
      Text(m.text).foregroundStyle(m.bad ? .red : .secondary).accessibilityIdentifier("account-message")
    }
  }
}

private struct Fine: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Chỉ dùng để nhận ra bạn khi đăng nhập: không lưu tên, số điện thoại, và địa chỉ email chỉ lưu ở dạng mã hóa một chiều.")
        .fixedSize(horizontal: false, vertical: true)
        // A list footer is grey already.
        .foregroundStyle(.primary)
      HStack(spacing: 16) {
        Link("Chính sách bảo mật", destination: URL(string: String(localized: "https://aquatome.com/vi/chinh-sach-bao-mat/#tai-khoan"))!)
        Link("Liên hệ", destination: URL(string: String(localized: "https://aquatome.com/vi/lien-he/"))!)
      }
    }
    .font(.footnote)
  }
}
