import Foundation
import Testing
@testable import AccountSync
import Tanks

// Sign in with Google with no Google SDK: Google's page, its answer and its token endpoint (OAuth 2.0 for installed
// apps, PKCE as RFC 7636 has it), and the ID token signing in to the account.

/// The query of a URL or a form body, decoded.
private func fields(_ s: String?) -> [String: String] { FakeGoogle.fields(s) }

@Test("PKCE as RFC 7636's example has it: 32 octets make the verifier, and its S256 challenge")
func pkceExample() {
  let octets: [UInt8] = [116, 24, 223, 180, 151, 153, 224, 37, 79, 250, 96, 125, 216, 173, 187, 186, 22, 212, 37, 77, 105, 214, 191, 240, 91, 88, 5, 88, 83, 132, 141, 121]
  #expect(Base64URL.encode(Data(octets)) == "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
  #expect(GoogleOAuth.challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk") == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
}

@Test("A sign-in's verifier and state: 32 random bytes each, 43 characters RFC 7636 allows, new each time")
func randomVerifierAndState() {
  let a = GoogleOAuth(nonce: "n"), b = GoogleOAuth(nonce: "n")
  for s in [a.verifier, a.state] {
    #expect(s.count == 43 && s.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "-._~".contains($0)) }, "\(s)")
  }
  #expect(a.verifier != a.state && a.verifier != b.verifier && a.state != b.state)
}

@Test("The client is the app's iOS client, and Google answers at its id backwards")
func client() {
  #expect(GoogleOAuth.clientId == "273529484726-i1brjj0oukqk1v1niudmu9f4q4ouo8or.apps.googleusercontent.com")
  #expect(GoogleOAuth.callbackScheme == "com.googleusercontent.apps.273529484726-i1brjj0oukqk1v1niudmu9f4q4ouo8or")
  #expect(GoogleOAuth.redirectURI == "com.googleusercontent.apps.273529484726-i1brjj0oukqk1v1niudmu9f4q4ouo8or:/oauth2redirect")
}

@Test("Google's page: a code with PKCE's S256, the openid and email scopes, the server's nonce as issued, the state, an account picked each time")
func pageURL() {
  let g = GoogleOAuth(nonce: "nonce+/=1", state: "state-1", verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
  let c = URLComponents(url: g.url, resolvingAgainstBaseURL: false)!
  #expect(c.scheme == "https" && c.host == "accounts.google.com" && c.path == "/o/oauth2/v2/auth")
  #expect(fields(c.percentEncodedQuery) == [
    "client_id": GoogleOAuth.clientId, "redirect_uri": GoogleOAuth.redirectURI, "response_type": "code", "scope": "openid email",
    "code_challenge": "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", "code_challenge_method": "S256", "state": "state-1",
    "nonce": "nonce+/=1", "prompt": "select_account",
  ])
  // Every value escaped but `-._~`: a "+" isn't read as a space, nor "/" and ":" left for Google to guess at.
  #expect(c.percentEncodedQuery!.contains("nonce=nonce%2B%2F%3D1") && c.percentEncodedQuery!.contains("redirect_uri=com.googleusercontent.apps.273529484726-i1brjj0oukqk1v1niudmu9f4q4ouo8or%3A%2Foauth2redirect"))
  #expect(!g.url.absoluteString.contains(g.verifier), "the verifier itself went to Google's page")
}

@Test("Google's answer: its code with this sign-in's state; Google's error; another sign-in's state, or none, refused")
func answer() throws {
  let g = GoogleOAuth(nonce: "n", state: "s-1", verifier: "v")
  let back = { (q: String) in URL(string: "\(GoogleOAuth.redirectURI)?\(q)")! }
  #expect(try g.code(from: back("state=s-1&code=4%2F0Ab-code&scope=email%20openid&authuser=0&prompt=consent")) == "4/0Ab-code")
  #expect(throws: GoogleError.refused("access_denied")) { try g.code(from: back("error=access_denied&state=s-1")) }
  #expect(throws: GoogleError.refused("server_error")) { try g.code(from: back("state=s-1&error=server_error")) }
  #expect(throws: GoogleError.otherSignIn) { try g.code(from: back("state=s-2&code=4%2F0Ab-code")) }
  #expect(throws: GoogleError.otherSignIn) { try g.code(from: back("code=4%2F0Ab-code")) }
  // Another sign-in's error is no more this one's than its code.
  #expect(throws: GoogleError.otherSignIn) { try g.code(from: back("error=access_denied&state=s-2")) }
  #expect(throws: AccountError.badReply) { try g.code(from: back("state=s-1")) }
}

@Test("The code exchanged at Google's token endpoint: a form with the client, the redirect and the verifier, no secret; the ID token read from the reply")
func exchange() async throws {
  let g = GoogleOAuth(nonce: "n", state: "s", verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")
  let stub = Stub([
    (200, #"{"access_token":"stand-in-access-token","expires_in":3599,"scope":"openid https://www.googleapis.com/auth/userinfo.email","token_type":"Bearer","id_token":"eyJ.id.token"}"#),
    (400, #"{"error":"invalid_grant","error_description":"Bad Request"}"#),
    (200, #"{"access_token":"stand-in-access-token","token_type":"Bearer"}"#),
    (502, "<html>Bad gateway</html>"),
  ])
  let send: Send = { try await stub.send($0) }
  #expect(try await g.idToken(code: "4/0Ab-code", send: send) == "eyJ.id.token")
  await #expect(throws: GoogleError.refused("invalid_grant")) { _ = try await g.idToken(code: "4/0Ab-code", send: send) }
  await #expect(throws: AccountError.badReply) { _ = try await g.idToken(code: "4/0Ab-code", send: send) }
  await #expect(throws: AccountError.badReply) { _ = try await g.idToken(code: "4/0Ab-code", send: send) }
  await stub.failing(URLError(.notConnectedToInternet))
  await #expect(throws: AccountError.offline) { _ = try await g.idToken(code: "4/0Ab-code", send: send) }

  let r = await stub.requests[0]
  #expect(r.url?.absoluteString == "https://oauth2.googleapis.com/token" && r.httpMethod == "POST")
  #expect(r.value(forHTTPHeaderField: "Content-Type") == "application/x-www-form-urlencoded")
  #expect(r.httpShouldHandleCookies == false && r.value(forHTTPHeaderField: "Authorization") == nil)
  #expect(fields(r.httpBody.map { String(decoding: $0, as: UTF8.self) }) == [
    "grant_type": "authorization_code", "code": "4/0Ab-code", "client_id": GoogleOAuth.clientId, "redirect_uri": GoogleOAuth.redirectURI,
    "code_verifier": "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
  ])
}

@MainActor @Test("Google's page and token endpoint on the stand-in, then the account: signed in with Google, the nonce used once")
func signInWithGoogle() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  guard case .on(let p, _, _) = try await api.session(token: nil) else { Issue.record("accounts off"); return }
  #expect(p.google)

  let nonce = try await api.nonce()
  let g = GoogleOAuth(nonce: nonce)
  let code = try g.code(from: FakeGoogle.page(g.url, sub: "g-1"))
  let idToken = try await g.idToken(code: code, send: { try FakeGoogle.send($0) })
  let s = try await api.signInWithGoogle(idToken: idToken, nonce: nonce)
  #expect(s.user.methods.map(\.kind) == ["google"])
  // The nonce was used: the same token again is refused.
  await #expect(throws: AccountError.refused("bad_nonce")) { _ = try await api.signInWithGoogle(idToken: idToken, nonce: nonce) }

  // The same Google account again, from this phone: the same account, and the old session ends.
  let again = try await api.nonce()
  let second = try await api.signInWithGoogle(idToken: "g-1|\(again)", nonce: again, replacing: s.token)
  #expect(second.user.id == s.user.id && fake.sessionCount == 1)
  // A Google account and an Apple ID with the same id are two accounts.
  #expect(try await signIn(api, "g-1").user.id != s.user.id)

  // A token for another nonce, or none the server can read.
  let n3 = try await api.nonce()
  await #expect(throws: AccountError.refused("bad_nonce")) { _ = try await api.signInWithGoogle(idToken: "g-1|other", nonce: n3) }
  let n4 = try await api.nonce()
  await #expect(throws: AccountError.refused("bad_token")) { _ = try await api.signInWithGoogle(idToken: "garbled", nonce: n4) }

  // Turned off on the server.
  fake.googleOn = false
  guard case .on(let off, _, _) = try await api.session(token: nil) else { Issue.record("accounts off"); return }
  #expect(!off.google)
  let n5 = try await api.nonce()
  await #expect(throws: AccountError.refused("provider_off")) { _ = try await api.signInWithGoogle(idToken: "g-1|\(n5)", nonce: n5) }
}

@Test("The stand-in Google refuses what Google would: a code exchanged without its verifier, a page asked for without PKCE")
func fakeGoogleRefuses() async throws {
  let g = GoogleOAuth(nonce: "n", state: "s")
  let code = try g.code(from: FakeGoogle.page(g.url))
  let other = GoogleOAuth(nonce: "n", state: "s")
  await #expect(throws: GoogleError.refused("invalid_grant")) { _ = try await other.idToken(code: code, send: { try FakeGoogle.send($0) }) }
  #expect(try await g.idToken(code: code, send: { try FakeGoogle.send($0) }) == "ui-google|n")
  var noPKCE = URLComponents(url: g.url, resolvingAgainstBaseURL: false)!
  noPKCE.percentEncodedQuery = noPKCE.percentEncodedQuery!.replacingOccurrences(of: "code_challenge_method=S256", with: "code_challenge_method=plain")
  #expect(throws: GoogleError.refused("invalid_request")) { try g.code(from: FakeGoogle.page(noPKCE.url!)) }
}
