@preconcurrency import CoreBluetooth
import FishLamp
import SwiftUI

/// The owner's Love Ecology light ("Aquarium Light III" in the Fish lamp app). It takes commands by broadcast, as Fish lamp
/// sends them, never over a connection: there's nothing to find or connect, and the light says nothing back. The phone
/// plays back the owner's own recordings (`FishLamp.loveEcology`) for three seconds each,
/// as the Mac's replays did that the owner watched work (31 Oct, 6 Nov; docs/research/aquarium-device-control.md); a
/// built colour was taken from the Mac on 14 Nov, and the owner's trial row tries built ones from the phone. iOS
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
  /// The owner's trial of commands built anew, then the recorded green that puts the light back.
  static let trials = FishLamp.trials + FishLamp.loveEcology.filter { $0.id == "green" }.map { FishLamp.Command(id: "trial-green", sent: $0.sent) }
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
  @Environment(\.colorScheme) private var scheme
  /// The colour dots grow with their names, up to about a large tap target.
  @ScaledMetric(relativeTo: .caption) private var dot: CGFloat = 32
  @State private var lamp = LoveEcologyModel()

  var body: some View {
    if account.owner.isOwner == true, account.user != nil, !LoveEcologyModel.commands.isEmpty {
      VStack(alignment: .leading, spacing: 12) {
        Text("Đèn Love Ecology").font(.title3.weight(.semibold))
        Text("Đứng gần đèn và giữ ứng dụng mở khi bấm. Đèn không báo lại trạng thái. Hẹn giờ của đèn vẫn đặt trong ứng dụng Fish lamp.")
          .font(.subheadline).foregroundStyle(.secondary)
        HStack(spacing: 12) {
          ForEach(["on", "off"].compactMap { id in LoveEcologyModel.commands.first { $0.id == id } }) { c in
            Button { lamp.send(c) } label: {
              // The word keeps its room while a spinner stands in for it, so the button doesn't change size.
              Text(Self.name(c.id)).opacity(sending(c) ? 0 : 1).overlay { if sending(c) { ProgressView() } }.frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered).controlSize(.large)
            .disabled(othersWait(c))
            .accessibilityLabel(Self.name(c.id))
            .accessibilityIdentifier("lamp-\(c.id)")
          }
        }
        LazyVGrid(columns: [GridItem(.adaptive(minimum: size.isAccessibilitySize ? 150 : 72), alignment: .top)], spacing: 12) {
          ForEach(LoveEcologyModel.commands.filter { Self.looks[$0.id] != nil }) { c in
            Button { lamp.send(c) } label: {
              VStack(spacing: 4) {
                // A hairline ring in both looks: a deep blue dot is faint on the dark card without one.
                Circle().fill(Self.looks[c.id] ?? .clear).frame(width: min(dot, 44), height: min(dot, 44))
                  .overlay { Circle().strokeBorder(.primary.opacity(scheme == .dark ? 0.5 : 0.25)) }
                Text(Self.name(c.id)).font(.caption).foregroundStyle(.primary).multilineTextAlignment(.center)
                  .opacity(sending(c) ? 0 : 1).overlay { if sending(c) { ProgressView().controlSize(.small) } }
              }
              .frame(maxWidth: .infinity, minHeight: 44)
              .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(othersWait(c))
            .opacity(othersWait(c) ? 0.4 : 1)
            .accessibilityLabel(Self.name(c.id))
            .accessibilityIdentifier("lamp-\(c.id)")
          }
        }
        // The owner's trial of commands built anew (14 Nov), the light's answer seen by eye: it says nothing back. Taken
        // out, or turned into a brightness slider and a free colour, once it has been tried. Not translated: the owner's.
        VStack(alignment: .leading, spacing: 8) {
          Text(verbatim: "Thử lệnh tự tạo").font(.subheadline.weight(.semibold))
          LazyVGrid(columns: [GridItem(.adaptive(minimum: size.isAccessibilitySize ? 220 : 140), alignment: .top)], spacing: 8) {
            ForEach(LoveEcologyModel.trials) { c in
              Button { lamp.send(c) } label: {
                Text(verbatim: Self.name(c.id)).opacity(sending(c) ? 0 : 1).overlay { if sending(c) { ProgressView() } }
                  .frame(maxWidth: .infinity)
              }
              .buttonStyle(.bordered)
              .disabled(othersWait(c))
              .accessibilityIdentifier("lamp-\(c.id)")
            }
          }
        }
        // Always one line, so the first send doesn't push the cards below down. A problem reads as one.
        Group {
          if case .problem = lamp.status {
            Label { Text(verbatim: statusLine) } icon: { Image(systemName: "exclamationmark.triangle.fill") }
              .foregroundStyle(.primary)
          } else {
            Text(verbatim: statusLine).foregroundStyle(lamp.status == .ready ? HierarchicalShapeStyle.tertiary : .secondary)
          }
        }
        .font(.footnote)
        .accessibilityIdentifier("lamp-status")
      }
      .padding()
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
      .onDisappear { lamp.stop() }
      .onChange(of: lamp.status) { if lamp.status != .ready { AccessibilityNotification.Announcement(statusLine).post() } }
      #if DEBUG
      .background {
        // The commands broadcast, for the UI tests to read (debug builds only).
        Text(verbatim: lamp.sent.joined(separator: " ")).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("lamp-sent")
      }
      #endif
    }
  }

  private func sending(_ c: FishLamp.Command) -> Bool { lamp.status == .sending(c.id) }
  /// While a command goes out, the other buttons wait.
  private func othersWait(_ c: FishLamp.Command) -> Bool {
    if case .sending(let id) = lamp.status { id != c.id } else { false }
  }

  private var statusLine: String {
    switch lamp.status {
    case .ready: String(localized: "Chưa gửi lệnh nào")
    case .sending(let id): String(localized: "Đang gửi “\(Self.name(id))”…")
    case .sent(let id, let at):
      // A trial's line asks for ten seconds before the next tap: on 14 Nov the light didn't answer a command sent a second
      // after one it took, so the owner's eyes judge one command at a time.
      String(localized: "Đã gửi “\(Self.name(id))” lúc \(Self.clock(at)).") + (id.hasPrefix("trial-") ? " Đợi 10 giây rồi bấm tiếp." : "")
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

  /// "19:23", as the schedule beside it writes times, whatever the phone's 12- or 24-hour setting.
  private static func clock(_ at: Date) -> String {
    let t = Calendar.current.dateComponents([.hour, .minute], from: at)
    return String(format: "%02d:%02d", t.hour ?? 0, t.minute ?? 0)
  }

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
    // The owner's trial row, not translated.
    case "trial-white-half": "Trắng 50% (tự tạo)"
    case "trial-off": "Tắt (tự tạo 1)"
    case "trial-on": "Bật (tự tạo 1)"
    case "trial-off-recorded": "Tắt (tự tạo 2)"
    case "trial-on-recorded": "Bật (tự tạo 2)"
    case "trial-green": "Xanh lá (ghi sẵn)"
    default: id
    }
  }
}
