import Foundation

/// A species' facts written as the site's pages write them (apps/site/src/lib/format.ts, KeyFacts.astro): one decimal at
/// most, in the reader's language; a range as "min–max", one figure when both ends are the same.
extension HandbookIndex.Facts {
  /// Difficulty in the site's three steps: 1–3 easy, 4–5 medium, 6–8 hard (`difficultyLevel`).
  public enum Level: String, Sendable { case easy, mid, hard }
  public static func level(_ difficulty: Double) -> Level { difficulty <= 3 ? .easy : difficulty <= 5 ? .mid : .hard }

  public static func number(_ n: Double, _ locale: Locale) -> String {
    // Halves away from zero, as the browser rounds (7.25 → 7,3), not to even.
    n.formatted(.number.locale(locale).precision(.fractionLength(0...1)).rounded(rule: .toNearestOrAwayFromZero).grouping(.never))
  }

  public static func range(_ r: Range, _ locale: Locale) -> String {
    r.min == r.max ? number(r.min, locale) : "\(number(r.min, locale))–\(number(r.max, locale))"
  }

  /// Whether the card has anything to show: a figure, or a temperament the site names.
  public var any: Bool {
    sizeCm != nil || tempC != nil || ph != nil || tankCm != nil || difficulty != nil || Self.temperaments.contains(temperament ?? "")
  }

  /// The temperaments the site names (TEMPERAMENT_LABELS); another is left out of the card.
  public static let temperaments = ["peaceful", "semi-aggressive", "aggressive", "predator"]
}
