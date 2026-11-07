import SwiftUI
import UIKit

/// "Giao diện": the app as the phone is set (the default), or light or dark whatever the phone is. Kept on this phone
/// only, not in the account; applied to the app's windows (AquaTomeApp), so every tab and sheet takes it at once.
enum Appearance: String, CaseIterable, Identifiable {
  case system, light, dark

  static let key = "appearance"

  var id: Self { self }

  var scheme: ColorScheme? {
    switch self {
    case .system: nil
    case .light: .light
    case .dark: .dark
    }
  }

  /// Every window of the app drawn this way (nil: as the phone is), the sheets open in them too. UIKit's override, not
  /// SwiftUI's `preferredColorScheme`: with that, a sheet open when it went back to the phone's stayed as it was.
  @MainActor static func apply(_ scheme: ColorScheme?) {
    let style: UIUserInterfaceStyle = switch scheme {
    case .dark: .dark
    case .light: .light
    default: .unspecified
    }
    for case let scene as UIWindowScene in UIApplication.shared.connectedScenes {
      for window in scene.windows { window.overrideUserInterfaceStyle = style }
    }
  }

  var name: LocalizedStringKey {
    switch self {
    case .system: "Theo máy"
    case .light: "Sáng"
    case .dark: "Tối"
    }
  }
}

/// The sheet's row (Ứng dụng): the choice in the system's menu.
struct AppearanceRow: View {
  @AppStorage(Appearance.key) private var appearance = Appearance.system

  var body: some View {
    Picker(selection: $appearance) {
      ForEach(Appearance.allCases) { Text($0.name).tag($0) }
    } label: {
      Label { Text("Giao diện") } icon: { Tile(symbol: "circle.lefthalf.filled", color: Color(.darkGray)) }
    }
    .pickerStyle(.menu)
    .accessibilityIdentifier("appearance")
  }
}

#if DEBUG
/// The appearance the views around it are drawn in, for the UI tests to read (debug builds only).
struct AppearanceProbe: View {
  let id: String
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    Text(verbatim: scheme == .dark ? "dark" : "light")
      .font(.system(size: 1)).opacity(0.01)
      .accessibilityIdentifier(id)
  }
}
#endif
