import Foundation
import Testing
@testable import Handbook

// protocols/search-vectors.json: the cases the site's tests run on its own search's order (apps/site/test/search-rank.test.ts).
private struct Vectors: Decodable, Sendable {
  struct Item: Decodable, Sendable { let name: String; let sub: String?; let aka: [String]?; let kind: HandbookIndex.Kind }
  struct Case: Decodable, Sendable { let note: String; let query: String; let items: [Item]; let first: [String] }
  let cases: [Case]
}
private let v: Vectors = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url.appendingPathComponent("protocols/search-vectors.json")))
}()

@Test func aPageNamedWhatWasSearchedForComesFirstAsOnTheSite() {
  #expect(v.cases.count > 5)
  for c in v.cases {
    let s = HandbookSearch(c.items.map { .init(kind: $0.kind, name: $0.name, sub: $0.sub, aka: $0.aka, path: "/vi/\($0.name)/") })
    let found = s.find(c.query).map(\.name)
    #expect(Set(found.prefix(c.first.count)) == Set(c.first), Comment(rawValue: "\(c.note): \(found.joined(separator: " · "))"))
  }
}
