import Foundation
import Observation
import Plugs
import Tanks

/// The master button on Đèn ("Nút tổng", docs/smart-plugs.md): one tap sets the devices the reader chose; at the end
/// what it changed goes back. An outlet with its own countdown is put back by the plug, with or without the phone; the
/// lamp and other outlets by the phone, the lamp only when it is near (it hears the phone only close by). Kept on the
/// phone: the button, and a press until what it changed is back.
@MainActor
@Observable
final class MasterModel {
  private(set) var button: MasterButton?
  private(set) var run: MasterRun?
  /// Steps going out: a start, an end, or putting things back.
  private(set) var sending = false
  let switcher: Switcher
  /// What went out, for the UI tests: the lamp's recordings and each outlet's switch and countdown.
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
  /// (its two recordings take about eight seconds). An outlet that changed, with a countdown, is given one to the end.
  func start() async {
    guard let button, !sending, run?.isRunning != true else { return }
    sending = true
    defer { sending = false; watch() }
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
        continue
      }
      note("\(step.outlet ?? "") \(step.on ? "on" : "off")")
      guard let i = r.back.firstIndex(where: { $0.command.target == step.target }), let seconds = r.countdown(at: now()),
            let key = switcher.outlet(step)?.key, board.hasCountdown(key) else { continue }
      if await board.countdown(key, seconds: seconds) {
        r.back[i].counting = true
        note("\(step.outlet ?? "") countdown")
      }
    }
    r.failed = failed + (await lampFailed)
    // Nothing went: nothing to put back.
    if r.failed.count == r.steps.count {
      r.ended = now()
      r.back = []
    }
    run = r
    keep()
  }

  private func sendLamp(_ steps: [DeviceCommand]) async -> [MasterRun.Failed] {
    var failed: [MasterRun.Failed] = []
    for s in steps {
      if case .failed(let line) = await switcher.set(s) { failed.append(.init(target: s.target, line: line)) } else { note("lamp \(LampSender.recordings(s).map(\.id).joined(separator: "+"))") }
    }
    return failed
  }

  /// Ends it and puts back what it changed: "Kết thúc", "Trả lại" (`byReader`), or the clock. An outlet with a countdown,
  /// ended early, has its countdown stopped first (if that fails it is left to come back by itself at the end); ended by
  /// the clock, it is left to the plug, and looked at only a minute after the end. The lamp, ended by the clock while the
  /// app was away, waits for the reader's "Trả lại": the phone may not be near it.
  func finish(byReader: Bool) async {
    guard var r = run, !sending else { return }
    sending = true
    defer { sending = false; watch() }
    let t = now()
    let early = r.ends.map { t < $0 } ?? true
    let away = r.ended == nil && r.ends.map { t.timeIntervalSince($0) > 120 } == true
    if r.ended == nil { r.ended = t }
    r.failed = []
    await switcher.plugs.refresh()
    let board = switcher.plugs.board
    for b in r.toSend(at: t) {
      guard let i = r.back.firstIndex(of: b) else { continue }
      let c = b.command
      if c.isLamp {
        if away && !byReader {
          r.back[i].problem = String(localized: "Đèn chưa được trả lại: đứng gần đèn rồi bấm Trả lại.")
          continue
        }
      } else if let key = switcher.outlet(c)?.key {
        if b.counting {
          // Stopped first, or it would switch the outlet again at the end.
          let stopped = await board.countdown(key, seconds: 0)
          if stopped { note("\(c.outlet ?? "") countdown 0") }
          if early && !stopped { continue }
          r.back[i].counting = false
        }
        if board.on(key) == c.on {
          r.back[i].done = true
          r.back[i].problem = nil
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

  /// The app came to the front, or opened: an end that came while it was away, or the look a minute after one.
  func tick() {
    guard let r = run, !sending else { return }
    let t = now()
    let lookAgain = !r.isRunning && r.pending.contains { $0.counting } && r.ends.map { t >= $0.addingTimeInterval(MasterRun.countdownGrace) } == true
    if r.isDue(at: t) || lookAgain { Task { await finish(byReader: false) } } else { watch() }
  }

  /// Wakes at the end, and a minute after it while an outlet's countdown may still be putting it back.
  private func watch() {
    waiter?.cancel()
    guard let r = run, let ends = r.ends else { return }
    let at = r.isRunning ? ends : ends.addingTimeInterval(MasterRun.countdownGrace)
    guard r.isRunning || r.pending.contains(where: \.counting) else { return }
    waiter = Task { [weak self] in
      let wait = at.timeIntervalSince(Date())
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
