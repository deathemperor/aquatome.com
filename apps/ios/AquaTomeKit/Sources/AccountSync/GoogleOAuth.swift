import CryptoKit
import Foundation
import Tanks

// Sign in with Google with no Google SDK (the app has a size budget): OAuth 2.0 for installed apps, an authorization code
// with PKCE (RFC 7636), from Google's own page in a browser sheet the app opens. The ID token it ends with goes to
// POST /api/v1/auth/google, as Sign in with Apple's goes to /api/v1/auth/apple.

/// One Google sign-in: Google's page to open, the code read from where Google sends the reader back, and the code
/// exchanged for an ID token.
public struct GoogleOAuth: Sendable, Equatable {
  /// The app's iOS client in AquaTome's Google Cloud project, one of the server's GOOGLE_CLIENT_IDS
  /// (apps/site/wrangler.jsonc): the ID token's audience. Client ids are public.
  public static let clientId = "273529484726-i1brjj0oukqk1v1niudmu9f4q4ouo8or.apps.googleusercontent.com"
  /// Where Google sends an iOS client's answer: its client id backwards. The browser sheet takes it, so no other app can.
  public static let callbackScheme = "com.googleusercontent.apps." + clientId.dropLast(".apps.googleusercontent.com".count)
  public static let redirectURI = callbackScheme + ":/oauth2redirect"
  static let page = URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
  static let tokenEndpoint = URL(string: "https://oauth2.googleapis.com/token")!

  /// The server's nonce (POST /api/v1/auth/nonce), as issued: Google puts it in the ID token, and the server checks it.
  public let nonce: String
  /// Google sends it back with its answer: an answer without this one is another sign-in's.
  public let state: String
  /// PKCE's secret. Google's page gets only its SHA-256, and the code is exchanged with it, so a code that went astray on
  /// its way to the app is no use to anyone else.
  public let verifier: String

  public init(nonce: String, state: String = GoogleOAuth.random(), verifier: String = GoogleOAuth.random()) {
    self.nonce = nonce
    self.state = state
    self.verifier = verifier
  }

  /// 32 random bytes in base64url: 43 characters, as RFC 7636 makes a verifier.
  public static func random() -> String {
    var g = SystemRandomNumberGenerator()
    return Base64URL.encode(Data((0..<32).map { _ in UInt8.random(in: .min ... .max, using: &g) }))
  }

  /// PKCE's S256 challenge: the verifier's SHA-256, in base64url.
  public static func challenge(_ verifier: String) -> String { Base64URL.encode(Data(SHA256.hash(data: Data(verifier.utf8)))) }

  /// Google's page, which asks the reader to pick an account every time (a phone can have several), then sends a code
  /// back.
  public var url: URL {
    var c = URLComponents(url: Self.page, resolvingAgainstBaseURL: false)!
    c.percentEncodedQuery = Self.form([
      ("client_id", Self.clientId), ("redirect_uri", Self.redirectURI), ("response_type", "code"), ("scope", "openid email"),
      ("code_challenge", Self.challenge(verifier)), ("code_challenge_method", "S256"), ("state", state), ("nonce", nonce),
      ("prompt", "select_account"),
    ])
    return c.url!
  }

  /// The code in Google's answer: the address its page sent the reader back to.
  public func code(from answer: URL) throws -> String {
    let items = URLComponents(url: answer, resolvingAgainstBaseURL: false)?.queryItems ?? []
    let value = { (name: String) in items.first { $0.name == name }?.value }
    guard value("state") == state else { throw GoogleError.otherSignIn }
    if let error = value("error") { throw GoogleError.refused(error) }
    guard let code = value("code"), !code.isEmpty else { throw AccountError.badReply }
    return code
  }

  /// The code exchanged for the ID token at Google's token endpoint. An iOS client has no secret: the verifier shows the
  /// code is this sign-in's.
  public func idToken(code: String, send: Send) async throws -> String {
    var r = URLRequest(url: Self.tokenEndpoint)
    r.httpMethod = "POST"
    r.httpShouldHandleCookies = false
    r.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    r.httpBody = Data(Self.form([
      ("grant_type", "authorization_code"), ("code", code), ("client_id", Self.clientId), ("redirect_uri", Self.redirectURI),
      ("code_verifier", verifier),
    ]).utf8)
    let data: Data, res: HTTPURLResponse
    do { (data, res) = try await send(r) } catch let e as URLError { throw e.code == .cancelled ? CancellationError() : AccountError.offline }
    let o = (try? JSON.parse(data))?.object
    if (200..<300).contains(res.statusCode), let token = o?["id_token"]?.string, !token.isEmpty { return token }
    if let error = o?["error"]?.string { throw GoogleError.refused(error) }
    throw AccountError.badReply
  }

  /// Form-encoded, as Google's endpoints read a query or a body: every character but letters, digits and `-._~` escaped.
  public static func form(_ pairs: [(String, String)]) -> String {
    let plain = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
    return pairs.map { "\($0)=\($1.addingPercentEncoding(withAllowedCharacters: plain)!)" }.joined(separator: "&")
  }
}

public enum GoogleError: Error, Equatable {
  /// Google's answer carries another sign-in's `state`, or none: not used.
  case otherSignIn
  /// Google said no, with its `error` code: `access_denied` (the reader declined on Google's page), `invalid_grant` (a code
  /// used or expired), …
  case refused(String)
}
