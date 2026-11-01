import Foundation
import Testing
@testable import Handbook

@Test func aPageReadComesFirstOnceAndOnlyTheLastOnesAreKept() {
  var r = ReadingList()
  r.read("/a/"); r.read("/b/"); r.read("/a/")
  #expect(r.recent == ["/a/", "/b/"])
  for n in 0..<30 { r.read("/p\(n)/") }
  #expect(r.recent.count == ReadingList.recentMax && r.recent.first == "/p29/" && !r.recent.contains("/a/"))
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
  let byPath = Dictionary(uniqueKeysWithValues: [page(.guide, "/g1/"), page(.fish, "/f1/"), page(.guide, "/g2/"), page(.fish, "/f2/"),
                                                 page(.guide, "/g3/"), page(.guide, "/g4/"), page(.guide, "/g5/"), page(.guide, "/g6/")].map { ($0.path, $0) })
  let read = ["/g1/", "/gone/", "/f1/", "/g2/", "/f2/", "/g3/", "/g4/", "/g5/", "/g6/"]
  // A page the index no longer has is left out; the kind is picked before the five are taken.
  #expect(ReadingList.items(read, in: byPath, kind: nil, limit: 5).map(\.path) == ["/g1/", "/f1/", "/g2/", "/f2/", "/g3/"])
  #expect(ReadingList.items(read, in: byPath, kind: .guide, limit: 5).map(\.path) == ["/g1/", "/g2/", "/g3/", "/g4/", "/g5/"])
  #expect(ReadingList.items(read, in: byPath, kind: .fish).map(\.path) == ["/f1/", "/f2/"])
  // Narrowed to videos: a series, and a guide made from a video.
  let videos = byPath.merging([("/v/", HandbookIndex.Item(kind: .video, name: "v", path: "/v/")),
                               ("/gv/", HandbookIndex.Item(kind: .guide, name: "gv", path: "/gv/", video: 60))]) { a, _ in a }
  #expect(ReadingList.items(["/g1/", "/gv/", "/v/"], in: videos, kind: .video).map(\.path) == ["/gv/", "/v/"])
}
