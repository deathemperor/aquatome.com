import Foundation

// One device set one way (protocols/device-command.schema.json, checked against protocols/device-command-vectors.json):
// an outlet of a plug on one of the reader's tanks on or off, or the Love Ecology lamp on, in one of its recorded colours,
// or off. Each step of the master button is one, and so is what the chat asks the app to switch. The device is its record's
// id on the reader's tanks.

/// The Love Ecology lamp's record (kind "light"): the light the Fish lamp app drives by broadcast. It has no Bluetooth
/// name or address: the phone broadcasts to it and it answers nothing.
public let loveEcologyBrand = "loveecology"

/// A device record, and the outlet for a plug: what a command switches.
public struct DeviceTarget: Sendable, Hashable, Codable {
  public let device: String
  /// A plug's outlet (`PlugOutlet.code`); nil for the lamp.
  public let outlet: String?
  public init(device: String, outlet: String?) {
    self.device = device
    self.outlet = outlet
  }
}

public struct DeviceCommand: Sendable, Hashable, Codable {
  /// The device record's id.
  public var device: String
  /// A plug's outlet (`PlugOutlet.code`); nil for the lamp.
  public var outlet: String?
  public var on: Bool
  /// The lamp turned on: one of `colours`. None: it comes on as it was (the chat's: in the master button's colour).
  public var colour: String?

  public init(device: String, outlet: String? = nil, on: Bool, colour: String? = nil) {
    self.device = device
    self.outlet = outlet
    self.on = on
    self.colour = colour
  }

  /// The lamp's recorded colours, as its card names them.
  public static let colours = ["white", "red", "orange", "yellow", "green", "cyan", "blue", "magenta"]

  public var target: DeviceTarget { DeviceTarget(device: device, outlet: outlet) }
  public var isLamp: Bool { outlet == nil }

  /// Why it isn't a command the schema allows; nil when it is.
  public var problem: String? {
    if device.range(of: #"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"#, options: .regularExpression) == nil { return "device" }
    if let o = outlet, o.isEmpty || o.count > 40 { return "outlet" }
    guard let c = colour else { return nil }
    if !Self.colours.contains(c) { return "colour" }
    return outlet == nil && on ? nil : "colour"
  }

  /// What the chat may switch on the reader's tanks: the Love Ecology lamp, where the app offers it (`lamp`), and the
  /// outlets of Tuya plugs whose role is CO2 or a fan. Never a heater, a filter, an air pump, a light's outlet, another
  /// role, or an outlet with none: the wrong state of those can harm the fish, and the chat doesn't ask twice.
  public static func offerable(_ store: TankStore, lamp: Bool) -> [DeviceTarget] {
    var targets: [DeviceTarget] = []
    if lamp, let d = store.loveEcology { targets.append(DeviceTarget(device: d.id, outlet: nil)) }
    for p in store.liveDevices where p.kind == "plug" && p.brand == "tuya" {
      for o in p.outlets where o.role == "co2" || o.role == "fan" { targets.append(DeviceTarget(device: p.id, outlet: o.code)) }
    }
    return targets
  }
}

/// How one command went, said as the app shows it.
public enum SwitchResult: Sendable, Equatable, Codable {
  /// A plug reported the state asked for; the lamp's command went out (it answers nothing).
  case done
  /// Not done: why, in a line shown as it is (Vietnamese).
  case failed(String)

  private enum Keys: String, CodingKey { case ok, line }
  public init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: Keys.self)
    self = try c.decode(Bool.self, forKey: .ok) ? .done : .failed(c.decode(String.self, forKey: .line))
  }
  public func encode(to encoder: any Encoder) throws {
    var c = encoder.container(keyedBy: Keys.self)
    switch self {
    case .done: try c.encode(true, forKey: .ok)
    case .failed(let line):
      try c.encode(false, forKey: .ok)
      try c.encode(line, forKey: .line)
    }
  }
}

extension Device {
  public var isLoveEcology: Bool { kind == "light" && brand == loveEcologyBrand }
}

extension TankStore {
  /// The Love Ecology lamp kept on a tank, if it is.
  public var loveEcology: Device? { liveDevices.first { $0.isLoveEcology } }

  /// The Love Ecology lamp's record: the one kept, or a new one on the first tank (a new tank named `tankName` when there is
  /// none), so a command can name it.
  @discardableResult
  public mutating func keepLoveEcology(tankName: String, now: Date = Date()) throws -> Device {
    if let d = loveEcology { return d }
    let t = try ensureTank(name: tankName, now: now)
    return try addDevice(tankId: t.id, kind: "light", brand: loveEcologyBrand, model: "Love Ecology", now: now)
  }
}
