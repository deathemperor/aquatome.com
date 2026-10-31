import Foundation
import Testing
@testable import Handbook

// The index as the site writes it (apps/site/src/lib/app-index.ts): a few real-shaped items.
let sample = Data(#"""
{"version":1,"lang":"vi","items":[
 {"kind":"fish","id":"symphysodon-aequifasciatus","name":"Cá đĩa","sub":"Symphysodon aequifasciatus","aka":["Discus"],"path":"/vi/ca/ca-dia/","img":"https://media.aquatome.com/x-480.webp"},
 {"kind":"fish","id":"paracheirodon-innesi","name":"Cá neon","sub":"Paracheirodon innesi","aka":["Neon tetra"],"path":"/vi/ca/ca-neon/"},
 {"kind":"fish","id":"paracheirodon-axelrodi","name":"Cá neon đỏ","sub":"Paracheirodon axelrodi","path":"/vi/ca/ca-neon-do/"},
 {"kind":"fish","id":"danio-rerio","name":"Cá ngựa vằn","sub":"Danio rerio","aka":["Zebra danio"],"path":"/vi/ca/ca-ngua-van/"},
 {"kind":"plant","id":"rotala-rotundifolia","name":"Rotala đỏ","sub":"Rotala rotundifolia","path":"/vi/cay/rotala-do/"},
 {"kind":"guide","name":"Nuôi cá neon trong bể nhỏ","path":"/vi/huong-dan/nuoi-ca-neon/"},
 {"kind":"glossary","name":"Đệm pH","path":"/vi/thuat-ngu/dem-ph/"},
 {"kind":"tool","name":"Đèn Chihiros","path":"/vi/cong-cu/den-chihiros/"}
]}
"""#.utf8)

func names(_ items: [HandbookIndex.Item]) -> [String] { items.map(\.name) }

@Test func readsTheSitesIndex() throws {
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: sample)
  #expect(ix.lang == "vi" && ix.items.count == 8)
  // The page's content id (what a tank's species hold) is kept apart from the item's identity (its page).
  #expect(ix.items[0].contentId == "symphysodon-aequifasciatus" && ix.items[0].id == "/vi/ca/ca-dia/")
  #expect(ix.items[5].contentId == nil)
  // A kind a newer site adds doesn't break the app's copy of the index.
  #expect(throws: (any Error).self) { try JSONDecoder().decode(HandbookIndex.Item.self, from: Data(#"{"kind":"video","name":"x","path":"/"}"#.utf8)) }
}

@Test func foldsAccentsAndTheVietnameseD() {
  #expect(HandbookSearch.fold("Cá Đĩa") == "ca dia")
  #expect(HandbookSearch.fold("Đệm pH") == "dem ph")
  #expect(HandbookSearch.fold("NGỰA VẰN") == "ngua van")
}

@Test func findsWhatReadersType() throws {
  let s = HandbookSearch(try JSONDecoder().decode(HandbookIndex.self, from: sample).items)
  #expect(names(s.find("ca dia")) == ["Cá đĩa"])                     // without accents
  #expect(names(s.find("discus")) == ["Cá đĩa"])                     // another name
  #expect(names(s.find("danio")) == ["Cá ngựa vằn"])                 // the scientific name
  #expect(names(s.find("van ngua")) == ["Cá ngựa vằn"])              // words in any order
  #expect(names(s.find("dem")) == ["Đệm pH"])                        // đ typed as d
  // The name itself first, then names starting with it, then names containing it.
  #expect(names(s.find("ca neon")) == ["Cá neon", "Cá neon đỏ", "Nuôi cá neon trong bể nhỏ"])
  #expect(names(s.find("neon")).prefix(2) == ["Cá neon", "Cá neon đỏ"])
  #expect(names(s.find("neon", kind: .guide)) == ["Nuôi cá neon trong bể nhỏ"])
  #expect(s.find("khong co").isEmpty)
}

@Test func anEmptySearchListsAKindInNameOrder() throws {
  let s = HandbookSearch(try JSONDecoder().decode(HandbookIndex.self, from: sample).items)
  #expect(names(s.find("", kind: .fish)) == ["Cá đĩa", "Cá neon", "Cá neon đỏ", "Cá ngựa vằn"])
  #expect(s.find("").count == 8)
}
