import Foundation

/// Any JSON value. Records are kept as JSON objects so that keys this app doesn't know (written by a newer client) go
/// back out unchanged when it saves a record again (docs/my-tanks-sync.md, "Unknown keys are kept").
public enum JSON: Sendable, Equatable, Codable {
  case null
  case bool(Bool)
  case number(Double)
  case string(String)
  case array([JSON])
  case object([String: JSON])

  public init(from decoder: Decoder) throws {
    let c = try decoder.singleValueContainer()
    if c.decodeNil() { self = .null }
    else if let b = try? c.decode(Bool.self) { self = .bool(b) }
    else if let n = try? c.decode(Double.self) { self = .number(n) }
    else if let s = try? c.decode(String.self) { self = .string(s) }
    else if let a = try? c.decode([JSON].self) { self = .array(a) }
    else { self = .object(try c.decode([String: JSON].self)) }
  }

  public func encode(to encoder: Encoder) throws {
    var c = encoder.singleValueContainer()
    switch self {
    case .null: try c.encodeNil()
    case .bool(let b): try c.encode(b)
    case .number(let n): try c.encode(n)
    case .string(let s): try c.encode(s)
    case .array(let a): try c.encode(a)
    case .object(let o): try c.encode(o)
    }
  }

  public var string: String? { if case .string(let s) = self { s } else { nil } }
  public var number: Double? { if case .number(let n) = self { n } else { nil } }
  public var array: [JSON]? { if case .array(let a) = self { a } else { nil } }
  public var object: [String: JSON]? { if case .object(let o) = self { o } else { nil } }
  /// A whole number (JSON has one number type: 30 and 30.0 are the same).
  public var int: Int? { number.flatMap { $0.rounded() == $0 && abs($0) < 1e15 ? Int($0) : nil } }

  public static func parse(_ data: Data) throws -> JSON { try JSONDecoder().decode(JSON.self, from: data) }
  public func data() throws -> Data {
    let e = JSONEncoder()
    e.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return try e.encode(self)
  }
}
