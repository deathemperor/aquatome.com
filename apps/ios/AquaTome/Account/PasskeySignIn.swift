import AccountSync
import AuthenticationServices
import UIKit

/// The reader closed the passkey sheet: nothing to say.
struct PasskeySignInCancelled: Error {}

/// This phone has a passkey of the account already (one of the challenge's `excluded`).
struct PasskeyExists: Error {}

@MainActor
protocol PasskeySignIn {
  /// The system's passkey sheet: Face ID, Touch ID or the passcode unlocks a passkey of `challenge.rpId` (on this phone,
  /// in iCloud Keychain, or on a phone nearby), which signs the challenge.
  func assert(_ challenge: PasskeyChallenge) async throws -> PasskeyAssertion
  /// The system's sheet to make a passkey of `challenge.rpId` for the account (kept in iCloud Keychain), unlocked the
  /// same way.
  func register(_ challenge: NewPasskeyChallenge) async throws -> NewPasskey
}

/// The system's passkeys. aquatome.com's are the app's through its webcredentials association
/// (Config/AquaTome.entitlements, and the site's /.well-known/apple-app-site-association).
@MainActor
final class SystemPasskeySignIn: NSObject, PasskeySignIn, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private enum Answer: Sendable { case assertion(PasskeyAssertion), registration(NewPasskey) }
  private var controller: ASAuthorizationController?
  private var waiting: CheckedContinuation<Answer, Error>?

  func assert(_ c: PasskeyChallenge) async throws -> PasskeyAssertion {
    let request = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: c.rpId).createCredentialAssertionRequest(challenge: c.challenge)
    request.userVerificationPreference = .required
    guard case .assertion(let a) = try await perform(request) else { throw URLError(.badServerResponse) }
    return a
  }

  func register(_ c: NewPasskeyChallenge) async throws -> NewPasskey {
    let request = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: c.rpId).createCredentialRegistrationRequest(challenge: c.challenge, name: c.name, userID: c.userId)
    request.userVerificationPreference = .required
    request.attestationPreference = .none
    // Apps may leave out passkeys from iOS 18 (iOS 17 keeps one passkey per account and site, replacing the old one).
    if #available(iOS 18, *) { request.excludedCredentials = c.excluded.map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) } }
    guard case .registration(let p) = try await perform(request) else { throw URLError(.badServerResponse) }
    return p
  }

  private func perform(_ request: ASAuthorizationRequest) async throws -> Answer {
    let ctl = ASAuthorizationController(authorizationRequests: [request])
    ctl.delegate = self
    ctl.presentationContextProvider = self
    controller = ctl
    return try await withCheckedThrowingContinuation { waiting = $0; ctl.performRequests() }
  }

  private func finish(_ result: Result<Answer, Error>) {
    waiting?.resume(with: result)
    waiting = nil
    controller = nil
  }

  nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    let answer: Answer? = switch authorization.credential {
    case let a as ASAuthorizationPlatformPublicKeyCredentialAssertion:
      a.rawAuthenticatorData.flatMap { data in a.signature.map { .assertion(PasskeyAssertion(credentialId: a.credentialID, clientDataJSON: a.rawClientDataJSON, authenticatorData: data, signature: $0, userHandle: a.userID)) } }
    case let r as ASAuthorizationPlatformPublicKeyCredentialRegistration:
      r.rawAttestationObject.map { .registration(NewPasskey(credentialId: r.credentialID, clientDataJSON: r.rawClientDataJSON, attestationObject: $0)) }
    default:
      nil
    }
    MainActor.assumeIsolated { finish(answer.map { .success($0) } ?? .failure(URLError(.badServerResponse))) }
  }

  nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    let code = (error as? ASAuthorizationError)?.code
    let exists = if #available(iOS 18, *) { code == .matchedExcludedCredential } else { false }
    MainActor.assumeIsolated { finish(.failure(code == .canceled ? PasskeySignInCancelled() : exists ? PasskeyExists() : error)) }
  }

  nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
  }
}

#if DEBUG
/// The simulator's UI tests (the simulator can't run the real sheet): one passkey, the one `FakeServer` adds with
/// `-seed-passkey` or "Thêm passkey" makes.
struct FakePasskeySignIn: PasskeySignIn {
  static let credentialId = Data("ui-passkey".utf8)
  func assert(_ c: PasskeyChallenge) async throws -> PasskeyAssertion {
    FakeAccounts.assertion(for: c, credentialId: Self.credentialId, userHandle: nil)
  }
  func register(_ c: NewPasskeyChallenge) async throws -> NewPasskey {
    if c.excluded.contains(Self.credentialId) { throw PasskeyExists() }
    return FakeAccounts.newPasskey(for: c, credentialId: Self.credentialId)
  }
}
#endif
