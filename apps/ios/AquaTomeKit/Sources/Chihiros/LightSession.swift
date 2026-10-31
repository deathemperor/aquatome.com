import Foundation

public enum SessionError: Error, Equatable {
  /// Firmware before 20 doesn't take schedules this way; the My Chihiros app can update it.
  case firmwareTooOld(Int)
  /// The light didn't send its status in time.
  case noStatus
}

/// Talking to one connected light: what it reports (firmware, clock, saved schedule) and the commands the app sends,
/// in the order and pace the light accepts (the same as the site's page).
@MainActor
public final class LightSession {
  /// Pauses after each acknowledged write: the light drops frames sent too close together.
  public struct Pacing: Sendable {
    public var gap: Duration
    public var scheduleGap: Duration
    public var statusTimeout: Duration
    /// Extra status reads after a schedule write, `scheduleGap` apart, until the light reports it.
    public var readbackTries: Int
    public static let light = Pacing(gap: .milliseconds(80), scheduleGap: .milliseconds(300), statusTimeout: .seconds(3), readbackTries: 10)
    public static let none = Pacing(gap: .zero, scheduleGap: .zero, statusTimeout: .seconds(1), readbackTries: 3)
  }

  public let name: String
  public let model: Model
  public private(set) var firmware: Int?
  /// The light's last status snapshot.
  public private(set) var snapshot: Snapshot?
  /// Whether the light is in manual mode because of this app (its schedule is paused until it is written again).
  public private(set) var isManual = false
  /// Every frame sent (`true`) and reply received (`false`), for diagnostics.
  public var trace: ((_ sent: Bool, _ bytes: [UInt8]) -> Void)?

  private let link: LightLink
  private let pacing: Pacing
  private var id: UInt16 = 0
  private var snapshots = 0
  private var tail: Task<Void, Never>?

  public init(name: String, model: Model, link: LightLink, pacing: Pacing = .light) {
    self.name = name
    self.model = model
    self.link = link
    self.pacing = pacing
    // Ends when the link does (its replies finish on disconnect).
    Task { [weak self, replies = link.replies] in
      for await r in replies { self?.receive(r) }
    }
  }

  public var canWriteSchedule: Bool { (firmware ?? 0) >= 20 }

  /// Asks for the status and waits for the snapshot (firmware, clock, saved schedule).
  @discardableResult
  public func refresh() async throws -> Snapshot {
    try await exclusive { try await self.readStatus() }
  }

  /// Replaces the light's saved schedules with `s` and sets its clock (the schedule runs on it), then reads the
  /// result back. Clock first, clear the old scenes, switch to the schedule, then the new setting. A WRGB II Slim
  /// sometimes still reports the cleared schedule right after the write, so the status is read until it shows `s`
  /// (`Snapshot.holds`) or the tries run out; the caller checks the snapshot returned.
  @discardableResult
  public func writeSchedule(_ s: Schedule, now: Date = Date()) async throws -> Snapshot {
    try await exclusive {
      if let firmware = self.firmware, firmware < 20 { throw SessionError.firmwareTooOld(firmware) }
      let channels = self.model.channels.count
      let gap = self.pacing.scheduleGap
      try await self.send({ Frame.setTime(now, id: $0) }, gap: gap)
      try await self.send({ Frame.setMode(Mode.sceneReset, id: $0) }, gap: gap)
      try await self.send({ Frame.setMode(Mode.scene, id: $0) }, gap: gap)
      try await self.send({ Frame.setSchedule(s, channels: channels, id: $0) }, gap: gap)
      self.isManual = false
      var snap = try await self.readStatus()
      for _ in 0..<self.pacing.readbackTries where !snap.holds(s, channels: channels) {
        try await Task.sleep(for: gap)
        snap = try await self.readStatus()
      }
      return snap
    }
  }

  /// Sets the light's clock to `now`, then reads it back.
  @discardableResult
  public func syncClock(now: Date = Date()) async throws -> Snapshot {
    try await exclusive {
      try await self.send { Frame.setTime(now, id: $0) }
      return try await self.readStatus()
    }
  }

  /// One channel's level right now. The light switches to manual mode and ignores its schedule until it is written again.
  public func setLevel(channel: Int, level: Int) async throws {
    try await exclusive {
      if !self.isManual {
        try await self.send { Frame.setMode(Mode.manual, id: $0) }
        self.isManual = true
      }
      try await self.send { Frame.setLevel(channel: channel, level: level, id: $0) }
    }
  }

  public func disconnect() { link.disconnect() }

  /// Commands run one at a time, each whole: a slider moved during a schedule write waits until the write is done,
  /// instead of landing between "clear the scenes" and the new schedule.
  private func exclusive<T: Sendable>(_ body: @escaping @MainActor () async throws -> T) async throws -> T {
    let previous = tail
    let task = Task { () async throws -> T in
      await previous?.value
      return try await body()
    }
    tail = Task { _ = await task.result }
    return try await task.value
  }

  /// One frame with the next id, acknowledged by the light, then a pause (it drops frames sent too close together).
  private func send(_ make: (UInt16) -> [UInt8], gap: Duration? = nil) async throws {
    id = Frame.nextId(after: id)
    let frame = make(id)
    trace?(true, frame)
    try await link.write(frame)
    let gap = gap ?? pacing.gap
    if gap > .zero { try await Task.sleep(for: gap) }
  }

  private func readStatus() async throws -> Snapshot {
    let before = snapshots
    try await send(Frame.askStatus)
    let deadline = ContinuousClock.now + pacing.statusTimeout
    while snapshots == before {
      guard ContinuousClock.now < deadline else { throw SessionError.noStatus }
      try await Task.sleep(for: .milliseconds(20))
    }
    return snapshot!
  }

  private func receive(_ reply: [UInt8]) {
    trace?(false, reply)
    if let f = Reply.firmware(reply) { firmware = f }
    if let s = Snapshot(reply) {
      snapshot = s
      snapshots += 1
    }
  }
}
