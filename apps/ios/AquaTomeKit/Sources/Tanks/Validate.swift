import Foundation

/// Where a problem is in a record: keys and list positions, as the site's validator reports them.
public enum PathKey: Sendable, Equatable, CustomStringConvertible {
  case key(String)
  case index(Int)
  public var description: String { switch self { case .key(let k): k; case .index(let i): String(i) } }
}

public struct Problem: Sendable, Equatable, CustomStringConvertible {
  public let path: [PathKey]
  public let message: String
  public var description: String { "\(path.map(\.description).joined(separator: ".")): \(message)" }
}

/// The rules of `packages/schema/src/tanks.ts`, for records read from disk or from the server. Every problem is
/// reported, with its path.
public enum Validate {
  public static func tank(_ v: JSON) -> [Problem] { var c = Checker(); c.tank(v, []); return c.problems }
  public static func device(_ v: JSON) -> [Problem] { var c = Checker(); c.device(v, []); return c.problems }
  public static func tombstone(_ v: JSON) -> [Problem] { var c = Checker(); c.tombstone(v, []); return c.problems }
  public static func tankRecord(_ v: JSON) -> [Problem] { var c = Checker(); c.record(v, [], live: Checker.tank); return c.problems }
  public static func deviceRecord(_ v: JSON) -> [Problem] { var c = Checker(); c.record(v, [], live: Checker.device); return c.problems }
  public static func store(_ v: JSON) -> [Problem] { var c = Checker(); c.store(v, []); return c.problems }

  /// Minutes a schedule keeps the light on; an off time of 00:00 is midnight at the end of the day.
  public static func minutesLit(on: String, off: String) -> Int {
    func m(_ t: String) -> Int { Int(t.prefix(2))! * 60 + Int(t.suffix(2))! }
    return (off == "00:00" ? 1440 : m(off)) - m(on)
  }
}

struct Checker {
  var problems: [Problem] = []

  mutating func fail(_ path: [PathKey], _ message: String) { problems.append(Problem(path: path, message: message)) }

  // MARK: Records

  mutating func tank(_ v: JSON, _ p: [PathKey]) {
    guard let o = object(v, p) else { return }
    field(o, "id", p) { c, v, p in c.recordId(v, p) }
    field(o, "name", p) { c, v, p in c.label(v, p, max: 80) }
    field(o, "dims", p, optional: true) { c, v, p in
      guard let d = c.object(v, p) else { return }
      for k in ["l", "w", "h"] { c.field(d, k, p) { c, v, p in c.number(v, p, above: 0, max: 1000) } }
    }
    field(o, "litres", p, optional: true) { c, v, p in c.number(v, p, above: 0, max: 100_000) }
    field(o, "substrate", p, optional: true) { c, v, p in c.string(v, p, min: 1, max: 40) }
    field(o, "species", p) { c, v, p in
      c.list(v, p, max: 200) { c, v, p in
        guard let s = c.object(v, p) else { return }
        c.field(s, "id", p) { c, v, p in c.contentId(v, p) }
        c.field(s, "count", p, optional: true) { c, v, p in c.int(v, p, min: 1, max: 9999) }
      }
    }
    field(o, "plants", p) { c, v, p in
      c.list(v, p, max: 200) { c, v, p in
        guard let s = c.object(v, p) else { return }
        c.field(s, "id", p) { c, v, p in c.contentId(v, p) }
      }
    }
    field(o, "notes", p, optional: true) { c, v, p in c.string(v, p, min: 0, max: 4000) }
    stamps(o, p)
  }

  mutating func device(_ v: JSON, _ p: [PathKey]) {
    guard let o = object(v, p) else { return }
    field(o, "id", p) { c, v, p in c.recordId(v, p) }
    field(o, "tankId", p) { c, v, p in c.recordId(v, p) }
    field(o, "kind", p) { c, v, p in c.string(v, p, min: 1, max: 40) }
    field(o, "brand", p, optional: true) { c, v, p in c.string(v, p, min: 1, max: 40) }
    field(o, "model", p, optional: true) { c, v, p in c.string(v, p, min: 1, max: 80) }
    field(o, "bleName", p, optional: true) { c, v, p in c.string(v, p, min: 1, max: 64) }
    field(o, "nickname", p, optional: true) { c, v, p in c.label(v, p, max: 80) }
    field(o, "schedules", p, optional: true) { c, v, p in c.list(v, p, max: 20) { c, v, p in c.schedule(v, p) } }
    field(o, "activeScheduleId", p, optional: true) { c, v, p in c.recordId(v, p) }
    field(o, "manual", p, optional: true) { c, v, p in
      guard let m = c.object(v, p) else { return }
      c.field(m, "levels", p) { c, v, p in c.levels(v, p) }
      c.field(m, "at", p) { c, v, p in c.timestamp(v, p) }
    }
    field(o, "clockSyncedAt", p, optional: true) { c, v, p in c.timestamp(v, p) }
    stamps(o, p)
  }

  mutating func schedule(_ v: JSON, _ p: [PathKey]) {
    guard let o = object(v, p) else { return }
    let before = problems.count
    field(o, "id", p) { c, v, p in c.recordId(v, p) }
    field(o, "name", p, optional: true) { c, v, p in c.label(v, p, max: 80) }
    field(o, "on", p) { c, v, p in c.timeOfDay(v, p) }
    field(o, "off", p) { c, v, p in c.timeOfDay(v, p) }
    field(o, "ramp", p) { c, v, p in c.int(v, p, min: 0, max: 150) }
    field(o, "levels", p) { c, v, p in c.levels(v, p) }
    field(o, "savedAt", p) { c, v, p in c.timestamp(v, p) }
    // As zod: the cross-field rules only once each field is right.
    guard problems.count == before, let on = o["on"]?.string, let off = o["off"]?.string, let ramp = o["ramp"]?.int else { return }
    let lit = Validate.minutesLit(on: on, off: off)
    if lit <= 0 { fail(p + [.key("off")], "off must be after on, the same day") }
    if ramp * 2 > lit { fail(p + [.key("ramp")], "ramp longer than half the time lit") }
  }

  mutating func tombstone(_ v: JSON, _ p: [PathKey]) {
    guard let o = object(v, p) else { return }
    field(o, "id", p) { c, v, p in c.recordId(v, p) }
    field(o, "updatedAt", p) { c, v, p in c.timestamp(v, p) }
    field(o, "deletedAt", p) { c, v, p in c.timestamp(v, p) }
  }

  static func tank(_ c: inout Checker, _ v: JSON, _ p: [PathKey]) { c.tank(v, p) }
  static func device(_ c: inout Checker, _ v: JSON, _ p: [PathKey]) { c.device(v, p) }

  /// A tombstone, else a live record (zod's union: the tombstone is tried first).
  mutating func record(_ v: JSON, _ p: [PathKey], live: (inout Checker, JSON, [PathKey]) -> Void) {
    var t = Checker(); t.tombstone(v, p)
    if t.problems.isEmpty { return }
    var l = Checker(); live(&l, v, p)
    if l.problems.isEmpty { return }
    fail(p, "neither a live record nor a tombstone (\(l.problems.map(\.description).joined(separator: "; ")))")
  }

  mutating func store(_ v: JSON, _ p: [PathKey]) {
    guard let o = object(v, p) else { return }
    if o["v"] != .number(1) { fail(p + [.key("v")], "store version 1") }
    for (key, live) in [("tanks", Checker.tank), ("devices", Checker.device)] as [(String, (inout Checker, JSON, [PathKey]) -> Void)] {
      field(o, key, p) { c, v, p in
        c.list(v, p, max: nil) { c, v, p in c.record(v, p, live: live) }
        let ids = (v.array ?? []).compactMap { $0.object?["id"]?.string.map { Array($0.utf16) } }
        if Set(ids).count != ids.count { c.fail(p, "two records with the same id") }
      }
    }
  }

  // MARK: Fields

  /// A key's value checked by `check`; absent is fine when optional, `null` never is (leave the key out instead).
  mutating func field(_ o: [String: JSON], _ key: String, _ p: [PathKey], optional: Bool = false,
                      _ check: (inout Checker, JSON, [PathKey]) -> Void) {
    let path = p + [.key(key)]
    guard let v = o[key] else { if !optional { fail(path, "required") }; return }
    if v == .null { return fail(path, "null: leave the key out") }
    check(&self, v, path)
  }

  mutating func stamps(_ o: [String: JSON], _ p: [PathKey]) {
    field(o, "createdAt", p) { c, v, p in c.timestamp(v, p) }
    field(o, "updatedAt", p) { c, v, p in c.timestamp(v, p) }
    if o["deletedAt"] != nil { fail(p + [.key("deletedAt")], "a live record has no deletedAt") }
  }

  mutating func object(_ v: JSON, _ p: [PathKey]) -> [String: JSON]? {
    if let o = v.object { return o }
    fail(p, "expected an object"); return nil
  }

  mutating func list(_ v: JSON, _ p: [PathKey], max: Int?, _ each: (inout Checker, JSON, [PathKey]) -> Void) {
    guard let a = v.array else { return fail(p, "expected a list") }
    if let max, a.count > max { fail(p, "more than \(max)") }
    for (i, x) in a.enumerated() { each(&self, x, p + [.index(i)]) }
  }

  mutating func string(_ v: JSON, _ p: [PathKey], min: Int, max: Int) {
    guard let s = v.string else { return fail(p, "expected text") }
    let n = s.unicodeScalars.count
    if n < min || n > max { fail(p, "\(min)–\(max) characters") }
  }

  /// Text a person typed: something besides spaces (JavaScript's \S), at most `max` characters.
  mutating func label(_ v: JSON, _ p: [PathKey], max: Int) {
    string(v, p, min: 0, max: max)
    if let s = v.string, !s.unicodeScalars.contains(where: { !$0.properties.isWhitespace && $0 != "\u{FEFF}" }) { fail(p, "blank") }
  }

  mutating func matches(_ v: JSON, _ p: [PathKey], _ pattern: String, _ what: String) {
    guard let s = v.string else { return fail(p, "expected text") }
    if s.range(of: pattern, options: .regularExpression) == nil { fail(p, what) }
  }

  mutating func recordId(_ v: JSON, _ p: [PathKey]) {
    matches(v, p, "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", "lowercase UUID")
  }

  mutating func contentId(_ v: JSON, _ p: [PathKey]) {
    string(v, p, min: 0, max: 120)
    if v.string != nil { matches(v, p, "^[a-z0-9]+(?:-[a-z0-9]+)*$", "content id") }
  }

  mutating func timeOfDay(_ v: JSON, _ p: [PathKey]) { matches(v, p, "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$", "HH:MM") }

  mutating func timestamp(_ v: JSON, _ p: [PathKey]) {
    guard let s = v.string else { return fail(p, "expected a timestamp") }
    if !Timestamp.isValid(s) { fail(p, "UTC timestamp with milliseconds, a real date and time") }
  }

  mutating func number(_ v: JSON, _ p: [PathKey], above: Double, max: Double) {
    guard let n = v.number else { return fail(p, "expected a number") }
    if !(n > above && n <= max) { fail(p, "above \(above), at most \(max)") }
  }

  mutating func int(_ v: JSON, _ p: [PathKey], min: Int, max: Int) {
    guard let n = v.int else { return fail(p, "expected a whole number") }
    if n < min || n > max { fail(p, "\(min)–\(max)") }
  }

  mutating func levels(_ v: JSON, _ p: [PathKey]) {
    guard let a = v.array else { return fail(p, "expected a list") }
    if a.isEmpty || a.count > 4 { fail(p, "1–4 levels") }
    for (i, x) in a.enumerated() { int(x, p + [.index(i)], min: 0, max: 100) }
  }
}
