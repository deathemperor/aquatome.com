import Foundation
import Testing
@testable import AccountSync

/// The push-token requests the phone sent as the stand-in got them, and what the next one meets: `fail` answers it as
/// no network does, `ends` as a session that's over (401); `during` runs while it's on its way.
@MainActor final class Sent {
  var requests: [(method: String, body: String)] = []
  var fail = false
  var ends = false
  var during: (@MainActor () async -> Void)?
}

/// The owner's dashboard on the stand-in, an account signed in with Apple (`sub`), and an OwnerAccess for it as each
/// launch makes one (`access()`), each request to push-token seen by `sent`.
@MainActor func pushing(_ sub: String, defaults: UserDefaults) async throws -> (FakeAccounts, () -> OwnerAccess, Sent, Who) {
  let (fake, _) = ownerServer()
  let s = try await signIn(client(fake), sub)
  let sent = Sent(), who = Who(sub)
  who.now = (sub, s.token)
  let send: Send = { r in
    guard r.url?.path == "/api/owner/push-token" else { return try await fake.send(r) }
    let body = r.httpBody.map { String(decoding: $0, as: UTF8.self) } ?? ""
    let (fail, ends, during) = await MainActor.run {
      sent.requests.append((r.httpMethod ?? "", body))
      defer { sent.fail = false; sent.ends = false; sent.during = nil }
      return (sent.fail, sent.ends, sent.during)
    }
    if fail { throw URLError(.notConnectedToInternet) }
    if ends { return (Data(#"{"error":"signed_out"}"#.utf8), HTTPURLResponse(url: r.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!) }
    await during?()
    return try await fake.send(r)
  }
  return (fake, { access(who, defaults, send) }, sent, who)
}

/// APNs' token today: 32 bytes, as lowercase hex.
let apnsToken = Data([0xAB, 0x01, 0x0F] + [UInt8](repeating: 0, count: 29))
let apnsHex = "ab010f" + String(repeating: "00", count: 29)

@MainActor @Test("The token goes once a launch, as hex, only while wanted and only once the owner is known")
func theTokenGoesOnceALaunchToTheOwner() async throws {
  let d = store()
  let (fake, access, sent, _) = try await pushing("ui-apple", defaults: d)
  let owner = access()
  let push = OwnerPush(owner: owner, environment: "sandbox", defaults: d)
  await push.received(apnsToken)
  #expect(push.token == apnsHex)
  // Not wanted yet; then wanted, before the owner is known.
  await push.send()
  await push.want(true)
  #expect(sent.requests.isEmpty)
  await owner.check()
  await push.send()
  #expect(sent.requests.map(\.method) == ["POST"])
  #expect(sent.requests.first?.body == #"{"environment":"sandbox","token":""# + apnsHex + #""}"#)
  #expect(fake.owner?.pushTokens == [apnsHex: "sandbox"])
  // Again this launch: not sent again.
  await push.send()
  await push.received(apnsToken)
  #expect(sent.requests.count == 1)
  // A new token from APNs: sent.
  let other = Data(repeating: 0x0C, count: 32)
  await push.received(other)
  #expect(sent.requests.count == 2 && fake.owner?.pushTokens[String(repeating: "0c", count: 32)] == "sandbox")
  // The next launch: still wanted, sent again once the owner is known, not before.
  let again = access()
  let next = OwnerPush(owner: again, environment: "sandbox", defaults: d)
  #expect(next.wanted)
  await next.received(apnsToken)
  #expect(sent.requests.count == 2)
  await again.check()
  await next.send()
  #expect(sent.requests.count == 3)
}

@MainActor @Test("Another account than the owner's: nothing sent")
func notTheOwnerSendsNothing() async throws {
  let d = store()
  let (_, access, sent, _) = try await pushing("someone-else", defaults: d)
  let owner = access()
  let push = OwnerPush(owner: owner, environment: "production", defaults: d)
  await push.want(true)
  await push.received(Data(repeating: 1, count: 32))
  await owner.check()
  #expect(owner.isOwner == false)
  await push.send()
  #expect(sent.requests.isEmpty)
}

@MainActor @Test("Turned off, or before the account signs out, the token the site has is taken back, alone")
func turnedOffOrSignedOutTakesItBack() async throws {
  let d = store()
  let (fake, access, sent, _) = try await pushing("ui-apple", defaults: d)
  let owner = access()
  await owner.check()
  let push = OwnerPush(owner: owner, environment: "production", defaults: d)
  await push.want(true)
  await push.received(Data(repeating: 0xFF, count: 32))
  let hex = String(repeating: "ff", count: 32)
  #expect(fake.owner?.pushTokens == [hex: "production"])
  await push.want(false)
  #expect(sent.requests.map(\.method) == ["POST", "DELETE"])
  #expect(sent.requests.last?.body == #"{"token":""# + hex + #""}"#)
  #expect(fake.owner?.pushTokens == [:])
  #expect(!OwnerPush(owner: owner, environment: "production", defaults: d).wanted)
  // On again, then signing out: taken back too; nothing to take back the second time.
  await push.want(true)
  await push.signingOut()
  await push.signingOut()
  #expect(sent.requests.map(\.method) == ["POST", "DELETE", "POST", "DELETE"])
  #expect(fake.owner?.pushTokens == [:])
}

@MainActor @Test("A take-back that fails is tried again at the next sync; one turned off while it was being sent is taken back")
func aFailedOrRacedTakeBackIsDoneLater() async throws {
  let d = store()
  let (fake, access, sent, _) = try await pushing("ui-apple", defaults: d)
  let owner = access()
  await owner.check()
  let push = OwnerPush(owner: owner, environment: "production", defaults: d)
  await push.received(apnsToken)
  await push.want(true)
  // Off with no network: still on the site; taken back at the next sync.
  sent.fail = true
  await push.want(false)
  #expect(fake.owner?.pushTokens == [apnsHex: "production"])
  await push.send()
  #expect(sent.requests.map(\.method) == ["POST", "DELETE", "DELETE"])
  #expect(fake.owner?.pushTokens == [:])
  await push.send()
  #expect(sent.requests.count == 3)
  // On, and off again while the POST is on its way: taken back once it lands.
  let later = access()
  await later.check()
  let racing = OwnerPush(owner: later, environment: "production", defaults: d)
  await racing.received(apnsToken)
  #expect(sent.requests.count == 3)
  sent.during = { await racing.want(false) }
  await racing.want(true)
  #expect(!racing.wanted)
  #expect(fake.owner?.pushTokens == [:])
  #expect(sent.requests.suffix(2).map(\.method) == ["POST", "DELETE"])
}

@MainActor @Test("Turned on again while the take-back is on its way: sent again once it's done")
func onAgainDuringATakeBackSendsAgain() async throws {
  let d = store()
  let (fake, access, sent, _) = try await pushing("ui-apple", defaults: d)
  let owner = access()
  await owner.check()
  let push = OwnerPush(owner: owner, environment: "production", defaults: d)
  await push.received(apnsToken)
  await push.want(true)
  sent.during = { await push.want(true) }
  await push.want(false)
  #expect(push.wanted)
  #expect(sent.requests.map(\.method) == ["POST", "DELETE", "POST"])
  #expect(fake.owner?.pushTokens == [apnsHex: "production"])
  // Signing out takes it back and sends nothing after, though it's still wanted on this phone.
  await push.signingOut()
  #expect(sent.requests.map(\.method) == ["POST", "DELETE", "POST", "DELETE"])
  #expect(fake.owner?.pushTokens == [:])
}

@MainActor @Test("Signed in again after the session ended, in the same launch: the token goes again, with the new session")
func signedInAgainSendsAgain() async throws {
  let d = store()
  let (fake, access, sent, who) = try await pushing("ui-apple", defaults: d)
  let owner = access()
  await owner.check()
  let push = OwnerPush(owner: owner, environment: "production", defaults: d)
  await push.want(true)
  await push.received(apnsToken)
  #expect(sent.requests.count == 1)
  // Another request was told the session is over; the owner signs in again.
  await owner.failed(OwnerError.signedOut, overview: false)
  #expect(who.ends == 1)
  await push.send()
  #expect(sent.requests.count == 1)
  who.now = ("ui-apple", try await signIn(client(fake), "ui-apple").token)
  await owner.check()
  await push.send()
  #expect(sent.requests.map(\.method) == ["POST", "POST"])
  await push.send()
  #expect(sent.requests.count == 2)
}

@MainActor @Test("A session over while sending signs the account out, as a sync told so does")
func aSessionOverWhileSendingSignsOut() async throws {
  let d = store()
  let (_, access, sent, who) = try await pushing("ui-apple", defaults: d)
  let owner = access()
  await owner.check()
  let push = OwnerPush(owner: owner, environment: "production", defaults: d)
  await push.want(true)
  sent.ends = true
  await push.received(apnsToken)
  #expect(who.ends == 1 && owner.sessionEnded)
}

@Test("A notification opens only a page of aquatome.com over https")
func aNotificationOpensOnlyTheSitesPages() {
  let report = "https://aquatome.com/_ab/bao-cao/2026-11-06/"
  #expect(OwnerPush.page(["url": report]) == URL(string: report))
  #expect(OwnerPush.page(["url": "https://www.aquatome.com/_ab/bao-cao/1/"]) != nil)
  for bad in ["http://aquatome.com/_ab/", "https://example.com/", "https://aquatome.com.example.com/", "https://x@aquatome.com/",
              "https://aquatome.com:8443/", "https://aquatome%2Ecom/", "javascript:alert(1)", "/_ab/bao-cao/1/", ""] {
    #expect(OwnerPush.page(["url": bad]) == nil, "\(bad)")
  }
  #expect(OwnerPush.page([:]) == nil)
  #expect(OwnerPush.page(["url": 3]) == nil)
}
