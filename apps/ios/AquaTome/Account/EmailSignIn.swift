import AccountSync
import SwiftUI
import WebKit

/// Signing in with a code sent by email: the address and Cloudflare's Turnstile check (against bots sending mail to
/// anyone), then the 6-digit code. The same address as on aquatome.com opens the same account, and so does Google there
/// when it signs in with this address.
struct EmailSignIn: View {
  @Environment(AccountModel.self) private var account
  @Environment(\.dismiss) private var dismiss
  @State private var address = ""
  @State private var code = ""
  /// The check's token: one per code asked for.
  @State private var token: String?
  /// Changed to ask the check for a new token.
  @State private var check = 0
  @State private var checkFailed = false
  @FocusState private var codeFocused: Bool

  var body: some View {
    NavigationStack {
      Form {
        if let to = account.codeSentTo {
          Section {
            Text("Đã gửi mã tới \(to). Mở email và nhập mã 6 số.")
            TextField("Mã 6 số trong email", text: $code)
              .textContentType(.oneTimeCode)
              .keyboardType(.numberPad)
              .focused($codeFocused)
              .accessibilityIdentifier("email-code")
            Button("Đăng nhập") { Task { if await account.verify(code: code) { dismiss() } } }
              .disabled(AccountsClient.codeDigits(code).count != 6 || account.working)
              .accessibilityIdentifier("verify-code")
            Button("Gửi lại mã") {
              account.cancelEmail()
              code = ""
            }
            .disabled(account.working)
          }
          .onAppear { codeFocused = true }
        } else {
          Section {
            TextField("Địa chỉ email", text: $address)
              .textContentType(.emailAddress)
              .keyboardType(.emailAddress)
              .textInputAutocapitalization(.never)
              .autocorrectionDisabled()
              .submitLabel(.send)
              .onSubmit(send)
              .accessibilityIdentifier("email-address")
            TurnstileCheck(url: account.turnstilePage, fake: account.fakeChecks, check: check, token: $token, failed: $checkFailed)
            if checkFailed {
              Button("Chưa chạy được bước kiểm tra chống spam: bấm để thử lại.") { checkFailed = false; check += 1 }
                .foregroundStyle(.red)
            }
            Button("Gửi mã", action: send)
              .disabled(token == nil || address.trimmingCharacters(in: .whitespaces).isEmpty || account.working)
              .accessibilityIdentifier("send-code")
          } footer: {
            Text("Địa chỉ chỉ dùng để gửi mã. Tài khoản chỉ giữ nó ở dạng mã hóa một chiều.")
          }
        }
        if let m = account.message {
          Text(m.text).foregroundStyle(m.bad ? .red : .secondary).accessibilityIdentifier("email-message")
        }
      }
      .navigationTitle("Đăng nhập bằng email")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
      }
    }
    .onAppear { account.emailOpened() }
    .onDisappear { account.emailClosed() }
  }

  private func send() {
    guard let t = token, !account.working else { return }
    // A token is used once, sent or not: the check gives a new one for the next try.
    token = nil
    check += 1
    Task { _ = await account.sendCode(to: address, turnstile: t) }
  }
}

/// Cloudflare's Turnstile check, which runs only in a web page on aquatome.com (the server checks the host): that page,
/// in a web view, hands each token over. Usually it passes by itself; sometimes it asks for a tap. The UI tests' stand-in
/// gives a new token at once.
private struct TurnstileCheck: View {
  let url: URL
  let fake: Bool
  let check: Int
  @Binding var token: String?
  @Binding var failed: Bool

  var body: some View {
    if fake {
      Color.clear.frame(height: 1).task(id: check) { token = "ui-check-\(UUID().uuidString)" }
    } else {
      TurnstileWeb(url: url, check: check, token: $token, failed: $failed)
        .frame(height: 70)
        .listRowInsets(EdgeInsets(top: 4, leading: 8, bottom: 4, trailing: 8))
    }
  }
}

private struct TurnstileWeb: UIViewRepresentable {
  static let handler = "turnstile"
  let url: URL
  let check: Int
  @Binding var token: String?
  @Binding var failed: Bool

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    // Turnstile keeps what it needs in the page's storage (Cloudflare's guide for apps).
    config.websiteDataStore = .default()
    config.userContentController.add(context.coordinator, name: Self.handler)
    let web = WKWebView(frame: .zero, configuration: config)
    web.isOpaque = false
    web.backgroundColor = .clear
    web.scrollView.backgroundColor = .clear
    web.scrollView.isScrollEnabled = false
    web.navigationDelegate = context.coordinator
    web.accessibilityIdentifier = "turnstile"
    context.coordinator.check = check
    web.load(URLRequest(url: url))
    return web
  }

  func updateUIView(_ web: WKWebView, context: Context) {
    let c = context.coordinator
    c.view = self
    guard c.check != check else { return }
    c.check = check
    // A new token: from the widget, or the page again if it never loaded.
    if c.loaded { web.evaluateJavaScript("again()") } else { web.load(URLRequest(url: url)) }
  }

  static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
    web.configuration.userContentController.removeScriptMessageHandler(forName: handler)
  }

  @MainActor
  final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    var view: TurnstileWeb
    var check = 0
    var loaded = false

    init(_ view: TurnstileWeb) { self.view = view }

    func userContentController(_ content: WKUserContentController, didReceive message: WKScriptMessage) {
      guard let o = message.body as? [String: Any] else { return }
      if let t = o["token"] as? String {
        view.token = t
        view.failed = false
      } else {
        // Expired, or the check failed: no token until a new one comes.
        view.token = nil
        guard let error = o["error"] as? String else { return }
        view.failed = true
        // Cloudflare's script didn't load, or there's no widget: trying again loads the page again, not `again()`.
        if ["load", "render", "none"].contains(error) { loaded = false }
      }
    }

    /// The check's page, Cloudflare's challenge and its blank frames load here; a link the reader taps (Cloudflare's
    /// privacy page, its terms) opens in the browser.
    func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
      guard let u = action.request.url else { return .cancel }
      if action.navigationType == .linkActivated, ["http", "https"].contains(u.scheme) {
        await UIApplication.shared.open(u)
        return .cancel
      }
      let ours = u.scheme == "about" || (u.scheme == "https" && (u.host == view.url.host || u.host == "challenges.cloudflare.com"))
      return ours ? .allow : .cancel
    }

    /// The server's error page (email sign-in off, accounts off, a server error) holds no check: not loaded.
    func webView(_ web: WKWebView, decidePolicyFor response: WKNavigationResponse) async -> WKNavigationResponsePolicy {
      guard response.isForMainFrame, let http = response.response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) else { return .allow }
      notLoaded()
      return .cancel
    }

    func webView(_ web: WKWebView, didFinish navigation: WKNavigation!) { loaded = true }
    /// iOS ended the page's process (the app in the background a while): the check is gone with it.
    func webViewWebContentProcessDidTerminate(_ web: WKWebView) { notLoaded() }
    func webView(_ web: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { notLoaded() }
    func webView(_ web: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { notLoaded() }

    private func notLoaded() {
      loaded = false
      view.token = nil
      view.failed = true
    }
  }
}
