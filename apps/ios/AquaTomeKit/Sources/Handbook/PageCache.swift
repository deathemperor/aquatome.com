import Foundation

/// The site's pages as blocks (PageDoc), kept on the phone: each shard (`/app/pages/<lang>/<kind>-<n>.json`) is read
/// from the phone when it's there, so a page shows at once and offline, and fetched again once a run to stay current.
/// A shard never fetched is fetched when a page in it is opened. Nothing is bundled with the app.
public actor PageCache {
  public typealias Fetch = @Sendable (URL) async throws -> Data

  private let dir: URL
  private let site: URL
  private let fetch: Fetch
  private var shards: [String: PageShard] = [:]
  /// Shards read from the site this run, or tried in the background.
  private var fetched: Set<String> = []
  /// Fetches of shards not on the phone yet: one each, however many pages ask.
  private var loading: [String: Task<Void, Never>] = [:]

  /// `dir` holds the kept shards (Application Support: the system doesn't clear it); `fetch` reads one from the site.
  public init(dir: URL, site: URL, fetch: @escaping Fetch) {
    self.dir = dir; self.site = site; self.fetch = fetch
  }

  /// The page at `path`, of `kind` with `count` shards (the app index's `pages`), in `lang`; nil if neither the phone nor
  /// the site has it as this app can read it (the app then opens it on the web).
  public func doc(path: String, kind: String, lang: String, count: Int) async -> PageDoc? {
    let n = PageDoc.shard(of: path, count: count)
    // The count is in the kept file's name: with another count, the pages are in other shards.
    let key = "\(lang)/\(kind)-\(count)-\(n)"
    let url = site.appending(path: "app/pages/\(lang)/\(kind)-\(n).json")
    if shards[key] == nil, let data = try? Data(contentsOf: file(key)), let s = PageShard(data: data) { shards[key] = s }
    if shards[key] == nil {
      // Not on the phone: read now (offline, the next open tries again).
      let t = loading[key] ?? Task { await self.refresh(key, url) }
      loading[key] = t
      await t.value
      loading[key] = nil
    } else if !fetched.contains(key) {
      // Shown from the phone; a newer copy is read in the background, for next time.
      fetched.insert(key)
      Task { await self.refresh(key, url) }
    }
    return shards[key]?.pages[path]
  }

  private func refresh(_ key: String, _ url: URL) async {
    guard let data = try? await fetch(url), let s = PageShard(data: data) else { return }
    fetched.insert(key)
    shards[key] = s
    let f = file(key)
    try? FileManager.default.createDirectory(at: f.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? data.write(to: f, options: .atomic)
  }

  private func file(_ key: String) -> URL { dir.appending(path: "\(key).json") }
}
