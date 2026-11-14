import Foundation
import Testing
@testable import Tanks

// Week Aqua lights kept on a tank: known by their address (two can share a name), a group on one tank, and what AquaTome
// last wrote them, the only record of what they show, in the contract's own fields. Addresses here are made up.

private let met = Date(timeIntervalSince1970: 1_793_448_000) // 2026-10-31T12:00:00Z
private let group = [(address: "A1:B2:C3:D4:E5:F6", bleName: "WEEKAQUA3.0"), (address: "A1:B2:C3:D4:E5:F7", bleName: "WEEKAQUA3.0"),
                     (address: "A1:B2:C3:D4:E5:F8", bleName: "B3.0-A430Pro-99")]
/// Green at half brightness, as WEEK AQUA sends it.
private let halfGreen = [54, 114, 57, 117]

private func valid(_ s: TankStore) -> Bool {
  s.devices.allSatisfy { Validate.device(.object($0)).isEmpty || $0["deletedAt"] != nil }
}

/// One light, met, with `change` made to its record.
private func light(_ change: (inout Device) -> Void = { _ in }) throws -> (TankStore, Device) {
  var s = TankStore()
  let id = try s.metWeekAqua([group[0]], model: "Week Aqua 5746", tankName: "Bể", now: met)[0].id
  try s.updateDevice(id, now: met + 1, change)
  return (s, try #require(s.device(id)))
}

@Test func aGroupMetForTheFirstTimeGoesOnOneTankEachLightByItsAddress() throws {
  var s = TankStore()
  let lights = try s.metWeekAqua(group, model: "Week Aqua 5746", tankName: "Bể của tôi", now: met)
  #expect(s.liveTanks.count == 1 && lights.count == 3 && Set(lights.map(\.id)).count == 3)
  #expect(lights.allSatisfy { $0.tankId == s.liveTanks[0].id && $0.isWeekAqua && $0.kind == "light" })
  #expect(lights.map(\.bleAddress) == group.map(\.address))
  #expect(s.weekAquaLight(address: "A1:B2:C3:D4:E5:F7")?.id == lights[1].id)
  #expect(valid(s))
  // Met again: the same records.
  let again = try s.metWeekAqua(group, model: "Week Aqua 5746", tankName: "Bể của tôi", now: met + 60)
  #expect(again.map(\.id) == lights.map(\.id) && s.liveDevices.count == 3)
}

@Test func anAddressIsKeptInUppercaseAndFoundInAnyCase() throws {
  var s = TankStore()
  let d = try s.metWeekAqua([(address: "a1:b2:c3:d4:e5:fa", bleName: "WEEKAQUA3.0")], model: "Week Aqua 5746", tankName: "Bể", now: met)[0]
  #expect(d.bleAddress == "A1:B2:C3:D4:E5:FA" && valid(s))
  #expect(s.weekAquaLight(address: "a1:b2:c3:d4:e5:fa")?.id == d.id && s.weekAquaLight(address: "A1:B2:C3:D4:E5:FA")?.id == d.id)
}

@Test func aNewLightJoinsTheTankItsGroupIsOn() throws {
  var s = TankStore()
  try s.addTank(name: "Bể 30", now: met)
  let second = try s.addTank(name: "Bể 60", now: met + 1)
  let first = try s.metWeekAqua([group[0]], model: "Week Aqua 5746", tankName: "Bể", now: met + 2)[0]
  #expect(first.tankId != second.id)
  try s.updateDevice(first.id, now: met + 3) { $0.tankId = second.id }
  let lights = try s.metWeekAqua(group, model: "Week Aqua 5746", tankName: "Bể", now: met + 4)
  #expect(lights.allSatisfy { $0.tankId == second.id })
}

@Test func anEverydayTimerIsTheLightsOneScheduleWithItsLevelsAsPercentsAndNoManualLevels() throws {
  let (s, d) = try light {
    $0.manual = ([40, 40, 40, 40], "2026-10-30T10:00:00.000Z")
    $0.wroteWeekAqua(levels: halfGreen, on: "08:00", off: "20:00", preset: "green", brightness: 50, at: met + 1)
  }
  let only = try #require(d.schedules.first)
  #expect(d.schedules.count == 1 && d.activeScheduleId == only.id)
  #expect(only.on == "08:00" && only.off == "20:00" && only.ramp == 0 && only.levels == [23, 49, 24, 50])
  #expect(only.savedAt == "2026-10-31T12:00:01.000Z" && d.clockSyncedAt == "2026-10-31T12:00:01.000Z")
  #expect(d.manual == nil)
  #expect(d.json["lastSent"] == .object(["levels": .array(halfGreen.map { .number(Double($0)) }), "preset": .string("green"), "brightness": .number(50)]))
  #expect(d.weekAquaSent == WeekAquaSent(levels: halfGreen, on: "08:00", off: "20:00", preset: "green", brightness: 50,
                                        at: "2026-10-31T12:00:01.000Z"))
  #expect(valid(s))
}

@Test func aTimerEndingAtMidnightIsASchedule() throws {
  let (_, d) = try light { $0.wroteWeekAqua(levels: halfGreen, on: "20:00", off: "00:00", preset: nil, brightness: nil, at: met + 1) }
  #expect(d.schedules.count == 1 && d.json["lastSent"]?.object?["timer"] == nil)
}

@Test func aTimerPastMidnightIsKeptWithWhatWasSentNotAsASchedule() throws {
  var (s, d) = try light { $0.wroteWeekAqua(levels: halfGreen, on: "08:00", off: "20:00", preset: nil, brightness: nil, at: met + 1) }
  try s.updateDevice(d.id, now: met + 2) {
    $0.wroteWeekAqua(levels: halfGreen, on: "21:00", off: "02:00", preset: "green", brightness: 50, at: met + 2)
  }
  d = try #require(s.device(d.id))
  #expect(d.schedules.isEmpty && d.activeScheduleId == nil)
  #expect(d.json["lastSent"]?.object?["timer"] == .object(["on": .string("21:00"), "off": .string("02:00")]))
  #expect(d.weekAquaSent?.on == "21:00" && d.weekAquaSent?.off == "02:00" && d.weekAquaSent?.levels == halfGreen)
  #expect(valid(s))
  // An everyday one after it: the schedule again, and no timer left beside it.
  try s.updateDevice(d.id, now: met + 3) {
    $0.wroteWeekAqua(levels: halfGreen, on: "09:00", off: "17:00", preset: nil, brightness: nil, at: met + 3)
  }
  d = try #require(s.device(d.id))
  #expect(d.schedules.count == 1 && d.activeScheduleId == d.schedules[0].id && d.json["lastSent"]?.object?["timer"] == nil)
  #expect(d.weekAquaSent?.on == "09:00" && d.weekAquaSent?.preset == nil && valid(s))
}

@Test func writesKeepOneScheduleTheSameOneKeepingItsId() throws {
  var (s, d) = try light { $0.wroteWeekAqua(levels: halfGreen, on: "08:00", off: "20:00", preset: nil, brightness: nil, at: met + 1) }
  let first = d.schedules[0].id
  try s.updateDevice(d.id, now: met + 2) {
    $0.wroteWeekAqua(levels: halfGreen, on: "10:00", off: "18:00", preset: nil, brightness: nil, at: met + 2)
  }
  d = try #require(s.device(d.id))
  #expect(d.schedules.count == 1 && d.schedules[0].on == "10:00" && d.schedules[0].id != first)
  let second = d.schedules[0].id
  try s.updateDevice(d.id, now: met + 3) {
    $0.wroteWeekAqua(levels: halfGreen, on: "10:00", off: "18:00", preset: nil, brightness: nil, at: met + 3)
  }
  #expect(s.device(d.id)?.schedules.map(\.id) == [second])
}

@Test func levelsThePercentsRoundReadBackAsSent() throws {
  let (s, d) = try light { $0.wroteWeekAqua(levels: [1, 234, 0, 235], on: "08:00", off: "20:00", preset: nil, brightness: nil, at: met + 1) }
  #expect(d.schedules[0].levels == [0, 100, 0, 100])
  #expect(d.weekAquaSent?.levels == [1, 234, 0, 235])
  // Another writer changed the schedule's levels: those, from their percents.
  var other = d
  var rec = other.schedules[0]
  rec.json["levels"] = .array([50, 0, 0, 100].map { .number($0) })
  other.schedules = [rec]
  #expect(other.weekAquaSent?.levels == [118, 0, 0, 235])
  #expect(valid(s))
}

@Test func percentsRoundToTheNearest() {
  #expect([0, 1, 2, 117, 118, 234, 235].map(Device.percent) == [0, 0, 1, 50, 50, 100, 100])
  #expect([0, 1, 50, 99, 100].map(Device.level) == [0, 2, 118, 233, 235])
}

@Test func aKeyANewerAppAddedToLastSentStays() throws {
  let (s, d) = try light {
    $0.json["lastSent"] = .object(["fan": .number(30)])
    $0.wroteWeekAqua(levels: halfGreen, on: "08:00", off: "20:00", preset: "green", brightness: 50, at: met + 1)
  }
  #expect(d.json["lastSent"]?.object?["fan"] == .number(30) && valid(s))
  // A custom colour: no preset or brightness kept.
  var next = d
  next.wroteWeekAqua(levels: [0, 0, 235, 0], on: "08:00", off: "20:00", preset: nil, brightness: nil, at: met + 2)
  #expect(next.json["lastSent"]?.object?["preset"] == nil && next.json["lastSent"]?.object?["brightness"] == nil)
}

@Test func aRecordThisAppCantReadHoldsNoWrite() throws {
  let (_, d) = try light { $0.wroteWeekAqua(levels: halfGreen, on: "21:00", off: "02:00", preset: nil, brightness: nil, at: met + 1) }
  #expect(d.weekAquaSent != nil)
  func with(_ key: String, _ v: JSON) -> Device {
    var o = d.json["lastSent"]?.object ?? [:]
    o[key] = v
    var x = d
    x.json["lastSent"] = .object(o)
    return x
  }
  var noClock = d; noClock.clockSyncedAt = nil
  let past = with("levels", .array([236, 0, 0, 0].map { .number($0) }))
  let three = with("levels", .array([0, 0, 0].map { .number($0) }))
  let hour = with("timer", .object(["on": .string("24:00"), "off": .string("02:00")]))
  var none = d; none.json["lastSent"] = nil
  for x in [noClock, past, three, hour, none] { #expect(x.weekAquaSent == nil) }
}
