import Foundation
import Testing
@testable import Handbook

// protocols/page-vectors.json: the cases the site's tests run too (apps/site/test/app-page.test.ts,
// packages/schema/test/app-page.test.ts), so the app reads pages as the site writes them.
private func cases(_ key: String) -> [[String: Any]] {
  // Tests/HandbookTests/PageTests.swift → the repository root, six levels up.
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  let data = try! Data(contentsOf: url.appendingPathComponent("protocols/page-vectors.json"))
  return (try! JSONSerialization.jsonObject(with: data) as! [String: Any])[key] as! [[String: Any]]
}

private func doc(_ json: Any) throws -> PageDoc {
  try #require(PageDoc(data: JSONSerialization.data(withJSONObject: json)))
}
/// A page holding these blocks, as a shard would.
private func page(_ blocks: Any, path: String = "/vi/huong-dan/x/") -> [String: Any] {
  ["v": 1, "kind": "guide", "path": path, "title": "Nuôi cá neon trong bể nhỏ", "blocks": blocks]
}

// What was read, written back in the format: equal to the vector means nothing was lost or misread.
private func json(_ d: PageDoc) -> [String: Any] {
  var o: [String: Any] = ["v": 1, "kind": d.kind, "path": d.path, "title": d.title, "blocks": d.blocks.map(json)]
  o["sub"] = d.sub
  o["meta"] = d.meta
  if !d.credit.isEmpty { o["credit"] = d.credit.map(json) }
  o["lead"] = d.lead.map(json)
  if let v = d.video {
    var j: [String: Any] = ["youtubeId": v.youtubeId, "title": v.title, "channel": v.channel, "durationSec": v.durationSec]
    j["subtitles"] = v.subtitles
    j["chapters"] = v.chapters?.map { ["at": $0.at, "title": $0.title] as [String: Any] }
    o["video"] = j
  }
  return o
}
private func json(_ r: PageDoc.Run) -> Any {
  guard r.bold || r.italic || r.href != nil || r.tip != nil else { return r.text }
  var o: [String: Any] = ["text": r.text]
  if r.bold { o["b"] = true }
  if r.italic { o["i"] = true }
  o["href"] = r.href
  o["tip"] = r.tip.map { ["term": $0.term, "text": $0.text] as [String: Any] }
  return o
}
private func json(_ i: PageDoc.Image) -> [String: Any] {
  var o: [String: Any] = ["src": i.src, "w": i.w, "h": i.h]
  o["alt"] = i.alt
  if let c = i.credit {
    var j: [String: Any] = ["text": c.text, "licence": c.licence]
    j["url"] = c.url
    o["credit"] = j
  }
  return o
}
private func json(_ b: PageDoc.Block) -> [String: Any] {
  var o: [String: Any] = ["t": b.t]
  switch b {
  case let .heading(text, id): o["text"] = text; o["id"] = id
  case let .paragraph(c): o["c"] = c.map(json)
  case let .list(ordered, items): if ordered { o["ordered"] = true }; o["items"] = items.map { $0.map(json) }
  case let .table(head, rows): o["head"] = head.map { $0.map { $0.map(json) } }; o["rows"] = rows.map { $0.map { $0.map(json) } }
  case let .figure(img, caption, href): o["img"] = json(img); if !caption.isEmpty { o["caption"] = caption.map(json) }; o["href"] = href
  case let .moments(title, youtubeId, items):
    o["title"] = title; o["youtubeId"] = youtubeId; o["items"] = items.map { ["at": $0.at, "img": json($0.img), "caption": $0.caption] }
  case let .summary(title, items): o["title"] = title; o["items"] = items
  case let .faq(title, items): o["title"] = title; o["items"] = items.map { ["q": $0.q, "a": $0.a] }
  case let .refs(title, id, items): o["title"] = title; o["id"] = id; o["items"] = items.map { ["title": $0.title, "url": $0.url] }
  case let .pages(title, paths): o["title"] = title; o["paths"] = paths
  case .web: break
  }
  return o
}
private func same(_ a: Any, _ b: Any) -> Bool { (a as AnyObject).isEqual(b) }

@Test func readsEveryPageTheSiteWritesAsWritten() throws {
  let valid = cases("docs").filter { $0["valid"] as! Bool }
  #expect(valid.count >= 2)
  for c in valid {
    let d = try doc(c["doc"]!)
    #expect(same(json(d), c["doc"]!), "\(c["note"]!)")
  }
}

@Test func aPageFromANewerSiteOrWithBrokenBlocksStillShowsWithTheWebForWhatItCantRead() throws {
  let other = cases("docs").filter { !($0["valid"] as! Bool) }
  #expect(other.count >= 2)
  for c in other {
    let d = try doc(c["doc"]!)
    // Each block this app can't read is one "open on the web", in its place: none merged, none lost.
    #expect(d.blocks.map(\.t) == c["blocks"] as! [String], "\(c["note"]!)")
  }
}

@Test func readsEveryHtmlCasesBlocksAsWritten() throws {
  let html = cases("html")
  #expect(html.count >= 10)
  for c in html {
    let d = try doc(page(c["blocks"]!))
    #expect(same(d.blocks.map(json), c["blocks"]!), "\(c["note"]!)")
  }
}

@Test func findsAPagesShardAsTheSiteDoes() {
  let shards = cases("shards")
  #expect(shards.count >= 3)
  for c in shards {
    #expect(PageDoc.shard(of: c["path"] as! String, count: c["shards"] as! Int) == c["n"] as! Int, "\(c["path"]!)")
  }
}

@Test func aShardCountPast32BitsIsNoCrash() {
  // The index's `pages` is any whole number: one past the hash's 32 bits leaves every path in the shard it hashes to.
  let path = "/vi/huong-dan/nuoi-ca-neon/"
  let n = PageDoc.shard(of: path, count: 1 << 40)
  #expect(n == PageDoc.shard(of: path, count: 1 << 33))
  #expect(n >= 0 && n < 1 << 32)
}

@Test func aPageOfAnotherVersionIsNotReadAsThisOne() {
  var p = page([["t": "p", "c": ["Cá neon sống theo đàn."]]])
  p["v"] = 2
  #expect(PageDoc(data: try! JSONSerialization.data(withJSONObject: p)) == nil)
}

@Test func aShardKeepsThePagesItCanReadUnderTheirOwnPaths() throws {
  var newer = page([], path: "/vi/huong-dan/moi/")
  newer["v"] = 2
  let shard: [String: Any] = ["v": 1, "pages": [
    "/vi/huong-dan/a/": page([["t": "p", "c": ["Một."]]], path: "/vi/huong-dan/a/"),
    "/vi/huong-dan/moi/": newer,
    "/vi/huong-dan/khac/": page([], path: "/vi/huong-dan/b/"), // filed under another page's path
  ]]
  let s = try #require(PageShard(data: JSONSerialization.data(withJSONObject: shard)))
  #expect(Array(s.pages.keys) == ["/vi/huong-dan/a/"])
  #expect(same(try #require(s.pages["/vi/huong-dan/a/"]).blocks.map(json), [["t": "p", "c": ["Một."]]]))
  #expect(PageShard(data: try JSONSerialization.data(withJSONObject: ["v": 2, "pages": [:]] as [String: Any])) == nil)
}

@Test func theIndexSaysHowManyShardsOfPagesEachKindHasAndKeepsItInItsCopy() throws {
  let withPages = Data(#"{"version":1,"lang":"vi","items":[],"pages":{"guide":32,"fish":128}}"#.utf8)
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: withPages)
  #expect(ix.pages == ["guide": 32, "fish": 128])
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(ix)).pages == ix.pages)
  // From an older site, none; one this app can't read is none too, never the index.
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: sample).pages.isEmpty)
  let odd = Data(#"{"version":1,"lang":"vi","items":[{"kind":"tool","name":"Đèn Chihiros","path":"/vi/cong-cu/den-chihiros/"}],"pages":"many"}"#.utf8)
  let read = try JSONDecoder().decode(HandbookIndex.self, from: odd)
  #expect(read.pages.isEmpty && read.items.count == 1)
}

@Test func aPagesPicturesAreTheLeadThenEachPhotoAndStillInTheText() throws {
  let img = { (src: String) in ["src": src, "w": 4, "h": 3] as [String: Any] }
  let blocks: [Any] = [
    ["t": "figure", "img": img("https://x/1.jpg")],
    ["t": "list", "items": [[["t": "figure", "img": img("https://x/2.jpg")]]]],
    ["t": "moments", "title": "Cảnh", "youtubeId": "abc", "items": [["at": 5, "img": img("https://x/3.jpg"), "caption": "c"]]],
    ["t": "p", "c": ["chữ"]],
  ]
  var p = page(blocks)
  p["lead"] = img("https://x/lead.jpg")
  #expect(try doc(p).pictures == ["https://x/lead.jpg", "https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg"])
  // A video guide shows its video's picture, not a lead photo.
  p["video"] = ["youtubeId": "abc", "title": "t", "channel": "c", "durationSec": 60]
  #expect(try doc(p).pictures.first == "https://i.ytimg.com/vi/abc/hqdefault.jpg")
  #expect(try doc(p).pictures.count == 4)
}

@Test func aShelfIsKeptForOfflineOnWiFiAskedFirstOnMobileDataAndNotWithoutRoomOrNetwork() {
  let room: Int64 = 1 << 30
  #expect(KeepPlan.of(online: true, expensive: false, constrained: false, freeBytes: room) == .go)
  #expect(KeepPlan.of(online: true, expensive: true, constrained: false, freeBytes: room) == .ask)
  #expect(KeepPlan.of(online: true, expensive: false, constrained: true, freeBytes: room) == .ask, "Low Data Mode")
  #expect(KeepPlan.of(online: true, expensive: false, constrained: false, freeBytes: 100 << 20) == .noRoom)
  #expect(KeepPlan.of(online: true, expensive: true, constrained: false, freeBytes: 100 << 20) == .noRoom, "no room: not even asked")
  #expect(KeepPlan.of(online: true, expensive: false, constrained: false, freeBytes: nil) == .go, "room unknown")
  #expect(KeepPlan.of(online: false, expensive: false, constrained: false, freeBytes: room) == .offline)
}
