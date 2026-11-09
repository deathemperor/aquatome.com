import AccountSync
import Handbook
import SwiftUI
import Telemetry
import WebKit

@main
struct AquaTomeApp: App {
  @State private var lights: LightsModel
  @State private var handbook: HandbookModel
  @State private var tanks: TanksModel
  @State private var account: AccountModel
  @State private var plugs: PlugsModel
  @State private var telemetry: TelemetryModel
  /// Whether the chat is on (its entries), and the conversation kept.
  @State private var chat = ChatStore()
  @State private var tab = Tab.handbook
  @State private var tanksPath = NavigationPath()
  @State private var handbookPath = NavigationPath()
  /// The profile button's sheet (AccountView), open.
  @State private var showingAccount = false
  /// v2 (V2Root), or the old look where the reader turned it on in the Tài khoản sheet (V2Switch).
  @AppStorage(V2Switch.key) private var v2 = V2Switch.byDefault
  /// "Giao diện", set in the sheet (AppearanceRow): the phone's, or light or dark.
  @AppStorage(Appearance.key) private var appearance = Appearance.system
  /// A link from outside the app waiting for the handbook's index, to know the pages the app has (AppLink).
  @State private var opening: AppLink?
  @Environment(\.scenePhase) private var phase
  /// The owner's daily report notifications: APNs' token, and a tap on one.
  @UIApplicationDelegateAdaptor(OwnerNotifications.self) private var notifications

  enum Tab {
    case tanks, handbook, lights
    var screen: Screen {
      switch self {
      case .tanks: .tanks
      case .handbook: .handbook
      case .lights: .lights
      }
    }
  }

  init() {
    #if DEBUG
    // UI tests start from a clean phone (no schedule or tank kept from an earlier run), its web views too: a page keeps
    // the tanks it was handed and sends them back to the app (PageBridge), which would bring an earlier test's tanks in.
    if ProcessInfo.processInfo.arguments.contains("-reset-defaults"), let id = Bundle.main.bundleIdentifier {
      UserDefaults.standard.removePersistentDomain(forName: id)
      WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {}
      try? FileManager.default.removeItem(at: TelemetryModel.file)
      try? FileManager.default.removeItem(at: ChatModel.file)
    }
    TanksModel.prepareForTests(ProcessInfo.processInfo.arguments)
    // `-drop-kept-account`: the account kept on the phone is gone (unreadable after an update) while its token stays.
    if ProcessInfo.processInfo.arguments.contains("-drop-kept-account") { UserDefaults.standard.removeObject(forKey: "account.user") }
    // The UI flows (`-no-animations`): after each tap or swipe XCUITest waits for the app to be idle, UIKit's animations
    // ended (a push, a sheet, an alert, the tab bar), up to about 2 s a step on a busy Mac. SwiftUI's own animations
    // turned off too shortened none of those waits, so they stay. Never in the performance tests: they measure the app
    // as a reader sees it.
    if ProcessInfo.processInfo.arguments.contains("-no-animations") { UIView.setAnimationsEnabled(false) }
    #endif
    // The phone's language, taken while the app has none of its own (after the tests' reset): what "Theo máy" gives
    // once it has, though the sheet was never opened (Language.swift).
    _ = AppLanguage.phone
    // Read after the tests' reset above (the handbook keeps the pages read).
    let handbook = HandbookModel()
    _handbook = State(initialValue: handbook)
    let tanks = TanksModel()
    _tanks = State(initialValue: tanks)
    let lights = LightsModel(radio: AquaTomeApp.radio(), tanks: tanks)
    _lights = State(initialValue: lights)
    let (account, wanted) = AquaTomeApp.server(tanks)
    _account = State(initialValue: account)
    // What a save puts on a tank without a page, that no page has, is sent as wanted.
    tanks.wanted = wanted
    tanks.hasPage = { handbook.page(for: $0) != nil }
    let plugs = AquaTomeApp.plugs()
    _plugs = State(initialValue: plugs)
    // Each records where it knows how an action went.
    let telemetry = TelemetryModel(lang: handbook.lang)
    _telemetry = State(initialValue: telemetry)
    handbook.telemetry = telemetry.telemetry
    tanks.telemetry = telemetry.telemetry
    lights.telemetry = telemetry.telemetry
    plugs.telemetry = telemetry.telemetry
  }

  var body: some Scene {
    WindowGroup {
      Group {
        // v2, unless the reader went back to the old look (V2Switch): the same models and links (V2Root). iOS 17 has
        // the old look alone.
        if v2, #available(iOS 18, *) {
          V2Root(tab: $tab, handbookPath: $handbookPath, tanksPath: $tanksPath)
        } else {
          TabView(selection: $tab) {
            HandbookView(path: $handbookPath)
              .tabItem { Label("Tìm", systemImage: "magnifyingglass") }
              .tag(Tab.handbook)
            TanksView(path: $tanksPath)
              .tabItem { Label("Bể của tôi", systemImage: "fish") }
              .tag(Tab.tanks)
            LightsView()
              .tabItem { Label("Đèn", systemImage: "lightbulb") }
              .tag(Tab.lights)
          }
        }
      }
      // The account and the app's settings: a sheet from the profile button on every tab (ProfileButton), as the App
      // Store's is, not a tab of its own.
      .sheet(isPresented: $showingAccount) { AccountView() }
      // The tab bar stays whole and where it is on every screen, as the App Store's does, with iOS's own glass and the soft
      // fade of what scrolls under it (the owner, 7 Nov).
      .tabBarNeverMinimizes()
      .titleOverWhatScrolls()
      #if DEBUG
      // Whatever tab or page is showing, for the video tests: the pages' players still alive.
      .background { PlayerCount() }
      #endif
      // The owner's report button, and its offer after a screenshot (OwnerReport): the owner's account alone. Inside the
      // environment below, which it reads the account from.
      .ownerReports { OwnerReportHere.place(tab: tab.screen.rawValue, account: showingAccount, lang: handbook.lang) }
      .environment(lights)
      .environment(handbook)
      .environment(tanks)
      .environment(account)
      .environment(plugs)
      .environment(telemetry)
      .environment(chat)
      // Dates and numbers in the app's language, as its words are (Locale.app).
      .environment(\.locale, .app)
      // The site's pages the app has as its own tabs (the handbook's Chihiros tool, a page's "Xem trong Bể của tôi →").
      .environment(\.openScreen) { open($0) }
      // A link for the browser (About, Privacy, "Mở trong trình duyệt"…): our copies' to the site go marked (OwnCopy).
      .environment(\.openURL, OpenURLAction { .systemAction(OwnCopy.marked($0, site: handbook.site)) })
      // A link from a web page (the site's "Mở trong ứng dụng"): the site's page it names, as a link in a page opens.
      // Opening the app, before the index is read, it waits for it.
      .onOpenURL { url in
        // Anything else is ignored, and leaves a link waiting as it is.
        guard let link = AppLink.of(url, site: handbook.site) else { return }
        opening = link
        if handbook.status != .loading { openLink() }
      }
      .onChange(of: handbook.status) { if handbook.status != .loading { openLink() } }
      // Signed in: a change to the tanks goes to the account a moment later; coming to the front, the account's come back.
      .onChange(of: tanks.store) { account.changed() }
      .onChange(of: phase, initial: true) {
        // The latest chat's answer stops in the background, and is asked for again on return (ChatStore).
        if phase == .background { chat.inFront(false) }
        guard phase == .active else { return }
        chat.inFront(true)
        Task { await account.refresh() }
        // Whether the chat is on: its entries show only then.
        Task { await chat.refresh(account: account, site: handbook.site) }
      }
      // After the first screen: iOS's reports, and sending every 30 s once the site (its index read fresh this launch)
      // and the reader allow it.
      .task { await telemetry.start() }
      .onChange(of: handbook.siteTelemetry, initial: true) { if let on = handbook.siteTelemetry { telemetry.siteAllows(on) } }
      .onChange(of: tab, initial: true) { telemetry.telemetry.record(.view(tab.screen)) }
      // Whether the account signed in is the owner's (the dashboard's row, OwnerEntry), when it changes and after each sync
      // (which also says the phone is online again); the owner's, this phone's token for the daily report, if it's wanted
      // and not sent with this session yet. Whichever tab is open: the notifications don't wait for the Tanks tab.
      .task(id: "\(account.user?.id ?? "")|\(account.syncs)") {
        // Not before the server has answered or an account kept on the phone shows: no account yet isn't signed out
        // (which forgets an account that isn't the owner's, so it would ask again each launch).
        guard account.state != .unknown else { return }
        await account.owner.check()
        await account.push.send()
      }
      // The owner's notifications turned on here: this launch's token, sent once the owner is known (OwnerPush).
      .task {
        notifications.received = { token in Task { await account.push.received(token) } }
        await OwnerNotifications.register(account.push)
      }
      // Whatever tab is showing: a light left on a test colour goes back to its schedule (LightsModel.leave).
      .onChange(of: phase) {
        if phase == .background { lights.leave(); telemetry.leave() } else if phase == .active { lights.returned() }
        // At launch the window may come after the first apply below.
        if phase == .active { Appearance.apply(Self.testScheme ?? appearance.scheme) }
      }
      // "Giao diện", app-wide at once; the page shots' dark run (PageShotsFlowTests) over it: the runner's own appearance
      // setting doesn't reach the app.
      .onChange(of: appearance, initial: true) { Appearance.apply(Self.testScheme ?? appearance.scheme) }
      .appIconsForTests()
      #if DEBUG
      .background {
        // What the stand-in Worker received, and whether the queue's file is on the phone, for the UI tests to read
        // (debug builds only).
        VStack {
          Text(verbatim: telemetry.received.isEmpty ? "none" : telemetry.received.joined(separator: " | ")).accessibilityIdentifier("telemetry-received")
          Text(verbatim: telemetry.queueKept ? "kept" : "none").accessibilityIdentifier("telemetry-queue")
          AppearanceProbe(id: "appearance-app")
        }
        .font(.system(size: 1)).opacity(0.01)
      }
      #endif
    }
  }

  /// UI tests: `-dark`, the app dark whatever the phone is set to.
  private static var testScheme: ColorScheme? {
    #if DEBUG
    ProcessInfo.processInfo.arguments.contains("-dark") ? .dark : nil
    #else
    nil
    #endif
  }

  /// One of the app's own screens: its tab, and the tank the link names if it's one of the reader's.
  private func open(_ screen: AppScreen) {
    // Any screen but the sheet itself opens under it: the sheet goes first.
    if screen != .account { showingAccount = false }
    switch screen {
    case .lights: tab = .lights
    case .account: showingAccount = true
    case .kept:
      // From the Tài khoản sheet (closed above): the shelf on the Tìm tab, where its pages open.
      var path = NavigationPath()
      path.append(Browse.kept)
      handbookPath = path
      tab = .handbook
    case .fishId:
      // A tool of the handbook's: on the Tìm tab, where the pages its guesses lead to open too.
      tab = .handbook
      handbookPath.append(FishIdRoute())
    case .tanks(let id):
      var path = NavigationPath()
      if let id, tanks.tanks.contains(where: { $0.id == id }) { path.append(id) }
      tanksPath = path
      tab = .tanks
    case .page(let path):
      // A page the app draws linking to another: pushed on the tab it's in.
      guard let item = handbook.item(at: path) else { return }
      push(item)
    case .group(let group):
      // A group named in a page's text: its shelf, pushed on the tab the page is in.
      push(Browse.fish(group))
    case .tankVolume(let query):
      push(VolumeTool(query: query))
    case .tankMates(let query):
      push(TankMatesTool(query: query))
    case .search(let words):
      // Tìm's home, its search field holding the words.
      tab = .handbook
      handbookPath = NavigationPath()
      handbook.query = words
    }
  }

  /// A screen pushed on the tab in front: the tanks tab, else the Tìm tab.
  private func push(_ value: some Hashable) {
    if tab == .tanks { tanksPath.append(value) } else { tab = .handbook; handbookPath.append(value) }
  }

  /// The link from outside waiting, if any: the home's top, with no search; a shop outside, as a page's link opens it;
  /// else the page on the Tìm tab, as its own screen (a tool's on its tab: AppScreen) or its web page.
  private func openLink() {
    guard let link = opening else { return }
    opening = nil
    // Opened from a page in the browser while the Tài khoản sheet was up (its about links): the page, not the sheet.
    showingAccount = false
    switch link {
    case .home:
      tab = .handbook
      handbookPath = NavigationPath()
      handbook.query = ""
    case .page(let url):
      if ShopLink.is(url, site: handbook.site) {
        Task { await OwnCopy.open(url, site: handbook.site) }
        return
      }
      tab = .handbook
      if let screen = AppScreen.of(url, site: handbook.site, lang: handbook.lang, listed: { handbook.item(at: $0) != nil },
                                   group: { !handbook.shelves.fish(group: $0, handbook.labels).isEmpty }) {
        open(screen)
      } else {
        handbookPath.append(SitePage(url: url))
      }
    }
  }

  /// aquatome.com's accounts, and where readers' demand for pages goes (Wanted). A debug build on the simulator (every UI
  /// and performance test) never reaches it: it gets one stand-in server in the app for both (accounts off unless
  /// `-fake-accounts on`), a stand-in Apple sheet, Google page and Turnstile check, as it gets a fake light; `-real-accounts` to try
  /// the real server from the simulator.
  @MainActor
  private static func server(_ tanks: TanksModel) -> (AccountModel, Wanted) {
    #if DEBUG && targetEnvironment(simulator)
    let args = ProcessInfo.processInfo.arguments
    if !args.contains("-real-accounts") {
      let fake = FakeServer(args)
      let send: Send = { try await fake.send($0) }
      return (AccountModel(tanks: tanks, api: AccountsClient(send: send), apple: FakeAppleSignIn(), google: FakeGoogleSignIn(args), passkey: FakePasskeySignIn(), keychain: TokenStore(inDefaults: true), fakeChecks: true,
                           streams: { r in try await fake.stream(r) }),
              Wanted(send: send, ours: { OwnCopy.isOurs }))
    }
    #endif
    return (AccountModel(tanks: tanks), Wanted(ours: { OwnCopy.isOurs }))
  }

  /// The reader's Tuya plugs, with their own project's keys. A debug build on the simulator (every UI test) never
  /// reaches Tuya: it gets a stand-in cloud, as it gets a fake light; `-real-tuya` to try Tuya from the simulator.
  @MainActor
  private static func plugs() -> PlugsModel {
    #if DEBUG && targetEnvironment(simulator)
    let args = ProcessInfo.processInfo.arguments
    if !args.contains("-real-tuya") { return PlugsModel.forSimulator(args) }
    #endif
    return PlugsModel()
  }

  /// Bluetooth on a device; the simulator has none, so a debug build there (every UI test) gets a fake light.
  @MainActor
  private static func radio() -> Radio {
    #if DEBUG && targetEnvironment(simulator)
    FakeRadio()
    #else
    BluetoothRadio()
    #endif
  }
}

private extension View {
  @ViewBuilder func tabBarNeverMinimizes() -> some View {
    if #available(iOS 26.0, *) { tabBarMinimizeBehavior(.never) } else { self }
  }

  /// What scrolls under a screen's title is cut off there. iOS's soft edge leaves it readable behind the clock and title,
  /// the larger the text the more so (8 Nov). The bottom stays soft, under the tab bar.
  @ViewBuilder func titleOverWhatScrolls() -> some View {
    if #available(iOS 26.0, *) { scrollEdgeEffectStyle(.hard, for: .top) } else { self }
  }
}

extension Locale {
  /// The app's: its words' language (`Bundle.main.preferredLocalizations`, as SiteLanguage reads it), with the phone's own
  /// locale when that's in the same language. A phone in a language the app doesn't have (English) shows the app's words
  /// in Vietnamese, but once the app had Malay, iOS made `Locale.current` Malay's (ms_US, 8 Nov), and dates and decimals
  /// followed it.
  static let app: Locale = {
    let code = SiteLanguage.of(Bundle.main.preferredLocalizations).code
    return Locale.current.language.languageCode?.identifier == code ? .current : Locale(identifier: code)
  }()
}

extension LocalizedStringResource {
  /// Looked up in the app's language (Locale.app). A resource looks its words up in its own locale, `Locale.current`, so on
  /// a phone in a language the app doesn't have, Đèn's presets read in Malay (8 Nov).
  var inApp: LocalizedStringResource {
    var r = self
    r.locale = .app
    return r
  }
}

extension EnvironmentValues {
  /// Opens one of the app's own screens in place of the site's page for it (AppScreen).
  @Entry var openScreen: (AppScreen) -> Void = { _ in }
}
