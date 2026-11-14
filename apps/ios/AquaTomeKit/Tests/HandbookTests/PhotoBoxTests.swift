import Foundation
import Testing
@testable import Handbook

// Where the fish is in each card's photo, as the index sends it (`imgBox`, `guideImgBox`, a story's `imgBox`), and a
// video guide's poster on its page: read as sent, kept in the phone's copy, and left out, never the item, where it can't
// be read or falls outside the photo.

private func index(_ json: String) throws -> HandbookIndex { try JSONDecoder().decode(HandbookIndex.self, from: Data(json.utf8)) }

@Test func aCardsBoxIsReadKeptAndLeftOutWhereItCantBe() throws {
  let read = try index(#"""
  {"version":1,"lang":"vi","items":[
    {"kind":"fish","id":"a","name":"A","path":"/ca/a/","img":"a.webp","imgBox":{"x":0.1234,"y":0.25,"w":0.5,"h":0.3}},
    {"kind":"fish","id":"b","name":"B","path":"/ca/b/","img":"b.webp","imgBox":{"x":0,"y":0,"w":1,"h":1}},
    {"kind":"fish","id":"c","name":"C","path":"/ca/c/","img":"c.webp","imgBox":{"x":0.8,"y":0,"w":0.5,"h":1}},
    {"kind":"fish","id":"d","name":"D","path":"/ca/d/","img":"d.webp","imgBox":"wide"},
    {"kind":"guide","name":"E","path":"/huong-dan/e/"}]}
  """#)
  let boxes = read.items.map { $0.imgBox.map { [$0.x, $0.y, $0.w, $0.h] } }
  #expect(boxes == [[0.1234, 0.25, 0.5, 0.3], [0, 0, 1, 1], nil, nil, nil])
  #expect(read.items.count == 5, "an item lost to its box")
  // The copy kept on the phone keeps them.
  let kept = try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(read))
  #expect(kept.items.map { $0.imgBox } == read.items.map { $0.imgBox })
}

@Test func aBoxPackedForTheIndexKeepsItsFourPlaces() {
  for b in [PhotoBox(x: 0, y: 0, w: 1, h: 1), PhotoBox(x: 0.0001, y: 0.9998, w: 0.9999, h: 0.0002), PhotoBox(x: 0.3333, y: 0.5, w: 0.25, h: 0.125)] {
    let back = PhotoBox(packed: PhotoBox.pack(b))
    #expect(back.map { abs($0.x - b.x) + abs($0.y - b.y) + abs($0.w - b.w) + abs($0.h - b.h) < 1e-9 } == true, "\(b) came back \(String(describing: back))")
  }
  #expect(PhotoBox.pack(nil) == 0 && PhotoBox(packed: 0) == nil)
  #expect(PhotoBox.pack(PhotoBox(x: 0.5, y: 0, w: 0.6, h: 1)) == 0, "a box past the photo's edge kept")
}

@Test func aGroupsADaysAndAStorysPhotoBoxesAreRead() throws {
  let read = try index(#"""
  {"version":1,"lang":"vi","items":[{"kind":"fish","id":"a","name":"A","path":"/ca/a/"},{"kind":"guide","name":"E","path":"/huong-dan/e/"}],"home":{"groups":[{"id":"tetras","img":"t.webp","imgBox":{"x":0.2,"y":0.3,"w":0.6,"h":0.4}},{"id":"other","img":"o.webp","imgBox":{"x":1}}],
   "fish":[],"plants":[],"guides":[],
   "days":[{"date":"2026-11-14","fish":"/ca/a/","img":"a.webp","imgBox":{"x":0,"y":0.1,"w":1,"h":0.8},"guide":"/huong-dan/e/","guideImg":"e.webp","guideImgBox":{"x":0.1,"y":0.1,"w":0.2,"h":0.2},
            "story":{"path":"/s/","img":"s.webp","imgBox":{"x":0,"y":0,"w":1,"h":1}}},
           {"date":"2026-11-15","fish":"/ca/b/","img":"b.webp","imgBox":{"x":2,"y":0,"w":1,"h":1}}]}}
  """#)
  let home = try #require(read.home)
  #expect(home.groups.map { $0.imgBox?.w } == [0.6, nil])
  #expect(home.days.map { $0.imgBox?.h } == [0.8, nil])
  #expect(home.days.first?.guideImgBox?.x == 0.1)
  #expect(home.days.first?.story?.imgBox == PhotoBox(x: 0, y: 0, w: 1, h: 1))
  // Hôm nay's plan carries them to its cards.
  let plan = HandbookShelves(read).plan["2026-11-14"]
  #expect(plan?.imgBox?.h == 0.8 && plan?.guideImgBox?.x == 0.1)
}

@Test func aVideoGuidesPosterIsItsCardsPhoto() throws {
  func video(_ poster: Any?) throws -> PageDoc.Video? {
    var v: [String: Any] = ["youtubeId": "abc", "title": "T", "channel": "C", "durationSec": 300]
    v["poster"] = poster
    let page: [String: Any] = ["v": 1, "path": "/huong-dan/v/", "kind": "guide", "title": "T", "video": v, "blocks": [["t": "p", "c": ["Một đoạn."]]]]
    return try #require(PageDoc(data: JSONSerialization.data(withJSONObject: page))).video
  }
  let poster = try video(["src": "https://media.aquatome.com/p.webp", "w": 1200, "h": 800, "box": ["x": 0.1, "y": 0.2, "w": 0.5, "h": 0.5]])?.poster
  #expect(poster?.src == "https://media.aquatome.com/p.webp" && poster?.box?.w == 0.5)
  // None sent, or one this app can't read: the video still there, without it.
  #expect(try video(nil).map { $0.poster == nil } == true)
  #expect(try video(["src": "x"]).map { $0.poster == nil } == true)
}
