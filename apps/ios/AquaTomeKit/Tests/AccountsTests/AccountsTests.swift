import Foundation
import Testing
@testable import Accounts
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

/// Sign in with Apple on the simulator's stand-in: the identity token Apple would give for `sub`.
@MainActor func signIn(_ api: AccountsClient, _ sub: String) async throws -> SignedIn {
  let nonce = try await api.nonce()
  return try await api.signInWithApple(idToken: "\(sub)|\(sha256Hex(nonce))", nonce: nonce)
}

func phone(_ tanks: String...) throws -> TankStore {
  var s = TankStore()
  for t in tanks { _ = try s.addTank(name: t) }
  return s
}
func names(_ s: TankStore) -> [String] { s.liveTanks.map(\.name) }

@Test("A nonce's SHA-256 in lowercase hex, as the server compares it")
func nonceHash() {
  #expect(sha256Hex("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
}

@MainActor @Test("Every request: a bearer token once signed in, JSON bodies, no cookie and no Origin; sign-ins say client app; every path is in the contract")
func requests() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  #expect(try await api.session(token: nil) == .on(providers: Providers(google: false, apple: true, email: true, passkey: false), turnstileSitekey: "sk", user: nil))
  let s = try await signIn(api, "apple-1")
  guard case .on(_, _, let user?) = try await api.session(token: s.token) else { Issue.record("not signed in"); return }
  #expect(user.methods.map(\.kind) == ["apple"])
  _ = try await api.sync(try phone("Bể 1"), token: s.token)
  try await api.deleteAccount(token: s.token, appleCode: "good-apple-1")
  let s2 = try await signIn(api, "apple-2")
  try await api.signOut(token: s2.token)

  for r in fake.requests {
    let what = "\(r.httpMethod!) \(r.url!.path)"
    #expect(contract[r.url!.path]?.object?[r.httpMethod!.lowercased()] != nil, "\(what) is not in the contract")
    #expect(r.url!.host == "aquatome.com" && r.url!.scheme == "https", "\(what)")
    #expect(r.value(forHTTPHeaderField: "Cookie") == nil && r.value(forHTTPHeaderField: "Origin") == nil, "\(what)")
    #expect(r.httpShouldHandleCookies == false, "\(what)")
    if r.httpBody != nil { #expect(r.value(forHTTPHeaderField: "Content-Type") == "application/json", "\(what)") }
    let body = r.httpBody.flatMap { try? JSON.parse($0).object }
    if r.url!.path == "/api/v1/auth/apple" { #expect(body?["client"]?.string == "app") }
    if ["/api/v1/tanks/sync", "/api/v1/account", "/api/v1/auth/logout"].contains(r.url!.path) {
      #expect(r.value(forHTTPHeaderField: "Authorization")?.hasPrefix("Bearer token-") == true, "\(what)")
    }
  }
  #expect(Set(fake.requests.map { "\($0.httpMethod!) \($0.url!.path)" }) == [
    "GET /api/v1/session", "POST /api/v1/auth/nonce", "POST /api/v1/auth/apple", "POST /api/v1/tanks/sync",
    "DELETE /api/v1/account", "POST /api/v1/auth/logout",
  ])
}

@MainActor @Test("Two phones on one account: the first's tanks reach the second, and a change on either comes back to the other")
func twoPhones() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  var a = try phone("Bể phòng khách")
  var b = try phone("Bể tép")
  let ta = try await signIn(api, "apple-1").token
  a = TankStore.merge(kept: a, incoming: try await api.sync(a, token: ta).store)
  let tb = try await signIn(api, "apple-1").token
  b = TankStore.merge(kept: b, incoming: try await api.sync(b, token: tb).store)
  #expect(Set(names(b)) == ["Bể phòng khách", "Bể tép"])
  #expect(fake.accountCount == 1)

  // Renamed on the second phone; the first picks it up on its next sync, and keeps what it changed meanwhile.
  let tep = b.liveTanks.first { $0.name == "Bể tép" }!.id
  try b.updateTank(tep, now: Date().addingTimeInterval(5)) { $0.json["name"] = .string("Bể tép ong") }
  _ = try await api.sync(b, token: tb)
  let sent = a
  _ = try a.addTank(name: "Bể mới, chưa gửi")
  a = TankStore.merge(kept: a, incoming: try await api.sync(sent, token: ta).store)
  #expect(Set(names(a)) == ["Bể phòng khách", "Bể tép ong", "Bể mới, chưa gửi"])
}

@Test("Refusals: an ended session, no network, a limit, a reply without a code, a reply that isn't the contract's, a newer store")
func refusals() async throws {
  let store = try phone("Bể")
  let ended = Stub([(401, #"{"error":"signed_out"}"#)])
  await #expect(throws: AccountError.signedOut) { try await client(ended).sync(store, token: "t") }
  let offline = Stub([])
  await offline.failing(URLError(.notConnectedToInternet))
  await #expect(throws: AccountError.offline) { try await client(offline).sync(store, token: "t") }
  let limited = Stub([(429, #"{"error":"rate_limited"}"#)])
  await #expect(throws: AccountError.refused("rate_limited")) { try await client(limited).nonce() }
  let gateway = Stub([(502, "<html>Bad gateway</html>")])
  await #expect(throws: AccountError.refused("http_502")) { try await client(gateway).nonce() }
  let odd = Stub([(200, #"{"user":{"id":"u"}}"#)])
  await #expect(throws: AccountError.badReply) { try await client(odd).signInWithApple(idToken: "x", nonce: "n") }
  // A store from a newer app: the phone's is left alone, not merged with what it can't read.
  let newer = Stub([(200, #"{"store":{"v":2,"tanks":[],"devices":[]},"refused":[],"serverTime":"2026-11-01T00:00:00.000Z"}"#)])
  await #expect(throws: AccountError.newerStore) { try await client(newer).sync(store, token: "t") }
  // Records the server refused are counted; the phone keeps them.
  let refused = Stub([(200, #"{"store":{"v":1,"tanks":[],"devices":[]},"refused":[{"kind":"tank","id":"x","issues":[]}],"serverTime":"2026-11-01T00:00:00.000Z"}"#)])
  #expect(try await client(refused).sync(store, token: "t").refused == 1)
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

@MainActor @Test("Signing out ends this phone's session only; deleting an account that signs in with Apple takes a fresh Apple code")
func signOutAndDelete() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  let one = try await signIn(api, "apple-1").token
  let two = try await signIn(api, "apple-1").token
  try await api.signOut(token: one)
  await #expect(throws: AccountError.signedOut) { try await api.sync(try phone(), token: one) }
  // Signed out already (here or elsewhere): still signed out, no error.
  try await api.signOut(token: one)
  _ = try await api.sync(try phone("Bể"), token: two)

  await #expect(throws: AccountError.refused("apple_reauth")) { try await api.deleteAccount(token: two, appleCode: nil) }
  await #expect(throws: AccountError.refused("apple_reauth")) { try await api.deleteAccount(token: two, appleCode: "good-apple-9") }
  #expect(fake.accountCount == 1)
  try await api.deleteAccount(token: two, appleCode: "good-apple-1")
  #expect(fake.accountCount == 0)
  await #expect(throws: AccountError.signedOut) { try await api.sync(try phone(), token: two) }
  #expect(try await api.session(token: two) == .on(providers: Providers(google: false, apple: true, email: true, passkey: false), turnstileSitekey: "sk", user: nil))
}
