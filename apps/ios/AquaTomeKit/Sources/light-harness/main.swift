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
//
// Week Aqua lights, model code 5746 only (any other code is listed, never connected to or written):
//
//   swift run light-harness weekaqua scan                              model codes and the end of each address
//   swift run light-harness weekaqua write 54 114 57 117 02:50 02:40   red, green, blue, UV (0–235), on, off
//   swift run light-harness weekaqua write … --manual-bytes 2          manual mode as `FD F1` alone, not 8 bytes
//
// `write` sends to every 5746 light found, as one group, in the order the lights take: clock, manual mode, levels,
// timer, manual mode. They report nothing back: watch them. Put the owner's group back as WEEK AQUA leaves it with
// `weekaqua write 54 114 57 117 02:50 02:40`.
//
// The owner's Love Ecology light, by broadcast: `swift run light-harness fishlamp …` (FishLampAir.swift).
import Chihiros
import ChihirosBLE
import Foundation
import WeekAqua

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
  let cmd = args.first ?? ""
  if cmd == "fishlamp" { return try await fishLamp(Array(args.dropFirst())) }
  let bt = Bluetooth()
  if cmd == "scan" {
    let stream = try await bt.scan()
    Task { try? await Task.sleep(for: .seconds(8)); bt.stopScan() }
    var seen = Set<UUID>()
    for await l in stream where l.weekAqua == nil && seen.insert(l.id).inserted { print(l.rssi, Model.of(name: l.name)?.name ?? "(not supported)") }
    return
  }
  if cmd == "weekaqua" { return try await weekAqua(bt, Array(args.dropFirst())) }
  guard ["status", "clock", "clock-at", "restore", "write", "level"].contains(cmd) else {
    print("usage: light-harness scan | status | clock | clock-at HH:MM | restore | write ON OFF RAMP LEVEL… | level CHANNEL LEVEL")
    print("       light-harness weekaqua scan | weekaqua write R G B UV ON OFF [--manual-bytes 2|8]")
    print("       light-harness fishlamp --log FILE STEP… | fishlamp --dry STEP…")
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

/// The end of a Week Aqua light's address ("…E5:F6"), enough to tell the owner's lights apart without printing it whole.
func tail(_ l: FoundLight) -> String { l.weekAqua?.addressText.map { "…" + $0.suffix(5) } ?? "(no address)" }

@MainActor
func weekAqua(_ bt: Bluetooth, _ args: [String]) async throws {
  let sub = args.first ?? ""
  guard sub == "scan" || sub == "write" else { print("weekaqua scan | weekaqua write R G B UV ON OFF [--manual-bytes 2|8]"); exit(2) }
  var setting: WeekAquaSetting?
  var manual = WeekAquaSession.Manual.eightBytes
  if sub == "write" {
    var rest = Array(args.dropFirst())
    if let i = rest.firstIndex(of: "--manual-bytes") {
      guard i + 1 < rest.count, ["2", "8"].contains(rest[i + 1]) else { print("--manual-bytes 2 or 8"); exit(2) }
      manual = rest[i + 1] == "2" ? .twoBytes : .eightBytes
      rest.removeSubrange(i...(i + 1))
    }
    guard rest.count == 6, let levels = WeekAquaLevels(rest[0..<4].compactMap { Int($0) }), let on = TimeOfDay(rest[4]),
          let off = TimeOfDay(rest[5]) else {
      print("weekaqua write R G B UV ON OFF: four levels 0–235, then HH:MM twice"); exit(2)
    }
    if on == off { print("on equal to off (seventh byte 24) is untried on the lights: watch whether they stay on all day") }
    setting = WeekAquaSetting(levels: levels, timer: DailyTimer(on: on, off: off))
  }
  let stream = try await bt.scan()
  Task { try? await Task.sleep(for: .seconds(8)); bt.stopScan() }
  var found: [FoundLight] = []
  for await l in stream where l.weekAqua != nil && !found.contains(where: { $0.id == l.id }) { found.append(l) }
  for l in found {
    let a = l.weekAqua!
    print(l.rssi, a.code ?? "(no code)", a.isSupported ? "supported" : "not supported: never written to", tail(l))
  }
  guard let setting else { return }
  // Only 5746 lights; `connectWeekAqua` and the session refuse any other too.
  let group = found.filter { $0.weekAqua?.isSupported == true }
  guard !group.isEmpty else { print("no 5746 light found"); exit(1) }
  var links: [WeekAquaBLELink] = []
  defer { links.forEach { $0.disconnect() } }
  for l in group {
    // A light that was just let go sometimes drops the next connection at once: try twice.
    do { links.append(try await bt.connectWeekAqua(l)) } catch BluetoothError.disconnected {
      try await Task.sleep(for: .seconds(1))
      links.append(try await bt.connectWeekAqua(l))
    }
    print("connected:", tail(l))
  }
  let session = try WeekAquaSession(lights: links, manual: manual)
  session.trace = { i, f in print("  >", tail(group[i]), hex(f)) }
  try await session.write(setting)
  print("written to \(group.count) light(s), manual mode as \(manual == .twoBytes ? 2 : 8) bytes. They report nothing: check by eye.")
  try await Task.sleep(for: .milliseconds(300))
}

do { try await run(Array(CommandLine.arguments.dropFirst())) } catch { print("error:", error); exit(1) }
