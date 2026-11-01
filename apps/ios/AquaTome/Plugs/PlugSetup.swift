import Plugs
import SwiftUI

/// Setting up the plugs once (docs/smart-plugs.md): the reader's own Tuya cloud project with their Smart Life account
/// linked to it, and its keys entered here, checked by reading the list. Also where the keys are removed.
struct PlugSetup: View {
  @Environment(PlugsModel.self) private var plugs
  @Environment(\.dismiss) private var dismiss
  @State private var dataCenter = TuyaDataCenter.westernAmerica
  @State private var accessId = ""
  @State private var accessSecret = ""
  @State private var checking = false
  @State private var result: PlugsModel.Check?
  @State private var confirmRemove = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Text("AquaTome bật tắt ổ cắm Smart Life (Tuya) bằng dự án đám mây Tuya của chính bạn: ứng dụng gọi thẳng Tuya, không qua máy chủ AquaTome và không cần tài khoản AquaTome.")
          Text("Chỉ dùng cho thiết bị của riêng bạn: gói miễn phí của Tuya không dành cho việc dùng thương mại. Ổ cắm eWeLink (Sonoff) sẽ có sau.")
            .foregroundStyle(.secondary)
        }
        Section("Các bước, làm một lần trên máy tính") {
          step(1, String(localized: "Tạo tài khoản nhà phát triển Tuya (miễn phí) tại platform.tuya.com."))
          Link("Mở platform.tuya.com", destination: URL(string: "https://platform.tuya.com")!)
          step(2, String(localized: "Cloud → Development → Create Cloud Project: Industry “Smart Home”, Development Method “Smart Home”, Data Center cùng vùng với tài khoản Smart Life của bạn."))
          step(3, String(localized: "Bật gói dùng thử IoT Core (Cloud → Cloud Services → IoT Core). Gói miễn phí phải gia hạn trong console khoảng mỗi tháng: hết hạn thì AquaTome không bật tắt được, còn hẹn giờ trên ổ cắm vẫn chạy."))
          step(4, String(localized: "Trong dự án: Devices → Link App Account → Add App Account. Mở Smart Life, bấm Tôi → biểu tượng quét ở góc trên, rồi quét mã QR trên màn hình."))
          step(5, String(localized: "Ở trang Overview của dự án, sao chép Access ID và Access Secret vào ô dưới đây."))
        }
        Section {
          Picker("Trung tâm dữ liệu", selection: $dataCenter) {
            ForEach(TuyaDataCenter.allCases, id: \.self) { Text(Self.name($0)).tag($0) }
          }
          .accessibilityIdentifier("data-center")
          TextField("Access ID", text: $accessId)
            .textInputAutocapitalization(.never).autocorrectionDisabled().font(.body.monospaced())
            .accessibilityIdentifier("access-id")
          SecureField("Access Secret", text: $accessSecret)
            .textInputAutocapitalization(.never).autocorrectionDisabled().font(.body.monospaced())
            .accessibilityIdentifier("access-secret")
          Button { Task { await check() } } label: {
            HStack { Text("Kiểm tra"); if checking { Spacer(); ProgressView() } }
          }
          .disabled(checking || trimmed(accessId).isEmpty || trimmed(accessSecret).isEmpty)
          .accessibilityIdentifier("check-keys")
          if let result {
            Text(text(result)).foregroundStyle(isOK(result) ? Color.primary : Color.red).accessibilityIdentifier("check-result")
          }
        } header: {
          Text("Khóa của dự án")
        } footer: {
          Text("Khóa chỉ được lưu khi đọc được danh sách: trong Keychain của máy này, không đồng bộ sang máy khác, không gửi cho AquaTome.")
        }
        if let dc = plugs.dataCenter {
          Section {
            Text("Đã lưu khóa của một dự án ở \(Self.name(dc)).").accessibilityIdentifier("keys-saved")
            Button("Xóa khóa", role: .destructive) { confirmRemove = true }.accessibilityIdentifier("remove-keys")
          } footer: {
            Text("Xóa khóa không bật tắt ổ cắm nào: các ổ cắm trên bể vẫn còn, chỉ không bật tắt được cho tới khi nhập lại khóa.")
          }
        }
      }
      .navigationTitle("Thiết lập ổ cắm")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Xong") { dismiss() }.accessibilityIdentifier("setup-done") } }
      .confirmationDialog(String(localized: "Xóa khóa Tuya trên máy này?"), isPresented: $confirmRemove, titleVisibility: .visible) {
        Button("Xóa khóa", role: .destructive) { Task { result = nil; await plugs.removeKeys() } }.accessibilityIdentifier("confirm-remove-keys")
      }
      .onAppear { if let dc = plugs.dataCenter { dataCenter = dc } }
    }
  }

  private func step(_ n: Int, _ text: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      Text(verbatim: "\(n).").monospacedDigit().foregroundStyle(.secondary)
      Text(text)
    }
  }

  private func check() async {
    checking = true
    result = await plugs.check(TuyaKeys(accessId: trimmed(accessId), accessSecret: trimmed(accessSecret), dataCenter: dataCenter))
    checking = false
    // Kept in the Keychain now: not left in the form.
    if case .ok? = result { accessId = ""; accessSecret = "" }
  }

  private func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

  private func isOK(_ r: PlugsModel.Check) -> Bool { if case .ok(let l) = r { !l.plugs.isEmpty } else { false } }

  private func text(_ r: PlugsModel.Check) -> String {
    switch r {
    case .ok(let l) where l.plugs.isEmpty: String(localized: "Khóa đúng. \(PlugProblem.empty(l))")
    case .ok(let l): String(localized: "Đã kết nối: \(l.plugs.count) ổ cắm.")
    case .failed(let e): PlugProblem.text(e)
    case .notKept: String(localized: "Khóa đúng nhưng chưa lưu được trên máy này: thử lại.")
    }
  }

  /// As Tuya's console names them, after the Vietnamese.
  static func name(_ dc: TuyaDataCenter) -> String {
    switch dc {
    case .westernAmerica: String(localized: "Tây Mỹ (Western America)")
    case .easternAmerica: String(localized: "Đông Mỹ (Eastern America)")
    case .centralEurope: String(localized: "Trung Âu (Central Europe)")
    case .westernEurope: String(localized: "Tây Âu (Western Europe)")
    case .india: String(localized: "Ấn Độ (India)")
    case .china: String(localized: "Trung Quốc (China)")
    }
  }
}
