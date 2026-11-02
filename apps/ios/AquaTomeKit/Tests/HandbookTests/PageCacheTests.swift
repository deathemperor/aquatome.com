import Foundation
import Testing
@testable import Handbook

private let site = URL(string: "https://aquatome.com")!
private let neon = "/vi/huong-dan/nuoi-ca-neon/"

/// A shard holding the neon guide, with `text` as its one paragraph.
private func shard(_ text: String, v: Int = 1) -> Data {
  try! JSONSerialization.data(withJSONObject: ["v": v, "pages": [
    neon: ["v": 1, "kind": "guide", "path": neon, "title": "Nuôi cá neon trong bể nhỏ", "blocks": [["t": "p", "c": [text]]]],
  ]] as [String: Any])
}
private func text(_ d: PageDoc?) -> String? {
  guard case .paragraph(let c)? = d?.blocks.first else { return nil }
  return c.map(\.text).joined()
}

/// The site as the cache sees it: what it answers, and what was asked.
private actor Site {
  var answer: Data?
  var asked: [String] = []
  init(_ answer: Data?) { self.answer = answer }
  func set(_ a: Data?) { answer = a }
  func get(_ url: URL) throws -> Data {
    asked.append(url.absoluteString)
    guard let answer else { throw URLError(.notConnectedToInternet) }
    return answer
  }
  var count: Int { asked.count }
}
private func cache(_ dir: URL, _ s: Site) -> PageCache { PageCache(dir: dir, site: site, fetch: { try await s.get($0) }) }
private func tmp() -> URL { FileManager.default.temporaryDirectory.appending(path: "pages-\(UUID().uuidString)") }
/// Until the background read is done (it's a task of its own).
private func settle(_ s: Site, _ n: Int) async throws {
  for _ in 0..<200 where await s.count < n { try await Task.sleep(for: .milliseconds(5)) }
}

@Test func aPageIsReadFromItsShardOnceAndKeptOnThePhone() async throws {
  let dir = tmp(), s = Site(shard("Cá neon sống theo đàn."))
  let c = cache(dir, s)
  #expect(text(await c.doc(path: neon, kind: "guide", lang: "vi", count: 32)) == "Cá neon sống theo đàn.")
  #expect(await s.asked == ["https://aquatome.com/app/pages/vi/guide-\(PageDoc.shard(of: neon, count: 32)).json"])
  // Opened again this run: no second read.
  _ = await c.doc(path: neon, kind: "guide", lang: "vi", count: 32)
  #expect(await s.count == 1)
  // Next run, offline: from the phone.
  await s.set(nil)
  #expect(text(await cache(dir, s).doc(path: neon, kind: "guide", lang: "vi", count: 32)) == "Cá neon sống theo đàn.")
}

@Test func aKeptPageShowsAtOnceAndIsReadAgainInTheBackgroundForNextTime() async throws {
  let dir = tmp(), s = Site(shard("Cũ."))
  _ = await cache(dir, s).doc(path: neon, kind: "guide", lang: "vi", count: 32)
  await s.set(shard("Mới."))
  let next = cache(dir, s)
  #expect(text(await next.doc(path: neon, kind: "guide", lang: "vi", count: 32)) == "Cũ.")
  try await settle(s, 2)
  #expect(await s.count == 2)
  #expect(text(await next.doc(path: neon, kind: "guide", lang: "vi", count: 32)) == "Mới.")
  #expect(await s.count == 2, "read once a run")
  #expect(text(await cache(dir, Site(nil)).doc(path: neon, kind: "guide", lang: "vi", count: 32)) == "Mới.")
}

@Test func aPageNewerThanTheKeptShardIsReadNowNotOnTheNextOpen() async {
  let dir = tmp(), s = Site(try! JSONSerialization.data(withJSONObject: ["v": 1, "pages": [:]] as [String: Any]))
  let first = cache(dir, s)
  #expect(await first.doc(path: neon, kind: "guide", lang: "vi", count: 32) == nil)
  // Not on the site either this run: one read, not one per open.
  #expect(await first.doc(path: neon, kind: "guide", lang: "vi", count: 32) == nil)
  #expect(await s.count == 1)
  // Next run the site has published it: the kept shard lacks it, so it's read now, not left for next time.
  await s.set(shard("Bài mới."))
  #expect(text(await cache(dir, s).doc(path: neon, kind: "guide", lang: "vi", count: 32)) == "Bài mới.")
}

@Test func offlineWithNothingKeptThereIsNoPageAndTheNextOpenTriesAgain() async {
  let s = Site(nil)
  let c = cache(tmp(), s)
  #expect(await c.doc(path: neon, kind: "guide", lang: "vi", count: 32) == nil)
  await s.set(shard("Đã có mạng."))
  #expect(text(await c.doc(path: neon, kind: "guide", lang: "vi", count: 32)) == "Đã có mạng.")
}

@Test func aShardThisAppCantReadIsNotKept() async {
  let dir = tmp(), s = Site(shard("Bản mới.", v: 2))
  #expect(await cache(dir, s).doc(path: neon, kind: "guide", lang: "vi", count: 32) == nil)
  #expect(!FileManager.default.fileExists(atPath: dir.path(percentEncoded: false)))
}

@Test func withAnotherShardCountTheKeptShardIsNotUsed() async {
  let dir = tmp(), s = Site(shard("Ba mươi hai."))
  _ = await cache(dir, s).doc(path: neon, kind: "guide", lang: "vi", count: 32)
  await s.set(nil)
  // The site split its pages anew: the kept file is another shard's.
  #expect(await cache(dir, s).doc(path: neon, kind: "guide", lang: "vi", count: 64) == nil)
}

@Test func pagesOpenedTogetherShareOneRead() async {
  let s = Site(shard("Một lần."))
  let c = cache(tmp(), s)
  async let a = c.doc(path: neon, kind: "guide", lang: "vi", count: 32)
  async let b = c.doc(path: neon, kind: "guide", lang: "vi", count: 32)
  let (x, y) = await (a, b)
  #expect(text(x) == "Một lần." && text(y) == "Một lần.")
  #expect(await s.count == 1)
}

@Test func aShelfKeptForOfflineIsReadFromTheSiteNowThenReadsOffline() async throws {
  let dir = tmp(), s = Site(shard("Cũ."))
  _ = await cache(dir, s).doc(path: neon, kind: "guide", lang: "vi", count: 32)
  await s.set(shard("Mới."))
  let c = cache(dir, s)
  // On the phone already, but kept now from the site, not in the background.
  #expect(await c.keep([neon, "/vi/huong-dan/khong-co/"], kind: "guide", lang: "vi", count: 32).map(\.path) == [neon], "only the pages the site has")
  #expect(text(await c.doc(path: neon, kind: "guide", lang: "vi", count: 32)) == "Mới.")
  let reads = await s.count
  _ = await c.keep([neon], kind: "guide", lang: "vi", count: 32)
  #expect(await s.count == reads, "read once a run")
  #expect(text(await cache(dir, Site(nil)).doc(path: neon, kind: "guide", lang: "vi", count: 32)) == "Mới.", "offline")
}

@Test func keepingOfflineWithNoNetworkKeepsWhatThePhoneHas() async {
  let dir = tmp()
  _ = await cache(dir, Site(shard("Đã có."))).doc(path: neon, kind: "guide", lang: "vi", count: 32)
  #expect(await cache(dir, Site(nil)).keep([neon], kind: "guide", lang: "vi", count: 32).count == 1)
  #expect(await cache(tmp(), Site(nil)).keep([neon], kind: "guide", lang: "vi", count: 32).isEmpty)
}

/// A shard of these pages, each showing these pictures.
private func shardOf(_ pages: [(path: String, pictures: [String])]) -> Data {
  let page = { (p: (path: String, pictures: [String])) -> [String: Any] in
    ["v": 1, "kind": "guide", "path": p.path, "title": p.path, "blocks": p.pictures.map { ["t": "figure", "img": ["src": $0, "w": 4, "h": 3]] }]
  }
  return try! JSONSerialization.data(withJSONObject: ["v": 1, "pages": Dictionary(uniqueKeysWithValues: pages.map { ($0.path, page($0)) })] as [String: Any])
}
private func docOf(_ path: String, _ pictures: [String]) -> PageDoc { PageShard(data: shardOf([(path, pictures)]))!.pages[path]! }

@Test func aPageIsKeptOnlyWholeOnThePhone() async {
  let a = docOf("/a/", ["p1", "p2"]), b = docOf("/b/", ["p2", "p3"]), c = docOf("/c/", ["p4"])
  var kept: [String] = [], read: [String] = [], steps: [String] = []
  let n = await KeepPages.run(["/a/", "/b/", "/c/"], docs: { _ in [a, b, c] }, picture: { read.append($0); return true },
                              kept: { kept.append($0) }, progress: { steps.append("\($0)/\($1)") })
  #expect(n == 3 && kept == ["/a/", "/b/", "/c/"])
  #expect(read == ["p1", "p2", "p3", "p4"], "a picture two pages show is read once")
  #expect(steps == ["0/4", "1/4", "2/4", "3/4", "4/4"])
  // A picture that doesn't come: neither page that shows it is kept, the rest are.
  kept = []
  _ = await KeepPages.run(["/a/", "/b/", "/c/"], docs: { _ in [a, b, c] }, picture: { $0 != "p2" }, kept: { kept.append($0) }, progress: { _, _ in })
  #expect(kept == ["/c/"])
}

@Test func aStoppedKeepLeavesOutThePageItWasOn() async {
  let a = docOf("/a/", ["p1"]), b = docOf("/b/", ["p2", "p3"]), c = docOf("/c/", ["p4"])
  // Stopped while reading b's last picture (which still comes): a is kept, b and c aren't.
  let kept = await Task { () -> [String] in
    var kept: [String] = []
    _ = await KeepPages.run(["/a/", "/b/", "/c/"], docs: { _ in [a, b, c] }, picture: { src in
      if src == "p3" { withUnsafeCurrentTask { $0?.cancel() } }
      return true
    }, kept: { kept.append($0) }, progress: { _, _ in })
    return kept
  }.value
  #expect(kept == ["/a/"])
}

@Test func lettingPagesGoDeletesTheirShardAndPicturesButNotWhatAKeptPageNeeds() async {
  let a = "/vi/huong-dan/a/", b = "/vi/huong-dan/b/"
  let dir = tmp(), c = cache(dir, Site(shardOf([(a, ["x", "shared"]), (b, ["shared", "y"])])))
  // One shard for both (count 1).
  #expect(await c.keep([a, b], kind: "guide", lang: "vi", count: 1).count == 2)
  let file = dir.appending(path: "vi/guide-1-0.json").path(percentEncoded: false)
  #expect(await c.forget([a], keeping: [b], kind: "guide", lang: "vi", count: 1) == ["x"], "not the picture b shows too")
  #expect(FileManager.default.fileExists(atPath: file), "b is in that shard")
  #expect(await c.forget([b], keeping: [], kind: "guide", lang: "vi", count: 1) == ["shared", "y"])
  #expect(!FileManager.default.fileExists(atPath: file))
  #expect(await cache(dir, Site(nil)).doc(path: b, kind: "guide", lang: "vi", count: 1) == nil, "gone from the phone")
}

@Test func aStoppedKeepReadsNoFurtherShard() async {
  let s = Site(shard("Một."))
  let c = cache(tmp(), s)
  // Three pages in three shards; stopped before it starts, none is read.
  let paths = (0..<64).map { "/vi/huong-dan/bai-\($0)/" }
  let three = Array(Dictionary(grouping: paths) { PageDoc.shard(of: $0, count: 32) }.values.prefix(3).map { $0[0] })
  let docs = await Task {
    withUnsafeCurrentTask { $0?.cancel() }
    return await c.keep(three, kind: "guide", lang: "vi", count: 32)
  }.value
  #expect(docs.isEmpty)
  #expect(await s.count == 0)
}

@Test func keptPicturesAreFilesThatOutlastTheRun() {
  let dir = tmp(), src = "https://media.aquatome.com/a/neon-lead.webp"
  let kept = KeptPictures(dir: dir)
  #expect(kept.data(src) == nil)
  #expect(kept.save(Data("ảnh".utf8), for: src))
  // Another launch: the same file.
  #expect(KeptPictures(dir: dir).data(src) == Data("ảnh".utf8))
  #expect(KeptPictures(dir: dir).data(src + "?2") == nil)
  kept.remove(src)
  #expect(KeptPictures(dir: dir).data(src) == nil)
}
