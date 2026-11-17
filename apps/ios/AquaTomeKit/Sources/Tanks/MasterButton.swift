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
    /// How the last press that set the outlet left it (`MasterRun.settle`): the end leaves an outlet no longer so. nil
    /// when no press set it, its step was refused before anything went, or in runs kept before it (Codex, 17 Nov).
    public var left: Bool?
    /// `left` is only as the step asked: its answer was lost and the outlet not read after it, so whether it went isn't
    /// known. The end then says so, rather than that a hand changed it. nil when not.
    public var guessed: Bool?
    /// A try to put it back may have reached the device (its answer lost or not confirmed, the lamp's cut): nil when
    /// none did, or in runs kept before it.
    public var mayHaveGone: Bool?

    public init(command: DeviceCommand) { self.command = command }

    /// A try to put it back is about to go: kept so (the app saves the run then), it counts as one that may have gone if
    /// the app is closed before its answer (Codex, 18 Nov). How it was before, for `failed`.
    public mutating func trying() -> Bool? {
      let was = mayHaveGone
      mayHaveGone = true
      return was
    }

    /// A try to put it back failed, saying `line`, and any of it may have reached the device (`mayHaveSent`) or not;
    /// `before`: whether one before it may have (from `trying`, or `mayHaveGone` for a try that sent nothing). After one
    /// that may have, a try that sent nothing says the device's state isn't known (`notKnown`), never its own line, which
    /// would say it wasn't sent (Fable, 18 Nov). Not known (a run kept before `mayHaveGone`) and a line from a try before:
    /// counted as one that may have gone (Codex, 18 Nov).
    public mutating func failed(_ line: String, mayHaveSent: Bool, notKnown: String, before: Bool?) {
      let earlier = before ?? (problem != nil)
      mayHaveGone = mayHaveSent || earlier
      problem = mayHaveSent || !earlier ? line : notKnown
    }
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
  /// What an earlier press still owes (`owed`: an end while the app was away, a plug not reached) stays owed, held as it
  /// was, and for a device this press sets too it is what goes back: the state from before both.
  public init(_ button: MasterButton, at now: Date, before: (DeviceCommand) -> Bool?, lamp: DeviceCommand?, owed: [Back] = []) {
    started = now
    ends = button.minutes.map { now.addingTimeInterval(TimeInterval($0 * 60)) }
    steps = button.steps
    let owedTargets = Set(owed.map(\.command.target))
    // An owed one's line goes; whether a try of it may have gone stays (one kept before `mayHaveGone`, with a line: it
    // may have).
    back = owed.map { var b = $0; b.mayHaveGone = b.mayHaveGone ?? (b.problem != nil ? true : nil); b.problem = nil; return b } + button.steps.filter { !owedTargets.contains($0.target) }.compactMap { step in
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
  /// still have switched. One that reads as it was has nothing to put back, nor a lamp step that failed before sending
  /// anything. One that reads as the step asked, or isn't known (the read after it failed too: the command may have
  /// reached it, a fan left off), stays owed: the end reads it again and sends nothing to one already back, so no state
  /// the phone only guessed is sent. `keeping`: what goes back whatever (owed by an earlier press, a lamp step half
  /// sent). When every step failed and nothing is left, it ends at `t`.
  ///
  /// How this press left each outlet it set goes with its put-back (`Back.left`), for the end: a step that went, as it
  /// asked; a failed one whose command may have reached the plug (`uncertain`: its answer lost, or not confirmed), as
  /// read after it, or, not read, as it asked (the phone can't tell, and counts it gone: the end then leaves the outlet
  /// rather than undo what a hand may have done since); one refused before anything went, as it was (an earlier press's,
  /// when one owes it).
  public mutating func settle(_ failed: [Failed], now: (DeviceCommand) -> Bool?, keeping: Set<DeviceTarget>, at t: Date,
                              uncertain: Set<DeviceTarget> = []) {
    self.failed = failed
    let missed = Set(failed.map(\.target))
    back.removeAll { b in
      guard missed.contains(b.command.target), !keeping.contains(b.command.target) else { return false }
      return b.command.isLamp || now(b.command) == b.command.on
    }
    for step in steps where !step.isLamp {
      let t = step.target
      // Refused, this press's own put-back: as it was, so the end never switches it (Fable, 17 Nov: unset, the end
      // undid a hand's change). An earlier press's keeps how that press left it.
      let left: Bool? = !missed.contains(t) ? step.on : uncertain.contains(t) ? (now(step) ?? step.on)
        : keeping.contains(t) ? nil : back.first(where: { $0.command.target == t })?.command.on
      if let left, let i = back.firstIndex(where: { $0.command.target == t }) {
        back[i].left = left
        back[i].guessed = uncertain.contains(t) && now(step) == nil ? true : nil
      }
    }
    if missed.isSuperset(of: steps.map(\.target)), back.isEmpty { ended = t }
  }

  /// What the end does with an outlet's put-back.
  public enum End: Sendable, Equatable {
    /// It reads as it goes back already: nothing to send.
    case already
    /// Switched by a hand or its schedule since this press left it, or made a heater: left as it is, and said so.
    case leave
    /// CO2 back on, which the phone never sends: left off, and said so.
    case hold
    /// Not read at the end: nothing sent, and it stays owed for Trả lại (Codex, 17 Nov: the phone sends no state it only
    /// guessed).
    case unread
    case send
  }

  /// What the end does with `b`, an outlet's put-back, by how the outlet reads now (`now`, nil when not read), how the
  /// last press to set it left it (`left`: `Back.left`) and the outlet's role now. One no
  /// longer as this press left it is left as it is, whatever an earlier press still owes for it: what goes back is the
  /// state from before both, and switching it would undo a hand's change.
  public static func end(_ b: Back, now: Bool?, left: Bool?, role: String?) -> End {
    let c = b.command
    if now == c.on { return .already }
    if let now, let left, now != left { return .leave }
    if c.on && (b.held == true || role == "co2") { return .hold }
    if role == "heater" { return .leave }
    if now == nil { return .unread }
    return .send
  }

  public var isRunning: Bool { ended == nil }
  /// What hasn't gone back yet.
  public var pending: [Back] { back.filter { !$0.done } }

  /// Seconds left at `now`, never below 0; nil when it ends on a tap.
  public func left(at now: Date) -> TimeInterval? { ends.map { max(0, $0.timeIntervalSince(now)) } }

  /// Ended by the clock, at `now`, and not yet marked so.
  public func isDue(at now: Date) -> Bool { isRunning && ends.map { now >= $0 } == true }
}
