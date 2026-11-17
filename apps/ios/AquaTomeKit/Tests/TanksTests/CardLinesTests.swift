import Foundation
import Testing
@testable import Tanks

// The master card's lines, as a list (the chief, 18 Nov): every place that writes a line on the master card or saves a
// run, and every place that decides whether anything of a command went. The PR has this list as it is here. The walk
// reads each file and fails on a place no longer on the list, one the list has that the code no longer does, or one
// out of order. Each row: where (its declaration) · the code · what it may say, and why it never says nothing went when
// something did. What a row claims, the tests named on it check by running; this one checks the list is the code.

/// apps/ios/AquaTomeKit/Tests/TanksTests/this file → apps/ios.
private let ios = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
  .deletingLastPathComponent().deletingLastPathComponent()

let masterCardList = #"""
### AquaTome/Master/MasterCard.swift
- ready · `if !master.notes.isEmpty {` · The end's notes: what it left as it was, and why. Nothing failed.
- ready · `ForEach(master.notes` · Each note as `tell` wrote it.
- putBack · `$0.problem != nil` · Trả lại shows while a put-back owed has a line.
- problems · `let all = master.refusal + (master.run?.failed.map(\.line) ?? []) + (master.run?.pending.compactMap(\.problem) ?? [])` · The card's only failure lines: the press's refusals, its steps' lines, the lines of what hasn't come back.

### AquaTome/Master/MasterModel.swift
- MasterModel · `runKey = "master.run"` · The one key a run is kept under: read in `init`, written only by `keep` and `store`.
- init · `run = d.data(forKey: Self.runKey)` · The run as kept. Kept by build 390 (no `mayHaveGone`): a put-back with a line counts as one that may have gone (`Back.earlier`, the over-count the chief accepted); one without, as one that didn't (known and open).
- save · `refusal = []` · Clears the last press's refusals. Says nothing.
- delete · `refusal = []` · The same.
- delete · `run = nil` · Only a run ended with nothing owed.
- delete · `keep()` · Saves that.
- start · `notes = []` · Clears the last end's notes.
- start · `refusal = []` · Clears the last press's refusals.
- start · `refusal = button.steps.filter` · The plug list not read: each outlet's line says it wasn't reached, and nothing at all is sent (the press returns before any step, the lamp's too; the run is not touched).
- start · `MasterRun(button` · The new run: owed put-backs keep `mayHaveGone` and lose their old line (`MasterRun.init`, below).
- start · `run = r` · Shown before any step goes.
- start · `keep()` · Saved before any step goes.
- start · `let lampSent = switcher.lamp.mayHaveGone` · The lamp's recordings sent or cut before this press.
- start · `sendLamp(lampSteps` · The lamp's steps, beside the plugs'.
- start · `failed.append(.init(target: step.target, line: Self.signedOut))` · Signed out (or another session) before this outlet's step: said not sent, and nothing of it went (checked before `switcher.send`).
- start · `await switcher.send(step` · Sends the step (Switcher, below).
- start · `failed.append(.init(target: step.target, line: line))` · The step's own line, from `Switcher.send`; one that may have gone is marked uncertain for `settle`.
- start · `MasterRun.Failed(target: $0.target` · Steps refused at the press (CO2 on, a heater): taken out before anything went; never sent.
- start · `let halfSent = switcher.lamp.mayHaveGone > lampSent` · A lamp recording sent or cut during this press: the lamp goes back at the end, whatever its line.
- start · `r.settle(` · The press's lines and what goes back (`MasterRun.settle`, below).
- start · `run = r` · Shown.
- start · `keep()` · Saved.
- sendLamp · `private func sendLamp(` · The lamp's steps.
- sendLamp · `failed.append(.init(target: s.target, line: Self.signedOut))` · Signed out before the lamp's step: said not sent, and nothing of it went (checked before `setByButton`).
- sendLamp · `await switcher.setByButton(s` · The lamp's own line, from `Switcher.send`.
- finish · `r.failed = []` · The press's lines go at the end; each put-back owed keeps its own.
- finish · `.problem = unread } }` · The tanks on this phone not read: each owed put-back's line is the tank list's words (nothing on what went), nothing is sent, and `mayHaveGone` is kept.
- finish · `run = r` · Shown.
- finish · `keep()` · Saved.
- finish · `r.back[i].problem = nil` · Its device deleted from the tanks: done, nothing sent now.
- finish · `tell(gone)` · The note says the device is gone, not that nothing went.
- finish · `r.back[i].failed(String(localized:` · The lamp, the end come while the app was away: nothing sent now; says the lamp isn't back, or, a try before it may have gone, that it's not known (`Back.failed`).
- finish · `r.back[i].failed(Switcher.unreached(name)` · The outlet not read at the end: nothing sent now; says it wasn't reached, or, a try before it may have gone, that it's not known.
- finish · `r.back[i].problem = nil` · Nothing to send (back already, changed since, CO2, a heater): done.
- finish · `case .already: if !b.earlier` · Back already: no note when a try of its own may be what put it back; else, if the press had changed it, that something else did and AquaTome left it.
- finish · `case .hold: tell(` · CO2 left off: AquaTome never switches CO2 on.
- finish · `default: tell(changed)` · Neither as the press left it nor back: switched since; this end sends nothing (known and open: a press step's late command).
- finish · `.trying(notKnown:` · Before it goes: counted as one that may have gone, and a line it had reads as not known.
- finish · `store(going)` · Saved before it goes, with the end as it was: closed meanwhile, it reloads as one that may have gone, and the end comes again.
- finish · `run = r` · Shown before it goes.
- finish · `await switcher.send(c` · Sends it (Switcher, below).
- finish · `r.back[i].problem = nil` · Back: done.
- finish · `store(kept)` · Saved at once.
- finish · `r.back[i].failed(line, mayHaveSent:` · Failed: its line when it may have gone or no try before it may have; else not known (`Back.failed`).
- finish · `store(kept)` · Saved at once.
- finish · `run = r` · Shown.
- finish · `run = r.pending.isEmpty ? nil : r` · Dropped only when nothing is owed.
- finish · `keep()` · Saved.
- keep · `private func keep()` · Saves the run shown, or removes it when there is none.
- keep · `if let run { store(run) } else { UserDefaults.standard.removeObject(forKey: Self.runKey) }` · The same.
- store · `private func store(_ r: MasterRun)` · The one write of a run.
- tell · `private func tell(` · A note, once.

### AquaTome/Master/Switcher.swift
- send · `return (.failed(words(why, c)), false)` · Withdrawn before any of it went (signed out, the role no longer allows it): said so, and nothing went.
- send · `await set(c, allowed: allowed, withdrawn:` · Sends it, checked again right before each command leaves.
- setByButton · `await send(c, still: still).result` · The lamp's, by the button.
- withdrawal · `return .signedOut` · Why it would be withdrawn now.
- withdrawal · `return .role` · The same.
- words · `case .signedOut: MasterModel.signedOut` · "Chưa gửi…": only where nothing of it went (above, and CommandEnd).
- words · `case .role: String(localized:` · The same, for a role that no longer allows it.
- notKnown · `c.isLamp ? String(localized:` · The lamp: not known whether it took the command.
- notKnown · `: String(localized:` · An outlet: not known whether it changed.
- name · `c.isLamp ? String(localized:` · Names only.
- unreadTanks · `case .newerStore:` · The tank list's words: nothing on what went.
- unreadTanks · `case .unreadable:` · The same.
- gone · `if c.isLamp { return` · Its record gone: nothing sent.
- gone · `return outlet(c) == nil ?` · The same.
- set · `func set(_ c: DeviceCommand) async -> SwitchResult` · The chat's: nothing withdrawn.
- set · `if let gone = gone(c) { return (.failed(gone), false) }` · Before anything went.
- set · `let e = await lamp.send(c` · The lamp's recordings (LampSender, below).
- set · `CommandEnd.lamp(sentAny: lamp.sent.count > before, cut: e == .cut` · The lamp's end from what it broadcast: one sent or cut is never "not sent" (`noLineSaysNotSentWhenItWent`).
- set · `return (said(end, c, name: name(c), lamp: e), !end.nothingSent)` · Its words, and whether it may have gone.
- set · `guard let o = outlet(c) else { return (.failed(` · Before `board.set`: nothing went.
- set · `guard plugs.current != nil else { return (.failed(` · The same.
- set · `return (.failed(board.list == nil ?` · The same.
- set · `guard live.online,` · The same.
- set · `guard !board.switching.contains(key) else { return (.failed(` · The same.
- set · `CommandEnd.plug(await board.set(` · From that call's own outcome, keys changed on its way included (`boardKeysChangedMidSwitch`).
- set · `return (said(end, c, name: name), !end.nothingSent)` · Its words, and whether it may have gone.
- said · `case .done: .done` · Every ending's words (`theCardsWordsForEachEnding`).
- said · `case .withdrawn(let w): .failed(words(w, c))` · Nothing went.
- said · `case .notSent: .failed(Self.unreached(name))` · Nothing went.
- said · `case .refused(.plugOffline): .failed(` · Refused before the plug: nothing switched.
- said · `case .refused(let e): .failed(` · The same.
- said · `case .lampNotSent: .failed((lamp ?? .failed).line)` · No recording went.
- said · `case .unconfirmed: .failed(` · May have gone: "not reported changed".
- said · `case .unknown: .failed(` · May have gone: not known.
- said · `case .lampOnOnly(.signedOut): .failed(` · On went: says so.
- said · `case .lampOnOnly(.own): .failed(` · On went: says so.
- said · `case .lampOnOnly(.unknown): .failed(` · On went: says so.
- said · `case .lampUnknown(onWent: false): .failed(` · Cut as it began: not known.
- said · `case .lampUnknown(onWent: true): .failed(` · On went, colour cut: says on went, colour not known.
- unreached · `static func unreached(` · "Không tới được ổ …": only where nothing went.

### AquaTome/Master/LampSender.swift
- start · `air.start(uuids, allowed: allowed, done: done)` · The phone's one broadcaster (LampAirCore on a phone).
- stop · `air.stop()` · The same.
- mayHaveGone · `var mayHaveGone: Int { sent.count + cut.count }` · Recordings sent, or cut after they were handed to Bluetooth.
- send · `guard !list.isEmpty else { return .failed }` · No recording: nothing went.
- send · `return .failed` · Not allowed before a recording: it and the rest don't go; one before it went (in `sent`).
- send · `LampRadio.start(r.uuids, by: self, allowed: allowed)` · Each recording's own UUIDs (`theButtonsCommandsGoAsRecorded`).
- send · `if started == .cut { cut.append(r.id) }` · Cut after it was handed: may have gone, counted.
- send · `return started` · Why it didn't start: cut, or Bluetooth's own answer that it didn't.
- send · `sent.append(r.id)` · Bluetooth said it started.
- send · `LampRadio.stop(by: self)` · After its three seconds.
- send · `return nil` · Every recording went.
- line · `case .off: String(localized:` · Nothing went: Bluetooth off.
- line · `case .refused: String(localized:` · Nothing went: not allowed.
- line · `case .unsupported: String(localized:` · Nothing went: no Bluetooth.
- line · `case .failed: String(localized:` · Nothing went: Bluetooth said it didn't start, or it was never handed (LampAirCore).
- line · `case .cut: String(localized:` · May have gone: not known.

### AquaTomeKit/Sources/Tanks/MasterButton.swift
- Back · `public var mayHaveGone: Bool?` · Kept with each put-back: a try of it may have reached the device. Nil in runs kept by build 390.
- earlier · `mayHaveGone ?? (problem != nil)` · Whether a try before may have gone; for build 390's, one with a line counts.
- trying · `mayHaveGone = true` · Set before each try (`aPutBackTriedAgain`).
- trying · `if problem != nil { problem = notKnown }` · A line it had reads as not known while it goes, and after a close.
- failed · `mayHaveGone = mayHaveSent || before` · Never unset by a try that sent nothing.
- failed · `problem = mayHaveSent || !before ? line : notKnown` · Its line, or not known when a try before may have gone and this one sent nothing.
- init · `back = owed.map { var b = $0; if b.earlier { b.mayHaveGone = true }; b.problem = nil; return b }` · Owed by an earlier press: its line goes, whether it may have gone stays.
- settle · `self.failed = failed` · The press's lines, as Switcher wrote them.
- settle · `back.removeAll { b in` · Nothing goes back for a step that failed and reads as it was, or a lamp step none of which went or may have.

### AquaTomeKit/Sources/Plugs/CommandEnd.swift
- nothingSent · `case .withdrawn, .notSent, .refused, .lampNotSent: true` · The only endings that may say not sent.
- nothingSent · `case .done, .unconfirmed, .unknown, .lampOnOnly, .lampUnknown: false` · The rest.
- plug · `case .confirmed?: return .done` · Confirmed.
- plug · `case .unconfirmed?: return .unconfirmed` · May have gone.
- plug · `case .unknown?: return .unknown` · May have gone.
- plug · `case .refused(let e)? where !e.nothingSent: return .unknown` · A refusal after which it may have gone: as an answer lost.
- plug · `case .refused(let e)?: return withdrawn.map(CommandEnd.withdrawn) ?? .refused(e)` · Refused before the plug: nothing went.
- plug · `case nil: return withdrawn.map(CommandEnd.withdrawn) ?? .notSent` · The board sent nothing.
- lamp · `guard failed else { return .done }` · Every recording went.
- lamp · `if cut { return .lampUnknown(onWent: sentAny) }` · Cut after it was handed: may have gone.
- lamp · `guard sentAny else { return withdrawn.map(CommandEnd.withdrawn) ?? .lampNotSent }` · None went.
- lamp · `return .lampOnOnly(` · On went.

### AquaTomeKit/Sources/Plugs/PlugBoard.swift
- set · `else { return nil }` · Nothing sent: being switched already, or not listed online.
- set · `guard owner == self.source?.owner else { return r.confirmed ? .confirmed : .unknown }` · Keys changed on its way: this call's outcome still.
- set · `if r.confirmed { return note(o, .confirmed) }` · Confirmed.
- set · `return nil` · Withdrawn: Tuya's call checked `allowed` before it left (TuyaPlugs, below).
- set · `guard owner == self.source?.owner else { return .refused(e) }` · Refused before the plug, keys changed since.
- set · `return note(o, .refused(e))` · Refused before the plug.
- set · `guard owner == self.source?.owner else { return .unknown }` · May have gone, keys changed since.
- set · `guard owner == self.source?.owner else { return .unknown }` · The same, after the list read again.
- set · `return note(o, now == on ? .confirmed : now == nil ? .unknown : .unconfirmed)` · As the list reads after it.
- note · `return outcome` · The outcome noted is the one returned.

### AquaTomeKit/Sources/Plugs/PlugSource.swift
- nothingSent · `case .offline, .maker, .badReply: false` · May have reached the plug.
- nothingSent · `: true` · Refused before anything could reach the plug.

### AquaTomeKit/Sources/Plugs/TuyaPlugs.swift
- call · `if let allowed, !(await allowed()) { throw Withdrawn() }` · Before the request leaves.
- call · `if let allowed, !(await allowed()) { throw Withdrawn() }` · Before it leaves again for a stale token (the first was refused: nothing switched).

### AquaTomeKit/Sources/FishLamp/LampAir.swift
- startAdvertising · `func startAdvertising(` · The phone's advertiser (the app's CBPeripheralManager).
- stopAdvertising · `func stopAdvertising()` · The same.
- start · `w.done(.failed)` · Replaced while waiting for Bluetooth: never handed, nothing went.
- stop · `w.done(.failed)` · Stopped while waiting: never handed.
- stop · `if peripheral?.bluetooth == .on { peripheral?.stopAdvertising() }` · Stops only while Bluetooth is on.
- answered · `starting = nil` · Bluetooth's answer to the start handed to this very advertiser.
- answered · `done(started ? nil : .failed)` · Started, or Bluetooth's own word that it didn't (`lampAirEveryOrder`).
- cut · `starting = nil` · One handed and not answered, replaced, stopped, or Bluetooth off or reset:
- cut · `if peripheral?.bluetooth == .on { peripheral?.stopAdvertising() }` · stopped while on,
- cut · `retired = peripheral` · let go (kept until the next),
- cut · `peripheral = nil` · a new advertiser for the next start,
- cut · `done(.cut)` · and told it may have gone.
- go · `peripheral = p` · Made at the first start, and after one is let go.
- go · `guard w.allowed() else { return w.done(.failed) }` · Not allowed as it is handed: never handed.
- go · `p.stopAdvertising()` · Bluetooth on: the last broadcast ends,
- go · `starting = w.done` · this one waits for its answer,
- go · `p.startAdvertising(w.uuids)` · handed with its own UUIDs (`theCardsCommandsGoAsRecorded`).
- go · `w.done(refusal)` · Bluetooth off, refused or missing: never handed.
"""#

/// What the walk reads, in each file, as writing a line on the card, saving a run, or deciding whether anything went;
/// `in`: only inside those declarations.
private let walked: [(file: String, finds: [String], in: Set<String>?)] = [
  ("AquaTome/Master/MasterCard.swift", ["master.refusal", "master.notes", ".problem", "failed.map"], nil),
  ("AquaTome/Master/MasterModel.swift", ["refusal = ", "notes = ", "failed.append(", "MasterRun.Failed(", ".problem = ", "].failed(", ".trying(",
                                         "tell(", "store(", "keep()", "run = ", ".failed = ", ".settle(", "MasterRun(", "runKey", "switcher.send(",
                                         "switcher.setByButton(", "sendLamp(", "mayHaveGone"], nil),
  ("AquaTome/Master/Switcher.swift", [".failed(", "CommandEnd.lamp(", "CommandEnd.plug(", "lamp.send(", "board.set(", "nothingSent",
                                      "String(localized:", "MasterModel.signedOut", ": .done", "await set(", "await send(", "return .signedOut",
                                      "return .role"], nil),
  ("AquaTome/Master/LampSender.swift", ["return .failed", "return started", "return nil", "cut.append(", "sent.append(", "LampRadio.start(",
                                        "LampRadio.stop(", "air.start(", "air.stop(", "String(localized:", "mayHaveGone"], nil),
  ("AquaTomeKit/Sources/Tanks/MasterButton.swift", ["problem = ", "problem != nil", "mayHaveGone", "self.failed = ", "back.removeAll"], nil),
  ("AquaTomeKit/Sources/Plugs/CommandEnd.swift", ["return ", ": true", ": false"], nil),
  ("AquaTomeKit/Sources/Plugs/PlugBoard.swift", ["return "], ["set", "note"]),
  ("AquaTomeKit/Sources/Plugs/PlugSource.swift", [": true", ": false"], ["nothingSent"]),
  ("AquaTomeKit/Sources/Plugs/TuyaPlugs.swift", ["Withdrawn()"], nil),
  ("AquaTomeKit/Sources/FishLamp/LampAir.swift", ["done(", "starting = ", "peripheral = ", "retired = ", "stopAdvertising()", "startAdvertising("], nil),
]

private struct Place: Equatable, CustomStringConvertible {
  let scope: String
  let code: String
  var description: String { "\(scope) · \(code)" }
}

/// The places the code has, in order.
private func walk(_ w: (file: String, finds: [String], in: Set<String>?)) throws -> [Place] {
  let code = try String(contentsOf: ios.appendingPathComponent(w.file), encoding: .utf8)
  // A declaration's name, from the line that opens it: a type, a function, an init, a computed property.
  let declaration = try NSRegularExpression(pattern: #"^(?:(?:public|private|fileprivate|static|final|mutating|nonisolated|override|@discardableResult|@MainActor|@ViewBuilder)\s+)*(?:func\s+(\w+)|(init)\s*[(<]|var\s+(\w+)\s*:[^=]*\{|(?:class|struct|enum|extension|actor)\s+(\w+))"#)
  var scope = "", out: [Place] = []
  for raw in code.split(separator: "\n") {
    let line = raw.trimmingCharacters(in: .whitespaces)
    if line.hasPrefix("//") { continue }
    let ns = line as NSString
    if let m = declaration.firstMatch(in: line, range: NSRange(location: 0, length: ns.length)) {
      for g in 1..<m.numberOfRanges where m.range(at: g).location != NSNotFound { scope = ns.substring(with: m.range(at: g)); break }
    }
    if let only = w.in, !only.contains(scope) { continue }
    if w.finds.contains(where: { line.contains($0) }) { out.append(Place(scope: scope, code: line)) }
  }
  return out
}

/// The places the list has, by file, in order, with what each may say.
private func listed() -> [(file: String, place: Place, says: String)] {
  var file = ""
  var out: [(file: String, place: Place, says: String)] = []
  for line in masterCardList.split(separator: "\n") {
    if line.hasPrefix("### ") { file = String(line.dropFirst(4)); continue }
    guard line.hasPrefix("- ") else { continue }
    let parts = line.dropFirst(2).components(separatedBy: " · ")
    guard parts.count == 3, parts[1].count > 2, parts[1].hasPrefix("`"), parts[1].hasSuffix("`") else {
      out.append((file: file, place: Place(scope: "", code: "unreadable row: \(line)"), says: ""))
      continue
    }
    out.append((file: file, place: Place(scope: parts[0], code: String(parts[1].dropFirst().dropLast())), says: parts[2]))
  }
  return out
}

@Test("The master card's lines are the list: every place that writes one, saves a run, or decides whether anything went, in order")
func theMasterCardsLinesAreTheList() throws {
  let list = listed()
  #expect(Set(list.map { $0.file }) == Set(walked.map { $0.file }), "the list's files aren't the walk's")
  for (file, _, says) in list { #expect(!says.isEmpty, "a row in \(file) says nothing") }
  for w in walked {
    let found = try walk(w)
    let rows = list.filter { $0.file == w.file }.map { $0.place }
    #expect(!found.isEmpty, "read nothing from \(w.file)")
    for (i, (f, r)) in zip(found, rows).enumerated() where !(f.scope == r.scope && f.code.contains(r.code)) {
      Issue.record("\(w.file), place \(i + 1): the code has \(f), the list \(r)")
      break
    }
    if found.count > rows.count { Issue.record("\(w.file): not on the list: \(found[rows.count...].map(\.description))") }
    if rows.count > found.count { Issue.record("\(w.file): on the list, not in the code: \(rows[found.count...].map(\.description))") }
  }
}

@Test("Every colour the master button offers has a recording, and a lamp command carries no brightness")
func theButtonsColoursAreRecorded() throws {
  let data = try Data(contentsOf: ios.appendingPathComponent("AquaTomeKit/Sources/FishLamp/love-ecology.json"))
  let file = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
  let ids = try #require(file["commands"] as? [[String: String]]).compactMap { $0["id"] }
  #expect(ids.filter { $0 != "off" && $0 != "on" } == DeviceCommand.colours)
  #expect(Mirror(reflecting: DeviceCommand(device: "d", on: true, colour: "red")).children.compactMap { $0.label } == ["device", "outlet", "on", "colour"])
}
