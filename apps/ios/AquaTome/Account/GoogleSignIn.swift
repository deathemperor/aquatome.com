import AccountSync
import AuthenticationServices
import os
import SwiftUI

/// The reader closed Google's page: nothing to say.
struct GoogleSignInCancelled: Error {}

@MainActor
protocol GoogleSignIn {
  /// Google's sign-in page at `url`, in a browser sheet: the address Google sends the reader back to.
  func open(_ url: URL) async throws -> URL
  /// How the app reaches Google's token endpoint.
  var send: Send { get }
}

/// Google's page in the system's browser sheet (ASWebAuthenticationSession), which takes Google's answer at the client's
/// callback scheme itself: nothing to register in Info.plist. The sheet shares Safari's cookies (it isn't an ephemeral
/// session), so a reader signed in to Google there only picks an account, as they would on the website.
@MainActor
final class SystemGoogleSignIn: NSObject, GoogleSignIn, ASWebAuthenticationPresentationContextProviding {
  let send = AccountsClient.urlSession()
  /// Held until Google's page closes.
  private var session: ASWebAuthenticationSession?

  func open(_ url: URL) async throws -> URL {
    defer { session = nil }
    return try await withCheckedThrowingContinuation { waiting in
      // Once: a session that can't start may also call back.
      let resumed = OSAllocatedUnfairLock(initialState: false)
      let finish = { @Sendable (result: Result<URL, Error>) in
        if resumed.withLock({ was in defer { was = true }; return !was }) { waiting.resume(with: result) }
      }
      // Called on whichever queue the sheet likes: it only resumes the wait.
      let done = { @Sendable (answer: URL?, error: Error?) in
        if let answer { finish(.success(answer)) }
        else if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { finish(.failure(GoogleSignInCancelled())) }
        else { finish(.failure(error ?? URLError(.badServerResponse))) }
      }
      let s = if #available(iOS 17.4, *) {
        ASWebAuthenticationSession(url: url, callback: .customScheme(GoogleOAuth.callbackScheme), completionHandler: done)
      } else {
        ASWebAuthenticationSession(url: url, callbackURLScheme: GoogleOAuth.callbackScheme, completionHandler: done)
      }
      s.presentationContextProvider = self
      session = s
      if !s.start() { finish(.failure(URLError(.cannotLoadFromNetwork))) }
    }
  }

  nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
    }
  }
}

#if DEBUG
/// The simulator's UI tests: Google's page and token endpoint as `FakeGoogle` plays them (the reader `ui-google` picks
/// their account), with no browser and no network. `-fake-google cancel`: the reader closes the page.
struct FakeGoogleSignIn: GoogleSignIn {
  let cancels: Bool
  let send: Send = { try FakeGoogle.send($0) }

  init(_ args: [String]) {
    cancels = args.firstIndex(of: "-fake-google").map { $0 + 1 < args.count && args[$0 + 1] == "cancel" } ?? false
  }

  func open(_ url: URL) async throws -> URL {
    if cancels { throw GoogleSignInCancelled() }
    return FakeGoogle.page(url)
  }
}
#endif

/// "Đăng nhập bằng Google" as Google's branding guidelines draw it on iOS (developers.google.com/identity/branding-guidelines):
/// Google's four-colour "G" at 20 points, 16 points in from the edge and 12 from the words, on Google's light button, or
/// its dark one in the dark. As tall as Apple's button above it, and as wide. Google Sans isn't on the phone, so the
/// system font in its weight; at 16 points, the size of Apple's words above (Google's 14 read smaller beside them, and
/// Google asks for the same weight as other sign-in buttons).
struct GoogleButton: View {
  @Environment(AccountModel.self) private var account
  @Environment(\.colorScheme) private var scheme
  /// Pill-shaped and as tall as the Apple button beside it (the Tài khoản sheet's card), else Google's 4-point corners.
  var capsule = false

  var body: some View {
    let dark = scheme == .dark
    Button { Task { await account.signInWithGoogle() } } label: {
      HStack(spacing: 12) {
        Image("GoogleG").resizable().frame(width: 20, height: 20).accessibilityHidden(true)
        Text("Đăng nhập bằng Google").font(.system(size: 16, weight: .medium)).lineLimit(1).minimumScaleFactor(0.8)
      }
      .padding(.horizontal, 16)
      .frame(maxWidth: .infinity, minHeight: capsule ? 48 : 44, maxHeight: capsule ? 48 : 44)
      .foregroundStyle(dark ? Self.rgb(0xE3E3E3) : Self.rgb(0x1F1F1F))
      .background(dark ? Self.rgb(0x131314) : .white, in: .rect(cornerRadius: capsule ? 24 : 4))
      .overlay(RoundedRectangle(cornerRadius: capsule ? 24 : 4).strokeBorder(dark ? Self.rgb(0x8E918F) : Self.rgb(0x747775), lineWidth: 1))
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(account.working || !account.canSync)
    .opacity(account.working ? 0.5 : 1)
    .accessibilityIdentifier("google-sign-in")
  }

  private static func rgb(_ hex: Int) -> Color {
    Color(red: Double(hex >> 16 & 0xFF) / 255, green: Double(hex >> 8 & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
  }
}
