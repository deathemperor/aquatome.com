import Foundation
import Testing
@testable import Tanks

// The app's own edits (docs/my-tanks-sync.md, "Writing"): every record it writes passes the schema, and is stamped.

let t0 = Date(timeIntervalSince1970: 1_790_000_000)

@Test func addTankTrimsTheNameAndStampsIt() throws {
  var s = TankStore()
  let t = try s.addTank(name: "  Bể 60  ", now: t0)
  #expect(t.name == "Bể 60")
  #expect(t.createdAt == Timestamp.string(t0) && t.updatedAt == t.createdAt)
  #expect(Validate.store(s.value) == [])
  #expect(throws: TankStoreError.blankName) { try s.addTank(name: " \n ", now: t0) }
}

@Test func editsTheSchemaRefusesLeaveTheStoreAsItWas() throws {
  var s = TankStore()
  let t = try s.addTank(name: "Bể", now: t0)
  let before = s
  #expect(throws: TankStoreError.self) { try s.addTank(name: String(repeating: "a", count: 81), now: t0) }
  #expect(throws: TankStoreError.self) { try s.updateTank(t.id, now: t0) { $0.litres = 0 } }
  #expect(s == before)
}

@Test func anEditIsStampedAfterTheCopyItChanges() throws {
  var s = TankStore()
  let t = try s.addTank(name: "Bể", now: t0)
  // This phone's clock is behind the copy: the change still comes after it.
  try s.updateTank(t.id, now: t0.addingTimeInterval(-60)) { $0.notes = "mới" }
  #expect(s.tank(t.id)!.updatedAt == Timestamp.stamp(t0, after: t.updatedAt))
  #expect(s.tank(t.id)!.updatedAt > t.updatedAt)
}

@Test func editsKeepKeysANewerClientWrote() throws {
  var s = try TankStore(JSON.parse(Data("""
    {"v":1,"later":true,"tanks":[{"id":"7d9c1e2a-0b5f-4c3d-9e8a-1f2b3c4d5e6f","name":"Bể","species":[{"id":"neon","count":5,"sex":"m"}],
    "plants":[],"dims":{"l":60,"w":30,"h":36,"unit":"cm"},"glass":"low-iron","createdAt":"2026-10-01T00:00:00.000Z",
    "updatedAt":"2026-10-01T00:00:00.000Z"}],"devices":[]}
    """.utf8)))
  let id = "7d9c1e2a-0b5f-4c3d-9e8a-1f2b3c4d5e6f"
  try s.updateTank(id, now: t0) {
    $0.dims = (90, 45, 45)
    $0.species = [("neon", 10), ("otocinclus", nil)]
  }
  let o = s.tanks[0]
  #expect(o["glass"] == .string("low-iron"))
  #expect(o["dims"]?.object?["unit"] == .string("cm"))
  #expect(o["species"]?.array?[0].object?["sex"] == .string("m"))
  #expect(o["species"]?.array?[0].object?["count"] == .number(10))
  #expect(o["species"]?.array?[1].object?["count"] == nil)
  #expect(s.value.object?["later"] == .bool(true))
  #expect(Validate.store(s.value) == [])
}

@Test func deletingATankTombstonesItsDevices() throws {
  var s = TankStore()
  let a = try s.addTank(name: "A", now: t0), b = try s.addTank(name: "B", now: t0)
  let la = try s.addDevice(tankId: a.id, kind: "light", brand: "chihiros", model: "WRGB II Slim", bleName: "DYSL30A1B2C3", now: t0)
  let lb = try s.addDevice(tankId: b.id, kind: "light", now: t0)
  try s.deleteTank(a.id, now: t0.addingTimeInterval(1))
  #expect(s.liveTanks.map(\.id) == [b.id])
  #expect(s.liveDevices.map(\.id) == [lb.id])
  let gone = s.devices.first { $0["id"] == .string(la.id) }!
  #expect(gone.keys.sorted() == ["deletedAt", "id", "updatedAt"])
  #expect(Validate.store(s.value) == [])
}

@Test func aDeviceKeepsItsSchedulesManualLevelsAndClock() throws {
  var s = TankStore()
  let t = try s.addTank(name: "Bể", now: t0)
  let d = try s.addDevice(tankId: t.id, kind: "light", brand: "chihiros", bleName: "DYSL30A1B2C3", now: t0)
  let at = Timestamp.string(t0)
  let sched = SavedSchedule(on: "12:00", off: "20:00", ramp: 30, levels: [70, 70, 70], savedAt: at)
  try s.updateDevice(d.id, now: t0) {
    $0.schedules = [sched]
    $0.activeScheduleId = sched.id
    $0.manual = ([40, 50, 60], at)
    $0.clockSyncedAt = at
    $0.nickname = "  "
  }
  let got = s.device(d.id)!
  #expect(got.schedules == [sched] && got.activeScheduleId == sched.id)
  #expect(got.manual?.levels == [40, 50, 60] && got.clockSyncedAt == at)
  #expect(got.nickname == nil)
  // A schedule the light can't run is refused.
  #expect(throws: TankStoreError.self) {
    try s.updateDevice(d.id, now: t0) { $0.schedules = [SavedSchedule(on: "20:00", off: "12:00", ramp: 0, levels: [50], savedAt: at)] }
  }
  #expect(Validate.store(s.value) == [])
}

@Test func limitsCountLiveRecordsOnly() throws {
  var s = TankStore()
  for i in 0..<maxTanks { try s.addTank(name: "Bể \(i)", now: t0) }
  #expect(throws: TankStoreError.tooManyTanks) { try s.addTank(name: "one more", now: t0) }
  try s.deleteTank(s.liveTanks[0].id, now: t0)
  try s.addTank(name: "one more", now: t0)
  #expect(s.liveTanks.count == maxTanks)
}

@Test func aStoreThisAppCannotKeepWholeIsRefused() {
  #expect(throws: TankStoreError.unknownVersion) { try TankStore(JSON.parse(Data(#"{"v":2,"tanks":[],"devices":[]}"#.utf8))) }
  // Saving it again would drop the entry.
  #expect(throws: TankStoreError.notAStore) { try TankStore(JSON.parse(Data(#"{"v":1,"tanks":["x"],"devices":[]}"#.utf8))) }
}

@Test func timestampsRoundTripAndRefuseOtherForms() {
  for s in ["1970-01-01T00:00:00.000Z", "2024-02-29T23:59:59.999Z", "1969-12-31T23:59:59.999Z", "2026-10-31T12:00:00.000Z"] {
    #expect(Timestamp.millis(s).map { Timestamp.string(millis: $0) } == s, "\(s)")
  }
  for s in ["2026-02-29T00:00:00.000Z", "2026-10-31T24:00:00.000Z", "2026-10-31T12:00:00Z", "2026-10-31T12:00:00.000+07:00",
            "2026-10-31 12:00:00.000Z", "２026-10-31T12:00:00.000Z"] {
    #expect(!Timestamp.isValid(s), "\(s)")
  }
}

// Where Swift's own text rules differ from JavaScript's, the site's win.

let uuid = "7d9c1e2a-0b5f-4c3d-9e8a-1f2b3c4d5e6f"
func tankJSON(_ fields: String) -> JSON {
  try! JSON.parse(Data("""
    {"id":"\(uuid)","name":"Bể","species":[],"plants":[],"createdAt":"2026-10-01T00:00:00.000Z",
    "updatedAt":"2026-10-01T00:00:00.000Z"\(fields)}
    """.utf8))
}

@Test func patternsMatchTheWholeTextAsJavaScriptDoes() {
  // ICU's `$` also matches before a final line break; JavaScript's doesn't.
  var t = tankJSON("").object!
  t["id"] = .string(uuid + "\n")
  #expect(Validate.tank(.object(t)).contains { $0.path == [.key("id")] })
  t = tankJSON("").object!
  t["species"] = .array([.object(["id": .string("neon\n")])])
  #expect(Validate.tank(.object(t)).contains { $0.path == [.key("species"), .index(0), .key("id")] })
  // A schedule time with a line break is refused, not read as a time (it crashed).
  let device = try! JSON.parse(Data("""
    {"id":"\(uuid)","tankId":"\(uuid)","kind":"light","createdAt":"2026-10-01T00:00:00.000Z","updatedAt":"2026-10-01T00:00:00.000Z",
    "schedules":[{"id":"\(uuid)","on":"12:00\\n","off":"20:00","ramp":0,"levels":[50],"savedAt":"2026-10-01T00:00:00.000Z"}]}
    """.utf8))
  #expect(Validate.device(device).contains { $0.path == [.key("schedules"), .index(0), .key("on")] })
}

@Test func blankIsJavaScriptsWhitespace() {
  var t = tankJSON("").object!
  t["name"] = .string("\u{85}")      // not whitespace in JavaScript
  #expect(Validate.tank(.object(t)) == [])
  t["name"] = .string("\u{FEFF} \u{3000}")  // all whitespace in JavaScript
  #expect(Validate.tank(.object(t)).contains { $0.path == [.key("name")] })
}

@Test func theVersionIsReadBeforeTheShape() {
  // A newer store may be shaped differently: it is still kept as it is, not taken for a broken one.
  #expect(throws: TankStoreError.unknownVersion) { try TankStore(JSON.parse(Data(#"{"v":2,"items":[]}"#.utf8))) }
}

@Test func aRecordHeldTwiceIsReadAsTheMergeWouldKeepIt() throws {
  let older = tankJSON("").object!
  var later = older
  later["name"] = .string("Bể mới"); later["updatedAt"] = .string("2026-10-02T00:00:00.000Z")
  var s = try TankStore(.object(["v": .number(1), "tanks": .array([.object(older), .object(later)]), "devices": .array([])]))
  #expect(s.liveTanks.map(\.name) == ["Bể mới"])
  try s.deleteTank(uuid, now: t0)
  #expect(s.liveTanks.isEmpty && Validate.store(s.value) == [])
}
