import SwiftUI

@main
struct AquaTomeApp: App {
  @State private var lights: LightsModel
  @State private var handbook = HandbookModel()
  @State private var tanks: TanksModel
  @State private var tab = Tab.handbook

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
    _lights = State(initialValue: LightsModel(radio: AquaTomeApp.radio(), tanks: tanks))
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
    }
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
