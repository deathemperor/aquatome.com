#if DEBUG
// Tests and the simulator only: not in a release build.
import Foundation
import Tanks

/// The accounts server, in process, for tests and the simulator's UI tests: the paths `AccountsClient` uses, answered
/// as apps/site/worker/accounts does (protocols/accounts.openapi.json). Sign in with Apple's identity token is
/// `<sub>|<nonce or its SHA-256>`, and a fresh Apple authorization code for an Apple user is `good-<sub>`.
/// Records are merged as the server merges them, a time ahead of `now` set to `now` first.
@MainActor
public final class FakeAccounts {
  public var accountsOn = true
  /// No network: every request fails as URLSession does.
  public var offline = false
  /// The next syncs answer 409 busy (another sync of the account in progress).
  public var busy = 0
  /// Records (by id) the server refuses, as it does one that doesn't validate.
  public var refuse: Set<String> = []
  public var now: () -> Date = Date.init
  /// Every request received, in order.
  public private(set) var requests: [URLRequest] = []

  struct Account { let id: String; var store = TankStore() }
  private var accounts: [String: Account] = [:] // by Apple sub
  private var tokens: [String: String] = [:] // token → Apple sub
  private var nonces: Set<String> = []
  private var issued = 0
  static let appleClientIds = ["com.aquatome.web", "com.aquatome.app"]

  public init() {}

  /// The accounts, their tanks and sessions as JSON, so the stand-in keeps them across launches of the app (UI tests:
  /// a second phone signs in to the account the first one made).
  public var snapshot: JSON {
    .object([
      "accounts": .object(accounts.mapValues { .object(["id": .string($0.id), "store": $0.store.value]) }),
      "tokens": .object(tokens.mapValues(JSON.string)),
      "issued": .number(Double(issued)),
    ])
  }

  public convenience init(snapshot: JSON) {
    self.init()
    let o = snapshot.object ?? [:]
    for (sub, a) in o["accounts"]?.object ?? [:] {
      guard let id = a.object?["id"]?.string, let store = a.object?["store"].flatMap({ try? TankStore($0) }) else { continue }
      accounts[sub] = Account(id: id, store: store)
    }
    for (token, sub) in o["tokens"]?.object ?? [:] { if let sub = sub.string, accounts[sub] != nil { tokens[token] = sub } }
    issued = o["issued"]?.int ?? 0
  }

  /// The tanks an account holds, by the Apple user it signs in with.
  public func store(of sub: String) -> TankStore? { accounts[sub]?.store }
  public var accountCount: Int { accounts.count }
  public var sessionCount: Int { tokens.count }
  /// Ends every session of an account, as signing out elsewhere or deleting it there would.
  public func endSessions(of sub: String) { tokens = tokens.filter { $0.value != sub } }

  public func send(_ r: URLRequest) async throws -> (Data, HTTPURLResponse) {
    requests.append(r)
    if offline { throw URLError(.notConnectedToInternet) }
    let method = r.httpMethod ?? "GET", path = r.url?.path ?? ""
    let isJSON = r.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("application/json") == true
    // As the server reads a body: JSON, an object, else none.
    let body = isJSON ? r.httpBody.flatMap { try? JSON.parse($0).object } : nil
    let bearer = r.value(forHTTPHeaderField: "Authorization").map { String($0.dropFirst("Bearer ".count)) }
    let sub = bearer.flatMap { tokens[$0] }
    func reply(_ status: Int, _ o: [String: JSON]? = nil) throws -> (Data, HTTPURLResponse) {
      (try o.map { try JSON.object($0).data() } ?? Data(), HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
    }
    let fail = { (status: Int, code: String) in try reply(status, ["error": .string(code)]) }
    if !accountsOn { return path == "/api/v1/session" ? try reply(200, ["accounts": .bool(false)]) : try fail(404, "accounts_off") }
    if method == "POST" && body == nil { return try fail(400, "bad_request") }

    switch (method, path) {
    case ("GET", "/api/v1/session"):
      return try reply(200, [
        "accounts": .bool(true),
        "providers": .object(["google": .null, "apple": .object(["clientId": .string("com.aquatome.web")]), "email": .bool(true), "passkey": .bool(false)]),
        "turnstileSitekey": .string("sk"),
        "user": sub.flatMap { accounts[$0] }.map { user($0, sub!) } ?? .null,
      ])
    case ("POST", "/api/v1/auth/nonce"):
      issued += 1
      let n = "nonce-\(issued)"
      nonces.insert(n)
      return try reply(200, ["nonce": .string(n)])
    case ("POST", "/api/v1/auth/apple"):
      // Without `client: "app"` the server would set a cookie, and only for a request from its own pages.
      guard body!["client"]?.string == "app" else { return try fail(403, "cross_site") }
      guard let idToken = body!["idToken"]?.string, let nonce = body!["nonce"]?.string else { return try fail(400, "bad_request") }
      guard nonces.remove(nonce) != nil else { return try fail(401, "bad_nonce") }
      let parts = idToken.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
      guard parts.count == 2, !parts[0].isEmpty else { return try fail(401, "bad_token") }
      guard parts[1] == nonce || parts[1] == sha256Hex(nonce) else { return try fail(401, "bad_nonce") }
      let s = parts[0]
      // Signing in ends the session this phone had.
      if let bearer { tokens[bearer] = nil }
      if accounts[s] == nil { accounts[s] = Account(id: UUID().uuidString.lowercased()) }
      issued += 1
      let token = "token-\(issued)-" + String(repeating: "x", count: 24)
      tokens[token] = s
      return try reply(200, ["user": user(accounts[s]!, s), "token": .string(token)])
    case ("POST", "/api/v1/tanks/sync"):
      guard let s = sub else { return try fail(401, "signed_out") }
      if busy > 0 { busy -= 1; return try fail(409, "busy") }
      guard let sent = body!["store"]?.object, case .number(1) = sent["v"], let tanks = sent["tanks"]?.array, let devices = sent["devices"]?.array else { return try fail(400, "bad_store") }
      let at = Timestamp.string(now())
      var refused: [JSON] = []
      func take(_ list: [JSON], _ kind: String) -> [JSON] {
        list.compactMap { v in
          guard var o = v.object else { return nil }
          if let id = o["id"]?.string, refuse.contains(id) {
            refused.append(.object(["kind": .string(kind), "id": .string(id), "issues": .array([])]))
            return nil
          }
          // The server's clampFuture.
          if let u = o["updatedAt"]?.string, u > at { o["updatedAt"] = .string(at) }
          if let d = o["deletedAt"]?.string, d > at { o["deletedAt"] = .string(at) }
          if let c = o["createdAt"]?.string, let u = o["updatedAt"]?.string, c > u { o["createdAt"] = .string(u) }
          return .object(o)
        }
      }
      let incoming = try TankStore(.object(["v": .number(1), "tanks": .array(take(tanks, "tank")), "devices": .array(take(devices, "device"))]))
      accounts[s]!.store = TankStore.merge(kept: accounts[s]!.store, incoming: incoming)
      return try reply(200, ["store": accounts[s]!.store.value, "refused": .array(refused), "serverTime": .string(at)])
    case ("POST", "/api/v1/auth/logout"):
      if let bearer { tokens[bearer] = nil }
      return try reply(204)
    case ("DELETE", "/api/v1/account"):
      guard let s = sub else { return try fail(401, "signed_out") }
      // Apple's rule: a fresh Sign in with Apple of this account first, so its tokens can be revoked.
      guard let apple = body?["apple"]?.object, let code = apple["code"]?.string, let clientId = apple["clientId"]?.string else { return try fail(409, "apple_reauth") }
      guard Self.appleClientIds.contains(clientId) else { return try fail(400, "bad_request") }
      guard code.hasPrefix("good-") else { return try fail(502, "apple_revoke_failed") }
      guard code == "good-\(s)" else { return try fail(409, "apple_other_account") }
      accounts[s] = nil
      endSessions(of: s)
      return try reply(204)
    default:
      return try fail(404, "not_found")
    }
  }

  private func user(_ a: Account, _ sub: String) -> JSON {
    .object([
      "id": .string(a.id), "createdAt": .string("2026-11-01T00:00:00.000Z"),
      "methods": .array([.object(["id": .string("m-\(sub)"), "kind": .string("apple"), "createdAt": .string("2026-11-01T00:00:00.000Z"), "lastUsedAt": .null])]),
    ])
  }
}
#endif
