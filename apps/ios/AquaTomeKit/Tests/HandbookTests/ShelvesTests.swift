import Foundation
import Testing
@testable import Handbook

private func fish(_ id: String, _ group: String?, sub: String? = "Genus \(UUID().uuidString.prefix(4))") -> HandbookIndex.Item {
  .init(kind: .fish, contentId: id, name: id, sub: sub, path: "/vi/ca/\(id)/", group: group)
}
private func plant(_ id: String, _ placement: [String]) -> HandbookIndex.Item {
  .init(kind: .plant, contentId: id, name: id, path: "/vi/cay/\(id)/", plant: .init(placement: placement))
}
private func guide(_ name: String, _ section: String) -> HandbookIndex.Item { .init(kind: .guide, name: name, path: "/vi/huong-dan/\(name)/", section: section) }

private let words = HandbookIndex.Labels([
  "group": ["tetras": "Cá tetra", "cichlids": "Cichlid", "danios": "Danio", "other": "Loài khác"],
  "placement": ["foreground": "Tiền cảnh", "epiphyte": "Bám đá, lũa"],
  "section": ["setup": "Setup bể", "care": "Chăm sóc"],
])

@Test func fishGroupsGoInTheSitesOrderThenTheRestThenOther() {
  let ix = HandbookIndex(lang: "vi", items: [
    fish("neon", "tetras"), fish("discus", "cichlids"), fish("angel", "cichlids"), fish("zebra", "danios"), fish("rasbora", "rasboras"),
    fish("x", "other"), fish("y", "characins"), fish("breed", nil, sub: nil),
  ], home: .init(groups: [.init(id: "tetras"), .init(id: "cichlids", img: "https://x/a.jpg")]),
     labels: .init(["group": words.words["group"]!.merging(["rasboras": "Rasbora"]) { a, _ in a }]))
  let s = HandbookShelves(ix)
  // The home's tiles first in its order (not by size), with their photo; then the other groups named, by key; then
  // "other": a group the site has no word for goes there too. A breed of no group is only in the whole list.
  #expect(s.groups.map(\.key) == ["tetras", "cichlids", "danios", "rasboras", "other"])
  #expect(s.groups.map(\.count) == [1, 2, 1, 1, 2])
  #expect(s.groups[1] == .init(key: "cichlids", label: "Cichlid", count: 2, img: "https://x/a.jpg"))
  #expect(s.fish(group: "other", ix.labels).map(\.contentId) == ["x", "y"])
  #expect(s.fish(group: "cichlids", ix.labels).map(\.contentId) == ["discus", "angel"], "the index's order")
  #expect(s.all(.fish).count == 8)
}

@Test func plantsByWhereTheyGoAndGuidesBySubjectInTheSitesOrder() {
  let ix = HandbookIndex(lang: "vi", items: [
    plant("nana", ["foreground", "epiphyte"]), plant("moss", ["epiphyte"]), plant("new", ["carpet"]),
    guide("b", "care"), guide("a", "setup"), guide("c", "care"), guide("Hàng mới về", "discovery"),
  ], labels: words)
  let s = HandbookShelves(ix)
  #expect(s.placements.map(\.key) == ["foreground", "epiphyte", "carpet"])
  #expect(s.placements.map(\.label) == ["Tiền cảnh", "Bám đá, lũa", "carpet"], "a key with no word shows as it is")
  #expect(s.plants(placement: "epiphyte").map(\.contentId) == ["nana", "moss"])
  #expect(s.sections.map(\.key) == ["setup", "care"] && s.sections.map(\.count) == [1, 2])
  #expect(s.guides(section: "care").map(\.name) == ["b", "c"])
  // The shops' news isn't in the site's guide list: no subject of its own, not under "every guide".
  #expect(s.all(.guide).map(\.name) == ["b", "a", "c"])
}

@Test func videoGuidesAreOnAShelfOfTheirOwnNotUnderASubject() {
  let video = { (name: String) in HandbookIndex.Item(kind: .guide, name: name, path: "/vi/huong-dan/\(name)/", section: "plantCare", video: 600) }
  let ix = HandbookIndex(lang: "vi", items: [
    guide("a", "setup"), video("v1"), .init(kind: .video, name: "Loạt", sub: "Kênh", path: "/vi/video/loat/", parts: 2), video("v2"), guide("b", "plantCare"),
  ], labels: words)
  let s = HandbookShelves(ix)
  // As the site's guide list leaves them out: no plantCare count from them, not under "every guide".
  #expect(s.sections.map(\.key) == ["setup", "plantCare"] && s.sections.map(\.count) == [1, 1])
  #expect(s.all(.guide).map(\.name) == ["a", "b"])
  #expect(s.videoGuides.map(\.name) == ["v1", "v2"], "the index's order")
  #expect(s.all(.video).map(\.name) == ["Loạt"])
}

@Test func theHomesPicksAreThePagesTheIndexHas() {
  let ix = HandbookIndex(lang: "vi", items: [fish("neon", "tetras"), plant("nana", ["epiphyte"]), guide("a", "setup")],
                         home: .init(fish: ["/vi/ca/neon/", "/vi/ca/gone/"], plants: ["/vi/cay/nana/"], guides: ["/vi/huong-dan/a/"]))
  let s = HandbookShelves(ix)
  #expect(s.featuredFish.map(\.contentId) == ["neon"] && s.easyPlants.count == 1 && s.firstGuides.map(\.name) == ["a"])
  // An index from an older site: no picks, every fish under "Tất cả".
  let old = HandbookShelves(HandbookIndex(lang: "vi", items: [.init(kind: .fish, name: "Cá", path: "/vi/ca/x/")]))
  #expect(old.groups.isEmpty && old.featuredFish.isEmpty && old.all(.fish).count == 1)
}

@Test func khamPhasShelvesReadTheirLongerListsAndASiteBeforeThemGivesTheHomesPicks() {
  let thirty = (1...30).map { fish("f\($0)", "tetras") }
  let ix = HandbookIndex(lang: "vi", items: thirty + [plant("nana", ["epiphyte"]), guide("a", "setup")],
                         home: .init(fish: thirty.prefix(8).map(\.path), plants: ["/vi/cay/nana/"], guides: ["/vi/huong-dan/a/"],
                                     browse: .init(fish: thirty.map(\.path) + ["/vi/ca/gone/"], plants: ["/vi/cay/nana/"], guides: [])))
  let s = HandbookShelves(ix)
  #expect(s.browseFish.map(\.path) == thirty.map(\.path))
  #expect(s.featuredFish.count == 8 && s.browsePlants.count == 1 && s.browseGuides.isEmpty)
  let old = HandbookShelves(HandbookIndex(lang: "vi", items: thirty, home: .init(fish: thirty.prefix(8).map(\.path))))
  #expect(old.browseFish.map(\.path) == old.featuredFish.map(\.path) && old.browseFish.count == 8)
}

@Test func aKhamPhaListTheAppCantReadIsTheHomesOwnNotAnEmptyShelf() throws {
  func shelves(_ browse: String) throws -> HandbookShelves {
    let json = #"{"version":1,"lang":"vi","items":[{"kind":"fish","name":"Cá neon","path":"/vi/ca/neon/"},{"kind":"fish","name":"Cá đĩa","path":"/vi/ca/dia/"}],"home":{"fish":["/vi/ca/neon/"],"plants":[],"guides":[]"# + browse + "}}"
    return HandbookShelves(try JSONDecoder().decode(HandbookIndex.self, from: Data(json.utf8)))
  }
  let paths = { (s: HandbookShelves) in s.browseFish.map(\.path) }
  #expect(try paths(shelves(#","browse":{"fish":["/vi/ca/neon/","/vi/ca/dia/"]}"#)) == ["/vi/ca/neon/", "/vi/ca/dia/"])
  // None, an empty object, a list in a newer shape, or not an object at all: the home's own fish.
  for browse in ["", #","browse":{}"#, #","browse":{"fish":[{"path":"/vi/ca/dia/"}]}"#, #","browse":[]"#] {
    #expect(try paths(shelves(browse)) == ["/vi/ca/neon/"], "\(browse)")
  }
  // A list the site sends empty stays empty (a language with no fish).
  #expect(try paths(shelves(#","browse":{"fish":[]}"#)).isEmpty)
}

// Seven columns at most, as the App Store's shelves (the owner, 11 Nov: "Appstore gives up to 7 columns in total"): fish
// and plants three to a column, guides and video series one.
@Test func khamPhasShelvesStopAtSevenColumns() {
  #expect(HandbookShelves.Shown.fish == 21 && HandbookShelves.Shown.plants == 21)
  #expect(HandbookShelves.Shown.guides == 7 && HandbookShelves.Shown.videos == 7)
  #expect(HandbookShelves.Shown.saved == 21)
}

// A page's photo rows the same: six photos, then the tile to them all; a shorter strip whole.
@Test func aPagesPhotoRowShowsSixThenItsTile() {
  #expect(PhotoRow.strip(Array(0..<10)) == Array(0..<6))
  #expect(PhotoRow.strip([3, 4]) == [3, 4])
}

@Test func aShelfShows21AfterADropOf3AndWhatsLeftWhenTheDropIsBiggerThanItsSpare() {
  let thirty = (1...30).map { fish("f\($0)", "tetras") }
  let three = Set(["/vi/ca/f1/", "/vi/ca/f2/", "/vi/ca/f3/"])
  let shelf = HandbookShelves.shelf(thirty, showing: HandbookShelves.Shown.fish, after: three)
  #expect(shelf.count == 21 && shelf.first?.path == "/vi/ca/f4/" && shelf.last?.path == "/vi/ca/f24/")
  // Twelve taken above, past its spare of nine: the 18 left, none from past the list.
  let twelve = Set((1...12).map { "/vi/ca/f\($0 * 2)/" })
  let short = HandbookShelves.shelf(thirty, showing: HandbookShelves.Shown.fish, after: twelve)
  #expect(short.count == 18 && short.allSatisfy { !twelve.contains($0.path) } && short.last?.path == "/vi/ca/f30/")
  // Pages shown above that aren't on the list take nothing off it.
  #expect(HandbookShelves.shelf(thirty, showing: 21, after: ["/vi/cay/nana/"]).count == 21)
  // The site's lists of 32 plants and 14 guides: 21 plants, and 7 guides with the top's two of them taken.
  let thirtyTwo = (1...32).map { fish("f\($0)", "tetras") }
  #expect(HandbookShelves.shelf(thirtyTwo, showing: HandbookShelves.Shown.plants, after: three).count == 21)
  #expect(HandbookShelves.shelf(Array(thirtyTwo.prefix(14)), showing: HandbookShelves.Shown.guides, after: ["/vi/ca/f1/", "/vi/ca/f2/"]).count == 7)
}

@Test func theGlossaryGoesUnderItsFirstLettersAsVietnameseSortsThem() {
  let g = { (n: String) in HandbookIndex.Item(kind: .glossary, name: n, path: "/vi/thuat-ngu/\(n)/") }
  let s = HandbookShelves(HandbookIndex(lang: "vi", items: [g("Đệm pH"), g("Ánh sáng"), g("dGH"), g("Amoniac"), g("Chu trình nitơ")]))
  #expect(s.glossary().map(\.letter) == ["A", "C", "D", "Đ"])
  #expect(s.glossary()[0].items.map(\.name) == ["Amoniac", "Ánh sáng"])
}

@Test func aThaiGlossaryGoesUnderItsConsonantsEachLetterOnce() {
  let g = { (n: String) in HandbookIndex.Item(kind: .glossary, name: n, path: "/th/glossary/\(n)/") }
  let s = HandbookShelves(HandbookIndex(lang: "th", items: ["ไนเตรต", "แอมโมเนีย", "ไรแดง", "ค่า pH", "คลอรีน", "น้ำกระด้าง", "ตู้ปลา"].map(g)))
  let letters = s.glossary().map(\.letter)
  #expect(letters == ["ค", "ต", "น", "ร", "อ"])
  #expect(Set(letters).count == letters.count)
  let under = Dictionary(uniqueKeysWithValues: s.glossary().map { ($0.letter, Set($0.items.map(\.name))) })
  #expect(under["ค"] == ["ค่า pH", "คลอรีน"] && under["น"] == ["ไนเตรต", "น้ำกระด้าง"] && under["อ"] == ["แอมโมเนีย"])
}
