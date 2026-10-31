/// A light that isn't there, for tests and the simulator (which has no Bluetooth). It answers the way the WRGB II Slim
/// (firmware 24) did in hands-on tests on 2026-10-31:
/// - `askStatus` → a runtime reply, then a status snapshot (`Snapshot`).
/// - A schedule is stored as a curve with one level, the first channel's; with no ramp it is two points.
/// - Clearing the scenes empties the curve.
@MainActor
public final class FakeLight: LightLink {
  public let replies: AsyncStream<[UInt8]>
  private let sink: AsyncStream<[UInt8]>.Continuation

  /// Every frame received, in order.
  public private(set) var sent: [[UInt8]] = []
  public var firmware: Int
  public var clock: Snapshot.Clock
  public var points: [Snapshot.Point]
  public private(set) var isManual = false
  public private(set) var levels: [Int: Int] = [:]
  /// Status reads after a schedule write that still show the cleared curve, as the real light sometimes does.
  public var staleReadbacks = 0
  /// Stop answering status requests.
  public var silent = false
  /// How long each write takes to be acknowledged.
  public var writeDelay: Duration = .zero
  public private(set) var isConnected = true

  public init(firmware: Int = 24, clock: Snapshot.Clock = .init(weekday: 6, time: TimeOfDay(hour: 15, minute: 41)), points: [Snapshot.Point]) {
    self.firmware = firmware
    self.clock = clock
    self.points = points
    (replies, sink) = AsyncStream<[UInt8]>.makeStream()
  }

  /// A light holding `schedule` on `channels` channels, written the way the app writes it.
  public convenience init(firmware: Int = 24, schedule: Schedule, channels: Int) {
    self.init(firmware: firmware, points: [])
    store(Frame.scheduleParams(schedule, channels: channels))
  }

  public func write(_ f: [UInt8]) async throws {
    guard isConnected else { throw FakeLightError.disconnected }
    if writeDelay > .zero { try await Task.sleep(for: writeDelay) }
    sent.append(f)
    let params = Array(f[6..<(f.count - 1)])
    switch (f[0], f[5]) {
    case (0x5a, 0x04):
      guard !silent else { return }
      sink.yield([0x5b, UInt8(firmware), 0x0a, 0x00, 0x01, 0x0a, 0x01, 0xff, 0xff, 0xff, 0xff, 0x01, 0x26, 0x3f])
      if staleReadbacks > 0 && sent.contains(where: { $0[0] == 0xa5 }) {
        staleReadbacks -= 1
        sink.yield(FakeLight.snapshot(firmware: firmware, clock: clock, points: []))
      } else {
        sink.yield(FakeLight.snapshot(firmware: firmware, clock: clock, points: points))
      }
    case (0x5a, 0x09):
      clock = Snapshot.Clock(weekday: Int(params[2]), time: TimeOfDay(hour: Int(params[3]), minute: Int(params[4])))
    case (0x5a, 0x05):
      isManual = params[0] == Mode.manual
      if params[0] == Mode.sceneReset { points = [] }
    case (0x5a, 0x07):
      levels[Int(params[0])] = Int(params[1])
    case (0xa5, 0x19):
      store(params)
    default:
      break
    }
  }

  public func disconnect() {
    isConnected = false
    sink.finish()
  }

  private func store(_ p: [UInt8]) {
    let on = TimeOfDay(hour: Int(p[0]), minute: Int(p[1])), off = TimeOfDay(hour: Int(p[2]), minute: Int(p[3]))
    let (ramp, level) = (Int(p[4]), Int(p[6]))
    points = ramp == 0
      ? [.init(time: on, level: level), .init(time: off, level: 0)]
      : [.init(time: on, level: 0), .init(time: TimeOfDay(minutes: on.minutes + ramp), level: level),
         .init(time: TimeOfDay(minutes: off.minutes - ramp), level: level), .init(time: off, level: 0)]
  }

  /// A 50-byte snapshot in the captured layout; bytes 9–24 (meaning unknown) are zero apart from the clock copy.
  public nonisolated static func snapshot(firmware: Int, clock: Snapshot.Clock, points: [Snapshot.Point]) -> [UInt8] {
    let c = [UInt8(clock.weekday), UInt8(clock.time.hour), UInt8(clock.time.minute)]
    var b: [UInt8] = [0x5b, UInt8(firmware), 0x30, 0x00, 0x01, 0xfe] + c + Array(repeating: 0, count: 13) + c
    // The real light closes a curve that starts at 00:00 with the same point at 24:00.
    var points = points
    if points.count > 1, let first = points.first, first.time.minutes == 0 { points.append(.init(time: TimeOfDay(hour: 24, minute: 0), level: first.level)) }
    for p in points.prefix(8) { b += [UInt8(p.time.hour), UInt8(p.time.minute), UInt8(p.level)] }
    return b + Array(repeating: 0, count: 50 - b.count)
  }
}

public enum FakeLightError: Error { case disconnected }
