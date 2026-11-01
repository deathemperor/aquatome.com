import Foundation
import Testing
@testable import AccountSync
import Tanks

// protocols/accounts.openapi.json: the contract the server (apps/site/worker/accounts) serves.
let contract: [String: JSON] = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSON.parse(Data(contentsOf: url.appendingPathComponent("protocols/accounts.openapi.json"))).object!["paths"]!.object!
}()

/// Scripted replies, in order; every request and wait kept.
actor Stub {
  private var replies: [(Int, String)]
  private(set) var requests: [URLRequest] = []
  private(set) var waits: [Duration] = []
  var failWith: URLError?
  init(_ replies: [(Int, String)]) { self.replies = replies }
  func send(_ r: URLRequest) throws -> (Data, HTTPURLResponse) {
    requests.append(r)
    if let failWith { throw failWith }
    let (status, body) = replies.removeFirst()
    return (Data(body.utf8), HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
  }
  func waited(_ d: Duration) { waits.append(d) }
  func failing(_ e: URLError) { failWith = e }
}

func client(_ stub: Stub) -> AccountsClient { AccountsClient(send: { try await stub.send($0) }, wait: { await stub.waited($0) }) }
@MainActor func client(_ fake: FakeAccounts) -> AccountsClient { AccountsClient(send: { try await fake.send($0) }, wait: { _ in }) }

/// Sign in with Apple on the stand-in: the identity token Apple would give for `sub`.
@MainActor func signIn(_ api: AccountsClient, _ sub: String, replacing token: String? = nil) async throws -> SignedIn {
  let nonce = try await api.nonce()
  return try await api.signInWithApple(idToken: "\(sub)|\(sha256Hex(nonce))", nonce: nonce, replacing: token)
}

/// One sync, as the app does it: send the store, then take the account's into the phone's latest.
@MainActor func sync(_ api: AccountsClient, _ phone: inout TankStore, _ token: String) async throws {
  let r = try await api.sync(phone, token: token)
  phone = r.applied(to: phone)
}

func phone(_ tanks: String...) throws -> TankStore {
  var s = TankStore()
  for t in tanks { _ = try s.addTank(name: t) }
  return s
}
func names(_ s: TankStore) -> [String] { s.liveTanks.map(\.name) }
let noUser = AccountSession.on(providers: Providers(google: false, apple: true, email: true, passkey: true), turnstileSitekey: "sk", user: nil)

@Test("A nonce's SHA-256 in lowercase hex, as the server compares it")
func nonceHash() {
  #expect(sha256Hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
}

@MainActor @Test("Every request: a bearer token once signed in, a JSON body on each POST, no cookie and no Origin; sign-ins say client app; every path is in the contract")
func requests() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  #expect(try await api.session(token: nil) == noUser)
  let s = try await signIn(api, "apple-1")
  guard case .on(_, _, let user?) = try await api.session(token: s.token) else { Issue.record("not signed in"); return }
  #expect(user.methods.map(\.kind) == ["apple"])
  _ = try await api.sync(try phone("Bể 1"), token: s.token)
  try await api.deleteAccount(token: s.token, appleCode: "good-apple-1")
  let s2 = try await signIn(api, "apple-2")
  try await api.signOut(token: s2.token)
  let flow = try await api.emailStart("reader@example.com", turnstile: "t-1", lang: "vi")
  _ = try await api.emailVerify(flow: flow, code: FakeAccounts.emailCode)
  let key = Data("cred-1".utf8)
  let handle = fake.addPasskey(key, to: "apple-3")
  _ = try await api.signInWithPasskey(FakeAccounts.assertion(for: try await api.passkeyChallenge(), credentialId: key, userHandle: handle))

  for r in fake.requests {
    let what = "\(r.httpMethod!) \(r.url!.path)"
    #expect(contract[r.url!.path]?.object?[r.httpMethod!.lowercased()] != nil, "\(what) is not in the contract")
    #expect(r.url!.host == "aquatome.com" && r.url!.scheme == "https", "\(what)")
    #expect(r.value(forHTTPHeaderField: "Cookie") == nil && r.value(forHTTPHeaderField: "Origin") == nil, "\(what)")
    #expect(r.httpShouldHandleCookies == false, "\(what)")
    if r.httpMethod == "POST" { #expect(r.httpBody != nil, "\(what) has no body") }
    if r.httpBody != nil { #expect(r.value(forHTTPHeaderField: "Content-Type") == "application/json", "\(what)") }
    let body = r.httpBody.flatMap { try? JSON.parse($0).object }
    if ["/api/v1/auth/apple", "/api/v1/auth/email/start", "/api/v1/auth/email/verify", "/api/v1/auth/passkey"].contains(r.url!.path) { #expect(body?["client"]?.string == "app", "\(what)") }
    if r.url!.path == "/api/v1/account" { #expect(body?["apple"]?.object?["clientId"]?.string == "com.aquatome.app") }
    if ["/api/v1/tanks/sync", "/api/v1/account", "/api/v1/auth/logout"].contains(r.url!.path) {
      #expect(r.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer token-") == true, "\(what)")
    }
  }
  #expect(Set(fake.requests.map { "\($0.httpMethod!) \($0.url!.path)" }) == [
    "GET /api/v1/session", "POST /api/v1/auth/nonce", "POST /api/v1/auth/apple", "POST /api/v1/tanks/sync",
    "DELETE /api/v1/account", "POST /api/v1/auth/logout", "POST /api/v1/auth/email/start", "POST /api/v1/auth/email/verify",
    "POST /api/v1/auth/passkey/options", "POST /api/v1/auth/passkey",
  ])
  // The Turnstile page the web view opens is the contract's too.
  let page = api.turnstilePage(lang: "th")
  #expect(page.absoluteString == "https://aquatome.com/api/v1/auth/email/turnstile?lang=th")
  #expect(contract[page.path]?.object?["get"] != nil)
}

@MainActor @Test("Email: a code to the address, a token for each request, the code once, five wrong ones and it's gone; the same address, the same account")
func email() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  await #expect(throws: AccountError.refused("bad_email")) { _ = try await api.emailStart("nope", turnstile: "t-0", lang: "vi") }
  let flow = try await api.emailStart(" Reader@Example.com ", turnstile: "t-1", lang: "vi")
  #expect(fake.mailed == ["reader@example.com"])
  // A Turnstile token passes once: the app asks the page for another before each code.
  await #expect(throws: AccountError.refused("turnstile")) { _ = try await api.emailStart("reader@example.com", turnstile: "t-1", lang: "vi") }
  await #expect(throws: AccountError.refused("bad_code")) { _ = try await api.emailVerify(flow: flow, code: "000000") }
  // Typed with a space or a dash, or pasted from the mail: sent as its six digits.
  #expect(AccountsClient.codeDigits("123 456") == "123456" && AccountsClient.codeDigits("12-34-56\n") == "123456" && AccountsClient.codeDigits("๑๒๓") == "")
  let first = try await api.emailVerify(flow: flow, code: "123 456")
  #expect(first.user.methods.map(\.kind) == ["email"])
  await #expect(throws: AccountError.refused("bad_code")) { _ = try await api.emailVerify(flow: flow, code: FakeAccounts.emailCode) }

  // Signing in again from this phone: the same account, and the old session ends.
  let again = try await api.emailStart("reader@example.com", turnstile: "t-2", lang: "vi")
  let second = try await api.emailVerify(flow: again, code: FakeAccounts.emailCode, replacing: first.token)
  #expect(second.user.id == first.user.id)
  #expect(fake.sessionCount == 1)
  await #expect(throws: AccountError.signedOut) { _ = try await api.sync(try phone(), token: first.token) }

  // Five wrong codes and the flow is gone, even for the right one.
  let worn = try await api.emailStart("reader@example.com", turnstile: "t-3", lang: "vi")
  for _ in 0..<5 { await #expect(throws: AccountError.refused("bad_code")) { _ = try await api.emailVerify(flow: worn, code: "000000") } }
  await #expect(throws: AccountError.refused("bad_code")) { _ = try await api.emailVerify(flow: worn, code: FakeAccounts.emailCode) }

  // An email account is deleted without Apple's step.
  try await api.deleteAccount(token: second.token, appleCode: nil)
  #expect(fake.accountCount == 0)
}

@MainActor @Test("Passkey: a challenge for aquatome.com, answered once by a passkey an account has; an unknown passkey, another origin, another account's handle or a used challenge is refused")
func passkey() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  let key = Data("cred-1".utf8)
  let handle = fake.addPasskey(key, to: "apple-1")
  let c = try await api.passkeyChallenge()
  #expect(c.rpId == "aquatome.com")
  let answer = FakeAccounts.assertion(for: c, credentialId: key, userHandle: handle)
  // As a browser sends it: SimpleWebAuthn refuses an answer whose id and rawId differ, and compares the user handle
  // with the base64url of the account id's bytes.
  let sent = answer.json.object!
  let inner = sent["response"]!.object!
  #expect(sent["id"]?.string == Base64URL.encode(key) && sent["rawId"] == sent["id"] && sent["type"]?.string == "public-key")
  #expect(inner["userHandle"]?.string == Base64URL.encode(handle))
  #expect(Base64URL.decode(inner["clientDataJSON"]!.string!).flatMap { try? JSON.parse($0).object?["origin"]?.string } == "https://aquatome.com")
  let s = try await api.signInWithPasskey(answer)
  #expect(Set(s.user.methods.map(\.kind)) == ["apple", "passkey"])
  // The same answer again: its challenge is used.
  await #expect(throws: AccountError.refused("bad_passkey")) { _ = try await api.signInWithPasskey(answer) }
  // A passkey no account has, an answer for another origin, a passkey made for another account.
  for bad in [
    { (c: PasskeyChallenge) in FakeAccounts.assertion(for: c, credentialId: Data("unknown".utf8), userHandle: nil) },
    { FakeAccounts.assertion(for: $0, credentialId: key, userHandle: handle, origin: "https://aquatome.com.example") },
    { FakeAccounts.assertion(for: $0, credentialId: key, userHandle: Data("someone-else".utf8)) },
  ] {
    let a = bad(try await api.passkeyChallenge())
    await #expect(throws: AccountError.refused("bad_passkey")) { _ = try await api.signInWithPasskey(a) }
  }
  // Signing in again from this phone: the same account, and the old session ends.
  let again = try await api.signInWithPasskey(FakeAccounts.assertion(for: try await api.passkeyChallenge(), credentialId: key, userHandle: handle), replacing: s.token)
  #expect(again.user.id == s.user.id)
  await #expect(throws: AccountError.signedOut) { _ = try await api.sync(try phone(), token: s.token) }
  // Passkeys off on the server.
  fake.passkeysOn = false
  await #expect(throws: AccountError.refused("provider_off")) { _ = try await api.passkeyChallenge() }
}

@Test("The server's passkey options as SimpleWebAuthn writes them; base64url as WebAuthn writes it: - and _, no padding")
func passkeyOptions() async throws {
  let options = #"{"challenge":"-__-AQ","timeout":300000,"rpId":"aquatome.com","allowCredentials":[],"userVerification":"required"}"#
  #expect(try await client(Stub([(200, options)])).passkeyChallenge() == PasskeyChallenge(rpId: "aquatome.com", challenge: Data([0xfb, 0xff, 0xfe, 0x01])))
  await #expect(throws: AccountError.badReply) { try await client(Stub([(200, #"{"rpId":"aquatome.com"}"#)])).passkeyChallenge() }
  await #expect(throws: AccountError.refused("provider_off")) { try await client(Stub([(503, #"{"error":"provider_off"}"#)])).passkeyChallenge() }
  #expect(Base64URL.encode(Data([0xfb, 0xff, 0xfe, 0x01])) == "-__-AQ")
  #expect(Base64URL.decode("+//+AQ==") == nil)
  #expect(Base64URL.decode(Base64URL.encode(Data("challenge-1".utf8))) == Data("challenge-1".utf8))
}

@MainActor @Test("Two phones on one account: the first's tanks reach the second, a change on either comes back, and what changed during a sync stays")
func twoPhones() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  var a = try phone("Bể phòng khách")
  var b = try phone("Bể tép")
  let ta = try await signIn(api, "apple-1").token
  try await sync(api, &a, ta)
  let tb = try await signIn(api, "apple-1").token
  try await sync(api, &b, tb)
  #expect(Set(names(b)) == ["Bể phòng khách", "Bể tép"])
  #expect(fake.accountCount == 1)

  // Renamed on the second phone; the first picks it up on its next sync.
  let tep = b.liveTanks.first { $0.name == "Bể tép" }!.id
  try b.updateTank(tep) { $0.json["name"] = .string("Bể tép ong") }
  try await sync(api, &b, tb)
  try await sync(api, &a, ta)
  #expect(Set(names(a)) == ["Bể phòng khách", "Bể tép ong"])

  // A tank added and one renamed while a sync is on its way: both stay as the phone has them.
  let r = try await api.sync(a, token: ta)
  _ = try a.addTank(name: "Bể mới")
  let living = a.liveTanks.first { $0.name == "Bể phòng khách" }!.id
  try a.updateTank(living) { $0.json["name"] = .string("Bể phòng khách (mới)") }
  a = r.applied(to: a)
  #expect(Set(names(a)) == ["Bể phòng khách (mới)", "Bể tép ong", "Bể mới"])
  try await sync(api, &a, ta)
  #expect(Set(fake.store(of: "apple-1").map(names) ?? []) == ["Bể phòng khách (mới)", "Bể tép ong", "Bể mới"])
}

@MainActor @Test("A phone whose clock runs fast takes the server's time for its edit, so a later edit elsewhere isn't lost")
func fastClock() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  let t = Date(timeIntervalSince1970: 1_793_000_000)
  fake.now = { t }
  var fast = try phone("Bể")
  let id = fast.liveTanks[0].id
  let tf = try await signIn(api, "apple-1").token
  try fast.updateTank(id, now: t.addingTimeInterval(60)) { $0.json["name"] = .string("Bể (máy nhanh giờ)") }
  try await sync(api, &fast, tf)
  #expect(fast.liveTanks[0].updatedAt == Timestamp.string(t))

  // Ten seconds later, on another phone (its clock right): renamed again.
  fake.now = { t.addingTimeInterval(10) }
  var other = TankStore()
  let to = try await signIn(api, "apple-1").token
  try await sync(api, &other, to)
  try other.updateTank(id, now: t.addingTimeInterval(10)) { $0.json["name"] = .string("Bể (máy khác)") }
  try await sync(api, &other, to)

  // The fast phone syncs again with nothing new: it gets that edit, and the account keeps it.
  fake.now = { t.addingTimeInterval(20) }
  try await sync(api, &fast, tf)
  #expect(names(fast) == ["Bể (máy khác)"])
  #expect(fake.store(of: "apple-1").map(names) == ["Bể (máy khác)"])
}

@MainActor @Test("A record the server refuses stays on the phone and goes again next time; the account doesn't get it")
func refusedStays() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  var p = try phone("Bể tốt", "Bể bị từ chối")
  let bad = p.liveTanks.first { $0.name == "Bể bị từ chối" }!.id
  fake.refuse = [bad]
  let token = try await signIn(api, "apple-1").token
  let r = try await api.sync(p, token: token)
  #expect(r.refused == [bad])
  p = r.applied(to: p)
  #expect(Set(names(p)) == ["Bể tốt", "Bể bị từ chối"])
  #expect(fake.store(of: "apple-1").map(names) == ["Bể tốt"])
  fake.refuse = []
  try await sync(api, &p, token)
  #expect(Set(fake.store(of: "apple-1").map(names) ?? []) == ["Bể tốt", "Bể bị từ chối"])
}

@Test("Refusals: an ended session, no network, a cancelled request, a limit, a reply without a code, replies that aren't the contract's, a newer store")
func refusals() async throws {
  let store = try phone("Bể")
  let ended = Stub([(401, #"{"error":"signed_out"}"#)])
  await #expect(throws: AccountError.signedOut) { try await client(ended).sync(store, token: "t") }
  let offline = Stub([])
  await offline.failing(URLError(.notConnectedToInternet))
  await #expect(throws: AccountError.offline) { try await client(offline).sync(store, token: "t") }
  let cancelled = Stub([])
  await cancelled.failing(URLError(.cancelled))
  await #expect(throws: CancellationError.self) { try await client(cancelled).sync(store, token: "t") }
  let limited = Stub([(429, #"{"error":"rate_limited"}"#)])
  await #expect(throws: AccountError.refused("rate_limited")) { try await client(limited).nonce() }
  let gateway = Stub([(502, "<html>Bad gateway</html>")])
  await #expect(throws: AccountError.refused("http_502")) { try await client(gateway).nonce() }
  let odd = Stub([(200, #"{"user":{"id":"u"}}"#)])
  await #expect(throws: AccountError.badReply) { try await client(odd).signInWithApple(idToken: "x", nonce: "n") }
  await #expect(throws: AccountError.badReply) { try await client(Stub([(200, "{}")])).session(token: nil) }
  // A store from a newer app: the phone's is left alone, not merged with what it can't read.
  let newer = Stub([(200, #"{"store":{"v":2,"tanks":[],"devices":[]},"refused":[],"serverTime":"2026-11-01T00:00:00.000Z"}"#)])
  await #expect(throws: AccountError.newerStore) { try await client(newer).sync(store, token: "t") }
  // Accounts off: no sign-in to offer.
  #expect(try await client(Stub([(200, #"{"accounts":false}"#)])).session(token: nil) == .off)
}

@MainActor @Test("Another sync of the account in progress: tried again three times, waiting longer each time")
func busy() async throws {
  let fake = FakeAccounts()
  let token = try await signIn(client(fake), "apple-1").token
  let stub = Stub([])
  let api = AccountsClient(send: { try await fake.send($0) }, wait: { await stub.waited($0) })
  fake.busy = 2
  #expect(names(try await api.sync(try phone("Bể"), token: token).store) == ["Bể"])
  #expect(await stub.waits == [.milliseconds(500), .milliseconds(1000)])
  fake.busy = 4
  await #expect(throws: AccountError.refused("busy")) { try await api.sync(try phone("Bể"), token: token) }
  #expect(await stub.waits == [.milliseconds(500), .milliseconds(1000), .milliseconds(500), .milliseconds(1000), .milliseconds(2000)])
}

@MainActor @Test("Signing in again ends the old session; signing out ends this phone's only")
func sessions() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  let first = try await signIn(api, "apple-1").token
  let other = try await signIn(api, "apple-1").token
  let again = try await signIn(api, "apple-2", replacing: first).token
  await #expect(throws: AccountError.signedOut) { try await api.sync(try phone(), token: first) }
  #expect(fake.sessionCount == 2)
  try await api.signOut(token: again)
  await #expect(throws: AccountError.signedOut) { try await api.sync(try phone(), token: again) }
  // Signed out already: the server says 204 again.
  try await api.signOut(token: again)
  _ = try await api.sync(try phone("Bể"), token: other)
  // A token whose session ended: the session has no user.
  #expect(try await api.session(token: again) == noUser)
}

@MainActor @Test("Deleting an account that signs in with Apple: a fresh code from the same Apple ID first")
func delete() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  let token = try await signIn(api, "apple-1").token
  await #expect(throws: AccountError.refused("apple_reauth")) { try await api.deleteAccount(token: token, appleCode: nil) }
  await #expect(throws: AccountError.refused("apple_other_account")) { try await api.deleteAccount(token: token, appleCode: "good-apple-9") }
  await #expect(throws: AccountError.refused("apple_revoke_failed")) { try await api.deleteAccount(token: token, appleCode: "expired") }
  #expect(fake.accountCount == 1)
  try await api.deleteAccount(token: token, appleCode: "good-apple-1")
  #expect(fake.accountCount == 0)
  await #expect(throws: AccountError.signedOut) { try await api.sync(try phone(), token: token) }
  #expect(try await api.session(token: token) == noUser)
}

@MainActor @Test("The stand-in kept across launches: the same accounts, tanks and sessions")
func snapshot() async throws {
  let fake = FakeAccounts()
  var p = try phone("Bể phòng khách")
  let token = try await signIn(client(fake), "apple-1").token
  try await sync(client(fake), &p, token)
  let again = FakeAccounts(snapshot: try JSON.parse(try fake.snapshot.data()))
  #expect(again.store(of: "apple-1").map(names) == ["Bể phòng khách"])
  #expect(again.sessionCount == 1)
  #expect(try await client(again).sync(TankStore(), token: token).store.liveTanks.count == 1)
  // A passkey added before the relaunch still signs in.
  fake.addPasskey(Data("cred-1".utf8), to: "apple-1")
  let kept = FakeAccounts(snapshot: try JSON.parse(try fake.snapshot.data()))
  let api = client(kept)
  #expect(try await api.signInWithPasskey(FakeAccounts.assertion(for: try await api.passkeyChallenge(), credentialId: Data("cred-1".utf8), userHandle: nil)).user.methods.map(\.kind) == ["apple", "passkey"])
  // New tokens don't repeat old ones.
  #expect(try await signIn(client(again), "apple-2").token != token)
}
