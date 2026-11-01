import Chihiros
import ChihirosBLE
import CoreBluetooth
import Foundation

/// Finding and connecting to lights. On a phone this is Bluetooth; the simulator has none, so it gets one fake light.
@MainActor
protocol Radio: AnyObject {
  func scan() async throws -> AsyncStream<FoundLight>
  func stopScan()
  /// `onLost` runs if the connection drops on its own (out of range, light switched off).
  func connect(_ light: FoundLight, onLost: @escaping @MainActor () -> Void) async throws -> LightLink
  var pacing: LightSession.Pacing { get }
  /// The reader said no to Bluetooth for this app, known without asking again (no permission prompt).
  var isRefused: Bool { get }
}

@MainActor
final class BluetoothRadio: Radio {
  private let bluetooth = Bluetooth()
  let pacing = LightSession.Pacing.light
  var isRefused: Bool { [.denied, .restricted].contains(CBCentralManager.authorization) }

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

// Debug builds only: the UI tests' stand-in, kept out of the App Store build.
#if DEBUG
/// The simulator's light: a WRGB II Slim holding the owner's everyday schedule. Launch arguments for UI tests:
/// `-fake-clock-unset` (as after a power cut), `-fake-clock-slow` (seven hours behind), `-fake-old-firmware` (firmware
/// 19), `-fake-other-schedule` (10:00–17:00, 55%, ramp 15: not the form's starting values), `-fake-slow` (each frame
/// takes 1.5 s), `-fake-no-bluetooth` (the reader refused Bluetooth), `-fake-drop` (the light drops the first connection
/// at the first level set by hand, and isn't seen by a scan again: it can only be connected to again as the light it was),
/// `-fake-drop-reading` (the same, at the first status request, while the app reads the light).
@MainActor
final class FakeRadio: Radio {
  static let light = FoundLight(id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!, name: "DYSL30A1B2C3", rssi: -58)
  let pacing = LightSession.Pacing(gap: .milliseconds(20), scheduleGap: .milliseconds(60), statusTimeout: .seconds(2), readbackTries: 3)
  private let arguments: [String]
  private var sink: AsyncStream<FoundLight>.Continuation?
  private var scans = 0
  /// The light last connected to: connecting again finds it as it was left.
  private var held: FakeLight?

  init(arguments: [String] = ProcessInfo.processInfo.arguments) { self.arguments = arguments }

  var isRefused: Bool { arguments.contains("-fake-no-bluetooth") }
  private var drops: Bool { arguments.contains("-fake-drop") || arguments.contains("-fake-drop-reading") }

  func scan() async throws -> AsyncStream<FoundLight> {
    if isRefused { throw BluetoothError.unauthorized }
    stopScan()
    scans += 1
    let (stream, sink) = AsyncStream<FoundLight>.makeStream()
    self.sink = sink
    if scans == 1 || !drops {
      Task {
        try? await Task.sleep(for: .milliseconds(400))
        sink.yield(Self.light)
      }
    }
    return stream
  }

  func stopScan() {
    sink?.finish()
    sink = nil
  }

  func connect(_ light: FoundLight, onLost: @escaping @MainActor () -> Void) async throws -> LightLink {
    try await Task.sleep(for: .milliseconds(300))
    let fake: FakeLight
    if let held {
      fake = FakeLight(firmware: held.firmware, clock: held.clock, points: held.points)
    } else {
      let schedule = arguments.contains("-fake-other-schedule")
        ? Schedule(on: TimeOfDay(hour: 10, minute: 0), off: TimeOfDay(hour: 17, minute: 0), ramp: 15, levels: [55, 55, 55])
        : Schedule(on: TimeOfDay(hour: 12, minute: 0), off: TimeOfDay(hour: 20, minute: 0), ramp: 30, levels: [70, 70, 70])
      fake = FakeLight(firmware: arguments.contains("-fake-old-firmware") ? 19 : 24, schedule: schedule, channels: 3)
      fake.clock = arguments.contains("-fake-clock-unset")
        ? Snapshot.Clock(weekday: 0, time: TimeOfDay(hour: 0, minute: 0))
        : Snapshot.Clock(date: Date().addingTimeInterval(arguments.contains("-fake-clock-slow") ? -7 * 3600 : 0))
      if drops {
        let at: UInt8 = arguments.contains("-fake-drop-reading") ? 0x04 : 0x07
        fake.afterWrite = { [weak fake] f in
          guard f[5] == at, let fake else { return }
          fake.disconnect()
          onLost()
        }
      }
    }
    fake.writeDelay = arguments.contains("-fake-slow") ? .milliseconds(1500) : .milliseconds(15)
    held = fake
    return fake
  }
}
#endif
