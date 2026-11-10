import AccountSync
import SwiftUI
import Tanks

/// The account at the top of the Tài khoản sheet. Signed out: a card to sign in, the ways the account signed in first
/// when its session ended (another way would make a second account). Signed in: who it is, the sync's state with the
/// one button that helps, a passkey for this phone, and where the tanks are kept under it. With accounts off, no
/// answer yet, or tanks this app can't send, a line says so: the sheet never starts blank. Signing out and deleting the
/// account are at the sheet's end (LeaveSection).
struct AccountSection: View {
  @Environment(AccountModel.self) private var account

  var body: some View {
    switch account.state {
    case .unknown:
      // No answer yet: a moment's wait, or no network (a session kept on the phone shows as signed in instead).
      Section {
        if account.unreached {
          Notice(icon: "icloud.slash", title: "Chưa kết nối được aquatome.com.", detail: "Các bể vẫn lưu trên máy này.", id: "account-unreached")
        } else {
          ProgressView().frame(maxWidth: .infinity)
        }
      }
    case .off:
      Section {
        Notice(icon: "icloud.fill", title: "Lúc này chưa đăng nhập được tài khoản aquatome.com.", detail: "Các bể vẫn lưu trên máy này.", id: "account-off")
      }
    case .signedOut where !account.canSync:
      // A store on the phone this app can't keep whole (the tanks list says why): nothing to send.
      Section { CantSync() }
    case .signedOut:
      Section { SignInCard() }
    case .signedIn(let user):
      Section {
        Who(user: user)
        AccountPictureRow()
        SyncRow()
        PasskeyRows()
        AccountMessage()
      } footer: {
        Text("Các bể lưu trên máy này và trong tài khoản của bạn trên máy chủ AquaTome (Cloudflare), để các thiết bị đã đăng nhập cùng thấy.")
      }
    }
  }
}

/// Signing out and deleting the account, at the sheet's end, with what deleting takes.
struct LeaveSection: View {
  @Environment(AccountModel.self) private var account
  @State private var confirmDelete = false

  var body: some View {
    if account.user != nil {
      Section {
        Button("Đăng xuất") { Task { await account.signOut() } }
          .disabled(account.working)
          .accessibilityIdentifier("sign-out")
        Button("Xóa tài khoản", role: .destructive) { confirmDelete = true }
          .disabled(account.working)
          .accessibilityIdentifier("delete-account")
          // On the button: iOS shows the question as a popover from the view it's on.
          .confirmationDialog(String(localized: "Xóa vĩnh viễn tài khoản và các bể trong tài khoản? Bể trên máy này vẫn còn."), isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Xóa tài khoản vĩnh viễn", role: .destructive) { Task { await account.deleteAccount() } }
          }
      } footer: {
        Text("Xóa tài khoản là xóa ngay tài khoản, các cách đăng nhập và mọi bể lưu trong tài khoản. Bể trên máy này vẫn còn.")
      }
    }
  }
}

/// A line about the account with a grey symbol: what it is, then what it means for the tanks.
private struct Notice: View {
  let icon: String
  let title: LocalizedStringKey
  let detail: LocalizedStringKey
  let id: String

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 12) {
      Image(systemName: icon).foregroundStyle(.secondary).accessibilityHidden(true)
      (Text(title) + Text(verbatim: "\n") + Text(detail).font(.subheadline).foregroundStyle(.secondary))
        .accessibilityIdentifier(id)
    }
  }
}

private struct CantSync: View {
  var body: some View {
    Notice(icon: "exclamationmark.icloud", title: "Các bể trên máy này chưa đồng bộ được.", detail: "Xem lý do trong Bể của tôi.", id: "account-cant-sync")
  }
}

/// Who is signed in: the ways the account signs in, and since when (in the phone's calendar: a Thai phone's year is
/// 2569).
private struct Who: View {
  let user: AccountUser
  @Environment(AccountModel.self) private var account
  @Environment(\.dynamicTypeSize) private var size
  /// The avatar's circle, growing with the text up to half again.
  @ScaledMetric(relativeTo: .title3) private var circle: CGFloat = 58

  var body: some View {
    // At the accessibility text sizes the avatar goes above the lines, which keep the row's width.
    let layout = size.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 10)) : AnyLayout(HStackLayout(spacing: 14))
    let side = min(circle, 87)
    layout {
      // The account's fish once one's chosen (ProfilePictures), as on the profile button. Else the person in the app's
      // green, half the circle's height, on a pale wash of it: it reads on the card in light and dark (a grey circle was
      // the dark card's own colour).
      AccountPictureMark(size: side) {
        Image(systemName: "person.fill")
          .resizable()
          .scaledToFit()
          .frame(width: side / 2, height: side / 2)
          .foregroundStyle(.tint)
          .frame(width: side, height: side)
          .background(Color.accentColor.opacity(0.15), in: .circle)
      }
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        Text("Đã đăng nhập").font(.title3.weight(.semibold))
        Text(since).font(.subheadline).foregroundStyle(.secondary)
          .accessibilityIdentifier("account-status")
          .accessibilityValue(syncsForTests)
      }
    }
    .padding(.vertical, 4)
  }

  private var since: String {
    guard let made = Self.date(user.createdAt) else { return String(localized: "bằng \(account.ways)") }
    return String(localized: "bằng \(account.ways) · từ tháng \(Self.month(made))")
  }

  /// The month and year as each language writes them: Vietnamese "10/2026", Thai "ต.ค. 2569", Indonesian "Oktober 2026".
  private static func month(_ d: Date) -> String {
    let month: Date.FormatStyle.Symbol.Month = switch Locale.app.language.languageCode?.identifier {
    case "vi": .defaultDigits
    case "th": .abbreviated
    default: .wide
    }
    return d.formatted(.dateTime.month(month).year().locale(.app))
  }

  /// The server's time (`2026-11-01T00:00:00.000Z`, or without the fraction).
  static func date(_ s: String?) -> Date? {
    guard let s else { return nil }
    return (try? Date(s, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true)))
      ?? (try? Date(s, strategy: .iso8601))
  }

  /// The UI tests wait for a sync by this count; nothing for VoiceOver in a release build.
  private var syncsForTests: String {
    #if DEBUG
    String(account.syncs)
    #else
    ""
    #endif
  }
}

/// The sync: done (when, how many tanks), under way, or not, and why, with the one button that helps: "Đồng bộ ngay",
/// "Thử lại" where trying again may work, "Cập nhật ứng dụng" for an account's store from a newer app, none where
/// neither helps (the account full, records it won't take). No network is grey: the changes wait on the phone.
private struct SyncRow: View {
  @Environment(AccountModel.self) private var account
  @Environment(TanksModel.self) private var tanks

  var body: some View {
    let n = tanks.tanks.count
    if !account.canSync {
      CantSync()
    } else if account.syncing {
      Status(alignment: .center, title: Text("Đang đồng bộ…")) {
        ProgressView()
      } detail: {
        Text("\(n) bể")
      }
    } else if let fault = account.syncFault {
      switch fault {
      case .offline:
        Status(alignment: .center, title: Text("Chưa có mạng")) {
          cloud
        } detail: {
          if let at = account.syncedAt {
            Text("Đồng bộ lần cuối lúc \(Self.when(at)) · các thay đổi vẫn lưu trên máy này")
          } else {
            Text("Các thay đổi vẫn lưu trên máy này")
          }
        } button: {
          retry
        }
      case .newerStore:
        failed("Tài khoản có dữ liệu từ bản ứng dụng mới hơn: cập nhật AquaTome để đồng bộ.") {
          Link(destination: Self.appStore) { Text("Cập nhật ứng dụng") }.accessibilityIdentifier("sync-update")
        }
      case .failed(let why, let again):
        failed(why) { if again { retry } }
      }
    } else if let at = account.syncedAt {
      Status(alignment: .center, title: Text("Đã đồng bộ")) {
        symbol("checkmark.icloud.fill", .green)
      } detail: {
        Text("Lúc \(Self.when(at)) · \(n) bể")
      } button: {
        now
      }
    } else {
      Status(alignment: .center, title: Text("Chưa đồng bộ")) {
        cloud
      } detail: {
        Text("\(n) bể trên máy này")
      } button: {
        now
      }
    }
  }

  private var now: some View {
    Button("Đồng bộ ngay") { Task { await account.sync() } }
      .accessibilityIdentifier("sync-now")
      .accessibilityValue(ownerForTests)
  }

  private var retry: some View {
    Button("Thử lại") { Task { await account.sync() } }.accessibilityIdentifier("sync-retry")
  }

  private func failed(_ why: String, @ViewBuilder button: () -> some View) -> some View {
    Status(alignment: .top, title: Text("Chưa đồng bộ được").foregroundStyle(.red)) {
      symbol("exclamationmark.icloud.fill", .red)
    } detail: {
      Text(verbatim: why)
      if let at = account.syncedAt { Text("Lần cuối lúc \(Self.when(at))") }
    } button: {
      button()
    }
  }

  /// A cloud in its colour, the mark inside it (a check, an exclamation point) white.
  private func symbol(_ name: String, _ style: some ShapeStyle) -> some View {
    Image(systemName: name).font(.title3).symbolRenderingMode(.palette).foregroundStyle(.white, style)
  }

  /// A plain cloud, grey: nothing's wrong. One layer, so the palette above would paint it all white.
  private var cloud: some View {
    Image(systemName: "icloud.fill").font(.title3).foregroundStyle(Color(.tertiaryLabel))
  }

  /// AquaTome where this copy came from: TestFlight for a TestFlight build (its receipt is the sandbox's), else the App
  /// Store.
  static let appStore = Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
    ? URL(string: "itms-beta://beta.itunes.apple.com/v1/app/6829188547")!
    : URL(string: "https://apps.apple.com/app/id6829188547")!

  /// A sync's time: today's alone, yesterday's said so, an older one with its day.
  static func when(_ d: Date) -> String {
    var time = d.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: .app))
    // "9:38", as the spec writes it: some languages' short time is "09:38".
    if time.first == "0" { time.removeFirst() }
    if Calendar.current.isDateInToday(d) { return time }
    if Calendar.current.isDateInYesterday(d) { return String(localized: "\(time) hôm qua") }
    return String(localized: "\(time) ngày \(d.formatted(.dateTime.day().month(.defaultDigits).locale(.app)))")
  }

  /// The UI tests wait here for the owner's dashboard to have asked about this account; nothing in a release build.
  private var ownerForTests: String {
    #if DEBUG
    account.owner.isOwner.map { $0 ? "owner" : "not owner" } ?? ""
    #else
    ""
    #endif
  }
}

/// A row of the sync: its symbol, its title with grey lines under it, and a small capsule button at the trailing edge,
/// or under the lines when they'd be squeezed (a longer language, the larger text sizes).
private struct Status<Symbol: View, Detail: View, Action: View>: View {
  let alignment: VerticalAlignment
  let title: Text
  let symbol: Symbol
  let detail: Detail
  let button: Action
  @Environment(\.dynamicTypeSize) private var size

  init(alignment: VerticalAlignment, title: Text, @ViewBuilder symbol: () -> Symbol, @ViewBuilder detail: () -> Detail,
       @ViewBuilder button: () -> Action = { EmptyView() }) {
    self.alignment = alignment
    self.title = title
    self.symbol = symbol()
    self.detail = detail()
    self.button = button()
  }

  var body: some View {
    // At the accessibility text sizes the symbol stays beside the title, level with its first line.
    HStack(alignment: size.isAccessibilitySize ? .top : alignment, spacing: 14) {
      symbol.frame(minWidth: 30).accessibilityHidden(true)
      ViewThatFits(in: .horizontal) {
        HStack(alignment: alignment, spacing: 8) {
          lines.frame(minWidth: 0, idealWidth: 150, maxWidth: .infinity, alignment: .leading)
          capsule.fixedSize()
        }
        VStack(alignment: .leading, spacing: 8) {
          lines
          capsule
        }
      }
    }
    .padding(.vertical, 2)
  }

  private var lines: some View {
    VStack(alignment: .leading, spacing: 2) {
      title
      VStack(alignment: .leading, spacing: 4) { detail }
        .font(.subheadline)
        .foregroundStyle(.secondary)
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("sync-status")
  }

  private var capsule: some View {
    button
      .buttonStyle(.bordered)
      .buttonBorderShape(.capsule)
      .controlSize(.small)
      .font(.subheadline.weight(.semibold))
  }
}

/// A passkey for this phone: one made here is in iCloud Keychain for the reader's other Apple devices.
private struct PasskeyRows: View {
  @Environment(AccountModel.self) private var account

  var body: some View {
    if account.offersPasskey {
      // The account's passkey may be another device's (one made on aquatome.com in Chrome on Windows isn't on this
      // phone): one for this phone is still offered, and the server refuses a second for the same phone.
      if account.hasPasskey {
        Text("Tài khoản đã có passkey: đăng nhập bằng Face ID, vân tay hoặc mã PIN của máy.")
          .font(.footnote)
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("passkey-had")
      }
      Button { Task { await account.addPasskey() } } label: {
        Label {
          if account.hasPasskey { Text("Thêm passkey cho máy này") } else { Text("Thêm passkey") }
        } icon: {
          Image(systemName: "person.badge.key.fill")
        }
      }
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
  }
}

/// Signed out: why sign in, the ways to (Apple and Google full width, a passkey and email side by side, as the server
/// offers them), and what signing in keeps. After a session ended: which ways the account used, those first, the rest
/// under "Cách khác".
private struct SignInCard: View {
  @Environment(AccountModel.self) private var account
  @State private var others = false

  var body: some View {
    VStack(spacing: 14) {
      if let ended = account.endedWays {
        Text("Phiên đăng nhập đã hết. Lần trước bạn đăng nhập bằng \(AccountModel.names(ended)).")
          .font(.subheadline)
          .foregroundStyle(.red)
          .multilineTextAlignment(.center)
          .accessibilityIdentifier("session-ended")
        Ways(kinds: ended.filter(offered))
        if others || ended.filter(offered).isEmpty {
          Ways(kinds: Self.order.filter { offered($0) && !ended.contains($0) })
        } else {
          Button("Cách khác") { others = true }.font(.subheadline.weight(.semibold)).accessibilityIdentifier("sign-in-others")
        }
        Text("Bể trên máy này vẫn còn.").font(.footnote).foregroundStyle(.secondary)
      } else {
        AppIconMark()
        VStack(spacing: 6) {
          Text("Đồng bộ bể giữa các máy")
            .font(.title2.weight(.bold))
            .multilineTextAlignment(.center)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("account-header")
          Text("Muốn xem bể của bạn trên aquatome.com hoặc trên máy khác? Đăng nhập để đồng bộ. Không bắt buộc: không đăng nhập thì bể vẫn lưu trên máy này.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
        }
        Ways(kinds: Self.order.filter(offered)).padding(.top, 4)
      }
      AccountMessage()
      if account.endedWays == nil { Text.linked(String(localized: "Chỉ dùng để nhận ra bạn khi đăng nhập: không lưu tên, số điện thoại, và địa chỉ email chỉ lưu ở dạng mã hóa một chiều."),
                  String(localized: "Chính sách bảo mật"),
                  URL(string: String(localized: "https://aquatome.com/chinh-sach-bao-mat/#tai-khoan"))!)
        .font(.footnote)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center) }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, 12)
  }

  /// The ways to sign in, in the card's order.
  static let order = ["apple", "google", "passkey", "email"]

  private func offered(_ kind: String) -> Bool {
    switch kind {
    case "apple": true
    case "google": account.offersGoogle
    case "passkey": account.offersPasskey
    case "email": account.offersEmail
    default: false
    }
  }
}

/// The app's icon as the reader set it, over the signed-out card.
private struct AppIconMark: View {
  var body: some View {
    let name = UIApplication.shared.alternateIconName.map { String($0.dropFirst("AppIcon-".count)) } ?? "default"
    if let image = UIImage(named: "AppIconPreview-" + name) ?? UIImage(named: "AppIconPreview-default") {
      Image(uiImage: image)
        .resizable()
        .frame(width: 64, height: 64)
        .clipShape(.rect(cornerRadius: 14, style: .continuous))
        .accessibilityHidden(true)
    }
  }
}

/// Buttons for these ways to sign in, in this order: Apple and Google full width, a passkey and email side by side.
private struct Ways: View {
  let kinds: [String]
  @Environment(AccountModel.self) private var account
  @Environment(\.dynamicTypeSize) private var size
  @State private var email = false

  var body: some View {
    let small = kinds.filter { $0 == "passkey" || $0 == "email" }
    // One above the other at the accessibility sizes: side by side the words break a letter to a line.
    let pair = size.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 10)) : AnyLayout(HStackLayout(spacing: 10))
    VStack(spacing: 10) {
      ForEach(kinds.filter { !small.contains($0) }, id: \.self) { kind in
        if kind == "apple" {
          AppleButton(radius: 25) { Task { await account.signInWithApple() } }
            .frame(height: 50)
            .disabled(account.working || !account.canSync)
            .opacity(account.working ? 0.5 : 1)
        } else {
          GoogleButton(capsule: true)
        }
      }
      if !small.isEmpty {
        pair {
          ForEach(small, id: \.self) { kind in
            if kind == "passkey" {
              minor("Passkey", label: "Đăng nhập bằng passkey", symbol: "person.badge.key.fill", id: "passkey-sign-in") {
                Task { await account.signInWithPasskey() }
              }
            } else {
              minor("Email", label: "Đăng nhập bằng email", symbol: "envelope.fill", id: "email-sign-in") { email = true }
                .sheet(isPresented: $email) { EmailSignIn().ownerScreen("sheet email-sign-in") }
            }
          }
        }
      }
    }
  }

  private func minor(_ title: LocalizedStringKey, label: LocalizedStringKey, symbol: String, id: String, _ action: @escaping () -> Void) -> some View {
    Button(action: action) {
      HStack(spacing: 8) {
        Image(systemName: symbol).imageScale(.small).accessibilityHidden(true)
        Text(title)
      }
        .font(.callout.weight(.semibold))
        .foregroundStyle(.tint)
        .frame(maxWidth: .infinity, minHeight: 44)
        .background(.fill.tertiary, in: .capsule)
        .contentShape(.capsule)
    }
    .buttonStyle(.plain)
    .disabled(account.working || !account.canSync)
    .opacity(account.working || !account.canSync ? 0.5 : 1)
    .accessibilityLabel(Text(label))
    .accessibilityIdentifier(id)
  }
}

/// For the empty tanks list, signed out: tanks saved on aquatome.com or another phone come back by signing in, in the
/// Tài khoản sheet.
struct SignInHint: View {
  @Environment(AccountModel.self) private var account
  @Environment(\.openScreen) private var openScreen

  var body: some View {
    if account.state == .signedOut {
      Button { openScreen(.account) } label: {
        // The colour by name: in a button, .secondary is a shade of the tint.
        Text("Đã lưu bể trên aquatome.com hoặc máy khác?").foregroundStyle(Color.secondary)
          + Text(verbatim: "\n")
          + Text("Đăng nhập để lấy về").fontWeight(.semibold).foregroundStyle(.tint)
      }
      .font(.subheadline)
      .multilineTextAlignment(.center)
      .padding(.top, 8)
      .accessibilityIdentifier("sign-in-hint")
    }
  }
}

/// Sign in with Apple, with Google, with a passkey added on aquatome.com, and with a code sent by email when the server
/// offers them (the address used on aquatome.com, or with Google there, opens that account). Where a reader posts to a
/// page or identifies a fish, and signing in again before adding a passkey. In a list, each row's separator starts at
/// the row's leading edge, not where a centred title starts.
struct SignInButton: View {
  @Environment(AccountModel.self) private var account
  @State private var email = false
  var body: some View {
    AppleButton { Task { await account.signInWithApple() } }
      .frame(height: 44)
      .disabled(account.working || !account.canSync)
      .opacity(account.working ? 0.5 : 1)
      .alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
    if account.offersGoogle { GoogleButton().alignmentGuide(.listRowSeparatorLeading) { _ in 0 } }
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
        .sheet(isPresented: $email) { EmailSignIn().ownerScreen("sheet email-sign-in") }
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
