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

// Typed with its accents, a search lists the pages that have them before those that match only without (Curation, 12 Nov,
// on the live index): "nấm" the fungus guides before "Năm loài Badis…", "lọc" the filters before the snakeheads (lóc),
// "la hán" the flowerhorn before "5 loài cá lạ hàng đầu…", and "cá đĩa" the discus, spelt đĩa or dĩa, before the
// eartheaters' "Cá địa…". Typed without, every page is still found.
@Test func typedWithItsAccentsASearchListsThePagesThatHaveThemFirst() {
  func page(_ name: String, _ kind: HandbookIndex.Kind = .guide, aka: [String]? = nil) -> HandbookIndex.Item {
    .init(kind: kind, name: name, aka: aka, path: "/vi/\(name)/")
  }
  func first(_ query: String, _ items: [HandbookIndex.Item], _ n: Int) -> Set<String> {
    Set(HandbookSearch(items).find(query).prefix(n).map(\.name))
  }
  let fungus = ["Cá bị nấm (nấm thủy mi): dấu hiệu, nguyên nhân, cách chữa và phòng", "Cá bị nấm miệng, nấm lưng (columnaris): nhận biết, cách chữa và phòng"]
  let five = [page("Năm loài Badis mới được mô tả từ West Bengal, Ấn Độ"), page("Cá ngựa nam", .fish), page("Cá lá Nam Mỹ", .fish),
              page("Cá barb năm vạch", .fish)] + fungus.map { page($0) }
  #expect(first("nấm", five, 2) == Set(fungus))
  let filters = ["Bi lọc sinh học (bio ball) trong bể cá", "Bộ lọc hoặc máy tách bọt (protein skimmer): có cần dùng cả hai không?",
                 "Tối ưu hóa lọc sinh học: Hướng dẫn lọc sinh học lý tưởng"]
  let loc = [page("Cá lóc bông", .fish), page("Cá lóc cầu vồng", .fish), page("Cá lóc Channa andrao", .fish)] + filters.map { page($0) }
  #expect(first("lọc", loc, 3) == Set(filters))
  let flowerhorn = "Nuôi cá la hán: chọn bể, nước, thức ăn và cách cho cá lên đầu"
  #expect(first("la hán", [page("5 loài cá lạ hàng đầu cho bể cá nước ngọt 40 lít"), page(flowerhorn)], 1) == [flowerhorn])
  let discus = ["Cá đĩa", "Cá dĩa lam phấn (Blue Diamond discus)", "Cá dĩa bồ câu (Pigeon Blood discus)"]
  let earth = [page("Cá hải hồ leucosticta", .fish, aka: ["Cá Satanoperca đốm trắng", "Cá địa đàn đốm trắng"]),
               page("Cá hải hồ pappaterra", .fish, aka: ["Cá ăn đất Pantanal", "Cá địa tinh Pantanal"])] + discus.map { page($0, .fish) }
  #expect(first("cá đĩa", earth, 3) == Set(discus))
  #expect(first("cá dĩa", earth, 3) == Set(discus))
  // Without accents: all of them, as before.
  #expect(HandbookSearch(loc).find("loc").count == loc.count)
  #expect(HandbookSearch(earth).find("ca dia").count == earth.count)
}
