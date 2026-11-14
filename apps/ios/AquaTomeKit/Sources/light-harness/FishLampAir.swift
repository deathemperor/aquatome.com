@preconcurrency import CoreBluetooth
import FishLamp
import Foundation

// The owner's Love Ecology light, which the Fish lamp app drives by broadcast (docs/research/aquarium-device-control.md):
//
//   swift run light-harness fishlamp --log FILE [--seconds 3] [--after 2] STEP…
//   swift run light-harness fishlamp --dry STEP…                     the bytes and UUIDs only: nothing is sent
//
// STEP: rec:ID              a recording played back (off, on, white, red, orange, yellow, green, cyan, blue, magenta)
//       colour:B0:H,S,V      a colour built anew: hue, saturation, value as 4 hex digits each
//       on:B0:zeros|recorded, off:B0:zeros|recorded   an on or off built anew, bytes 16–19 zero or as recorded
// B0 is plain byte 0 in hex. A built step takes bytes 1–7 (from the phone, to light 3, the app's ID) from the recording
// of `on`, and gets the checksum. Each step is broadcast for `--seconds`, as the phone does, and listened to for
// `--after` more: the light's echo (its bytes 0–19 back with byte 1 = 06) means it took the command. Every frame under
// company ID 0x004E goes to the log as JSON lines, without the sender's address. Nothing to the light without the
// owner's yes: it can't say what it shows, so ask them first what it shows and put that back at the end.

struct LampStep {
  let label: String
  let command: FishLamp.Command
}

func lampSteps(_ specs: [String]) -> [LampStep]? {
  let rec = { (id: String) in FishLamp.loveEcology.first { $0.id == id } }
  guard let on = rec("on"), let off = rec("off") else { return nil }
  let head = Array(on.plain[1..<8])
  let steps = specs.map { spec -> LampStep? in
    let parts = spec.split(separator: ":").map(String.init)
    switch parts.first {
    case "rec":
      guard parts.count == 2, let c = rec(parts[1]) else { return nil }
      return LampStep(label: spec, command: c)
    case "colour":
      let hsv = parts.count == 3 ? parts[2].split(separator: ",").compactMap { UInt16($0, radix: 16) } : []
      guard hsv.count == 3, let b0 = UInt8(parts[1], radix: 16) else { return nil }
      let plain = [b0] + head + [0x02, 0x07] + hsv.flatMap { [UInt8($0 >> 8), UInt8($0 & 0xFF)] } + [0, 0, 0, 0]
      return FishLamp.built(id: spec, plain).map { LampStep(label: spec, command: $0) }
    case "on", "off":
      guard parts.count == 3, let b0 = UInt8(parts[1], radix: 16), ["zeros", "recorded"].contains(parts[2]) else { return nil }
      let r = parts[0] == "on" ? on : off
      let plain = [b0] + head + Array(r.plain[8..<16]) + (parts[2] == "zeros" ? [0, 0, 0, 0] : Array(r.plain[16..<20]))
      return FishLamp.built(id: spec, plain).map { LampStep(label: spec, command: $0) }
    default:
      return nil
    }
  }
  return steps.allSatisfy { $0 != nil } ? steps.compactMap { $0 } : nil
}

/// The Mac's Bluetooth: broadcasting as Fish lamp does, and hearing what comes back under company ID 0x004E.
@MainActor
final class LampRadio: NSObject {
  private var peripheral: CBPeripheralManager?
  private var central: CBCentralManager?
  /// A frame heard: its signal strength and the bytes after the company ID.
  var heard: (@MainActor (Int, [UInt8]) -> Void)?

  /// Nil once both are on, or why not.
  func ready() async -> String? {
    peripheral = CBPeripheralManager(delegate: self, queue: nil)
    central = CBCentralManager(delegate: self, queue: nil)
    for _ in 0..<50 {
      if peripheral?.state == .poweredOn, central?.state == .poweredOn { return nil }
      if [CBManagerState.poweredOff, .unauthorized, .unsupported].contains(where: { $0 == peripheral?.state || $0 == central?.state }) { break }
      try? await Task.sleep(for: .milliseconds(100))
    }
    return "Bluetooth isn't on, or this terminal may not use it"
  }

  func advertise(_ uuids: [String]) {
    peripheral?.stopAdvertising()
    peripheral?.startAdvertising([CBAdvertisementDataServiceUUIDsKey: uuids.map { CBUUID(string: $0) }])
  }

  func stopAdvertising() { peripheral?.stopAdvertising() }
  func listen() { central?.scanForPeripherals(withServices: nil, options: [CBCentralManagerScanOptionAllowDuplicatesKey: true]) }
  func stopListening() { central?.stopScan() }
}

extension LampRadio: @preconcurrency CBPeripheralManagerDelegate {
  func peripheralManagerDidUpdateState(_ manager: CBPeripheralManager) {}
  func peripheralManagerDidStartAdvertising(_ manager: CBPeripheralManager, error: Error?) {
    if let error { print("  broadcast failed:", error.localizedDescription) }
  }
}

extension LampRadio: @preconcurrency CBCentralManagerDelegate {
  func centralManagerDidUpdateState(_ manager: CBCentralManager) {}
  func centralManager(_ manager: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi: NSNumber) {
    guard let d = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data, d.count > 2,
          d[d.startIndex] == 0x4E, d[d.startIndex + 1] == 0x00 else { return }
    heard?(rssi.intValue, Array(d.dropFirst(2)))
  }
}

@MainActor
func fishLamp(_ args: [String]) async throws {
  var rest = args
  func option(_ name: String) -> String? {
    guard let i = rest.firstIndex(of: name), i + 1 < rest.count else { return nil }
    defer { rest.removeSubrange(i...(i + 1)) }
    return rest[i + 1]
  }
  let dry = rest.contains("--dry")
  rest.removeAll { $0 == "--dry" }
  let log = option("--log")
  let seconds = Double(option("--seconds") ?? "3") ?? 3
  let after = Double(option("--after") ?? "2") ?? 2
  guard let steps = lampSteps(rest), !steps.isEmpty, dry || log != nil else {
    print("usage: light-harness fishlamp --log FILE [--seconds 3] [--after 2] STEP… | fishlamp --dry STEP…")
    print("STEP: rec:ID | colour:B0:H,S,V | on:B0:zeros|recorded | off:B0:zeros|recorded")
    exit(2)
  }
  for s in steps { print(s.label, "| plain", hex(s.command.plain), "| uuids", s.command.uuids.joined(separator: " ")) }
  if dry { return print("--dry: nothing sent") }

  let radio = LampRadio()
  if let why = await radio.ready() { print(why); exit(1) }
  FileManager.default.createFile(atPath: log!, contents: nil)
  guard let file = FileHandle(forWritingAtPath: log!) else { print("can't write", log!); exit(1) }
  defer { try? file.close() }
  var current: LampStep?
  var echoes = 0
  radio.heard = { rssi, sent in
    let plain = FishLamp.unscramble(sent)
    let line: [String: Any] = ["at": ISO8601DateFormatter().string(from: Date()), "step": current?.label ?? "", "rssi": rssi,
                               "sent": hex(sent), "plain": hex(plain)]
    if let data = try? JSONSerialization.data(withJSONObject: line, options: [.sortedKeys]) { file.write(data + Data([0x0A])) }
    guard let ours = current?.command.plain, plain.count >= 20 else { return }
    if plain[0] == ours[0], plain[1] == 0x06, plain[2..<20] == ours[2..<20] { echoes += 1 }
  }
  radio.listen()
  for s in steps {
    current = s
    echoes = 0
    radio.advertise(s.command.uuids)
    try await Task.sleep(for: .seconds(seconds))
    radio.stopAdvertising()
    try await Task.sleep(for: .seconds(after))
    print(s.label + ":", echoes > 0 ? "echo heard (\(echoes) frames)" : "no echo")
  }
  radio.stopListening()
}
