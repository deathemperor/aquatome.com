import XCTest

/// The app's waits the test moves on itself (`TestGate`): a folder of its own, where opening one writes its file. Shared
/// by the flows that hold one, so its own file (flow_lists.py names them in its row: a flow's file is its class's alone).
struct Gates {
  let path = FileManager.default.temporaryDirectory.appending(path: "gates-\(UUID().uuidString)").path

  init() { try? FileManager.default.createDirectory(atPath: path, withIntermediateDirectories: true) }

  func open(_ name: String) {
    XCTAssertTrue(FileManager.default.createFile(atPath: (path as NSString).appendingPathComponent(name), contents: Data()), "gate \(name) not opened")
  }
}
