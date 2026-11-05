import Foundation
import Testing
@testable import AccountSync

/// The push-token requests the phone sent, as the stand-in got them.
@MainActor final class Sent {
  var requests: [(method: String, body: String)] = []
}

/// The owner's dashboard on the stand-in, an account signed in with Apple (`sub`), and what OwnerPush sends from it.
@MainActor func pushing(_ sub: String, defaults: UserDefaults) async throws -> (FakeAccounts, OwnerAccess, Sent) {
  let (fake, _) = ownerServer()
  let s = try await signIn(client(fake), sub)
  let sent = Sent()
  let send: Send = { r in
    if r.url?.path == "/api/owner/push-token" {
      let body = r.httpBody.map { String(decoding: $0, as: UTF8.self) } ?? ""
      await MainActor.run { sent.requests.append((r.httpMethod ?? "", body)) }
    }
    return try await fake.send(r)
  }
  return (fake, OwnerAccess(send: send, defaults: defaults, session: { (sub, s.token) }, ended: {}), sent)
}

@MainActor @Test("The token goes once a launch, as hex, only while wanted and only for the owner")
func theTokenGoesOnceALaunchToTheOwner() async throws {
  let d = store()
  let (fake, access, sent) = try await pushing("ui-apple", defaults: d)
  let push = OwnerPush(owner: access, environment: "sandbox", defaults: d)
  // APNs' token today: 32 bytes.
  let token = Data([0xAB, 0x01, 0x0F] + [UInt8](repeating: 0, count: 29))
  let hex = "ab010f" + String(repeating: "00", count: 29)
  await push.received(token)
  #expect(push.token == hex)
  // Not wanted yet; then wanted, before the owner is known.
  await push.send()
  await push.want(true)
  #expect(sent.requests.isEmpty)
  await access.check()
  await push.send()
  #expect(sent.requests.map(\.method) == ["POST"])
  #expect(sent.requests.first?.body == #"{"environment":"sandbox","token":""# + hex + #""}"#)
  #expect(fake.owner?.pushTokens == [hex: "sandbox"])
  // Again this launch: not sent again.
  await push.send()
  await push.received(token)
  #expect(sent.requests.count == 1)
  // The next launch: still wanted, sent again once the owner is known.
  let next = OwnerPush(owner: access, environment: "sandbox", defaults: d)
  #expect(next.wanted)
  await next.received(token)
  #expect(sent.requests.count == 2)
}

@MainActor @Test("Another account than the owner's: nothing sent")
func notTheOwnerSendsNothing() async throws {
  let d = store()
  let (_, access, sent) = try await pushing("someone-else", defaults: d)
  let push = OwnerPush(owner: access, environment: "production", defaults: d)
  await push.want(true)
  await push.received(Data(repeating: 1, count: 32))
  await access.check()
  #expect(access.isOwner == false)
  await push.send()
  #expect(sent.requests.isEmpty)
}

@MainActor @Test("Turned off, or before the account signs out, the token the site has is taken back")
func turnedOffOrSignedOutTakesItBack() async throws {
  let d = store()
  let (fake, access, sent) = try await pushing("ui-apple", defaults: d)
  await access.check()
  let push = OwnerPush(owner: access, environment: "production", defaults: d)
  await push.want(true)
  await push.received(Data(repeating: 0xFF, count: 32))
  let hex = String(repeating: "ff", count: 32)
  #expect(fake.owner?.pushTokens == [hex: "production"])
  await push.want(false)
  #expect(sent.requests.map(\.method) == ["POST", "DELETE"])
  // The token alone, as the site takes it back.
  #expect(sent.requests.last?.body == #"{"token":""# + hex + #""}"#)
  #expect(fake.owner?.pushTokens == [:])
  #expect(!OwnerPush(owner: access, environment: "production", defaults: d).wanted)
  // On again, then signing out: taken back too; nothing to take back the second time.
  await push.want(true)
  await push.signingOut()
  await push.signingOut()
  #expect(sent.requests.map(\.method) == ["POST", "DELETE", "POST", "DELETE"])
  #expect(fake.owner?.pushTokens == [:])
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
