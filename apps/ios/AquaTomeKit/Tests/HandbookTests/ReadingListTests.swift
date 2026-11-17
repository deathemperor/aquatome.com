import Foundation
import Testing
@testable import Handbook

@Test func aPageReadComesFirstOnceAndOnlyTheLastOnesAreKept() {
  var r = ReadingList()
  r.read("/a/"); r.read("/b/"); r.read("/a/")
  #expect(r.recent == ["/a/", "/b/"])
  for n in 0..<600 { r.read("/p\(n)/") }
  #expect(r.recent.count == ReadingList.recentMax && r.recent.first == "/p599/" && !r.recent.contains("/a/"))
  // The oldest go: the 500 kept run from the last read back to the 100th.
  #expect(r.recent.last == "/p100/")
}

/// A list kept when the app kept 20 comes back whole and grows past 20: nobody's pages read last are lost.
@Test func aListKeptAtTwentyComesBackWholeAndGrows() throws {
  // Newest first, as it's kept: /old0/ read last, /old19/ longest ago.
  let old = (0..<20).map { "/old\($0)/" }
  var r = try JSONDecoder().decode(ReadingList.self, from: JSONSerialization.data(withJSONObject: ["saved": [String](), "recent": old]))
  #expect(r.recent == old)
  for n in 0..<40 { r.read("/new\(n)/") }
  #expect(r.recent.count == 60 && r.recent.first == "/new39/" && r.recent.last == "/old19/")
}

@Test func savingTogglesNewestFirst() throws {
  var r = ReadingList()
  r.toggleSaved("/a/"); r.toggleSaved("/b/")
  #expect(r.saved == ["/b/", "/a/"] && r.isSaved("/a/"))
  r.toggleSaved("/a/")
  #expect(r.saved == ["/b/"] && !r.isSaved("/a/"))
  // Kept on the phone as JSON, read back the same.
  #expect(try JSONDecoder().decode(ReadingList.self, from: JSONEncoder().encode(r)) == r)
}

@Test func theListsShowThePagesTheIndexHasOfTheKindPickedFiveRecentAtMost() {
  let page = { (k: HandbookIndex.Kind, p: String) in HandbookIndex.Item(kind: k, name: p, path: p) }
  let pages = [page(.guide, "/g1/"), page(.fish, "/f1/"), page(.guide, "/g2/"), page(.fish, "/f2/"),
               page(.guide, "/g3/"), page(.guide, "/g4/"), page(.guide, "/g5/"), page(.guide, "/g6/")]
  let byPath = ItemsByKey(pages) { $0.path }
  let read = ["/g1/", "/gone/", "/f1/", "/g2/", "/f2/", "/g3/", "/g4/", "/g5/", "/g6/"]
  // A page the index no longer has is left out; the kind is picked before the five are taken.
  #expect(ReadingList.items(read, in: byPath, kind: nil, limit: 5).map(\.path) == ["/g1/", "/f1/", "/g2/", "/f2/", "/g3/"])
  #expect(ReadingList.items(read, in: byPath, kind: .guide, limit: 5).map(\.path) == ["/g1/", "/g2/", "/g3/", "/g4/", "/g5/"])
  #expect(ReadingList.items(read, in: byPath, kind: .fish).map(\.path) == ["/f1/", "/f2/"])
  // Narrowed to videos: a series, and a guide made from a video.
  let videos = ItemsByKey(pages + [HandbookIndex.Item(kind: .video, name: "v", path: "/v/"),
                                   HandbookIndex.Item(kind: .guide, name: "gv", path: "/gv/", video: 60)]) { $0.path }
  #expect(ReadingList.items(["/g1/", "/gv/", "/v/"], in: videos, kind: .video).map(\.path) == ["/gv/", "/v/"])
}

@Test func aListKeptUnderViMovesToTheRootAndBack() {
  var r = ReadingList()
  r.toggleSaved("/vi/huong-dan/nuoi-ca-neon/"); r.toggleSaved("/id/panduan/neon/"); r.toggleSaved("/vi/ca/ca-neon/")
  r.read("/vi/ca/ca-dia/"); r.read("/ca/ca-dia/"); r.read("/vi/cay/rotala-do/")
  r.move(to: .atRoot)
  #expect(r.saved == ["/ca/ca-neon/", "/id/panduan/neon/", "/huong-dan/nuoi-ca-neon/"])
  // A page read in both forms (a link from before the change, then from after) is listed once, where it came first.
  #expect(r.recent == ["/cay/rotala-do/", "/ca/ca-dia/"])
  // Again in the same form: as it was.
  let moved = r
  r.move(to: .atRoot)
  #expect(r == moved)
  // Back, should the site put "/vi" back.
  r.move(to: .underVi)
  #expect(r.saved == ["/vi/ca/ca-neon/", "/id/panduan/neon/", "/vi/huong-dan/nuoi-ca-neon/"])
  #expect(r.recent == ["/vi/cay/rotala-do/", "/vi/ca/ca-dia/"])
}

@Test func itemsByKeyFindEachItemByItsKeyTheFirstWithAKeyWinningAndOnesWithoutNone() {
  let a = HandbookIndex.Item(kind: .fish, contentId: "x", name: "a", path: "/a/")
  let b = HandbookIndex.Item(kind: .fish, contentId: "x", name: "b", path: "/b/")
  let c = HandbookIndex.Item(kind: .guide, name: "c", path: "/c/")
  // The one without a key first: each key's place is in the whole list, not in the ones with a key.
  let byId = ItemsByKey([c, a, b]) { $0.contentId }
  #expect(byId["x"]?.path == "/a/")
  #expect(byId["c"] == nil && byId["/c/"] == nil)
  let byPath = ItemsByKey([c, a, b]) { $0.path }
  #expect(byPath["/b/"]?.name == "b" && byPath["/c/"]?.kind == .guide && byPath["/d/"] == nil)
}
