import Foundation

// A light the app connects to, remembered on the reader's tanks as the site's light page does
// (apps/site/src/scripts/tank-store.ts: ensureTank, putDevice, currentLight, wroteSchedule).

extension TankStore {
  /// The saved light with this Bluetooth name, on a live tank.
  public func light(bleName: String) -> Device? { liveDevices.first { $0.bleName == bleName } }

  /// The tank a newly met light goes on: the first one, or a new one named `name` when there is none.
  public mutating func ensureTank(name: String, now: Date = Date()) throws -> Tank {
    if let t = liveTanks.first { return t }
    return try addTank(name: name, now: now)
  }

  /// A Chihiros light just connected: its saved record (model brought up to date), or a new one on the first tank.
  /// Called before each change to the light too: a light whose tank was deleted elsewhere since is met again on a
  /// live tank, a new record, rather than written back onto the deleted one.
  @discardableResult
  public mutating func metLight(bleName: String, model: String, tankName: String, now: Date = Date()) throws -> Device {
    if let d = light(bleName: bleName) {
      if d.model != model { try updateDevice(d.id, now: now) { $0.model = model } }
      return device(d.id) ?? d
    }
    let t = try ensureTank(name: tankName, now: now)
    return try addDevice(tankId: t.id, kind: "light", brand: "chihiros", model: model, bleName: bleName, now: now)
  }
}

extension Device {
  /// Keeps a schedule just written to the light: in the list once (the same setting moves to the front, keeping its
  /// id and name unless a new name is given), marked as the one written last. At most 20 are kept; the oldest go.
  public mutating func wrote(on: String, off: String, ramp: Int, levels: [Int], name: String? = nil, at: Date) {
    let list = schedules
    let old = list.first { $0.on == on && $0.off == off && $0.ramp == ramp && $0.levels == levels }
    var rec = old ?? SavedSchedule(on: on, off: off, ramp: ramp, levels: levels, savedAt: "")
    rec.json["on"] = .string(on)
    rec.json["off"] = .string(off)
    rec.json["ramp"] = .number(Double(ramp))
    rec.json["levels"] = .array(levels.map { .number(Double($0)) })
    rec.json["savedAt"] = .string(Timestamp.string(at))
    if let name { rec.json["name"] = .string(name) }
    schedules = Array(([rec] + list.filter { $0.id != rec.id }).prefix(20))
    activeScheduleId = rec.id
  }
}
