import Foundation

/// The site's pages as blocks (PageDoc), kept on the phone: each shard (`/app/pages/<lang>/<kind>-<n>.json`) is read
/// from the phone when it's there, so a page shows at once and offline, and fetched again once a run to stay current.
/// A shard never fetched is fetched when a page in it is opened. Nothing is bundled with the app.
public actor PageCache {
  public typealias Fetch = @Sendable (URL) async throws -> Data
  typealias Write = @Sendable (Data, URL) throws -> Void

  private let dir: URL
  private let site: URL
  private let fetch: Fetch
  /// How `move` writes a file (tests: one that fails).
  private let write: Write
  private var shards: [String: PageShard] = [:]
  /// Shards read from the site this run, or tried in the background.
  private var fetched: Set<String> = []
  /// Fetches of shards not on the phone yet: one each, however many pages ask.
  private var loading: [String: Task<Void, Never>] = [:]
  /// Shards read from the site this run (not only tried).
  private var fresh: Set<String> = []

  /// `dir` holds the kept shards (Application Support: the system doesn't clear it); `fetch` reads one from the site.
  public init(dir: URL, site: URL, fetch: @escaping Fetch) {
    self.init(dir: dir, site: site, fetch: fetch, write: { try $0.write(to: $1, options: .atomic) })
  }

  init(dir: URL, site: URL, fetch: @escaping Fetch, write: @escaping Write) {
    self.dir = dir; self.site = site; self.fetch = fetch; self.write = write
  }

  /// The page at `path`, of `kind` with `count` shards (the app index's `pages`), in `lang`; nil if neither the phone nor
  /// the site has it as this app can read it (the app then opens it on the web).
  public func doc(path: String, kind: String, lang: String, count: Int) async -> PageDoc? {
    let (key, url) = place(path, kind: kind, lang: lang, count: count)
    fromPhone(key)
    if shards[key] == nil || (shards[key]?.pages[path] == nil && !fetched.contains(key)) {
      // Not on the phone, or a page newer than the kept shard: read now (offline, the next open tries again).
      await fetchNow(key, url)
    } else if !fetched.contains(key) {
      // Shown from the phone; a newer copy is read in the background, for next time.
      fetched.insert(key)
      Task { await self.refresh(key, url) }
    }
    return shards[key]?.pages[path]
  }

  /// The pages at `paths` kept for reading offline: each one's shard read from the site now, unless it was this run,
  /// and kept on the phone. Returns those the site (or, offline, the phone) has, in order. A stop (the task cancelled)
  /// reads no further shard.
  public func keep(_ paths: [String], kind: String, lang: String, count: Int) async -> [PageDoc] {
    var out: [PageDoc] = []
    for p in paths {
      if Task.isCancelled { break }
      let (key, url) = place(p, kind: kind, lang: lang, count: count)
      fromPhone(key)
      if !fresh.contains(key) { await fetchNow(key, url) }
      if let d = shards[key]?.pages[p] { out.append(d) }
    }
    return out
  }

  /// Pages no longer kept for offline (`paths`; `keeping`, of the same kind, stay kept): each shard none of `keeping` is
  /// in is deleted from the phone. Returns the pictures only the pages let go of show, for the caller to delete.
  public func forget(_ paths: [String], keeping: [String], kind: String, lang: String, count: Int) -> [String] {
    let key = { self.place($0, kind: kind, lang: lang, count: count).key }
    for p in paths + keeping { fromPhone(key(p)) }
    let stay = Set(keeping.compactMap { shards[key($0)]?.pages[$0] }.flatMap(\.pictures))
    let pictures = Set(paths.compactMap { shards[key($0)]?.pages[$0] }.flatMap(\.pictures)).subtracting(stay)
    for k in Set(paths.map(key)).subtracting(keeping.map(key)) {
      try? FileManager.default.removeItem(at: file(k))
      shards[k] = nil
      fetched.remove(k)
      fresh.remove(k)
    }
    return pictures.sorted()
  }

  /// The shards of `lang` on the phone with their pages' paths put in `form` (PathForm), each page moved to the shard
  /// its path falls in now, as the site's shards in that form hold it: a page kept for offline still opens offline under
  /// its new path. A page on the phone in both forms keeps the one already in `form` (read from the site since).
  /// Returns whether every page moved; one that didn't is still on the phone, for the next move to take.
  @discardableResult
  public func move(to form: PathForm, lang: String) -> Bool {
    let folder = dir.appending(path: lang)
    let names = (try? FileManager.default.contentsOfDirectory(atPath: folder.path(percentEncoded: false))) ?? []
    // "<kind>-<count>-<n>.json", by kind and count ("<kind>-<count>-<n>.<move>.json" too: a move's new file not yet in
    // place). A kind split anew is another count's files, left as they are.
    let files = Dictionary(grouping: names.filter { $0.hasSuffix(".json") }) { $0.dropLast(5).split(separator: "-").dropLast().joined(separator: "-") }
    let isNew = { (name: String) in name.dropLast(5).contains(".") }
    var whole = true
    for (prefix, names) in files {
      guard let count = prefix.split(separator: "-").last.flatMap({ Int($0) }) else { continue }
      var moved: [Int: [String: Any]] = [:], stayed: [Int: [String: Any]] = [:]
      var read: [String] = []
      // A move's new files first: a page in one of them and in its shard too (a move whose rename failed, the shard
      // read from the site since), the shard's copy, read last, is the one kept.
      for name in names.sorted(by: { isNew($0) && !isNew($1) }) {
        guard let o = (try? Data(contentsOf: folder.appending(path: name))).flatMap({ try? JSONSerialization.jsonObject(with: $0) }) as? [String: Any],
              o["v"] as? Int == PageDoc.version, let pages = o["pages"] as? [String: Any] else { continue }
        read.append(name)
        for case let (path, page as [String: Any]) in pages {
          var page = page
          let to = form.path(path)
          page["path"] = to
          let n = PageDoc.shard(of: to, count: count)
          if to == path { stayed[n, default: [:]][to] = page } else { moved[n, default: [:]][to] = page }
        }
      }
      // Nothing to move, and no new file of a move cut short.
      guard !moved.isEmpty || read.contains(where: isNew) else { continue }
      // A shard is often both where pages leave and where others arrive. Each new file is written beside the old ones
      // first, under a name the next move reads too; once all are written, each takes its shard's name, and the old
      // files no longer used go. Cut short at any point, every page is still in a file the next move reads.
      let out = moved.merging(stayed, uniquingKeysWith: { a, b in a.merging(b) { _, inForm in inForm } })
      let run = UUID().uuidString.prefix(8)
      var written: [(new: String, final: String)] = []
      for (n, pages) in out {
        let final = "\(prefix)-\(n).json", new = "\(prefix)-\(n).\(run).json"
        guard let data = try? JSONSerialization.data(withJSONObject: ["v": PageDoc.version, "pages": pages] as [String: Any]),
              (try? write(data, folder.appending(path: new))) != nil else { break }
        written.append((new, final))
      }
      guard written.count == out.count else {
        for w in written { try? FileManager.default.removeItem(at: folder.appending(path: w.new)) }
        whole = false
        continue
      }
      // rename(2) puts each new file in the old one's place in one step.
      let placed = written.allSatisfy { w in
        rename(folder.appending(path: w.new).path(percentEncoded: false), folder.appending(path: w.final).path(percentEncoded: false)) == 0
      }
      guard placed else { whole = false; continue }
      let finals = Set(written.map(\.final))
      for name in read where !finals.contains(name) { try? FileManager.default.removeItem(at: folder.appending(path: name)) }
    }
    // Read again from the phone, as moved, and from the site for next time.
    let ours = { (k: String) in k.hasPrefix("\(lang)/") }
    shards = shards.filter { !ours($0.key) }
    fetched = fetched.filter { !ours($0) }
    fresh = fresh.filter { !ours($0) }
    return whole
  }

  /// A page's shard: its key on the phone (the count is in the kept file's name: with another count, the pages are in
  /// other shards) and its address on the site.
  private func place(_ path: String, kind: String, lang: String, count: Int) -> (key: String, url: URL) {
    let n = PageDoc.shard(of: path, count: count)
    return ("\(lang)/\(kind)-\(count)-\(n)", site.appending(path: "app/pages/\(lang)/\(kind)-\(n).json"))
  }

  private func fromPhone(_ key: String) {
    if shards[key] == nil, let data = try? Data(contentsOf: file(key)), let s = PageShard(data: data) { shards[key] = s }
  }

  /// One read of the shard however many ask at once.
  private func fetchNow(_ key: String, _ url: URL) async {
    let t = loading[key] ?? Task { await self.refresh(key, url) }
    loading[key] = t
    await t.value
    if loading[key] == t { loading[key] = nil }
  }

  private func refresh(_ key: String, _ url: URL) async {
    guard let data = try? await fetch(url), let s = PageShard(data: data) else { return }
    fetched.insert(key)
    fresh.insert(key)
    shards[key] = s
    let f = file(key)
    try? FileManager.default.createDirectory(at: f.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? data.write(to: f, options: .atomic)
  }

  private func file(_ key: String) -> URL { dir.appending(path: "\(key).json") }
}

/// Keeping pages for offline, page by page: a page counts as kept only once its shard and every picture in it are on the
/// phone. A picture that fails leaves its page out; a stop (the task cancelled) ends the run and leaves out the page it
/// was on. So the kept list never names a page that is only partly on the phone.
public enum KeepPages {
  /// `docs`: the pages, their shards read and kept (PageCache.keep). `picture`: one picture read into the cache, true
  /// when it's there. `kept`: a page now whole on the phone. `progress`: pictures done, of all of them. Returns how many
  /// pages were kept.
  public static func run(_ paths: [String], docs: ([String]) async -> [PageDoc], picture: (String) async -> Bool,
                         kept: (String) -> Void, progress: (_ done: Int, _ of: Int) -> Void,
                         isolation: isolated (any Actor)? = #isolation) async -> Int {
    let pages = await docs(paths)
    let total = Set(pages.flatMap(\.pictures)).count
    var got: [String: Bool] = [:]
    var done = 0, n = 0
    progress(0, total)
    for page in pages {
      if Task.isCancelled { break }
      var whole = true
      for src in page.pictures {
        if Task.isCancelled { whole = false; break }
        if let ok = got[src] { whole = whole && ok; continue }
        let ok = await picture(src)
        got[src] = ok
        whole = whole && ok
        done += 1
        progress(done, total)
      }
      if whole && !Task.isCancelled {
        kept(page.path)
        n += 1
      }
    }
    return n
  }
}
