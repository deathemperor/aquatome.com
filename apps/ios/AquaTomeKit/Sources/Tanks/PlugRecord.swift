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
