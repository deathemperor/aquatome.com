import CryptoKit
import Handbook
import SwiftUI
import WebKit

/// One of the site's pages, in the app. Each page read is kept on the phone (a web archive) and shown from there when
/// the phone is offline.
struct PageView: View {
  let item: HandbookIndex.Item
  let url: URL
  @State private var offline = false
  @State private var failed = false

  var body: some View {
    WebPage(url: url, offline: $offline, failed: $failed)
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

  func makeCoordinator() -> Coordinator { Coordinator(self) }

  func makeUIView(context: Context) -> WKWebView {
    let config = WKWebViewConfiguration()
    // The site can tell the app's visits from a browser's.
    config.applicationNameForUserAgent = "AquaTomeApp/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0")"
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

  func updateUIView(_ web: WKWebView, context: Context) {}

  /// One rule per ad host: content-blocker filters have no alternation.
  static let noAds = "[" + [#"googlesyndication\\.com"#, #"doubleclick\\.net"#, #"adservice\\.google\\.com"#, #"fundingchoicesmessages\\.google\\.com"#]
    .map { #"{"trigger":{"url-filter":"^[^:]+://+([^:/]+\\.)?"# + $0 + #"[:/]"},"action":{"type":"block"}}"# }
    .joined(separator: ",") + "]"

  @MainActor
  final class Coordinator: NSObject, WKNavigationDelegate {
    let page: WebPage
    init(_ page: WebPage) { self.page = page }

    func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
      // Other sites open in the browser; the app stays on aquatome.com.
      guard let u = action.request.url, action.navigationType == .linkActivated, u.host != page.url.host else { return .allow }
      _ = await UIApplication.shared.open(u)
      return .cancel
    }

    func webView(_ web: WKWebView, didFinish navigation: WKNavigation!) {
      guard let u = web.url, u.host == page.url.host, !page.offline else { return }
      web.createWebArchiveData { result in
        if case .success(let data) = result { try? data.write(to: PageStore.file(for: u), options: .atomic) }
      }
    }

    func webView(_ web: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
      let u = (error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL ?? page.url
      if let data = try? Data(contentsOf: PageStore.file(for: u)) {
        page.offline = true
        web.load(data, mimeType: "application/x-webarchive", characterEncodingName: "utf-8", baseURL: u)
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
