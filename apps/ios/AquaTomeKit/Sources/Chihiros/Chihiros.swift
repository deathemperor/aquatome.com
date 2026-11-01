import Foundation

// Chihiros LED lights over Bluetooth: the frames the My Chihiros app sends, from the open protocol notes in
// github.com/TheMicDiet/chihiros-led-control (docs/protocol.md, MIT). A port of the site's
// apps/site/src/scripts/chihiros.ts; both are checked against protocols/chihiros-vectors.json.
// Pure functions here, no Bluetooth.

/// The light's Nordic UART service: frames go to `write`, replies come on `notify`.
public enum UART {
  public static let service = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
  public static let write = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
  public static let notify = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"
}

/// Every Chihiros light's Bluetooth name starts with "DY".
public let namePrefix = "DY"

public enum Channel: String, Sendable, Codable, CaseIterable {
  case red, green, blue, white
}

/// A light model: its channels in channel-id order (red 0, green 1, blue 2, white 3; a white-only light uses 0).
public struct Model: Sendable, Equatable {
  public let name: String
  public let channels: [Channel]

  private static let white: [Channel] = [.white]
  private static let rgb: [Channel] = [.red, .green, .blue]
  private static let wrgb: [Channel] = [.red, .green, .blue, .white]
  // Name prefix → model (registry.py). Lights with other channel layouts (X300, Z Light Tiny, Egg, Commander 1) are left out.
  private static let all: [([String], Model)] = [
    (["DYNA2", "DYNA2N"], Model(name: "A II", channels: white)),
    (["DYA"], Model(name: "A Series", channels: white)),
    (["DYC", "DYNC2"], Model(name: "C", channels: white)),
    (["DYNC2N"], Model(name: "C II", channels: white)),
    (["DYONE"], Model(name: "Commander X", channels: white)),
    (["DYARGB", "DYRGBA+", "DYRGBA", "DYNARGB"], Model(name: "RGB A Plus", channels: rgb)),
    (["DYREE", "DYNVVD", "DYNV"], Model(name: "RGB VIVID", channels: rgb)),
    (["DYWRGB", "DYNT90", "DYNW30", "DYNW45", "DYNW60", "DYNW90", "DYNW12P", "DYNWRGB"], Model(name: "WRGB II", channels: rgb)),
    (["DYSILN", "DYSL30", "DYSL45", "DYSL60", "DYSL90", "DYSL120", "DYSL12"], Model(name: "WRGB II Slim", channels: rgb)),
    (["DYNCRGP", "DYNCRGB"], Model(name: "C II RGB", channels: rgb)),
    (["DYWPRO30", "DYWPRO45", "DYWPRO60", "DYWPRO80", "DYWPRO90", "DYWPR120"], Model(name: "WRGB II Pro", channels: wrgb)),
    (["DYVVD3"], Model(name: "WRGB VIVID III", channels: wrgb)),
    (["DYU550", "DYU600", "DYU700", "DYU800", "DYU920", "DYU1000", "DYU1200", "DYU1500"], Model(name: "Universal WRGB", channels: wrgb)),
    (["DYSEA"], Model(name: "SEA", channels: wrgb)),
    (["DYLED", "DYNLED"], Model(name: "Commander 4", channels: wrgb)),
  ]
  /// The supported lines, for the app's text.
  public static let supported = all.map(\.1.name)
  private static let byPrefix = all.flatMap { ps, m in ps.map { ($0, m) } }.sorted { $0.0.count > $1.0.count }

  /// The model a light's Bluetooth name belongs to (longest prefix: DYNA2N before DYNA2 before DYA), if supported.
  public static func of(name: String) -> Model? { byPrefix.first { name.hasPrefix($0.0) }?.1 }
}

/// A time of day, minute precision ("08:30").
public struct TimeOfDay: Sendable, Hashable, Comparable, CustomStringConvertible {
  public let hour: Int
  public let minute: Int
  public init(hour: Int, minute: Int) { self.hour = hour; self.minute = minute }
  /// "HH:mm"; nil if malformed or out of range.
  public init?(_ text: String) {
    let p = text.split(separator: ":")
    guard p.count == 2, let h = Int(p[0]), let m = Int(p[1]), (0..<24).contains(h), (0..<60).contains(m) else { return nil }
    self.init(hour: h, minute: m)
  }
  /// From minutes since midnight, wrapping around the day.
  public init(minutes: Int) {
    let m = (minutes % 1440 + 1440) % 1440
    self.init(hour: m / 60, minute: m % 60)
  }
  public var minutes: Int { hour * 60 + minute }
  public var description: String { String(format: "%02d:%02d", hour, minute) }
  public static func < (a: TimeOfDay, b: TimeOfDay) -> Bool { a.minutes < b.minutes }
}

/// An everyday sunrise/sunset setting: on and off, the ramp in minutes, and a level (0–100) per channel.
public struct Schedule: Sendable, Equatable {
  public var on: TimeOfDay
  public var off: TimeOfDay
  public var ramp: Int
  public var levels: [Int]
  public init(on: TimeOfDay, off: TimeOfDay, ramp: Int, levels: [Int]) {
    self.on = on; self.off = off; self.ramp = ramp; self.levels = levels
  }

  /// Hours of light between on and off (08:00–16:00 → 8), to one decimal.
  public var hoursLit: Double { Schedule.hoursLit(on: on, off: off) }
  public static func hoursLit(on: TimeOfDay, off: TimeOfDay) -> Double {
    let d = (off.minutes - on.minutes + 1440) % 1440
    return (Double(d) / 60 * 10).rounded() / 10
  }
}

/// Levels for a light with `n` channels from levels planned for another: a white-only light takes the brightest, and a
/// channel the plan didn't have takes the brightest too (the site's light page does the same).
public func fit(_ levels: [Int], to n: Int) -> [Int] {
  let top = levels.max() ?? 0
  return n == 1 ? [top] : (0..<n).map { $0 < levels.count ? levels[$0] : top }
}

public enum Mode {
  public static let manual: UInt8 = 11
  public static let scene: UInt8 = 18
  public static let sceneReset: UInt8 = 0x28
}

/// The frames sent to the light: `[cmd, 0x01, params + 5, id hi, id lo, mode, ...params, XOR of bytes 1..]`.
public enum Frame {
  /// Message ids count up from 1, skipping 0x5a in either byte, and wrap after 0xffff.
  public static func nextId(after id: UInt16) -> UInt16 {
    var n: UInt16 = id == 0xffff ? 1 : id + 1
    while n >> 8 == 0x5a || n & 0xff == 0x5a { n = n == 0xffff ? 1 : n + 1 }
    return n
  }

  public static func make(cmd: UInt8, mode: UInt8, params: [UInt8], id: UInt16) -> [UInt8] {
    let f: [UInt8] = [cmd, 0x01, UInt8(params.count + 5), UInt8(id >> 8), UInt8(id & 0xff), mode] + params
    return f + [f.dropFirst().reduce(0, ^)]
  }

  /// Switch the light's controller: manual, the sunrise/sunset scene, or clear the scenes.
  public static func setMode(_ mode: UInt8, id: UInt16) -> [UInt8] { make(cmd: 0x5a, mode: 0x05, params: [mode, 255, 255], id: id) }
  /// One channel's manual level, 0–100.
  public static func setLevel(channel: Int, level: Int, id: UInt16) -> [UInt8] {
    make(cmd: 0x5a, mode: 0x07, params: [UInt8(channel), UInt8(clamp(level))], id: id)
  }
  /// The light's clock (its schedule runs on it; a power cut resets it). The third field is the ISO weekday.
  /// Always the Gregorian calendar: a Thai phone's Buddhist year would not fit.
  public static func setTime(_ date: Date, timeZone: TimeZone = .current, id: UInt16) -> [UInt8] {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let c = cal.dateComponents([.year, .month, .weekday, .hour, .minute, .second], from: date)
    let iso = (c.weekday! + 5) % 7 + 1 // Calendar: Sunday 1 … Saturday 7; ISO: Monday 1 … Sunday 7
    return make(cmd: 0x5a, mode: 0x09, params: [c.year! - 2000, c.month!, iso, c.hour!, c.minute!, c.second!].map { UInt8($0) }, id: id)
  }
  /// Ask for the status reply (its byte 1 is the firmware version).
  public static func askStatus(id: UInt16) -> [UInt8] { make(cmd: 0x5a, mode: 0x04, params: [1], id: id) }

  /// An everyday schedule: `[on h, on m, off h, off m, ramp minutes, weekdays, levels by channel id, 255…]`, 14 bytes.
  /// A white-only light takes `[white, 255, 255]`; a schedule ending at 00:00 is written as 23:59.
  public static func scheduleParams(_ s: Schedule, channels: Int) -> [UInt8] {
    let off = s.off.minutes == 0 ? TimeOfDay(hour: 23, minute: 59) : s.off
    let levels = channels == 1 ? [clamp(s.levels.first ?? 0), 255, 255] : s.levels.prefix(channels).map(clamp)
    let p = [s.on.hour, s.on.minute, off.hour, off.minute, max(0, min(150, s.ramp)), 127] + levels
    return (p + Array(repeating: 255, count: max(0, 14 - p.count))).map { UInt8($0) }
  }
  public static func setSchedule(_ s: Schedule, channels: Int, id: UInt16) -> [UInt8] {
    make(cmd: 0xa5, mode: 0x19, params: scheduleParams(s, channels: channels), id: id)
  }

  static func clamp(_ n: Int) -> Int { max(0, min(100, n)) }
}

public enum Reply {
  /// The firmware version in a status reply (`5b <firmware> …`), if this is one.
  public static func firmware(_ reply: [UInt8]) -> Int? { reply.count >= 7 && reply[0] == 0x5b ? Int(reply[1]) : nil }

  /// The light's clock from its long status reply (`5b <firmware> <len> <id> fe <weekday> <hour> <minute> …`), if this is
  /// one. Weekday 0 means a power cut reset it.
  public static func clock(_ reply: [UInt8]) -> Snapshot.Clock? {
    guard reply.count >= 9, reply[0] == 0x5b, reply[5] == 0xfe, reply[6] <= 7, reply[7] < 24, reply[8] < 60 else { return nil }
    return Snapshot.Clock(weekday: Int(reply[6]), time: TimeOfDay(hour: Int(reply[7]), minute: Int(reply[8])))
  }
}

/// Why the light can't take a schedule as entered.
public enum ScheduleProblem: Sendable, Equatable {
  /// Off must come after on, the same day (00:00 counts as the end of the day).
  case offNotAfterOn
  /// The ramp is 0–150 minutes.
  case rampOutOfRange
  /// Ramping up and down takes longer than the light is on.
  case rampTooLong
}

extension Schedule {
  /// Minutes the light is on, within one day: an off time of 00:00 is the end of the day (00:00–00:00 is 24 hours).
  public var minutesLit: Int { (off.minutes == 0 ? 1440 : off.minutes) - on.minutes }

  /// How bright the schedule has the light at a minute of the day, 0–1 of its levels: off before `on`, rising over `ramp`
  /// minutes, full, falling over the last `ramp` minutes to off at `off` (00:00: midnight).
  public func level(atMinute m: Int) -> Double {
    let (on, off) = (on.minutes, off.minutes == 0 ? 1440 : off.minutes)
    if m < on || m >= off { return 0 }
    if ramp > 0 && m < on + ramp { return Double(m - on) / Double(ramp) }
    if ramp > 0 && m > off - ramp { return Double(off - m) / Double(ramp) }
    return 1
  }

  /// What's wrong with this schedule, if anything: the same rules as the site's form.
  public var problem: ScheduleProblem? {
    let lit = minutesLit
    if lit <= 0 { return .offNotAfterOn }
    if !(0...150).contains(ramp) { return .rampOutOfRange }
    if ramp * 2 > lit { return .rampTooLong }
    return nil
  }
}
