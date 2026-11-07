import SwiftUI

/// "Gửi thống kê ẩn danh": the reader's switch for the app's anonymous telemetry (TelemetryModel), and a link to the
/// privacy policy's part on it. In the Tài khoản sheet (AccountView), where the privacy policy names it.
struct TelemetrySwitch: View {
  @Environment(TelemetryModel.self) private var telemetry

  var body: some View {
    @Bindable var telemetry = telemetry
    Section {
      Toggle("Gửi thống kê ẩn danh", isOn: $telemetry.readerOn).accessibilityIdentifier("telemetry-switch")
    } footer: {
      Link("Chính sách bảo mật", destination: URL(string: String(localized: "https://aquatome.com/vi/chinh-sach-bao-mat/#thong-ke-ung-dung"))!)
        .font(.footnote)
    }
  }
}
