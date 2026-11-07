import Foundation
import Testing
@testable import Handbook

// The taxon and origin pages the app draws as shelves (HandbookShelves.page(at:)), from the index's `tax`, `from`,
// `places` and words (apps/site/src/lib/app-index.ts, taxa-places.ts; pages/phan-loai, pages/nguon-goc).

private func fish(_ id: String, _ tax: [String]?, from: [String] = [], lang: String = "vi") -> HandbookIndex.Item {
  .init(kind: .fish, contentId: id, name: id, path: "/\(lang)/ca/\(id)/", tax: tax, from: from)
}

private let viWords = HandbookIndex.Labels([
  "taxon": ["title": "Phân loại", "order": "Bộ", "family": "Họ", "genus": "Chi", "intro": "{level} {name}: {n} loài."],
  "origin": ["title": "Nguồn gốc", "intro": "{n} loài có nguồn gốc từ {place}."],
  "placeTitle": ["vietnam": "Cá Việt Nam"],
  "placeIntro": ["vietnam": "Những loài cá có nguồn gốc từ sông suối Việt Nam."],
])

private let places: [HandbookIndex.Place] = [
  .init(id: "asia", name: "Châu Á", kind: .continent),
  .init(id: "india", name: "Ấn Độ", kind: .country, parent: "asia", kids: ["Assam", "Kerala"]),
  .init(id: "south-america", name: "Nam Mỹ", kind: .continent),
  .init(id: "peru", name: "Peru", kind: .country, parent: "south-america"),
  .init(id: "vietnam", name: "Việt Nam", kind: .country, parent: "asia"),
]

private let items: [HandbookIndex.Item] = [
  fish("neon", ["Characiformes", "Characidae", "Paracheirodon"], from: ["south-america", "peru"]),
  fish("zebra", ["Cypriniformes", "Cyprinidae", "Danio"], from: ["asia", "india"]),
  fish("loach", ["Cypriniformes", "Cobitidae", "Pangio"], from: ["asia"]),
  fish("pearl", ["Cypriniformes", "Cyprinidae", "Danio"], from: ["asia", "india"]),
  fish("rasbora", ["Cypriniformes", "Cyprinidae", "Rasbora"]),
  fish("sucker", ["Cypriniformes", "Catostomidae", "Myxocyprinus"]),
  fish("botia", ["Cypriniformes", "Botiidae", "Botia"]),
  fish("betta", ["Anabantiformes", "Osphronemidae", "Betta"], from: ["asia", "vietnam"]),
  .init(kind: .fish, contentId: "zebra-gold", name: "Ngựa vằn vàng", path: "/vi/ca/zebra-gold/"),
  .init(kind: .guide, name: "Nuôi cá", path: "/vi/huong-dan/nuoi-ca/"),
]

private let vi = HandbookShelves(HandbookIndex(lang: "vi", items: items, labels: viWords, places: places))

@Test func aTaxonPageListsItsFishInTheListsOrderAndTheRankBelowMostFishFirst() throws {
  let order = try #require(vi.page(at: "/vi/phan-loai/cypriniformes/"))
  #expect(order.kind == .taxon && order.title == "Cypriniformes" && !order.italic)
  #expect(order.intro == "Bộ Cypriniformes: 6 loài.")
  #expect(order.fish.map(\.contentId) == ["zebra", "loach", "pearl", "rasbora", "sucker", "botia"], "the index's order, no breed")
  // The most fish first; on a tie, the Latin name in plain character order (not the index's order).
  #expect(order.links.map(\.title) == ["Cyprinidae", "Botiidae", "Catostomidae", "Cobitidae"])
  #expect(order.links.map(\.count) == [3, 1, 1, 1])
  #expect(order.links[0].path == "/vi/phan-loai/cypriniformes/cyprinidae/")
  #expect(order.item == .init(kind: .taxon, name: "Cypriniformes", path: "/vi/phan-loai/cypriniformes/"))

  let genus = try #require(vi.page(at: "/vi/phan-loai/cypriniformes/cyprinidae/danio/"))
  #expect(genus.title == "Danio" && genus.italic)
  // The way up, as the site's trail: the section's first page, the order, the family.
  #expect(genus.up.map(\.title) == ["Phân loại", "Cypriniformes", "Cyprinidae"])
  #expect(genus.up.map(\.path) == ["/vi/phan-loai/", "/vi/phan-loai/cypriniformes/", "/vi/phan-loai/cypriniformes/cyprinidae/"])
  #expect(order.up.map(\.path) == ["/vi/phan-loai/"])
  #expect(genus.intro == "Chi Danio: 2 loài.")
  #expect(genus.links.isEmpty)
  let family = try #require(vi.page(at: "/vi/phan-loai/cypriniformes/cyprinidae/"))
  #expect(family.links.map(\.title) == ["Danio", "Rasbora"] && family.links.allSatisfy(\.italic), "genera in italics")
}

@Test func theTaxonomysFirstPageListsTheOrdersWithoutFish() throws {
  let root = try #require(vi.page(at: "/vi/phan-loai/"))
  #expect(root.title == "Phân loại" && root.intro == nil && root.fish.isEmpty && root.up.isEmpty)
  #expect(root.links.map(\.title) == ["Cypriniformes", "Anabantiformes", "Characiformes"])
  #expect(root.links.map(\.count) == [6, 1, 1])
}

@Test func aRankWithNoNameIsSkippedInTheAddressAndEachPageKeepsItsRank() throws {
  // As the site's pages (#521): a family with no order is /vi/phan-loai/lymnaeidae/, still a family, listed among the
  // orders with its rank's word; a fish with no genus gives no genus.
  let s = HandbookShelves(HandbookIndex(lang: "vi", items: [
    fish("oc-tai", ["", "Lymnaeidae", "Radix"]), fish("oc-ao", ["", "Lymnaeidae", "Peregriana"]),
    fish("loach", ["Cypriniformes", "Cobitidae", "Pangio"]), fish("loach-2", ["Cypriniformes", "Cobitidae", ""]),
    fish("barb", ["Cypriniformes", "Cyprinidae", "Puntius"]), fish("mystery", ["Zeiformes", "", ""]),
  ], labels: viWords))
  let root = try #require(s.page(at: "/vi/phan-loai/"))
  #expect(root.links.map(\.title) == ["Cypriniformes", "Họ Lymnaeidae", "Zeiformes"], "most fish first, then the Latin name")
  #expect(root.links.map(\.path) == ["/vi/phan-loai/cypriniformes/", "/vi/phan-loai/lymnaeidae/", "/vi/phan-loai/zeiformes/"])
  #expect(root.links.map(\.count) == [3, 2, 1])
  let family = try #require(s.page(at: "/vi/phan-loai/lymnaeidae/"))
  #expect(family.title == "Lymnaeidae" && !family.italic && family.intro == "Họ Lymnaeidae: 2 loài.")
  #expect(family.links.map(\.title) == ["Peregriana", "Radix"] && family.links.allSatisfy(\.italic))
  #expect(family.links[1].path == "/vi/phan-loai/lymnaeidae/radix/")
  let genus = try #require(s.page(at: "/vi/phan-loai/lymnaeidae/radix/"))
  #expect(genus.italic && genus.intro == "Chi Radix: 1 loài." && genus.fish.map(\.contentId) == ["oc-tai"])
  #expect(genus.up.map(\.title) == ["Phân loại", "Lymnaeidae"] && genus.up.last?.path == "/vi/phan-loai/lymnaeidae/", "no empty step up")
  // No genus: counted in its family, with no genus of its own.
  let cobitidae = try #require(s.page(at: "/vi/phan-loai/cypriniformes/cobitidae/"))
  #expect(cobitidae.fish.count == 2 && cobitidae.links.map(\.title) == ["Pangio"])
  #expect(try #require(s.page(at: "/vi/phan-loai/zeiformes/")).links.isEmpty)
  // A genus with no family, under its order: among the families, with its rank's word.
  let skipped = HandbookShelves(HandbookIndex(lang: "vi", items: [
    fish("a", ["Cypriniformes", "Cyprinidae", "Danio"]), fish("b", ["Cypriniformes", "", "Garra"]),
  ], labels: viWords))
  #expect(try #require(skipped.page(at: "/vi/phan-loai/cypriniformes/")).links.map(\.title) == ["Cyprinidae", "Chi Garra"])
  #expect(skipped.page(at: "/vi/phan-loai/cypriniformes/garra/")?.intro == "Chi Garra: 1 loài.")
  // The empty step the site used to give: not a page.
  #expect(s.page(at: "/vi/phan-loai//lymnaeidae/")?.title == "Lymnaeidae", "an empty step is no step, as the site redirects it")
  #expect(s.page(at: "/vi/phan-loai/cypriniformes/lymnaeidae/") == nil)
}

@Test func anOriginPageListsTheFishThatNameThePlaceAndItsCountriesOrRivers() throws {
  let asia = try #require(vi.page(at: "/vi/nguon-goc/asia/"))
  #expect(asia.kind == .origin && asia.title == "Châu Á")
  #expect(asia.intro == "4 loài có nguồn gốc từ Châu Á.")
  #expect(asia.fish.map(\.contentId) == ["zebra", "loach", "pearl", "betta"], "those naming the continent itself")
  #expect(asia.links.map(\.title) == ["Ấn Độ", "Việt Nam"], "its countries, in the index's order")
  #expect(asia.links[0].path == "/vi/nguon-goc/asia/india/" && asia.links[0].count == nil)

  let india = try #require(vi.page(at: "/vi/nguon-goc/asia/india/"))
  #expect(india.fish.map(\.contentId) == ["zebra", "pearl"])
  #expect(india.links.isEmpty && india.words == ["Assam", "Kerala"], "rivers and regions: words, no page")
  #expect(india.up.map(\.title) == ["Nguồn gốc", "Châu Á"] && india.up.map(\.path) == ["/vi/nguon-goc/", "/vi/nguon-goc/asia/"])
  #expect(asia.up.map(\.path) == ["/vi/nguon-goc/"])
  // A place's own heading and line, in place of its name and the counted one.
  let vietnam = try #require(vi.page(at: "/vi/nguon-goc/asia/vietnam/"))
  #expect(vietnam.title == "Cá Việt Nam" && vietnam.intro == "Những loài cá có nguồn gốc từ sông suối Việt Nam.")
  #expect(vietnam.item == .init(kind: .origin, name: "Cá Việt Nam", path: "/vi/nguon-goc/asia/vietnam/"))

  let root = try #require(vi.page(at: "/vi/nguon-goc/"))
  #expect(root.title == "Nguồn gốc" && root.fish.isEmpty && root.links.map(\.title) == ["Châu Á", "Nam Mỹ"])
}

@Test func aPageIsFoundByTheLinksPathInEitherFormAndGivesItsLinksInTheIndexs() throws {
  // A link at the root, with no end slash, a query or an anchor, in capitals: the same page.
  #expect(vi.page(at: "/phan-loai/Cypriniformes")?.title == "Cypriniformes")
  #expect(vi.page(at: "/nguon-goc/asia/india/?x=1#ca")?.title == "Ấn Độ")
  // An index at the root gives its links there.
  let atRoot = HandbookShelves(HandbookIndex(lang: "vi", items: items.map {
    .init(kind: $0.kind, contentId: $0.contentId, name: $0.name, path: String($0.path.dropFirst(3)), tax: $0.tax, from: $0.from)
  }, labels: viWords, places: places))
  let order = try #require(atRoot.page(at: "/vi/phan-loai/cypriniformes/"))
  #expect(order.item.path == "/phan-loai/cypriniformes/" && order.links[0].path == "/phan-loai/cypriniformes/cyprinidae/")
}

@Test func withoutWhatAPageListsItStaysTheWebPage() {
  // A taxon none of the fish is in, a place with no page, a country under the wrong continent, too deep, another section.
  for path in ["/vi/phan-loai/siluriformes/", "/vi/phan-loai/cypriniformes/cyprinidae/danio/rerio/", "/vi/nguon-goc/europe/",
               "/vi/nguon-goc/south-america/india/", "/vi/nguon-goc/asia/india/kerala/", "/vi/ca/neon/", "/vi/", "/"] {
    #expect(vi.page(at: path) == nil, "\(path)")
  }
  // Another language's page: the index is Vietnamese.
  #expect(vi.page(at: "/id/taksonomi/cypriniformes/") == nil)
  #expect(vi.page(at: "/en/taxonomy/cypriniformes/") == nil)
  // A language the site gives no taxa, places or their words (English today), or a site older than them: the web page.
  let en = HandbookShelves(HandbookIndex(lang: "en", items: items.map { fish($0.contentId ?? "x", nil, lang: "en") }))
  #expect(en.page(at: "/en/taxonomy/") == nil && en.page(at: "/en/origin/asia/") == nil)
  let older = HandbookShelves(HandbookIndex(lang: "vi", items: items.map { fish($0.contentId ?? "x", nil) }))
  #expect(older.page(at: "/vi/phan-loai/") == nil && older.page(at: "/vi/nguon-goc/") == nil)
  // Words but no taxa or places on the fish (a language whose pages aren't built yet): none either.
  let noData = HandbookShelves(HandbookIndex(lang: "vi", items: items.map { fish($0.contentId ?? "x", nil) }, labels: viWords))
  #expect(noData.page(at: "/vi/phan-loai/") == nil && noData.page(at: "/vi/nguon-goc/") == nil)
}

@Test func indonesianAndThaiPagesUseTheirOwnSectionWords() throws {
  let id = HandbookShelves(HandbookIndex(lang: "id", items: items.map {
    .init(kind: $0.kind, contentId: $0.contentId, name: $0.name, path: $0.path.replacingOccurrences(of: "/vi/", with: "/id/"), tax: $0.tax, from: $0.from)
  }, labels: .init(["taxon": ["title": "Klasifikasi", "order": "Ordo", "intro": "{level} {name}: {n} spesies."], "origin": ["title": "Asal"]]),
     places: places))
  #expect(try #require(id.page(at: "/id/taksonomi/cypriniformes/")).intro == "Ordo Cypriniformes: 6 spesies.")
  #expect(try #require(id.page(at: "/id/asal/asia/india/")).links.isEmpty)
  #expect(id.page(at: "/id/phan-loai/cypriniformes/") == nil, "the Vietnamese word")
  let th = HandbookShelves(HandbookIndex(lang: "th", items: [fish("betta", ["Anabantiformes", "Osphronemidae", "Betta"], lang: "th")],
                                         labels: .init(["taxon": ["title": "อนุกรมวิธาน"]])))
  #expect(th.page(at: "/th/taxonomy/anabantiformes/osphronemidae/")?.links.map(\.path) == ["/th/taxonomy/anabantiformes/osphronemidae/betta/"])
}

@Test func theIndexReadsTaxaAndPlacesLenientlyAndKeepsThem() throws {
  let json = #"""
  {"version":1,"lang":"vi","items":[
    {"kind":"fish","id":"neon","name":"Cá neon","path":"/vi/ca/ca-neon/","tax":["Characiformes","Characidae","Paracheirodon"],"from":["peru"]},
    {"kind":"fish","id":"odd","name":"Lạ","path":"/vi/ca/la/","tax":["Characiformes"],"from":"peru"}],
   "places":[{"id":"south-america","name":"Nam Mỹ","kind":"continent"},{"id":"peru","name":"Peru","kind":"country","parent":"south-america","kids":["Ucayali"]},
             {"id":"amazon","name":"Amazon","kind":"river"},{"id":"x"}]}
  """#
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: Data(json.utf8))
  #expect(ix.items.count == 2, "an item with taxa or places it can't read is kept without them")
  #expect(ix.items[0].tax == ["Characiformes", "Characidae", "Paracheirodon"] && ix.items[0].from == ["peru"])
  #expect(ix.items[1].tax == nil && ix.items[1].from.isEmpty)
  #expect(ix.places.map(\.id) == ["south-america", "peru"], "a kind or a place it can't read is left out")
  #expect(ix.places[1].kids == ["Ucayali"] && ix.places[1].parent == "south-america")
  // The copy kept on the phone reads back the same.
  let again = try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(ix))
  #expect(again == ix)
}
