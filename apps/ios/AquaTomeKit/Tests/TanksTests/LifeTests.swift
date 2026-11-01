import Foundation
import Testing
@testable import Tanks

// A tank's fish and plants changed in the app, as the site's tools change them (save-to-tank.ts, withSpecies).

private let id = "7d9c1e2a-0b5f-4c3d-9e8a-1f2b3c4d5e6f"
private func store() throws -> TankStore {
  try TankStore(JSON.parse(Data("""
    {"v":1,"tanks":[{"id":"\(id)","name":"Bể","species":[{"id":"neon","count":5,"sex":"m"},{"id":"otocinclus"}],
    "plants":[{"id":"rotala","note":"trái"}],"createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z"}],"devices":[]}
    """.utf8)))
}

@Test func aFishAlreadyThereGetsTheNewNumberKeepingItsOtherKeys() throws {
  var s = try store()
  try s.updateTank(id, now: t0) { $0.putSpecies("neon", count: 12) }
  let fish = s.tanks[0]["species"]?.array ?? []
  #expect(fish.count == 2)
  #expect(fish[0].object?["count"] == .number(12) && fish[0].object?["sex"] == .string("m"))
  #expect(Validate.store(s.value) == [])
}

@Test func aNewFishGoesLast() throws {
  var s = try store()
  try s.updateTank(id, now: t0) { $0.putSpecies("danio-rerio", count: 8) }
  #expect(s.tank(id)!.species.map(\.id) == ["neon", "otocinclus", "danio-rerio"])
  #expect(s.tank(id)!.species.last?.count == 8)
}

@Test func removesAFishAndOnlyThatOne() throws {
  var s = try store()
  try s.updateTank(id, now: t0) { $0.removeSpecies("neon") }
  #expect(s.tank(id)!.species.map(\.id) == ["otocinclus"])
}

@Test func aPlantGoesOnOnceAndComesOffKeepingTheOthersKeys() throws {
  var s = try store()
  try s.updateTank(id, now: t0) {
    $0.addPlant("rotala")
    $0.addPlant("anubias")
  }
  #expect(s.tank(id)!.plants == ["rotala", "anubias"])
  #expect(s.tanks[0]["plants"]?.array?[0].object?["note"] == .string("trái"))
  try s.updateTank(id, now: t0) { $0.removePlant("rotala") }
  #expect(s.tank(id)!.plants == ["anubias"])
}

@Test func aNumberTheStoreRefusesLeavesTheTankAsItWas() throws {
  var s = try store()
  let before = s
  #expect(throws: TankStoreError.self) { try s.updateTank(id, now: t0) { $0.putSpecies("neon", count: maxCount + 1) } }
  #expect(throws: TankStoreError.self) { try s.updateTank(id, now: t0) { $0.putSpecies("neon", count: 0) } }
  #expect(s == before)
  try s.updateTank(id, now: t0) { $0.putSpecies("neon", count: maxCount) }
  #expect(s.tank(id)!.species[0].count == maxCount)
}
