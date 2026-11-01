import CryptoKit
import Foundation
import Tanks

// The app's side of accounts (protocols/accounts.openapi.json): the session, Sign in with Apple or with an emailed code,
// syncing "Bể của tôi" with the account, signing out and deleting the account. The app sends `client: "app"`, a bearer token, no cookie and
// no Origin; the server answers it a token instead of a cookie.

public struct AccountMethod: Sendable, Equatable {
  public let id: String
  /// "apple", "google", "email" or "passkey".
  public let kind: String
  public let createdAt: String
  public let lastUsedAt: String?
}

/// An account holds no name, email address or phone number: only its sign-in methods.
public struct AccountUser: Sendable, Equatable {
  public let id: String
  public let createdAt: String?
  public let methods: [AccountMethod]
}

/// The sign-ins the server offers (client ids are the web's; the app uses its own).
public struct Providers: Sendable, Equatable {
  public let google: Bool
  public let apple: Bool
  public let email: Bool
  public let passkey: Bool
}

public enum AccountSession: Sendable, Equatable {
  /// Accounts are off on the server: the app shows no sign-in.
  case off
  case on(providers: Providers, turnstileSitekey: String?, user: AccountUser?)
}

public struct SignedIn: Sendable, Equatable {
  public let user: AccountUser
  /// Sent as `Authorization: Bearer <token>`; kept in the Keychain.
  public let token: String
}

public struct Synced: Sendable, Equatable {
  /// The account's store, as the server merged it.
  public let store: TankStore
  /// Ids of the records the server refused: they stay on the phone, not in the account.
  public let refused: Set<String>
  /// The phone's store as it was sent.
  let sent: TankStore

  /// The phone's store after this sync: the account's, since only the server decides a merge (docs/my-tanks-sync.md:
  /// it sets a time ahead of its clock to its own, and keeps its copy on a tie). Records changed on the phone since the
  /// sync was sent, and records the server refused, stay as the phone has them; the next sync sends them.
  public func applied(to phone: TankStore) -> TankStore {
    func pick(_ server: [Object], _ sent: [Object], _ phone: [Object]) -> [JSON] {
      let id = { (r: Object) in r["id"]?.string ?? "" }
      let before = Dictionary(sent.map { (id($0), $0) }, uniquingKeysWith: { _, last in last })
      let kept = phone.filter { refused.contains(id($0)) || before[id($0)] != $0 }
      let keptIds = Set(kept.map(id))
      return (server.filter { !keptIds.contains(id($0)) } + kept).map(JSON.object)
    }
    var o = phone.value.object ?? [:]
    o["tanks"] = .array(pick(store.tanks, sent.tanks, phone.tanks))
    o["devices"] = .array(pick(store.devices, sent.devices, phone.devices))
    return (try? TankStore(.object(o))) ?? phone
  }
}

public enum AccountError: Error, Equatable {
  /// No network, or the server could not be reached.
  case offline
  /// The token is no longer good (signed out elsewhere, or the account deleted): forget it. (`session(token:)` says
  /// so with no user instead.)
  case signedOut
  /// The account's store is of a newer version than this app knows: the phone's is left as it is.
  case newerStore
  /// A reply that isn't what the contract says.
  case badReply
  /// Any other refusal, by its code (`rate_limited`, `busy`, `apple_reauth`, …), or `http_<status>` without one.
  case refused(String)
}

public typealias Send = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)

public struct AccountsClient: Sendable {
  public static let site = URL(string: "https://aquatome.com")!
  /// The app's Sign in with Apple client id (its bundle id), one of the server's APPLE_CLIENT_IDS.
  public static let appleClientId = "com.aquatome.app"

  let base: URL
  let send: Send
  let wait: @Sendable (Duration) async -> Void

  public init(base: URL = site, send: @escaping Send = AccountsClient.urlSession(), wait: @escaping @Sendable (Duration) async -> Void = { try? await Task.sleep(for: $0) }) {
    self.base = base
    self.send = send
    self.wait = wait
  }

  /// URLSession with no cookies and no cache: the server takes a bearer token only as a bearer token.
  public static func urlSession() -> Send {
    let c = URLSessionConfiguration.ephemeral
    c.httpShouldSetCookies = false
    c.httpCookieAcceptPolicy = .never
    c.httpCookieStorage = nil
    c.urlCache = nil
    c.timeoutIntervalForRequest = 20
    let session = URLSession(configuration: c)
    return { r in
      let (data, res) = try await session.data(for: r)
      guard let http = res as? HTTPURLResponse else { throw URLError(.badServerResponse) }
      return (data, http)
    }
  }

  public func session(token: String?) async throws -> AccountSession {
    let o = try await call("GET", "/api/v1/session", token: token)
    guard case .bool(let accounts) = o["accounts"] else { throw AccountError.badReply }
    guard accounts else { return .off }
    let p = o["providers"]?.object ?? [:]
    let on = { (k: String) in if case .bool(true) = p[k] { true } else { p[k]?.object != nil } }
    let user: AccountUser? = if let u = o["user"], u != .null { try AccountUser(u) } else { nil }
    return .on(providers: Providers(google: on("google"), apple: on("apple"), email: on("email"), passkey: on("passkey")), turnstileSitekey: o["turnstileSitekey"]?.string, user: user)
  }

  /// A one-time nonce for Sign in with Apple (valid 10 minutes). Apple is given its `sha256Hex`.
  public func nonce() async throws -> String {
    guard let n = try await call("POST", "/api/v1/auth/nonce", body: [:])["nonce"]?.string else { throw AccountError.badReply }
    return n
  }

  /// Signs in with Sign in with Apple's identity token, asked for with `sha256Hex(nonce)`. The token this phone had, if
  /// any, goes along: the server ends that session.
  public func signInWithApple(idToken: String, nonce: String, replacing token: String? = nil) async throws -> SignedIn {
    let o = try await call("POST", "/api/v1/auth/apple", token: token, body: ["idToken": .string(idToken), "nonce": .string(nonce), "client": .string("app")])
    guard let token = o["token"]?.string else { throw AccountError.badReply }
    return SignedIn(user: try AccountUser(o["user"]), token: token)
  }

  /// The page that runs the Turnstile check for an email sign-in, for a web view (Turnstile runs only in a web page on
  /// the site's own host). It posts `{token}`, `{expired}` or `{error}` to the message handler `turnstile`.
  public func turnstilePage(lang: String) -> URL {
    var c = URLComponents(url: URL(string: "/api/v1/auth/email/turnstile", relativeTo: base)!.absoluteURL, resolvingAgainstBaseURL: false)!
    c.queryItems = [URLQueryItem(name: "lang", value: lang)]
    return c.url!
  }

  /// Emails a 6-digit code to `email`, with a token from the Turnstile page (each is used once). The answer is the flow
  /// secret the code works with: kept in memory only.
  public func emailStart(_ email: String, turnstile: String, lang: String) async throws -> String {
    let o = try await call("POST", "/api/v1/auth/email/start", body: ["email": .string(email), "turnstile": .string(turnstile), "lang": .string(lang), "client": .string("app")])
    guard let flow = o["flow"]?.string else { throw AccountError.badReply }
    return flow
  }

  /// Signs in with the emailed code (401 `bad_code`: wrong, used or expired). The token this phone had, if any, goes
  /// along: the server ends that session.
  public func emailVerify(flow: String, code: String, replacing token: String? = nil) async throws -> SignedIn {
    let o = try await call("POST", "/api/v1/auth/email/verify", token: token, body: ["flow": .string(flow), "code": .string(code), "client": .string("app")])
    guard let token = o["token"]?.string else { throw AccountError.badReply }
    return SignedIn(user: try AccountUser(o["user"]), token: token)
  }

  /// Sends the phone's store and takes back the account's. Another sync of the account in progress (409 busy): tries
  /// again a little later, three times.
  public func sync(_ store: TankStore, token: String) async throws -> Synced {
    var attempt = 0
    while true {
      do {
        let o = try await call("POST", "/api/v1/tanks/sync", token: token, body: ["store": store.value])
        guard let s = o["store"], let refused = o["refused"]?.array else { throw AccountError.badReply }
        do {
          return Synced(store: try TankStore(s), refused: Set(refused.compactMap { $0.object?["id"]?.string }), sent: store)
        } catch TankStoreError.unknownVersion {
          throw AccountError.newerStore
        } catch {
          throw AccountError.badReply
        }
      } catch AccountError.refused(let code) where code == "busy" && attempt < 3 {
        await wait(.milliseconds(500 << attempt))
        attempt += 1
      }
    }
  }

  /// Ends this phone's session (the server answers 204 for one that had ended already).
  public func signOut(token: String) async throws {
    _ = try await call("POST", "/api/v1/auth/logout", token: token, body: [:])
  }

  /// Deletes the account. One that signs in with Apple needs a fresh authorization code from Sign in with Apple
  /// (409 `apple_reauth` without one): its Apple tokens are revoked first.
  public func deleteAccount(token: String, appleCode: String?) async throws {
    let apple: [String: JSON]? = appleCode.map { ["apple": .object(["code": .string($0), "clientId": .string(Self.appleClientId)])] }
    _ = try await call("DELETE", "/api/v1/account", token: token, body: apple)
  }

  private func call(_ method: String, _ path: String, token: String? = nil, body: [String: JSON]? = nil) async throws -> [String: JSON] {
    var r = URLRequest(url: URL(string: path, relativeTo: base)!.absoluteURL)
    r.httpMethod = method
    r.httpShouldHandleCookies = false
    if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    if let body {
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
      r.httpBody = try JSON.object(body).data()
    }
    let data: Data, res: HTTPURLResponse
    do { (data, res) = try await send(r) } catch let e as URLError { throw e.code == .cancelled ? CancellationError() : AccountError.offline }
    if res.statusCode == 204 { return [:] }
    let o = (try? JSON.parse(data))?.object
    guard (200..<300).contains(res.statusCode) else {
      let code = o?["error"]?.string ?? "http_\(res.statusCode)"
      throw code == "signed_out" ? AccountError.signedOut : AccountError.refused(code)
    }
    guard let o else { throw AccountError.badReply }
    return o
  }
}

/// A nonce's SHA-256 in lowercase hex: what Sign in with Apple on iOS is given, and the server checks against the
/// nonce it issued.
public func sha256Hex(_ s: String) -> String { SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined() }

extension AccountUser {
  init(_ v: JSON?) throws {
    guard let o = v?.object, let id = o["id"]?.string, let methods = o["methods"]?.array else { throw AccountError.badReply }
    self.init(id: id, createdAt: o["createdAt"]?.string, methods: try methods.map { m in
      guard let m = m.object, let id = m["id"]?.string, let kind = m["kind"]?.string, let at = m["createdAt"]?.string else { throw AccountError.badReply }
      return AccountMethod(id: id, kind: kind, createdAt: at, lastUsedAt: m["lastUsedAt"]?.string)
    })
  }
}
