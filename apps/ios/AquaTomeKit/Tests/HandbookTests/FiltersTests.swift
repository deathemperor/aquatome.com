import Foundation
import Testing
@testable import Handbook

// protocols/filter-vectors.json: the cases the site's tests run on its own filters (apps/site/test/filter-vectors.test.ts).
private struct Vectors: Decodable, Sendable {
  struct Fish: Decodable, Sendable {
    let name: String
    let tempC: HandbookIndex.Facts.Range?, ph: HandbookIndex.Facts.Range?, tankCm: Double?, difficulty: Double?
  }
  struct Plant: Decodable, Sendable { let name: String; let light: String?; let co2: String?; let difficulty: Int? }
  struct FishQuery: Decodable, Sendable { let tankCm: Double?, tempC: Double?, ph: Double?, difficultyMax: Double? }
  struct PlantQuery: Decodable, Sendable { let light: String?, co2: String?, difficultyMax: Int? }
  struct Case<Q: Decodable & Sendable>: Decodable, Sendable { let note: String; let query: Q; let fit: [String]; let unsure: [String] }
  let species: [Fish], speciesCases: [Case<FishQuery>], plants: [Plant], plantCases: [Case<PlantQuery>]
}
private let v: Vectors = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url.appendingPathComponent("protocols/filter-vectors.json")))
}()

@Test func filtersFishAsTheSitesListDoes() {
  let items = v.species.map { f in
    HandbookIndex.Item(kind: .fish, contentId: f.name, name: f.name, sub: "Genus species", path: "/vi/ca/\(f.name)/",
                       facts: .init(tempC: f.tempC, ph: f.ph, tankCm: f.tankCm, difficulty: f.difficulty))
  }
  #expect(v.speciesCases.count > 3)
  for c in v.speciesCases {
    let q = c.query
    let (fit, unsure) = FishFilter(tankCm: q.tankCm, tempC: q.tempC, ph: q.ph, difficultyMax: q.difficultyMax).split(items)
    #expect(fit.map(\.name) == c.fit, Comment(rawValue: c.note))
    #expect(unsure.map(\.name) == c.unsure, Comment(rawValue: c.note))
  }
}

@Test func filtersPlantsAsTheSitesListDoes() {
  let items = v.plants.map { p in
    HandbookIndex.Item(kind: .plant, contentId: p.name, name: p.name, path: "/vi/cay/\(p.name)/", plant: .init(difficulty: p.difficulty, light: p.light, co2: p.co2))
  }
  for c in v.plantCases {
    let (fit, unsure) = PlantFilter(light: c.query.light, co2: c.query.co2, difficultyMax: c.query.difficultyMax).split(items)
    #expect(fit.map(\.name) == c.fit, Comment(rawValue: c.note))
    #expect(unsure.map(\.name) == c.unsure, Comment(rawValue: c.note))
  }
}

@Test func aBreedIsOnlyInTheListWithNoFilter() {
  let breed = HandbookIndex.Item(kind: .fish, contentId: "halfmoon", name: "Betta halfmoon", path: "/vi/ca/halfmoon/")
  #expect(FishFilter().split([breed]).fit.count == 1)
  let set = FishFilter(tankCm: 60).split([breed])
  #expect(set.fit.isEmpty && set.unsure.isEmpty)
}
