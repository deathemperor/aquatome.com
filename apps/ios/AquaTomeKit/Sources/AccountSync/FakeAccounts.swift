#if DEBUG
// Tests and the simulator only: not in a release build.
import CryptoKit
import Foundation
import ImageIO
import Tanks

/// The accounts server, in process, for tests and the simulator's UI tests: the paths `AccountsClient` uses, answered
/// as apps/site/worker/accounts does (protocols/accounts.openapi.json). Sign in with Apple's identity token is
/// `<sub>|<nonce or its SHA-256>`, and a fresh Apple authorization code for an Apple user is `good-<sub>`. Google's ID
/// token reads the same (`FakeGoogle` gives one), and that account is kept under `google:<sub>`. An email
/// sign-in takes any Turnstile token once, and its code is always `emailCode`; that account is kept under
/// `email:<address>`. A passkey (`addPasskey`, as one added on aquatome.com) signs in with an answer from `assertion`,
/// checked as the server checks one, short of the signature; one made with `newPasskey` is added within 10 minutes of a
/// sign-in, as the server allows (a session kept from before a relaunch counts as signed in long ago). Records are merged as the server merges them, a time ahead of `now` set to `now` first.
@MainActor
public final class FakeAccounts {
  public var accountsOn = true
  public var passkeysOn = true
  /// Google sign-in offered (the server has GOOGLE_CLIENT_IDS).
  public var googleOn = true
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
  /// The names counted as wanted (POST /api/v1/wanted), each body as it came, in order.
  public private(set) var wanted: [[String: JSON]] = []
  /// Readers' comments (`/_c`) and photos (`/_p`) posted from the app, each with its fields and its account.
  public private(set) var posts: [(path: String, account: String, fields: [String: String])] = []
  /// The comments and photos public on the site, as `comment:<id>` or `photo:<id>`: what POST /api/v1/report takes. A
  /// comment posted and shown at once joins them.
  public var reportable: Set<String> = []
  /// The reports taken, in order: who sent each (an account, or nil from the page's way) and what they said.
  public private(set) var reports: [(account: String?, kind: String, id: String, reason: String?)] = []
  /// The owner's dashboard, when this server has one (FakeOwner): its paths, and the photos it shows.
  public var owner: FakeOwner?
  /// The fish-ID tool (`/api/fish-id`, protocols/fishid.openapi.json): on, every key resting, an account's identifications
  /// a day, how many each account had made today before these, and how many the site has left today (none: busy).
  public var fishIdOn = true
  public var fishIdResting = false
  public var fishIdPerAccount = 10
  public var fishIdUsedBefore = 0
  public var fishIdSiteLeft = 300
  /// The identifications answered: who sent each (an account, or nil from the page's way), the form's fields (the
  /// file as its width × height), and its user agent.
  public private(set) var identifications: [(account: String?, fields: [String: String], userAgent: String?)] = []
  /// The answer an identification gets, given the photo's width × height ("1024×768"): `fishIdGuesses` unless set.
  public var fishIdAnswer: (_ photo: String) -> [String: JSON] = FakeAccounts.fishIdGuesses(photo:)

  struct Account { let id: String; var kind = "apple"; var store = TankStore() }
  private var accounts: [String: Account] = [:] // by Apple sub, `google:<sub>` or `email:<address>`
  private var tokens: [String: String] = [:] // token → its account's key
  private var nonces: Set<String> = []
  private var turnstiles: Set<String> = [] // used once each
  private var flows: [String: (key: String, tries: Int)] = [:]
  private var passkeys: [String: String] = [:] // credential id (base64url) → its account's key
  private var challenges: Set<String> = [] // passkey challenges (base64url), used once each
  private var creations: [String: String] = [:] // challenges to add a passkey (base64url) → the account's key, used once each
  private var signedAt: [String: Date] = [:] // token → when it signed in (none: before a relaunch)
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

  /// The passkey a phone makes for a challenge to add one: client data as iOS writes it (`webauthn.create`, the
  /// challenge, the origin https://<rpId>), and a stand-in attestation.
  public static func newPasskey(for c: NewPasskeyChallenge, credentialId: Data, origin: String? = nil) -> NewPasskey {
    let client: JSON = .object(["type": .string("webauthn.create"), "challenge": .string(Base64URL.encode(c.challenge)), "origin": .string(origin ?? "https://\(c.rpId)")])
    return NewPasskey(credentialId: credentialId, clientDataJSON: (try? client.data()) ?? Data(), attestationObject: Data(repeating: 2, count: 64))
  }

  /// Ends every session of an account, as signing out elsewhere or deleting it there would.
  public func endSessions(of sub: String) { tokens = tokens.filter { $0.value != sub } }

  /// A multipart form's parts, by name: each one's bytes, and its filename when it's a file.
  static func parts(_ r: URLRequest) -> [String: (filename: String?, data: Data)] {
    guard let boundary = r.value(forHTTPHeaderField: "Content-Type")?.firstMatch(of: /multipart\/form-data; boundary=(.+)/)?.1,
          let body = r.httpBody else { return [:] }
    var out: [String: (filename: String?, data: Data)] = [:]
    for part in body.split(separator: Data("--\(boundary)".utf8)) {
      guard let head = part.range(of: Data("\r\n\r\n".utf8)) else { continue }
      let h = String(decoding: part[..<head.lowerBound], as: UTF8.self)
      guard let name = h.firstMatch(of: /; name="([^"]+)"/)?.1 else { continue }
      out[String(name)] = (h.firstMatch(of: /; filename="([^"]*)"/).map { String($0.1) }, Data(part[head.upperBound...].dropLast(2)))
    }
    return out
  }

  /// An account's posts' `author`, as the Worker writes it: 16 hex characters from the account, the same for each post.
  public static func author(account: String) -> String {
    SHA256.hash(data: Data("fake-key|account:\(account)".utf8)).prefix(8).map { String(format: "%02x", $0) }.joined()
  }

  /// An image by its first bytes, as the Worker tells one (JPEG, PNG, WebP).
  static func isImage(_ data: Data) -> Bool {
    let b = [UInt8](data.prefix(12))
    return b.starts(with: [0xFF, 0xD8, 0xFF]) || b.starts(with: [0x89, 0x50, 0x4E, 0x47])
      || (b.count == 12 && b[0..<4].elementsEqual("RIFF".utf8) && b[8..<12].elementsEqual("WEBP".utf8))
  }

  /// The stand-in's identification, as the Worker writes one: a neon tetra, whose page the UI tests' handbook has, then
  /// a green neon it has none for, with the neon as its genus's page. The first reason names the photo it got, so a flow
  /// can tell a fish boxed from the whole photo.
  nonisolated public static func fishIdGuesses(photo: String) -> [String: JSON] {
    let neon: JSON = .object(["id": .string("paracheirodon-innesi"), "kind": .string("species"), "name": .string("Cá neon"),
                              "sci": .string("Paracheirodon innesi"), "url": .string("/vi/ca/ca-neon/"), "img": .string("https://media.aquatome.com/a/neon.webp")])
    return [
      "verdict": .string("fish"), "model": .string("stand-in"),
      "results": .array([
        .object(["scientificName": .string("Paracheirodon innesi"), "commonName": .string("Neon tetra"), "variety": .null, "confidence": .number(0.86),
                 "reason": .string("Sọc xanh ánh kim dọc thân, nửa sau thân đỏ. Ảnh nhận được: \(photo)."), "page": neon]),
        .object(["scientificName": .string("Paracheirodon simulans"), "commonName": .string("Green neon tetra"), "variety": .null, "confidence": .number(0.35),
                 "reason": .string("Sọc xanh chạy tới tận đuôi."), "sameGenus": .array([neon])]),
      ]),
    ]
  }

  public func send(_ r: URLRequest) async throws -> (Data, HTTPURLResponse) {
    requests.append(r)
    if offline { throw URLError(.notConnectedToInternet) }
    let method = r.httpMethod ?? "GET", path = r.url?.path ?? ""
    let isJSON = r.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("application/json") == true
    // As the server reads a body: JSON, an object, else none.
    let body = isJSON ? r.httpBody.flatMap { try? JSON.parse($0).object } : nil
    let bearer = r.value(forHTTPHeaderField: "Authorization").map { String($0.dropFirst("Bearer ".count)) }
    let sub = bearer.flatMap { tokens[$0] }
    if let (status, data, type) = try owner?.answer(r, account: sub, endSessions: endSessions) {
      return (data, HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": type, "Cache-Control": "no-store"])!)
    }
    func reply(_ status: Int, _ o: [String: JSON]? = nil) throws -> (Data, HTTPURLResponse) {
      (try o.map { try JSON.object($0).data() } ?? Data(), HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
    }
    let fail = { (status: Int, code: String) in try reply(status, ["error": .string(code)]) }
    // Readers' demand (Wanted): no sign-in, accounts on or off; read as apps/site/worker/wanted.ts reads it.
    if path == "/api/v1/wanted" {
      guard method == "POST" else { return try fail(405, "method") }
      guard isJSON else { return try fail(415, "json") }
      guard let b = r.httpBody.flatMap({ try? JSON.parse($0).object }), let kind = b["kind"]?.string, Known.unlistedKind.contains(kind),
            b["name"]?.string?.isEmpty == false else { return try fail(400, "bad_name") }
      wanted.append(b)
      return try reply(204)
    }
    // A reader's report (POST /api/v1/report), signed in or not, accounts on or off, read as the Worker reads it
    // (protocols/talk.openapi.json): a bearer gone, 401; no bearer and another site's Origin, 403; 20 a day per address and
    // per account; the same reporter reporting the same item again, received and nothing more.
    if path == "/api/v1/report" {
      guard method == "POST" else { return try fail(405, "method") }
      if let bearer, tokens[bearer] == nil || !accountsOn { return try fail(401, "session") }
      if bearer == nil, let origin = r.value(forHTTPHeaderField: "Origin"), origin != "https://aquatome.com" { return try fail(403, "cross-origin") }
      guard let b = body, let kind = b["kind"]?.string, ["comment", "photo"].contains(kind), let id = b["id"]?.string, !id.isEmpty,
            Set(b.keys).isSubset(of: ["kind", "id", "reason"]), b["reason"] == nil || (b["reason"]?.string).map({ $0.utf16.count <= 500 }) == true
      else { return try fail(400, "bad report") }
      guard reportable.contains("\(kind):\(id)") else { return try fail(404, "not found") }
      if reports.contains(where: { $0.account == sub && $0.kind == kind && $0.id == id }) { return try reply(202, ["status": .string("received")]) }
      if reports.count >= 20 || (sub != nil && reports.filter({ $0.account == sub }).count >= 20) { return try fail(429, "rate") }
      reports.append((sub, kind, id, b["reason"]?.string))
      return try reply(202, ["status": .string("received")])
    }
    // Readers' comments and photos posted as the account, checked as apps/site/worker/comments/api.ts and photos.ts check
    // them, in their order (protocols/talk.openapi.json). No Authorization header is the website, and from the app a
    // cross-origin post; a session gone, 401 `session`. 5 of each a day per account: a comment past that held, a photo
    // refused. Of the Worker's rules, the word lists are left out.
    if path == "/_c" || path == "/_p" {
      guard method == "POST" else { return try fail(405, "method") }
      guard let bearer else { return try fail(403, "cross-origin") }
      guard let sub = tokens[bearer], accountsOn, r.value(forHTTPHeaderField: "Cookie") == nil else { return try fail(401, "session") }
      let earlier = posts.filter { $0.path == path && $0.account == sub }
      // As JavaScript trims and counts (UTF-16 units); a name or comment with "<" or more than one link is held.
      let trim = { (s: String) in s.trimmingCharacters(in: .whitespacesAndNewlines) }
      let held = { (s: String) in s.contains("<") || s.matches(of: /(?i)https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(com|net|vn|id|th|io|xyz|top|shop)\b\S*/).count > 1 }
      if path == "/_c" {
        guard (r.httpBody?.count ?? 0) <= 8192 else { return try fail(413, "too large") }
        let f = (body ?? [:]).compactMapValues(\.string)
        guard let e = f["e"], e.wholeMatch(of: /(?:(?:id|th):)?(species|breed|plant|guide):[A-Za-z0-9_-]{1,140}/) != nil else { return try fail(400, "bad entity") }
        let name = trim(f["name"] ?? ""), text = trim(f["body"] ?? "")
        guard (1...40).contains(name.utf16.count) else { return try fail(400, "name must be 1–40 characters") }
        guard (2...2000).contains(text.utf16.count) else { return try fail(400, "comment must be 2–2000 characters") }
        let duplicate = posts.contains { $0.path == path && $0.fields["e"] == e && trim($0.fields["body"] ?? "") == text }
        posts.append((path, sub, f))
        if earlier.count >= 5 || held("\(name)\n\(text)") || duplicate { return try reply(201, ["status": .string("held")]) }
        let id = UUID().uuidString
        reportable.insert("comment:\(id)")
        let comment: [String: JSON] = ["id": .string(id), "name": .string(name), "body": .string(text), "helpful": .bool(false),
                                       "createdAt": .string(ISO8601DateFormatter().string(from: now())), "author": .string(Self.author(account: sub))]
        return try reply(201, ["status": .string("approved"), "comment": .object(comment)])
      }
      let maxBytes = 8 << 20
      guard (r.httpBody?.count ?? 0) <= maxBytes + 64 * 1024 else { return try fail(413, "too large") }
      let parts = Self.parts(r)
      guard !parts.isEmpty else { return try fail(400, "bad form") }
      let text = { (k: String) in parts[k].map { String(decoding: $0.data, as: UTF8.self) } ?? "" }
      guard text("e").wholeMatch(of: /(species|breed):[a-z0-9-]{1,140}/) != nil else { return try fail(400, "bad entity") }
      let name = trim(text("name"))
      guard (1...40).contains(name.utf16.count), !held(name) else { return try fail(400, "bad name") }
      guard text("consent") == "1" else { return try fail(400, "consent") }
      // A file only as a part with a filename; an image only by its first bytes (JPEG, PNG, WebP).
      guard let file = parts["file"], file.filename != nil, !file.data.isEmpty else { return try fail(400, "no file") }
      guard file.data.count <= maxBytes else { return try fail(413, "too large") }
      guard Self.isImage(file.data) else { return try fail(415, "not an image") }
      if earlier.count >= 5 { return try fail(429, "rate") }
      var fields = parts.filter { $0.value.filename == nil }.mapValues { String(decoding: $0.data, as: UTF8.self) }
      fields["file"] = "\(file.data.count) bytes"
      posts.append((path, sub, fields))
      return try reply(201, ["status": .string("pending"), "id": .string("p\(posts.count)"), "deleteUrl": .string("/_p/xoa/?id=p\(posts.count)&t=x")])
    }
    // The fish-ID tool, read as apps/site/worker/fishid/api.ts reads it, in its order (protocols/fishid.openapi.json). The
    // app's way is a bearer, counted per account; the page's (no Authorization header) is a same-origin request with a
    // Turnstile token, any one here. Claude is stood in for by `fishIdAnswer`.
    if path == "/api/fish-id" {
      if method == "GET" {
        return try reply(200, fishIdOn ? ["on": .bool(true), "sitekey": .string("sk"), "resting": .bool(fishIdResting), "perIp": .number(10),
                                          "perAccount": .number(Double(fishIdPerAccount))] : ["on": .bool(false)])
      }
      guard method == "POST" else { return try reply(405) }
      guard fishIdOn else { return try fail(503, "fish_id_off") }
      // A bearer gone is refused, never taken the page's way.
      if bearer != nil, sub == nil || !accountsOn { return try fail(401, "session") }
      if sub == nil, let origin = r.value(forHTTPHeaderField: "Origin"), origin != "https://aquatome.com" { return try fail(403, "cross-origin") }
      let maxImage = 1_572_864
      guard (r.httpBody?.count ?? 0) <= maxImage * 4 / 3 + 16 * 1024 else { return try fail(413, "too large") }
      var fields: [String: String], photo: Data?
      if r.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("multipart/form-data") == true {
        let parts = Self.parts(r)
        guard !parts.isEmpty else { return try fail(400, "bad form") }
        fields = parts.filter { $0.value.filename == nil }.mapValues { String(decoding: $0.data, as: UTF8.self) }
        // A file only as a part with a filename, as the Worker's form reader gives one.
        photo = parts["file"].flatMap { $0.filename == nil ? nil : $0.data }
      } else if let body {
        fields = body.compactMapValues(\.string).filter { $0.key != "image" }
        photo = body["image"]?.string.flatMap { Data(base64Encoded: $0.replacing(/^data:[^,]*,/, with: "")) }
      } else {
        return try fail(400, "bad form")
      }
      guard let photo, !photo.isEmpty else { return try fail(400, "no file") }
      guard photo.count <= maxImage else { return try fail(413, "too large") }
      guard Self.isImage(photo) else { return try fail(415, "not an image") }
      if sub == nil && (fields["token"] ?? "").isEmpty { return try fail(403, "turnstile") }
      let limit = sub == nil ? 10 : fishIdPerAccount
      let used = (sub == nil ? 0 : fishIdUsedBefore) + identifications.filter { $0.account == sub }.count
      if used >= limit { return try reply(429, ["error": .string("rate"), "limit": .number(Double(limit))]) }
      if fishIdSiteLeft <= 0 { return try fail(429, "busy") }
      if fishIdResting { return try fail(503, "resting") }
      fishIdSiteLeft -= 1
      let p = CGImageSourceCreateWithData(photo as CFData, nil).flatMap { CGImageSourceCopyPropertiesAtIndex($0, 0, nil) } as? [CFString: Any]
      fields["file"] = "\(p?[kCGImagePropertyPixelWidth] as? Int ?? 0)×\(p?[kCGImagePropertyPixelHeight] as? Int ?? 0)"
      identifications.append((sub, fields, r.value(forHTTPHeaderField: "User-Agent")))
      return try reply(200, fishIdAnswer(fields["file"]!))
    }
    if !accountsOn { return path == "/api/v1/session" ? try reply(200, ["accounts": .bool(false)]) : try fail(404, "accounts_off") }
    if method == "POST" && body == nil { return try fail(400, "bad_request") }

    switch (method, path) {
    case ("GET", "/api/v1/session"):
      return try reply(200, [
        "accounts": .bool(true),
        "providers": .object(["google": googleOn ? .object(["clientId": .string("web.apps.googleusercontent.com")]) : .null, "apple": .object(["clientId": .string("com.aquatome.web")]), "email": .bool(true), "passkey": .bool(passkeysOn)]),
        "turnstileSitekey": .string("sk"),
        "user": sub.flatMap { accounts[$0] }.map { user($0, sub!) } ?? .null,
      ])
    case ("POST", "/api/v1/auth/nonce"):
      issued += 1
      let n = "nonce-\(issued)"
      nonces.insert(n)
      return try reply(200, ["nonce": .string(n)])
    case ("POST", "/api/v1/auth/apple"), ("POST", "/api/v1/auth/google"):
      // Without `client: "app"` the server would set a cookie, and only for a request from its own pages.
      guard body!["client"]?.string == "app" else { return try fail(403, "cross_site") }
      let google = path.hasSuffix("/google")
      if google && !googleOn { return try fail(503, "provider_off") }
      guard let idToken = body!["idToken"]?.string, let nonce = body!["nonce"]?.string else { return try fail(400, "bad_request") }
      guard nonces.remove(nonce) != nil else { return try fail(401, "bad_nonce") }
      let parts = idToken.split(separator: "|", omittingEmptySubsequences: false).map(String.init)
      guard parts.count == 2, !parts[0].isEmpty else { return try fail(401, "bad_token") }
      guard parts[1] == nonce || parts[1] == sha256Hex(nonce) else { return try fail(401, "bad_nonce") }
      return try reply(200, google ? signedIn("google:" + parts[0], "google", bearer: bearer) : signedIn(parts[0], "apple", bearer: bearer))
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
    case ("POST", "/api/v1/account/passkey/options"), ("POST", "/api/v1/account/passkey"):
      guard let s = sub else { return try fail(401, "signed_out") }
      guard passkeysOn else { return try fail(503, "provider_off") }
      guard let at = signedAt[bearer!], now().timeIntervalSince(at) <= 600 else { return try fail(403, "reauth_needed") }
      let account = accounts[s]!
      if path.hasSuffix("/options") {
        issued += 1
        let c = Base64URL.encode(Data("create-\(issued)".utf8))
        creations[c] = s
        return try reply(200, [
          "challenge": .string(c), "rp": .object(["name": .string("AquaTome"), "id": .string("aquatome.com")]),
          "user": .object(["id": .string(Base64URL.encode(Data(account.id.utf8))), "name": .string("AquaTome \(account.id.prefix(8))"), "displayName": .string("AquaTome")]),
          "excludeCredentials": .array(passkeys.filter { $0.value == s }.keys.sorted().map { .object(["id": .string($0), "type": .string("public-key")]) }),
          "attestation": .string("none"), "timeout": .number(300_000),
        ])
      }
      // As SimpleWebAuthn reads a new passkey: id and rawId the same base64url, its client data for a challenge this
      // account asked for (used once), from https://aquatome.com; a passkey no account has yet.
      guard let a = body!["response"]?.object, let id = a["id"]?.string, a["rawId"]?.string == id, a["type"]?.string == "public-key",
            let r = a["response"]?.object, let cd = r["clientDataJSON"]?.string.flatMap(Base64URL.decode), let client = (try? JSON.parse(cd))?.object,
            r["attestationObject"]?.string?.isEmpty == false, client["type"]?.string == "webauthn.create", let c = client["challenge"]?.string,
            creations.removeValue(forKey: c) == s, client["origin"]?.string == "https://aquatome.com"
      else { return try fail(400, "bad_passkey") }
      guard passkeys[id] == nil else { return try fail(409, "credential_in_use") }
      passkeys[id] = s
      return try reply(200, ["user": user(account, s)])
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
    signedAt[token] = now()
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
