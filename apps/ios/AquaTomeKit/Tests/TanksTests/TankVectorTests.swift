import Foundation
import Testing
@testable import Tanks

// protocols/tanks-vectors.json: the cases the site's schema tests run too (packages/schema/test/tanks.test.ts).
let vectors: [String: JSON] = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSON.parse(Data(contentsOf: url.appendingPathComponent("protocols/tanks-vectors.json"))).object!
}()

func cases(_ section: String) -> [Object] { vectors[section]!.array!.map { $0.object! } }
func note(_ c: Object) -> Comment { Comment(rawValue: c["note"]?.string ?? "") }

func validate(_ kind: String, _ v: JSON) -> [Problem] {
  switch kind {
  case "tank": Validate.tank(v)
  case "device": Validate.device(v)
  case "tankRecord": Validate.tankRecord(v)
  case "store": Validate.store(v)
  default: [Problem(path: [], message: "unknown kind \(kind)")]
  }
}

/// Decoded into the app's own type and encoded back.
func roundTrip(_ kind: String, _ v: JSON) throws -> JSON {
  switch kind {
  case "tank": .object(Tank(json: v.object!).json)
  case "device": .object(Device(json: v.object!).json)
  case "tankRecord": .object(Tank(json: v.object!).json)
  case "store": try TankStore(v).value
  default: .null
  }
}

@Test func validRecordsDecodeAndEncodeBackUnchanged() throws {
  for c in cases("valid") {
    let kind = c["kind"]!.string!, value = c["value"]!
    #expect(validate(kind, value) == [], note(c))
    // Through JSON text and back: unknown keys and every value survive.
    let again = try JSON.parse(try roundTrip(kind, value).data())
    #expect(again == value, note(c))
  }
}

@Test func invalidRecordsAreRefusedAtTheirPath() {
  for c in cases("invalid") {
    let problems = validate(c["kind"]!.string!, c["value"]!)
    #expect(!problems.isEmpty, note(c))
    let path: [PathKey] = (c["path"]?.array ?? []).map { $0.string.map(PathKey.key) ?? .index($0.int!) }
    #expect(problems.contains { $0.path == path }, "\(c["note"]!.string!): \(problems)")
  }
}

@Test func mergeRecordsAsTheSite() {
  for c in cases("merge") {
    let kept = c["kept"]!.array!.map { $0.object! }, incoming = c["incoming"]!.array!.map { $0.object! }
    let expected = c["expected"]!.array!.map { $0.object! }
    #expect(TankStore.mergeRecords(kept, incoming) == expected, note(c))
  }
}

@Test func mergeStoresAsTheSite() throws {
  for c in cases("mergeStores") {
    let merged = TankStore.merge(kept: try TankStore(c["kept"]!), incoming: try TankStore(c["incoming"]!))
    #expect(merged.value == c["expected"]!, note(c))
  }
}

@Test func stampAsTheSite() {
  for c in cases("stamp") {
    let now = Date(timeIntervalSince1970: Double(Timestamp.millis(c["now"]!.string!)!) / 1000)
    #expect(Timestamp.stamp(now, after: c["prev"]?.string) == c["updatedAt"]!.string!, note(c))
  }
}

@Test func litresAsTheSite() {
  for c in cases("litres") {
    let t = Tank(json: c["tank"]!.object!)
    #expect(t.totalLitres == c["litres"]?.number, note(c))
  }
}

@Test func knownValuesAsTheSite() {
  let k = vectors["known"]!.object!
  #expect(k["substrate"]!.array!.compactMap(\.string) == Known.substrate)
  #expect(k["deviceKind"]!.array!.compactMap(\.string) == Known.deviceKind)
  #expect(k["brand"]!.array!.compactMap(\.string) == Known.brand)
}
