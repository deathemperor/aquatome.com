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
  /// The owner's test of a plug's countdown.
  let trial: CountdownTrial
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
  /// `-master-role-mid-press <code>=<role>`: that outlet's role changes once a press has read the plugs, as another
  /// phone's sync might change it, so a flow can see a step checked as it is sent.
  @ObservationIgnored private let roleMidPress: (code: String, role: String)? = {
    let args = ProcessInfo.processInfo.arguments
    guard let i = args.firstIndex(of: "-master-role-mid-press"), i + 1 < args.count else { return nil }
    let kv = args[i + 1].split(separator: "=").map(String.init)
    return kv.count == 2 ? (kv[0], kv[1]) : nil
  }()
  #endif
  /// Whether the owner is signed in: a press stops sending once not (`AquaTomeApp` sets it to the account's).
  @ObservationIgnored var owner: @MainActor () -> Bool = { true }
  /// Since when the app has been in front without a break: its launch, or its last return from the background. An end
  /// before it came while the app was away, however soon it came back.
  @ObservationIgnored private var frontSince: Date
  /// In the background now (iOS broadcasts nothing to the lamp from there).
  @ObservationIgnored private var inBackground = false

  private static let buttonKey = "master.button", runKey = "master.run"

  init(switcher: Switcher) {
    self.switcher = switcher
    trial = CountdownTrial(switcher: switcher)
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

  /// A press running, going out or still owing something: the owner's countdown test waits, since each would read the
  /// other's switching as a hand's.
  var busy: Bool { sending || run?.isRunning == true || run?.pending.isEmpty == false }

  /// The owner's countdown test, never beside a press.
  func tryCountdown(_ target: DeviceTarget) async {
    guard !busy else { return }
    await trial.run(target)
  }

  /// "Bắt đầu": the list of plugs read once (how each outlet is now), then each step once, the lamp's beside the plugs'
  /// (its two recordings take about eight seconds). No countdown is written to a plug (the chief, 15 Nov: not before the
  /// owner's own test of one).
  func start() async {
    guard var button, !sending, run?.isRunning != true, trial.state == .idle, owner() else { return }
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
    let lampSent = switcher.lamp.sent.count
    async let lampFailed = sendLamp(lampSteps)
    var failed: [MasterRun.Failed] = []
    for step in r.steps where !step.isLamp {
      #if DEBUG
      if let stepsWait { try? await Task.sleep(for: .seconds(stepsWait)) }
      #endif
      // Signed out, or no longer the owner's, since the press: the rest don't go. Each is checked against its outlet's
      // role as it goes (setByButton): CO2 is never switched on, whatever changed since the press.
      guard owner() else {
        failed.append(.init(target: step.target, line: Self.signedOut))
        continue
      }
      if case .failed(let line) = await switcher.setByButton(step) {
        failed.append(.init(target: step.target, line: line))
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
    // A lamp step that failed after one of its recordings went out ("on", then not its colour) changed the lamp.
    let halfSent = switcher.lamp.sent.count > lampSent ? Set(lampSteps.map(\.target)) : []
    r.settle(refusals + failed, now: { after[$0.target] }, keeping: Set(owed.map(\.command.target)).union(halfSent), at: now())
    run = r
    keep()
    if r.isRunning, let ends = r.ends { await EndNotice.schedule(at: ends, title: button.name) }
  }

  private func sendLamp(_ steps: [DeviceCommand]) async -> [MasterRun.Failed] {
    var failed: [MasterRun.Failed] = []
    for s in steps {
      guard owner() else {
        failed.append(.init(target: s.target, line: Self.signedOut))
        continue
      }
      if case .failed(let line) = await switcher.setByButton(s) { failed.append(.init(target: s.target, line: line)) } else { note("lamp \(LampSender.recordings(s).map(\.id).joined(separator: "+"))") }
    }
    return failed
  }

  /// A step not sent because the owner signed out during the press.
  static var signedOut: String { String(localized: "Chưa gửi vì bạn đã đăng xuất.") }

  /// Ends it and puts back what it changed: "Kết thúc", "Trả lại" (`byReader`), or the clock (while the app is open, or
  /// when it next opens). An outlet no longer as the button left it (its schedule or a hand switched it during the run)
  /// is left as it is. CO2 is never switched on by the phone at the end: its schedule may mean it off by then, and CO2
  /// with the lights out can kill fish. The lamp, ended by the clock while the app was away (in the background or
  /// closed at the end time, however soon it came back), waits for the reader's "Trả lại" near it.
  func finish(byReader: Bool) async {
    guard var r = run, !sending else { return }
    sending = true
    defer { sending = false; watch() }
    let t = now()
    let away = r.ended == nil && r.ends.map { inBackground || frontSince > $0 } == true
    let endedBefore = r.ended
    if r.ended == nil { r.ended = t }
    // How each step that went left its outlet: one found back at the end was changed during the run.
    let missed = Set(r.failed.map(\.target))
    let left = Dictionary(r.steps.filter { !missed.contains($0.target) }.map { ($0.target, $0.on) }, uniquingKeysWith: { _, last in last })
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
          r.back[i].problem = String(localized: "Đèn chưa về như cũ: đứng gần đèn rồi bấm Trả lại.")
          continue
        }
      } else if let key = switcher.outlet(c)?.key {
        let changed = String(localized: "Ổ \(name) đã đổi trong lúc chạy nên AquaTome để nguyên.")
        // Back already; switched since this press left it (a hand, its schedule) or made a heater: left; CO2: never on.
        let end = MasterRun.end(b, now: board.on(key), left: left[c.target], role: role(c))
        if end != .send {
          r.back[i].done = true
          r.back[i].problem = nil
          switch end {
          case .already: if let l = left[c.target], l != c.on { tell(changed) }
          case .hold: tell(String(localized: "AquaTome không tự bật lại CO2. Cần thì bật ổ CO2 trong Bể của tôi."))
          default: tell(changed)
          }
          continue
        }
      }
      switch await switcher.setByButton(c) {
      case .done:
        r.back[i].done = true
        r.back[i].problem = nil
        // Kept as each goes back: the app closed meanwhile doesn't send it again when it next opens.
        var kept = r
        kept.ended = endedBefore
        store(kept)
        note(c.isLamp ? "lamp back \(LampSender.recordings(c).map(\.id).joined(separator: "+"))" : "\(c.outlet ?? "") back \(c.on ? "on" : "off")")
      case .failed(let line): r.back[i].problem = line
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

  /// The app opened or came to the front, or the end's time came: an end that came while it was away, and a countdown
  /// test the app stopped in the middle of (killed, or closed by iOS), its outlet put back on.
  func tick() {
    if !busy { Task { await trial.recover() } }
    guard let r = run, !sending else { return }
    if r.isDue(at: now()) { Task { await finish(byReader: false) } } else { watch() }
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
