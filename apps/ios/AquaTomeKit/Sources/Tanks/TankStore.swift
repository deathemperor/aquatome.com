import Foundation

// "Bể của tôi" (My tanks) on the phone: the same records as the site (packages/schema/src/tanks.ts), merged the same way
// (docs/my-tanks-sync.md), checked against protocols/tanks-vectors.json. Records are JSON objects underneath, so keys a
// newer client wrote survive this app saving the record again; the typed properties read and write those objects.

public let storeVersion = 1
/// Live records a reader can make here; a merge (signing in) can go past them.
public let maxTanks = 50
public let maxDevices = 100

/// Values the site writes today. The fields are open strings: a value added later is shown as it is and kept.
public enum Known {
  public static let substrate = ["soil", "sand", "gravel", "lava", "bare", "other"]
  public static let deviceKind = ["light", "plug"]
  public static let brand = ["chihiros", "tuya", "ewelink"]
  /// What a plug's outlet powers (docs/smart-plugs.md).
  public static let outletRole = ["light", "co2", "filter", "heater", "air", "fan", "other"]
}

/// A new record id: a lowercase UUID.
public func newRecordId() -> String { UUID().uuidString.lowercased() }

public typealias Object = [String: JSON]

/// A record of either kind, live or a tombstone, as its JSON object.
public protocol Record: Sendable, Equatable, Identifiable {
  var json: Object { get set }
  init(json: Object)
}

extension Record {
  public var id: String { json["id"]?.string ?? "" }
  public var updatedAt: String { json["updatedAt"]?.string ?? "" }
  public var isTombstone: Bool { json["deletedAt"]?.string != nil }

  func string(_ k: String) -> String? { json[k]?.string }
  /// Sets or, for nil, removes a key: an absent value is left out, never written as null.
  mutating func set(_ k: String, _ v: JSON?) { json[k] = v }
  mutating func set(_ k: String, _ s: String?) { json[k] = s.map(JSON.string) }
}

/// A light's saved schedule: on, off, the sunrise/sunset ramp, and levels in the light's channel order.
public struct SavedSchedule: Sendable, Equatable, Identifiable {
  public var json: Object
  public init(json: Object) { self.json = json }
  public init(id: String = newRecordId(), name: String? = nil, on: String, off: String, ramp: Int, levels: [Int], savedAt: String) {
    json = ["id": .string(id), "on": .string(on), "off": .string(off), "ramp": .number(Double(ramp)),
            "levels": .array(levels.map { .number(Double($0)) }), "savedAt": .string(savedAt)]
    if let name { json["name"] = .string(name) }
  }
  public var id: String { json["id"]?.string ?? "" }
  public var name: String? { json["name"]?.string }
  public var on: String { json["on"]?.string ?? "" }
  public var off: String { json["off"]?.string ?? "" }
  public var ramp: Int { json["ramp"]?.int ?? 0 }
  public var levels: [Int] { json["levels"]?.array?.compactMap(\.int) ?? [] }
  public var savedAt: String { json["savedAt"]?.string ?? "" }
}

public struct Tank: Record {
  public var json: Object
  public init(json: Object) { self.json = json }

  public var name: String {
    get { string("name") ?? "" }
    set { set("name", newValue) }
  }
  /// Inside length × width × height, cm. Setting it keeps any other key inside `dims`.
  public var dims: (l: Double, w: Double, h: Double)? {
    get {
      guard let d = json["dims"]?.object, let l = d["l"]?.number, let w = d["w"]?.number, let h = d["h"]?.number else { return nil }
      return (l, w, h)
    }
    set {
      guard let newValue else { return json["dims"] = nil }
      var d = json["dims"]?.object ?? [:]
      d["l"] = .number(newValue.l); d["w"] = .number(newValue.w); d["h"] = .number(newValue.h)
      json["dims"] = .object(d)
    }
  }
  public var litres: Double? {
    get { json["litres"]?.number }
    set { set("litres", newValue.map(JSON.number)) }
  }
  public var substrate: String? {
    get { string("substrate") }
    set { set("substrate", newValue) }
  }
  public var notes: String? {
    get { string("notes") }
    set { set("notes", newValue) }
  }
  /// Fish by page id, with how many.
  public var species: [(id: String, count: Int?)] {
    get { (json["species"]?.array ?? []).compactMap { e in e.object?["id"]?.string.map { ($0, e.object?["count"]?.int) } } }
    set { json["species"] = .array(Self.entries(json["species"], newValue.map { ($0.id, $0.count.map { JSON.number(Double($0)) }) }, extra: "count")) }
  }
  /// Plants by page id.
  public var plants: [String] {
    get { (json["plants"]?.array ?? []).compactMap { $0.object?["id"]?.string } }
    set { json["plants"] = .array(Self.entries(json["plants"], newValue.map { ($0, nil) }, extra: nil)) }
  }
  public var createdAt: String { string("createdAt") ?? "" }

  /// Litres: its own figure, else the box of its dimensions.
  public var totalLitres: Double? { litres ?? dims.map { $0.l * $0.w * $0.h / 1000 } }

  /// The new list, reusing each id's old entry so its other keys stay.
  private static func entries(_ old: JSON?, _ new: [(String, JSON?)], extra: String?) -> [JSON] {
    let byId = Dictionary((old?.array ?? []).compactMap { e in e.object.flatMap { o in o["id"]?.string.map { ($0, o) } } }, uniquingKeysWith: { a, _ in a })
    return new.map { id, value in
      var o = byId[id] ?? [:]
      o["id"] = .string(id)
      if let extra { o[extra] = value }
      return .object(o)
    }
  }
}

public struct Device: Record {
  public var json: Object
  public init(json: Object) { self.json = json }

  public var tankId: String {
    get { string("tankId") ?? "" }
    set { set("tankId", newValue) }
  }
  public var kind: String { string("kind") ?? "" }
  public var brand: String? { string("brand") }
  public var model: String? {
    get { string("model") }
    set { set("model", newValue) }
  }
  /// The Bluetooth name the light advertises: a Chihiros light's model goes by its prefix.
  public var bleName: String? { string("bleName") }
  public var nickname: String? {
    get { string("nickname") }
    set { set("nickname", newValue) }
  }
  public var schedules: [SavedSchedule] {
    get { (json["schedules"]?.array ?? []).compactMap { $0.object.map(SavedSchedule.init(json:)) } }
    set { json["schedules"] = .array(newValue.map { .object($0.json) }) }
  }
  /// The saved schedule last written to the light.
  public var activeScheduleId: String? {
    get { string("activeScheduleId") }
    set { set("activeScheduleId", newValue) }
  }
  /// The levels last set by hand (a light can't report them).
  public var manual: (levels: [Int], at: String)? {
    get {
      guard let m = json["manual"]?.object, let at = m["at"]?.string else { return nil }
      return ((m["levels"]?.array ?? []).compactMap(\.int), at)
    }
    set {
      guard let newValue else { return json["manual"] = nil }
      var m = json["manual"]?.object ?? [:]
      m["levels"] = .array(newValue.levels.map { .number(Double($0)) })
      m["at"] = .string(newValue.at)
      json["manual"] = .object(m)
    }
  }
  public var clockSyncedAt: String? {
    get { string("clockSyncedAt") }
    set { set("clockSyncedAt", newValue) }
  }
}

public enum TankStoreError: Error, Equatable {
  /// A store of a version this app doesn't know: kept as it is, not edited or synced.
  case unknownVersion
  case notAStore
  case tooManyTanks
  case tooManyDevices
  /// A name with nothing besides spaces.
  case blankName
  case notFound
  /// The change would make a record the schema refuses (and the server would too): the store is left as it was.
  case invalid([Problem])
}

/// One reader's tanks and devices: what the phone keeps, and what sync sends and returns.
public struct TankStore: Sendable, Equatable {
  /// The store's own object (`v`, and any key a newer client added).
  public private(set) var json: Object
  public internal(set) var tanks: [Object]
  public internal(set) var devices: [Object]

  public init() { json = ["v": .number(Double(storeVersion))]; tanks = []; devices = [] }

  /// A store read from disk or the server. Records that don't pass the schema are kept as they are (and saved again)
  /// but not shown; a store of another version, or with an entry that isn't an object, is refused, so it isn't overwritten.
  public init(_ value: JSON) throws {
    guard let o = value.object else { throw TankStoreError.notAStore }
    guard o["v"] == .number(Double(storeVersion)) else { throw TankStoreError.unknownVersion }
    guard let t = o["tanks"]?.array, let d = o["devices"]?.array else { throw TankStoreError.notAStore }
    let tanks = t.compactMap(\.object), devices = d.compactMap(\.object)
    guard tanks.count == t.count, devices.count == d.count else { throw TankStoreError.notAStore }
    json = o
    // A list holding an id twice (it shouldn't) is read as the merge would keep it, so an edit changes the copy shown.
    self.tanks = Self.hasRepeats(tanks) ? Self.mergeRecords(tanks, []) : tanks
    self.devices = Self.hasRepeats(devices) ? Self.mergeRecords(devices, []) : devices
  }

  public init(data: Data) throws { try self.init(JSON.parse(data)) }

  public var value: JSON {
    var o = json
    o["v"] = .number(Double(storeVersion))
    o["tanks"] = .array(tanks.map(JSON.object))
    o["devices"] = .array(devices.map(JSON.object))
    return .object(o)
  }

  public func data() throws -> Data { try value.data() }

  // MARK: What the app shows

  /// Live tanks that pass the schema, in the order they were made.
  public var liveTanks: [Tank] {
    tanks.filter { Validate.tank(.object($0)).isEmpty }.map(Tank.init(json:)).sorted { ($0.createdAt, $0.id) < ($1.createdAt, $1.id) }
  }

  /// Live devices on live tanks (a device can arrive before its tank, or outlive it elsewhere: then it isn't shown).
  public var liveDevices: [Device] {
    let tankIds = Set(liveTanks.map(\.id))
    return devices.filter { Validate.device(.object($0)).isEmpty }.map(Device.init(json:)).filter { tankIds.contains($0.tankId) }
  }

  public func devices(in tankId: String) -> [Device] { liveDevices.filter { $0.tankId == tankId } }

  public func tank(_ id: String) -> Tank? { liveTanks.first { $0.id == id } }
  public func device(_ id: String) -> Device? { liveDevices.first { $0.id == id } }

  // MARK: Edits (each stamped: docs/my-tanks-sync.md, "Writing")
  // The limits count the records shown: live ones that pass the schema (a record hidden for failing it isn't counted).

  @discardableResult
  public mutating func addTank(name: String, now: Date = Date()) throws -> Tank {
    guard liveTanks.count < maxTanks else { throw TankStoreError.tooManyTanks }
    let name = try Self.trimmed(name)
    let at = Timestamp.string(now)
    let t = Tank(json: ["id": .string(newRecordId()), "name": .string(name), "species": .array([]), "plants": .array([]),
                        "createdAt": .string(at), "updatedAt": .string(at)])
    try Self.check(Validate.tank(.object(t.json)))
    tanks.append(t.json)
    return t
  }

  /// Changes a live tank and stamps it.
  public mutating func updateTank(_ id: String, now: Date = Date(), _ change: (inout Tank) throws -> Void) throws {
    guard let i = tanks.firstIndex(where: { $0["id"]?.string == id && $0["deletedAt"] == nil }) else { throw TankStoreError.notFound }
    var t = Tank(json: tanks[i])
    let prev = t.updatedAt
    try change(&t)
    t.name = try Self.trimmed(t.name)
    t.json["updatedAt"] = .string(Timestamp.stamp(now, after: prev))
    try Self.check(Validate.tank(.object(t.json)))
    tanks[i] = t.json
  }

  /// Deletes a tank and the devices on it: each becomes a tombstone.
  public mutating func deleteTank(_ id: String, now: Date = Date()) throws {
    guard let i = tanks.firstIndex(where: { $0["id"]?.string == id && $0["deletedAt"] == nil }) else { throw TankStoreError.notFound }
    tanks[i] = Self.tombstone(tanks[i], now)
    for j in devices.indices where devices[j]["tankId"]?.string == id && devices[j]["deletedAt"] == nil {
      devices[j] = Self.tombstone(devices[j], now)
    }
  }

  @discardableResult
  public mutating func addDevice(tankId: String, kind: String, brand: String? = nil, model: String? = nil, bleName: String? = nil,
                                 now: Date = Date()) throws -> Device {
    guard tank(tankId) != nil else { throw TankStoreError.notFound }
    guard liveDevices.count < maxDevices else { throw TankStoreError.tooManyDevices }
    let at = Timestamp.string(now)
    var d = Device(json: ["id": .string(newRecordId()), "tankId": .string(tankId), "kind": .string(kind),
                          "createdAt": .string(at), "updatedAt": .string(at)])
    d.set("brand", brand)
    d.set("model", model)
    d.set("bleName", bleName)
    if kind == "light" { d.schedules = [] }
    try Self.check(Validate.device(.object(d.json)))
    devices.append(d.json)
    return d
  }

  public mutating func updateDevice(_ id: String, now: Date = Date(), _ change: (inout Device) throws -> Void) throws {
    guard let i = devices.firstIndex(where: { $0["id"]?.string == id && $0["deletedAt"] == nil }) else { throw TankStoreError.notFound }
    var d = Device(json: devices[i])
    let prev = d.updatedAt
    try change(&d)
    if let n = d.nickname.map(Self.trim) { d.nickname = n.isEmpty ? nil : n }
    d.json["updatedAt"] = .string(Timestamp.stamp(now, after: prev))
    try Self.check(Validate.device(.object(d.json)))
    devices[i] = d.json
  }

  public mutating func deleteDevice(_ id: String, now: Date = Date()) throws {
    guard let i = devices.firstIndex(where: { $0["id"]?.string == id && $0["deletedAt"] == nil }) else { throw TankStoreError.notFound }
    devices[i] = Self.tombstone(devices[i], now)
  }

  /// What is left of a deleted record: its id and the time, stamped after the copy it deletes.
  public static func tombstone(_ record: Object, _ now: Date) -> Object {
    let at = Timestamp.stamp(now, after: record["updatedAt"]?.string)
    return ["id": record["id"] ?? .string(""), "updatedAt": .string(at), "deletedAt": .string(at)]
  }

  private static func hasRepeats(_ records: [Object]) -> Bool {
    let ids = records.map { Array(($0["id"]?.string ?? "").utf16) }
    return Set(ids).count != ids.count
  }

  private static func check(_ problems: [Problem]) throws {
    if !problems.isEmpty { throw TankStoreError.invalid(problems) }
  }

  /// As JavaScript's `trim()`.
  private static func trim(_ s: String) -> String {
    let u = s.unicodeScalars
    guard let first = u.firstIndex(where: { !$0.isJavaScriptSpace }), let last = u.lastIndex(where: { !$0.isJavaScriptSpace }) else { return "" }
    return String(u[first...last])
  }

  private static func trimmed(_ name: String) throws -> String {
    let t = trim(name)
    guard !t.isEmpty else { throw TankStoreError.blankName }
    return t
  }

  // MARK: Merging (docs/my-tanks-sync.md, "Merging two copies")

  /// The copy of one record to keep: the later `updatedAt`; on a tie a tombstone wins over a live copy, else `kept` stays.
  /// Strings compare as in JavaScript (UTF-16 code units), as the site and server compare them.
  public static func newer(_ kept: Object, _ incoming: Object) -> Object {
    let (k, i) = (kept["updatedAt"]?.string ?? "", incoming["updatedAt"]?.string ?? "")
    if k.utf16.lexicographicallyPrecedes(i.utf16) { return incoming }
    if i.utf16.elementsEqual(k.utf16), incoming["deletedAt"]?.string != nil, kept["deletedAt"]?.string == nil { return incoming }
    return kept
  }

  /// Both lists' records, one per id, sorted by id; every copy of an id goes through `newer`, all of `kept` first.
  public static func mergeRecords(_ kept: [Object], _ incoming: [Object]) -> [Object] {
    // Keyed by UTF-16 code units: Swift's String == joins ids that are only canonically equal, JavaScript doesn't.
    var out: [[UInt16]: Object] = [:]
    for r in kept + incoming {
      let id = Array((r["id"]?.string ?? "").utf16)
      out[id] = out[id].map { newer($0, r) } ?? r
    }
    return out.sorted { $0.key.lexicographicallyPrecedes($1.key) }.map(\.value)
  }

  /// Two stores as one: tanks and devices each merged; any other key of `kept` stays.
  public static func merge(kept: TankStore, incoming: TankStore) -> TankStore {
    var s = kept
    s.tanks = mergeRecords(kept.tanks, incoming.tanks)
    s.devices = mergeRecords(kept.devices, incoming.devices)
    return s
  }
}
