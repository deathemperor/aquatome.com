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

// A word typed with its marks finds that word (Design, 14 Nov: "lọc" found 207 pages, 52 of them snakeheads, "cá lóc", and
// Trúc phú quý, "phát lộc"); typed without, every word with its letters; with marks no page has, the marks are let go.
@Test func aWordTypedWithItsMarksFindsThatWordFirst() {
  let s = HandbookSearch([
    .init(kind: .equipment, name: "Bộ lọc thùng", path: "/vi/thiet-bi/loc-thung/"),
    .init(kind: .guide, name: "Lọc nước cho bể mới", path: "/vi/huong-dan/loc-nuoc/"),
    .init(kind: .fish, name: "Cá lóc bông", sub: "Channa micropeltes", path: "/vi/loai/channa-micropeltes/"),
    .init(kind: .plant, name: "Trúc phú quý", sub: "Dracaena sanderiana", aka: ["Phát lộc"], path: "/vi/cay/dracaena-sanderiana/"),
    .init(kind: .guide, name: "Bể thủy sinh đầu tiên", path: "/vi/huong-dan/be-dau-tien/"),
  ])
  let names = { (q: String) in Set(s.find(q).map(\.name)) }
  #expect(names("lọc") == ["Bộ lọc thùng", "Lọc nước cho bể mới"])
  #expect(names("lóc") == ["Cá lóc bông"])
  #expect(names("loc") == ["Bộ lọc thùng", "Lọc nước cho bể mới", "Cá lóc bông", "Trúc phú quý"])
  // The counts are of what's listed.
  #expect(s.findAndCount("lọc").counts[nil] == 2 && s.findAndCount("lọc").counts[.fish] == nil)
  // As it's typed: a word begun with its tone, and one with its letters' marks and no tone yet.
  #expect(names("lọ") == ["Bộ lọc thùng", "Lọc nước cho bể mới"])
  #expect(names("lộ") == ["Trúc phú quý"])
  // Marked and bare words together: each its own way.
  #expect(names("cá loc") == ["Cá lóc bông"])
  #expect(names("bộ loc") == ["Bộ lọc thùng"])
  // The tone on either vowel, as both are written: "thuỷ" finds "thủy".
  #expect(names("thuỷ sinh") == ["Bể thủy sinh đầu tiên"])
  // Marks no page has ("lõc", a slip of the tone): the marks let go, every "loc".
  #expect(names("lõc").count == 4)
  // Thai's own marks are not Vietnamese ones: its search is as it was.
  #expect(HandbookSearch.Marked.typed("ปลานีออน") == nil)
}
