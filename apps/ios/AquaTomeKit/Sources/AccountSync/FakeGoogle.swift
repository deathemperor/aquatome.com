#if DEBUG
// Tests and the simulator only: not in a release build.
import Foundation
import Tanks

/// Google's side of a Google sign-in, in process, for tests and the simulator's UI tests: its page (`page`, where the
/// reader `sub` picks their account) and its token endpoint (`send`), each checking a request as Google does: the app's
/// client and redirect, a code asked for with PKCE's S256, then exchanged with the verifier that goes with it. The code
/// carries what Google keeps behind one (the reader, the nonce, the challenge), so the stand-in keeps nothing. The ID
/// token is `<sub>|<nonce>`, as `FakeAccounts` reads one.
public enum FakeGoogle {
  /// Where Google's page sends the reader back to: a code with the request's `state`, or `error=invalid_request` for a
  /// request Google would refuse.
  public static func page(_ url: URL, sub: String = "ui-google") -> URL {
    let q = fields(URLComponents(url: url, resolvingAgainstBaseURL: false)?.percentEncodedQuery)
    let state = q["state"] ?? ""
    var answer = URLComponents(string: GoogleOAuth.redirectURI)!
    guard url.host == "accounts.google.com", url.path == "/o/oauth2/v2/auth", q["client_id"] == GoogleOAuth.clientId,
          q["redirect_uri"] == GoogleOAuth.redirectURI, q["response_type"] == "code",
          q["scope"]?.split(separator: " ").contains("openid") == true, q["code_challenge_method"] == "S256",
          let challenge = q["code_challenge"], challenge.count == 43, let nonce = q["nonce"], !nonce.isEmpty
    else {
      answer.percentEncodedQuery = GoogleOAuth.form([("error", "invalid_request"), ("state", state)])
      return answer.url!
    }
    answer.percentEncodedQuery = GoogleOAuth.form([("state", state), ("code", [sub, nonce, challenge].joined(separator: "|"))])
    return answer.url!
  }

  /// Google's token endpoint: the ID token for a code its page gave, with the verifier whose SHA-256 the page was sent;
  /// else 400 `invalid_grant`.
  public static func send(_ r: URLRequest) throws -> (Data, HTTPURLResponse) {
    let f = fields(r.httpBody.map { String(decoding: $0, as: UTF8.self) })
    let code = (f["code"] ?? "").split(separator: "|", omittingEmptySubsequences: false).map(String.init)
    let ok = r.url == GoogleOAuth.tokenEndpoint && r.httpMethod == "POST"
      && r.value(forHTTPHeaderField: "Content-Type") == "application/x-www-form-urlencoded"
      && f["grant_type"] == "authorization_code" && f["client_id"] == GoogleOAuth.clientId && f["redirect_uri"] == GoogleOAuth.redirectURI
      && code.count == 3 && GoogleOAuth.challenge(f["code_verifier"] ?? "") == code[2]
    let body: [String: JSON] = ok
      ? ["id_token": .string("\(code[0])|\(code[1])"), "access_token": .string("stand-in-access-token"), "token_type": .string("Bearer"), "expires_in": .number(3599), "scope": .string("openid email")]
      : ["error": .string("invalid_grant"), "error_description": .string("Bad Request")]
    return (try JSON.object(body).data(), HTTPURLResponse(url: r.url!, statusCode: ok ? 200 : 400, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
  }

  /// A form's fields (`a=1&b=2`), percent-decoded.
  static func fields(_ s: String?) -> [String: String] {
    var out: [String: String] = [:]
    for pair in (s ?? "").split(separator: "&") {
      let kv = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
      if kv.count == 2, let k = kv[0].removingPercentEncoding, let v = kv[1].removingPercentEncoding { out[k] = v }
    }
    return out
  }
}
#endif
