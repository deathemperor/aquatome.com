import AuthenticationServices
import SwiftUI

/// What Sign in with Apple gives: the identity token (signing in) and a fresh authorization code (Apple's rule for
/// deleting an account: its tokens are revoked with it).
struct AppleAuthorization: Sendable {
  let idToken: String
  let code: String
}

/// The reader closed Apple's sheet: nothing to say.
struct AppleSignInCancelled: Error {}

@MainActor
protocol AppleSignIn {
  /// Apple's sheet. `nonceHash`: the SHA-256 of the server's nonce, for signing in; none for a fresh code.
  func authorize(nonceHash: String?) async throws -> AppleAuthorization
}

/// The system's Sign in with Apple. No name or email address is asked for: the account keeps neither.
@MainActor
final class SystemAppleSignIn: NSObject, AppleSignIn, ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
  private var controller: ASAuthorizationController?
  private var waiting: CheckedContinuation<AppleAuthorization, Error>?

  func authorize(nonceHash: String?) async throws -> AppleAuthorization {
    let request = ASAuthorizationAppleIDProvider().createRequest()
    request.requestedScopes = []
    request.nonce = nonceHash
    let c = ASAuthorizationController(authorizationRequests: [request])
    c.delegate = self
    c.presentationContextProvider = self
    controller = c
    return try await withCheckedThrowingContinuation { waiting = $0; c.performRequests() }
  }

  private func finish(_ result: Result<AppleAuthorization, Error>) {
    waiting?.resume(with: result)
    waiting = nil
    controller = nil
  }

  nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
    let c = authorization.credential as? ASAuthorizationAppleIDCredential
    let token = c?.identityToken.flatMap { String(data: $0, encoding: .utf8) }
    let code = c?.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
    MainActor.assumeIsolated {
      if let token, let code { finish(.success(AppleAuthorization(idToken: token, code: code))) } else { finish(.failure(URLError(.badServerResponse))) }
    }
  }

  nonisolated func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
    let cancelled = (error as? ASAuthorizationError)?.code == .canceled
    MainActor.assumeIsolated { finish(.failure(cancelled ? AppleSignInCancelled() : error)) }
  }

  nonisolated func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
  }
}

#if DEBUG
/// The simulator's UI tests: the token and code `FakeAccounts` takes for the Apple user `ui-apple`.
struct FakeAppleSignIn: AppleSignIn {
  func authorize(nonceHash: String?) async throws -> AppleAuthorization {
    AppleAuthorization(idToken: "ui-apple|\(nonceHash ?? "")", code: "good-ui-apple")
  }
}
#endif

/// Apple's own "Sign in with Apple" button (its look, its words in the phone's language), black or white with the
/// appearance.
struct AppleButton: UIViewRepresentable {
  @Environment(\.colorScheme) private var scheme
  let action: () -> Void

  func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
    let b = ASAuthorizationAppleIDButton(type: .signIn, style: scheme == .dark ? .white : .black)
    b.addTarget(context.coordinator, action: #selector(Coordinator.tap), for: .touchUpInside)
    b.accessibilityIdentifier = "apple-sign-in"
    return b
  }

  func updateUIView(_ view: ASAuthorizationAppleIDButton, context: Context) { context.coordinator.action = action }
  func makeCoordinator() -> Coordinator { Coordinator(action) }

  final class Coordinator: NSObject {
    var action: () -> Void
    init(_ action: @escaping () -> Void) { self.action = action }
    @objc func tap() { action() }
  }
}
