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
- card · `Text("Nút tổng")` · The card's title.
- card · `Text("Một chạm bật đèn` · What the button is for, before there is one. Nothing on what went.
- card · `Text("Tạo nút tổng")` · The same.
- ready · `Button("Sửa")` · Edits the button.
- ready · `sendingOr(Text("Bắt đầu")` · Starts a press; while a press or an end is going, "Đang gửi…" (below).
- ready · `if !master.notes.isEmpty {` · The end's notes: what it left as it was, and why. Nothing failed.
- ready · `ForEach(master.notes` · Each note as `tell` wrote it.
- running · `Text("Đang chạy")` · A press runs: its end not come yet. Nothing on what went.
- running · `Text("còn")` · The time left.
- running · `Text("từ")` · The time it started.
- running · `Text(verbatim: master.summary(run.steps)` · What the steps set, and when it ends (`summary`, `length`, below): what was asked, not what went; what didn't go is in the lines below it.
- running · `sendingOr(Text("Kết thúc")` · Ends it now.
- putBack · `$0.problem != nil` · Trả lại shows while a put-back owed has a line.
- putBack · `Text("Trả lại")` · Puts back what is owed (`finish`).
- sendingOr · `private func sendingOr(` · While a press or an end is going:
- sendingOr · `Text("Đang gửi…")` · "Đang gửi…" ("sending"): true while it goes, whatever then went.
- problems · `let all = master.refusal + (master.run?.failed.map(\.line) ?? []) + (master.run?.pending.compactMap(\.problem) ?? [])` · The card's only failure lines: the press's refusals, its steps' lines, the lines of what hasn't come back.
- length · `guard let m = minutes else { return String(localized:` · How long it runs: until Kết thúc,
- length · `return m % 60 == 0 ? String(localized:` · or hours or minutes.
- clock · `if s < 60 { return String(localized:` · The time left, in seconds.
- spoken · `if s < 60 { return String(localized:` · The time left, as VoiceOver says it,
- spoken · `if m < 60 { return String(localized:` · in minutes,
- spoken · `return m % 60 == 0 ? String(localized:` · or hours and minutes.
- body · `.accessibilityAction(named: Text("Bắt đầu")` · VoiceOver's start.
- body · `.accessibilityAction(named: Text("Sửa")` · VoiceOver's edit.
- summary · `let said = s.isLamp ? (s.on ? String(localized:` · Each step as asked: the lamp on or off,
- summary · `: (s.on ? String(localized:` · an outlet on or off. What was asked, not what went.

### AquaTome/Master/MasterModel.swift
- buttonKey · `runKey = "master.run"` · The one key a run is kept under: read in `init`, written only by `keep` and `store`.
- init · `run = d.data(forKey: Self.runKey)` · The run as kept. Kept by build 390 (no `mayHaveGone`): a put-back with a line counts as one that may have gone (`Back.earlier`, the over-count the chief accepted); one without, as one that didn't (known and open).
- defaultName · `static let defaultName = String(localized:` · The button's name when the owner gives none. Nothing on what went.
- save · `refusal = []` · Clears the last press's refusals. Says nothing.
- delete · `refusal = []` · The same.
- delete · `run = nil` · Only a run ended with nothing owed.
- delete · `keep()` · Saves that.
- accountChanged · `session += 1` · Signed out or in: whatever a press or an end was still to send doesn't go.
- gate · `$0.owner() == true && $0.session == s` · What each command checks as it goes: the owner signed in, in the session the press or the end began in.
- start · `guard var button, !sending, run?.isRunning != true, owner() == true` · A press only while none is going or running, the owner signed in.
- start · `notes = []` · Clears the last end's notes.
- start · `refusal = []` · Clears the last press's refusals.
- start · `let refused = button.steps.filter { !MasterButton.allows(` · Steps the button never sends (CO2 on, a heater), by the outlet's role at the press: taken out before anything goes.
- start · `if switcher.plugs.current != nil, switcher.plugs.board.listError != nil` · The plug list not read: the press sends nothing at all.
- start · `refusal = button.steps.filter` · Each outlet's line says it wasn't reached, and nothing was (it returns before any step, the lamp's too; the run is not touched).
- start · `MasterRun(button` · The new run: owed put-backs keep `mayHaveGone` and lose their old line (`MasterRun.init`, below).
- start · `r.back[i].held = true` · A CO2 outlet switched off stays off at the end, whatever its role reads by then.
- start · `run = r` · Shown before any step goes.
- start · `keep()` · Saved before any step goes.
- start · `let lampSent = switcher.lamp.mayHaveGone` · The lamp's recordings sent or cut before this press.
- start · `sendLamp(lampSteps` · The lamp's steps, beside the plugs'.
- start · `var uncertain: Set<DeviceTarget> = []` · The steps that failed after their command may have reached the plug.
- start · `session >= pressed + n && owner() == true` · Debug builds only (`-master-steps-wait-account`): each step waits for a sign-out and sign-in, for a UI test.
- start · `guard still() else {` · Signed out (or another session) since the press, checked before this outlet's step goes:
- start · `failed.append(.init(target: step.target, line: Self.signedOut))` · said not sent, and nothing of it went.
- start · `await switcher.send(step` · Sends the step (Switcher, below).
- start · `failed.append(.init(target: step.target, line: line))` · The step's own line, from `Switcher.send`; one that may have gone is marked uncertain for `settle`.
- start · `if mayHaveSent { uncertain.insert(step.target) }` · Marked: `settle` counts it gone, as asked, however it reads after, and keeps its put-back for the end.
- start · `MasterRun.Failed(target: $0.target` · The steps refused at the press: never sent, said so.
- start · `let halfSent = switcher.lamp.mayHaveGone > lampSent` · A lamp recording sent or cut during this press: the lamp goes back at the end, whatever its line.
- start · `r.settle(` · The press's lines and what goes back (`MasterRun.settle`, below).
- start · `uncertain: uncertain)` · With the steps that may have gone.
- start · `run = r` · Shown.
- start · `keep()` · Saved.
- sendLamp · `private func sendLamp(` · The lamp's steps.
- sendLamp · `guard still() else {` · Signed out since the press, checked before the lamp's step goes:
- sendLamp · `failed.append(.init(target: s.target, line: Self.signedOut))` · said not sent, and nothing of it went.
- sendLamp · `await switcher.setByButton(s` · The lamp's own line, from `Switcher.send`.
- signedOut · `static var signedOut: String { String(localized:` · "Chưa gửi vì bạn đã đăng xuất.": written only where nothing of it went (the two above, Switcher's withdrawals).
- finish · `let away = r.ended == nil` · The end come while the app was away (in the background, or closed at its time): the lamp waits for Trả lại.
- finish · `if r.ended == nil { r.ended = t }` · The run shown ends now; a run saved before the end is done keeps the end as it was (below), so a close meanwhile brings the end again.
- finish · `r.failed = []` · The press's lines go at the end; each put-back owed keeps its own.
- finish · `if let unread = switcher.unreadTanks {` · The tanks on this phone not read: nothing goes back, and
- finish · `.problem = unread } }` · each owed put-back's line is the tank list's words (nothing on what went); `mayHaveGone` is kept.
- finish · `run = r` · Shown.
- finish · `keep()` · Saved.
- finish · `let read = board.listError == nil` · The list not read again: no outlet's state now is known, so none is sent (`.unread`).
- finish · `if let gone = switcher.gone(c) {` · Its device deleted from the tanks:
- finish · `r.back[i].done = true` · done, nothing sent now;
- finish · `r.back[i].problem = nil` · its line goes;
- finish · `tell(gone)` · the note says the device is gone, not that nothing went.
- finish · `if away && !byReader {` · The lamp, the end come while away and not Trả lại:
- finish · `r.back[i].failed(String(localized:` · nothing sent now; says the lamp isn't back, or, a try before it may have gone, that it's not known (`Back.failed`).
- finish · `let changed = b.guessed == true` · The note for an outlet the end leaves:
- finish · `? String(localized:` · the press's step's answer lost and the outlet not read after it: not known whether it reached the outlet, AquaTome left it;
- finish · `: String(localized:` · else, that it changed during the run and AquaTome left it. Both true of this end, which sends it nothing.
- finish · `let end = MasterRun.end(` · What the end does with an outlet's put-back (`MasterRun.end`, below): by the outlet as read now, how the press left it, its role now.
- finish · `if end == .unread {` · Not read:
- finish · `r.back[i].failed(Switcher.unreached(name)` · nothing sent now; says it wasn't reached, or, a try before it may have gone, that it's not known.
- finish · `if end != .send {` · Nothing to send:
- finish · `r.back[i].done = true` · done;
- finish · `r.back[i].problem = nil` · its line goes.
- finish · `case .already: if !b.earlier` · Back already: no note when a try of its own may be what put it back; else, if the press had changed it, that something else did and AquaTome left it.
- finish · `case .hold: tell(` · CO2 left off: AquaTome never switches CO2 on.
- finish · `case .heater: tell(` · Made a heater since the press: left, and says so (the button never switches one; Fable, 18 Nov).
- finish · `case .leave: tell(changed)` · Switched since the press left it: this end sends nothing, and says so.
- finish · `.trying(notKnown:` · Before it goes: counted as one that may have gone, and a line it had reads as not known.
- finish · `going.ended = endedBefore` · The run saved before it goes keeps the end as it was:
- finish · `store(going)` · Saved before it goes, with the end as it was: closed meanwhile, it reloads as one that may have gone, and the end comes again.
- finish · `run = r` · Shown before it goes.
- finish · `await switcher.send(c` · Sends it (Switcher, below).
- finish · `r.back[i].done = true` · Back: done;
- finish · `r.back[i].problem = nil` · its line goes;
- finish · `if b.guessed == true { tell(` · the press's step not known to have gone (its answer lost or not reported): says AquaTome put the outlet back, and to look at it (the chief, 18 Nov).
- finish · `kept.ended = endedBefore` · Saved with the end as it was,
- finish · `store(kept)` · at once.
- finish · `r.back[i].failed(line, mayHaveSent:` · Failed: its line when it may have gone or no try before it may have; else not known (`Back.failed`).
- finish · `kept.ended = endedBefore` · Saved with the end as it was,
- finish · `store(kept)` · at once.
- finish · `run = r` · Shown.
- finish · `run = r.pending.isEmpty ? nil : r` · Dropped only when nothing is owed.
- finish · `keep()` · Saved.
- tick · `if owner() == true { Task { await finish(byReader: false) } }` · An end due goes only while the owner is signed in; else it waits.
- keep · `private func keep()` · Saves the run shown, or removes it when there is none.
- keep · `if let run { store(run) } else { UserDefaults.standard.removeObject(forKey: Self.runKey) }` · The same.
- store · `private func store(_ r: MasterRun)` · The one write of a run.
- tell · `private func tell(` · A note, once.
- schedule · `c.body = String(localized:` · The notification at the end time, where allowed: the time is up, open the app to put things back. Nothing on what went.

### AquaTome/Master/Switcher.swift
- send · `return (.failed(words(why, c)), false)` · Withdrawn before any of it went (signed out, the role no longer allows it): said so, and nothing went.
- send · `let allowed: @MainActor @Sendable () -> Bool = { [unowned self] in still() && MasterButton.allows(` · Asked right before each command leaves (Tuya's request, each recording): the owner still signed in, the role still allowing it; no, and it doesn't leave.
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
- air · `private static var holder: ObjectIdentifier?` · Who broadcasts now: the lamp's card or the master button.
- start · `holder = ObjectIdentifier(who)` · The last to start.
- start · `air.start(uuids, allowed: allowed, done: done)` · The phone's one broadcaster (LampAirCore on a phone).
- stop · `guard holder == ObjectIdentifier(who) else { return }` · A stop from another (the card's three seconds ending after the button took over) is ignored: it never cuts the other's start.
- stop · `holder = nil` · Stopped.
- stop · `air.stop()` · The same.
- mayHaveGone · `var mayHaveGone: Int { sent.count + cut.count }` · Recordings sent, or cut after they were handed to Bluetooth.
- send · `guard !list.isEmpty else { return .failed }` · No recording: nothing went.
- send · `guard allowed() else {` · Asked before each recording:
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


### AquaTome/Lights/LoveEcology.swift
- init · `core = LampAirCore(make:` · The phone's air is the kit's core over CoreBluetooth: a new advertiser each time the core asks.
- start · `core.start(uuids, allowed: allowed, done: done)` · The UUIDs as handed (`theAppsLampGlueIsAsPinned`).
- stop · `func stop() { core.stop() }` · The same.
- init · `manager = CBPeripheralManager(delegate: self, queue: nil)` · One manager per advertiser, made with it.
- bluetooth · `case .poweredOn?: .on` · Bluetooth as the core reads it: on;
- bluetooth · `case .poweredOff?: .off` · off;
- bluetooth · `case .unauthorized?: .refused` · not allowed;
- bluetooth · `case .unsupported?: .unsupported` · missing;
- bluetooth · `default: .notYet` · not known yet or resetting: wait (one handed and not answered is cut: may have gone).
- startAdvertising · `func startAdvertising(_ uuids: [String]) {` · Hands Bluetooth
- startAdvertising · `manager?.startAdvertising([CBAdvertisementDataServiceUUIDsKey: uuids.map { CBUUID(string: $0) }])` · each UUID as its 4 hex digits. No test runs it.
- stopAdvertising · `func stopAdvertising() { manager?.stopAdvertising() }` · No test runs it.
- peripheralManagerDidUpdateState · `core?.stateChanged(self)` · From this advertiser.
- peripheralManagerDidStartAdvertising · `core?.answered(self, started: error == nil)` · Bluetooth's own answer to the start handed to this advertiser: an error, it didn't start ("Không gửi được…"); none, it did. No test runs it.
### AquaTomeKit/Sources/Tanks/MasterButton.swift
- allows · `role != "heater" && !(role == "co2" && step.on)` · The button never switches a heater, nor CO2 on: asked at the press, as each command leaves, and at the end.
- Back · `public var done = false` · Back, or nothing to send: no longer owed.
- Back · `public var mayHaveGone: Bool?` · Kept with each put-back: a try of it may have reached the device. Nil in runs kept by build 390.
- earlier · `mayHaveGone ?? (problem != nil)` · Whether a try before may have gone; for build 390's, one with a line counts.
- trying · `mayHaveGone = true` · Set before each try (`aPutBackTriedAgain`).
- trying · `if problem != nil { problem = notKnown }` · A line it had reads as not known while it goes, and after a close.
- trying · `return was` · Whether a try before it may have gone.
- failed · `mayHaveGone = mayHaveSent || before` · Never unset by a try that sent nothing.
- failed · `problem = before ? notKnown : line` · Its line; after a try that may have gone, not known: its own line would say what of it didn't go, and the try before may have sent it (`aPutBackTriedAgain`).
- init · `back = owed.map { var b = $0; if b.earlier { b.mayHaveGone = true }; b.problem = nil; return b }` · Owed by an earlier press: its line goes, whether it may have gone stays.
- init · `if let last, last.on == step.on, last.colour == step.colour { return nil }` · The lamp as this phone last sent it is what the step sets: nothing to put back.
- init · `return Back(command: last ?? DeviceCommand(device: step.device, on: !step.on))` · Else back to what this phone last sent it, or the other way.
- init · `if before(step) == step.on { return nil }` · An outlet read as the step sets it: nothing to put back.
- init · `return Back(command: DeviceCommand(device: step.device, outlet: step.outlet, on: !step.on))` · Else back the other way.
- settle · `self.failed = failed` · The press's lines, as Switcher wrote them.
- settle · `back.removeAll { b in` · Nothing goes back for
- settle · `guard missed.contains(b.command.target), !keeping.contains(b.command.target), !uncertain.contains(b.command.target) else` · a step that failed, unless owed by an earlier press, a lamp step that may have gone, or one whose command may have reached the plug (counted gone, however it reads after: a plug can switch late; the chief, 18 Nov),
- settle · `return b.command.isLamp || now(b.command) == b.command.on` · when it is the lamp's (none of it went), or an outlet read after it as it was. An outlet not read after it stays owed.
- settle · `let left: Bool? = !missed.contains(t) || uncertain.contains(t) ? step.on` · How the press left each outlet: as asked when it went or may have (counted gone);
- settle · `: keeping.contains(t) ? nil : back.first(where:` · one refused before anything went, as it was (an earlier press's, when it owes it).
- settle · `if let left, let i = back.firstIndex(where:` · Noted with its put-back:
- settle · `back[i].left = left` · how it was left,
- settle · `back[i].guessed = uncertain.contains(t) && now(step) != step.on ? true : nil` · and whether only guessed: it may have gone, and wasn't read after it as switched (the end's note then says not known whether the command reached it, and what the end did).
- settle · `if missed.isSuperset(of: steps.map(\.target)), back.isEmpty { ended = t }` · Every step failed and nothing goes back: it ends now.
- End · `case heater` · Made a heater since the press: the end's own case, with its own note (Fable, 18 Nov).
- end · `if now == c.on { return .already }` · Reads as it goes back: nothing to send.
- end · `if let now, let left, now != left { return .leave }` · Switched since the press left it: left, and said so.
- end · `if c.on && (b.held == true || role == "co2") { return .hold }` · CO2 never switched on.
- end · `if role == "heater" { return .heater }` · A heater never switched.
- end · `if now == nil { return .unread }` · Not read: nothing sent, owed for Trả lại.
- end · `return .send` · Else it goes.
- pending · `public var pending: [Back] { back.filter { !$0.done } }` · What is still owed: its lines on the card, Trả lại, and the run kept while any is.

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
- set · `} catch is Withdrawn {` · Thrown only by Tuya's call, before its request leaves (TuyaPlugs, below):
- set · `return nil` · Withdrawn: Tuya's call checked `allowed` before it left (TuyaPlugs, below).
- set · `} catch let e as PlugError where e.nothingSent {` · A refusal before anything could reach the plug (PlugSource, below):
- set · `guard owner == self.source?.owner else { return .refused(e) }` · Refused before the plug, keys changed since.
- set · `return note(o, .refused(e))` · Refused before the plug.
- set · `} catch {` · Anything else (no answer, one this app can't read, the maker's own code, a cancel) may have reached the plug:
- set · `guard owner == self.source?.owner else { return .unknown }` · May have gone, keys changed since.
- set · `guard owner == self.source?.owner else { return .unknown }` · The same, after the list read again.
- set · `return note(o, now == on ? .confirmed : now == nil ? .unknown : .unconfirmed)` · As the list reads after it.
- note · `return outcome` · The outcome noted is the one returned.

### AquaTomeKit/Sources/Plugs/PlugSource.swift
- nothingSent · `case .offline, .maker, .badReply: false` · May have reached the plug.
- nothingSent · `: true` · Refused before anything could reach the plug.

### AquaTomeKit/Sources/Plugs/TuyaPlugs.swift
- set · `guard provider == "tuya", let plug = listed[device]` · Not in the list read: thrown before any request (`noSuchPlug`, nothing sent).
- set · `guard plug.online else { throw PlugError.plugOffline }` · Listed offline: before any request.
- set · `_ = try await call("POST"` · The switch command (`call`, below).
- set · `let status = left > 0 ? try? await call("GET"` · Then its status read for 3 seconds; one not read is not known, never a refusal.
- set · `return Switched(on: reported, confirmed: reported == on)` · Confirmed only when it reads as asked; else not confirmed (the board reads the list once more).
- call · `if let allowed, !(await allowed()) { throw Withdrawn() }` · Before the request leaves.
- call · `} catch PlugError.maker(let code) where Self.staleToken.contains(code) {` · A stale token: Tuya refused the request, nothing switched; asked once more.
- call · `if let allowed, !(await allowed()) { throw Withdrawn() }` · Before it leaves again.
- request · `do { (data, _) = try await send(r) } catch let e as URLError {` · No answer, or cut off: `offline`, or a cancel when this task was cancelled; both may have reached the plug.
- request · `guard let o = (try? JSON.parse(data))?.object, case .bool(let success)? = o["success"] else { throw PlugError.badReply }` · An answer this app can't read: may have.
- request · `guard success else { throw Self.error(` · Tuya's refusal, by its code:
- error · `case 1001, 1004, 1005: .badKeys` · the keys refused,
- error · `case 1013: .clock` · the phone's clock refused,
- error · `case 1106: .noAccess` · no access to that device,
- error · `case 28841002, 28841003, 28841102, 28841103: .expired` · the plan run out,
- error · `case 28841001, 28841101, 28841105, 28841106: .notSubscribed` · not subscribed,
- error · `case 28841004, 28841104: .quota` · the quota used up,
- error · `case 1110, 1111, 1112, 1113: .busy` · over the limit or busy,
- error · `case 2001: .plugOffline` · the plug offline,
- error · `case 2010: .noSuchPlug` · no such device: each refused by the cloud, nothing sent (`PlugSource.nothingSent`);
- error · `default: .maker(code)` · any other code: may have reached the plug.

### AquaTomeKit/Sources/FishLamp/LampAir.swift
- startAdvertising · `func startAdvertising(` · The phone's advertiser (the app's CBPeripheralManager).
- stopAdvertising · `func stopAdvertising()` · The same.
- start · `w.done(.failed)` · Replaced while waiting for Bluetooth: never handed, nothing went.
- stop · `w.done(.failed)` · Stopped while waiting: never handed.
- stop · `if peripheral?.bluetooth == .on { peripheral?.stopAdvertising() }` · Stops only while Bluetooth is on.
- stateChanged · `guard p === peripheral else { return }` · Only this advertiser's state: a let-go one's never cuts or starts another's.
- answered · `guard p === peripheral, let done = starting else { return }` · Only this advertiser's answer, to the start handed to it: a let-go one's late answer is dropped.
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
  ("AquaTome/Master/MasterCard.swift", ["master.refusal", "master.notes", ".problem", "failed.map", "String(localized:", "Text(\"", "Button(\"",
                                        "sendingOr("], nil),
  ("AquaTome/Master/MasterModel.swift", ["refusal = ", "notes = ", "failed.append(", "MasterRun.Failed(", ".problem = ", "].failed(", ".trying(",
                                         "tell(", "store(", "keep()", "run = ", ".failed = ", ".settle(", "MasterRun(", "runKey", "switcher.send(",
                                         "switcher.setByButton(", "sendLamp(", "mayHaveGone", "String(localized:", "still()", "MasterButton.allows(",
                                         "held = true", "listError", "unreadTanks", "switcher.gone(", "let away", "away &&", "MasterRun.end(",
                                         "guessed", "end == .", "end != .", "uncertain", "owner() == true", "session += 1",
                                         "session == s", "done = true", ".ended = "], nil),
  ("AquaTome/Master/Switcher.swift", [".failed(", "CommandEnd.lamp(", "CommandEnd.plug(", "lamp.send(", "board.set(", "nothingSent",
                                      "String(localized:", "MasterModel.signedOut", ": .done", "await set(", "await send(", "return .signedOut",
                                      "return .role", "MasterButton.allows("], nil),
  ("AquaTome/Master/LampSender.swift", ["return .failed", "return started", "return nil", "cut.append(", "sent.append(", "LampRadio.start(",
                                        "LampRadio.stop(", "air.start(", "air.stop(", "String(localized:", "mayHaveGone", "guard allowed()", "holder"], nil),
  ("AquaTome/Lights/LoveEcology.swift", ["core.start(", "core.stop(", "core?.", "LampAirCore(", "CBPeripheralManager(", "startAdvertising(",
                                         "stopAdvertising(", "case .powered", "case .unauthorized?", "case .unsupported?", "default: .notYet"], nil),
  ("AquaTomeKit/Sources/Tanks/MasterButton.swift", ["problem = ", "problem != nil", "mayHaveGone", "self.failed = ", "removeAll", "return ",
                                                    "guard ", "filter {", "heater", "co2", "done = ", "let left", ".left = ", "guessed = ",
                                                    "keeping.contains(t) ?", "ended = t"], nil),
  ("AquaTomeKit/Sources/Plugs/CommandEnd.swift", ["return ", ": true", ": false"], nil),
  ("AquaTomeKit/Sources/Plugs/PlugBoard.swift", ["return ", "catch"], ["set", "note"]),
  ("AquaTomeKit/Sources/Plugs/PlugSource.swift", [": true", ": false"], ["nothingSent"]),
  ("AquaTomeKit/Sources/Plugs/TuyaPlugs.swift", ["Withdrawn()", "throw ", "catch", "await call(", "await send(", "return Switched(", ": ."],
   ["set", "call", "request", "error"]),
  ("AquaTomeKit/Sources/FishLamp/LampAir.swift", ["done(", "starting = ", "peripheral = ", "retired = ", "stopAdvertising()", "startAdvertising(",
                                                  "=== peripheral"], nil),
]

private struct Place: Equatable, CustomStringConvertible {
  let scope: String
  let code: String
  var description: String { "\(scope) · \(code)" }
}

/// The places the code has, in order.
private func walk(_ w: (file: String, finds: [String], in: Set<String>?)) throws -> [Place] {
  let code = try String(contentsOf: ios.appendingPathComponent(w.file), encoding: .utf8)
  // A declaration's name, from the line that opens it: a type, a function, an init, a computed property, a static let.
  let declaration = try NSRegularExpression(pattern: #"^(?:(?:public|private|fileprivate|static|final|mutating|nonisolated|override|@discardableResult|@MainActor|@ViewBuilder)\s+)*(?:func\s+(\w+)|(init)\s*[(<]|var\s+(\w+)\s*:[^=]*\{|(?:class|struct|enum|extension|actor)\s+(\w+)|static\s+let\s+(\w+))"#)
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
