import Foundation
import Testing
@testable import FishLamp

// Every lamp command the app can send, through LampAirCore, hands Bluetooth the same bytes as the owner's recordings
// (the chief, 18 Nov). The bytes are read here straight from love-ecology.json and decoded from what the stand-in for
// CoreBluetooth was handed, never through `Command.uuids`. The app's own glue around it (BluetoothLampAir and its
// CBPeripheralManager) no test runs: only its lines are pinned, below.

/// apps/ios/AquaTomeKit/Tests/FishLampTests/this file → apps/ios.
private let ios = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent()
  .deletingLastPathComponent().deletingLastPathComponent()

/// The recordings, in the file's order, as the file has them.
private func recorded() throws -> [(id: String, bytes: [UInt8])] {
  let data = try Data(contentsOf: ios.appendingPathComponent("AquaTomeKit/Sources/FishLamp/love-ecology.json"))
  let file = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
  let commands = try #require(file["commands"] as? [[String: String]])
  return try commands.map { c in
    let id = try #require(c["id"])
    let bytes = try #require(c["sent"]).split(separator: " ").map { try #require(UInt8($0, radix: 16)) }
    return (id, bytes)
  }
}

/// A start as Bluetooth was handed it, back to its bytes: `004E`, then 11 UUIDs of 4 hex digits, low byte first. None
/// when it isn't that.
private func bytes(_ start: [String]) -> [UInt8] {
  guard start.count == 12, start.first == "004E" else { return [] }
  var out: [UInt8] = []
  for u in start.dropFirst() {
    guard u.count == 4, let v = UInt16(u, radix: 16) else { return [] }
    out += [UInt8(v & 0xFF), UInt8(v >> 8)]
  }
  return out
}

/// What Bluetooth was handed, start by start, for commands sent one after another as the app sends them: started, its
/// answer, then stopped (the lamp's card's three seconds, LampSender's for each recording).
@MainActor
private func handed(_ commands: [FishLamp.Command]) -> [[String]] {
  @MainActor final class Made { var all: [FakePeripheral] = [] }
  let made = Made()
  let core = LampAirCore(make: {
    let p = FakePeripheral(.on)
    made.all.append(p)
    return p
  })
  for c in commands {
    core.start(c.uuids, allowed: { true }, done: { _ in })
    if let p = made.all.last, p.answering() != nil { core.answered(p, started: true) }
    core.stop()
  }
  return made.all.flatMap(\.starts)
}

@MainActor @Test("Each of the lamp card's commands (off, on, each colour) goes to Bluetooth as recorded")
func theCardsCommandsGoAsRecorded() throws {
  let file = try recorded()
  #expect(FishLamp.loveEcology.map(\.id) == file.map(\.id), "a recording dropped or out of order")
  for c in FishLamp.loveEcology {
    let starts = handed([c])
    #expect(starts.count == 1 && starts.first.map(bytes) == file.first(where: { $0.id == c.id })?.bytes, Comment(rawValue: c.id))
  }
}

@MainActor @Test("The master button's off, on, and on then each colour go to Bluetooth as recorded, in that order")
func theButtonsCommandsGoAsRecorded() throws {
  let file = try recorded()
  // As LampSender.recordings has them (pinned below): off; on; on, then the colour. A colour without a recording fails
  // here (TanksTests checks the button's colours are the file's).
  let colours = file.map(\.id).filter { $0 != "off" && $0 != "on" }
  #expect(colours.count == 8)
  for ids in [["off"], ["on"]] + colours.map({ ["on", $0] }) {
    let commands = try ids.map { id in try #require(FishLamp.loveEcology.first { $0.id == id }, Comment(rawValue: id)) }
    let want = try ids.map { id in try #require(file.first { $0.id == id }?.bytes) }
    #expect(handed(commands).map(bytes) == want, Comment(rawValue: ids.joined(separator: "+")))
  }
}

@MainActor @Test("The card's trials go to Bluetooth as built, and its trial green as the recorded green")
func theTrialsGoAsBuilt() throws {
  // Built, not recorded: compared with their own bytes.
  for c in FishLamp.trials {
    #expect(handed([c]).map(bytes) == [c.sent], Comment(rawValue: c.id))
  }
  let green = try #require(try recorded().first { $0.id == "green" }?.bytes)
  #expect(handed([FishLamp.Command(id: "trial-green", sent: green)]).map(bytes) == [green])
}

@Test("The app hands the kit each command's own UUIDs, and nothing else reaches Bluetooth")
func theAppsLampGlueIsAsPinned() throws {
  let read = { (path: String) in try String(contentsOf: ios.appendingPathComponent(path), encoding: .utf8) }
  let lights = try read("AquaTome/Lights/LoveEcology.swift"), sender = try read("AquaTome/Master/LampSender.swift")
  let pinned: [(String, String)] = [
    (lights, "static let commands = FishLamp.loveEcology"),
    (lights, #"static let trials = FishLamp.trials + FishLamp.loveEcology.filter { $0.id == "green" }.map { FishLamp.Command(id: "trial-green", sent: $0.sent) }"#),
    (lights, "LampRadio.start(command.uuids, by: self)"),
    (lights, "core.start(uuids, allowed: allowed, done: done)"),
    (lights, "manager?.startAdvertising([CBAdvertisementDataServiceUUIDsKey: uuids.map { CBUUID(string: $0) }])"),
    (sender, #"let ids = !c.on ? ["off"] : ["on"] + (c.colour.map { [$0] } ?? [])"#),
    (sender, "return ids.compactMap { id in FishLamp.loveEcology.first { $0.id == id } }"),
    (sender, "LampRadio.start(r.uuids, by: self, allowed: allowed)"),
    (sender, "air.start(uuids, allowed: allowed, done: done)"),
  ]
  for (code, line) in pinned { #expect(code.components(separatedBy: line).count == 2, "not once: \(line)") }
  // The only ways to Bluetooth in the app: those above.
  let app = try FileManager.default.subpathsOfDirectory(atPath: ios.appendingPathComponent("AquaTome").path).filter { $0.hasSuffix(".swift") }
  var reaching: [String] = []
  for path in app {
    for line in try read("AquaTome/" + path).split(separator: "\n") where !line.trimmingCharacters(in: .whitespaces).hasPrefix("//") {
      for call in ["LampRadio.start(", "air.start(", "core.start(", "startAdvertising(", "CBPeripheralManager("] where line.contains(call) {
        reaching.append("\(path): \(call)")
      }
    }
  }
  #expect(reaching.sorted() == [
    "Lights/LoveEcology.swift: CBPeripheralManager(", "Lights/LoveEcology.swift: LampRadio.start(",
    "Lights/LoveEcology.swift: core.start(", "Lights/LoveEcology.swift: startAdvertising(",
    "Lights/LoveEcology.swift: startAdvertising(", "Master/LampSender.swift: LampRadio.start(",
    "Master/LampSender.swift: air.start(",
  ], "\(reaching.sorted())")
}
