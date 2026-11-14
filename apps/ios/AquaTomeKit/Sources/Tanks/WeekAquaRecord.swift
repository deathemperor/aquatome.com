import Foundation

// A Week Aqua light kept on a tank. Two lights can advertise the same name (`WEEKAQUA3.0`), so a light is known by its
// own address, from its manufacturer data (`bleAddress`), not by its name as a Chihiros light is. The lights report
// nothing, so the record is what AquaTome last wrote, in the contract's fields (packages/schema/src/tanks.ts,
// docs/my-tanks-sync.md):
// - an everyday timer, off after on the same day, is the light's one schedule, the active one, levels as percents;
// - a timer that ends past midnight can't be a schedule (a schedule ends the day it starts): it is `lastSent.timer`,
//   and the light keeps no schedule;
// - `lastSent.levels` are the levels as sent, 0–235, which the percents round; with the preset and brightness they
//   came from;
// - `clockSyncedAt` is when, as every write sets the clock first;
// - never `manual`: in the contract those are levels set by hand that the light shows instead of its schedule, and
//   these levels go with the timer.

/// The `brand` of a Week Aqua light's record.
public let weekAquaBrand = "weekaqua"

/// What AquaTome last wrote to a Week Aqua light, read back from its record: red, green, blue and UV (each 0–235, as
/// sent), the daily timer (`HH:MM`; off before on runs past midnight), the preset and brightness the levels came from,
/// and when.
public struct WeekAquaSent: Sendable, Equatable {
  public var levels: [Int]
  public var on: String
  public var off: String
  public var preset: String?
  public var brightness: Int?
  public var at: String
  public init(levels: [Int], on: String, off: String, preset: String? = nil, brightness: Int? = nil, at: String) {
    self.levels = levels; self.on = on; self.off = off; self.preset = preset; self.brightness = brightness; self.at = at
  }
}

extension Device {
  /// A light's own address, `A1:B2:C3:D4:E5:F6` (uppercase), from its manufacturer data.
  public var bleAddress: String? { string("bleAddress") }

  public var isWeekAqua: Bool { brand == weekAquaBrand }

  /// What AquaTome last wrote to this Week Aqua light, from its record. Read leniently: nil when the record holds no
  /// write this app can read (it is kept as it is until the next write replaces it).
  public var weekAquaSent: WeekAquaSent? {
    guard let at = clockSyncedAt else { return nil }
    let kept = json["lastSent"]?.object
    let exact = (kept?["levels"]?.array?.compactMap(\.int)).flatMap { $0.count == 4 && $0.allSatisfy((0...235).contains) ? $0 : nil }
    let on: String, off: String, levels: [Int]
    if let s = schedules.first(where: { $0.id == activeScheduleId }) {
      guard s.levels.count == 4 else { return nil }
      (on, off) = (s.on, s.off)
      // The levels as sent when the schedule's percents are theirs; else (another writer changed it) the percents.
      levels = exact.flatMap { $0.map(Self.percent) == s.levels ? $0 : nil } ?? s.levels.map(Self.level)
    } else if let t = kept?["timer"]?.object, let a = t["on"]?.string, let b = t["off"]?.string, let exact {
      (on, off, levels) = (a, b, exact)
    } else {
      return nil
    }
    guard Self.isTime(on), Self.isTime(off) else { return nil }
    let brightness = kept?["brightness"]?.int.flatMap { (0...100).contains($0) ? $0 : nil }
    return WeekAquaSent(levels: levels, on: on, off: off, preset: kept?["preset"]?.string, brightness: brightness, at: at)
  }

  /// Keeps a write to this Week Aqua light (levels 0–235, on and off `HH:MM`) made at `at`. Any key a newer app put in
  /// `lastSent` stays.
  public mutating func wroteWeekAqua(levels: [Int], on: String, off: String, preset: String?, brightness: Int?, at: Date) {
    var kept = json["lastSent"]?.object ?? [:]
    kept["levels"] = .array(levels.map { .number(Double($0)) })
    kept["preset"] = preset.map(JSON.string)
    kept["brightness"] = brightness.map { .number(Double($0)) }
    if Validate.minutesLit(on: on, off: off) > 0 {
      // Ramp 0: AquaTome sends no sunrise or sunset to these lights. What the timer frame's seventh byte does isn't
      // confirmed, so the record doesn't claim the light fades either way.
      wrote(on: on, off: off, ramp: 0, levels: levels.map(Self.percent), at: at)
      // The one schedule: the site shows a light's active schedule or else its first, so an older one would read as
      // what the light runs.
      schedules = Array(schedules.prefix(1))
      kept["timer"] = nil
    } else {
      schedules = []
      activeScheduleId = nil
      kept["timer"] = .object(["on": .string(on), "off": .string(off)])
    }
    json["lastSent"] = .object(kept)
    manual = nil
    clockSyncedAt = Timestamp.string(at)
  }

  /// A level 0–235 as a percent of the channel's full scale (not the brightness slider), to the nearest: no level falls
  /// halfway between two. 1 is 0%, 234 is 100%.
  public static func percent(_ level: Int) -> Int { (level * 100 + 117) / 235 }

  /// A percent of full scale as a level 0–235, to the nearest, half up.
  public static func level(_ percent: Int) -> Int { (max(0, min(100, percent)) * 235 + 50) / 100 }

  /// "HH:MM", 00:00 to 23:59.
  private static func isTime(_ t: String) -> Bool {
    let p = t.split(separator: ":", omittingEmptySubsequences: false)
    guard t.count == 5, p.count == 2, let h = Int(p[0]), let m = Int(p[1]) else { return false }
    return (0..<24).contains(h) && (0..<60).contains(m)
  }
}

extension TankStore {
  /// The saved Week Aqua light with this address (any case), on a live tank: the one changed last when there are two.
  public func weekAquaLight(address: String) -> Device? {
    let a = address.uppercased()
    return liveDevices.filter { $0.isWeekAqua && $0.bleAddress == a }
      .max { Array($0.updatedAt.utf16).lexicographicallyPrecedes(Array($1.updatedAt.utf16)) }
  }

  /// Week Aqua lights just connected together: each one's saved record, or a new one. New ones go on the tank of a light
  /// of the group already kept, so a group stays on one tank; else on the first tank, or a new one named `tankName`.
  @discardableResult
  public mutating func metWeekAqua(_ lights: [(address: String, bleName: String)], model: String, tankName: String,
                                   now: Date = Date()) throws -> [Device] {
    let known = lights.compactMap { weekAquaLight(address: $0.address) }
    let tankId = try known.first?.tankId ?? ensureTank(name: tankName, now: now).id
    return try lights.map { l in
      if let d = weekAquaLight(address: l.address) { return d }
      var d = try addDevice(tankId: tankId, kind: "light", brand: weekAquaBrand, model: model, bleName: l.bleName, now: now)
      try updateDevice(d.id, now: now) { $0.json["bleAddress"] = .string(l.address.uppercased()) }
      d = device(d.id) ?? d
      return d
    }
  }
}
