import Foundation
import Testing
@testable import Tanks

// A plug on a tank (docs/smart-plugs.md): a device record the schema accepts, its outlets named there, no state kept.

@Test func aPlugPutOnATankIsARecordTheSchemaTakes() throws {
  var s = TankStore()
  let t = try s.addTank(name: "Bể 60", now: t0)
  let p = try s.addPlug(tankId: t.id, brand: "tuya", remoteId: "fake-strip-1", name: "  Ổ cắm bể 60 ",
                        outlets: [("switch_1", " Đèn "), ("switch_2", "   "), ("switch_3", nil), ("switch_4", String(repeating: "x", count: 50))], now: t0)
  #expect(Validate.store(s.value) == [])
  #expect(p.kind == "plug" && p.brand == "tuya" && p.remoteId == "fake-strip-1" && p.nickname == "Ổ cắm bể 60" && p.tankId == t.id)
  // The maker's names, trimmed and cut to the record's 40; a blank one left out; no role until the reader gives one.
  #expect(p.outlets.map(\.code) == ["switch_1", "switch_2", "switch_3", "switch_4"])
  #expect(p.outlets.map(\.label) == ["Đèn", nil, nil, String(repeating: "x", count: 40)])
  #expect(p.outlets.allSatisfy { $0.role == nil })
  #expect(p.json["createdAt"]?.string == Timestamp.string(t0) && p.updatedAt == Timestamp.string(t0))
  // What the plug reports is never kept.
  #expect(Set(p.json.keys) == ["id", "tankId", "kind", "brand", "remoteId", "nickname", "outlets", "createdAt", "updatedAt"])
  #expect(s.plugs(in: t.id).map(\.id) == [p.id] && s.plug(brand: "tuya", remoteId: "fake-strip-1")?.id == p.id)
  #expect(s.plug(brand: "ewelink", remoteId: "fake-strip-1") == nil)
}

@Test func aPlugWithoutAName() throws {
  var s = TankStore()
  let t = try s.addTank(name: "Bể", now: t0)
  let p = try s.addPlug(tankId: t.id, brand: "tuya", remoteId: "fake-strip-1", name: " ", outlets: [], now: t0)
  #expect(p.nickname == nil && p.outlets.isEmpty && Validate.device(.object(p.json)) == [])
}

@Test func aPlugTheSchemaRefusesLeavesTheStoreAsItWas() throws {
  var s = TankStore()
  let t = try s.addTank(name: "Bể", now: t0)
  let before = s
  #expect(throws: TankStoreError.self) { try s.addPlug(tankId: t.id, brand: "tuya", remoteId: String(repeating: "a", count: 65), name: "Ổ", outlets: [], now: t0) }
  #expect(throws: TankStoreError.notFound) { try s.addPlug(tankId: newRecordId(), brand: "tuya", remoteId: "fake", name: "Ổ", outlets: [], now: t0) }
  #expect(s == before)
}

@Test func namingAnOutletKeepsKeysANewerClientWrote() throws {
  var s = try TankStore(JSON.parse(Data("""
    {"v":1,"tanks":[{"id":"00000000-0000-4000-8000-000000000001","name":"Bể","species":[],"plants":[],"createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z"}],
    "devices":[{"id":"00000000-0000-4000-8000-000000000040","tankId":"00000000-0000-4000-8000-000000000001","kind":"plug","brand":"tuya","remoteId":"synthetic-tuya-strip-1",
    "outlets":[{"code":"switch_1","role":"uv-sterilizer","watts":11},{"code":"switch_2"}],"createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z"}]}
    """.utf8)))
  let id = "00000000-0000-4000-8000-000000000040"
  try s.updateDevice(id, now: t0) { d in
    var o = d.outlets
    o[0].label = "Đèn UV"
    o[1].role = "co2"
    d.outlets = o
  }
  let d = s.device(id)!
  #expect(d.outlets[0].json == ["code": .string("switch_1"), "role": .string("uv-sterilizer"), "watts": .number(11), "label": .string("Đèn UV")])
  #expect(d.outlets[1].json == ["code": .string("switch_2"), "role": .string("co2")])
  // Removing it from the tank leaves a tombstone, as for a light.
  try s.deleteDevice(id, now: t0)
  #expect(s.plugs(in: "00000000-0000-4000-8000-000000000001").isEmpty)
  #expect(s.devices.first?["deletedAt"] != nil && Validate.store(s.value) == [])
}
