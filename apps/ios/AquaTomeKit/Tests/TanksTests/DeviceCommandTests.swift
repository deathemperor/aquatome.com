import Foundation
import Testing
@testable import Tanks

// The command the master button's steps and the chat share (protocols/device-command.schema.json), and the master button's
// own rules: what goes back at the end, and when.

private struct Vectors: Decodable {
  struct Case: Decodable {
    let note: String
    let value: JSON
    let path: [String]?
  }
  let valid: [Case]
  let invalid: [Case]
  let results: [Case]

  static let shared: Vectors = {
    // Tests/TanksTests/DeviceCommandTests.swift → the repository root, six levels up.
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<6 { url.deleteLastPathComponent() }
    return try! JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url.appendingPathComponent("protocols/device-command-vectors.json")))
  }()
}

@Test("The schema's commands: each valid one read and written back as it was; each invalid one refused for its field")
func deviceCommandVectors() throws {
  let v = Vectors.shared
  #expect(v.valid.count >= 5 && v.invalid.count >= 5)
  for c in v.valid {
    let data = try c.value.data()
    let command = try JSONDecoder().decode(DeviceCommand.self, from: data)
    #expect(command.problem == nil, "\(c.note)")
    #expect(try JSON.parse(JSONEncoder().encode(command)) == c.value, "\(c.note)")
  }
  for c in v.invalid {
    let command = try JSONDecoder().decode(DeviceCommand.self, from: c.value.data())
    #expect(command.problem == c.path?.first, "\(c.note)")
  }
  let results = try v.results.map { try JSONDecoder().decode(SwitchResult.self, from: $0.value.data()) }
  #expect(results == [.done, .failed("Không tới được ổ CO2: kiểm tra mạng rồi thử lại")])
  #expect(try JSON.parse(JSONEncoder().encode(results[1])) == v.results[1].value)
}

private let m0 = Date(timeIntervalSince1970: 1_800_000_000)

private func store() throws -> TankStore {
  var s = TankStore()
  let t = try s.addTank(name: "Bể 60", now: m0)
  try s.addPlug(tankId: t.id, brand: "tuya", remoteId: "fake-strip-1", name: "Ổ cắm bể 60",
                outlets: [("switch_1", "Đèn"), ("switch_2", "CO2"), ("switch_3", "Quạt"), ("switch_4", "Sưởi"), ("switch_5", nil)], now: m0)
  let p = s.liveDevices[0]
  try s.updateDevice(p.id, now: m0) { d in
    var o = d.outlets
    for (i, role) in ["light", "co2", "fan", "heater"].enumerated() { o[i].role = role }
    d.outlets = o
  }
  return s
}

@Test("The chat may switch the lamp (where the app offers it), CO2 and fans: never a heater, a light's outlet or one with no role")
func offerable() throws {
  var s = try store()
  let plug = s.liveDevices[0].id
  #expect(DeviceCommand.offerable(s, lamp: true) == [DeviceTarget(device: plug, outlet: "switch_2"), DeviceTarget(device: plug, outlet: "switch_3")])
  let lamp = try s.keepLoveEcology(tankName: "Bể của tôi", now: m0)
  #expect(DeviceCommand.offerable(s, lamp: true).first == DeviceTarget(device: lamp.id, outlet: nil))
  #expect(DeviceCommand.offerable(s, lamp: false).count == 2)
}

@Test("The Love Ecology lamp is kept once, on the first tank or a new one, as a light that isn't a Chihiros")
func keepsTheLamp() throws {
  var empty = TankStore()
  let d = try empty.keepLoveEcology(tankName: "Bể của tôi", now: m0)
  #expect(empty.liveTanks.map(\.name) == ["Bể của tôi"] && d.tankId == empty.liveTanks[0].id)
  #expect(d.isLoveEcology && d.bleName == nil && d.brand == "loveecology")
  #expect(try empty.keepLoveEcology(tankName: "Bể của tôi", now: m0).id == d.id && empty.liveDevices.count == 1)
  var s = try store()
  #expect(try s.keepLoveEcology(tankName: "Bể của tôi", now: m0).tankId == s.liveTanks[0].id && s.liveTanks.count == 1)
  #expect(Known.brand.contains(loveEcologyBrand))
}

private let plug = "00000000-0000-4000-8000-000000000040"
private let lampId = "00000000-0000-4000-8000-000000000041"
private let co2On = DeviceCommand(device: plug, outlet: "switch_2", on: true)
private let fanOff = DeviceCommand(device: plug, outlet: "switch_3", on: false)
private let lightOn = DeviceCommand(device: plug, outlet: "switch_1", on: true)
private let lampWhite = DeviceCommand(device: lampId, on: true, colour: "white")
private let button = MasterButton(name: "Ngắm bể", steps: [lampWhite, co2On, fanOff, lightOn], minutes: 120)

@Test("A step may switch CO2 off, never on, and never a heater; anything else either way")
func whatAStepMayDo() {
  #expect(MasterButton.allows(fanOff, role: "fan") && MasterButton.allows(lightOn, role: "light") && MasterButton.allows(lampWhite, role: nil))
  #expect(MasterButton.allows(DeviceCommand(device: plug, outlet: "switch_2", on: false), role: "co2"))
  #expect(!MasterButton.allows(co2On, role: "co2"))
  #expect(!MasterButton.allows(DeviceCommand(device: plug, outlet: "switch_4", on: false), role: "heater"))
  #expect(!MasterButton.allows(DeviceCommand(device: plug, outlet: "switch_4", on: true), role: "heater"))
}

@Test("A strip saved twice: any live copy that marks an outlet a heater or CO2 counts, whichever copy a step was made from")
func anyCopysRoleCounts() throws {
  // The strip's first record marks switch_2 CO2 and switch_4 a heater (store()); a second record of the same strip (two
  // phones each adding it) marks nothing, and a third strip's record marks its switch_1 a heater.
  var s = try store()
  let marked = s.liveDevices[0]
  let tank = marked.tankId
  let bare = try s.addPlug(tankId: tank, brand: "tuya", remoteId: "fake-strip-1", name: "Ổ cắm bể 60",
                           outlets: [("switch_1", nil), ("switch_2", nil), ("switch_3", nil), ("switch_4", nil), ("switch_5", nil)], now: m0)
  let other = try s.addPlug(tankId: tank, brand: "tuya", remoteId: "fake-strip-2", name: "Ổ khác", outlets: [("switch_1", nil)], now: m0)
  try s.updateDevice(other.id, now: m0) { d in
    var o = d.outlets
    o[0].role = "heater"
    d.outlets = o
  }
  #expect(s.liveDevices.filter { $0.remoteId == "fake-strip-1" }.count == 2)
  for d in [marked.id, bare.id] {
    #expect(s.strictestRole(device: d, outlet: "switch_4") == "heater")
    #expect(s.strictestRole(device: d, outlet: "switch_2") == "co2")
    // The heater never switched, either way; CO2 never on.
    #expect(!MasterButton.allows(DeviceCommand(device: d, outlet: "switch_4", on: false), role: s.strictestRole(device: d, outlet: "switch_4")))
    #expect(!MasterButton.allows(DeviceCommand(device: d, outlet: "switch_4", on: true), role: s.strictestRole(device: d, outlet: "switch_4")))
    #expect(!MasterButton.allows(DeviceCommand(device: d, outlet: "switch_2", on: true), role: s.strictestRole(device: d, outlet: "switch_2")))
    #expect(MasterButton.allows(DeviceCommand(device: d, outlet: "switch_2", on: false), role: s.strictestRole(device: d, outlet: "switch_2")))
  }
  // Otherwise each record's own: the marked copy's light and fan, the bare copy's nothing; another strip's heater no
  // outlet of this one's.
  #expect(s.strictestRole(device: marked.id, outlet: "switch_3") == "fan" && s.strictestRole(device: bare.id, outlet: "switch_3") == nil)
  #expect(s.strictestRole(device: bare.id, outlet: "switch_1") == nil && s.strictestRole(device: other.id, outlet: "switch_1") == "heater")
  // The chat's list goes by it too: the second copy now marks the heater's outlet a fan, and it isn't offered from either
  // copy; the CO2 outlet is, from both.
  try s.updateDevice(bare.id, now: m0) { d in
    var o = d.outlets
    o[3].role = "fan"
    d.outlets = o
  }
  let chat = DeviceCommand.offerable(s, lamp: false)
  #expect(!chat.contains(DeviceTarget(device: bare.id, outlet: "switch_4")) && !chat.contains(DeviceTarget(device: marked.id, outlet: "switch_4")))
  #expect(chat.contains(DeviceTarget(device: bare.id, outlet: "switch_2")) && chat.contains(DeviceTarget(device: marked.id, outlet: "switch_2")))
  // A copy taken off its tank no longer counts: the second copy's own role is left.
  try s.deleteDevice(marked.id, now: m0.addingTimeInterval(60))
  #expect(s.strictestRole(device: bare.id, outlet: "switch_4") == "fan" && s.strictestRole(device: marked.id, outlet: "switch_4") == nil)
}

@Test("A record that lists an outlet's code twice: a heater or CO2 on any entry counts, whichever comes first")
func aCodeListedTwice() throws {
  var s = TankStore()
  let t = try s.addTank(name: "Bể 60", now: m0)
  let p = try s.addPlug(tankId: t.id, brand: "tuya", remoteId: "fake-strip-1", name: "Ổ cắm bể 60",
                        outlets: [("switch_1", nil), ("switch_1", nil), ("switch_2", nil), ("switch_2", nil), ("switch_3", nil)], now: m0)
  // Each code's first entry bare; its second a heater (switch_1), CO2 (switch_2).
  try s.updateDevice(p.id, now: m0) { d in
    var o = d.outlets
    o[1].role = "heater"
    o[3].role = "co2"
    d.outlets = o
  }
  #expect(s.strictestRole(device: p.id, outlet: "switch_1") == "heater")
  #expect(s.strictestRole(device: p.id, outlet: "switch_2") == "co2")
  #expect(!MasterButton.allows(DeviceCommand(device: p.id, outlet: "switch_1", on: false), role: s.strictestRole(device: p.id, outlet: "switch_1")))
  #expect(!MasterButton.allows(DeviceCommand(device: p.id, outlet: "switch_2", on: true), role: s.strictestRole(device: p.id, outlet: "switch_2")))
  // A code listed once reads as before.
  #expect(s.strictestRole(device: p.id, outlet: "switch_3") == nil)
}

@Test("The master button's press, its CO2 held, its end, its sheet and the countdown test's offer read an outlet's role through TankStore.strictestRole")
func theButtonReadsEveryCopysRole() throws {
  // apps/ios/AquaTomeKit/Tests/TanksTests/this file → apps/ios/AquaTome/Master.
  let master = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().appendingPathComponent("AquaTome/Master")
  let files = try FileManager.default.contentsOfDirectory(atPath: master.path).filter { $0.hasSuffix(".swift") }
  var code = ""
  for f in files.sorted() { code += try String(contentsOf: master.appendingPathComponent(f), encoding: .utf8) }
  #expect(!code.isEmpty, "read nothing from \(master.path)")
  // One record's own role, read anywhere in the button: none.
  #expect(!code.contains("?.outlets.first { $0.code == code }?.role"))
  #expect(!code.contains("role: o.role)"))
  // The two reads, through the lookup: the role the press, CO2 held and the end go by, and the sheet's list.
  #expect(code.components(separatedBy: "strictestRole(device: c.device, outlet: code)").count - 1 == 1)
  #expect(code.components(separatedBy: "role: store.strictestRole(device: p.id, outlet: o.code))").count - 1 == 1)
  // The countdown test's offer, which it reads again before it switches: not CO2 or a heater on any copy.
  #expect(!code.contains("$0.role != \"co2\""))
  #expect(code.contains("let r = switcher.tanks.store.strictestRole(device: p.id, outlet: $0.code); return r != \"co2\" && r != \"heater\""))
}

@Test("At the end each outlet goes back to how it was; one already as asked, nowhere; one not known, the other way")
func whatGoesBack() {
  let before: [String: Bool] = ["switch_2": false, "switch_3": true, "switch_1": true]
  let run = MasterRun(button, at: m0, before: { before[$0.outlet ?? ""] }, lamp: DeviceCommand(device: "old", on: true, colour: "yellow"))
  #expect(run.ends == m0.addingTimeInterval(7200) && run.isRunning)
  #expect(run.back.map(\.command) == [
    DeviceCommand(device: lampId, on: true, colour: "yellow"),
    DeviceCommand(device: plug, outlet: "switch_2", on: false),
    DeviceCommand(device: plug, outlet: "switch_3", on: true),
  ])
  // Not known: the other way.
  #expect(MasterRun(button, at: m0, before: { _ in nil }, lamp: nil).back.map(\.command.on) == [false, false, true, false])
}

@Test("The lamp goes back to the last command this phone sent it, or the other way; nothing when that is what the button sends")
func theLampGoesBack() {
  func back(_ step: DeviceCommand, _ last: DeviceCommand?) -> DeviceCommand? {
    MasterRun(MasterButton(name: "x", steps: [step], minutes: 60), at: m0, before: { _ in nil }, lamp: last).back.first?.command
  }
  #expect(back(lampWhite, nil) == DeviceCommand(device: lampId, on: false))
  #expect(back(DeviceCommand(device: lampId, on: false), nil) == DeviceCommand(device: lampId, on: true))
  #expect(back(lampWhite, DeviceCommand(device: lampId, on: false)) == DeviceCommand(device: lampId, on: false))
  #expect(back(lampWhite, DeviceCommand(device: lampId, on: true, colour: "white")) == nil)
  #expect(back(DeviceCommand(device: lampId, on: false), DeviceCommand(device: lampId, on: false, colour: "red")) == nil)
}

@Test("What an earlier press still owes stays owed, and for a device this press sets too it is what goes back")
func whatIsOwed() {
  // Owed from an end while the app was away: the lamp back off, the fan back on.
  let owed = [DeviceCommand(device: lampId, on: false), DeviceCommand(device: plug, outlet: "switch_3", on: true)]
  let b = MasterButton(name: "x", steps: [lampWhite, DeviceCommand(device: plug, outlet: "switch_1", on: false)], minutes: 60)
  // The phone last sent the lamp the earlier press's white: off still goes back. The light's outlet was on.
  var held = MasterRun.Back(command: owed[1])
  held.held = true
  held.problem = "Không tới được ổ Quạt"
  let run = MasterRun(b, at: m0, before: { _ in true }, lamp: lampWhite, owed: [MasterRun.Back(command: owed[0]), held])
  #expect(run.back.map(\.command) == owed + [DeviceCommand(device: plug, outlet: "switch_1", on: true)])
  // Held as it was; the last try's line goes (this press's own come anew).
  #expect(run.back[1].held == true && run.back[1].problem == nil)
}

@Test("A failed step that reads as it was has nothing to put back, nor a lamp step that failed; nothing left, it ends")
func whatFailed() {
  let b = MasterButton(name: "x", steps: [lampWhite, fanOff], minutes: 60)
  let all = [MasterRun.Failed(target: lampWhite.target, line: "a"), .init(target: fanOff.target, line: "b")]
  // The fan's plug didn't answer but switched: it goes back. The lamp sent nothing.
  var reached = MasterRun(b, at: m0, before: { _ in true }, lamp: nil)
  reached.settle(all, now: { _ in false }, keeping: [], at: m0)
  #expect(reached.back.map(\.command) == [DeviceCommand(device: plug, outlet: "switch_3", on: true)] && reached.isRunning)
  // Nothing changed: it ends with nothing to put back, the lines kept.
  var none = MasterRun(b, at: m0, before: { _ in true }, lamp: nil)
  none.settle(all, now: { _ in true }, keeping: [], at: m0)
  #expect(none.back.isEmpty && !none.isRunning && none.failed == all)
  // Not known after it (the list not read again): nothing guessed goes back.
  var unknown = MasterRun(b, at: m0, before: { _ in nil }, lamp: nil)
  unknown.settle(all, now: { _ in nil }, keeping: [], at: m0)
  #expect(unknown.back.isEmpty && !unknown.isRunning)
  // A lamp step half sent ("on" went, its colour didn't): it goes back.
  var half = MasterRun(b, at: m0, before: { _ in true }, lamp: nil)
  half.settle(all, now: { _ in true }, keeping: [lampWhite.target], at: m0)
  #expect(half.back.map(\.command) == [DeviceCommand(device: lampId, on: false)] && half.isRunning)
  // Owed by an earlier press: kept, and it runs on.
  var owing = MasterRun(b, at: m0, before: { _ in true }, lamp: nil, owed: [.init(command: DeviceCommand(device: lampId, on: false))])
  owing.settle(all, now: { _ in true }, keeping: [lampWhite.target], at: m0)
  #expect(owing.back.map(\.command) == [DeviceCommand(device: lampId, on: false)] && owing.isRunning)
  // Only the lamp failed: the fan goes back.
  var some = MasterRun(b, at: m0, before: { _ in true }, lamp: nil)
  some.settle([all[0]], now: { _ in false }, keeping: [], at: m0)
  #expect(some.back.map(\.command) == [DeviceCommand(device: plug, outlet: "switch_3", on: true)] && some.isRunning)
}

@Test("It's due at its end, not before; one ended on a tap never is; what's back leaves what's pending; kept as it is")
func whenItEnds() throws {
  var run = MasterRun(button, at: m0, before: { _ in nil }, lamp: nil)
  #expect(!run.isDue(at: m0.addingTimeInterval(7199)) && run.isDue(at: m0.addingTimeInterval(7200)))
  #expect(run.left(at: m0.addingTimeInterval(5)) == 7195 && run.left(at: m0.addingTimeInterval(9000)) == 0)
  let onTap = MasterRun(MasterButton(name: "x", steps: [co2On], minutes: nil), at: m0, before: { _ in nil }, lamp: nil)
  #expect(onTap.ends == nil && onTap.left(at: m0) == nil && !onTap.isDue(at: m0.addingTimeInterval(86_400)))
  run.back[0].done = true
  run.back[1].held = true
  #expect(run.pending.count == 3)
  run.ended = m0.addingTimeInterval(7200)
  #expect(!run.isRunning && !run.isDue(at: m0.addingTimeInterval(9000)))
  #expect(try JSONDecoder().decode(MasterRun.self, from: JSONEncoder().encode(run)) == run)
}
