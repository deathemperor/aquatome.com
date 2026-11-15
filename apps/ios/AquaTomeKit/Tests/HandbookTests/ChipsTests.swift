import Foundation
import Testing
@testable import Handbook

/// Two of the live Vietnamese index's chips as aquatome.com/app/vi.json sent them on 15 Nov (`home.chips`; `AppChip` in
/// apps/site/src/lib/app-index.ts): Dĩa, with guides and video guides, and La hán, whose video guides the site leaves out
/// as it has none.
private let dia = #"{"id":"dia","name":"Dĩa","order":5,"count":4,"members":["symphysodon-aequifasciatus","symphysodon-discus","blue-diamond-discus","pigeon-blood-discus"],"img":"https://media.aquatome.com/commons/d0e12f6f5895d15d-480.webp","imgBox":{"x":0.2908,"y":0.0485,"w":0.5667,"h":0.8332},"guides":["/vi/huong-dan/huong-dan-cham-soc-ca-dia-vua-cua-be-ca-nuoc-ngot/","/vi/huong-dan/ca-dia-di-phan-trang/","/vi/huong-dan/phan-loai-ca-dia/"],"videos":["/vi/huong-dan/tu-lam-thuc-an-dong-lanh-cho-ca-dia-tu-tim-bo-tom-ca-thit/","/vi/huong-dan/set-be-loc-tran-nuoi-ca-than-tien-ca-dia-kinh-nghiem-sau-4/","/vi/huong-dan/nuoi-ca-dia-trong-be-thuy-sinh-chon-cay-lam-nen-va-cham-soc/","/vi/huong-dan/tu-lam-thuc-an-dong-lanh-cho-ca-tu-tim-bo-tom-va-dau-ha-lan/","/vi/huong-dan/cac-benh-thuong-gap-o-ca-dia-va-cach-chua-tai-nha/","/vi/huong-dan/nuoi-cap-ca-dia-trong-phong-khach-vi-sao-de-that-bai/","/vi/huong-dan/cach-tu-lam-thuc-an-cho-ca-dia-tu-tim-bo-tom-ca-ro-phi-va/"]}"#
private let laHan = #"{"id":"la-han","name":"La hán","order":7,"count":1,"members":["flowerhorn-cichlid"],"img":"https://media.aquatome.com/commons/19baaafa3f516888-480.webp","imgBox":{"x":0.1458,"y":0.04,"w":0.6992,"h":0.8967},"guides":["/vi/huong-dan/nuoi-ca-la-han/"]}"#

/// An index with some of those chips' pages, but not all: two of Dĩa's four (a species and a breed), one of its guides and
/// one of its video guides, and nothing of La hán's.
private let items = #"[{"kind":"fish","id":"symphysodon-aequifasciatus","name":"Cá đĩa","path":"/vi/ca/ca-dia/"},"#
  + #"{"kind":"fish","id":"blue-diamond-discus","name":"Cá đĩa Blue Diamond","path":"/vi/ca/ca-dia-blue-diamond/"},"#
  + #"{"kind":"guide","name":"Phân loại cá đĩa","path":"/vi/huong-dan/phan-loai-ca-dia/"},"#
  + #"{"kind":"guide","name":"Các bệnh thường gặp ở cá đĩa","path":"/vi/huong-dan/cac-benh-thuong-gap-o-ca-dia-va-cach-chua-tai-nha/","video":600}]"#

/// `chips`: the home's `chips` as JSON, or nil for a home without them.
private func index(_ chips: String?) throws -> HandbookIndex {
  let json = #"{"version":1,"lang":"vi","items":"# + items + #","home":{"fish":["/vi/ca/ca-dia/"],"plants":[],"guides":[]"#
    + (chips.map { #","chips":"# + $0 } ?? "") + "}}"
  return try JSONDecoder().decode(HandbookIndex.self, from: Data(json.utf8))
}

@Test func theLiveChipsComeWhole() throws {
  let chips = try #require(try index("[\(dia),\(laHan)]").home?.chips)
  #expect(chips.map(\.id) == ["dia", "la-han"])
  #expect(chips[0] == .init(id: "dia", name: "Dĩa", order: 5, count: 4,
                            members: ["symphysodon-aequifasciatus", "symphysodon-discus", "blue-diamond-discus", "pigeon-blood-discus"],
                            img: "https://media.aquatome.com/commons/d0e12f6f5895d15d-480.webp",
                            imgBox: .init(x: 0.2908, y: 0.0485, w: 0.5667, h: 0.8332),
                            guides: ["/vi/huong-dan/huong-dan-cham-soc-ca-dia-vua-cua-be-ca-nuoc-ngot/", "/vi/huong-dan/ca-dia-di-phan-trang/",
                                     "/vi/huong-dan/phan-loai-ca-dia/"],
                            videos: ["/vi/huong-dan/tu-lam-thuc-an-dong-lanh-cho-ca-dia-tu-tim-bo-tom-ca-thit/",
                                     "/vi/huong-dan/set-be-loc-tran-nuoi-ca-than-tien-ca-dia-kinh-nghiem-sau-4/",
                                     "/vi/huong-dan/nuoi-ca-dia-trong-be-thuy-sinh-chon-cay-lam-nen-va-cham-soc/",
                                     "/vi/huong-dan/tu-lam-thuc-an-dong-lanh-cho-ca-tu-tim-bo-tom-va-dau-ha-lan/",
                                     "/vi/huong-dan/cac-benh-thuong-gap-o-ca-dia-va-cach-chua-tai-nha/",
                                     "/vi/huong-dan/nuoi-cap-ca-dia-trong-phong-khach-vi-sao-de-that-bai/",
                                     "/vi/huong-dan/cach-tu-lam-thuc-an-cho-ca-dia-tu-tim-bo-tom-ca-ro-phi-va/"]))
  // No video guides, so the site leaves them out: none, not a chip lost.
  #expect(chips[1].guides == ["/vi/huong-dan/nuoi-ca-la-han/"] && chips[1].videos == [])
  #expect(try index(#"[{"id":"koi","name":"Koi","order":1,"count":1,"members":["koi"]}]"#).home?.chips.first.map { $0.guides + $0.videos } == [])
}

@Test func theChipsAreInTheirOrderWhateverTheListsOrder() throws {
  #expect(try index("[\(laHan),\(dia)]").home?.chips.map(\.id) == ["dia", "la-han"])
}

@Test func aChipThisAppCantReadCostsOnlyThatChip() throws {
  // No order; then an order that isn't a number; then a box outside its photo, which keeps the photo without it.
  let ix = try index(#"[{"id":"x","name":"X","count":1,"members":["a"]},"# + dia
    + #",{"id":"y","name":"Y","order":"3","count":1,"members":["a"]},"#
    + #"{"id":"z","name":"Z","order":9,"count":1,"members":["a"],"img":"https://media.aquatome.com/z.webp","imgBox":{"x":0.8,"y":0,"w":0.5,"h":1}}]"#)
  let chips = try #require(ix.home?.chips)
  #expect(chips.map(\.id) == ["dia", "z"])
  #expect(chips[1].img != nil && chips[1].imgBox == nil)
  // And the rest of the home stays.
  #expect(ix.home?.fish == ["/vi/ca/ca-dia/"])
}

@Test func anIndexWithNoChipsHasNone() throws {
  #expect(try index(nil).home?.chips == [])
  #expect(try index(#"{"dia":1}"#).home?.chips == [])
  #expect(try HandbookShelves(index(nil)).chips.isEmpty)
}

@Test func aChipsShelfHasThePagesThisIndexHasInTheChipsOrder() throws {
  let s = try HandbookShelves(index("[\(dia),\(laHan)]"))
  // La hán's one fish isn't in this index: no chip, not an empty one.
  #expect(s.chips.map(\.id) == ["dia"])
  let shelf = try #require(s.chips.first)
  #expect(shelf.chip.name == "Dĩa" && shelf.chip.count == 4)
  // Two of its four, in the chip's order; one of its guides; one of its video guides.
  #expect(shelf.pages.map(\.path) == ["/vi/ca/ca-dia/", "/vi/ca/ca-dia-blue-diamond/"])
  #expect(shelf.guides.map(\.path) == ["/vi/huong-dan/phan-loai-ca-dia/"])
  #expect(shelf.videos.map(\.path) == ["/vi/huong-dan/cac-benh-thuong-gap-o-ca-dia-va-cach-chua-tai-nha/"])
}

@Test func theChipsSurviveTheIndexKeptOnThePhone() throws {
  // The index is kept as the app encodes it, and read back on the next launch, offline.
  let ix = try index("[\(dia),\(laHan)]")
  let again = try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(ix))
  #expect(again.home?.chips == ix.home?.chips && again.home?.chips.count == 2)
}
