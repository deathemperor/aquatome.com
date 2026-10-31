// Drives a real Chihiros light from a Mac through the same code as the iOS app (LightSession over ChihirosBLE; the
// simulator has no Bluetooth). A test tool, not a product. Run it from a terminal that has Bluetooth permission:
//
//   swift run light-harness scan | status | clock | restore
//   swift run light-harness write 13:00 19:00 15 40 50 60     on, off, ramp minutes, a level per channel
//   swift run light-harness level 0 30                         channel, level (manual mode: run restore after)
//   swift run light-harness clock-at 03:07                     a wrong clock, to check that `clock` fixes it
//
// `restore` writes the owner's everyday schedule back (12:00–20:00, 70% red/green/blue, 30-minute ramp) and checks
// the light reports it. Run it after every hands-on test. Light names here carry the device's address: never paste
// them into the repository.
import Chihiros
import ChihirosBLE
import Foundation

let ownersSchedule = Schedule(on: TimeOfDay(hour: 12, minute: 0), off: TimeOfDay(hour: 20, minute: 0), ramp: 30, levels: [70, 70, 70])

func hex(_ b: [UInt8]) -> String { b.map { String(format: "%02x", $0) }.joined(separator: " ") }

func describe(_ s: Snapshot, channels: Int) -> String {
  let points = s.points.map { "\($0.time) \($0.level)%" }.joined(separator: ", ")
  let sched = s.schedule(channels: channels).map { "\($0.on)–\($0.off), ramp \($0.ramp) min, \($0.levels)" } ?? "(not one everyday schedule)"
  return """
    firmware \(s.firmware)
    clock    weekday \(s.clock.weekday), \(s.clock.time)\(s.clock.isSet ? "" : " (not set)")
    points   \(points)
    schedule \(sched)
    """
}

@MainActor
func connect(_ bt: Bluetooth) async throws -> LightSession {
  let stream = try await bt.scan()
  let found = Task { @MainActor () -> FoundLight? in
    for await l in stream where Model.of(name: l.name) != nil { return l }
    return nil
  }
  Task { try? await Task.sleep(for: .seconds(8)); bt.stopScan() }
  guard let light = await found.value, let model = Model.of(name: light.name) else { throw BluetoothError.notFound }
  // A light that was just let go sometimes drops the next connection at once: try twice.
  let link: BLELink
  do { link = try await bt.connect(light) } catch BluetoothError.disconnected {
    try await Task.sleep(for: .seconds(1))
    link = try await bt.connect(light)
  }
  print("connected:", model.name)
  let session = LightSession(name: light.name, model: model, link: link)
  session.trace = { sent, b in print(sent ? "  >" : "  <", hex(b)) }
  return session
}

@MainActor
func run(_ args: [String]) async throws {
  let bt = Bluetooth()
  let cmd = args.first ?? ""
  if cmd == "scan" {
    let stream = try await bt.scan()
    Task { try? await Task.sleep(for: .seconds(8)); bt.stopScan() }
    var seen = Set<UUID>()
    for await l in stream where seen.insert(l.id).inserted { print(l.rssi, Model.of(name: l.name)?.name ?? "(not supported)") }
    return
  }
  guard ["status", "clock", "clock-at", "restore", "write", "level"].contains(cmd) else {
    print("usage: light-harness scan | status | clock | clock-at HH:MM | restore | write ON OFF RAMP LEVEL… | level CHANNEL LEVEL")
    exit(2)
  }
  let light = try await connect(bt)
  defer { light.disconnect() }
  let channels = light.model.channels.count
  switch cmd {
  case "status":
    print(describe(try await light.refresh(), channels: channels))
  case "clock":
    try await light.refresh()
    print(describe(try await light.syncClock(), channels: channels))
  case "clock-at":
    guard args.count == 2, let t = TimeOfDay(args[1]) else { print("clock-at HH:MM"); exit(2) }
    try await light.refresh()
    let wrong = Calendar.current.date(bySettingHour: t.hour, minute: t.minute, second: 0, of: Date())!
    print(describe(try await light.syncClock(now: wrong), channels: channels))
    print("the light's clock is now wrong on purpose: run clock")
  case "write":
    guard args.count >= 4 + channels, let on = TimeOfDay(args[1]), let off = TimeOfDay(args[2]), let ramp = Int(args[3]) else {
      print("write ON OFF RAMP LEVEL×\(channels)"); exit(2)
    }
    try await light.refresh()
    let s = Schedule(on: on, off: off, ramp: ramp, levels: args[4..<(4 + channels)].compactMap { Int($0) })
    let after = try await light.writeSchedule(s)
    print(describe(after, channels: channels))
    print(after.holds(s, channels: channels) ? "light reports the new schedule" : "LIGHT DOES NOT REPORT THE NEW SCHEDULE")
  case "level":
    guard args.count == 3, let ch = Int(args[1]), let lv = Int(args[2]) else { print("level CHANNEL LEVEL"); exit(2) }
    try await light.refresh()
    try await light.setLevel(channel: ch, level: lv)
    print("manual: channel \(ch) at \(lv)%. Run restore to go back to the schedule.")
  case "restore":
    try await light.refresh()
    let after = try await light.writeSchedule(ownersSchedule)
    print(describe(after, channels: channels))
    guard after.holds(ownersSchedule, channels: channels), after.schedule(channels: channels) == ownersSchedule else {
      print("RESTORE MISMATCH"); exit(1)
    }
    print("restored: 12:00–20:00, 70%, 30-minute ramp")
  default: break
  }
  try await Task.sleep(for: .milliseconds(300))
}

do { try await run(Array(CommandLine.arguments.dropFirst())) } catch { print("error:", error); exit(1) }
