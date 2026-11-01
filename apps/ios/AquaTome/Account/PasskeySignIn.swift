import AccountSync
import AuthenticationServices
import UIKit

/// The reader closed the passkey sheet: nothing to say.
struct PasskeySignInCancelled: Error {}

@MainActor
protocol PasskeySignIn {
  /// The system's passkey sheet: Face ID, Touch ID or the passcode unlocks a passkey of `challenge.rpId` (on this phone,
  /// in iCloud Keychain, or on a phone nearby), which signs the challenge.
  func assert(_ challenge: PasskeyChallenge) async throws -> PasskeyAssertion
}

/// The system's passkeys. aquatome.com's are the app's through its webcredentials association
/// (Config/AquaTome.entitlements, and the site's /.well-known/apple-app-site-association).
@MainActor
final class SystemPasskeySignIn: NSObject, PasskeySignIn, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private var controller: ASAuthorizationController?
  private var waiting: CheckedContinuation<PasskeyAssertion, Error>?

  func assert(_ c: PasskeyChallenge) async throws -> PasskeyAssertion {
    let request = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: c.rpId).createCredentialAssertionRequest(challenge: c.challenge)
    request.userVerificationPreference = .required
    let ctl = ASAuthorizationController(authorizationRequests: [request])
    ctl.delegate = self
    ctl.presentationContextProvider = self
    controller = ctl
    return try await withCheckedThrowingContinuation { waiting = $0; ctl.performRequests() }
  }

  private func finish(_ result: Result<PasskeyAssertion, Error>) {
    waiting?.resume(with: result)
    waiting = nil
    controller = nil
  }

  nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    let a = (authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion).flatMap { a -> PasskeyAssertion? in
      guard let data = a.rawAuthenticatorData, let signature = a.signature else { return nil }
      return PasskeyAssertion(credentialId: a.credentialID, clientDataJSON: a.rawClientDataJSON, authenticatorData: data, signature: signature, userHandle: a.userID)
    }
    MainActor.assumeIsolated { finish(a.map { .success($0) } ?? .failure(URLError(.badServerResponse))) }
  }

  nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    let cancelled = (error as? ASAuthorizationError)?.code == .canceled
    MainActor.assumeIsolated { finish(.failure(cancelled ? PasskeySignInCancelled() : error)) }
  }

  nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
  }
}

#if DEBUG
/// The simulator's UI tests (the simulator can't run the real sheet): the passkey `FakeServer` adds with `-seed-passkey`.
struct FakePasskeySignIn: PasskeySignIn {
  static let credentialId = Data("ui-passkey".utf8)
  func assert(_ c: PasskeyChallenge) async throws -> PasskeyAssertion {
    FakeAccounts.assertion(for: c, credentialId: Self.credentialId, userHandle: nil)
  }
}
#endif
