import Foundation

/// The fish list's filter, as the site's (apps/site/src/scripts/filter.ts, held to it by protocols/filter-vectors.json):
/// the reader's tank length, water temperature and pH, and the hardest fish they'll take on (the site's 1–8 scale).
public struct FishFilter: Equatable, Sendable {
  public var tankCm: Double?
  public var tempC: Double?
  public var ph: Double?
  public var difficultyMax: Double?

  public init(tankCm: Double? = nil, tempC: Double? = nil, ph: Double? = nil, difficultyMax: Double? = nil) {
    self.tankCm = tankCm; self.tempC = tempC; self.ph = ph; self.difficultyMax = difficultyMax
  }

  public var isEmpty: Bool { self == FishFilter() }

  /// True when every figure asked about is known and fits, false when one known figure doesn't, nil when nothing known
  /// rules the fish out but a figure asked about is missing.
  public func fits(_ f: HandbookIndex.Facts) -> Bool? {
    func within(_ r: HandbookIndex.Facts.Range?, _ v: Double?) -> Bool? {
      guard let v else { return true }
      return r.map { v >= $0.min && v <= $0.max }
    }
    func atMost(_ x: Double?, _ v: Double?) -> Bool? {
      guard let v else { return true }
      return x.map { $0 <= v }
    }
    return verdict([within(f.tempC, tempC), within(f.ph, ph), atMost(f.tankCm, tankCm), atMost(f.difficulty, difficultyMax)])
  }

  /// The fish that fit, then the ones that may, each in the list's order. A breed (no scientific name, no figures) is
  /// only in the list with no filter set, as on the site.
  public func split(_ items: [HandbookIndex.Item]) -> (fit: [HandbookIndex.Item], unsure: [HandbookIndex.Item]) {
    guard !isEmpty else { return (items, []) }
    return Self.split(items.filter { $0.sub != nil }) { fits($0.facts) }
  }

  static func split(_ items: [HandbookIndex.Item], _ fits: (HandbookIndex.Item) -> Bool?) -> (fit: [HandbookIndex.Item], unsure: [HandbookIndex.Item]) {
    var fit: [HandbookIndex.Item] = [], unsure: [HandbookIndex.Item] = []
    for i in items {
      switch fits(i) {
      case true?: fit.append(i)
      case nil: unsure.append(i)
      case false?: break
      }
    }
    return (fit, unsure)
  }
}

/// The plant list's filter, as the site's: the tank's light (plants needing as much or less fit), no CO₂ (plants that
/// grow without it) or the plants that need it, and the hardest plant (1–3).
public struct PlantFilter: Equatable, Sendable {
  /// "low", "medium" or "high".
  public var light: String?
  /// "none" or "required".
  public var co2: String?
  public var difficultyMax: Int?

  public init(light: String? = nil, co2: String? = nil, difficultyMax: Int? = nil) {
    self.light = light; self.co2 = co2; self.difficultyMax = difficultyMax
  }

  public var isEmpty: Bool { self == PlantFilter() }
  static let lights = ["low", "medium", "high"]

  /// As for fish: true, false, or nil when a figure asked about is missing.
  public func fits(_ p: HandbookIndex.Plant?) -> Bool? {
    let rank = { (l: String) in Self.lights.firstIndex(of: l) ?? -1 }
    var checks: [Bool?] = []
    if let light { checks.append(p?.light.map { rank($0) <= rank(light) }) }
    if let co2 { checks.append(p?.co2.map { co2 == "none" ? $0 != "required" : $0 == "required" }) }
    if let difficultyMax { checks.append(p?.difficulty.map { $0 <= difficultyMax }) }
    return verdict(checks)
  }

  public func split(_ items: [HandbookIndex.Item]) -> (fit: [HandbookIndex.Item], unsure: [HandbookIndex.Item]) {
    guard !isEmpty else { return (items, []) }
    return FishFilter.split(items) { fits($0.plant) }
  }
}

/// All known and fitting: true; any known not fitting: false; else nil.
private func verdict(_ checks: [Bool?]) -> Bool? {
  if checks.contains(false) { return false }
  return checks.contains(nil) ? nil : true
}
