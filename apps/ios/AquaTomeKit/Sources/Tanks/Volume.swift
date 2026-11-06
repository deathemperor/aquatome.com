import Foundation

/// The site's tank volume tool (apps/site/src/scripts/volume.ts and its page, pages/vi/cong-cu/the-tich-be.astro): a
/// tank's litres by shape from its inside sizes in cm, the water it really holds, the front glass a box needs. A port of
/// the site's formulas, held to its numbers by protocols/volume-vectors.json, which the site's tests read too.
public enum TankShape: String, CaseIterable, Sendable {
  // The site's ids, in its order (the page's `?hinh=` and the vectors).
  case box = "chu-nhat", cube = "lap-phuong", hexagon = "luc-giac", octagon = "bat-giac", flatBackHexagon = "luc-giac-lung"
  case cylinder = "tru", halfCylinder = "nua-tru", quarterCircle = "goc-tron", ellipse = "elip"
  case cornerPentagon = "goc-ngu-giac", lShape = "chu-l", cornerTriangle = "goc-tam-giac"

  /// The sizes it asks for, in the page's order, by the site's keys: l, w, h; f the front pane, e the end pane; d a
  /// diameter (a half cylinder's flat back); r the side on the wall; a and b; l1, w1, l2, w2 the arms of an L.
  public var fields: [String] {
    switch self {
    case .box, .ellipse: ["l", "w", "h"]
    case .cube: ["l"]
    case .hexagon: ["l", "w", "h", "f"]
    case .octagon, .flatBackHexagon: ["l", "w", "h", "f", "e"]
    case .cylinder, .halfCylinder: ["d", "h"]
    case .quarterCircle: ["r", "h"]
    case .cornerPentagon, .cornerTriangle: ["a", "b", "h"]
    case .lShape: ["l1", "w1", "l2", "w2", "h"]
    }
  }

  /// A glass box: the page gives its glass and a heater link, and a save keeps its sides rather than litres.
  public var isBox: Bool { self == .box || self == .cube }

  /// The floor's area seen from above, cm², in the site's order of operations.
  func area(_ d: [String: Double]) -> Double {
    let v = { d[$0] ?? 0 }
    switch self {
    case .box: return v("l") * v("w")
    case .cube: return v("l") * v("l")
    // Elongated hexagon: front and back panes, a point at each end.
    case .hexagon: return (v("w") * (v("l") + v("f"))) / 2
    case .octagon: return v("l") * v("w") - 2 * ((v("l") - v("f")) / 2) * ((v("w") - v("e")) / 2)
    // Flat back, square ends of depth E, two angled front corners.
    case .flatBackHexagon: return v("l") * v("w") - ((v("l") - v("f")) / 2) * (v("w") - v("e"))
    case .cylinder: return Double.pi * (v("d") / 2) * (v("d") / 2)
    case .halfCylinder: return (Double.pi * (v("d") / 2) * (v("d") / 2)) / 2
    case .quarterCircle: return (Double.pi * v("r") * v("r")) / 4
    case .ellipse: return Double.pi * (v("l") / 2) * (v("w") / 2)
    // Corner pentagon: two walls of A, short sides B, a front pane across.
    case .cornerPentagon: return v("a") * v("a") - (v("a") - v("b")) * (v("a") - v("b")) / 2
    // Each arm measured overall from the corner: the shared corner counted once.
    case .lShape: return v("l1") * v("w1") + v("l2") * v("w2") - v("w1") * v("w2")
    case .cornerTriangle: return (v("a") * v("b")) / 2
    }
  }

  func height(_ d: [String: Double]) -> Double { (self == .cube ? d["l"] : d["h"]) ?? 0 }

  /// A pane longer than the side it sits on, as (the pane, the side), the first the page checks.
  func tooLong(_ d: [String: Double]) -> (String, String)? {
    let pairs: [(String, String)] = switch self {
    case .hexagon: [("f", "l")]
    case .octagon, .flatBackHexagon: [("f", "l"), ("e", "w")]
    case .cornerPentagon: [("b", "a")]
    case .lShape: [("w2", "l1"), ("w1", "l2")]
    default: []
    }
    return pairs.first { (d[$0.0] ?? 0) > (d[$0.1] ?? 0) }
  }
}

/// Why the tool gives no litres.
public enum VolumeProblem: Error, Equatable, Sendable {
  /// A size not above 0, or not given: the page asks for it ("Nhập rộng.").
  case missing(String)
  /// A pane longer than the side it sits on ("Kính trước phải ngắn hơn chiều dài.").
  case tooLong(String, than: String)
  /// A water line not above 0, or above the rim.
  case fill
}

public enum TankVolume {
  /// A US gallon, in litres.
  public static let gallonL = 3.785411784
  /// The water a tank holds once substrate, decor and the gap under the rim are taken out (the site's calc.ts).
  public static let waterShare = 0.85

  public struct Volume: Equatable, Sendable {
    public let litres: Double
    /// To the water line, when one below the rim was given.
    public let filled: Double?
    public var gallons: Double { litres / gallonL }
  }

  /// Litres from the sizes in cm; `fill` (optional) is the water line from the bottom. Every size is asked for first,
  /// then the shape is checked, then the water line, as the site does.
  public static func volume(_ shape: TankShape, _ d: [String: Double]) -> Result<Volume, VolumeProblem> {
    if let key = shape.fields.first(where: { !((d[$0] ?? 0) > 0) }) { return .failure(.missing(key)) }
    if let (pane, side) = shape.tooLong(d) { return .failure(.tooLong(pane, than: side)) }
    let height = shape.height(d)
    if let fill = d["fill"], !(fill > 0 && fill <= height) { return .failure(.fill) }
    let area = shape.area(d)
    return .success(Volume(litres: area * height / 1000, filled: d["fill"].flatMap { $0 < height ? area * $0 / 1000 : nil }))
  }

  // MARK: Glass

  /// Glass you can order, mm.
  public static let glassStockMm = [4, 5, 6, 8, 10, 12, 15, 19]
  /// Plate bending factor β by the pane's length ÷ water height (the table aquarium builders use).
  static let beta: [(Double, Double)] = [(0.5, 0.085), (0.667, 0.116), (1, 0.16), (1.5, 0.26), (2, 0.32), (2.5, 0.35), (3, 0.37)]
  /// Float glass breaks at about 19.2 N/mm²; builders divide by a safety factor of 3.8.
  static let allowed = 19.2e6 / 3.8

  /// Front pane thickness for a glass box, t = √(β · ρgh · h² / σ): the minimum in mm (one decimal) and the stock glass
  /// to order, nil above 19 mm (a builder's own calculation, bracing or laminated glass).
  public static func glass(lengthCm: Double, waterCm: Double) -> (min: Double, order: Int?) {
    let r = lengthCm / waterCm
    let b: Double
    if let i = beta.firstIndex(where: { $0.0 >= r }) {
      b = i == 0 ? beta[0].1 : beta[i - 1].1 + ((r - beta[i - 1].0) / (beta[i].0 - beta[i - 1].0)) * (beta[i].1 - beta[i - 1].1)
    } else {
      b = beta[beta.count - 1].1
    }
    let h = waterCm / 100
    let min = jsRound((b * 9810 * h * h * h / allowed).squareRoot() * 10000) / 10
    return (min, glassStockMm.first { Double($0) >= min })
  }

  /// The glass of an open-top box (bottom and four sides), kg, at 2.5 kg per litre of glass.
  public static func glassKg(l: Double, w: Double, h: Double, mm: Int) -> Double {
    let area = l * w + 2 * (l + w) * h
    return area * (Double(mm) / 10) * 2.5 / 1000
  }

  // MARK: The page's table of ready-made tanks

  /// Sizes shops here sell ready-made (length × width × height, cm).
  public static let readyMadeSizes: [(l: Double, w: Double, h: Double)] = [
    (30, 20, 20), (40, 25, 25), (50, 30, 30), (60, 30, 36), (70, 35, 40), (80, 40, 45), (90, 45, 45), (100, 50, 50),
    (120, 50, 55), (150, 60, 60),
  ]

  public struct ReadyMade: Equatable, Sendable {
    public let l: Double, w: Double, h: Double
    public let litres: Double, water: Double
    /// The front glass to order (19 mm when none is enough, as the table shows it).
    public let glass: Int
    /// Full: water, glass and substrate (15% of the volume at 1.6 kg/L), before rounding.
    public let kg: Double
  }

  public static let readyMade: [ReadyMade] = readyMadeSizes.map { s in
    let litres = s.l * s.w * s.h / 1000
    let glass = Self.glass(lengthCm: s.l, waterCm: s.h).order ?? 19
    let water = litres * waterShare
    return ReadyMade(l: s.l, w: s.w, h: s.h, litres: litres, water: water, glass: glass,
                     kg: water + glassKg(l: s.l, w: s.w, h: s.h, mm: glass) + litres * 0.15 * 1.6)
  }

  /// JavaScript's Math.round: halves up, toward +∞.
  static func jsRound(_ x: Double) -> Double {
    // Not (x + 0.5).rounded(.down): that sum rounds up 0.49999999999999994, and odd numbers past 2^52.
    let r = x.rounded(.down)
    return x - r >= 0.5 ? r + 1 : r
  }
  /// To 0.1, as the page rounds a size it keeps or converts.
  public static func tenth(_ x: Double) -> Double { jsRound(x * 10) / 10 }
  /// A weight as the table gives it: to the nearest 5 kg.
  public static func nearest5(_ kg: Double) -> Double { jsRound(kg / 5) * 5 }
}
