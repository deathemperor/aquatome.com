import AccountSync
import Handbook
import Foundation
import Observation
import Tanks

/// Signing in to aquatome.com (Apple, Google, a code sent by email, or a passkey), adding a passkey, and syncing "Bể của tôi" with
/// the account (protocols/accounts.openapi.json), as the
/// site's page does: right after signing in (the whole store, so tanks made before join the account), when the app
/// comes to the front, a moment after each change, and on "Đồng bộ ngay". Optional: signed out, tanks stay on the phone.
@Observable
@MainActor
final class AccountModel {
  enum State: Equatable {
    /// Not asked yet, or the server couldn't be reached: nothing shown.
    case unknown
    /// Accounts are off on the server.
    case off
    case signedOut
    case signedIn(AccountUser)
  }

  private(set) var state = State.unknown
  private(set) var syncedAt: Date?
  /// The last thing to tell the reader, and whether it is a problem.
  private(set) var message: (text: String, bad: Bool)?
  /// Signing in, out, or deleting the account.
  private(set) var working = false
  private(set) var syncing = false
  /// Syncs done since launch (the UI tests wait on it).
  private(set) var syncs = 0
  /// The server offers email sign-in (it can send mail and check Turnstile).
  private(set) var offersEmail = false
  private(set) var offersPasskey = false
  private(set) var offersGoogle = false
  /// An email sign-in waiting for its code: the address it was sent to.
  private(set) var codeSentTo: String?
  /// "Thêm passkey" long after signing in on this phone: the server wants a sign-in first, and one to this account adds
  /// the passkey.
  private(set) var signingInAgain = false

  // Not shown, so not observed.
  @ObservationIgnored private let tanks: TanksModel
  @ObservationIgnored private let api: AccountsClient
  @ObservationIgnored private let apple: AppleSignIn
  @ObservationIgnored private let google: GoogleSignIn
  @ObservationIgnored private let passkey: PasskeySignIn
  @ObservationIgnored private let keychain: TokenStore
  /// The UI tests' stand-in for the Turnstile check (no web page, a new token each time).
  @ObservationIgnored let fakeChecks: Bool
  @ObservationIgnored private var token: String?
  /// The secret the emailed code works with: in memory only.
  @ObservationIgnored private var flow: String?
  /// Counts the email sign-ins started and closed: a code asked for by one closed since is dropped.
  @ObservationIgnored private var emailRun = 0
  @ObservationIgnored private var later: Task<Void, Never>?
  @ObservationIgnored private var again = false
  /// The store as the last sync left it: a change seen after that is the reader's, and is sent.
  @ObservationIgnored private var synced: TankStore?
  /// The owner's dashboard (Owner/): shown only to the owner's account, read with its session; a reply saying the
  /// session is over signs it out.
  @ObservationIgnored private(set) lazy var owner = OwnerAccess(send: api.send, session: { [unowned self] in
    user.flatMap { u in token.map { (u.id, $0) } }
  }, ended: { [unowned self] in sessionEnded() })
  /// The daily report's notifications on this phone, for the owner's account (OwnerNotifications).
  @ObservationIgnored private(set) lazy var push = OwnerPush(owner: owner, environment: Self.apns)
  /// The APNs a build's token is from: a debug build's (Xcode, development signing) the sandbox's; TestFlight's and the
  /// App Store's, production's.
  #if DEBUG
  static let apns = "sandbox"
  #else
  static let apns = "production"
  #endif

  init(tanks: TanksModel, api: AccountsClient = AccountsClient(), apple: AppleSignIn = SystemAppleSignIn(), google: GoogleSignIn = SystemGoogleSignIn(), passkey: PasskeySignIn = SystemPasskeySignIn(), keychain: TokenStore = TokenStore(), fakeChecks: Bool = false) {
    self.tanks = tanks
    self.api = api
    self.apple = apple
    self.google = google
    self.passkey = passkey
    self.keychain = keychain
    self.fakeChecks = fakeChecks
    // The Keychain outlives the app: a reinstall starts signed out, as a first install does.
    if !UserDefaults.standard.bool(forKey: "account.installed") {
      keychain.delete()
      UserDefaults.standard.set(true, forKey: "account.installed")
    }
    token = keychain.read()
  }

  /// A store on the phone this app can't keep whole (newer, unreadable) isn't sent or replaced.
  var canSync: Bool { tanks.problem == nil || tanks.problem == .saveFailed }
  var user: AccountUser? { if case .signedIn(let u) = state { u } else { nil } }
  var signsInWithApple: Bool { user?.methods.contains { $0.kind == "apple" } ?? false }
  /// The ways the account signs in, as the account section lists them ("Apple và passkey").
  var ways: String {
    let names = ["apple": "Apple", "google": "Google", "email": "email", "passkey": "passkey"]
    var list: [String] = []
    for m in user?.methods ?? [] { let w = names[m.kind] ?? m.kind; if !list.contains(w) { list.append(w) } }
    return list.formatted(.list(type: .and, width: .narrow))
  }

  /// Sends one of the reader's own posts to a page (a comment, a photo: protocols/talk.openapi.json) as this account,
  /// `make` given the session's token: its status and body, or nil signed out or offline. A session the site says is over
  /// is looked up again, so the reader is asked to sign in.
  func post(_ make: (String) -> URLRequest) async -> (Data, Int)? { try? await send(make) }

  /// As `post`, with what stopped the request when it went nowhere (URLSession's error: no network, or no answer in
  /// the request's time).
  func send(_ make: (String) -> URLRequest) async throws -> (Data, Int)? {
    guard let token else { return nil }
    let (data, res) = try await api.send(make(token))
    if res.statusCode == 401 { await refresh() }
    return (data, res.statusCode)
  }

  /// Sends a reader's report of another's comment or photo (protocols/talk.openapi.json): `make` given the session's
  /// token when signed in (the account's own day's limit), else nil (as the site's page sends it). Its status and body,
  /// or nil offline.
  func report(_ make: (String?) -> URLRequest) async -> (Data, Int)? {
    let signedIn: String? = if case .signedIn = state { token } else { nil }
    guard let (data, res) = try? await api.send(make(signedIn)) else { return nil }
    if res.statusCode == 401 { await refresh() }
    return (data, res.statusCode)
  }

  /// A request that needs no account (the fish-ID tool's state), through the same server: its status and body, or nil
  /// offline.
  func fetch(_ r: URLRequest) async -> (Data, Int)? {
    guard let (data, res) = try? await api.send(r) else { return nil }
    return (data, res.statusCode)
  }

  /// At launch, and when the app comes to the front: who is signed in, then a sync.
  func refresh() async {
    let asked = token
    do {
      let answer = try await api.session(token: asked)
      // Signed in, out, or deleted meanwhile: the answer is about a session that has gone.
      guard token == asked, !working else { return }
      if case .on(let p, _, _) = answer { offersEmail = p.email; offersPasskey = p.passkey; offersGoogle = p.google }
      switch answer {
      case .off:
        state = .off
      case .on(_, _, let u?):
        state = .signedIn(u)
        await sync()
      case .on(_, _, nil):
        // A token whose session ended elsewhere (signed out there, or the account deleted).
        let ended = token != nil
        forget()
        if ended { say(String(localized: "Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ."), bad: true) }
      }
    } catch {
      // Offline: as it was.
    }
  }

  func signInWithApple() async {
    guard !working else { return }
    working = true
    defer { working = false }
    message = nil
    do {
      let nonce = try await api.nonce()
      let a = try await apple.authorize(nonceHash: sha256Hex(nonce))
      try await took(api.signInWithApple(idToken: a.idToken, nonce: nonce, replacing: token))
    } catch is AppleSignInCancelled {
    } catch {
      say(problem(error), bad: true)
    }
  }

  /// Signs in with Google: its page in a browser sheet, then the code it sends back exchanged for an ID token. Declining
  /// on Google's page is closing it: nothing to say.
  func signInWithGoogle() async {
    guard !working else { return }
    working = true
    defer { working = false }
    message = nil
    do {
      let nonce = try await api.nonce()
      let g = GoogleOAuth(nonce: nonce)
      let code = try g.code(from: try await google.open(g.url))
      let idToken = try await g.idToken(code: code, send: google.send)
      try await took(api.signInWithGoogle(idToken: idToken, nonce: nonce, replacing: token))
    } catch is GoogleSignInCancelled, GoogleError.refused("access_denied") {
    } catch AccountError.refused("provider_off") {
      // Turned off on the server since the app asked: the button goes.
      offersGoogle = false
      say(String(localized: "Đăng nhập bằng Google đang tắt: đăng nhập cách khác."), bad: true)
    } catch is GoogleError, AccountError.refused("bad_token"), AccountError.refused("bad_nonce") {
      // Another sign-in's answer, Google saying no, or a token or nonce the server won't take (one left 10 minutes).
      say(String(localized: "Google chưa xác nhận được: thử lại."), bad: true)
    } catch {
      say(problem(error), bad: true)
    }
  }

  /// Signs in with a passkey added to the account on aquatome.com (iCloud Keychain brings it to this phone, or a phone
  /// nearby lends it).
  func signInWithPasskey() async {
    guard !working else { return }
    working = true
    defer { working = false }
    message = nil
    do {
      let a = try await passkey.assert(try await api.passkeyChallenge())
      try await took(api.signInWithPasskey(a, replacing: token))
    } catch is PasskeySignInCancelled {
    } catch {
      say(problem(error), bad: true)
    }
  }

  /// Signed in on this phone: the token kept, the whole store synced, then the passkey added when this was signing in
  /// again to its account for it. After the sync, so a sync doesn't clear what the add says; the sign-in buttons (and
  /// the email sheet on one of them) stay until the passkey is made.
  private func took(_ s: SignedIn) async throws {
    try keychain.save(s.token)
    let adding = signingInAgain && s.user.id == user?.id
    if !adding { signingInAgain = false }
    token = s.token
    state = .signedIn(s.user)
    await sync(first: true)
    if adding { await register(s.token) }
  }

  /// "Thêm passkey": a passkey for the account signed in, made on this phone (kept in iCloud Keychain, so the reader's
  /// other Apple devices have it too).
  func addPasskey() async {
    guard let token, user != nil, !working else { return }
    working = true
    defer { working = false }
    message = nil
    await register(token)
  }

  /// "Hủy" while signing in again: no passkey.
  func cancelSigningInAgain() { signingInAgain = false }

  private func register(_ token: String) async {
    var again = false
    defer { signingInAgain = again }
    do {
      let p = try await passkey.register(try await api.newPasskeyChallenge(token: token))
      let u = try await api.addPasskey(p, token: token)
      // Signed out meanwhile (a sync told the session had ended): nothing to show.
      guard self.token == token else { return }
      state = .signedIn(u)
      say(String(localized: "Đã thêm passkey. Lần sau bấm “Đăng nhập bằng passkey” rồi mở khóa bằng Face ID, vân tay hoặc mã PIN của máy."))
    } catch AccountError.refused("reauth_needed") {
      again = true
    } catch is PasskeySignInCancelled {
    } catch is PasskeyExists {
      say(String(localized: "Máy này đã có passkey của tài khoản này."))
    } catch AccountError.signedOut {
      forget()
      say(String(localized: "Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ."), bad: true)
    } catch AccountError.refused("bad_passkey") {
      say(String(localized: "Chưa thêm được passkey: thử lại."), bad: true)
    } catch {
      say(problem(error), bad: true)
    }
  }

  /// The app's language, for the Turnstile check and the mail: one the site has, else Vietnamese.
  static var lang: String {
    SiteLanguage.of(Bundle.main.preferredLocalizations).code
  }
  var turnstilePage: URL { api.turnstilePage(lang: Self.lang) }

  /// Emails a sign-in code, with a token from the Turnstile check (used either way). Whether it was sent; if not, the
  /// message says why.
  func sendCode(to email: String, turnstile: String) async -> Bool {
    guard !working else { return false }
    working = true
    defer { working = false }
    message = nil
    let address = email.trimmingCharacters(in: .whitespacesAndNewlines)
    let run = emailRun
    do {
      let f = try await api.emailStart(address, turnstile: turnstile, lang: Self.lang)
      // Closed ("Hủy") while it was on its way: the next opening starts from the address again.
      guard run == emailRun else { return false }
      flow = f
      codeSentTo = address
      return true
    } catch {
      if run == emailRun { say(problem(error), bad: true) }
      return false
    }
  }

  /// Signs in with the emailed code. Whether it did.
  func verify(code: String) async -> Bool {
    guard let flow, !working else { return false }
    working = true
    defer { working = false }
    message = nil
    do {
      let s = try await api.emailVerify(flow: flow, code: code, replacing: token)
      // The code step stays until the sheet closes (`emailClosed`), so the address form doesn't flash in its place.
      self.flow = nil
      try await took(s)
      return true
    } catch {
      say(problem(error), bad: true)
      return false
    }
  }

  /// Back to the address, for another code or another address.
  func cancelEmail() {
    emailRun += 1
    flow = nil
    codeSentTo = nil
    message = nil
  }

  /// The email sheet opened: what was said before is about something else.
  func emailOpened() {
    if user == nil { message = nil }
  }

  /// The email sheet closed. Not signed in ("Hủy"): its messages go with it. Signed in: what the first sync said stays.
  func emailClosed() {
    emailRun += 1
    flow = nil
    codeSentTo = nil
    if user == nil { message = nil }
  }

  /// Sends the phone's store and takes back the account's. One at a time: a change during a sync is sent after it.
  func sync(first: Bool = false) async {
    guard user != nil, let sent = token, canSync else { return }
    if syncing { again = true; return }
    syncing = true
    // A sync waiting to start isn't needed now (one that is running has left `later`).
    later?.cancel()
    later = nil
    let before = tanks.tanks.count
    do {
      let r = try await api.sync(tanks.store, token: sent)
      // Signed out, the account deleted, or someone else signed in while it was on its way: its answer is stale.
      guard token == sent else { throw CancellationError() }
      try tanks.commitSynced(r.applied(to: tanks.store))
      synced = tanks.store
      syncedAt = Date()
      syncs += 1
      let added = tanks.tanks.count - before
      if !r.refused.isEmpty { say(String(localized: "\(r.refused.count) bản ghi không hợp lệ nên chưa vào tài khoản."), bad: true) }
      else if first && added > 0 { say(String(localized: "Đã thêm \(added) bể từ tài khoản.")) }
      else if message?.bad == true { message = nil }
    } catch _ where token != sent {
      // Stale, as above: nothing to say about a session that has gone.
    } catch AccountError.signedOut {
      forget()
      say(String(localized: "Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ."), bad: true)
    } catch AccountError.offline {
      say(String(localized: "Chưa đồng bộ được: không có mạng. Các thay đổi vẫn lưu trên máy này."), bad: true)
    } catch is CancellationError {
    } catch {
      say(problem(error), bad: true)
    }
    syncing = false
    if again { again = false; await sync() }
  }

  /// A change made on the phone: synced a moment later.
  func changed() {
    guard user != nil, tanks.store != synced else { return }
    later?.cancel()
    later = Task {
      try? await Task.sleep(for: .seconds(1.5))
      guard !Task.isCancelled else { return }
      // Running now: nothing may cancel it (a request in a cancelled task fails as cancelled).
      later = nil
      await sync()
    }
  }

  func signOut() async {
    guard let token, !working else { return }
    working = true
    defer { working = false }
    // While the session holds: the site stops sending the owner's notifications to this phone.
    await push.signingOut()
    do {
      try await api.signOut(token: token)
    } catch AccountError.signedOut {
    } catch {
      say(problem(error), bad: true)
      return
    }
    forget()
    say(String(localized: "Đã đăng xuất. Các bể vẫn còn trên máy này."))
  }

  /// Deletes the account and the tanks in it; the phone's stay. An account that signs in with Apple is confirmed with
  /// Apple first, so its Apple sign-in is revoked too.
  func deleteAccount() async {
    guard let token, !working else { return }
    working = true
    defer { working = false }
    message = nil
    var code: String?
    if signsInWithApple {
      do {
        code = try await apple.authorize(nonceHash: nil).code
      } catch {
        say(String(localized: "Chưa xóa: cần đăng nhập lại bằng Apple để xác nhận."), bad: true)
        return
      }
    }
    await push.signingOut()
    do {
      try await api.deleteAccount(token: token, appleCode: code)
      forget()
      say(String(localized: "Đã xóa tài khoản. Các bể vẫn còn trên máy này."))
    } catch AccountError.signedOut {
      forget()
      say(String(localized: "Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ."), bad: true)
    } catch AccountError.refused("apple_reauth") {
      // Apple was added to the account elsewhere since: its step on the next press.
      if case .on(_, _, let u?) = try? await api.session(token: token) { state = .signedIn(u) }
      say(problem(AccountError.refused("apple_reauth")), bad: true)
    } catch {
      say(problem(error), bad: true)
    }
  }

  /// Another request with the token was told the session is over (401 `signed_out`): signed out, and said so, as a sync
  /// told the same is.
  func sessionEnded() {
    forget()
    say(String(localized: "Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ."), bad: true)
  }

  private func forget() {
    keychain.delete()
    token = nil
    signingInAgain = false
    synced = nil
    syncedAt = nil
    later?.cancel()
    if state != .off { state = .signedOut }
  }

  private func say(_ text: String, bad: Bool = false) { message = (text, bad) }

  private func problem(_ e: Error) -> String {
    switch e as? AccountError {
    case .offline: String(localized: "Không có mạng: thử lại khi có mạng.")
    case .newerStore: String(localized: "Tài khoản có dữ liệu từ bản ứng dụng mới hơn: cập nhật AquaTome để đồng bộ.")
    case .refused("rate_limited"): String(localized: "Thử quá nhiều lần: đợi một lát rồi thử lại.")
    case .refused("too_many"): String(localized: "Tài khoản đã đủ chỗ (200 bể, 400 đèn): xóa bớt rồi đồng bộ lại.")
    case .refused("credential_in_use"): String(localized: "Cách đăng nhập này đã thuộc một tài khoản khác.")
    case .refused("apple_other_account"): String(localized: "Đó là một Apple ID khác: đăng nhập bằng Apple ID của tài khoản này.")
    case .refused("apple_revoke_failed"): String(localized: "Apple chưa xác nhận được: thử lại.")
    case .refused("apple_reauth"): String(localized: "Chưa xóa: cần đăng nhập lại bằng Apple để xác nhận.")
    case .refused("bad_email"): String(localized: "Địa chỉ email chưa đúng.")
    case .refused("bad_passkey"): String(localized: "Passkey này không mở được tài khoản nào: đăng nhập cách khác.")
    case .refused("bad_code"): String(localized: "Mã không đúng hoặc đã hết hạn: kiểm tra lại, hoặc gửi mã mới.")
    case .refused("turnstile"): String(localized: "Không qua được kiểm tra chống spam, vui lòng thử lại.")
    case .refused("mail_failed"): String(localized: "Chưa gửi được email: thử lại sau.")
    default: String(localized: "Có lỗi, chưa làm được: thử lại.")
    }
  }
}
