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
