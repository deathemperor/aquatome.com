import FishLamp
import Foundation
import Tanks

/// The phone's one broadcaster for the Love Ecology lamp, shared by its card and the master button: two would talk over
/// each other. Made at the first send.
@MainActor
enum LampRadio {
  static let air: LampAir = {
    #if DEBUG && targetEnvironment(simulator)
    FakeLampAir()
    #else
    BluetoothLampAir()
    #endif
  }()
}

/// The last command this phone sent the lamp (its card's off, on or a colour, or the master button's), kept across
/// launches: the lamp reports nothing, so this is all the phone knows of it, and what the master button puts it back to.
enum LampMemory {
  private static let key = "lamp.last"

  static var last: DeviceCommand? {
    UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(DeviceCommand.self, from: $0) }
  }

  static func remember(_ c: DeviceCommand) {
    let kept = DeviceCommand(device: c.device, on: c.on, colour: c.on ? c.colour : nil)
    UserDefaults.standard.set(try? JSONEncoder().encode(kept), forKey: key)
  }

  /// The card sent one of its recordings: off, on or a colour. Its trials say nothing of what the lamp shows.
  static func sent(_ id: String) {
    switch id {
    case "off": remember(DeviceCommand(device: "", on: false))
    case "on": remember(DeviceCommand(device: "", on: true, colour: last?.on == true ? last?.colour : nil))
    case _ where DeviceCommand.colours.contains(id): remember(DeviceCommand(device: "", on: true, colour: id))
    default: break
    }
  }
}

/// A lamp command as the owner's recordings send it: off; on; or on, then the colour. Each for three seconds, two
/// seconds apart (a colour begun 0.9 s after another ended wasn't taken, 14 Nov).
@MainActor
final class LampSender {
  /// The recordings broadcast, by id, for the UI tests.
  private(set) var sent: [String] = []

  static func recordings(_ c: DeviceCommand) -> [FishLamp.Command] {
    let ids = !c.on ? ["off"] : ["on"] + (c.colour.map { [$0] } ?? [])
    return ids.compactMap { id in FishLamp.loveEcology.first { $0.id == id } }
  }

  /// Nil when every recording went out; why not otherwise (then the rest aren't sent).
  func send(_ c: DeviceCommand) async -> LampAirError? {
    let list = Self.recordings(c)
    guard !list.isEmpty else { return .failed }
    for (i, r) in list.enumerated() {
      if i > 0 { try? await Task.sleep(for: .seconds(2)) }
      // Answered once: when the broadcast started, or why not.
      let started: LampAirError? = await withCheckedContinuation { done in LampRadio.air.start(r.uuids) { done.resume(returning: $0) } }
      if let started { return started }
      sent.append(r.id)
      try? await Task.sleep(for: LoveEcologyModel.seconds)
      LampRadio.air.stop()
    }
    LampMemory.remember(c)
    return nil
  }
}

extension LampAirError {
  /// What the lamp's card says of it.
  var line: String {
    switch self {
    case .off: String(localized: "Bật Bluetooth để gửi lệnh tới đèn.")
    case .refused: String(localized: "AquaTome chưa được dùng Bluetooth. Bật trong Cài đặt → AquaTome → Bluetooth.")
    case .unsupported: String(localized: "Máy này không có Bluetooth.")
    case .failed: String(localized: "Không gửi được lệnh tới đèn. Thử lại.")
    }
  }
}
