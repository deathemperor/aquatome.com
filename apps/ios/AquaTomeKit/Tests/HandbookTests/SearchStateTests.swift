import Testing
@testable import Handbook

// 700 fish and a plant that "ca" all finds: more than a page of results.
private let index = HandbookSearch((0..<700).map { HandbookIndex.Item(kind: .fish, name: "Cá \($0)", path: "/vi/ca/\($0)/") }
  + [HandbookIndex.Item(kind: .plant, name: "Cây ca", path: "/vi/cay/ca/")])

@Test func aSearchListsItsBest200ThenAPageMoreEachTime() {
  var s = SearchState(index)
  s.query = "ca"
  #expect(s.results.count == 200 && s.counts[nil] == 701 && s.left == 501)
  s.showMore()
  #expect(s.results.count == 400 && s.left == 301)
  s.showMore()
  s.showMore()
  #expect(s.results.count == 701 && s.left == 0)
}

// A page more ran the whole search again, though it had ranked every match already.
@Test func aPageMoreListsTheNextBestWithNoSearch() {
  var s = SearchState(index)
  s.query = "ca"
  let runs = s.runs
  s.showMore()
  #expect(s.runs == runs, "searched \(s.runs - runs) times")
  #expect(s.results == index.find("ca", limit: 400))
}

// `-search-page 0` listed nothing and a page more nothing more; a negative page crashed.
@Test(arguments: [0, -2]) func aPageListsOneAtLeast(page: Int) {
  var s = SearchState(index, page: page)
  s.query = "ca"
  #expect(s.page == 1 && s.results.count == 1 && s.left == 700)
  s.showMore()
  #expect(s.results.count == 2)
}

@Test func aNewQueryOrKindListsTheBest200Again() {
  var s = SearchState(index)
  s.query = "ca"
  s.showMore()
  s.kind = .fish
  #expect(s.results.count == 200 && s.left == 500)
  s.showMore()
  s.query = "c"
  #expect(s.results.count == 200)
  // A kind with fewer than a page leaves none.
  s.kind = .plant
  #expect(s.results.map(\.name) == ["Cây ca"] && s.left == 0)
}

@Test func clearingTheQueryWithAKindPickedSearchesOnceAndPutsTheKindBack() {
  var s = SearchState(index)
  s.query = "ca"
  s.kind = .plant
  let runs = s.runs
  s.query = ""
  #expect(s.kind == nil)
  #expect(s.runs == runs + 1, "searched \(s.runs - runs) times")
}

@Test func onlyAChangeSearchesAgainAndANewIndexDoes() {
  var s = SearchState(index)
  s.query = "ca"
  let runs = s.runs
  s.query = "ca"
  s.kind = nil
  #expect(s.runs == runs)
  s.search = HandbookSearch([.init(kind: .glossary, name: "Cá cảnh", path: "/vi/thuat-ngu/ca-canh/")])
  #expect(s.results.map(\.name) == ["Cá cảnh"] && s.counts == [nil: 1, .glossary: 1] && s.runs == runs + 1)
}

// Results by kind (Design's videos spec, 14 Nov): each kind's best three, the kinds by their best, a kind whose best
// ranks past the list's 200 included; none with one kind found, a kind picked, or nothing typed.
@Test func aSearchOfTwoKindsOrMoreHasEachKindsBestThree() {
  var s = SearchState(index)
  s.query = "ca"
  // The plant ranks after all 700 fish ("Cây ca": a word starting "ca", not the name), past the list's 200.
  #expect(s.sections.map(\.kind) == [.fish, .plant])
  let fish = s.sections.first
  let plant = s.sections.last
  #expect(fish?.items == Array(s.results.prefix(3)) && fish?.count == 700)
  #expect(plant?.items.map(\.name) == ["Cây ca"] && plant?.count == 1)
  s.kind = .fish
  #expect(s.sections.isEmpty)
  s.kind = nil
  s.query = "cá 1"
  #expect(s.sections.isEmpty, "one kind found: the list as it was")
  s.query = ""
  #expect(s.sections.isEmpty)
}

// A video guide's section is Video, not Hướng dẫn, as its chips count it.
@Test func aVideoGuideIsInTheVideoSection() {
  var s = SearchState(HandbookSearch([
    .init(kind: .guide, name: "Lọc thùng cho bể 60 lít", path: "/vi/huong-dan/loc-video/", video: 600),
    .init(kind: .guide, name: "Lọc nước bể mới", path: "/vi/huong-dan/loc/"),
    .init(kind: .video, name: "Lọc từ A đến Z", path: "/vi/video/loc/", parts: 5),
  ]))
  s.query = "lọc"
  #expect(s.sections.map(\.kind) == [.video, .guide])
  let videos = s.sections.first { $0.kind == .video }
  #expect(videos?.items.map(\.name) == ["Lọc từ A đến Z", "Lọc thùng cho bể 60 lít"])
  #expect(videos?.count == 2 && s.sections.last?.count == 1)
  #expect(s.counts[.guide] == 1 && s.counts[.video] == 2)
}
