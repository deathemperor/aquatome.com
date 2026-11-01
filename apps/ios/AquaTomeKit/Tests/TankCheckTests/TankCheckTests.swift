import Foundation
import Handbook
import Testing
@testable import TankCheck

// protocols/tankmates-vectors.json: the cases the site's tests run on the same code (apps/site/test/tank-check.test.ts).
// The app only writes fish and sizes, so the cases read them here.
private struct Case: Decodable {
  let note: String
  let lang: String
  let fish: [TankCheck.Fish]
  let size: TankCheck.Size
  let check: TankCheck

  enum CodingKeys: String, CodingKey { case note, lang, fish, size, check }
  private struct Fish: Decodable {
    let name: String, count: Int?, facts: HandbookIndex.Facts
    enum CodingKeys: String, CodingKey { case name, count }
    init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      name = try c.decode(String.self, forKey: .name); count = try c.decodeIfPresent(Int.self, forKey: .count); facts = try .init(from: decoder)
    }
  }
  private struct Size: Decodable { struct Dims: Decodable { let l, w, h: Double }; let dims: Dims?; let litres: Double? }
  init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    note = try c.decode(String.self, forKey: .note); lang = try c.decode(String.self, forKey: .lang); check = try c.decode(TankCheck.self, forKey: .check)
    fish = try c.decode([Fish].self, forKey: .fish).map { .init(name: $0.name, facts: $0.facts, count: $0.count) }
    let s = try c.decode(Size.self, forKey: .size)
    size = .init(dims: s.dims.map { .init(l: $0.l, w: $0.w, h: $0.h) }, litres: s.litres)
  }
}
private let cases: [Case] = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  struct File: Decodable { let cases: [Case] }
  return try! JSONDecoder().decode(File.self, from: Data(contentsOf: url.appendingPathComponent("protocols/tankmates-vectors.json"))).cases
}()

@Test func checksATankAsTheSitesToolDoesInEachLanguage() {
  #expect(cases.count > 8)
  #expect(Set(cases.map(\.lang)) == ["vi", "id", "th"])
  var checkers: [String: TankChecker] = [:]
  for c in cases {
    let checker = checkers[c.lang] ?? TankChecker(lang: c.lang)
    checkers[c.lang] = checker
    #expect(checker.check(c.fish, size: c.size) == c.check, Comment(rawValue: c.note))
  }
}

@Test func sendsAFishsFiguresUnderTheSitesNames() throws {
  let fish = TankCheck.Fish(name: "Cá neon", facts: .init(ph: .init(min: 5, max: 7), sizeCm: 4, temperament: "peaceful"), count: 12)
  let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(fish)) as! [String: Any]
  #expect(json["name"] as? String == "Cá neon" && json["count"] as? Int == 12 && json["sizeCm"] as? Double == 4)
  #expect(json["temperament"] as? String == "peaceful" && (json["ph"] as? [String: Double]) == ["min": 5, "max": 7])
  #expect(json["tempC"] == nil)
}

@Test func oneFishAndNoSizeGivesNoVerdictButTheTankItNeeds() {
  let check = TankChecker(lang: "vi").check([.init(name: "Cá đĩa", facts: .init(tankCm: 120), count: nil)], size: .init())
  #expect(check?.verdict == nil && check?.stocking == nil)
  #expect(check?.minTank == "Bể dài tối thiểu cho cả nhóm: 120 cm.")
}

@Test func fishWithNoSizeGetNoMeterOnlyWhatWasntCounted() {
  let check = TankChecker(lang: "vi").check([.init(name: "Cá la hán", facts: .init(), count: 5)], size: .init(litres: 60))
  #expect(check?.stocking == nil)
  #expect(check?.unsized == "Chưa có kích thước của Cá la hán: chưa tính vào mật độ.")
}
