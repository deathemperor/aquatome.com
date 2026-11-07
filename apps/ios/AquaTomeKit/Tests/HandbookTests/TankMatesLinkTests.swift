import Testing
@testable import Handbook

// The tank-mates tool's link read as its page reads its address (apps/site/src/pages/cong-cu/nuoi-chung.astro).
private let neon = HandbookIndex.Item(kind: .fish, contentId: "paracheirodon-innesi", name: "Cá neon", path: "/vi/ca/ca-neon/", facts: .init(schoolMin: 6))
private let discus = HandbookIndex.Item(kind: .fish, contentId: "symphysodon-aequifasciatus", name: "Cá đĩa", path: "/vi/ca/ca-dia/")
private let danio = HandbookIndex.Item(kind: .fish, contentId: "danio-rerio", name: "Cá ngựa vằn", path: "/vi/ca/ca-ngua-van/", facts: .init(schoolMin: 5))
private let more = (1...6).map { HandbookIndex.Item(kind: .fish, contentId: "loai-\($0)", name: "Loài \($0)", path: "/id/ikan/loai-\($0)/") }
// A form of the neon, with none of the figures of its own (as the site lists a breed), and a hybrid with no species.
private let goldNeon = HandbookIndex.Item(kind: .fish, contentId: "ca-neon-vang", name: "Cá neon vàng", path: "/vi/ca/ca-neon-vang/",
                                          of: "paracheirodon-innesi")
private let hybrid = HandbookIndex.Item(kind: .fish, contentId: "ca-la-han", name: "Cá la hán", path: "/vi/ca/ca-la-han/")
private let index = [neon, discus, danio, goldNeon, hybrid] + more

private func link(_ query: String?) -> TankMatesLink { TankMatesLink(query: query, fish: index) }
private func picked(_ query: String?) -> [String] { link(query).fish.map { "\(TankMatesLink.slug($0.item)):\($0.count)" } }

@Test func aFishPagesLinkSetsTheToolToThatFish() {
  #expect(picked("ca=ca-neon:6") == ["ca-neon:6"])
  #expect(picked("ca=ca-neon:6,ca-dia:2") == ["ca-neon:6", "ca-dia:2"])
  // A fish with no school size: species-page.ts leaves the number off.
  #expect(picked("ca=ca-dia") == ["ca-dia:1"])
  #expect(link("ca=ca-neon:6").size == nil)
}

@Test func aSlugIsThePagesLastPathComponentInAnyLanguage() {
  #expect(TankMatesLink.slug(neon) == "ca-neon")
  #expect(TankMatesLink.slug(more[0]) == "loai-1")
  #expect(picked("ca=loai-1:3") == ["loai-1:3"])
}

@Test func aNumberIsRoundedAndHeldTo1Through200ElseTheSchoolSizeElseOne() {
  #expect(picked("ca=ca-neon:12") == ["ca-neon:12"])
  #expect(picked("ca=ca-neon:2.5") == ["ca-neon:3"])
  #expect(picked("ca=ca-neon:0.4") == ["ca-neon:6"])
  #expect(picked("ca=ca-neon:500") == ["ca-neon:200"])
  #expect(picked("ca=ca-neon:200") == ["ca-neon:200"])
  for bad in ["0", "-3", "abc", "", "6abc"] {
    #expect(picked("ca=ca-neon:\(bad),ca-dia:\(bad)") == ["ca-neon:6", "ca-dia:1"], Comment(rawValue: bad))
  }
  // As the page reads a number: spaces around it ignored ("+" is one in a query).
  #expect(picked("ca=ca-neon:+8") == ["ca-neon:8"])
  #expect(TankMatesLink.count(" 7 ") == 7)
  #expect(TankMatesLink.count("7,5") == nil)
}

@Test func aBreedStartsAtItsSpeciesSchoolSize() {
  #expect(picked("ca=ca-neon-vang") == ["ca-neon-vang:6"])
  #expect(picked("ca=ca-neon-vang:3") == ["ca-neon-vang:3"])
  #expect(picked("ca=ca-la-han") == ["ca-la-han:1"])
  // As the tool's search starts a fish it adds.
  let byId = Dictionary(uniqueKeysWithValues: index.compactMap { i in i.contentId.map { ($0, i) } })
  #expect(TankMatesLink.start(goldNeon) { byId[$0] } == 6)
  #expect(TankMatesLink.start(neon) { byId[$0] } == 6)
  #expect(TankMatesLink.start(hybrid) { byId[$0] } == 1)
  #expect(TankMatesLink.start(goldNeon) { _ in nil } == 1)
}

// The check counts a species and its breeds as one fish, with one school: a second of them starts at what that school
// still lacks, not at a school of its own.
@Test func aSpeciesAndItsBreedsShareOneSchool() {
  #expect(picked("ca=ca-neon:6,ca-neon-vang") == ["ca-neon:6", "ca-neon-vang:1"])
  #expect(picked("ca=ca-neon:4,ca-neon-vang") == ["ca-neon:4", "ca-neon-vang:2"])
  // A number the link gives counts wherever it is.
  #expect(picked("ca=ca-neon-vang,ca-neon:6") == ["ca-neon-vang:1", "ca-neon:6"])
  #expect(picked("ca=ca-neon-vang,ca-neon") == ["ca-neon-vang:6", "ca-neon:1"])
  // Another fish's school is its own.
  #expect(picked("ca=ca-ngua-van:5,ca-neon-vang") == ["ca-ngua-van:5", "ca-neon-vang:6"])
  let byId = Dictionary(uniqueKeysWithValues: index.compactMap { i in i.contentId.map { ($0, i) } })
  #expect(TankMatesLink.start(goldNeon, species: { byId[$0] }, chosen: [(neon, 6)]) == 1)
  #expect(TankMatesLink.start(neon, species: { byId[$0] }, chosen: [(goldNeon, 2)]) == 4)
  #expect(TankMatesLink.start(goldNeon, species: { byId[$0] }, chosen: [(danio, 5)]) == 6)
  // A breed whose species the index lacks is a fish of its own to the check, with no school size.
  #expect(TankMatesLink.start(goldNeon, species: { _ in nil }, chosen: [(neon, 6)]) == 1)
}

@Test func unknownFishAndRepeatsAreLeftOutAndSixAtMost() {
  #expect(picked("ca=ca-mong:4,ca-neon:6") == ["ca-neon:6"])
  #expect(picked("ca=ca-mong") == [])
  // A fish named twice is listed once, where it first came; a later number for it wins, one that isn't a number doesn't.
  #expect(picked("ca=ca-neon:6,ca-dia,ca-neon:10") == ["ca-neon:10", "ca-dia:1"])
  #expect(picked("ca=ca-neon:8,ca-neon:x") == ["ca-neon:8"])
  // Six kinds, counted after the repeats are gone.
  let seven = "ca=ca-neon,ca-neon," + more.map { TankMatesLink.slug($0) }.joined(separator: ",")
  #expect(picked(seven) == ["ca-neon:6"] + (1...5).map { "loai-\($0):1" })
  #expect(picked("ca=,,ca-neon:2,") == ["ca-neon:2"])
}

@Test func theQueryIsReadAsTheBrowserReadsIt() {
  // Percent-encoded, the first of a name given twice, other names ignored.
  #expect(picked("ca=ca-neon%3A9%2Cca-dia%3A2") == ["ca-neon:9", "ca-dia:2"])
  #expect(picked("ca=ca-dia:3&ca=ca-neon:6") == ["ca-dia:3"])
  #expect(picked("x=1&ca=ca-neon:6") == ["ca-neon:6"])
  #expect(picked(nil) == [] && link(nil).size == nil)
  #expect(picked("") == [])
}

@Test func theTankIsItsThreeSidesInCm() {
  #expect(link("ca=ca-neon:6&l=60&w=30&h=36").size == .init(l: 60, w: 30, h: 36))
  #expect(link("l=80.5&w=35&h=40").size == .init(l: 80.5, w: 35, h: 40))
  // All three, each over 0: else no size, and the check says the tank the fish need instead.
  #expect(link("l=60&w=30").size == nil)
  #expect(link("l=60&w=0&h=36").size == nil)
  #expect(link("l=60&w=abc&h=36").size == nil)
  #expect(link("l=60&w=&h=36").size == nil)
  #expect(link("l=-60&w=30&h=36").size == nil)
}
