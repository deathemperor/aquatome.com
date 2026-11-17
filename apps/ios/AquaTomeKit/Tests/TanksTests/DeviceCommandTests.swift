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

@Test("A failed step that reads as it was has nothing to put back, nor a lamp step that failed; one not known stays owed")
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
  // Not known after it (its answer and the list read again both failed): the fan, on before, may be off now. It stays
  // owed and it runs on; the end reads it again (MasterRun.end) and sends nothing if it is on (Codex, 17 Nov: dropping it
  // left a fan off).
  var unknown = MasterRun(b, at: m0, before: { _ in true }, lamp: nil)
  unknown.settle(all, now: { _ in nil }, keeping: [], at: m0)
  #expect(unknown.back.map(\.command) == [DeviceCommand(device: plug, outlet: "switch_3", on: true)] && unknown.isRunning)
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

@Test("At the end an outlet no longer as this press left it is left, whatever an earlier press owes; CO2 never back on")
func whatTheEndDoes() {
  let fanOn = MasterRun.Back(command: DeviceCommand(device: plug, outlet: "switch_3", on: true))
  // This press's own put-back: the fan it switched off goes back on; one found on already needs nothing.
  #expect(MasterRun.end(fanOn, now: false, left: false, role: "fan") == .send)
  #expect(MasterRun.end(fanOn, now: true, left: false, role: "fan") == .already)
  // Owed by an earlier press (the fan back on), and this press switched the fan on: a hand switched it off since. Left
  // off, not switched on against the hand (Codex, 17 Nov).
  #expect(MasterRun.end(fanOn, now: false, left: true, role: "fan") == .leave)
  // Not read at the end: nothing sent, and it stays owed (Codex, 17 Nov: a state the phone only guessed isn't sent).
  #expect(MasterRun.end(fanOn, now: nil, left: false, role: "fan") == .unread)
  #expect(MasterRun.end(fanOn, now: nil, left: nil, role: "fan") == .unread)
  // Its step didn't go, or this press didn't set it: as the put-back says.
  #expect(MasterRun.end(fanOn, now: false, left: nil, role: "fan") == .send)
  // CO2 back on, held at the press or CO2 now: never sent. A heater now: left.
  var held = MasterRun.Back(command: DeviceCommand(device: plug, outlet: "switch_2", on: true))
  #expect(MasterRun.end(held, now: false, left: false, role: "co2") == .hold)
  held.held = true
  #expect(MasterRun.end(held, now: false, left: false, role: "light") == .hold)
  #expect(MasterRun.end(fanOn, now: false, left: false, role: "heater") == .leave)
}

@Test("How a press left each outlet goes with what it owes: as asked; lost, as read after or as asked; refused, as it was")
func howAPressLeftEach() {
  let lightOff = DeviceCommand(device: plug, outlet: "switch_1", on: false)
  let fanOn = DeviceCommand(device: plug, outlet: "switch_3", on: true)
  let b = MasterButton(name: "x", steps: [lightOff, fanOn], minutes: 60)
  // An earlier press owes the fan back off, and left it on.
  var owedFan = MasterRun.Back(command: DeviceCommand(device: plug, outlet: "switch_3", on: false))
  owedFan.left = true
  func run() -> MasterRun { MasterRun(b, at: m0, before: { $0.outlet == "switch_1" }, lamp: nil, owed: [owedFan]) }
  func left(_ r: MasterRun, _ c: DeviceCommand) -> Bool? { r.back.first { $0.command.target == c.target }?.left }
  // Both went: as asked.
  var went = run()
  went.settle([], now: { _ in nil }, keeping: [owedFan.command.target], at: m0)
  #expect(left(went, lightOff) == false && left(went, fanOn) == true)
  // The fan's answer lost: as read after it (a hand may switch it later; the end compares with this).
  let fanFailed = [MasterRun.Failed(target: fanOn.target, line: "b")]
  var lost = run()
  lost.settle(fanFailed, now: { $0.target == fanOn.target ? false : nil }, keeping: [owedFan.command.target], at: m0, uncertain: [fanOn.target])
  #expect(left(lost, fanOn) == false && lost.back[0].guessed == nil)
  // Lost and not read after it: counted gone, as asked (the end leaves an outlet found otherwise, rather than undo a hand).
  var unread = run()
  unread.settle(fanFailed, now: { _ in nil }, keeping: [owedFan.command.target], at: m0, uncertain: [fanOn.target])
  #expect(left(unread, fanOn) == true && unread.back[0].guessed == true)
  // Refused before anything went: as the earlier press left it.
  var refused = run()
  refused.settle(fanFailed, now: { _ in nil }, keeping: [owedFan.command.target], at: m0)
  #expect(left(refused, fanOn) == true && left(refused, lightOff) == false)
  // This press's own step refused (by Tuya, its role or a sign-out) and not read after it: as it was, so the end never
  // switches it (Fable, 17 Nov). The light, on before, asked off and refused, found off at the end: a hand did it; left.
  var ownRefused = run()
  ownRefused.settle([.init(target: lightOff.target, line: "a")], now: { _ in nil }, keeping: [owedFan.command.target], at: m0)
  let light = ownRefused.back.first { $0.command.target == lightOff.target }!
  #expect(light.left == true && light.guessed == nil)
  #expect(MasterRun.end(light, now: false, left: light.left, role: "light") == .leave)
  // The end then, the fan found on: where the lost step was read off after it, a hand switched it since, so it's left;
  // where this press left it on, it goes back off, as owed.
  #expect(MasterRun.end(lost.back[0], now: true, left: left(lost, fanOn), role: "fan") == .leave)
  #expect(MasterRun.end(went.back[0], now: true, left: left(went, fanOn), role: "fan") == .send)
}

@Test("A put-back tried again: after a try that may have gone, or one the app was closed during, one that sent nothing never says it wasn't sent")
func aPutBackTriedAgain() throws {
  let notKnown = "Không rõ ổ Quạt đã đổi chưa: xem trong Bể của tôi."
  let mayHave = "Ổ Quạt chưa báo đã đổi.", notSent = "Chưa gửi vì bạn đã đăng xuất."
  // Every run of up to five tries: one that may have reached the device, one that sent nothing, or one the app was
  // closed during (kept as it was about to go, then read back).
  enum Try: CaseIterable { case mayHave, notSent, closed }
  var runs: [[Try]] = [[]]
  for _ in 0..<5 { runs = runs.flatMap { r in Try.allCases.map { r + [$0] } } }
  for run in runs {
    var b = MasterRun.Back(command: fanOff)
    var went = false
    for (n, t) in run.enumerated() {
      let before = b.trying()
      switch t {
      case .closed:
        b = try JSONDecoder().decode(MasterRun.Back.self, from: JSONEncoder().encode(b))
        went = true
        continue
      case .mayHave: b.failed(mayHave, mayHaveSent: true, notKnown: notKnown, before: before)
      case .notSent: b.failed(notSent, mayHaveSent: false, notKnown: notKnown, before: before)
      }
      went = went || t == .mayHave
      #expect(b.problem == (t == .mayHave ? mayHave : went ? notKnown : notSent), "\(run), try \(n + 1): \(b.problem ?? "")")
    }
  }
  // A run kept before `mayHaveGone`, a line from a try before: it may have gone. Never tried: its own line.
  let old = #"{"command":{"device":"\#(plug)","outlet":"switch_3","on":false},"done":false,"problem":"Không rõ ổ Quạt đã đổi chưa: xem trong Bể của tôi."}"#
  var kept = try JSONDecoder().decode(MasterRun.Back.self, from: Data(old.utf8))
  #expect(kept.mayHaveGone == nil)
  let wasKept = kept.trying()
  kept.failed(notSent, mayHaveSent: false, notKnown: notKnown, before: wasKept)
  #expect(kept.problem == notKnown)
  var fresh = MasterRun.Back(command: fanOff)
  let wasFresh = fresh.trying()
  fresh.failed(notSent, mayHaveSent: false, notKnown: notKnown, before: wasFresh)
  #expect(fresh.problem == notSent && fresh.mayHaveGone == false)
  // Owed into the next press: its line goes, and whether it may have gone stays.
  var owed = try JSONDecoder().decode(MasterRun.Back.self, from: Data(old.utf8))
  owed.command = DeviceCommand(device: plug, outlet: "switch_3", on: true)
  let next = MasterRun(MasterButton(name: "x", steps: [fanOff]), at: m0, before: { _ in true }, lamp: nil, owed: [owed])
  #expect(next.back.first?.problem == nil && next.back.first?.mayHaveGone == true)
}

@Test("A run kept by build 390, before `Back.left`, is read as it was")
func aRunKeptBeforeLeft() throws {
  let kept = #"{"started":800000000,"ends":800007200,"steps":[{"device":"\#(plug)","outlet":"switch_3","on":false}],"back":[{"command":{"device":"\#(plug)","outlet":"switch_3","on":true},"done":false,"held":false}],"failed":[]}"#
  let r = try JSONDecoder().decode(MasterRun.self, from: Data(kept.utf8))
  #expect(r.pending.count == 1 && r.back[0].left == nil && r.back[0].command.on && r.isRunning)
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
