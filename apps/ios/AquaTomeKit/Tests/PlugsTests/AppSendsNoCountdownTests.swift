import Foundation
import Testing

/// No path in the app sends a plug's countdown (the chief, 17 Nov): a Tuya countdown switches the outlet the other way
/// at 0, whatever it is then, with or without the phone. The owner's test of one is gone from the app; it comes back,
/// rebuilt, only with the CO2-on work. The kit keeps `PlugSource.countdown` for that; the app's own code
/// (apps/ios/AquaTome) calls none.
@Test("The app's code sends no plug countdown")
func theAppSendsNoCountdown() throws {
  // apps/ios/AquaTomeKit/Tests/PlugsTests/this file → apps/ios/AquaTome.
  let app = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    .deletingLastPathComponent().appendingPathComponent("AquaTome")
  let files = (FileManager.default.enumerator(at: app, includingPropertiesForKeys: nil)?.compactMap { $0 as? URL } ?? [])
    .filter { $0.pathExtension == "swift" }
  // The app's code is where it should be: a check that read nothing would pass whatever it holds.
  #expect(files.count > 20, "read \(files.count) files under \(app.path)")
  let calls = try files.flatMap { f in
    try String(contentsOf: f, encoding: .utf8).split(separator: "\n", omittingEmptySubsequences: false).enumerated()
      .filter { $0.element.contains(".countdown(") }
      .map { "\(f.lastPathComponent):\($0.offset + 1)" }
  }
  #expect(calls.isEmpty, "a plug countdown sent from \(calls)")
}
