import Foundation
import Tanks

/// The accounts server, in process, for tests and the simulator's UI tests: the paths `AccountsClient` uses, answered
/// as protocols/accounts.openapi.json says. Sign in with Apple's identity token is `<sub>|<nonce or its SHA-256>`, and
/// a fresh Apple authorization code is `good-<sub>`. Every account's tanks are merged as the server merges them.
@MainActor
public final class FakeAccounts {
  public var accountsOn = true
  /// No network: every request fails as URLSession does.
  public var offline = false
  /// The next syncs answer 409 busy (another sync of the account in progress).
  public var busy = 0
  /// Every request received, in order.
  public private(set) var requests: [URLRequest] = []

  struct Account { let id: String; let sub: String; var store = TankStore() }
  private var accounts: [String: Account] = [:] // by Apple sub
  private var tokens: [String: String] = [:] // token → Apple sub
  private var nonces: Set<String> = []
  private var issued = 0

  public init() {}

  /// The tanks an account holds, by the Apple user it signs in with.
  public func store(of sub: String) -> TankStore? { accounts[sub]?.store }
  public var accountCount: Int { accounts.count }
  /// Ends every session of an account, as signing out elsewhere or deleting it there would.
  public func endSessions(of sub: String) { tokens = tokens.filter { $0.value != sub } }

  public func send(_ r: URLRequest) async throws -> (Data, HTTPURLResponse) {
    requests.append(r)
    if offline { throw URLError(.notConnectedToInternet) }
    let body = r.httpBody.flatMap { try? JSON.parse($0).object } ?? [:]
    let bearer = r.value(forHTTPHeaderField: "Authorization").map { String($0.dropFirst("Bearer ".count)) }
    let sub = bearer.flatMap { tokens[$0] }
    let path = r.url?.path ?? ""
    func reply(_ status: Int, _ o: [String: JSON]? = nil) throws -> (Data, HTTPURLResponse) {
      (try o.map { try JSON.object($0).data() } ?? Data(), HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
    }
    let fail = { (status: Int, code: String) in try reply(status, ["error": .string(code)]) }
    if !accountsOn { return path == "/api/v1/session" ? try reply(200, ["accounts": .bool(false)]) : try fail(404, "accounts_off") }

    switch (r.httpMethod ?? "GET", path) {
    case ("GET", "/api/v1/session"):
      return try reply(200, [
        "accounts": .bool(true),
        "providers": .object(["google": .null, "apple": .object(["clientId": .string("com.aquatome.web")]), "email": .bool(true), "passkey": .bool(false)]),
        "turnstileSitekey": .string("sk"),
        "user": sub.flatMap { accounts[$0] }.map(user) ?? .null,
      ])
    case ("POST", "/api/v1/auth/nonce"):
      issued += 1
      let n = "nonce-\(issued)"
      nonces.insert(n)
      return try reply(200, ["nonce": .string(n)])
    case ("POST", "/api/v1/auth/apple"):
      // The app's sessions carry a token (`client: "app"`); this stand-in has no cookies to give.
      guard body["client"]?.string == "app", let idToken = body["idToken"]?.string, let nonce = body["nonce"]?.string else { return try fail(400, "bad_request") }
      guard nonces.remove(nonce) != nil else { return try fail(401, "bad_nonce") }
      let parts = idToken.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
      guard parts.count == 2, !parts[0].isEmpty else { return try fail(401, "bad_token") }
      guard parts[1] == nonce || parts[1] == sha256Hex(nonce) else { return try fail(401, "bad_nonce") }
      let s = parts[0]
      if accounts[s] == nil { accounts[s] = Account(id: UUID().uuidString.lowercased(), sub: s) }
      issued += 1
      let token = "token-\(issued)"
      tokens[token] = s
      return try reply(200, ["user": user(accounts[s]!), "token": .string(token)])
    case ("POST", "/api/v1/tanks/sync"):
      guard let s = sub else { return try fail(401, "signed_out") }
      if busy > 0 { busy -= 1; return try fail(409, "busy") }
      guard let sent = body["store"], let incoming = try? TankStore(sent) else { return try fail(400, "bad_request") }
      accounts[s]!.store = TankStore.merge(kept: accounts[s]!.store, incoming: incoming)
      return try reply(200, ["store": accounts[s]!.store.value, "refused": .array([]), "serverTime": .string("2026-11-01T00:00:00.000Z")])
    case ("POST", "/api/v1/auth/logout"):
      if let bearer { tokens[bearer] = nil }
      return try reply(204)
    case ("DELETE", "/api/v1/account"):
      guard let s = sub else { return try fail(401, "signed_out") }
      // Apple's rule: a fresh Sign in with Apple of this account first, so its tokens can be revoked.
      guard body["apple"]?.object?["code"]?.string == "good-\(s)" else { return try fail(409, "apple_reauth") }
      accounts[s] = nil
      endSessions(of: s)
      return try reply(204)
    default:
      return try fail(404, "not_found")
    }
  }

  private func user(_ a: Account) -> JSON {
    .object([
      "id": .string(a.id), "createdAt": .string("2026-11-01T00:00:00.000Z"),
      "methods": .array([.object(["id": .string("m-\(a.sub)"), "kind": .string("apple"), "createdAt": .string("2026-11-01T00:00:00.000Z"), "lastUsedAt": .null])]),
    ])
  }
}
