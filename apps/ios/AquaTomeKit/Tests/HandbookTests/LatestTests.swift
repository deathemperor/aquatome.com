import Foundation
import Testing
@testable import Handbook

// What's new as the site writes it (apps/site/src/lib/app-latest.ts).
let latestJSON = Data(#"""
{"version":1,"lang":"vi","entries":[
 {"date":"2026-10-28","path":"/vi/ca/ca-neon/","action":"updated","source":"Seriously Fish"},
 {"date":"2026-10-27","path":"/vi/ca/khong-co/","action":"new","source":"Aquarium Glaser"},
 {"date":"2026-10-27","path":"/vi/huong-dan/nuoi-ca-neon/","action":"new","source":"2Hr Aquarist"},
 {"date":"2026-10-20","path":"/vi/ca/ca-neon/","action":"new","source":"Seriously Fish"},
 {"date":"2026-10-19","path":"/vi/ca/ca-dia/","action":"renamed","source":"Seriously Fish"}],
 "web":"/vi/moi-cap-nhat/"}
"""#.utf8)

@Test func whatsNewReadsAsTheSiteWritesIt() throws {
  let latest = try JSONDecoder().decode(Latest.self, from: latestJSON)
  #expect(latest.lang == "vi")
  #expect(latest.web == "/vi/moi-cap-nhat/")
  #expect(latest.entries.count == 5)
  let first = try #require(latest.entries.first)
  #expect(first == .init(date: "2026-10-28", path: "/vi/ca/ca-neon/", action: "updated", source: "Seriously Fish"))
  // The date as the site's list writes it.
  #expect(first.shown == "28/10/2026")
  // Another version is another format: not read as this one.
  let v2 = Data(String(decoding: latestJSON, as: UTF8.self).replacingOccurrences(of: #""version":1"#, with: #""version":2"#).utf8)
  #expect(throws: DecodingError.self) { try JSONDecoder().decode(Latest.self, from: v2) }
}

// Each entry with its page from the index, in the site's order: a page the index doesn't have left out, a page updated
// twice there twice, an action this app doesn't know with no word for it.
@Test func whatsNewListsTheIndexsPagesInTheSitesOrder() throws {
  let latest = try JSONDecoder().decode(Latest.self, from: latestJSON)
  let items = [HandbookIndex.Item(kind: .fish, name: "Cá neon", path: "/vi/ca/ca-neon/"),
               HandbookIndex.Item(kind: .fish, name: "Cá đĩa", path: "/vi/ca/ca-dia/"),
               HandbookIndex.Item(kind: .guide, name: "Nuôi cá neon", path: "/vi/huong-dan/nuoi-ca-neon/")]
  let byPath = Dictionary(uniqueKeysWithValues: items.map { ($0.path, $0) })
  let rows = latest.rows { byPath[$0] }
  #expect(rows.map(\.item.path) == ["/vi/ca/ca-neon/", "/vi/huong-dan/nuoi-ca-neon/", "/vi/ca/ca-neon/", "/vi/ca/ca-dia/"])
  #expect(rows.map(\.entry.date) == ["2026-10-28", "2026-10-27", "2026-10-20", "2026-10-19"])
  #expect(Set(rows.map(\.id)).count == rows.count)
  #expect(rows.map(\.entry.isNew) == [false, true, true, false])
  #expect(rows.map(\.entry.isUpdate) == [true, false, false, false])
}

// The index names the file where the site has what's new, and the copy kept on the phone keeps it.
@Test func theIndexNamesWhatsNewAndItsKeptCopyKeepsIt() throws {
  let named = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"""
  {"version":1,"lang":"vi","items":[],"latest":"/app/latest/vi.json"}
  """#.utf8))
  #expect(named.latest == "/app/latest/vi.json")
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(named)).latest == "/app/latest/vi.json")
  // A site without it, or a value this app can't read: none, the index still read.
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: Data(#"{"version":1,"lang":"id","items":[]}"#.utf8)).latest == nil)
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: Data(#"{"version":1,"lang":"vi","items":[],"latest":7}"#.utf8)).latest == nil)
}
