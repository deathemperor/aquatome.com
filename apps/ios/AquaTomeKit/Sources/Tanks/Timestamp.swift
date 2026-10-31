import Foundation

/// Record timestamps: real UTC instants in exactly one form, `2026-10-31T12:00:00.000Z`, so comparing the strings
/// compares the times on every platform. Done by hand (no DateFormatter): the result must not depend on the phone's
/// calendar or locale.
public enum Timestamp {
  /// Milliseconds since 1970 for a timestamp in the one form, nil for anything else (`2026-02-30…`, hour 24, an offset).
  public static func millis(_ s: String) -> Int64? {
    let b = Array(s.utf8)
    guard b.count == 24, b[4] == 45, b[7] == 45, b[10] == 84, b[13] == 58, b[16] == 58, b[19] == 46, b[23] == 90 else { return nil }
    func num(_ r: Range<Int>) -> Int? {
      var n = 0
      for i in r { guard (48...57).contains(b[i]) else { return nil }; n = n * 10 + Int(b[i] - 48) }
      return n
    }
    guard let y = num(0..<4), let mo = num(5..<7), let d = num(8..<10), let h = num(11..<13), let mi = num(14..<16),
          let sec = num(17..<19), let ms = num(20..<23),
          (1...12).contains(mo), (1...daysIn(month: mo, year: y)).contains(d), h < 24, mi < 60, sec < 60
    else { return nil }
    let days = Int64(daysFromCivil(y, mo, d))
    return ((days * 24 + Int64(h)) * 60 + Int64(mi)) * 60_000 + Int64(sec) * 1000 + Int64(ms)
  }

  public static func isValid(_ s: String) -> Bool { millis(s) != nil }

  /// The one form for an instant.
  public static func string(millis t: Int64) -> String {
    let ms = Int(((t % 1000) + 1000) % 1000)
    let secs = (t - Int64(ms)) / 1000
    let days = Int(floorDiv(secs, 86_400))
    let rest = Int(secs - Int64(days) * 86_400)
    let (y, m, d) = civilFromDays(days)
    return String(format: "%04d-%02d-%02dT%02d:%02d:%02d.%03dZ", y, m, d, rest / 3600, rest / 60 % 60, rest % 60, ms)
  }

  public static func string(_ date: Date) -> String { string(millis: Int64((date.timeIntervalSince1970 * 1000).rounded(.down))) }

  /// The `updatedAt` of a change made at `now` to a record whose copy here says `prev`: now, or 1 ms after `prev` when
  /// this phone's clock is behind it. A change made after seeing a copy then wins over that copy, whatever this clock says.
  public static func stamp(_ now: Date, after prev: String?) -> String {
    let t = Int64((now.timeIntervalSince1970 * 1000).rounded(.down))
    return string(millis: max(t, prev.flatMap(millis).map { $0 + 1 } ?? Int64.min))
  }

  private static func daysIn(month: Int, year: Int) -> Int {
    switch month {
    case 2: (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 ? 29 : 28
    case 4, 6, 9, 11: 30
    default: 31
    }
  }

  private static func floorDiv(_ a: Int64, _ b: Int64) -> Int64 { a >= 0 ? a / b : -((-a + b - 1) / b) }

  // Howard Hinnant's days_from_civil and civil_from_days (proleptic Gregorian, day 0 = 1970-01-01).
  private static func daysFromCivil(_ y0: Int, _ m: Int, _ d: Int) -> Int {
    let y = m <= 2 ? y0 - 1 : y0
    let era = (y >= 0 ? y : y - 399) / 400
    let yoe = y - era * 400
    let doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
    return era * 146_097 + doe - 719_468
  }

  private static func civilFromDays(_ z0: Int) -> (Int, Int, Int) {
    let z = z0 + 719_468
    let era = (z >= 0 ? z : z - 146_096) / 146_097
    let doe = z - era * 146_097
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
    let mp = (5 * doy + 2) / 153
    let d = doy - (153 * mp + 2) / 5 + 1
    let m = mp + (mp < 10 ? 3 : -9)
    return (yoe + era * 400 + (m <= 2 ? 1 : 0), m, d)
  }
}
