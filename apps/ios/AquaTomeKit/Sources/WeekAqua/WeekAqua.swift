import Chihiros
import Foundation

// Week Aqua lights of model code 5746 over Bluetooth: the frames the WEEK AQUA app sends, as the owner's three lights
// took them in hands-on tests (docs/research/aquarium-device-control.md, "Hands-on with the three Week Aqua lights").
// The frames follow alokauz/ha-weekaqua (MIT), which the lights followed; facts from ad960009's protocol spec only, never
// its code (it has no licence). Checked against protocols/weekaqua-vectors.json. Pure functions here, no Bluetooth.
//
// These lights never answer: nothing comes back on `fff1`, so the app can't read what a light shows or runs. What it
// last sent is the only record of it.

/// The light's Bluetooth services, and the one characteristic this app writes.
public enum WeekAquaGATT {
  /// Frames go to `write` (without response) under `service`. `notify` exists but has never sent anything.
  public static let service = "FFF0"
  public static let write = "FFF2"
  public static let notify = "FFF1"
  /// The firmware-update (OAD) service the lights also expose. Named here only to be kept out: a frame written there
  /// could leave a light that no app can start again.
  public static let firmwareUpdate = "F000FFC0-0451-4000-B000-000000000000"

  /// The services the app looks for on a connected light: `fff0` only, so the firmware-update service's characteristics
  /// are never even found.
  public static let servicesToDiscover = [service]

  /// The characteristic to write frames to, from those found under `service`: `fff2`, and only under `fff0`. Nil for
  /// anything else, the firmware-update service above all: the app then has nothing to write to and doesn't connect.
  public static func writeCharacteristic(service: String, characteristics: [String]) -> String? {
    guard short(service) == Self.service else { return nil }
    return characteristics.first { short($0) == write }
  }

  /// Whether a service or characteristic belongs to the firmware-update service (`f000ffc0`, `f000ffc1`, …).
  public static func isFirmwareUpdate(_ uuid: String) -> Bool { uuid.uppercased().hasPrefix("F000FFC") }

  /// A Bluetooth UUID in its short form when it has one: "0000fff2-0000-1000-8000-00805f9b34fb" → "FFF2".
  static func short(_ uuid: String) -> String {
    let u = uuid.uppercased()
    let base = "-0000-1000-8000-00805F9B34FB"
    if u.count == 36, u.hasSuffix(base), u.hasPrefix("0000") { return String(u.dropFirst(4).prefix(4)) }
    return u
  }
}

/// A Week Aqua light as it advertises itself: its model code and its own address, from its manufacturer data.
///
/// The manufacturer data starts `57 46`: the company-id field (18007, sent little-endian), which Week Aqua uses for the
/// model code, read as hex digits ("5746"). Then `00 01` and the light's address. Codes 5745 and 5747–5752 are other
/// Week Aqua lights that speak other protocols: listed, never written to.
public struct WeekAquaAdvert: Sendable, Hashable {
  /// "5746"; nil for a light that looks like a Week Aqua by its name but didn't say its code.
  public let code: String?
  /// The light's own address, from its manufacturer data; nil when it isn't there.
  public let address: [UInt8]?

  public init(code: String?, address: [UInt8]?) { self.code = code; self.address = address }

  /// The model code this app can drive.
  public static let supportedCode = "5746"
  /// The model codes Week Aqua lights advertise (ad960009's spec covers these).
  public static let knownCodes = ["5745", "5746", "5747", "5748", "5749", "5750", "5751", "5752"]

  /// Only 5746 lights are written to.
  public var isSupported: Bool { code == Self.supportedCode }

  /// The light's address as a record keeps it ("A1:B2:C3:D4:E5:F6": uppercase, colons), to tell apart lights with the
  /// same name.
  public var addressText: String? { address.map { $0.map { String(format: "%02X", $0) }.joined(separator: ":") } }

  /// The Week Aqua light advertising `manufacturerData` under `name`, if it is one. Its manufacturer data decides the
  /// model code; a name like WEEK AQUA's own (`WEEKAQUA3.0`, `B3.0-A430Pro-…`) without that data is a Week Aqua light of
  /// unknown code, listed but never written to.
  public static func of(manufacturerData: [UInt8]?, name: String) -> WeekAquaAdvert? {
    if let d = manufacturerData, d.count >= 2 {
      let code = String(format: "%02X%02X", d[0], d[1])
      if knownCodes.contains(code) {
        let address = d.count >= 10 && d[2] == 0x00 && d[3] == 0x01 ? Array(d[4..<10]) : nil
        return WeekAquaAdvert(code: code, address: address)
      }
    }
    return looksLikeWeekAqua(name) ? WeekAquaAdvert(code: nil, address: nil) : nil
  }

  /// WEEK AQUA's names: `WEEKAQUA3.0`, and `B3.0-A430Pro-99` (a board version, then the light's line).
  static func looksLikeWeekAqua(_ name: String) -> Bool {
    name.uppercased().hasPrefix("WEEKAQUA") || name.range(of: #"^B\d\.\d-"#, options: .regularExpression) != nil
  }
}

/// Red, green, blue and UV, each 0–235 (235 is full), as the levels frame carries them.
public struct WeekAquaLevels: Sendable, Hashable {
  public static let max = 235
  public let red: Int, green: Int, blue: Int, uv: Int

  /// Nil if any level is outside 0–235: the light's range, checked rather than clamped.
  public init?(red: Int, green: Int, blue: Int, uv: Int) {
    guard [red, green, blue, uv].allSatisfy({ (0...Self.max).contains($0) }) else { return nil }
    self.red = red; self.green = green; self.blue = blue; self.uv = uv
  }

  /// From four levels in channel order (red, green, blue, UV); nil for another count or a level out of range.
  public init?(_ levels: [Int]) {
    guard levels.count == 4 else { return nil }
    self.init(red: levels[0], green: levels[1], blue: levels[2], uv: levels[3])
  }

  public static let off = WeekAquaLevels(red: 0, green: 0, blue: 0, uv: 0)!

  /// In channel order: red, green, blue, UV.
  public var array: [Int] { [red, green, blue, uv] }

  /// These levels at `brightness` percent (0–100), each rounded to the nearest step (a half up), as WEEK AQUA's
  /// brightness slider scales a preset. WEEK AQUA's own half brightness of Green sent `36 72 39 75`, one step off this in
  /// blue and UV: one capture doesn't show how it rounds.
  public func scaled(by brightness: Int) -> WeekAquaLevels {
    let b = Swift.max(0, Swift.min(100, brightness))
    return WeekAquaLevels(array.map { ($0 * b + 50) / 100 })!
  }
}

/// WEEK AQUA's built-in colours for these lights, from alokauz/ha-weekaqua's preset table (MIT), which took them from
/// the app. Green is the one the owner's lights run, confirmed by eye on all three.
public struct WeekAquaPreset: Sendable, Hashable, Identifiable {
  /// WEEK AQUA's name for it, lowercased: "green".
  public let id: String
  public let levels: WeekAquaLevels

  public static let all: [WeekAquaPreset] = [
    ("green", [0x6C, 0xE3, 0x73, 0xEB]), ("red", [0xA7, 0xB9, 0x74, 0xEB]), ("mixed", [0x79, 0xDF, 0x74, 0xEB]),
    ("gorgeous", [0xC1, 0x5E, 0xBC, 0xEB]), ("colorful", [0xEB, 0x5E, 0x94, 0xEB]), ("algae", [0xA3, 0xEB, 0x70, 0x00]),
    ("nature", [0x77, 0xEB, 0x77, 0x00]), ("elegant", [0x83, 0xEB, 0x85, 0x00]), ("brisk", [0x5E, 0xEB, 0x5E, 0x00]),
    ("fresh", [0x59, 0xEB, 0x60, 0x00]), ("enjoy", [0x6E, 0xEB, 0x65, 0x00]), ("white", [0x7E, 0xEB, 0x69, 0x00]),
  ].map { WeekAquaPreset(id: $0.0, levels: WeekAquaLevels($0.1)!) }

  public static func named(_ id: String) -> WeekAquaPreset? { all.first { $0.id == id } }
}

/// The light's daily timer: on at `on`, off at `off`. Unlike a Chihiros schedule it can run past midnight (the owner's
/// is 02:50 to 02:40, on almost all day); on and off the same is a whole day.
public struct DailyTimer: Sendable, Hashable {
  public let on: TimeOfDay
  public let off: TimeOfDay
  public init(on: TimeOfDay, off: TimeOfDay) { self.on = on; self.off = off }

  /// Minutes from on to off, round midnight when off comes first; 0 when they're the same.
  public var minutesOn: Int { (off.minutes - on.minutes + 1440) % 1440 }
}

/// The frames sent to the light's `fff2`, each 8 bytes. Times are BCD: 14:30 is `14 30`.
public enum WeekAquaFrame {
  /// The light's clock, at the phone's local time: `FF hh mm ss 55 55 55 55`. It can't be read back.
  public static func clock(_ date: Date, timeZone: TimeZone = .current) -> [UInt8] {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let c = cal.dateComponents([.hour, .minute, .second], from: date)
    return [0xFF, bcd(c.hour!)!, bcd(c.minute!)!, bcd(c.second!)!, 0x55, 0x55, 0x55, 0x55]
  }

  /// Red, green, blue and UV, shown at once: `FB F9 R G B UV 55 55`.
  public static func levels(_ l: WeekAquaLevels) -> [UInt8] {
    [0xFB, 0xF9] + l.array.map { UInt8($0) } + [0x55, 0x55]
  }

  /// Manual mode: the light applies the levels and timer written before it. alokauz's frame, the 8 bytes in full (the
  /// research notes write it `FD F1`). Here it doesn't hand back to the light's own schedule, as alokauz reads it: after
  /// levels of zero it left the lights off.
  public static let manual: [UInt8] = [0xFD, 0xF1, 0x55, 0x55, 0x55, 0x55, 0x55, 0x55]
  /// Manual mode as the research notes write it, `FD F1` alone: only for the hands-on test of which form the lights
  /// take (`light-harness weekaqua write --manual-bytes 2`). The app sends `manual`.
  public static let manualTwoBytes: [UInt8] = [0xFD, 0xF1]

  /// The daily timer: `FE F9 onHH onMM offHH offMM r 00`, times in BCD, `r` from `rampByte`.
  public static func timer(_ t: DailyTimer) -> [UInt8] {
    [0xFE, 0xF9, bcd(t.on.hour)!, bcd(t.on.minute)!, bcd(t.off.hour)!, bcd(t.off.minute)!, rampByte(t), 0x00]
  }

  /// The timer's seventh byte, as WEEK AQUA sends it: `01` for a window over two hours, `00` for one of two hours or
  /// less, `24` when on and off are the same time. Unconfirmed: it's probably the sunrise and sunset ramp in hours (BCD),
  /// but nothing has shown it. A timer sent with `00` on a long window worked too.
  public static func rampByte(_ t: DailyTimer) -> UInt8 {
    let m = t.minutesOn
    if m == 0 { return 0x24 }
    return m > 120 ? 0x01 : 0x00
  }

  /// A number 0–99 in binary-coded decimal (35 → 0x35); nil outside that.
  public static func bcd(_ n: Int) -> UInt8? {
    guard (0...99).contains(n) else { return nil }
    return UInt8((n / 10) << 4 | (n % 10))
  }
}
