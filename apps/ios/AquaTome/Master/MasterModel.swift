import Foundation
import Observation
import Plugs
import Tanks
import UserNotifications

/// The master button on Đèn ("Nút tổng", docs/smart-plugs.md): one tap sets the devices the reader chose; at the end
/// the phone puts back what it changed, while the app is open or when it next opens; the lamp only when the phone is
/// near (it hears it only close by). Kept on the phone: the button, and a press until what it changed is back.
@MainActor
@Observable
final class MasterModel {
  private(set) var button: MasterButton?
  private(set) var run: MasterRun?
  /// Steps going out: a start, an end, or putting things back.
  private(set) var sending = false
  /// What the last end left as it was, and why (nothing failed): shown until the next start.
  private(set) var notes: [String] = []
  /// Why the last tap on Bắt đầu sent nothing: shown until the next.
  private(set) var refusal: [String] = []
  let switcher: Switcher
  /// What went out, for the UI tests: the lamp's recordings and each outlet's switch.
  private(set) var log: [String] = []

  @ObservationIgnored private var waiter: Task<Void, Never>?
  @ObservationIgnored var now: () -> Date = Date.init
  #if DEBUG
  /// `-master-ends-in <seconds>`: a press ends that soon, so a flow can see the end come.
  @ObservationIgnored private let endsIn = ProcessInfo.processInfo.arguments.firstIndex(of: "-master-ends-in")
    .flatMap { i in ProcessInfo.processInfo.arguments.dropFirst(i + 1).first.flatMap(TimeInterval.init) }
  /// `-master-steps-wait <seconds>`: each outlet step waits that long before it goes, so a flow can sign out mid-press.
  @ObservationIgnored private let stepsWait = ProcessInfo.processInfo.arguments.firstIndex(of: "-master-steps-wait")
    .flatMap { i in ProcessInfo.processInfo.arguments.dropFirst(i + 1).first.flatMap(TimeInterval.init) }
  /// `-master-steps-wait-account <n>`: each outlet step waits until the account has changed n times since the press and
  /// the owner is known again (two minutes at most), so a flow can sign out and in again before it goes.
  @ObservationIgnored private let stepsWaitAccount = ProcessInfo.processInfo.arguments.firstIndex(of: "-master-steps-wait-account")
    .flatMap { i in ProcessInfo.processInfo.arguments.dropFirst(i + 1).first.flatMap { Int($0) } }
  /// `-master-role-mid-press <code>=<role>`: that outlet's role changes once a press has read the plugs, as another
  /// phone's sync might change it, so a flow can see a step checked as it is sent.
  @ObservationIgnored private let roleMidPress: (code: String, role: String)? = {
    let args = ProcessInfo.processInfo.arguments
    guard let i = args.firstIndex(of: "-master-role-mid-press"), i + 1 < args.count else { return nil }
    let kv = args[i + 1].split(separator: "=").map(String.init)
    return kv.count == 2 ? (kv[0], kv[1]) : nil
  }()
  #endif
  /// Whether the owner is signed in: true; false, not (signed out, or another account); nil, not known yet (signed in,
  /// the account's answer not back, as at each launch). A press and an end send only while true; an end due waits until
  /// it is (`AquaTomeApp` sets it to the account's, and ticks when it changes).
  @ObservationIgnored var owner: @MainActor () -> Bool? = { nil }
  /// Counts the account's changes (signed out, signed in): a press or an end sends only in the session it began in, so
  /// one signed out and in again doesn't go on (Codex, 17 Nov). `AquaTomeApp` calls `accountChanged`.
  @ObservationIgnored private var session = 0
  /// Since when the app has been in front without a break: its launch, or its last return from the background. An end
  /// before it came while the app was away, however soon it came back.
  @ObservationIgnored private var frontSince: Date
  /// In the background now (iOS broadcasts nothing to the lamp from there).
  @ObservationIgnored private var inBackground = false

  private static let buttonKey = "master.button", runKey = "master.run"

  init(switcher: Switcher) {
    self.switcher = switcher
    frontSince = Date()
    let d = UserDefaults.standard
    button = d.data(forKey: Self.buttonKey).flatMap { try? JSONDecoder().decode(MasterButton.self, from: $0) }
    run = d.data(forKey: Self.runKey).flatMap { try? JSONDecoder().decode(MasterRun.self, from: $0) }
    tick()
  }

  /// The reader's own name for it, or the drawing's.
  static let defaultName = String(localized: "Ngắm bể")

  func save(_ b: MasterButton) {
    button = b
    // Why the last press sent nothing was about the button as it was.
    refusal = []
    UserDefaults.standard.set(try? JSONEncoder().encode(b), forKey: Self.buttonKey)
  }

  /// What a press still owes stays, with its "Trả lại", on the card without a button.
  func delete() {
    button = nil
    refusal = []
    UserDefaults.standard.removeObject(forKey: Self.buttonKey)
    if run.map({ !$0.isRunning && $0.pending.isEmpty }) == true {
      run = nil
      keep()
    }
  }

  /// The account changed (signed out, or in): whatever a press or an end was still to send doesn't go.
  func accountChanged() {
    session += 1
    note("account")
  }

  /// What each command of a press or an end checks as it goes, with its outlet's role (Switcher.send): the owner still
  /// signed in, in the session it began in.
  private func gate() -> @MainActor @Sendable () -> Bool {
    let s = session
    return { [weak self] in self.map { $0.owner() == true && $0.session == s } ?? false }
  }

  /// "Bắt đầu": the list of plugs read once (how each outlet is now), then each step once, the lamp's beside the plugs'
  /// (its two recordings take about eight seconds). No countdown is written to a plug (the chief, 15 and 17 Nov: none
  /// from the app until the CO2-on work).
  func start() async {
    guard var button, !sending, run?.isRunning != true, owner() == true else { return }
    let still = gate()
    #if DEBUG
    let pressed = session
    #endif
    sending = true
    defer { sending = false; watch() }
    notes = []
    refusal = []
    // Never CO2 on, never a heater (MasterButton.allows): the sheet offers neither; a step that does is not sent.
    let refused = button.steps.filter { !MasterButton.allows($0, role: role($0)) }
    button.steps.removeAll { refused.contains($0) }
    // What the last press hasn't put back yet (an end while the app was away, a plug not reached) stays owed.
    let owed = run?.pending ?? []
    await switcher.plugs.refresh()
    #if DEBUG
    if let changed = roleMidPress { switcher.changedRoles[changed.code] = changed.role }
    #endif
    // The list not read (the network, Tuya): how the outlets are now isn't known, so neither is what goes back. Nothing
    // is sent; the lamp waits with them.
    if switcher.plugs.current != nil, switcher.plugs.board.listError != nil, button.steps.contains(where: { !$0.isLamp }) {
      refusal = button.steps.filter { !$0.isLamp }.map { Switcher.unreached(switcher.name($0)) }
      return
    }
    var states: [DeviceTarget: Bool] = [:]
    for s in button.steps { if let key = switcher.outlet(s)?.key, let on = switcher.plugs.board.on(key) { states[s.target] = on } }
    var r = MasterRun(button, at: now(), before: { states[$0.target] }, lamp: LampMemory.last, owed: owed)
    // CO2 switched off stays off at the end, whatever its role reads by then.
    for i in r.back.indices where r.back[i].command.on && role(r.back[i].command) == "co2" { r.back[i].held = true }
    #if DEBUG
    if let endsIn { r.ends = r.started.addingTimeInterval(endsIn) }
    #endif
    run = r
    keep()
    let lampSteps = r.steps.filter(\.isLamp)
    let lampSent = switcher.lamp.mayHaveGone
    async let lampFailed = sendLamp(lampSteps, still: still)
    var failed: [MasterRun.Failed] = []
    // Steps that failed after their command may have reached the plug (its answer lost, or not confirmed).
    var uncertain: Set<DeviceTarget> = []
    for step in r.steps where !step.isLamp {
      #if DEBUG
      if let stepsWait { try? await Task.sleep(for: .seconds(stepsWait)) }
      if let n = stepsWaitAccount {
        for _ in 0..<240 where !(session >= pressed + n && owner() == true) { try? await Task.sleep(for: .milliseconds(500)) }
      }
      #endif
      // Signed out, or no longer the owner's, since the press: the rest don't go. Each is checked against its outlet's
      // role and the owner as it goes, and again right before its command leaves (Switcher.send): CO2 is never switched
      // on, whatever changed since the press.
      guard still() else {
        failed.append(.init(target: step.target, line: Self.signedOut))
        continue
      }
      let (result, mayHaveSent) = await switcher.send(step, still: still)
      if case .failed(let line) = result {
        failed.append(.init(target: step.target, line: line))
        if mayHaveSent { uncertain.insert(step.target) }
      } else {
        note("\(step.outlet ?? "") \(step.on ? "on" : "off")")
      }
    }
    failed += await lampFailed
    // A plug that didn't answer may still have switched: read again, and only what changed goes back.
    var after: [DeviceTarget: Bool] = [:]
    if !failed.isEmpty {
      await switcher.plugs.refresh()
      for s in r.steps { if let key = switcher.outlet(s)?.key, let on = switcher.plugs.board.on(key) { after[s.target] = on } }
    }
    let refusals = refused.map { MasterRun.Failed(target: $0.target, line: String(localized: "Nút không bật tắt ổ \(switcher.name($0)) được trong bản này.")) }
    // A lamp step that failed after one of its recordings went out, or may have ("on", then not its colour; one cut as
    // it began), may have changed the lamp: it goes back at the end.
    let halfSent = switcher.lamp.mayHaveGone > lampSent ? Set(lampSteps.map(\.target)) : []
    r.settle(refusals + failed, now: { after[$0.target] }, keeping: Set(owed.map(\.command.target)).union(halfSent), at: now(),
             uncertain: uncertain)
    run = r
    keep()
    if r.isRunning, let ends = r.ends { await EndNotice.schedule(at: ends, title: button.name) }
  }

  private func sendLamp(_ steps: [DeviceCommand], still: @escaping @MainActor @Sendable () -> Bool) async -> [MasterRun.Failed] {
    var failed: [MasterRun.Failed] = []
    for s in steps {
      guard still() else {
        failed.append(.init(target: s.target, line: Self.signedOut))
        continue
      }
      // Each of its recordings checked as it goes: signed out after "on", its colour doesn't go.
      if case .failed(let line) = await switcher.setByButton(s, still: still) { failed.append(.init(target: s.target, line: line)) } else { note("lamp \(LampSender.recordings(s).map(\.id).joined(separator: "+"))") }
    }
    return failed
  }

  /// A step or a put-back not sent because the owner signed out since it began.
  static var signedOut: String { String(localized: "Chưa gửi vì bạn đã đăng xuất.") }

  /// Ends it and puts back what it changed: "Kết thúc", "Trả lại" (`byReader`), or the clock (while the app is open, or
  /// when it next opens). An outlet no longer as the button left it (its schedule or a hand switched it during the run)
  /// is left as it is. CO2 is never switched on by the phone at the end: its schedule may mean it off by then, and CO2
  /// with the lights out can kill fish. The lamp, ended by the clock while the app was away (in the background or
  /// closed at the end time, however soon it came back), waits for the reader's "Trả lại" near it.
  func finish(byReader: Bool) async {
    guard var r = run, !sending else { return }
    let still = gate()
    sending = true
    defer { sending = false; watch() }
    let t = now()
    let away = r.ended == nil && r.ends.map { inBackground || frontSince > $0 } == true
    let endedBefore = r.ended
    if r.ended == nil { r.ended = t }
    // How each step that went left its outlet, for a run kept before `Back.left`: one found back at the end was changed
    // during the run.
    let missed = Set(r.failed.map(\.target))
    let kept = Dictionary(r.steps.filter { !missed.contains($0.target) }.map { ($0.target, $0.on) }, uniquingKeysWith: { _, last in last })
    r.failed = []
    EndNotice.cancel()
    // The tanks on this phone not read: which devices are still on one isn't known, so nothing goes back and nothing is
    // dropped as deleted. Each stays owed, with the tank list's words, for "Trả lại" once they read.
    if let unread = switcher.unreadTanks {
      for b in r.pending { if let i = r.back.firstIndex(of: b) { r.back[i].problem = unread } }
      run = r
      keep()
      return
    }
    await switcher.plugs.refresh()
    let board = switcher.plugs.board
    // The list not read again: no outlet's state now is known (the last list's is old), so none goes back.
    let read = board.listError == nil
    for b in r.pending {
      guard let i = r.back.firstIndex(of: b) else { continue }
      let c = b.command
      let name = switcher.name(c)
      // Its record gone from the tanks (the plug or the lamp deleted): nothing to put back to.
      if let gone = switcher.gone(c) {
        r.back[i].done = true
        r.back[i].problem = nil
        tell(gone)
        continue
      }
      if c.isLamp {
        if away && !byReader {
          r.back[i].failed(String(localized: "Đèn chưa về như cũ: đứng gần đèn rồi bấm Trả lại."), mayHaveSent: false,
                           notKnown: switcher.notKnown(c), before: r.back[i].earlier)
          continue
        }
      } else if let key = switcher.outlet(c)?.key {
        // Whether the step went isn't known (its answer lost or not reported, the outlet not read after it as switched):
        // said so, not that a hand changed it (Codex, 17 Nov).
        let changed = b.guessed == true
          ? String(localized: "Không rõ lệnh đã tới ổ \(name) chưa, nên AquaTome để nguyên. Bạn xem lại ổ này.")
          : String(localized: "Ổ \(name) đã đổi trong lúc chạy nên AquaTome để nguyên.")
        // Only guessed, found back after a put-back try of its own that may have gone: that try may be what put it back,
        // so it says AquaTome put it back, not that it left it (Fable, 18 Nov).
        let putBack = String(localized: "AquaTome đã trả ổ \(name) về như cũ: lúc bấm, ổ chưa báo đã đổi. Bạn xem lại ổ này.")
        // Back already; switched since the last press left it (a hand, its schedule): left; made a heater: left, and said
        // so (Fable, 18 Nov); CO2: never on; not read: stays owed, for Trả lại.
        let end = MasterRun.end(b, now: read ? board.on(key) : nil, left: b.left ?? kept[c.target], role: role(c))
        if end == .unread {
          r.back[i].failed(Switcher.unreached(name), mayHaveSent: false, notKnown: switcher.notKnown(c), before: r.back[i].earlier)
          continue
        }
        if end != .send {
          r.back[i].done = true
          r.back[i].problem = nil
          switch end {
          // Back already. Only guessed: always a note, and to look, on Trả lại too (the chief, 18 Nov; Codex): that
          // AquaTome put it back, after a try of its own that may have gone; else that it isn't known whether the press's
          // step went, and AquaTome left it. Else, after a try of its own that may have gone: that try may be what put it
          // back, so no word that something else changed it and AquaTome left it.
          case .already: if b.guessed == true { tell(b.earlier ? putBack : changed) } else if !b.earlier, let l = b.left ?? kept[c.target], l != c.on { tell(changed) }
          case .hold: tell(String(localized: "AquaTome không tự bật lại CO2. Cần thì bật ổ CO2 trong Bể của tôi."))
          case .heater: tell(String(localized: "Ổ \(name) giờ được ghi là ổ sưởi nên AquaTome để nguyên. Bạn xem lại ổ này."))
          case .leave: tell(changed)
          case .unread, .send: break
          }
          continue
        }
      }
      // Kept and shown before it goes: the app closed before its answer, it counts and reads as one that may have gone
      // (Codex, 18 Nov).
      let before = r.back[i].trying(notKnown: switcher.notKnown(c))
      var going = r
      going.ended = endedBefore
      store(going)
      run = r
      let (result, mayHaveSent) = await switcher.send(c, still: still)
      switch result {
      case .done:
        r.back[i].done = true
        r.back[i].problem = nil
        // Whether the press's step went wasn't known: what the end did, and to look (the chief, 18 Nov).
        if b.guessed == true { tell(String(localized: "AquaTome đã trả ổ \(name) về như cũ: lúc bấm, ổ chưa báo đã đổi. Bạn xem lại ổ này.")) }
        // Kept as each goes back: the app closed meanwhile doesn't send it again when it next opens.
        var kept = r
        kept.ended = endedBefore
        store(kept)
        note(c.isLamp ? "lamp back \(LampSender.recordings(c).map(\.id).joined(separator: "+"))" : "\(c.outlet ?? "") back \(c.on ? "on" : "off")")
      // One that may have gone before isn't said not sent by a try that sent nothing (MasterRun.Back.failed); kept at
      // once, as one that went is.
      case .failed(let line):
        r.back[i].failed(line, mayHaveSent: mayHaveSent, notKnown: switcher.notKnown(c), before: before)
        var kept = r
        kept.ended = endedBefore
        store(kept)
        run = r
      }
    }
    run = r.pending.isEmpty ? nil : r
    keep()
  }

  /// The app went to the background: an end from now on comes while it's away.
  func wentAway() { inBackground = true }

  /// The app came to the front (`AquaTomeApp`, at launch too).
  func cameBack() {
    if inBackground {
      inBackground = false
      frontSince = now()
    }
    tick()
  }

  /// The app opened or came to the front, the end's time came, or the owner became known: an end that came while it was
  /// away. Due while the owner isn't signed in (or not known yet), it waits, and goes once they are.
  func tick() {
    guard let r = run, !sending else { return }
    if !r.isDue(at: now()) { return watch() }
    if owner() == true { Task { await finish(byReader: false) } }
  }

  /// Wakes at the end while it runs (the app open).
  private func watch() {
    waiter?.cancel()
    guard let r = run, r.isRunning, let ends = r.ends else { return }
    waiter = Task { [weak self] in
      let wait = ends.timeIntervalSince(Date())
      if wait > 0 { try? await Task.sleep(for: .seconds(wait)) }
      guard !Task.isCancelled else { return }
      self?.tick()
    }
  }

  private func keep() {
    if let run { store(run) } else { UserDefaults.standard.removeObject(forKey: Self.runKey) }
  }

  private func store(_ r: MasterRun) { UserDefaults.standard.set(try? JSONEncoder().encode(r), forKey: Self.runKey) }

  private func note(_ s: String) { log.append(s) }
  private func tell(_ s: String) { if !notes.contains(s) { notes.append(s) } }
}

/// The notification at a press's end time, for a phone left closed: only where AquaTome's notifications are allowed
/// already (the owner's daily report); it never asks for them. Not shown with the app in front (OwnerNotifications),
/// where the end comes by itself.
enum EndNotice {
  static let id = "master.end"

  static func schedule(at ends: Date, title: String) async {
    let center = UNUserNotificationCenter.current()
    guard await center.notificationSettings().authorizationStatus == .authorized else { return }
    let c = UNMutableNotificationContent()
    c.title = title
    c.body = String(localized: "Đã hết giờ. Mở AquaTome cạnh bể để trả đèn và ổ cắm về như cũ.")
    c.sound = .default
    let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, ends.timeIntervalSinceNow), repeats: false)
    try? await center.add(UNNotificationRequest(identifier: id, content: c, trigger: trigger))
  }

  static func cancel() { UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id]) }
}
