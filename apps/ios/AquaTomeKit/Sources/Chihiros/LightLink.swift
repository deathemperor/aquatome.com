/// A connection to one light: frames out, replies (notifications) in. `ChihirosBLE` makes one over CoreBluetooth;
/// `FakeLight` stands in for tests and the simulator, which has no Bluetooth.
@MainActor
public protocol LightLink: AnyObject {
  /// Every notification the light sends, in order.
  var replies: AsyncStream<[UInt8]> { get }
  /// Sends one frame and returns once the light has acknowledged it.
  func write(_ frame: [UInt8]) async throws
  func disconnect()
}
