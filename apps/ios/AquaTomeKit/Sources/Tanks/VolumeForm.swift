import Foundation

/// The volume tool's form as the site's page runs it (the script in pages/vi/cong-cu/the-tich-be.astro): sizes typed
/// in cm or inches, kept by key when the shape changes, converted when the unit does; what it works out from them;
/// and what "Lưu vào Bể của tôi" would save.
public struct VolumeForm: Equatable, Sendable {
  public var shape: TankShape = .box {
    // The boxes the new shape shares with the old keep what was typed; the others start empty.
    didSet { sizes = sizes.filter { shape.fields.contains($0.key) } }
  }
  /// Inches rather than cm.
  public private(set) var inches = false
  /// What's typed in each size's box, by key, in the unit shown.
  public var sizes: [String: String]
  /// The water line, if given.
  public var fill = ""

  /// The page's first state: a 60 × 30 × 36 cm box, in inches when the reader chose them before.
  public init(inches: Bool = false) {
    sizes = ["l": "60", "w": "30", "h": "36"]
    if inches { setInches(true) }
  }

  /// A link's state (`hinh=luc-giac&l=60&…`, sizes in cm, as the page writes its address): the shape and only the sizes
  /// it gives, in the unit the reader uses. No shape in it: the first state.
  public init(query: String, inches: Bool) {
    self.init(inches: inches)
    let items = URLComponents(string: "?" + query)?.queryItems ?? []
    guard items.contains(where: { $0.name == "hinh" }) else { return }
    // The first, as the page's URLSearchParams.get takes it.
    shape = items.first { $0.name == "hinh" }.flatMap { $0.value.flatMap(TankShape.init(rawValue:)) } ?? .box
    sizes = [:]
    for i in items where i.name != "hinh" {
      guard let cm = i.value.flatMap(Double.init), cm.isFinite else { continue }
      // As exact as the link: in inches, 60 cm is 23.62204724409449.
      let exact = "\(cm / unit)"
      let text = exact.hasSuffix(".0") ? String(exact.dropLast(2)) : exact
      if i.name == "fill" { fill = text } else if shape.fields.contains(i.name) { sizes[i.name] = text }
    }
  }

  /// cm per unit typed.
  var unit: Double { inches ? 2.54 : 1 }

  /// Cm to inches or back: every size typed, and the water line, converted and kept to 0.1.
  public mutating func setInches(_ on: Bool) {
    guard on != inches else { return }
    inches = on
    let k = on ? 1 / 2.54 : 2.54
    let convert = { (s: String) in Self.number(s).map { Self.text(TankVolume.tenth($0 * k), digits: 1) } ?? s }
    sizes = sizes.mapValues(convert)
    fill = convert(fill)
  }

  /// The sizes in cm, and the water line: those typed as numbers.
  public var cm: [String: Double] {
    var d: [String: Double] = [:]
    for key in shape.fields { if let v = sizes[key].flatMap(Self.number) { d[key] = v * unit } }
    if let f = Self.number(fill) { d["fill"] = f * unit }
    return d
  }

  /// What the page shows for these sizes.
  public var outcome: Result<Worked, VolumeProblem> {
    let d = cm
    return TankVolume.volume(shape, d).map { Worked(shape: shape, d: d, volume: $0) }
  }

  /// A number as typed, with a comma or a point; nil for anything else (an empty box).
  static func number(_ s: String) -> Double? {
    guard let v = Double(s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")), v.isFinite else { return nil }
    return v
  }

  /// A size to put back in a box: a comma or a point as the phone writes decimals, no grouping.
  static func text(_ v: Double, digits: Int) -> String {
    v.formatted(.number.grouping(.never).precision(.fractionLength(0...digits)).rounded(rule: .toNearestOrAwayFromZero))
  }
}

/// What the tool works out from a tank's sizes.
public struct Worked: Sendable {
  public let shape: TankShape
  public let volume: TankVolume.Volume
  /// The water it holds: of the litres to the water line, if one was given.
  public let water: Double
  /// A box's inside sides, cm.
  public let box: (l: Double, w: Double, h: Double)?
  /// A box's front glass, for its longer side and its water.
  public let glass: (min: Double, order: Int?)?
  /// That glass's weight, when there's glass to order.
  public let glassKg: Double?
  /// What a save puts on a tank, when a tank can take it (sides up to 1000 cm; 0.1 to 100,000 litres).
  public let save: Save?

  public enum Save: Equatable, Sendable {
    /// A box keeps its sides, each to 0.1 cm (and no litres of its own).
    case dims(l: Double, w: Double, h: Double)
    /// Any other shape its litres, to 0.1 (and no sides).
    case litres(Double)
  }

  init(shape: TankShape, d: [String: Double], volume v: TankVolume.Volume) {
    self.shape = shape
    volume = v
    water = (v.filled ?? v.litres) * TankVolume.waterShare
    let side = { d[$0] ?? 0 }
    if shape.isBox {
      let b = shape == .cube ? (side("l"), side("l"), side("l")) : (side("l"), side("w"), side("h"))
      box = b
      let g = TankVolume.glass(lengthCm: max(b.0, b.1), waterCm: d["fill"] ?? b.2)
      glass = g
      glassKg = g.order.map { TankVolume.glassKg(l: b.0, w: b.1, h: b.2, mm: $0) }
      save = max(b.0, b.1, b.2) <= 1000 ? .dims(l: TankVolume.tenth(b.0), w: TankVolume.tenth(b.1), h: TankVolume.tenth(b.2)) : nil
    } else {
      (box, glass, glassKg) = (nil, nil, nil)
      let litres = TankVolume.tenth(v.litres)
      save = litres > 0 && v.litres <= 100_000 ? .litres(litres) : nil
    }
  }

  /// The heater calculator for this box, on the site's page of calculators at `tools` ("/id/alat/", in the app's
  /// language: SiteLanguage), its sizes rounded to whole cm, as the page links it.
  public func heaterPath(tools: String) -> String? {
    guard let b = box else { return nil }
    // Written as a whole number without going through Int, which a side of 1e19 cm (typed, or in a link) overflows.
    let cm = { String(format: "%.0f", TankVolume.jsRound($0)) }
    return "\(tools)?l=\(cm(b.l))&w=\(cm(b.w))&h=\(cm(b.h))#suoi"
  }
}
