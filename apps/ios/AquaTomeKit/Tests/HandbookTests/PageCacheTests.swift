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
