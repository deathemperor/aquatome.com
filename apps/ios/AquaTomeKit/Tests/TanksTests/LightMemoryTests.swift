import Foundation
import Testing
@testable import Tanks

// A light the app connects to is remembered on the reader's tanks, as the site's light page does
// (apps/site/src/scripts/tank-store.ts: ensureTank, putDevice, currentLight, wroteSchedule; its tests in
// apps/site/test/tank-store.test.ts).

private let met = Date(timeIntervalSince1970: 1_793_448_000) // 2026-10-31T12:00:00Z

private func valid(_ s: TankStore) -> Bool {
  s.tanks.allSatisfy { Validate.tank(.object($0)).isEmpty || $0["deletedAt"] != nil }
    && s.devices.allSatisfy { Validate.device(.object($0)).isEmpty || $0["deletedAt"] != nil }
}

@Test func aLightMetForTheFirstTimeGoesOnANewTank() throws {
  var s = TankStore()
  let d = try s.metLight(bleName: "DYSL30TEST", model: "WRGB II Slim", tankName: "Bể của tôi", now: met)
  #expect(s.liveTanks.map(\.name) == ["Bể của tôi"])
  #expect(d.tankId == s.liveTanks[0].id && d.kind == "light" && d.brand == "chihiros" && d.model == "WRGB II Slim")
  #expect(d.schedules.isEmpty)
  #expect(valid(s))
  // Met again: the same record, and no second tank.
  let again = try s.metLight(bleName: "DYSL30TEST", model: "WRGB II Slim", tankName: "Bể của tôi", now: met + 60)
  #expect(again.id == d.id && s.liveTanks.count == 1 && s.liveDevices.count == 1)
}

@Test func aNewLightGoesOnTheFirstTankThereIs() throws {
  var s = TankStore()
  let first = try s.addTank(name: "Bể 60", now: met)
  try s.addTank(name: "Bể 30", now: met + 1)
  let d = try s.metLight(bleName: "DYSL30TEST", model: "WRGB II Slim", tankName: "Bể của tôi", now: met + 2)
  #expect(d.tankId == first.id && s.liveTanks.count == 2)
}

@Test func schedulesWrittenToALightOnceEachNewestFirstTheLastOneMarked() throws {
  var s = TankStore()
  let id = try s.metLight(bleName: "DY1", model: "WRGB II Slim", tankName: "Bể", now: met).id
  let a = (on: "12:00", off: "20:00", ramp: 30, levels: [70, 70, 70])
  func write(_ x: (on: String, off: String, ramp: Int, levels: [Int]), _ name: String? = nil, _ at: Date) throws {
    try s.updateDevice(id, now: at) { $0.wrote(on: x.on, off: x.off, ramp: x.ramp, levels: x.levels, name: name, at: at) }
  }
  try write(a, nil, met + 1)
  try write((on: "13:00", off: "19:00", ramp: 30, levels: [40, 40, 40]), "Bể mới trồng", met + 2)
  try write(a, nil, met + 3)
  var d = try #require(s.device(id))
  #expect(d.schedules.map(\.on) == ["12:00", "13:00"])
  #expect(d.schedules.first { $0.id == d.activeScheduleId }?.on == "12:00")
  #expect(d.schedules[1].name == "Bể mới trồng")
  #expect(valid(s))
  for i in 0..<25 { try write((on: a.on, off: a.off, ramp: i, levels: a.levels), nil, met + 10 + Double(i)) }
  d = try #require(s.device(id))
  // The 20 newest stay, the last written first and marked.
  #expect(d.schedules.count == 20)
  #expect(d.schedules[0].ramp == 24 && d.activeScheduleId == d.schedules[0].id)
  #expect(d.schedules.map(\.ramp) == Array((5...24).reversed()))
}

@Test func aLightOnATankDeletedElsewhereIsMetAgainOnALiveTank() throws {
  // What a sync can bring: the tank deleted on another phone, the light's record still live (changed after it).
  var s = TankStore()
  let t = try s.addTank(name: "Bể 60", now: met)
  let d = try s.addDevice(tankId: t.id, kind: "light", brand: "chihiros", model: "WRGB II Slim", bleName: "DYSL30TEST", now: met)
  s.tanks[0] = TankStore.tombstone(s.tanks[0], met + 1)
  let again = try s.metLight(bleName: "DYSL30TEST", model: "WRGB II Slim", tankName: "Bể của tôi", now: met + 2)
  #expect(again.id != d.id)
  #expect(s.liveTanks.map(\.id).contains(again.tankId))
  #expect(s.liveDevices.map(\.id) == [again.id])
  #expect(s.devices.contains { $0["id"]?.string == d.id && $0["deletedAt"] == nil }, "the old record is left as it was")
}

@Test func aLightMetUnderAnotherModelNameIsUpdatedAndOnlyThen() throws {
  var s = TankStore()
  let d = try s.metLight(bleName: "DYSL30TEST", model: "WRGB II Slim", tankName: "Bể", now: met)
  let same = try s.metLight(bleName: "DYSL30TEST", model: "WRGB II Slim", tankName: "Bể", now: met + 1)
  #expect(same.updatedAt == d.updatedAt, "nothing changed, nothing stamped")
  let renamed = try s.metLight(bleName: "DYSL30TEST", model: "WRGB II", tankName: "Bể", now: met + 2)
  #expect(renamed.id == d.id && renamed.model == "WRGB II" && renamed.updatedAt > d.updatedAt)
}

@Test func twoRecordsOfOneLightTheOneChangedLastIsUsed() throws {
  // Each phone met the light before they first synced: both records arrive.
  var s = TankStore()
  let t = try s.addTank(name: "Bể", now: met)
  let older = try s.addDevice(tankId: t.id, kind: "light", bleName: "DY1", now: met + 5)
  let newer = try s.addDevice(tankId: t.id, kind: "light", bleName: "DY1", now: met + 1)
  try s.updateDevice(newer.id, now: met + 9) { $0.nickname = "Đèn trái" }
  #expect(s.light(bleName: "DY1")?.id == newer.id)
  #expect(older.id != newer.id)
}

@Test func aLightWhoseTankWasDeletedWithItIsMetAgainOnALiveTank() throws {
  var s = TankStore()
  let t = try s.addTank(name: "Bể 60", now: met)
  let d = try s.addDevice(tankId: t.id, kind: "light", brand: "chihiros", model: "WRGB II Slim", bleName: "DYSL30TEST", now: met)
  try s.updateDevice(d.id, now: met + 1) { $0.nickname = "Đèn phòng khách" }
  #expect(try s.metLight(bleName: "DYSL30TEST", model: "WRGB II Slim", tankName: "Bể của tôi", now: met + 2).id == d.id)
  try s.deleteTank(t.id, now: met + 3) // on another phone, synced here
  let again = try s.metLight(bleName: "DYSL30TEST", model: "WRGB II Slim", tankName: "Bể của tôi", now: met + 4)
  #expect(again.id != d.id && again.nickname == nil && again.schedules.isEmpty)
  #expect(s.liveTanks.map(\.id).contains(again.tankId))
  #expect(s.liveDevices.map(\.id) == [again.id])
  #expect(valid(s))
}
