import Foundation

// A Week Aqua light kept on a tank. These lights report nothing, so the record keeps what AquaTome last sent them
// (`lastSent`). Two lights can advertise the same name (`WEEKAQUA3.0`), so a light is known by its own address, from its
// manufacturer data (`bleAddress`), not by its name as a Chihiros light is. Neither key is in the sync contract
// (packages/schema/src/tanks.ts) yet: the server and the site keep them as they keep any key they don't know.

/// The `brand` of a Week Aqua light's record.
public let weekAquaBrand = "weekaqua"

/// What AquaTome last sent to a Week Aqua light: red, green, blue and UV (each 0–235, as sent), the daily timer
/// (`HH:MM`, off may come before on: past midnight), the preset and brightness the levels came from, and when.
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
  /// A Week Aqua light's own address (hex, from its manufacturer data).
  public var bleAddress: String? { string("bleAddress") }

  public var isWeekAqua: Bool { brand == weekAquaBrand }

  /// What AquaTome last sent to this Week Aqua light. Read leniently: a value this app can't read is nil (and kept as it
  /// is until the next send replaces it). Setting it keeps any other key inside.
  public var lastSent: WeekAquaSent? {
    get {
      guard let o = json["lastSent"]?.object, let levels = o["levels"]?.array?.compactMap(\.int), levels.count == 4,
            levels.allSatisfy({ (0...235).contains($0) }), let on = o["on"]?.string, let off = o["off"]?.string,
            Self.isTime(on), Self.isTime(off), let at = o["at"]?.string, Timestamp.isValid(at) else { return nil }
      let brightness = o["brightness"]?.int.flatMap { (0...100).contains($0) ? $0 : nil }
      return WeekAquaSent(levels: levels, on: on, off: off, preset: o["preset"]?.string, brightness: brightness, at: at)
    }
    set {
      guard let s = newValue else { return json["lastSent"] = nil }
      var o = json["lastSent"]?.object ?? [:]
      o["levels"] = .array(s.levels.map { .number(Double($0)) })
      o["on"] = .string(s.on)
      o["off"] = .string(s.off)
      o["preset"] = s.preset.map(JSON.string)
      o["brightness"] = s.brightness.map { .number(Double($0)) }
      o["at"] = .string(s.at)
      json["lastSent"] = .object(o)
    }
  }

  /// "HH:MM", 00:00 to 23:59.
  private static func isTime(_ t: String) -> Bool {
    let p = t.split(separator: ":", omittingEmptySubsequences: false)
    guard t.count == 5, p.count == 2, let h = Int(p[0]), let m = Int(p[1]) else { return false }
    return (0..<24).contains(h) && (0..<60).contains(m)
  }
}

extension TankStore {
  /// The saved Week Aqua light with this address, on a live tank: the one changed last when there are two.
  public func weekAquaLight(address: String) -> Device? {
    liveDevices.filter { $0.isWeekAqua && $0.bleAddress == address }
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
      try updateDevice(d.id, now: now) { $0.json["bleAddress"] = .string(l.address) }
      d = device(d.id) ?? d
      return d
    }
  }
}
