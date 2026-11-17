import Foundation
import Plugs
import Tanks

/// Sets one device as a `DeviceCommand` says: a plug's outlet through the plug board (docs/smart-plugs.md), the Love
/// Ecology lamp by broadcast. Once, never retried or queued. The master button's steps go through it, and so will the
/// chat's commands (never undone at the master button's end: they aren't its steps).
@MainActor
final class Switcher {
  let tanks: TanksModel
  let plugs: PlugsModel
  let lamp = LampSender()

  init(tanks: TanksModel, plugs: PlugsModel) {
    self.tanks = tanks
    self.plugs = plugs
  }

  #if DEBUG
  /// Roles by outlet code, standing in for the outlet's record: one changed while a press runs (another phone's sync),
  /// for the UI tests (`-master-role-mid-press`).
  var changedRoles: [String: String] = [:]
  #endif

  /// The outlet's role, from its record as it is now.
  func role(_ c: DeviceCommand) -> String? {
    guard let code = c.outlet else { return nil }
    #if DEBUG
    if let role = changedRoles[code] { return role }
    #endif
    return tanks.store.device(c.device)?.outlets.first { $0.code == code }?.role
  }

  /// `set`, for the master button and its countdown test: refused, as it is sent, if the outlet's role now forbids it
  /// (MasterButton.allows: CO2 never on, a heater never), whatever its role was when the button was pressed.
  func setByButton(_ c: DeviceCommand) async -> SwitchResult {
    guard MasterButton.allows(c, role: role(c)) else {
      return .failed(String(localized: "Nút không bật tắt ổ \(name(c)) được trong bản này."))
    }
    return await set(c)
  }

  /// The outlet a command names, as the plug board knows it, and what the app calls it.
  func outlet(_ c: DeviceCommand) -> (key: PlugBoard.Outlet, name: String)? {
    guard let code = c.outlet, let plug = tanks.store.device(c.device), plug.kind == "plug", let brand = plug.brand,
          let remote = plug.remoteId, let i = plug.outlets.firstIndex(where: { $0.code == code }) else { return nil }
    let live = plugs.board.list?.plug(provider: brand, id: remote)?.outlets.first { $0.code == code }?.name
    return (PlugBoard.Outlet(provider: brand, device: remote, code: code), plug.outlets[i].title(number: i + 1, live: live))
  }

  /// What the app calls the device: the lamp's name, or the outlet's.
  func name(_ c: DeviceCommand) -> String {
    c.isLamp ? String(localized: "Đèn Love Ecology") : outlet(c)?.name ?? String(localized: "Ổ cắm")
  }

  /// Why which devices are on a tank isn't known: the tanks on this phone weren't read (a newer app's, or unreadable), so
  /// none can be called deleted. The tank list's own words.
  var unreadTanks: String? {
    switch tanks.problem {
    case .newerStore: String(localized: "Các bể trên máy này được lưu bằng bản ứng dụng mới hơn. Cập nhật AquaTome để xem và sửa.")
    case .unreadable: String(localized: "Không đọc được các bể đã lưu trên máy này. Dữ liệu được giữ nguyên.")
    default: nil
    }
  }

  /// Why a command can't be sent whatever happens: its device is no longer on a tank. Nil while it is.
  func gone(_ c: DeviceCommand) -> String? {
    if c.isLamp { return tanks.store.device(c.device)?.isLoveEcology == true ? nil : String(localized: "Đèn này không còn trên bể nào.") }
    return outlet(c) == nil ? String(localized: "Ổ cắm này không còn trên bể nào.") : nil
  }

  /// Sets it, from the list last read (read it first: `plugs.refresh()`).
  func set(_ c: DeviceCommand) async -> SwitchResult {
    if let gone = gone(c) { return .failed(gone) }
    if c.isLamp {
      if let e = await lamp.send(c) { return .failed(e.line) }
      return .done
    }
    guard let o = outlet(c) else { return .failed(String(localized: "Ổ cắm này không còn trên bể nào.")) }
    let (key, name) = o
    let board = plugs.board
    guard plugs.current != nil else { return .failed(String(localized: "Chưa có khóa Tuya trên máy này: thêm trong Bể của tôi.")) }
    guard let live = board.list?.plug(provider: key.provider, id: key.device) else {
      return .failed(board.list == nil ? Self.unreached(name) : String(localized: "Không thấy ổ \(name) trong dự án Tuya."))
    }
    guard live.online, board.online(provider: key.provider, device: key.device) == true else { return .failed(String(localized: "Ổ \(name) đang mất kết nối.")) }
    // The board sends nothing for an outlet already being switched, and its last outcome would be another tap's.
    guard !board.switching.contains(key) else { return .failed(String(localized: "Ổ \(name) đang được bật tắt: thử lại sau.")) }
    await board.set(key, on: c.on)
    switch board.outcome(key) {
    case .confirmed?: return .done
    case .unconfirmed?: return .failed(String(localized: "Ổ \(name) chưa báo đã đổi."))
    case .unknown?: return .failed(String(localized: "Không rõ ổ \(name) đã đổi chưa: xem trong Bể của tôi."))
    case .refused(.plugOffline)?: return .failed(String(localized: "Ổ \(name) đang mất kết nối."))
    case .refused(.offline)?, nil: return .failed(Self.unreached(name))
    case .refused(let e)?: return .failed(String(localized: "Không tới được ổ \(name): \(PlugProblem.text(e))"))
    }
  }

  static func unreached(_ name: String) -> String { String(localized: "Không tới được ổ \(name): kiểm tra mạng rồi thử lại") }

  /// What the chat may switch, as it is now: each outlet on, off or not known, and whether its plug was reached (the
  /// list read once); the lamp, only what this phone last sent it and when, never whether it is on.
  struct State: Equatable {
    let target: DeviceTarget
    let on: Bool?
    let reached: Bool
    let lastSent: DeviceCommand?
    let lastSentAt: Date?
  }

  /// `lamp`: where the app offers the lamp (the owner's account).
  func states(lamp: Bool) async -> [State] {
    await plugs.refresh()
    return DeviceCommand.offerable(tanks.store, lamp: lamp).map { t in
      if t.outlet == nil { return State(target: t, on: nil, reached: false, lastSent: LampMemory.last, lastSentAt: LampMemory.lastAt) }
      let key = outlet(DeviceCommand(device: t.device, outlet: t.outlet, on: true))?.key
      let reached = key.map { plugs.board.online(provider: $0.provider, device: $0.device) == true } ?? false
      return State(target: t, on: key.flatMap(plugs.board.on), reached: reached, lastSent: nil, lastSentAt: nil)
    }
  }
}
