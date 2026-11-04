import AccountSync
import CryptoKit
import Handbook
import SwiftUI
import WebKit

/// One of the site's pages, in the app, from either tab: drawn by the app from the site's blocks when the site publishes
/// its kind that way (NativePage, kept on the phone by PageCache), else the web page. Each web page read is kept on the
/// phone (a web archive) and shown from there when the phone is offline. The toolbar, the facts and "read" are the same
/// for both: the facts under the name on the app's page, across the top of the web page.
struct PageView: View {
  let item: HandbookIndex.Item
  let url: URL
  @Environment(TanksModel.self) private var tanks
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen
  @State private var offline = false
  @State private var failed = false
  @State private var putting = false
  /// The page as the app draws it, once looked for (`tried`); the web page when there's none or the reader asks for it.
  @State private var pieces: [NativePage.Piece]?
  @State private var tried = false
  @State private var onWeb = false
  /// The name under the page's photo on the screen: the bar's name hidden, not said twice. In view at first where the
  /// page says when it scrolls away (iOS 18 on): a page opens on its name, and the bar shouldn't show it then fade.
  @State private var nameInView: Bool = {
    if #available(iOS 18, *) { return true }
    return false
  }()

  var body: some View {
    // A taxon or origin page: the app's shelf of the fish it lists (HandbookShelves.page(at:)); the web page if the
    // index no longer has it.
    if item.kind == .taxon || item.kind == .origin, let shelf = handbook.shelves.page(at: item.path) {
      TaxaShelf(page: shelf)
    } else {
      page
    }
  }

  @ViewBuilder private var page: some View {
    let native = handbook.drawsItself(item) && !onWeb
    Group {
      if native, let pieces {
        NativePage(pieces: pieces, facts: facts(inPage: true), put: inPagePut ? { putting = true } : nil, web: { onWeb = true },
                   nameInView: { nameInView = $0 })
      } else if native && !tried {
        ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
      } else {
        // The site's tools save to "Bể của tôi": here, to the app's tanks (PageBridge).
        WebPage(url: url, offline: $offline, failed: $failed, store: tanks.storeForPages(), saved: { tanks.mergeFromPage($0) }, open: openScreen)
          // On the page alone: on the whole screen, it would take the place of the facts' own (an outer id wins).
          .accessibilityIdentifier("page")
          .ignoresSafeArea(edges: .bottom)
      }
    }
      .task(id: item.path) {
        // Opened before the index said the app draws this kind: the web page, for this visit (not a spinner later).
        guard handbook.drawsItself(item), !tried else { tried = true; return }
        pieces = await handbook.doc(item).map(NativePage.pieces)
        tried = true
      }
      .navigationTitle(item.name)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        // The page the app draws shows its name under its photo: the bar's, once that has scrolled away.
        if native && pieces != nil {
          ToolbarItem(placement: .principal) {
            Text(item.name).font(.headline).lineLimit(1)
              .opacity(nameInView ? 0 : 1)
              .animation(.easeOut(duration: 0.2), value: nameInView)
              .accessibilityHidden(nameInView)
          }
        }
        ToolbarItemGroup(placement: .primaryAction) {
          // A fish or plant page: onto one of the reader's tanks (TankLife.swift); the page the app draws has it under
          // the name (none in the bar while it is read, to come and go).
          if Life(item) != nil, !(native && (inPagePut || !tried)) {
            // Not into a store this app must leave alone (newer, unreadable).
            Button { putting = true } label: { Label("Thêm vào bể", systemImage: "plus.circle") }
              .disabled(!tanks.canEdit).accessibilityIdentifier("put-on-tank")
          }
          // Saved to read later, on this phone (the Tìm tab lists them).
          let saved = handbook.isSaved(item)
          Button { handbook.toggleSaved(item) } label: {
            Label(saved ? "Bỏ lưu" : "Lưu để đọc sau", systemImage: saved ? "bookmark.fill" : "bookmark")
          }
          .accessibilityIdentifier("save-for-later")
          PageMore(url: url)
        }
      }
      .safeAreaInset(edge: .top) {
        VStack(spacing: 0) {
          // Over the web page: the page the app draws has them under its name.
          if !(native && (pieces != nil || !tried)), let facts = facts(inPage: false) { facts }
          if offline || failed {
            Text(failed ? "Không tải được trang. Kiểm tra kết nối mạng." : "Đang xem bản đã lưu (ngoại tuyến).")
              .font(.footnote)
              .padding(8)
              .frame(maxWidth: .infinity)
              .accessibilityIdentifier("page-status")
          }
        }
        .background(.bar)
      }
      .onAppear { handbook.read(item) }
      .sheet(isPresented: $putting) { if let life = Life(item) { NavigationStack { PutOnTank(life: life) } } }
  }

  /// The page the app draws has a place for putting the fish or plant on a tank, under its name (`.facts`).
  private var inPagePut: Bool {
    Life(item) != nil && pieces?.contains { if case .facts = $0 { true } else { false } } == true
  }

  /// A fish's facts, from the index on the phone (there offline, with or without the page); a plant's care, as its page
  /// lists it, not a temperature the index may also have for it.
  private func facts(inPage: Bool) -> FactsCard? {
    if item.kind == .fish, item.facts.any { return FactsCard(facts: item.facts, inPage: inPage) }
    if item.kind == .plant, let plant = item.plant, plant.any { return FactsCard(facts: .init(), plant: plant, inPage: inPage) }
    return nil
  }
}

/// A page of the site at an address the app can't show itself (left out of the index, or asking for more than the page,
/// as a tool set to a fish): the web page, kept for offline as any is.
struct WebScreen: View {
  let url: URL
  @Environment(TanksModel.self) private var tanks
  @Environment(\.openScreen) private var openScreen
  @State private var offline = false
  @State private var failed = false

  var body: some View {
    WebPage(url: url, offline: $offline, failed: $failed, store: tanks.storeForPages(), saved: { tanks.mergeFromPage($0) }, open: openScreen)
      .accessibilityIdentifier("page")
      .ignoresSafeArea(edges: .bottom)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { PageMore(url: url) }
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
    // The site can tell the app's visits from a browser's, and our own copies' from readers' (OwnCopy).
    let name = "AquaTomeApp/\(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0")"
    config.applicationNameForUserAgent = OwnCopy.isOurs ? "\(name) \(AccountsClient.ourCopy)" : name
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
      #if DEBUG
      // UI tests (`-fixed-handbook`) read no network: a stand-in, at the page's own address.
      if ProcessInfo.processInfo.arguments.contains("-fixed-handbook") {
        web.loadHTMLString(Self.standIn(url), baseURL: url)
        return
      }
      #endif
      web.load(URLRequest(url: url))
    }
    return web
  }

  #if DEBUG
  /// The site's page in UI tests: its path and query, for a test to tell which page opened.
  static func standIn(_ url: URL) -> String {
    #"<!doctype html><meta name="viewport" content="width=device-width"><p>\#(url.path(percentEncoded: false))\#(url.query(percentEncoded: false).map { "?" + $0 } ?? "")</p>"#
  }
  #endif

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
        await OwnCopy.open(u, site: page.url)
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
      #if DEBUG
      // The stand-in isn't the page: not kept as its offline copy, which would outlast the test run.
      if ProcessInfo.processInfo.arguments.contains("-fixed-handbook") { return }
      #endif
      let file = PageStore.file(for: u, site: page.url)
      web.createWebArchiveData { result in
        if case .success(let data) = result { try? data.write(to: file, options: .atomic) }
      }
    }

    func webView(_ web: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
      // Another load took its place (the reader tapped on, or went back): nothing failed.
      if isInterruption(error) { return }
      let u = (error as NSError).userInfo[NSURLErrorFailingURLErrorKey] as? URL ?? page.url
      if let data = try? Data(contentsOf: PageStore.file(for: u, site: page.url)) {
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
  /// A Vietnamese page's archive is named by its address under "/vi/" whichever form it's opened in (PathForm), as the
  /// archives kept before the site moved those pages are: a page opened at one, or sent from one to the other, finds
  /// its archive at the other.
  static func file(for url: URL, site: URL) -> URL {
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("pages", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    let key = SHA256.hash(data: Data(PathForm.underVi.url(url, site: site).absoluteString.utf8)).map { String(format: "%02x", $0) }.joined()
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

/// A page's less used ways out, in one place in the bar: shared, or opened in the browser.
private struct PageMore: View {
  let url: URL
  var body: some View {
    Menu {
      ShareLink(item: url)
      Link(destination: url) { Label("Mở trong trình duyệt", systemImage: "safari") }
    } label: {
      Label("Khác", systemImage: "ellipsis")
    }
    .accessibilityIdentifier("page-actions")
  }
}
