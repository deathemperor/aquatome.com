import Foundation

// A smart plug kept on a tank (docs/smart-plugs.md): `kind: "plug"`, `brand` the maker (`tuya`, `ewelink`), `remoteId`
// the maker's id for the device, and the outlets named on the tank. Their state (on, off, online) is never stored here:
// it comes from the server each time.

/// One outlet of a plug on a tank: the maker's switch code, what it powers (`Known.outletRole`, open) and the reader's
/// name for it. Its other keys (a newer client's) stay when it is edited.
public struct PlugOutlet: Sendable, Equatable, Identifiable {
  public var json: Object
  public init(json: Object) { self.json = json }
  public init(code: String, label: String? = nil) {
    json = ["code": .string(code)]
    self.label = label
  }

  public var id: String { code }
  public var code: String { json["code"]?.string ?? "" }
  public var role: String? {
    get { json["role"]?.string }
    set { json["role"] = newValue.map(JSON.string) }
  }
  public var label: String? {
    get { json["label"]?.string }
    set { json["label"] = newValue.map(JSON.string) }
  }
}

extension Device {
  /// Plugs: the maker's id for the device (the server's plug `id`).
  public var remoteId: String? { string("remoteId") }
  /// Plugs: the outlets named on this tank, in the maker's order.
  public var outlets: [PlugOutlet] {
    get { (json["outlets"]?.array ?? []).compactMap { $0.object.map(PlugOutlet.init(json:)) } }
    set { json["outlets"] = .array(newValue.map { .object($0.json) }) }
  }
}

extension TankStore {
  /// Live plugs on this tank.
  public func plugs(in tankId: String) -> [Device] { devices(in: tankId).filter { $0.kind == "plug" } }

  /// The plug with this maker's id on any live tank: a strip is on one tank.
  public func plug(brand: String, remoteId: String) -> Device? {
    liveDevices.first { $0.kind == "plug" && $0.brand == brand && $0.remoteId == remoteId }
  }

  /// The role the master button goes by for one outlet of a plug. A strip saved twice (two phones each adding it, or a
  /// copy a sync brought back) has two records, each with its own roles, and a record may list a code twice: any entry
  /// with the code on any live record of the same strip (maker, maker's id) that marks the outlet a heater makes it one,
  /// else any that marks it CO2; otherwise the record's own role, its first entry's (the chief, 18 Nov). Nil for a
  /// device that isn't live.
  public func strictestRole(device id: String, outlet code: String) -> String? {
    guard let d = device(id) else { return nil }
    let own = d.outlets.first { $0.code == code }?.role
    let copies = d.kind == "plug" && d.brand != nil && d.remoteId != nil
      ? liveDevices.filter { $0.kind == "plug" && $0.brand == d.brand && $0.remoteId == d.remoteId } : [d]
    let roles = copies.flatMap { $0.outlets.filter { $0.code == code }.compactMap(\.role) }
    if roles.contains("heater") { return "heater" }
    if roles.contains("co2") { return "co2" }
    return own
  }

  /// Puts one of the account's plugs on a tank: named as in the maker's app, with its outlets by code, each labelled
  /// with the maker's name for it when it has one. Names are trimmed and cut to the record's lengths; a blank one is
  /// left out.
  @discardableResult
  public mutating func addPlug(tankId: String, brand: String, remoteId: String, name: String,
                               outlets: [(code: String, name: String?)], now: Date = Date()) throws -> Device {
    var s = self
    var d = try s.addDevice(tankId: tankId, kind: "plug", brand: brand, now: now)
    d.set("remoteId", remoteId)
    d.nickname = Self.fitted(name, 80)
    d.outlets = outlets.map { PlugOutlet(code: $0.code, label: $0.name.flatMap { Self.fitted($0, 40) }) }
    try Self.check(Validate.device(.object(d.json)))
    s.devices[s.devices.count - 1] = d.json
    self = s
    return d
  }

  /// Trimmed and cut to `max` characters (Unicode scalars, as the store counts them); nil when nothing is left.
  static func fitted(_ s: String, _ max: Int) -> String? {
    let t = trim(String(String.UnicodeScalarView(trim(s).unicodeScalars.prefix(max))))
    return t.isEmpty ? nil : t
  }
}
