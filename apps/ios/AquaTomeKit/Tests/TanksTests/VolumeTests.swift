import Foundation
import Testing
@testable import Tanks

// protocols/volume-vectors.json: the cases the site's tests run on its own volume tool (apps/site/test/volume-vectors.test.ts).
private struct Vectors: Decodable, Sendable {
  struct Shape: Decodable, Sendable {
    let note: String, shape: String, d: [String: Double]
    let litres: Double?, gallons: Double?, filled: Double?
    let refused: [String]?
  }
  struct Glass: Decodable, Sendable { let lengthCm: Double, waterCm: Double, min: Double, order: Int? }
  struct GlassKg: Decodable, Sendable { let l: Double, w: Double, h: Double, mm: Int, kg: Double }
  struct Row: Decodable, Sendable { let l: Double, w: Double, h: Double, litres: Double, water: Double, glass: Int, kg: Double }
  let gallonL: Double, waterShare: Double
  /// Each shape's sizes in the page's order: the first missing is the one it asks for.
  let fields: [String: [String]]
  let shapes: [Shape], glass: [Glass], glassKg: [GlassKg], readyMade: [Row]
}
private let v: Vectors = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url.appendingPathComponent("protocols/volume-vectors.json")))
}()

private func near(_ a: Double?, _ b: Double?) -> Bool {
  guard let a, let b else { return a == nil && b == nil }
  return abs(a - b) < 1e-9
}

@Test func theConstantsAreTheSites() {
  #expect(TankVolume.gallonL == v.gallonL)
  #expect(TankVolume.waterShare == v.waterShare)
}

@Test func eachShapeAsksForTheSitesSizesInItsOrder() {
  #expect(Set(v.fields.keys) == Set(TankShape.allCases.map(\.rawValue)))
  for s in TankShape.allCases { #expect(s.fields == v.fields[s.rawValue], "\(s.rawValue)") }
}

@Test func eachShapeGivesTheSitesLitresOrRefusesAsItDoes() {
  #expect(Set(v.shapes.map(\.shape)) == Set(TankShape.allCases.map(\.rawValue)))
  for c in v.shapes {
    let note = Comment(rawValue: c.note)
    let shape = try! #require(TankShape(rawValue: c.shape), note)
    switch TankVolume.volume(shape, c.d) {
    case .success(let r):
      #expect(c.refused == nil, note)
      #expect(near(r.litres, c.litres), note)
      #expect(near(r.gallons, c.gallons), note)
      #expect(near(r.filled, c.filled), note)
    case .failure(let p):
      let want: VolumeProblem? = switch c.refused ?? [] {
      case let r where r.first == "missing" && r.count == 2: .missing(r[1])
      case let r where r.first == "shorter" && r.count == 3: .tooLong(r[1], than: r[2])
      case ["fill"]: .fill
      default: nil
      }
      #expect(p == want, note)
    }
  }
}

@Test func theGlassIsTheSites() {
  for c in v.glass {
    let g = TankVolume.glass(lengthCm: c.lengthCm, waterCm: c.waterCm)
    #expect(g.min == c.min && g.order == c.order, "\(c.lengthCm) × \(c.waterCm)")
  }
  for c in v.glassKg { #expect(near(TankVolume.glassKg(l: c.l, w: c.w, h: c.h, mm: c.mm), c.kg)) }
}

@Test func theReadyMadeTableIsTheSites() {
  // As the page shows it: whole litres (halves up, as the browser rounds), the weight to the nearest 5 kg.
  let whole = { (x: Double) in x.rounded(.toNearestOrAwayFromZero) }
  let rows = TankVolume.readyMade.map { r in
    [r.l, r.w, r.h, whole(r.litres), whole(r.water), Double(r.glass), TankVolume.nearest5(r.kg)]
  }
  #expect(rows == v.readyMade.map { [$0.l, $0.w, $0.h, $0.litres, $0.water, Double($0.glass), $0.kg] })
}

// The page's own script (pages/vi/cong-cu/the-tich-be.astro), which the site's tests can't run: by hand.

@Test func thePageStartsWithASixtyCentimetreBox() throws {
  let f = VolumeForm()
  #expect(f.shape == .box && f.cm == ["l": 60, "w": 30, "h": 36])
  let w = try f.outcome.get()
  #expect(near(w.volume.litres, 64.8))
  #expect(near(w.water, 64.8 * 0.85))
  #expect(w.glass?.min == 5 && w.glass?.order == 5)
  #expect(near(w.glassKg, TankVolume.glassKg(l: 60, w: 30, h: 36, mm: 5)))
  #expect(w.save == .dims(l: 60, w: 30, h: 36))
  #expect(w.heaterPath(lang: "vi") == "/vi/cong-cu/?l=60&w=30&h=36#suoi")
  #expect(w.heaterPath(lang: "id") == "/id/alat/?l=60&w=30&h=36#suoi")
  #expect(w.heaterPath(lang: "th") == "/th/tools/?l=60&w=30&h=36#suoi")
}

@Test func aSizeLeftEmptyOrNotANumberIsAskedFor() {
  var f = VolumeForm()
  f.sizes["w"] = ""
  #expect(f.outcome.map(\.water) == .failure(.missing("w")))
  f.sizes["w"] = "abc"
  #expect(f.outcome.map(\.water) == .failure(.missing("w")))
  f.sizes["w"] = "inf"
  #expect(f.outcome.map(\.water) == .failure(.missing("w")))
  f.sizes["w"] = "30,5"
  #expect(f.cm["w"] == 30.5)
}

@Test func aWaterLineFillsOnlyThatFarAndSetsTheGlass() throws {
  var f = VolumeForm()
  f.fill = "30"
  let w = try f.outcome.get()
  #expect(near(w.volume.filled, 54))
  #expect(near(w.water, 54 * 0.85))
  // The glass holds back 30 cm of water, not 36.
  #expect(w.glass?.min == TankVolume.glass(lengthCm: 60, waterCm: 30).min)
  f.fill = "0"
  #expect(f.outcome.map(\.water) == .failure(.fill))
}

@Test func aBoxsGlassIsForItsLongerSideAndACubeIsItsOwnBox() throws {
  var f = VolumeForm()
  f.sizes = ["l": "30", "w": "60", "h": "36"]
  #expect(try f.outcome.get().glass?.min == TankVolume.glass(lengthCm: 60, waterCm: 36).min)
  f.shape = .cube
  f.sizes = ["l": "40"]
  let w = try f.outcome.get()
  #expect(w.save == .dims(l: 40, w: 40, h: 40))
  #expect(w.glass?.min == TankVolume.glass(lengthCm: 40, waterCm: 40).min)
  #expect(w.heaterPath(lang: "vi") == "/vi/cong-cu/?l=40&w=40&h=40#suoi")
}

@Test func anyOtherShapeSavesItsLitresAndHasNoGlass() throws {
  var f = VolumeForm()
  f.shape = .cylinder
  f.sizes["d"] = "40"
  f.sizes["h"] = "50"
  let w = try f.outcome.get()
  #expect(w.save == .litres(62.8))
  #expect(w.glass == nil && w.glassKg == nil && w.box == nil && w.heaterPath(lang: "vi") == nil)
}

@Test func aTankNoSavedTankCanHoldIsNotOfferedToSave() throws {
  var f = VolumeForm()
  f.sizes = ["l": "1001", "w": "30", "h": "36"]
  #expect(try f.outcome.get().save == nil)
  f.sizes["l"] = "1000"
  #expect(try f.outcome.get().save == .dims(l: 1000, w: 30, h: 36))
  // Litres: from 0.1 (as it rounds) to 100,000.
  f.shape = .cornerTriangle
  f.sizes = ["a": "1", "b": "1", "h": "0,1"]
  #expect(try f.outcome.get().save == nil)
  f.sizes = ["a": "1000", "b": "1000", "h": "300"]
  #expect(try f.outcome.get().save == nil)
  f.sizes["h"] = "200"
  #expect(try f.outcome.get().save == .litres(100_000))
}

@Test func aSaveKeepsSidesToATenth() throws {
  var f = VolumeForm()
  f.sizes = ["l": "60,04", "w": "30,05", "h": "36"]
  #expect(try f.outcome.get().save == .dims(l: 60, w: 30.1, h: 36))
}

@Test func anotherShapeKeepsOnlyTheSizesItShares() {
  var f = VolumeForm()
  f.shape = .cylinder
  #expect(f.sizes == ["h": "36"])
  f.shape = .box
  #expect(f.sizes == ["h": "36"])
  #expect(f.outcome.map(\.water) == .failure(.missing("l")))
}

@Test func inchesConvertWhatIsTypedToATenth() throws {
  var f = VolumeForm()
  f.fill = "30"
  f.setInches(true)
  #expect(f.sizes == ["l": "23.6", "w": "11.8", "h": "14.2"] || f.sizes == ["l": "23,6", "w": "11,8", "h": "14,2"])
  #expect(f.fill == "11.8" || f.fill == "11,8")
  // Worked out from what's shown: 23.6 in is 59.944 cm.
  #expect(near(f.cm["l"], 23.6 * 2.54))
  f.setInches(false)
  #expect(f.cm == ["l": 59.9, "w": 30, "h": 36.1, "fill": 30])
  // The reader's unit kept from before: the first state in inches.
  #expect(near(VolumeForm(inches: true).cm["l"], 23.6 * 2.54))
}

@Test func aLinkOpensWithItsShapeAndOnlyItsSizes() {
  let f = VolumeForm(query: "hinh=luc-giac&l=60&w=30&f=40&fill=20&x=1", inches: false)
  #expect(f.shape == .hexagon)
  #expect(f.cm == ["l": 60, "w": 30, "f": 40, "fill": 20])
  #expect(f.outcome.map(\.water) == .failure(.missing("h")))
  // A link without a shape is the page's first state; one the site doesn't have, a box.
  #expect(VolumeForm(query: "l=10", inches: false) == VolumeForm())
  #expect(VolumeForm(query: "hinh=tron&l=50", inches: false).shape == .box)
  // In inches, the sizes the link gives in cm.
  let i = VolumeForm(query: "hinh=chu-nhat&l=60&w=30&h=36", inches: true)
  #expect(near(i.cm["l"], 60) && near(i.cm["h"], 36))
}

@Test func aShapeGivenTwiceIsTheFirstAsThePageReadsIt() {
  #expect(VolumeForm(query: "hinh=tru&hinh=chu-nhat&d=40&h=50", inches: false).shape == .cylinder)
}

/// A side no tank has, typed (20 digits) or in a link: the heater link written whole, not a crash.
@Test func aHugeBoxStillLinksTheHeaterCalculator() throws {
  var typed = VolumeForm()
  typed.sizes["l"] = "12345678901234567890"
  let w = try typed.outcome.get()
  #expect(w.heaterPath(lang: "vi") == "/vi/cong-cu/?l=12345678901234567168&w=30&h=36#suoi")
  let linked = try VolumeForm(query: "hinh=chu-nhat&l=1e19&w=30&h=36", inches: false).outcome.get()
  #expect(linked.heaterPath(lang: "vi") == "/vi/cong-cu/?l=10000000000000000000&w=30&h=36#suoi")
}

@Test func roundingIsJavaScriptsMathRound() {
  #expect(TankVolume.jsRound(0.49999999999999994) == 0)
  #expect(TankVolume.jsRound(2.5) == 3 && TankVolume.jsRound(-2.5) == -2 && TankVolume.jsRound(-2.6) == -3)
  #expect(TankVolume.jsRound(4503599627370497) == 4503599627370497)
}
