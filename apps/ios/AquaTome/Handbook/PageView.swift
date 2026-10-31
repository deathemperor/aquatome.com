import CryptoKit
import Handbook
import SwiftUI
import WebKit

/// One of the site's pages, in the app. Each page read is kept on the phone (a web archive) and shown from there when
/// the phone is offline.
struct PageView: View {
  let item: HandbookIndex.Item
  let url: URL
  @Environment(TanksModel.self) private var tanks
  @Environment(\.openScreen) private var openScreen
  @State private var offline = false
  @State private var failed = false

  var body: some View {
    // The site's tools save to "Bể của tôi": here, to the app's tanks (PageBridge).
    WebPage(url: url, offline: $offline, failed: $failed, store: tanks.storeForPages(), saved: { tanks.mergeFromPage($0) }, open: openScreen)
      .ignoresSafeArea(edges: .bottom)
      .navigationTitle(item.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ShareLink(item: url)
        Link(destination: url) { Image(systemName: "safari") }.accessibilityLabel(Text("Mở trong trình duyệt"))
      }
      .safeAreaInset(edge: .top) {
        if offline || failed {
          Text(failed ? "Không tải được trang. Kiểm tra kết nối mạng." : "Đang xem bản đã lưu (ngoại tuyến).")
            .font(.footnote)
            .padding(8)
            .frame(maxWidth: .infinity)
            .background(.bar)
            .accessibilityIdentifier("page-status")
        }
      }
      .accessibilityIdentifier("page")
  }
}

private struct WebPage: UIViewRepresentable {
  let url: URL
  @Binding var offline: Bool
  @Binding var failed: Bool
  /// The app's tanks as JSON for the pages (nil: none to hand them), and what to do with a page's.
  let store: String?
  let saved: (Data) -> Void
  /// A link to a page the app has as its own screen.
  let open: (AppScreen) -> Void

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    // The site can tell the app's visits from a browser's.
    config.applicationNameForUserAgent = "AquaTomeApp/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0")"
    // The handler goes through a weak link: the content controller keeps what it's given, and the coordinator keeps the
    // web view.
    config.userContentController.add(WeakHandler(context.coordinator), name: PageBridge.handler)
    context.coordinator.bridge(config.userContentController)
    let web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = context.coordinator
    web.allowsBackForwardNavigationGestures = true
    // Ads stay out of the app: AdSense isn't allowed in an app's web view that isn't registered with Google.
    WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "no-ads", encodedContentRuleList: Self.noAds) { list, _ in
      if let list { web.configuration.userContentController.add(list) }
      web.load(URLRequest(url: url))
    }
    return web
  }

  func updateUIView(_ web: WKWebView, context: Context) {
    let was = context.coordinator.page.store
    context.coordinator.page = self
    // The tanks changed (in the app, by the account, or by this page's save): the page open now, and the next ones.
    guard store != was else { return }
    context.coordinator.bridge(web.configuration.userContentController)
    if let store { web.evaluateJavaScript(PageBridge.update(store: store, site: url)) }
  }

  static func dismantleUIView(_ web: WKWebView, coordinator: Coordinator) {
    web.configuration.userContentController.removeScriptMessageHandler(forName: PageBridge.handler)
  }

  /// One rule per ad host: content-blocker filters have no alternation.
  static let noAds = "[" + [#"googlesyndication\\.com"#, #"doubleclick\\.net"#, #"adservice\\.google\\.com"#, #"fundingchoicesmessages\\.google\\.com"#]
    .map { #"{"trigger":{"url-filter":"^[^:]+://+([^:/]+\\.)?"# + $0 + #"[:/]"},"action":{"type":"block"}}"# }
    .joined(separator: ",") + "]"

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
    var page: WebPage
    /// The load of the kept copy, shown offline: not kept again, and it doesn't clear the offline note.
    private var archive: WKNavigation?
    /// Whether the site answered the page now loading with a page (2xx), not an error page to keep over a good copy.
    private var answered = true

    init(_ page: WebPage) { self.page = page }

    /// The tanks script for the pages to come, with the app's store as it is now.
    func bridge(_ content: WKUserContentController) {
      content.removeAllUserScripts()
      content.addUserScript(WKUserScript(source: PageBridge.script(store: page.store, site: page.url), injectionTime: .atDocumentStart, forMainFrameOnly: true))
    }

    /// A store one of the site's pages sent (it saved, or the web view held one): merged into the app's.
    func userContentController(_ content: WKUserContentController, didReceive message: WKScriptMessage) {
      let origin = message.frameInfo.securityOrigin
      guard message.frameInfo.isMainFrame, PageBridge.trusts(scheme: origin.protocol, host: origin.host, site: page.url),
            let json = message.body as? String else { return }
      page.saved(Data(json.utf8))
    }

    func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
      guard let u = action.request.url else { return .allow }
      switch PageRoute.of(u, site: page.url, mainFrame: action.targetFrame?.isMainFrame ?? true, newWindow: action.targetFrame == nil) {
      case .app:
        // A tapped link to "Bể của tôi" (the tools' "Xem trong Bể của tôi →" after a save) or the Chihiros page: the app's
        // own tab. Only a tap: the page's first load, back and reload stay as they are.
        if action.targetFrame?.isMainFrame == true, action.navigationType == .linkActivated, let screen = AppScreen.of(u, site: page.url) {
          page.open(screen)
          return .cancel
        }
        return .allow
      case .none: return .cancel
      case .outside:
        _ = await UIApplication.shared.open(u)
        return .cancel
      }
    }

    func webView(_ web: WKWebView, decidePolicyFor response: WKNavigationResponse) async -> WKNavigationResponsePolicy {
      if response.isForMainFrame, let http = response.response as? HTTPURLResponse { answered = (200..<300).contains(http.statusCode) }
      return .allow
    }

    func webView(_ web: WKWebView, didFinish navigation: WKNavigation!) {
      if navigation === archive { return archive = nil }
      // Online again: the notes go, and the page is kept for next time.
      page.offline = false
      page.failed = false
      guard let u = web.url, PageRoute.of(u, site: page.url, mainFrame: true, newWindow: false) == .app, answered else { return }
      web.createWebArchiveData { result in
        if case .success(let data) = result { try? data.write(to: PageStore.file(for: u), options: .atomic) }
      }
    }

    func webView(_ web: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
      // Another load took its place (the reader tapped on, or went back): nothing failed.
      if isInterruption(error) { return }
      let u = (error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL ?? page.url
      if let data = try? Data(contentsOf: PageStore.file(for: u)) {
        page.offline = true
        archive = web.load(data, mimeType: "application/x-webarchive", characterEncodingName: "utf-8", baseURL: u)
      } else {
        page.failed = true
      }
    }
  }
}

/// Pages kept for offline reading, one web archive per address, in the caches folder (the system may clear it).
enum PageStore {
  static func file(for url: URL) -> URL {
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("pages", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let key = SHA256.hash(data: Data(url.absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
    return dir.appendingPathComponent("\(key).webarchive")
  }
}

/// Passes messages on without keeping the coordinator alive.
private final class WeakHandler: NSObject, WKScriptMessageHandler {
  weak var target: WKScriptMessageHandler?
  init(_ target: WKScriptMessageHandler) { self.target = target }
  func userContentController(_ content: WKUserContentController, didReceive message: WKScriptMessage) {
    target?.userContentController(content, didReceive: message)
  }
}
