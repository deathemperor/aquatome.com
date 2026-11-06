import Foundation
import Handbook
import Testing
@testable import TankCheck

// protocols/tankmates-vectors.json: the cases the site's tests run on the same code (apps/site/test/tank-check.test.ts).
// The app only writes fish, sizes and the names of fish without a page, so the cases read them here.
private struct Case: Decodable {
  let note: String
  let lang: String
  let fish: [TankCheck.Fish]
  let size: TankCheck.Size
  let unlisted: [String]
  let check: TankCheck

  enum CodingKeys: String, CodingKey { case note, lang, fish, size, unlisted, check }
  private struct Fish: Decodable {
    let name: String, count: Int?, key: String?, species: String?, facts: HandbookIndex.Facts
    enum CodingKeys: String, CodingKey { case name, count, key, species }
    init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      name = try c.decode(String.self, forKey: .name); count = try c.decodeIfPresent(Int.self, forKey: .count); facts = try .init(from: decoder)
      key = try c.decodeIfPresent(String.self, forKey: .key); species = try c.decodeIfPresent(String.self, forKey: .species)
    }
  }
  private struct Size: Decodable { struct Dims: Decodable { let l, w, h: Double }; let dims: Dims?; let litres: Double? }
  init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    note = try c.decode(String.self, forKey: .note); lang = try c.decode(String.self, forKey: .lang); check = try c.decode(TankCheck.self, forKey: .check)
    fish = try c.decode([Fish].self, forKey: .fish).map { .init(name: $0.name, facts: $0.facts, count: $0.count, key: $0.key, species: $0.species) }
    let s = try c.decode(Size.self, forKey: .size)
    size = .init(dims: s.dims.map { .init(l: $0.l, w: $0.w, h: $0.h) }, litres: s.litres)
    unlisted = try c.decodeIfPresent([String].self, forKey: .unlisted) ?? []
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
    #expect(checker.check(c.fish, size: c.size, unlisted: c.unlisted) == c.check, Comment(rawValue: c.note))
  }
}

@Test func fishWithoutAPageAreLeftOutOfTheCheckAndNamedInOneLine() {
  // The two cases with fish without a page: one beside a fish the check counts, one with only those.
  let these = cases.filter { !$0.unlisted.isEmpty }
  #expect(these.count == 2 && these.contains { $0.fish.isEmpty })
  let checker = TankChecker(lang: "vi")
  for c in these {
    let check = checker.check(c.fish, size: c.size, unlisted: c.unlisted)
    #expect(check == c.check, Comment(rawValue: c.note))
    #expect(check?.unchecked == "Chưa kiểm tra \(c.unlisted.joined(separator: ", ")): cẩm nang chưa có trang nên chưa có số liệu để so.")
  }
  // Without them, nothing is said of them.
  #expect(checker.check(these[0].fish, size: these[0].size)?.unchecked == nil)
}

@Test func sendsAFishsFiguresUnderTheSitesNames() throws {
  let fish = TankCheck.Fish(name: "Cá neon", facts: .init(ph: .init(min: 5, max: 7), sizeCm: 4, temperament: "peaceful"), count: 12)
  let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(fish)) as! [String: Any]
  #expect(json["name"] as? String == "Cá neon" && json["count"] as? Int == 12 && json["sizeCm"] as? Double == 4)
  #expect(json["temperament"] as? String == "peaceful" && (json["ph"] as? [String: Double]) == ["min": 5, "max": 7])
  #expect(json["tempC"] == nil && json["key"] == nil)
  // A breed counted as its species: what it counts as, and the species' name for a group.
  let breed = TankCheck.Fish(name: "Cá betta Halfmoon", facts: .init(), count: 1, key: "betta-splendens", species: "Cá betta (cá xiêm)")
  let row = try JSONSerialization.jsonObject(with: JSONEncoder().encode(breed)) as! [String: Any]
  #expect(row["key"] as? String == "betta-splendens" && row["species"] as? String == "Cá betta (cá xiêm)")
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

@Test func aPageOnTheTankTwiceIsCheckedAsOneFishWithItsCountsAddedUp() {
  // On the tank from its page, and again by name from before the page existed (an entry the page now matches): rows with
  // one key, which the site's code makes one fish (tank-check.ts oneFishEach, its own cases in the site's test).
  let checker = TankChecker(lang: "vi"), size = TankCheck.Size(dims: .init(l: 60, w: 30, h: 36))
  func neon(_ n: Int?) -> TankCheck.Fish { .init(name: "Cá neon", facts: .init(sizeCm: 4, schoolMin: 6), count: n, key: "neon") }
  let betta = TankCheck.Fish(name: "Cá betta", facts: .init(sizeCm: 7), count: 1, key: "betta")
  func same(_ rows: [TankCheck.Fish], _ fish: [TankCheck.Fish]) -> Bool { checker.check(rows, size: size) == checker.check(fish, size: size) }
  #expect(same([neon(10), betta, neon(5)], [neon(15), betta]))
  // A row without a count is read as the school size, so the other row's 4 doesn't bring the 6 down; 10 is more.
  #expect(same([neon(nil), neon(4)], [neon(6)]))
  #expect(same([neon(4), neon(nil)], [neon(6)]))
  #expect(same([neon(nil), neon(10)], [neon(10)]))
  // No school size: one.
  func shrimp(_ n: Int?) -> TankCheck.Fish { .init(name: "Tép", facts: .init(sizeCm: 3), count: n, key: "tep") }
  #expect(same([shrimp(nil), shrimp(3)], [shrimp(3)]))
  // None given stays none, read as the school size once.
  #expect(same([neon(nil), neon(nil)], [neon(nil)]))
  // Rows with keys of their own stay two fish.
  #expect(!same([neon(4), .init(name: "Cá neon", facts: .init(sizeCm: 4, schoolMin: 6), count: 4, key: "neon 2")], [neon(8)]))
}
