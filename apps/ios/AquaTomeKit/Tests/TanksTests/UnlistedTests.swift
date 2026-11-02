import Foundation
import Testing
@testable import Tanks

// A tank's entries without a page (docs/my-tanks-sync.md, "Entries without a page"), made and changed as the site's form
// does (apps/site/src/scripts/life-edit.ts).

private let id = "7d9c1e2a-0b5f-4c3d-9e8a-1f2b3c4d5e6f"
private func store(_ unlisted: String = "") throws -> TankStore {
  try TankStore(JSON.parse(Data("""
    {"v":1,"tanks":[{"id":"\(id)","name":"Bể","species":[],"plants":[],\(unlisted)
    "createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z"}],"devices":[]}
    """.utf8)))
}

@Test func aNewEntryIsTrimmedItsScientificNameSpacedOnceAndAPlantHasNoNumber() throws {
  let fish = UnlistedEntry(kind: "fish", name: "  Cá bống mắt tre ", sci: " Rhinogobius \t duospilus ", count: 3)
  #expect(fish.json.keys.sorted() == ["count", "id", "kind", "name", "sci"])
  #expect(fish.name == "Cá bống mắt tre" && fish.sci == "Rhinogobius duospilus" && fish.count == 3 && fish.kind == "fish")
  #expect(Validate.tank(.object(["id": .string(fish.id), "name": .string("x"), "species": .array([]), "plants": .array([]),
                                 "unlisted": .array([.object(fish.json)]), "createdAt": .string("2026-10-01T00:00:00.000Z"),
                                 "updatedAt": .string("2026-10-01T00:00:00.000Z")])) == [])
  let plant = UnlistedEntry(kind: "plant", name: "Rêu suối", sci: "  ", count: 5)
  #expect(plant.json.keys.sorted() == ["id", "kind", "name"], "a blank scientific name or a plant's number was kept")
  #expect(plant.isPlant && !fish.isPlant && !UnlistedEntry(kind: "snail", name: "Ốc").isPlant)
  #expect(fish.id != plant.id && fish.id == fish.id.lowercased())
}

@Test func aTankWithoutEntriesHasNoneAndNoKeyIsWrittenForNone() throws {
  var s = try store()
  #expect(s.tank(id)!.unlisted.isEmpty)
  try s.updateTank(id, now: t0) { $0.notes = "mới" }
  #expect(s.tanks[0]["unlisted"] == nil)
  let e = UnlistedEntry(kind: "fish", name: "Cá lạ")
  try s.updateTank(id, now: t0) { $0.addUnlisted(e) }
  #expect(s.tank(id)!.unlisted == [e])
  try s.updateTank(id, now: t0) { $0.removeUnlisted(e.id) }
  #expect(s.tanks[0]["unlisted"] == nil, "the last one off leaves an empty list behind")
  #expect(Validate.store(s.value) == [])
}

@Test func changingAnEntryKeepsTheKeysANewerClientGaveIt() throws {
  var s = try store(#""unlisted":[{"id":"00000000-0000-4000-8000-0000000000a1","kind":"snail","name":"Ốc nerita","photoGuess":{"score":0.4}},{"id":"00000000-0000-4000-8000-0000000000a2","kind":"fish","name":"Cá lạ","count":2}],"#)
  try s.updateTank(id, now: t0) {
    $0.setUnlistedCount("00000000-0000-4000-8000-0000000000a1", 4)
    $0.setUnlistedCount("00000000-0000-4000-8000-0000000000a2", nil)
  }
  let list = s.tanks[0]["unlisted"]?.array ?? []
  #expect(list[0].object?["photoGuess"] == .object(["score": .number(0.4)]) && list[0].object?["kind"] == .string("snail"))
  #expect(list[0].object?["count"] == .number(4))
  #expect(list[1].object?["count"] == nil, "an emptied number is left out, not written as null")
}

@Test func moreEntriesThanATankHoldsLeaveItAsItWas() throws {
  var s = try store()
  try s.updateTank(id, now: t0) { t in for n in 1...maxUnlisted { t.addUnlisted(UnlistedEntry(kind: "fish", name: "Cá \(n)")) } }
  let before = s
  #expect(throws: TankStoreError.self) { try s.updateTank(id, now: t0) { $0.addUnlisted(UnlistedEntry(kind: "fish", name: "Thêm")) } }
  #expect(throws: TankStoreError.self) { try s.updateTank(id, now: t0) { $0.setUnlistedCount($0.unlisted[0].id, maxCount + 1) } }
  #expect(s == before)
}

@Test func whatASaveAddedIsOnlyTheEntriesNewToTheTank() throws {
  var s = try store()
  let a = UnlistedEntry(kind: "fish", name: "Cá bống mắt tre", sci: "Rhinogobius duospilus", count: 3)
  #expect(s.tank(id)!.unlistedAdded(since: nil).isEmpty)
  var before = s.tank(id)!
  try s.updateTank(id, now: t0) { $0.addUnlisted(a) }
  #expect(s.tank(id)!.unlistedAdded(since: before) == [a])
  // A number changed, or the tank saved again: nothing new.
  before = s.tank(id)!
  try s.updateTank(id, now: t0) { $0.setUnlistedCount(a.id, 5) }
  #expect(s.tank(id)!.unlistedAdded(since: before).isEmpty)
  before = s.tank(id)!
  try s.updateTank(id, now: t0) { $0.notes = "thay nước" }
  #expect(s.tank(id)!.unlistedAdded(since: before).isEmpty)
  // A new tank: everything on it is new.
  #expect(s.tank(id)!.unlistedAdded(since: nil).map(\.id) == [a.id])
}
