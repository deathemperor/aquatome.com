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
  /// A part to open the page at (NativePage.at).
  var at: String?
  @Environment(TanksModel.self) private var tanks
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen
  @Environment(ChatStore.self) private var chat
  @Environment(\.v2PostClose) private var closePost
  @Environment(AccountModel.self) private var account
  @Environment(\.colorScheme) private var scheme
  @Environment(\.dynamicTypeSize) private var size
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.accessibilityReduceTransparency) private var opaque
  /// The app's look: the lighter top is v2's (V2Switch); the old look keeps the old top.
  @AppStorage(V2Switch.key) private var v2 = V2Switch.byDefault
  /// The way round a long guide (PageNavigator), its title in the bar: the owner's alone for now.
  @State private var navigator = PageNavigator()
  /// The lighter top's: the words under the photo have reached the bar, so the band comes and the shade goes.
  @State private var scrolled = false
  /// Saved or unsaved from the ⋯, which shows no bookmark: a tap felt (`sensoryFeedback`).
  @State private var savedFromMore = 0
  /// The page's sources, for the navigator's list: their heading's id and how many.
  @State private var sources: (id: String, count: Int)?
  @State private var width: CGFloat = 0
  @State private var offline = false
  @State private var failed = false
  @State private var putting = false
  /// The tank to open once the put sheet has closed.
  @State private var openAfter: String?
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
        NativePage(pieces: pieces, facts: facts(inPage: true), put: inPagePut ? { putting = true } : nil, ask: chat.on ? ChatRoute(about: item) : nil,
                   web: { onWeb = true }, nameInView: { nameInView = $0 }, path: item.path, at: at, stillPhoto: item.img,
                   underBar: lighter, scrolled: { s in withAnimation(.easeInOut(duration: 0.2)) { scrolled = s } }, navigator: trying, sources: sources)
      } else if native && !tried {
        // Its photo and name while the page is read: a card zoomed into a screen with only a spinner on it, black in dark mode.
        // Under the bar as the page will be, its photo in the same box.
        NativePage(pieces: NativePage.head(item), web: {}, underBar: lighter)
          .overlay(alignment: .bottom) { LateSpinner().padding(.bottom, 64) }
          // Not the page's own id, which says the page has come: an outer id wins.
          .accessibilityIdentifier("page-head")
      } else {
        // The site's tools save to "Bể của tôi": here, to the app's tanks (PageBridge).
        WebPage(url: url, lang: handbook.lang, offline: $offline, failed: $failed, store: tanks.storeForPages(), saved: { tanks.mergeFromPage($0) }, open: openScreen)
          // On the page alone: on the whole screen, it would take the place of the facts' own (an outer id wins).
          .accessibilityIdentifier("page")
          .ignoresSafeArea(edges: .bottom)
      }
    }
      .task(id: item.path) {
        // Opened before the index said the app draws this kind: the web page, for this visit (not a spinner later).
        guard handbook.drawsItself(item), !tried else { tried = true; return }
        let traits = item.kind == .fish ? FactsCard.traits(item.facts) : nil
        let doc = await handbook.doc(item)
        pieces = doc.map { NativePage.pieces($0, traits: traits) }
        sources = doc?.blocks.lazy.compactMap { if case let .refs(_, id?, items, _) = $0 { (id, items.count) } else { nil } }.first
        tried = true
      }
      // The lighter top: no band until the words under the photo reach the bar, over the photo the bar's words white.
      .modifier(ClearUnderTopBar(shown: !lighter || scrolled))
      .toolbarBackground(lighter ? .hidden : .automatic, for: .navigationBar)
      .toolbarColorScheme(lighter ? (scrolled ? scheme : .dark) : nil, for: .navigationBar)
      .overlay(alignment: .top) { if lighter { shade } }
      // The bar's middle is the page's own item (the name once scrolled, or none), so iOS's title never shows; it names the
      // page in the back button's list.
      .navigationTitle(item.name)
      .navigationBarTitleDisplayMode(.inline)
      // A Hôm nay post's ✕ (v2), after the page's buttons: a toolbar applied inside theirs comes after them. On the lighter
      // top, on its dark disc over the photo, as a fish post's.
      .v2PostCloseButton(lighter ? nil : closePost)
      .toolbar(when: lighter && closePost != nil) {
        ToolbarItem(placement: .topBarTrailing) {
          Button { closePost?() } label: { round("xmark") }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Đóng"))
            .accessibilityIdentifier("v2-close-post")
        }
        .v2Glass(scrolled)
      }
      .toolbar {
        if lighter {
          lighterBar
        } else {
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
      }
      .sensoryFeedback(.success, trigger: savedFromMore)
      .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
      .safeAreaInset(edge: .top) {
        // Not under the lighter top: its band, drawn behind the bar, is the black band it takes away.
        if !lighter {
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
      }
      .onAppear { handbook.read(item) }
      .ownerShows(item.path, as: "\(item.kind.rawValue) page")
      .sheet(isPresented: $putting, onDismiss: {
        if let id = openAfter { openAfter = nil; openScreen(.tanks(id)) }
      }) {
        if let life = Life(item) { NavigationStack { PutOnTank(life: life, open: { openAfter = $0; putting = false }) } }
      }
  }

  /// A guide's or a kind of kit's page the app draws in v2, with a photo at its head: a fish page's lighter top (the photo
  /// under the bar and the status bar, iOS's back, one ⋯), and the owner's navigator on a long one. Every other page, and
  /// the old look, keeps its top.
  private var lighter: Bool {
    guard #available(iOS 18, *), v2 else { return false }
    guard item.kind == .guide || item.kind == .equipment, handbook.drawsItself(item), !onWeb else { return false }
    guard let first = pieces?.first else { return !tried && item.img != nil }
    if case .photo(_, _, _, _, _, _, _, true) = first { return true }
    return false
  }

  /// The navigator, the owner's alone for now, once the page has come.
  private var trying: PageNavigator? { account.owner.isOwner == true && lighter && pieces != nil ? navigator : nil }

  /// The lighter top's bar: iOS's back, then for the owner Mục lục; at the right one ⋯ holding save, share and the browser.
  @ToolbarContentBuilder private var lighterBar: some ToolbarContent {
    if let trying, trying.long {
      ToolbarItem(placement: .topBarLeading) {
        PageNavigatorTitle(nameInView: nameInView, onColour: !scrolled, onPhoto: !scrolled, navigator: trying, name: item.name)
          // A width of its own, as a fish page's (`titleWidth` there): offered "up to", the bar gave it next to none.
          .frame(width: titleWidth + 20, alignment: .leading)
          .frame(width: titleWidth, alignment: .leading)
          .environment(\.dynamicTypeSize, size)
      }
      .v2Glass(false)
    }
    // The bar's middle: for a reader, the name once it has gone under the bar; with the owner's navigator, which names the
    // part being read, nothing. Always an item of the page's own, so iOS's title never stands there.
    ToolbarItem(placement: .principal) {
      if trying?.long == true {
        // No room taken from Mục lục: wider, iOS folds the bar's items into a "⋯" of its own.
        Color.clear.frame(width: 0, height: 0).accessibilityHidden(true)
      } else {
        Text(item.name).font(.headline).lineLimit(1)
          .opacity(nameInView ? 0 : 1)
          .animation(.easeOut(duration: 0.2), value: nameInView)
          .accessibilityHidden(nameInView)
      }
    }
    ToolbarItem(placement: .topBarTrailing) {
      Menu {
        let saved = handbook.isSaved(item)
        Button(saved ? String(localized: "Bỏ lưu") : String(localized: "Lưu để đọc sau"), systemImage: saved ? "bookmark.fill" : "bookmark") {
          handbook.toggleSaved(item)
          savedFromMore += 1
        }
        .accessibilityIdentifier("save-for-later")
        ShareLink(item: url) { Label("Chia sẻ", systemImage: "square.and.arrow.up") }
        Link(destination: url) { Label("Mở trong trình duyệt", systemImage: "safari") }
      } label: {
        round("ellipsis")
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text("Thêm"))
      .accessibilityIdentifier("page-more")
    }
    .v2Glass(scrolled)
  }

  /// White on a dark circle over the photo, in a 44-point tap area; past it, iOS's glass around it (`v2Glass`), as a fish
  /// page's.
  private func round(_ symbol: String) -> some View {
    Image(systemName: symbol)
      .font(.body.weight(.semibold))
      .dynamicTypeSize(...DynamicTypeSize.xLarge)
      .foregroundStyle(scrolled ? Color.primary : Color.white)
      .frame(width: 44, height: 44)
      .background {
        Circle().fill(.black.opacity(scrolled ? 0 : PageTop.ground(reduceTransparency: opaque)))
          .frame(width: PageTop.disc, height: PageTop.disc)
      }
      .contentShape(Circle())
  }

  /// A shade behind the status bar and the bar, until the band comes, so the clock and iOS's back read on a light photo
  /// (`PageTop`, as a fish page's); under Reduce Motion it goes at once.
  private var shade: some View {
    VStack(spacing: 0) {
      LinearGradient(stops: [.init(color: .black.opacity(PageTop.shadeOpacity), location: 0),
                             .init(color: .black.opacity(PageTop.shadeHeldOpacity), location: PageTop.shadeHeld),
                             .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom)
        .frame(height: PageTop.shadeHeight)
      Spacer(minLength: 0)
    }
    .ignoresSafeArea()
    // Gone too while Mục lục's list is open: laid over the page, list and all, it greyed the list's top rows (Design's
    // parity, 14 Nov). The list's own dimming covers the photo then.
    .opacity(scrolled || trying?.listOpen == true ? 0 : 1)
    .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: scrolled)
    .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: trying?.listOpen)
    .allowsHitTesting(false)
  }

  /// How wide the navigator's title may be beside the back button, as a fish page's: any wider and iOS folds the bar's
  /// items into a "⋯" of its own.
  private var titleWidth: CGFloat { max(80, (width > 0 ? width : 402) - 240) }

  /// The page the app draws has a place for putting the fish or plant on a tank, under its name (`.facts`).
  private var inPagePut: Bool {
    Life(item) != nil && pieces?.contains { if case .facts = $0 { true } else { false } } == true
  }

  /// A fish's facts, from the index on the phone (there offline, with or without the page); a plant's care, as its page
  /// lists it, not a temperature the index may also have for it.
  private func facts(inPage: Bool) -> FactsCard? {
    if item.kind == .fish, item.facts.any { return FactsCard(facts: item.facts, inPage: inPage) }
    // A breed checked as its species keeps its own figures apart, as its page's data card gives them.
    if item.kind == .fish, let card = item.card, card.any { return FactsCard(facts: card, inPage: inPage) }
    if item.kind == .plant, let plant = item.plant, plant.any { return FactsCard(facts: .init(), plant: plant, inPage: inPage) }
    return nil
  }
}

private extension View {
  /// A toolbar's items only when `on`, after the view's other toolbars' items; on iOS 26 a fixed space first, so the bar's
  /// glass doesn't draw them in one capsule with the others (as a fish post's ✕, `Species.swift`).
  @ViewBuilder func toolbar<C: ToolbarContent>(when on: Bool, @ToolbarContentBuilder _ content: () -> C) -> some View {
    if !on {
      self
    } else if #available(iOS 26, *) {
      toolbar { ToolbarSpacer(.fixed, placement: .topBarTrailing); content() }
    } else {
      toolbar(content: content)
    }
  }
}

/// A page of the site at an address the app can't show itself (left out of the index, or asking for more than the page,
/// as a tool set to a fish): the web page, kept for offline as any is.
struct WebScreen: View {
  let url: URL
  @Environment(HandbookModel.self) private var handbook
  @Environment(TanksModel.self) private var tanks
  @Environment(\.openScreen) private var openScreen
  @State private var offline = false
  @State private var failed = false

  var body: some View {
    WebPage(url: url, lang: handbook.lang, offline: $offline, failed: $failed, store: tanks.storeForPages(), saved: { tanks.mergeFromPage($0) }, open: openScreen)
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
    .ownerScreen("web page", path: url.host == handbook.site.host ? url.path : nil)
  }
}

private struct WebPage: UIViewRepresentable {
  let url: URL
  /// The index's language, for a link to a tool whose state names its pages (AppScreen.of).
  let lang: String
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
    // The app's own band stands behind the title (ClearUnderTopBar on the page), as on its other screens.
    if #available(iOS 26.0, *) { web.scrollView.topEdgeEffect.isHidden = true }
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
        if action.targetFrame?.isMainFrame == true, action.navigationType == .linkActivated, let screen = AppScreen.of(u, site: page.url, lang: page.lang) {
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

/// A spinner for a wait long enough to need one: most pages come sooner, and one shown for a moment only flickers.
private struct LateSpinner: View {
  @State private var shown = false
  var body: some View {
    ProgressView().opacity(shown ? 1 : 0)
      .task {
        try? await Task.sleep(for: .milliseconds(700))
        shown = true
      }
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
