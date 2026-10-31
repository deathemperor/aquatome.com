import AccountSync
import SwiftUI

@main
struct AquaTomeApp: App {
  @State private var lights = LightsModel(radio: AquaTomeApp.radio())
  @State private var handbook = HandbookModel()
  @State private var tanks: TanksModel
  @State private var account: AccountModel
  @State private var tab = Tab.handbook
  @Environment(\.scenePhase) private var phase

  enum Tab { case tanks, handbook, lights }

  init() {
    #if DEBUG
    // UI tests start from a clean phone (no schedule or tank kept from an earlier run).
    if ProcessInfo.processInfo.arguments.contains("-reset-defaults"), let id = Bundle.main.bundleIdentifier {
      UserDefaults.standard.removePersistentDomain(forName: id)
    }
    TanksModel.prepareForTests(ProcessInfo.processInfo.arguments)
    #endif
    // Read after the tests' reset above.
    let tanks = TanksModel()
    _tanks = State(initialValue: tanks)
    _account = State(initialValue: AquaTomeApp.account(tanks))
  }

  var body: some Scene {
    WindowGroup {
      TabView(selection: $tab) {
        // The Chihiros tool in the handbook is this app's Lights tab, not its web page.
        HandbookView { tab = .lights }
          .tabItem { Label("Tìm", systemImage: "magnifyingglass") }
          .tag(Tab.handbook)
        TanksView()
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
      // Signed in: a change to the tanks goes to the account a moment later; coming to the front, the account's come back.
      .onChange(of: tanks.store) { account.changed() }
      .onChange(of: phase, initial: true) { if phase == .active { Task { await account.refresh() } } }
    }
  }

  /// aquatome.com's accounts. A debug build on the simulator (every UI and performance test) never reaches it: it gets a
  /// stand-in server in the app (accounts off unless `-fake-accounts on`) and a stand-in Apple sheet, as it gets a fake
  /// light; `-real-accounts` to try the real server from the simulator.
  @MainActor
  private static func account(_ tanks: TanksModel) -> AccountModel {
    #if DEBUG && targetEnvironment(simulator)
    let args = ProcessInfo.processInfo.arguments
    if !args.contains("-real-accounts") {
      let fake = FakeServer(args)
      return AccountModel(tanks: tanks, api: AccountsClient(send: { try await fake.send($0) }), apple: FakeAppleSignIn(), keychain: TokenStore(inDefaults: true))
    }
    #endif
    return AccountModel(tanks: tanks)
  }

  /// Bluetooth on a device; the simulator has none, so it gets a fake light (UI tests run on it too).
  @MainActor
  private static func radio() -> Radio {
    #if targetEnvironment(simulator)
    FakeRadio()
    #else
    BluetoothRadio()
    #endif
  }
}
