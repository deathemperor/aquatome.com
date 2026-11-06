import SwiftUI

/// "Gửi thống kê ẩn danh": the reader's switch for the app's anonymous telemetry (TelemetryModel), and a link to the
/// privacy policy's part on it. In Bể của tôi, whatever it shows (`panel`: the empty tab's), until the app has a Tài
/// khoản tab; then it moves there, where the privacy policy names it.
struct TelemetrySwitch: View {
  /// Under the empty tab's centred text, not in a list.
  var panel = false
  @Environment(TelemetryModel.self) private var telemetry

  var body: some View {
    @Bindable var telemetry = telemetry
    let toggle = Toggle("Gửi thống kê ẩn danh", isOn: $telemetry.readerOn).accessibilityIdentifier("telemetry-switch")
    let policy = Link("Chính sách bảo mật", destination: URL(string: String(localized: "https://aquatome.com/vi/chinh-sach-bao-mat/#thong-ke-ung-dung"))!)
      .font(.footnote)
    if panel {
      VStack(spacing: 8) {
        toggle
        policy
      }
      .frame(maxWidth: 300)
      .padding(.top, 16)
    } else {
      Section { toggle } footer: { policy }
    }
  }
}
