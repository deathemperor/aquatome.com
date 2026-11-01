import Plugs
import SwiftUI
import Tanks

/// "Ổ cắm" on a tank (docs/smart-plugs.md): the reader's Smart Life strips put on it, each outlet named for what it
/// powers, with its switch. What a switch shows is what the plug last reported (`PlugBoard`), never what was asked; the
/// records on the tank hold no state. The plugs are reached with the reader's own Tuya project keys, set up once.
struct PlugsSection: View {
  let tank: Tank
  @Environment(PlugsModel.self) private var plugs
  @Environment(TanksModel.self) private var tanks
  @State private var adding = false
  @State private var settingUp = false

  var body: some View {
    Section {
      ForEach(tanks.plugs(in: tank)) { d in PlugRows(device: d) }
      if plugs.dataCenter == nil {
        Text("Bật tắt ổ cắm Smart Life ngay trên bể, bằng dự án Tuya của riêng bạn: không cần tài khoản AquaTome.")
          .foregroundStyle(.secondary)
          .accessibilityIdentifier("plugs-intro")
      } else {
        status
        if let l = plugs.board.list, !l.plugs.isEmpty {
          Button("Thêm ổ cắm") { adding = true }
            .accessibilityIdentifier("add-plug")
            .sheet(isPresented: $adding) { AddPlug(tankId: tank.id) }
        }
      }
      Button(plugs.dataCenter == nil ? String(localized: "Thiết lập ổ cắm") : String(localized: "Khóa Tuya")) { settingUp = true }
        .accessibilityIdentifier("plug-setup")
        .sheet(isPresented: $settingUp) { PlugSetup() }
    } header: {
      Text("Ổ cắm").accessibilityIdentifier("plugs-header")
    }
  }

  /// The list being read, a failed read, or nothing in the project to put on a tank.
  @ViewBuilder private var status: some View {
    if let e = plugs.board.listError {
      Text(PlugProblem.text(e)).foregroundStyle(.red).accessibilityIdentifier("plugs-problem")
    } else if let l = plugs.board.list {
      if l.plugs.isEmpty { Text(PlugProblem.empty(l)).foregroundStyle(.secondary).accessibilityIdentifier("plugs-problem") }
    } else if plugs.board.loading {
      HStack { ProgressView(); Text("Đang đọc ổ cắm…").foregroundStyle(.secondary) }
    }
  }
}

/// What to tell the reader about a list read or a check of the keys.
enum PlugProblem {
  static func text(_ e: PlugError) -> String {
    switch e {
    case .badKeys: String(localized: "Tuya không nhận khóa này: kiểm tra Access ID, Access Secret và trung tâm dữ liệu.")
    case .expired: String(localized: "Gói dùng thử IoT Core của dự án đã hết hạn: gia hạn trong Tuya console (Cloud → Cloud Services → IoT Core) rồi thử lại.")
    case .notSubscribed: String(localized: "Dự án chưa bật IoT Core: bật gói dùng thử ở Cloud → Cloud Services → IoT Core.")
    case .quota: String(localized: "Dự án đã dùng hết lượt gọi Tuya của gói lúc này: thử lại sau.")
    case .busy: String(localized: "Tuya đang bận: thử lại sau một lát.")
    case .clock: String(localized: "Giờ trên điện thoại lệch quá nhiều: chỉnh lại giờ rồi thử lại.")
    case .noAccess: String(localized: "Tuya không cho dự án xem thiết bị: liên kết tài khoản Smart Life bằng mã QR (bước 4 trong phần thiết lập) và kiểm tra trung tâm dữ liệu.")
    case .offline: String(localized: "Không có mạng hoặc Tuya không trả lời: thử lại khi có mạng.")
    case .maker(let code): String(localized: "Tuya từ chối (mã \(code)).")
    case .plugOffline: String(localized: "Mất kết nối")
    case .noSuchPlug: String(localized: "Không thấy trong dự án Tuya")
    case .badReply: String(localized: "Tuya trả lời không như mong đợi: thử lại.")
    }
  }

  /// Keys that work, and no plug to show.
  static func empty(_ l: PlugList) -> String {
    l.others == 0
      ? String(localized: "Dự án Tuya chưa có thiết bị nào: liên kết tài khoản Smart Life bằng mã QR (bước 4 trong phần thiết lập).")
      : String(localized: "Dự án Tuya có \(l.others) thiết bị nhưng không có ổ cắm nào.")
  }
}

extension View {
  /// The tank screen's plugs: read when it opens (and when the keys change) and on pull to refresh, never on a timer.
  func readsPlugs() -> some View { modifier(ReadsPlugs()) }
}

private struct ReadsPlugs: ViewModifier {
  @Environment(PlugsModel.self) private var plugs

  func body(content: Content) -> some View {
    content
      .task(id: plugs.owner) { await plugs.refresh() }
      .refreshable { await plugs.refresh() }
  }
}

/// A plug on the tank: its name and whether it's online, then its outlets.
private struct PlugRows: View {
  let device: Device
  @Environment(PlugsModel.self) private var plugs
  @State private var editing = false

  var body: some View {
    let provider = device.brand ?? "", remoteId = device.remoteId ?? ""
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(device.nickname ?? String(localized: "Ổ cắm")).font(.headline).accessibilityIdentifier("plug-name")
        if let s = state(provider, remoteId) {
          Text(s).font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("plug-status")
        }
      }
      Spacer()
      Button("Sửa") { editing = true }
        .buttonStyle(.borderless)
        .accessibilityIdentifier("edit-plug")
    }
    .sheet(isPresented: $editing) { NavigationStack { PlugForm(deviceId: device.id) { editing = false } } }
    ForEach(Array(device.outlets.enumerated()), id: \.element.code) { i, o in
      OutletRow(outlet: o, number: i + 1, key: PlugBoard.Outlet(provider: provider, device: remoteId, code: o.code))
    }
  }

  private func state(_ provider: String, _ remoteId: String) -> String? {
    guard plugs.board.list != nil else { return nil }
    switch plugs.board.online(provider: provider, device: remoteId) {
    case nil: return String(localized: "Không thấy trong dự án Tuya")
    case true?: return String(localized: "Trực tuyến")
    case false?: return String(localized: "Mất kết nối")
    }
  }
}

/// One outlet: what it powers, its switch as the plug reports it, and how the last switch went.
private struct OutletRow: View {
  let outlet: PlugOutlet
  let number: Int
  let key: PlugBoard.Outlet
  @Environment(PlugsModel.self) private var plugs
  /// A heater or CO2 outlet waiting for the reader to confirm: the state asked for.
  @State private var asking: Bool?

  var body: some View {
    let board = plugs.board
    let live = board.list?.plug(provider: key.provider, id: key.device)?.outlets.first { $0.code == outlet.code }
    let title = outlet.label ?? outlet.role.map(OutletRole.label) ?? live?.name ?? String(localized: "Ổ \(number)")
    let busy = board.switching.contains(key)
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).accessibilityIdentifier("outlet-title-\(outlet.code)")
        if let n = note(board, busy) {
          Text(n).font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("outlet-status-\(outlet.code)")
        }
      }
      Spacer()
      if busy { ProgressView() }
      // Shows the plug's report; a tap asks for the other state and changes nothing here until the plug answers. Not
      // known, no switch: it would read as off.
      if let on = board.on(key) {
        Toggle(title, isOn: Binding(get: { on }, set: { tapped($0) }))
          .labelsHidden()
          .disabled(busy || board.online(provider: key.provider, device: key.device) != true)
          .accessibilityIdentifier("outlet-\(outlet.code)")
      }
    }
    .confirmationDialog(asking == true ? String(localized: "Bật “\(title)”?") : String(localized: "Tắt “\(title)”?"),
                        isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }), titleVisibility: .visible) {
      if let want = asking {
        Button(want ? String(localized: "Bật") : String(localized: "Tắt")) { send(want) }.accessibilityIdentifier("confirm-switch")
      }
    } message: {
      Text(warning)
    }
  }

  private var warning: String {
    switch outlet.role {
    case "heater": String(localized: "Ổ này cấp điện cho sưởi. Bật tắt nhầm có thể làm nước quá lạnh hoặc quá nóng.")
    case "co2": String(localized: "Ổ này cấp điện cho CO2. Bật nhầm, nhất là ban đêm, có thể làm cá ngạt.")
    default: String(localized: "Chưa ghi ổ này cắm gì: nếu là sưởi hay CO2, bật tắt nhầm có thể hại cá. Chọn “Cắm gì” trong Sửa để khỏi hỏi lại.")
    }
  }

  /// Outlets that switch on a tap. Any other is asked about first, either way: a heater or CO2 in the wrong state can
  /// harm the fish (which way is the dangerous one depends on the tank and the hour), and an outlet with no role, or
  /// one this app doesn't know, could be either.
  static let switchesOnATap: Set = ["light", "filter", "air", "fan", "other"]

  private func tapped(_ want: Bool) {
    if outlet.role.map(Self.switchesOnATap.contains) == true { send(want) } else { asking = want }
  }

  private func send(_ want: Bool) { Task { await plugs.board.set(key, on: want) } }

  private func note(_ board: PlugBoard, _ busy: Bool) -> String? {
    if busy { return String(localized: "Đang gửi lệnh…") }
    if board.online(provider: key.provider, device: key.device) == false { return String(localized: "Mất kết nối") }
    switch board.outcome(key) {
    case .confirmed?: return String(localized: "Đã xác nhận")
    case .unconfirmed?: return String(localized: "Chưa xác nhận: ổ cắm chưa báo đã đổi.")
    case .unknown?: return String(localized: "Không rõ trạng thái")
    case .refused(let e)?: return String(localized: "Chưa gửi lệnh: \(PlugProblem.text(e))")
    case nil: break
    }
    if board.list?.plug(provider: key.provider, id: key.device) != nil && board.on(key) == nil { return String(localized: "Không rõ trạng thái") }
    return nil
  }
}

/// What an outlet powers (Known.outletRole), as the reader picks it. A role from a newer client is shown as it is.
enum OutletRole {
  static func label(_ role: String) -> String {
    switch role {
    case "light": String(localized: "Đèn")
    case "co2": String(localized: "CO2")
    case "filter": String(localized: "Lọc")
    case "heater": String(localized: "Sưởi")
    case "air": String(localized: "Sủi khí")
    case "fan": String(localized: "Quạt")
    case "other": String(localized: "Khác")
    default: role
    }
  }
}
