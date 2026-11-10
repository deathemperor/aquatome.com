import SwiftUI

/// "Gửi thống kê": the reader's switch for the app's telemetry (TelemetryModel). A row of the Tài khoản
/// sheet's privacy section (AccountView), where the privacy policy names it and links to its part.
struct TelemetrySwitch: View {
  @Environment(TelemetryModel.self) private var telemetry

  var body: some View {
    @Bindable var telemetry = telemetry
    Toggle(isOn: $telemetry.readerOn) {
      Label { Text("Gửi thống kê") } icon: { Tile(symbol: "chart.bar.fill", color: .indigo) }
        .modifier(RowLabel())
    }
    .accessibilityIdentifier("telemetry-switch")
  }
}
