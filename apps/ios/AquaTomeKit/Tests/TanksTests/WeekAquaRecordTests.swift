import Foundation
import Testing
@testable import Tanks

// Week Aqua lights kept on a tank: known by their address (two can share a name), a group on one tank, and what AquaTome
// last sent them, the only record of what they show. Addresses here are made up.

private let met = Date(timeIntervalSince1970: 1_793_448_000) // 2026-10-31T12:00:00Z
private let group = [(address: "A1B2C3D4E5F6", bleName: "WEEKAQUA3.0"), (address: "A1B2C3D4E5F7", bleName: "WEEKAQUA3.0"),
                     (address: "A1B2C3D4E5F8", bleName: "B3.0-A430Pro-99")]

private func valid(_ s: TankStore) -> Bool {
  s.devices.allSatisfy { Validate.device(.object($0)).isEmpty || $0["deletedAt"] != nil }
}

@Test func aGroupMetForTheFirstTimeGoesOnOneTankEachLightByItsAddress() throws {
  var s = TankStore()
  let lights = try s.metWeekAqua(group, model: "Week Aqua 5746", tankName: "Bể của tôi", now: met)
  #expect(s.liveTanks.count == 1 && lights.count == 3 && Set(lights.map(\.id)).count == 3)
  #expect(lights.allSatisfy { $0.tankId == s.liveTanks[0].id && $0.isWeekAqua && $0.kind == "light" })
  #expect(lights.map(\.bleAddress) == group.map(\.address))
  #expect(s.weekAquaLight(address: "A1B2C3D4E5F7")?.id == lights[1].id)
  #expect(valid(s))
  // Met again: the same records.
  let again = try s.metWeekAqua(group, model: "Week Aqua 5746", tankName: "Bể của tôi", now: met + 60)
  #expect(again.map(\.id) == lights.map(\.id) && s.liveDevices.count == 3)
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

@Test func whatWasLastSentIsKeptWithAnyKeyANewerAppAdded() throws {
  var s = TankStore()
  let id = try s.metWeekAqua([group[0]], model: "Week Aqua 5746", tankName: "Bể", now: met)[0].id
  let sent = WeekAquaSent(levels: [54, 114, 57, 117], on: "02:50", off: "02:40", preset: "green", brightness: 50,
                          at: "2026-11-03T14:35:07.000Z")
  try s.updateDevice(id, now: met + 1) {
    $0.json["lastSent"] = .object(["fan": .number(30)])
    $0.lastSent = sent
  }
  let d = try #require(s.device(id))
  #expect(d.lastSent == sent)
  #expect(d.json["lastSent"]?.object?["fan"] == .number(30))
  #expect(valid(s))
  // A custom colour: no preset or brightness kept.
  try s.updateDevice(id, now: met + 2) { $0.lastSent = WeekAquaSent(levels: [0, 0, 235, 0], on: "08:00", off: "08:00", at: "2026-11-03T15:00:00.000Z") }
  #expect(s.device(id)?.lastSent?.preset == nil && s.device(id)?.json["lastSent"]?.object?["preset"] == nil)
}

@Test func aLastSentThisAppCantReadIsNone() {
  func read(_ o: Object) -> WeekAquaSent? { Device(json: ["lastSent": .object(o)]).lastSent }
  let ok: Object = ["levels": .array([54, 114, 57, 117].map { .number($0) }), "on": .string("02:50"), "off": .string("02:40"),
                    "at": .string("2026-11-03T14:35:07.000Z")]
  #expect(read(ok) != nil)
  var past = ok; past["levels"] = .array([236, 0, 0, 0].map { .number($0) })
  var three = ok; three["levels"] = .array([0, 0, 0].map { .number($0) })
  var hour = ok; hour["on"] = .string("24:00")
  var when = ok; when["at"] = .string("yesterday")
  for o in [past, three, hour, when] { #expect(read(o) == nil) }
}
