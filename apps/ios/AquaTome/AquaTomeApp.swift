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
  @State private var tab = Tab.handbook
  @State private var tanksPath = NavigationPath()
  @State private var handbookPath = NavigationPath()
  /// A link from outside the app waiting for the handbook's index, to know the pages the app has (AppLink).
  @State private var opening: AppLink?
  @Environment(\.scenePhase) private var phase

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
    }
    TanksModel.prepareForTests(ProcessInfo.processInfo.arguments)
    // The UI flows (`-no-animations`): after each tap or swipe XCUITest waits for the app to be idle, UIKit's animations
    // ended (a push, a sheet, an alert, the tab bar), up to about 2 s a step on a busy Mac. SwiftUI's own animations
    // turned off too shortened none of those waits, so they stay. Never in the performance tests: they measure the app
    // as a reader sees it.
    if ProcessInfo.processInfo.arguments.contains("-no-animations") { UIView.setAnimationsEnabled(false) }
    #endif
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
      // The tab bar shrinks out of the way while reading down a page, and comes back at the page's top or with a tap on it (iOS 26).
      .minimizingTabBarOnScroll()
      #if DEBUG
      // Whatever tab or page is showing, for the video tests: the pages' players still alive.
      .background { PlayerCount() }
      #endif
      .environment(lights)
      .environment(handbook)
      .environment(tanks)
      .environment(account)
      .environment(plugs)
      .environment(telemetry)
      // The site's pages the app has as its own tabs (the handbook's Chihiros tool, a page's "Xem trong Bể của tôi →").
      .environment(\.openScreen) { open($0) }
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
      .onChange(of: phase, initial: true) { if phase == .active { Task { await account.refresh() } } }
      .task { await OwnCopy.check() }
      // After the first screen: iOS's reports, and sending every 30 s once the site (its index read fresh this launch)
      // and the reader allow it.
      .task { await telemetry.start() }
      .onChange(of: handbook.siteTelemetry, initial: true) { if let on = handbook.siteTelemetry { telemetry.siteAllows(on) } }
      .onChange(of: tab, initial: true) { telemetry.telemetry.record(.view(tab.screen)) }
      // Whatever tab is showing: a light left on a test colour goes back to its schedule (LightsModel.leave).
      .onChange(of: phase) {
        if phase == .background { lights.leave(); telemetry.leave() } else if phase == .active { lights.returned() }
      }
      // The page shots' dark run (PageShotsFlowTests): the runner's own appearance setting doesn't reach the app.
      .preferredColorScheme(Self.testScheme)
      .appIconsForTests()
      #if DEBUG
      .background {
        // What the stand-in Worker received, and whether the queue's file is on the phone, for the UI tests to read
        // (debug builds only).
        VStack {
          Text(verbatim: telemetry.received.isEmpty ? "none" : telemetry.received.joined(separator: " | ")).accessibilityIdentifier("telemetry-received")
          Text(verbatim: telemetry.queueKept ? "kept" : "none").accessibilityIdentifier("telemetry-queue")
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
    switch screen {
    case .lights: tab = .lights
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
      return (AccountModel(tanks: tanks, api: AccountsClient(send: send), apple: FakeAppleSignIn(), google: FakeGoogleSignIn(args), passkey: FakePasskeySignIn(), keychain: TokenStore(inDefaults: true), fakeChecks: true),
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
  @ViewBuilder func minimizingTabBarOnScroll() -> some View {
    if #available(iOS 26.0, *) { tabBarMinimizeBehavior(.onScrollDown) } else { self }
  }
}

extension EnvironmentValues {
  /// Opens one of the app's own screens in place of the site's page for it (AppScreen).
  @Entry var openScreen: (AppScreen) -> Void = { _ in }
}
