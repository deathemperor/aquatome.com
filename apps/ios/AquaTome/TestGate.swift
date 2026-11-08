import Foundation

/// A wait the UI tests move on themselves, so a flow doesn't race the Mac's speed: with `-test-gates DIR` (debug builds),
/// it ends when the test writes DIR/NAME, however long the test's own steps took, rather than after its time. Otherwise,
/// and in release builds, it's the time. Cancelled, it throws, as `Task.sleep` does.
enum TestGate {
  static func wait(_ name: String, or time: Duration) async throws {
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    if let i = args.firstIndex(of: "-test-gates"), i + 1 < args.count {
      // The simulator runs on the Mac, so the app sees the test's own folder.
      let file = URL(fileURLWithPath: args[i + 1]).appending(path: name).path
      while !FileManager.default.fileExists(atPath: file) { try await Task.sleep(for: .milliseconds(100)) }
      return
    }
    #endif
    try await Task.sleep(for: time)
  }
}
