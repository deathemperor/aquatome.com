import Foundation

/// A connection to one Week Aqua light: frames out, nothing back. `ChihirosBLE` makes one over CoreBluetooth, bound when
/// it connects to the one characteristic `WeekAquaGATT.writeCharacteristic` allows; `FakeWeekAqua` stands in for tests
/// and the simulator, which has no Bluetooth. A frame has nowhere else to go: there is no way to name another
/// characteristic, so the firmware-update service is never written to.
@MainActor
public protocol WeekAquaLink: AnyObject {
  /// What the light advertised: only a 5746 light is written to.
  var advert: WeekAquaAdvert { get }
  /// Sends one frame, without response (the light never acknowledges one). Throws once the link is gone, or when the
  /// light can't take it.
  func send(_ frame: [UInt8]) async throws
  func disconnect()
}

/// What the app writes to a light: its colour and its daily timer. The light can't report either, so this is also what
/// the app keeps as last sent.
public struct WeekAquaSetting: Sendable, Hashable {
  public var levels: WeekAquaLevels
  public var timer: DailyTimer
  public init(levels: WeekAquaLevels, timer: DailyTimer) { self.levels = levels; self.timer = timer }
}

public enum WeekAquaError: Error, Equatable {
  /// A light of a model code this app can't drive (it speaks another protocol), or of none it said: nothing is sent.
  case notSupported(String?)
  /// A session needs at least one light.
  case noLights
  /// These lights, by their place in the group, dropped during the write; the others took all of it.
  case notSent([Int])
}

/// Writing to one Week Aqua light, or to several as one group (the owner runs three so, as WEEK AQUA does), in the order
/// and pace the lights took in hands-on tests.
@MainActor
public final class WeekAquaSession {
  /// The pause after each frame: the light never acknowledges one, so this is all that spaces them. WEEK AQUA sends
  /// manual mode about half a second after the timer, and alokauz paces every frame so.
  public struct Pacing: Sendable {
    public var gap: Duration
    public init(gap: Duration) { self.gap = gap }
    public static let light = Pacing(gap: .milliseconds(500))
    public static let none = Pacing(gap: .zero)
  }

  /// Which manual-mode frame a write sends: the 8 bytes, unless a hands-on test asks for the 2 the research notes write.
  public enum Manual: Sendable {
    case eightBytes, twoBytes
    public var frame: [UInt8] { self == .eightBytes ? WeekAquaFrame.manual : WeekAquaFrame.manualTwoBytes }
  }

  public let lights: [WeekAquaLink]
  public let manual: Manual
  /// Every frame sent, with the light's place in the group, for diagnostics.
  public var trace: ((_ light: Int, _ frame: [UInt8]) -> Void)?

  private let pacing: Pacing
  private var tail: Task<Void, Never>?

  /// Refuses a group with a light that isn't a 5746 one: nothing is sent to any of them.
  public init(lights: [WeekAquaLink], pacing: Pacing = .light, manual: Manual = .eightBytes) throws {
    guard !lights.isEmpty else { throw WeekAquaError.noLights }
    if let other = lights.first(where: { !$0.advert.isSupported }) { throw WeekAquaError.notSupported(other.advert.code) }
    self.lights = lights
    self.pacing = pacing
    self.manual = manual
  }

  /// The frames of one write, in the only order the lights were seen to take: the clock, manual mode, the levels, the
  /// timer, manual mode again. Manual mode applies what was written before it; a timer sent after manual mode and the
  /// levels, without the clock first, didn't take. It's also how WEEK AQUA leaves a light. The frame WEEK AQUA sends
  /// on connecting whose meaning is unknown (`F9 55 …`) is left out.
  public nonisolated static func frames(_ s: WeekAquaSetting, now: Date, timeZone: TimeZone = .current,
                                        manual: Manual = .eightBytes) -> [[UInt8]] {
    [WeekAquaFrame.clock(now, timeZone: timeZone), manual.frame, WeekAquaFrame.levels(s.levels), WeekAquaFrame.timer(s.timer),
     manual.frame]
  }

  /// Writes `s` with the clock at `now`: each frame to every light in the group, within a moment of each other as WEEK
  /// AQUA does, then the pause, then the next. A light that drops is left out of the rest; the others get every frame,
  /// and the error names the ones that didn't.
  public func write(_ s: WeekAquaSetting, now: Date = Date(), timeZone: TimeZone = .current) async throws {
    try await exclusive {
      let frames = Self.frames(s, now: now, timeZone: timeZone, manual: self.manual)
      var dropped: [Int] = []
      for (n, frame) in frames.enumerated() {
        for (i, light) in self.lights.enumerated() where !dropped.contains(i) {
          do {
            try await light.send(frame)
            self.trace?(i, frame)
          } catch {
            dropped.append(i)
          }
        }
        if n < frames.count - 1, self.pacing.gap > .zero { try await Task.sleep(for: self.pacing.gap) }
      }
      if !dropped.isEmpty { throw WeekAquaError.notSent(dropped.sorted()) }
    }
  }

  public func disconnect() { for l in lights { l.disconnect() } }

  /// Writes run one at a time, each whole: a second waits for the first instead of landing inside its order.
  private func exclusive(_ body: @escaping @MainActor () async throws -> Void) async throws {
    let previous = tail
    let task = Task { () async throws -> Void in
      await previous?.value
      try await body()
    }
    tail = Task { _ = await task.result }
    try await task.value
  }
}
