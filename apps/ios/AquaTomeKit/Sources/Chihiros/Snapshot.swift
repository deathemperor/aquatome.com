/// The status snapshot a light sends after `askStatus`: `5b <firmware> <length - 2> <id> fe <clock> … <points>`.
/// Captured from a WRGB II Slim (firmware 24); the layout of bytes 9–24 is not known.
public struct Snapshot: Sendable, Equatable {
  /// The light's clock: ISO weekday (1 Monday … 7 Sunday), hour, minute. All zero after a power cut until a clock sync.
  public struct Clock: Sendable, Equatable {
    public let weekday: Int
    public let time: TimeOfDay
    public init(weekday: Int, time: TimeOfDay) { self.weekday = weekday; self.time = time }
    /// Whether the clock has been set since the light last lost power.
    public var isSet: Bool { weekday != 0 }
  }

  /// One point of the saved curve: at `time`, the light is at `level` percent.
  public struct Point: Sendable, Equatable {
    public let time: TimeOfDay
    public let level: Int
    public init(time: TimeOfDay, level: Int) { self.time = time; self.level = level }
  }

  public let firmware: Int
  public let clock: Clock
  /// The saved schedule as a curve, unused slots left out.
  public let points: [Point]

  /// Parses a snapshot reply; nil for any other reply.
  public init?(_ reply: [UInt8]) {
    guard reply.count >= 25, reply[0] == 0x5b, reply[5] == 0xfe else { return nil }
    firmware = Int(reply[1])
    clock = Clock(weekday: Int(reply[6]), time: TimeOfDay(hour: Int(reply[7]), minute: Int(reply[8])))
    // Triples from byte 25 up to the last byte (a trailer); an all-zero triple is an unused slot.
    points = stride(from: 25, to: reply.count - 3, by: 3).compactMap { i in
      let (h, m, l) = (Int(reply[i]), Int(reply[i + 1]), Int(reply[i + 2]))
      return h == 0 && m == 0 && l == 0 ? nil : Point(time: TimeOfDay(hour: h, minute: m), level: l)
    }
  }

  /// The saved curve as one everyday schedule, as this app writes it: dark → ramp up → steady → ramp down → dark
  /// (four points), or on → off with no ramp (two points). Nil if the light holds something else (several periods, or a
  /// curve set in another app). The curve keeps one level, so every channel gets it.
  public func schedule(channels: Int) -> Schedule? {
    let p = points
    let shape: (on: TimeOfDay, off: TimeOfDay, ramp: Int, level: Int)
    switch p.count {
    case 2 where p[0].level > 0 && p[1].level == 0 && p[0].time < p[1].time:
      shape = (p[0].time, p[1].time, 0, p[0].level)
    case 4 where p[0].level == 0 && p[3].level == 0 && p[1].level > 0 && p[1].level == p[2].level
      && p[0].time < p[1].time && p[1].time < p[2].time && p[2].time < p[3].time
      && p[1].time.minutes - p[0].time.minutes == p[3].time.minutes - p[2].time.minutes:
      shape = (p[0].time, p[3].time, p[1].time.minutes - p[0].time.minutes, p[1].level)
    default:
      return nil
    }
    // A schedule ending at 00:00 is written as 23:59.
    let off = shape.off == TimeOfDay(hour: 23, minute: 59) ? TimeOfDay(hour: 0, minute: 0) : shape.off
    return Schedule(on: shape.on, off: off, ramp: shape.ramp, levels: Array(repeating: shape.level, count: channels))
  }

  /// Whether the light holds `s` as written. The curve keeps only the first channel's level (a WRGB II Slim given
  /// 60/50/40 stores 60), so the other channels can't be checked.
  public func holds(_ s: Schedule, channels: Int) -> Bool {
    let p = Frame.scheduleParams(s, channels: channels)
    let on = TimeOfDay(hour: Int(p[0]), minute: Int(p[1])), off = TimeOfDay(hour: Int(p[2]), minute: Int(p[3]))
    let (ramp, level) = (Int(p[4]), Int(p[6]))
    let expected = ramp == 0
      ? [Point(time: on, level: level), Point(time: off, level: 0)]
      : [Point(time: on, level: 0), Point(time: TimeOfDay(minutes: on.minutes + ramp), level: level),
         Point(time: TimeOfDay(minutes: off.minutes - ramp), level: level), Point(time: off, level: 0)]
    return points == expected
  }
}
