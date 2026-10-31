import Chihiros
import ChihirosBLE
import Foundation

/// Finding and connecting to lights. On a phone this is Bluetooth; the simulator has none, so it gets one fake light.
@MainActor
protocol Radio: AnyObject {
  func scan() async throws -> AsyncStream<FoundLight>
  func stopScan()
  /// `onLost` runs if the connection drops on its own (out of range, light switched off).
  func connect(_ light: FoundLight, onLost: @escaping @MainActor () -> Void) async throws -> LightLink
  var pacing: LightSession.Pacing { get }
}

@MainActor
final class BluetoothRadio: Radio {
  private let bluetooth = Bluetooth()
  let pacing = LightSession.Pacing.light

  func scan() async throws -> AsyncStream<FoundLight> { try await bluetooth.scan() }
  func stopScan() { bluetooth.stopScan() }

  func connect(_ light: FoundLight, onLost: @escaping @MainActor () -> Void) async throws -> LightLink {
    // A light that was just let go sometimes drops the next connection at once (hands-on, 2026-10-31): try twice.
    let link: BLELink
    do { link = try await bluetooth.connect(light) } catch BluetoothError.disconnected {
      try await Task.sleep(for: .seconds(1))
      link = try await bluetooth.connect(light)
    }
    link.onDisconnect = onLost
    return link
  }
}

/// The simulator's light: a WRGB II Slim holding the owner's everyday schedule. Launch arguments for UI tests:
/// `-fake-clock-unset` (as after a power cut), `-fake-old-firmware` (firmware 19).
@MainActor
final class FakeRadio: Radio {
  static let light = FoundLight(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!, name: "DYSL30A1B2C3", rssi: -58)
  let pacing = LightSession.Pacing(gap: .milliseconds(20), scheduleGap: .milliseconds(60), statusTimeout: .seconds(2), readbackTries: 3)
  private let arguments: [String]

  init(arguments: [String] = ProcessInfo.processInfo.arguments) { self.arguments = arguments }

  func scan() async throws -> AsyncStream<FoundLight> {
    AsyncStream { sink in
      Task {
        try? await Task.sleep(for: .milliseconds(400))
        sink.yield(Self.light)
      }
    }
  }

  func stopScan() {}

  func connect(_ light: FoundLight, onLost: @escaping @MainActor () -> Void) async throws -> LightLink {
    try await Task.sleep(for: .milliseconds(300))
    let schedule = Schedule(on: TimeOfDay(hour: 12, minute: 0), off: TimeOfDay(hour: 20, minute: 0), ramp: 30, levels: [70, 70, 70])
    let fake = FakeLight(firmware: arguments.contains("-fake-old-firmware") ? 19 : 24, schedule: schedule, channels: 3)
    fake.clock = arguments.contains("-fake-clock-unset")
      ? Snapshot.Clock(weekday: 0, time: TimeOfDay(hour: 0, minute: 0))
      : Snapshot.Clock(date: Date())
    fake.writeDelay = .milliseconds(15)
    return fake
  }
}
