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
