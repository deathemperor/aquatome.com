import Foundation
import Testing
@testable import Handbook

private let site = URL(string: "https://aquatome.com")!
private let guide = "/vi/huong-dan/nuoi-ca-neon/", fish = "/vi/ca/ca-neon/"

/// The index with its Vietnamese pages under "/vi/" or, `atRoot`, at the root.
private func index(atRoot: Bool, more: [HandbookIndex.Item] = []) -> HandbookIndex {
  let p = { (s: String) in atRoot ? PathForm.atRoot.path(s) : s }
  return HandbookIndex(lang: "vi", items: [
    .init(kind: .guide, name: "Nuôi cá neon trong bể nhỏ", path: p(guide)),
    .init(kind: .fish, contentId: "paracheirodon-innesi", name: "Cá neon", path: p(fish)),
  ] + more, pages: ["guide": 32, "fish": 32])
}

/// A shard as the site writes it, holding the guide at `path`.
private func shard(_ path: String) -> Data {
  try! JSONSerialization.data(withJSONObject: ["v": 1, "pages": [
    path: ["v": 1, "kind": "guide", "path": path, "title": "Nuôi cá neon trong bể nhỏ", "blocks": [["t": "p", "c": ["Cá neon sống theo đàn."]]]],
  ]] as [String: Any])
}

/// One phone: its settings and its kept shards, each launch a new HandbookPaths and PageCache on them.
private final class Phone: Sendable {
  let name = "handbook-paths-\(UUID().uuidString)"
  var defaults: UserDefaults { UserDefaults(suiteName: name)! }
  let dir = FileManager.default.temporaryDirectory.appending(path: "pages-\(UUID().uuidString)")
  deinit {
    UserDefaults(suiteName: name)?.removePersistentDomain(forName: name)
    try? FileManager.default.removeItem(at: dir)
  }

  /// The site answering `answer` for every shard (nil: offline); `failing`, the move's writes all fail (a full phone).
  func cache(_ answer: Data?, failing: Bool = false) -> PageCache {
    PageCache(dir: dir, site: site, fetch: { _ in
      guard let answer else { throw URLError(.notConnectedToInternet) }
      return answer
    }, write: { data, url in
      if failing { throw CocoaError(.fileWriteOutOfSpace) }
      try data.write(to: url, options: .atomic)
    })
  }

  @MainActor func launch(_ cache: PageCache, _ ix: HandbookIndex) -> HandbookPaths {
    let paths = HandbookPaths(lang: "vi", cache: cache, defaults: defaults)
    paths.use(ix)
    return paths
  }

  var savedForm: String? { defaults.string(forKey: "handbook.paths.vi") }
}

/// The guide saved, read and kept for offline while the index has it under "/vi/".
@MainActor private func keptUnderVi(_ phone: Phone) async -> HandbookPaths {
  let cache = phone.cache(shard(guide))
  let paths = phone.launch(cache, index(atRoot: false))
  let item = paths.item(at: guide)!
  paths.toggleSaved(item)
  paths.read(item)
  let docs = await cache.keep([paths.shardPath(item.path)], kind: "guide", lang: "vi", count: 32)
  for d in docs { paths.markKept(d.path, counts: ["guide": 32]) }
  #expect(paths.isKept(item) && paths.isSaved(item))
  return paths
}

@Test @MainActor func aPageIsFoundByItsPathInEitherForm() {
  let phone = Phone()
  let paths = phone.launch(phone.cache(nil), index(atRoot: true))
  #expect(paths.item(at: "/ca/ca-neon/")?.name == "Cá neon")
  #expect(paths.item(at: "/vi/ca/ca-neon/")?.name == "Cá neon")
  #expect(paths.item(at: "/vi/ca/khong-co/") == nil)
  // Back under "/vi/": the same.
  paths.use(index(atRoot: false))
  #expect(paths.item(at: "/ca/ca-neon/")?.name == "Cá neon" && paths.item(at: "/vi/ca/ca-neon/")?.name == "Cá neon")
}

/// An index with one page the other way (a stray): found by either path, its shard read by the path the index gives.
@Test @MainActor func aPageTheIndexGivesInTheOtherFormIsFoundToo() {
  let stray = HandbookIndex.Item(kind: .guide, name: "Rêu hại", path: "/vi/huong-dan/reu-hai/")
  let phone = Phone()
  let paths = phone.launch(phone.cache(nil), index(atRoot: true, more: [stray]))
  #expect(paths.item(at: "/huong-dan/reu-hai/") == stray && paths.item(at: "/vi/huong-dan/reu-hai/") == stray)
  #expect(paths.shardPath(stray.path) == "/vi/huong-dan/reu-hai/")
  #expect(paths.key(stray.path) == "/huong-dan/reu-hai/")
}

/// Saved, read and kept for offline under "/vi/"; then the index comes at the root, with the phone offline: listed,
/// saved, kept, and the guide opening from the phone at its root path.
@Test @MainActor func whatsKeptUnderViMovesToTheRootAndStillOpensOffline() async {
  let phone = Phone()
  _ = await keptUnderVi(phone)
  let cache = phone.cache(nil)
  let paths = phone.launch(cache, index(atRoot: true))
  await paths.settled()
  let item = paths.item(at: "/huong-dan/nuoi-ca-neon/")!
  #expect(paths.saved(nil) == [item] && paths.recent(nil) == [item], "not listed")
  #expect(paths.keptItems == [item] && paths.isKept(item) && paths.isSaved(item))
  #expect(paths.kept == ["/huong-dan/nuoi-ca-neon/"])
  let doc = await cache.doc(path: paths.shardPath(item.path), kind: "guide", lang: "vi", count: 32)
  #expect(doc?.path == "/huong-dan/nuoi-ca-neon/", "the kept guide doesn't open offline")
  #expect(phone.savedForm == "root")
  // Kept as moved: the next launch has nothing to move.
  #expect(phone.launch(phone.cache(nil), index(atRoot: true)).kept == ["/huong-dan/nuoi-ca-neon/"])
}

/// An item from before the index changed form (a page open then): saved, read and kept at the index's path.
@Test @MainActor func anItemFromBeforeTheChangeIsKeptAtTheNewPath() {
  let phone = Phone()
  let paths = phone.launch(phone.cache(nil), index(atRoot: false))
  let old = paths.item(at: guide)!
  paths.use(index(atRoot: true))
  paths.toggleSaved(old)
  paths.read(old)
  paths.markKept(old.path, counts: ["guide": 32])
  #expect(paths.reading.saved == ["/huong-dan/nuoi-ca-neon/"] && paths.reading.recent == ["/huong-dan/nuoi-ca-neon/"])
  #expect(paths.kept == ["/huong-dan/nuoi-ca-neon/"] && paths.isKept(old) && paths.isSaved(old))
  #expect(paths.shardPath(old.path) == "/huong-dan/nuoi-ca-neon/")
}

/// The kept shards can't be written (a full phone): nothing is lost, the form isn't saved, and the next launch moves
/// them.
@Test @MainActor func aMoveThatFailsIsTriedAgainOnTheNextLaunch() async {
  let phone = Phone()
  _ = await keptUnderVi(phone)
  let failing = phone.cache(nil, failing: true)
  let first = phone.launch(failing, index(atRoot: true))
  await first.settled()
  #expect(phone.savedForm == nil, "saved as moved")
  #expect(await failing.doc(path: guide, kind: "guide", lang: "vi", count: 32) != nil, "the kept guide lost")
  let cache = phone.cache(nil)
  let next = phone.launch(cache, index(atRoot: true))
  await next.settled()
  #expect(phone.savedForm == "root")
  #expect(next.isKept(next.item(at: "/huong-dan/nuoi-ca-neon/")!))
  #expect(await cache.doc(path: "/huong-dan/nuoi-ca-neon/", kind: "guide", lang: "vi", count: 32) != nil, "not moved")
}

/// A move cut short, then the site back under "/vi/" by the next launch: the shards never moved, and the lists, moved
/// at once, move back.
@Test @MainActor func aMoveCutShortThenBackUnderViKeepsTheLists() async {
  let phone = Phone()
  _ = await keptUnderVi(phone)
  await phone.launch(phone.cache(nil, failing: true), index(atRoot: true)).settled()
  #expect(phone.savedForm == nil, "saved as moved")
  let cache = phone.cache(nil)
  let back = phone.launch(cache, index(atRoot: false))
  await back.settled()
  let item = back.item(at: guide)!
  #expect(back.kept == [guide] && back.reading.saved == [guide] && back.reading.recent == [guide], "the lists stayed at the root")
  #expect(back.keptItems == [item] && back.saved(nil) == [item] && back.recent(nil) == [item])
  #expect(await cache.doc(path: guide, kind: "guide", lang: "vi", count: 32) != nil)
}

/// And back, should the site put "/vi" back.
@Test @MainActor func whatsKeptMovesBackUnderVi() async {
  let phone = Phone()
  _ = await keptUnderVi(phone)
  let root = phone.launch(phone.cache(nil), index(atRoot: true))
  await root.settled()
  let cache = phone.cache(nil)
  let back = phone.launch(cache, index(atRoot: false))
  await back.settled()
  #expect(back.kept == [guide] && back.reading.saved == [guide] && phone.savedForm == "vi")
  #expect(await cache.doc(path: guide, kind: "guide", lang: "vi", count: 32) != nil)
}

/// An Indonesian or Thai index has no Vietnamese pages: nothing moves.
@Test @MainActor func anotherLanguagesIndexMovesNothing() async {
  let phone = Phone()
  _ = await keptUnderVi(phone)
  let paths = phone.launch(phone.cache(nil), HandbookIndex(lang: "id", items: [.init(kind: .guide, name: "Neon", path: "/id/panduan/neon/")]))
  await paths.settled()
  #expect(paths.kept == [guide] && phone.savedForm == nil)
}
