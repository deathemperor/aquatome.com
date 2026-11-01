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
