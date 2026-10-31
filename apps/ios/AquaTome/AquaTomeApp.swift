import SwiftUI

@main
struct AquaTomeApp: App {
  @State private var lights = LightsModel(radio: AquaTomeApp.radio())
  @State private var handbook = HandbookModel()
  @State private var tab = Tab.handbook

  enum Tab { case handbook, lights }

  init() {
    #if DEBUG
    // UI tests start from a clean phone (no schedule kept from an earlier run).
    if ProcessInfo.processInfo.arguments.contains("-reset-defaults"), let id = Bundle.main.bundleIdentifier {
      UserDefaults.standard.removePersistentDomain(forName: id)
    }
    #endif
  }

  var body: some Scene {
    WindowGroup {
      TabView(selection: $tab) {
        // The Chihiros tool in the handbook is this app's Lights tab, not its web page.
        HandbookView { tab = .lights }
          .tabItem { Label("Tìm", systemImage: "magnifyingglass") }
          .tag(Tab.handbook)
        LightsView()
          .tabItem { Label("Đèn", systemImage: "lightbulb") }
          .tag(Tab.lights)
      }
      .environment(lights)
      .environment(handbook)
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
