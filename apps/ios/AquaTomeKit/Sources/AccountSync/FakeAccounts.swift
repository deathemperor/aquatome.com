#if DEBUG
// Tests and the simulator only: not in a release build.
import Foundation
import Tanks

/// The accounts server, in process, for tests and the simulator's UI tests: the paths `AccountsClient` uses, answered
/// as apps/site/worker/accounts does (protocols/accounts.openapi.json). Sign in with Apple's identity token is
/// `<sub>|<nonce or its SHA-256>`, and a fresh Apple authorization code for an Apple user is `good-<sub>`. An email
/// sign-in takes any Turnstile token once, and its code is always `emailCode`; that account is kept under
/// `email:<address>`. A passkey (`addPasskey`, as one added on aquatome.com) signs in with an answer from `assertion`,
/// checked as the server checks one, short of the signature. Records are merged as the server merges them, a time ahead of `now` set to `now` first.
@MainActor
public final class FakeAccounts {
  public var accountsOn = true
  public var passkeysOn = true
  /// No network: every request fails as URLSession does.
  public var offline = false
  /// The next syncs answer 409 busy (another sync of the account in progress).
  public var busy = 0
  /// Records (by id) the server refuses, as it does one that doesn't validate.
  public var refuse: Set<String> = []
  /// The code every email sign-in is sent.
  public static let emailCode = "123456"
  /// The mails sent: the address each code went to (lowercased, as the server sends it).
  public private(set) var mailed: [String] = []
  public var now: () -> Date = Date.init
  /// Every request received, in order.
  public private(set) var requests: [URLRequest] = []

  struct Account { let id: String; var kind = "apple"; var store = TankStore() }
  private var accounts: [String: Account] = [:] // by Apple sub, or `email:<address>`
  private var tokens: [String: String] = [:] // token → its account's key
  private var nonces: Set<String> = []
  private var turnstiles: Set<String> = [] // used once each
  private var flows: [String: (key: String, tries: Int)] = [:]
  private var passkeys: [String: String] = [:] // credential id (base64url) → its account's key
  private var challenges: Set<String> = [] // passkey challenges (base64url), used once each
  private var issued = 0
  static let appleClientIds = ["com.aquatome.web", "com.aquatome.app"]

  public init() {}

  /// The accounts, their tanks and sessions as JSON, so the stand-in keeps them across launches of the app (UI tests:
  /// a second phone signs in to the account the first one made).
  public var snapshot: JSON {
    .object([
      "accounts": .object(accounts.mapValues { .object(["id": .string($0.id), "kind": .string($0.kind), "store": $0.store.value]) }),
      "tokens": .object(tokens.mapValues(JSON.string)),
      "passkeys": .object(passkeys.mapValues(JSON.string)),
      "issued": .number(Double(issued)),
    ])
  }

  public convenience init(snapshot: JSON) {
    self.init()
    let o = snapshot.object ?? [:]
    for (sub, a) in o["accounts"]?.object ?? [:] {
      guard let id = a.object?["id"]?.string, let store = a.object?["store"].flatMap({ try? TankStore($0) }) else { continue }
      accounts[sub] = Account(id: id, kind: a.object?["kind"]?.string ?? "apple", store: store)
    }
    for (token, sub) in o["tokens"]?.object ?? [:] { if let sub = sub.string, accounts[sub] != nil { tokens[token] = sub } }
    for (id, sub) in o["passkeys"]?.object ?? [:] { if let sub = sub.string, accounts[sub] != nil { passkeys[id] = sub } }
    issued = o["issued"]?.int ?? 0
  }

  /// The tanks an account holds, by the Apple user it signs in with (`email:<address>` for an email one).
  public func store(of sub: String) -> TankStore? { accounts[sub]?.store }
  public var accountCount: Int { accounts.count }
  public var sessionCount: Int { tokens.count }
  /// A passkey added to the account kept under `key` (made if there is none, as on aquatome.com), as "Thêm passkey" there
  /// does. The answer is its user handle: the account's id.
  @discardableResult
  public func addPasskey(_ credentialId: Data, to key: String) -> Data {
    if accounts[key] == nil { accounts[key] = Account(id: UUID().uuidString.lowercased(), kind: key.hasPrefix("email:") ? "email" : "apple") }
    passkeys[Base64URL.encode(credentialId)] = key
    return Data(accounts[key]!.id.utf8)
  }

  /// The answer a phone's passkey gives a challenge: client data as iOS writes it (`webauthn.get`, the challenge, the
  /// origin https://<rpId>), and stand-in authenticator data and signature.
  public static func assertion(for c: PasskeyChallenge, credentialId: Data, userHandle: Data?, origin: String? = nil) -> PasskeyAssertion {
    let client: JSON = .object(["type": .string("webauthn.get"), "challenge": .string(Base64URL.encode(c.challenge)), "origin": .string(origin ?? "https://\(c.rpId)")])
    return PasskeyAssertion(credentialId: credentialId, clientDataJSON: (try? client.data()) ?? Data(), authenticatorData: Data(repeating: 1, count: 37), signature: Data("signed".utf8), userHandle: userHandle)
  }

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
        "providers": .object(["google": .null, "apple": .object(["clientId": .string("com.aquatome.web")]), "email": .bool(true), "passkey": .bool(passkeysOn)]),
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
      return try reply(200, signedIn(parts[0], "apple", bearer: bearer))
    case ("POST", "/api/v1/auth/email/start"):
      let email = body!["email"]?.string?.trimmingCharacters(in: .whitespaces).lowercased() ?? ""
      guard email.contains("@"), !email.hasPrefix("@"), !email.hasSuffix("@") else { return try fail(400, "bad_email") }
      // Each Turnstile token passes once, as Cloudflare's do.
      guard let t = body!["turnstile"]?.string, !t.isEmpty, turnstiles.insert(t).inserted else { return try fail(403, "turnstile") }
      issued += 1
      let flow = "flow-\(issued)"
      flows[flow] = ("email:" + email, 0)
      mailed.append(email)
      return try reply(200, ["flow": .string(flow)])
    case ("POST", "/api/v1/auth/email/verify"):
      guard let flow = body!["flow"]?.string, let code = body!["code"]?.string else { return try fail(400, "bad_request") }
      guard let f = flows[flow] else { return try fail(401, "bad_code") }
      // Five wrong codes and the flow is gone; a right one is used once.
      guard code == Self.emailCode else {
        flows[flow] = f.tries >= 4 ? nil : (f.key, f.tries + 1)
        return try fail(401, "bad_code")
      }
      flows[flow] = nil
      guard body!["client"]?.string == "app" else { return try fail(403, "cross_site") }
      return try reply(200, signedIn(f.key, "email", bearer: bearer))
    case ("POST", "/api/v1/auth/passkey/options"):
      guard passkeysOn else { return try fail(503, "provider_off") }
      issued += 1
      let c = Base64URL.encode(Data("challenge-\(issued)".utf8))
      challenges.insert(c)
      return try reply(200, ["challenge": .string(c), "rpId": .string("aquatome.com"), "allowCredentials": .array([]), "userVerification": .string("required"), "timeout": .number(300_000)])
    case ("POST", "/api/v1/auth/passkey"):
      guard passkeysOn else { return try fail(503, "provider_off") }
      guard body!["client"]?.string == "app" else { return try fail(403, "cross_site") }
      // As SimpleWebAuthn reads an answer: id and rawId the same base64url, its client data for one of our challenges
      // (used once), from https://aquatome.com, a passkey an account has, made for that account.
      guard let a = body!["response"]?.object, let id = a["id"]?.string, a["rawId"]?.string == id, a["type"]?.string == "public-key",
            let r = a["response"]?.object, let cd = r["clientDataJSON"]?.string.flatMap(Base64URL.decode), let client = (try? JSON.parse(cd))?.object,
            r["authenticatorData"]?.string?.isEmpty == false, r["signature"]?.string?.isEmpty == false
      else { return try fail(401, "bad_passkey") }
      guard client["type"]?.string == "webauthn.get", let c = client["challenge"]?.string, challenges.remove(c) != nil,
            client["origin"]?.string == "https://aquatome.com", let key = passkeys[id], let account = accounts[key]
      else { return try fail(401, "bad_passkey") }
      if let handle = r["userHandle"]?.string, handle != Base64URL.encode(Data(account.id.utf8)) { return try fail(401, "bad_passkey") }
      return try reply(200, signedIn(key, account.kind, bearer: bearer))
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
      if accounts[s]?.kind == "apple" {
        guard let apple = body?["apple"]?.object, let code = apple["code"]?.string, let clientId = apple["clientId"]?.string else { return try fail(409, "apple_reauth") }
        guard Self.appleClientIds.contains(clientId) else { return try fail(400, "bad_request") }
        guard code.hasPrefix("good-") else { return try fail(502, "apple_revoke_failed") }
        guard code == "good-\(s)" else { return try fail(409, "apple_other_account") }
      }
      accounts[s] = nil
      passkeys = passkeys.filter { $0.value != s }
      endSessions(of: s)
      return try reply(204)
    default:
      return try fail(404, "not_found")
    }
  }

  /// Signed in to the account kept under `key` (made on first use), with a new session; the session this phone had ends.
  private func signedIn(_ key: String, _ kind: String, bearer: String?) -> [String: JSON] {
    if let bearer { tokens[bearer] = nil }
    if accounts[key] == nil { accounts[key] = Account(id: UUID().uuidString.lowercased(), kind: kind) }
    issued += 1
    let token = "token-\(issued)-" + String(repeating: "x", count: 24)
    tokens[token] = key
    return ["user": user(accounts[key]!, key), "token": .string(token)]
  }

  private func user(_ a: Account, _ key: String) -> JSON {
    .object([
      "id": .string(a.id), "createdAt": .string("2026-11-01T00:00:00.000Z"),
      "methods": .array([.object(["id": .string("m-\(key)"), "kind": .string(a.kind), "createdAt": .string("2026-11-01T00:00:00.000Z"), "lastUsedAt": .null])]
        + passkeys.filter { $0.value == key }.keys.sorted().map { .object(["id": .string("pk-\($0)"), "kind": .string("passkey"), "createdAt": .string("2026-11-01T00:00:00.000Z"), "lastUsedAt": .null]) }),
    ])
  }
}
#endif
