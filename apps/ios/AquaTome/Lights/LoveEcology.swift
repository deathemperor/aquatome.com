@preconcurrency import CoreBluetooth
import FishLamp
import SwiftUI

/// The owner's Love Ecology light ("Aquarium Light III" in the Fish lamp app). It takes commands by broadcast, as Fish lamp
/// sends them, never over a connection: there's nothing to find or connect, and the light says nothing back. It ignores
/// commands built anew, so the phone plays back the owner's own recordings (`FishLamp.loveEcology`) for three seconds each,
/// as the Mac's replays did that the owner watched work (31 Oct, 6 Nov; docs/research/aquarium-device-control.md). iOS
/// broadcasts only while the app is in front. The owner's account alone sees it: whether the recordings work on anyone
/// else's light is untested.
@MainActor
protocol LampAir: AnyObject {
  /// Broadcasts the 16-bit service UUIDs (4 hex digits each), in order, until `stop`. `done` says whether it started.
  func start(_ uuids: [String], done: @escaping @MainActor (LampAirError?) -> Void)
  func stop()
}

enum LampAirError: Error { case off, refused, unsupported, failed }

/// The phone's Bluetooth, broadcasting as Fish lamp does. Its manager is made at the first tap, not when the screen opens.
@MainActor
final class BluetoothLampAir: NSObject, LampAir {
  private var manager: CBPeripheralManager?
  /// A broadcast asked for before Bluetooth said it was on.
  private var waiting: (uuids: [CBUUID], done: @MainActor (LampAirError?) -> Void)?
  private var starting: (@MainActor (LampAirError?) -> Void)?

  func start(_ uuids: [String], done: @escaping @MainActor (LampAirError?) -> Void) {
    let ids = uuids.map { CBUUID(string: $0) }
    guard let manager else {
      waiting = (ids, done)
      manager = CBPeripheralManager(delegate: self, queue: nil)
      return
    }
    advertise(ids, on: manager, done: done)
  }

  func stop() {
    waiting = nil
    manager?.stopAdvertising()
  }

  private func advertise(_ ids: [CBUUID], on manager: CBPeripheralManager, done: @escaping @MainActor (LampAirError?) -> Void) {
    if let e = Self.error(manager.state) { return done(e) }
    // Unknown or resetting: wait for the state.
    guard manager.state == .poweredOn else { waiting = (ids, done); return }
    manager.stopAdvertising()
    starting = done
    manager.startAdvertising([CBAdvertisementDataServiceUUIDsKey: ids])
  }

  private static func error(_ state: CBManagerState) -> LampAirError? {
    switch state {
    case .poweredOff: .off
    case .unauthorized: .refused
    case .unsupported: .unsupported
    default: nil
    }
  }
}

extension BluetoothLampAir: @preconcurrency CBPeripheralManagerDelegate {
  func peripheralManagerDidUpdateState(_ manager: CBPeripheralManager) {
    // Bluetooth went off or reset while a broadcast was starting: say so, rather than leave the card sending.
    if manager.state != .poweredOn, let done = starting {
      starting = nil
      done(Self.error(manager.state) ?? .failed)
    }
    guard let w = waiting else { return }
    if let e = Self.error(manager.state) {
      waiting = nil
      w.done(e)
    } else if manager.state == .poweredOn {
      waiting = nil
      advertise(w.uuids, on: manager, done: w.done)
    }
  }

  func peripheralManagerDidStartAdvertising(_ manager: CBPeripheralManager, error: Error?) {
    let done = starting
    starting = nil
    done?(error == nil ? nil : .failed)
  }
}

// Debug builds only: the UI tests' stand-in, kept out of the App Store build.
#if DEBUG
/// The simulator has no Bluetooth to broadcast with. `-fake-lamp-off`: Bluetooth is off.
@MainActor
final class FakeLampAir: LampAir {
  func start(_ uuids: [String], done: @escaping @MainActor (LampAirError?) -> Void) {
    done(ProcessInfo.processInfo.arguments.contains("-fake-lamp-off") ? .off : nil)
  }
  func stop() {}
}
#endif

@MainActor
@Observable
final class LoveEcologyModel {
  enum Status: Equatable {
    case ready
    case sending(String)
    case sent(String, Date)
    case problem(LampAirError)
  }

  /// Off, on, then the colours, as recorded.
  static let commands = FishLamp.loveEcology
  static let seconds: Duration = .seconds(3)

  private(set) var status = Status.ready
  /// The commands broadcast, by id, for the UI tests.
  private(set) var sent: [String] = []
  @ObservationIgnored private lazy var air: LampAir = Self.makeAir()
  @ObservationIgnored private var ending: Task<Void, Never>?

  /// Broadcasts a command for three seconds. Another tap meanwhile replaces it.
  func send(_ command: FishLamp.Command) {
    ending?.cancel()
    status = .sending(command.id)
    air.start(command.uuids) { [weak self] e in
      guard let self, self.status == .sending(command.id) else { return }
      if let e { self.status = .problem(e); return }
      self.sent.append(command.id)
      self.ending = Task { [weak self] in
        try? await Task.sleep(for: LoveEcologyModel.seconds)
        guard !Task.isCancelled, let self else { return }
        self.air.stop()
        self.status = .sent(command.id, Date())
      }
    }
  }

  /// Leaving the screen ends a broadcast at once.
  func stop() {
    ending?.cancel()
    air.stop()
    if case .sending = status { status = .ready }
  }

  private static func makeAir() -> LampAir {
    #if DEBUG && targetEnvironment(simulator)
    FakeLampAir()
    #else
    BluetoothLampAir()
    #endif
  }
}

/// The light's card on the Đèn tab: on, off and the recorded colours. The owner's account alone.
struct LoveEcologyCard: View {
  @Environment(AccountModel.self) private var account
  @Environment(\.dynamicTypeSize) private var size
  @State private var lamp = LoveEcologyModel()

  var body: some View {
    if account.owner.isOwner == true, account.user != nil, !LoveEcologyModel.commands.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        Text("Đèn Love Ecology").font(.title3.weight(.semibold))
        Text("Đứng gần đèn và giữ ứng dụng mở khi bấm. Đèn không báo lại trạng thái. Hẹn giờ của đèn vẫn đặt trong ứng dụng Fish lamp.")
          .font(.subheadline).foregroundStyle(.secondary)
        HStack(spacing: 12) {
          ForEach(["on", "off"].compactMap { id in LoveEcologyModel.commands.first { $0.id == id } }) { c in
            Button { lamp.send(c) } label: { Text(Self.name(c.id)).frame(maxWidth: .infinity) }
              .buttonStyle(.bordered).controlSize(.large)
              .accessibilityIdentifier("lamp-\(c.id)")
          }
        }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: size.isAccessibilitySize ? 150 : 72), alignment: .top)], spacing: 12) {
          ForEach(LoveEcologyModel.commands.filter { Self.looks[$0.id] != nil }) { c in
            Button { lamp.send(c) } label: {
              VStack(spacing: 4) {
                Circle().fill(Self.looks[c.id] ?? .clear).frame(width: 32, height: 32)
                  .overlay { Circle().strokeBorder(.secondary.opacity(0.4)) }
                Text(Self.name(c.id)).font(.caption).foregroundStyle(.primary).multilineTextAlignment(.center)
              }
              .frame(maxWidth: .infinity, minHeight: 44)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("lamp-\(c.id)")
          }
        }
        if let line = statusLine {
          Text(verbatim: line).font(.footnote).foregroundStyle(.secondary).accessibilityIdentifier("lamp-status")
        }
      }
      .padding()
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
      .onDisappear { lamp.stop() }
      .onChange(of: lamp.status) { if let line = statusLine { AccessibilityNotification.Announcement(line).post() } }
      #if DEBUG
      .background {
        // The commands broadcast, for the UI tests to read (debug builds only).
        Text(verbatim: lamp.sent.joined(separator: " ")).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("lamp-sent")
      }
      #endif
    }
  }

  private var statusLine: String? {
    switch lamp.status {
    case .ready: nil
    case .sending(let id): String(localized: "Đang gửi “\(Self.name(id))”…")
    case .sent(let id, let at): String(localized: "Đã gửi “\(Self.name(id))” lúc \(at.formatted(date: .omitted, time: .shortened)).")
    case .problem(.off): String(localized: "Bật Bluetooth để gửi lệnh tới đèn.")
    case .problem(.refused): String(localized: "AquaTome chưa được dùng Bluetooth. Bật trong Cài đặt → AquaTome → Bluetooth.")
    case .problem(.unsupported): String(localized: "Máy này không có Bluetooth.")
    case .problem(.failed): String(localized: "Không gửi được lệnh tới đèn. Thử lại.")
    }
  }

  /// Each colour's swatch, from the hue the light was sent (docs/research/aquarium-device-control.md).
  private static let looks: [String: Color] = [
    "white": .white, "red": Color(hue: 0, saturation: 1, brightness: 1), "orange": Color(hue: 30 / 360, saturation: 1, brightness: 1),
    "yellow": Color(hue: 60 / 360, saturation: 1, brightness: 1), "green": Color(hue: 120 / 360, saturation: 1, brightness: 1),
    "cyan": Color(hue: 180 / 360, saturation: 1, brightness: 1), "blue": Color(hue: 240 / 360, saturation: 1, brightness: 1),
    "magenta": Color(hue: 300 / 360, saturation: 1, brightness: 1),
  ]

  private static func name(_ id: String) -> String {
    switch id {
    case "on": String(localized: "Bật")
    case "off": String(localized: "Tắt")
    case "white": String(localized: "Trắng")
    case "red": String(localized: "Đỏ")
    case "orange": String(localized: "Cam")
    case "yellow": String(localized: "Vàng")
    case "green": String(localized: "Xanh lá")
    case "cyan": String(localized: "Xanh lơ")
    case "blue": String(localized: "Xanh dương")
    case "magenta": String(localized: "Hồng tím")
    default: id
    }
  }
}
