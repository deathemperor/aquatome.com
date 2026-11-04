// Debug builds only (the kit's tests, the app's simulator builds): kept out of the App Store build.
#if DEBUG
import Chihiros

/// A Week Aqua light that isn't there, for tests and the simulator (which has no Bluetooth). It takes frames the way
/// the owner's three 5746 lights did in hands-on tests on 2026-11-03:
/// - levels show at once;
/// - a timer runs once manual mode follows it, and only if the clock was set before it on the same connection (one sent
///   after manual mode and the levels, with no clock first, never switched the light off);
/// - nothing comes back, whatever is sent.
@MainActor
public final class FakeWeekAqua: WeekAquaLink {
  public let advert: WeekAquaAdvert
  /// Every frame received, in order.
  public private(set) var sent: [[UInt8]] = []
  /// The levels the light shows.
  public private(set) var shown: WeekAquaLevels?
  /// The timer the light runs.
  public private(set) var timer: DailyTimer?
  /// Its clock as last set (hour, minute, second).
  public private(set) var clock: (hour: Int, minute: Int, second: Int)?
  public private(set) var isConnected = true
  /// Runs after each frame is taken (the simulator's light drops the connection on one, for a UI test).
  public var afterSend: (@MainActor ([UInt8]) -> Void)?

  private var pending: DailyTimer?

  public init(advert: WeekAquaAdvert = WeekAquaAdvert(code: WeekAquaAdvert.supportedCode, address: nil), shown: WeekAquaLevels? = nil,
              timer: DailyTimer? = nil) {
    self.advert = advert
    self.shown = shown
    self.timer = timer
  }

  public func send(_ f: [UInt8]) throws {
    guard isConnected else { throw FakeWeekAquaError.disconnected }
    sent.append(f)
    switch (f.first, f.dropFirst().first) {
    case (0xFF, _) where f.count == 8:
      clock = (Self.decimal(f[1]), Self.decimal(f[2]), Self.decimal(f[3]))
    case (0xFB, 0xF9) where f.count == 8:
      shown = WeekAquaLevels(f[2..<6].map(Int.init))
    case (0xFE, 0xF9) where f.count == 8 && clock != nil:
      pending = DailyTimer(on: TimeOfDay(hour: Self.decimal(f[2]), minute: Self.decimal(f[3])),
                           off: TimeOfDay(hour: Self.decimal(f[4]), minute: Self.decimal(f[5])))
    case (0xFD, 0xF1):
      if let p = pending { timer = p; pending = nil }
    default:
      break
    }
    afterSend?(f)
  }

  public func disconnect() { isConnected = false }

  private static func decimal(_ bcd: UInt8) -> Int { Int(bcd >> 4) * 10 + Int(bcd & 0x0F) }
}

public enum FakeWeekAquaError: Error { case disconnected }
#endif
