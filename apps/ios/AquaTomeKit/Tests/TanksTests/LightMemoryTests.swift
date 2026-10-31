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
  #expect(d.schedules.count == 20)
}

@Test func aLightWhoseTankWasDeletedElsewhereIsMetAgainOnALiveTank() throws {
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
