import SwiftUI

@main
struct AquaTomeApp: App {
  @State private var lights = LightsModel(radio: AquaTomeApp.radio())

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
      LightsView().environment(lights)
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
