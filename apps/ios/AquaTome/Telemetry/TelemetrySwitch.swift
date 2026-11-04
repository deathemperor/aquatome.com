import SwiftUI

/// "Gửi thống kê ẩn danh": the reader's switch for the app's anonymous telemetry (TelemetryModel), as the privacy
/// policy names it, under Tài khoản. Off, what waits to be sent is dropped and nothing more is recorded.
struct TelemetrySwitch: View {
  @Environment(TelemetryModel.self) private var telemetry

  var body: some View {
    @Bindable var telemetry = telemetry
    Section {
      Toggle("Gửi thống kê ẩn danh", isOn: $telemetry.readerOn).accessibilityIdentifier("telemetry-switch")
    } footer: {
      Text("Trang bạn mở, thời gian đọc, kết quả một số thao tác và báo cáo lỗi của iOS, không gắn với tài khoản hay tên của bạn.")
    }
  }
}
