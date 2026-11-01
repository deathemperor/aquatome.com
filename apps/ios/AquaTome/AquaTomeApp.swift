import AccountSync
import Handbook
import SwiftUI
import WebKit

@main
struct AquaTomeApp: App {
  @State private var lights: LightsModel
  @State private var handbook = HandbookModel()
  @State private var tanks: TanksModel
  @State private var account: AccountModel
  @State private var plugs: PlugsModel
  @State private var tab = Tab.handbook
  @State private var tanksPath = NavigationPath()
  @Environment(\.scenePhase) private var phase

  enum Tab { case tanks, handbook, lights }

  init() {
    #if DEBUG
    // UI tests start from a clean phone (no schedule or tank kept from an earlier run), its web views too: a page keeps
    // the tanks it was handed and sends them back to the app (PageBridge), which would bring an earlier test's tanks in.
    if ProcessInfo.processInfo.arguments.contains("-reset-defaults"), let id = Bundle.main.bundleIdentifier {
      UserDefaults.standard.removePersistentDomain(forName: id)
      WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {}
    }
    TanksModel.prepareForTests(ProcessInfo.processInfo.arguments)
    #endif
    // Read after the tests' reset above.
    let tanks = TanksModel()
    _tanks = State(initialValue: tanks)
    _lights = State(initialValue: LightsModel(radio: AquaTomeApp.radio(), tanks: tanks))
    _account = State(initialValue: AquaTomeApp.account(tanks))
    _plugs = State(initialValue: AquaTomeApp.plugs())
  }

  var body: some Scene {
    WindowGroup {
      TabView(selection: $tab) {
        HandbookView()
          .tabItem { Label("Tìm", systemImage: "magnifyingglass") }
          .tag(Tab.handbook)
        TanksView(path: $tanksPath)
          .tabItem { Label("Bể của tôi", systemImage: "fish") }
          .tag(Tab.tanks)
        LightsView()
          .tabItem { Label("Đèn", systemImage: "lightbulb") }
          .tag(Tab.lights)
      }
      .environment(lights)
      .environment(handbook)
      .environment(tanks)
      .environment(account)
      .environment(plugs)
      // The site's pages the app has as its own tabs (the handbook's Chihiros tool, a page's "Xem trong Bể của tôi →").
      .environment(\.openScreen) { open($0) }
      // Signed in: a change to the tanks goes to the account a moment later; coming to the front, the account's come back.
      .onChange(of: tanks.store) { account.changed() }
      .onChange(of: phase, initial: true) { if phase == .active { Task { await account.refresh() } } }
      // Whatever tab is showing: a light left on a test colour goes back to its schedule (LightsModel.leave).
      .onChange(of: phase) { if phase == .background { lights.leave() } else if phase == .active { lights.returned() } }
    }
  }

  /// One of the app's own screens: its tab, and the tank the link names if it's one of the reader's.
  private func open(_ screen: AppScreen) {
    switch screen {
    case .lights: tab = .lights
    case .tanks(let id):
      var path = NavigationPath()
      if let id, tanks.tanks.contains(where: { $0.id == id }) { path.append(id) }
      tanksPath = path
      tab = .tanks
    }
  }

  /// aquatome.com's accounts. A debug build on the simulator (every UI and performance test) never reaches it: it gets a
  /// stand-in server in the app (accounts off unless `-fake-accounts on`), a stand-in Apple sheet and Turnstile check,
  /// as it gets a fake light; `-real-accounts` to try the real server from the simulator.
  @MainActor
  private static func account(_ tanks: TanksModel) -> AccountModel {
    #if DEBUG && targetEnvironment(simulator)
    let args = ProcessInfo.processInfo.arguments
    if !args.contains("-real-accounts") {
      let fake = FakeServer(args)
      return AccountModel(tanks: tanks, api: AccountsClient(send: { try await fake.send($0) }), apple: FakeAppleSignIn(), keychain: TokenStore(inDefaults: true), fakeChecks: true)
    }
    #endif
    return AccountModel(tanks: tanks)
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

extension EnvironmentValues {
  /// Opens one of the app's own screens in place of the site's page for it (AppScreen).
  @Entry var openScreen: (AppScreen) -> Void = { _ in }
}
