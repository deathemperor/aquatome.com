import Foundation

// The master button ("Nút tổng" on Đèn): one tap sets the devices the reader chose, and the phone puts back what it
// changed at the end (docs/smart-plugs.md). Kept on the phone. What it does and when, pure; sending is the app's.

public struct MasterButton: Sendable, Equatable, Codable {
  public var name: String
  /// In the order the reader added them.
  public var steps: [DeviceCommand]
  /// It ends by itself this many minutes after it starts; nil: when the reader taps Kết thúc.
  public var minutes: Int?

  public init(name: String, steps: [DeviceCommand] = [], minutes: Int? = 120) {
    self.name = name
    self.steps = steps
    self.minutes = minutes
  }

  /// What a step may do, by the outlet's role (the chief, 15 Nov): never switch CO2 on, and never a heater, either way.
  /// The phone puts things back only while the app is open: CO2 left on, or a heater left off, all night could kill fish.
  /// CO2 on comes once a plug's own countdown can switch it off at the end.
  public static func allows(_ step: DeviceCommand, role: String?) -> Bool {
    role != "heater" && !(role == "co2" && step.on)
  }
}

/// One press of the button, kept on the phone until what it changed is back.
public struct MasterRun: Sendable, Equatable, Codable {
  public struct Back: Sendable, Equatable, Codable {
    /// What puts it back.
    public var command: DeviceCommand
    /// Sent back, or seen back.
    public var done = false
    /// Why the last try to put it back didn't (shown as it is).
    public var problem: String?
    /// Never sent by the phone, by the outlet's role when pressed: CO2 back on (the chief, 15 Nov). nil in runs kept
    /// before it.
    public var held: Bool?

    public init(command: DeviceCommand) { self.command = command }
  }

  public var started: Date
  /// When it ends by itself; nil: when the reader taps Kết thúc.
  public var ends: Date?
  /// When it ended; nil while it runs.
  public var ended: Date?
  /// What it set, as the button had it when pressed.
  public var steps: [DeviceCommand]
  /// What goes back at the end: one for each step that changed something.
  public var back: [Back]
  /// The steps that didn't go, with why (shown as it is).
  public var failed: [Failed] = []

  public struct Failed: Sendable, Equatable, Codable {
    public let target: DeviceTarget
    public let line: String
    public init(target: DeviceTarget, line: String) {
      self.target = target
      self.line = line
    }
  }

  /// A press at `now`: what each step puts back at the end. An outlet goes back to the state it had before (`before`;
  /// one already as asked has nothing to put back, and one whose state isn't known goes back the other way). The lamp
  /// reports nothing: it goes back to the last command this phone sent it (`lamp`), or the other way when there is none.
  /// What an earlier press still owes (`owed`: an end while the app was away, a plug not reached) stays owed, and for a
  /// device this press sets too it is what goes back: the state from before both.
  public init(_ button: MasterButton, at now: Date, before: (DeviceCommand) -> Bool?, lamp: DeviceCommand?, owed: [DeviceCommand] = []) {
    started = now
    ends = button.minutes.map { now.addingTimeInterval(TimeInterval($0 * 60)) }
    steps = button.steps
    let owedTargets = Set(owed.map(\.target))
    back = owed.map { Back(command: $0) } + button.steps.filter { !owedTargets.contains($0.target) }.compactMap { step in
      if step.isLamp {
        let last = lamp.map { DeviceCommand(device: step.device, on: $0.on, colour: $0.on ? $0.colour : nil) }
        if let last, last.on == step.on, last.colour == step.colour { return nil }
        return Back(command: last ?? DeviceCommand(device: step.device, on: !step.on))
      }
      if before(step) == step.on { return nil }
      return Back(command: DeviceCommand(device: step.device, outlet: step.outlet, on: !step.on))
    }
  }

  /// The steps that didn't go (`failed`), with the outlets as read after them (`now`): a plug that didn't answer may
  /// still have switched. One that reads as it was has nothing to put back, nor a lamp step that failed (it sent
  /// nothing), unless an earlier press owes it (`owed`). When every step failed and nothing is left, it ends at `t`.
  public mutating func settle(_ failed: [Failed], now: (DeviceCommand) -> Bool?, owed: Set<DeviceTarget>, at t: Date) {
    self.failed = failed
    let missed = Set(failed.map(\.target))
    back.removeAll { b in
      guard missed.contains(b.command.target), !owed.contains(b.command.target) else { return false }
      return b.command.isLamp || now(b.command) == b.command.on
    }
    if missed.isSuperset(of: steps.map(\.target)), back.isEmpty { ended = t }
  }

  public var isRunning: Bool { ended == nil }
  /// What hasn't gone back yet.
  public var pending: [Back] { back.filter { !$0.done } }

  /// Seconds left at `now`, never below 0; nil when it ends on a tap.
  public func left(at now: Date) -> TimeInterval? { ends.map { max(0, $0.timeIntervalSince(now)) } }

  /// Ended by the clock, at `now`, and not yet marked so.
  public func isDue(at now: Date) -> Bool { isRunning && ends.map { now >= $0 } == true }
}
