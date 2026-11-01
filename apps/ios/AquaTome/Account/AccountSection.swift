import AccountSync
import SwiftUI

/// "Đồng bộ giữa các thiết bị" at the end of the tank list, as on the site's page: signing in, the sync, signing out
/// and deleting the account. Shown only when the server offers accounts.
struct AccountSection: View {
  @Environment(AccountModel.self) private var account
  @State private var confirmDelete = false

  var body: some View {
    switch account.state {
    case .unknown, .off:
      EmptyView()
    case .signedOut where !account.canSync:
      // A store on the phone this app can't keep whole (the list says why): nothing to send.
      EmptyView()
    case .signedOut:
      Section {
        Text("Muốn xem các bể này trên aquatome.com hoặc trên máy khác? Đăng nhập để đồng bộ. Không bắt buộc: không đăng nhập thì bể vẫn lưu trên máy này.")
        SignInButton()
        AccountMessage()
      } header: {
        Text("Đồng bộ giữa các thiết bị").accessibilityIdentifier("account-header")
      } footer: {
        Fine()
      }
    case .signedIn(let user):
      Section {
        Text(status(user)).accessibilityIdentifier("account-status").accessibilityValue(syncsForTests)
        Button("Đồng bộ ngay") { Task { await account.sync() } }
          .disabled(account.syncing || !account.canSync)
          .accessibilityIdentifier("sync-now")
        Button("Đăng xuất") { Task { await account.signOut() } }
          .disabled(account.working)
          .accessibilityIdentifier("sign-out")
        Button("Xóa tài khoản", role: .destructive) { confirmDelete = true }
          .disabled(account.working)
          .accessibilityIdentifier("delete-account")
        AccountMessage()
      } header: {
        Text("Đồng bộ giữa các thiết bị")
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

  private func status(_ user: AccountUser) -> String {
    let kinds = ["apple": "Apple", "google": "Google", "email": "email", "passkey": "passkey"]
    var ways: [String] = []
    for m in user.methods { let w = kinds[m.kind] ?? m.kind; if !ways.contains(w) { ways.append(w) } }
    let list = ways.formatted(.list(type: .and, width: .narrow))
    guard let at = account.syncedAt else { return String(localized: "Đã đăng nhập bằng \(list).") }
    return String(localized: "Đã đăng nhập bằng \(list). Đồng bộ lúc \(at.formatted(date: .omitted, time: .shortened)).")
  }
}

/// For the empty list: tanks saved on aquatome.com or another phone come back by signing in.
struct AccountSignIn: View {
  @Environment(AccountModel.self) private var account

  var body: some View {
    if account.state == .signedOut && account.canSync {
      VStack(spacing: 12) {
        Text("Đã lưu bể trên aquatome.com hoặc máy khác? Đăng nhập để lấy về.")
          .font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
        SignInButton().frame(maxWidth: 300)
        AccountMessage()
        Fine(centered: true)
      }
      .padding(.top, 8)
    } else if let m = account.message {
      Text(m.text).font(.subheadline).foregroundStyle(m.bad ? .red : .secondary).accessibilityIdentifier("account-message")
    }
  }
}

/// Sign in with Apple, with a passkey added on aquatome.com, and with a code sent by email when the server offers them
/// (the address used on aquatome.com, or with Google there, opens that account).
private struct SignInButton: View {
  @Environment(AccountModel.self) private var account
  @State private var email = false
  var body: some View {
    AppleButton { Task { await account.signInWithApple() } }
      .frame(height: 44)
      .disabled(account.working || !account.canSync)
      .opacity(account.working ? 0.5 : 1)
    if account.offersPasskey {
      Button("Đăng nhập bằng passkey") { Task { await account.signInWithPasskey() } }
        .frame(maxWidth: .infinity, minHeight: 44)
        .disabled(account.working || !account.canSync)
        .accessibilityIdentifier("passkey-sign-in")
    }
    if account.offersEmail {
      Button("Đăng nhập bằng email") { email = true }
        .frame(maxWidth: .infinity, minHeight: 44)
        .disabled(account.working || !account.canSync)
        .accessibilityIdentifier("email-sign-in")
        .sheet(isPresented: $email) { EmailSignIn() }
    }
  }
}

private struct AccountMessage: View {
  @Environment(AccountModel.self) private var account
  var body: some View {
    if let m = account.message {
      Text(m.text).foregroundStyle(m.bad ? .red : .secondary).accessibilityIdentifier("account-message")
    }
  }
}

private struct Fine: View {
  /// Under the empty list's centred text; a list footer is set flush left.
  var centered = false
  var body: some View {
    VStack(alignment: centered ? .center : .leading, spacing: 4) {
      Text("Chỉ dùng để nhận ra bạn khi đăng nhập: không lưu tên, số điện thoại, và địa chỉ email chỉ lưu ở dạng mã hóa một chiều.")
        .fixedSize(horizontal: false, vertical: true)
        // A list footer is grey already.
        .foregroundStyle(centered ? AnyShapeStyle(.secondary) : AnyShapeStyle(.primary))
      Link("Chính sách bảo mật", destination: URL(string: String(localized: "https://aquatome.com/vi/chinh-sach-bao-mat/#tai-khoan"))!)
    }
    .multilineTextAlignment(centered ? .center : .leading)
    .font(.footnote)
  }
}
