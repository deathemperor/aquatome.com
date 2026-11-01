import AccountSync
import Foundation
import Observation
import Tanks

/// Signing in to aquatome.com (Apple, or a code sent by email) and syncing "Bể của tôi" with the account
/// (protocols/accounts.openapi.json), as the
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
  /// An email sign-in waiting for its code: the address it was sent to.
  private(set) var codeSentTo: String?

  // Not shown, so not observed.
  @ObservationIgnored private let tanks: TanksModel
  @ObservationIgnored private let api: AccountsClient
  @ObservationIgnored private let apple: AppleSignIn
  @ObservationIgnored private let keychain: TokenStore
  /// The UI tests' stand-in for the Turnstile check (no web page, a new token each time).
  @ObservationIgnored let fakeChecks: Bool
  @ObservationIgnored private var token: String?
  /// The secret the emailed code works with: in memory only.
  @ObservationIgnored private var flow: String?
  @ObservationIgnored private var later: Task<Void, Never>?
  @ObservationIgnored private var again = false
  /// The store as the last sync left it: a change seen after that is the reader's, and is sent.
  @ObservationIgnored private var synced: TankStore?

  init(tanks: TanksModel, api: AccountsClient = AccountsClient(), apple: AppleSignIn = SystemAppleSignIn(), keychain: TokenStore = TokenStore(), fakeChecks: Bool = false) {
    self.tanks = tanks
    self.api = api
    self.apple = apple
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

  /// At launch, and when the app comes to the front: who is signed in, then a sync.
  func refresh() async {
    let asked = token
    do {
      let answer = try await api.session(token: asked)
      // Signed in, out, or deleted meanwhile: the answer is about a session that has gone.
      guard token == asked, !working else { return }
      if case .on(let p, _, _) = answer { offersEmail = p.email }
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
      let s = try await api.signInWithApple(idToken: a.idToken, nonce: nonce, replacing: token)
      try keychain.save(s.token)
      token = s.token
      state = .signedIn(s.user)
      await sync(first: true)
    } catch is AppleSignInCancelled {
    } catch {
      say(problem(error), bad: true)
    }
  }

  /// The app's language, for the Turnstile check and the mail: one the site has, else Vietnamese.
  static var lang: String {
    let l = Bundle.main.preferredLocalizations.first.map { String($0.prefix(2)) } ?? "vi"
    return ["vi", "id", "th"].contains(l) ? l : "vi"
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
    do {
      flow = try await api.emailStart(address, turnstile: turnstile, lang: Self.lang)
      codeSentTo = address
      return true
    } catch {
      say(problem(error), bad: true)
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
      let s = try await api.emailVerify(flow: flow, code: code.trimmingCharacters(in: .whitespaces), replacing: token)
      try keychain.save(s.token)
      token = s.token
      cancelEmail()
      state = .signedIn(s.user)
      await sync(first: true)
      return true
    } catch {
      say(problem(error), bad: true)
      return false
    }
  }

  /// Back to the address (another code, or another address), or the sheet closed.
  func cancelEmail() {
    flow = nil
    codeSentTo = nil
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

  private func forget() {
    keychain.delete()
    token = nil
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
    case .refused("bad_code"): String(localized: "Mã không đúng hoặc đã hết hạn: kiểm tra lại, hoặc gửi mã mới.")
    case .refused("turnstile"): String(localized: "Không qua được kiểm tra chống spam, vui lòng thử lại.")
    case .refused("mail_failed"): String(localized: "Chưa gửi được email: thử lại sau.")
    default: String(localized: "Có lỗi, chưa làm được: thử lại.")
    }
  }
}
