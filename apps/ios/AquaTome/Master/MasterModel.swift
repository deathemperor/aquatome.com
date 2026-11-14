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
  #endif

  private static let buttonKey = "master.button", runKey = "master.run"

  init(switcher: Switcher) {
    self.switcher = switcher
    trial = CountdownTrial(switcher: switcher)
    let d = UserDefaults.standard
    button = d.data(forKey: Self.buttonKey).flatMap { try? JSONDecoder().decode(MasterButton.self, from: $0) }
    run = d.data(forKey: Self.runKey).flatMap { try? JSONDecoder().decode(MasterRun.self, from: $0) }
    tick()
  }

  /// The reader's own name for it, or the drawing's.
  static let defaultName = String(localized: "Ngắm bể")

  func save(_ b: MasterButton) {
    button = b
    UserDefaults.standard.set(try? JSONEncoder().encode(b), forKey: Self.buttonKey)
  }

  func delete() {
    button = nil
    UserDefaults.standard.removeObject(forKey: Self.buttonKey)
  }

  /// "Bắt đầu": the list of plugs read once (how each outlet is now), then each step once, the lamp's beside the plugs'
  /// (its two recordings take about eight seconds). No countdown is written to a plug (the chief, 15 Nov: not before the
  /// owner's own test of one).
  func start() async {
    guard var button, !sending, run?.isRunning != true else { return }
    sending = true
    defer { sending = false; watch() }
    notes = []
    // Never CO2 on, never a heater (MasterButton.allows): the sheet offers neither; a step that does is not sent.
    let refused = button.steps.filter { !MasterButton.allows($0, role: role($0)) }
    button.steps.removeAll { refused.contains($0) }
    await switcher.plugs.refresh()
    let board = switcher.plugs.board
    var states: [DeviceTarget: Bool] = [:]
    for s in button.steps { if let key = switcher.outlet(s)?.key, let on = board.on(key) { states[s.target] = on } }
    var r = MasterRun(button, at: now(), before: { states[$0.target] }, lamp: LampMemory.last)
    #if DEBUG
    if let endsIn { r.ends = r.started.addingTimeInterval(endsIn) }
    #endif
    run = r
    keep()
    let lampSteps = r.steps.filter(\.isLamp)
    async let lampFailed = sendLamp(lampSteps)
    var failed: [MasterRun.Failed] = []
    for step in r.steps where !step.isLamp {
      if case .failed(let line) = await switcher.set(step) {
        failed.append(.init(target: step.target, line: line))
      } else {
        note("\(step.outlet ?? "") \(step.on ? "on" : "off")")
      }
    }
    failed += await lampFailed
    r.failed = refused.map { .init(target: $0.target, line: String(localized: "Nút không bật tắt ổ \(switcher.name($0)) được trong bản này.")) } + failed
    // Nothing went: nothing to put back.
    if failed.count == r.steps.count {
      r.ended = now()
      r.back = []
    }
    run = r
    keep()
    if r.isRunning, let ends = r.ends { await EndNotice.schedule(at: ends, title: button.name) }
  }

  private func sendLamp(_ steps: [DeviceCommand]) async -> [MasterRun.Failed] {
    var failed: [MasterRun.Failed] = []
    for s in steps {
      if case .failed(let line) = await switcher.set(s) { failed.append(.init(target: s.target, line: line)) } else { note("lamp \(LampSender.recordings(s).map(\.id).joined(separator: "+"))") }
    }
    return failed
  }

  /// Ends it and puts back what it changed: "Kết thúc", "Trả lại" (`byReader`), or the clock (while the app is open, or
  /// when it next opens). An outlet no longer as the button left it (its schedule or a hand switched it during the run)
  /// is left as it is. CO2 is never switched on by the phone at the end: its schedule may mean it off by then, and CO2
  /// with the lights out can kill fish. The lamp, ended by the clock while the app was away, waits for the reader's
  /// "Trả lại" near it.
  func finish(byReader: Bool) async {
    guard var r = run, !sending else { return }
    sending = true
    defer { sending = false; watch() }
    let t = now()
    let away = r.ended == nil && r.ends.map { t.timeIntervalSince($0) > 120 } == true
    if r.ended == nil { r.ended = t }
    let wentOut = Set(r.steps.map(\.target)).subtracting(r.failed.map(\.target))
    r.failed = []
    EndNotice.cancel()
    await switcher.plugs.refresh()
    let board = switcher.plugs.board
    for b in r.pending {
      guard let i = r.back.firstIndex(of: b) else { continue }
      let c = b.command
      let name = switcher.name(c)
      if c.isLamp {
        if away && !byReader {
          r.back[i].problem = String(localized: "Đèn chưa về như cũ: đứng gần đèn rồi bấm Trả lại.")
          continue
        }
      } else if let key = switcher.outlet(c)?.key {
        if board.on(key) == c.on {
          r.back[i].done = true
          r.back[i].problem = nil
          if wentOut.contains(c.target) { notes.append(String(localized: "Ổ \(name) đã đổi trong lúc chạy nên AquaTome để nguyên.")) }
          continue
        }
        if c.on && role(c) == "co2" {
          r.back[i].done = true
          r.back[i].problem = nil
          notes.append(String(localized: "AquaTome không tự bật lại CO2. Cần thì bật ổ CO2 trong Bể của tôi."))
          continue
        }
      }
      switch await switcher.set(c) {
      case .done:
        r.back[i].done = true
        r.back[i].problem = nil
        note(c.isLamp ? "lamp back \(LampSender.recordings(c).map(\.id).joined(separator: "+"))" : "\(c.outlet ?? "") back \(c.on ? "on" : "off")")
      case .failed(let line): r.back[i].problem = line
      }
    }
    run = r.pending.isEmpty ? nil : r
    keep()
  }

  /// The app came to the front, or opened: an end that came while it was away.
  func tick() {
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
    let d = UserDefaults.standard
    if let run { d.set(try? JSONEncoder().encode(run), forKey: Self.runKey) } else { d.removeObject(forKey: Self.runKey) }
  }

  private func note(_ s: String) { log.append(s) }
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
