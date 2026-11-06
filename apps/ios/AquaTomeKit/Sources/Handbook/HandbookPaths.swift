import Foundation
import Observation

/// The handbook's pages by path, in one language: the index's, and what the reader keeps on the phone by path (the
/// pages saved to read later and read last, the pages kept for offline and their shards in `cache`), all in the index's
/// form (PathForm). An index in another form than what's kept moves what's kept to it; the form is saved once all of it
/// has moved, so a move cut short runs again on the next launch. Kept in `defaults`, one set per language:
/// "handbook.reading.<lang>", "handbook.kept.<lang>", "handbook.kept.counts.<lang>" and "handbook.paths.<lang>".
@MainActor
@Observable
public final class HandbookPaths {
  /// Pages saved to read later, and the ones read last.
  public private(set) var reading: ReadingList
  /// The pages kept for reading offline, each whole on the phone (KeepPages), newest first.
  public private(set) var kept: [String]
  /// Each kind's shard count when its pages were kept: with another, the kept shards are other files.
  private var keptCounts: [String: Int]
  /// The index's pages by path in its form: one the index gives in the other form is found too.
  private var byPath: [String: HandbookIndex.Item] = [:]
  /// Where the index has its Vietnamese pages; nil for an Indonesian or Thai index.
  private var form: PathForm?
  /// The form what's kept is in: the index's when it last moved; under "/vi/" from an app older than the move.
  @ObservationIgnored private var keptForm: PathForm
  /// The kept shards moving to the index's form.
  @ObservationIgnored private var moving: Task<Void, Never>?
  @ObservationIgnored private let lang: String
  @ObservationIgnored private let cache: PageCache
  @ObservationIgnored private let defaults: UserDefaults

  public init(lang: String, cache: PageCache, defaults: UserDefaults = .standard) {
    self.lang = lang; self.cache = cache; self.defaults = defaults
    reading = defaults.data(forKey: "handbook.reading.\(lang)").flatMap { try? JSONDecoder().decode(ReadingList.self, from: $0) } ?? ReadingList()
    kept = defaults.stringArray(forKey: "handbook.kept.\(lang)") ?? []
    keptCounts = defaults.dictionary(forKey: "handbook.kept.counts.\(lang)") as? [String: Int] ?? [:]
    keptForm = defaults.string(forKey: "handbook.paths.\(lang)").flatMap(PathForm.init(rawValue:)) ?? .underVi
  }

  /// The index the app has now: its pages, and what's kept moved to its form if that's another (the site moved its
  /// Vietnamese pages, or moved them back). The reading list and the kept list move at once, the kept shards after.
  public func use(_ index: HandbookIndex) {
    let form = PathForm(index)
    self.form = form
    byPath = Dictionary(index.items.map { (form?.path($0.path) ?? $0.path, $0) }, uniquingKeysWith: { a, _ in a })
    guard let form else { return }
    // The lists by the index's form, not the shards': a move cut short, then the site back the way it was, finds the
    // shards where they were but the lists already moved.
    var listed = reading
    listed.move(to: form)
    if listed != reading { change { $0 = listed } }
    if form.paths(kept) != kept { kept = form.paths(kept); saveKept() }
    guard form != keptForm else { return }
    keptForm = form
    let before = moving
    moving = Task {
      await before?.value
      if await cache.move(to: form, lang: lang) { defaults.set(form.rawValue, forKey: "handbook.paths.\(lang)") }
    }
  }

  /// Once the kept shards are in the index's form: what reads them waits for it.
  public func settled() async { await moving?.value }

  /// The page at `path` the index lists, the path in either form: a link from a page read before the site moved its
  /// Vietnamese pages, or after.
  public func item(at path: String) -> HandbookIndex.Item? { byPath[key(path)] }

  /// `path` in the index's form: as the reading list and the kept list hold it.
  public func key(_ path: String) -> String { form?.path(path) ?? path }

  /// The path a page's shard holds it by: the one the index gives it now (what the site hashed), for an item from
  /// before the index changed form too.
  public func shardPath(_ path: String) -> String { byPath[key(path)]?.path ?? key(path) }

  public func read(_ item: HandbookIndex.Item) { change { $0.read(key(item.path)) } }
  public func toggleSaved(_ item: HandbookIndex.Item) { change { $0.toggleSaved(key(item.path)) } }
  public func isSaved(_ item: HandbookIndex.Item) -> Bool { reading.isSaved(key(item.path)) }

  /// The saved pages and the ones read last, of `kind` (all kinds for nil), as the index has them now.
  public func saved(_ kind: HandbookIndex.Kind?) -> [HandbookIndex.Item] { ReadingList.items(reading.saved, in: byPath, kind: kind) }
  public func recent(_ kind: HandbookIndex.Kind?, limit: Int = 5) -> [HandbookIndex.Item] {
    ReadingList.items(reading.recent, in: byPath, kind: kind, limit: limit)
  }

  public func isKept(_ item: HandbookIndex.Item) -> Bool { kept.contains(key(item.path)) }

  /// The pages kept for offline that the index has now.
  public var keptItems: [HandbookIndex.Item] { ReadingList.items(kept, in: byPath, kind: nil) }

  /// A page now whole on the phone (`path` as its shard gives it), first on the list; its kind's shard count from
  /// `counts` (the index's `pages`).
  public func markKept(_ path: String, counts: [String: Int]) {
    let k = key(path)
    kept.removeAll { $0 == k }
    kept.insert(k, at: 0)
    if let kind = byPath[k]?.kind.rawValue { keptCounts[kind] = counts[kind] }
    saveKept()
  }

  /// Pages no longer kept for offline: off the list.
  public func unmark(_ items: [HandbookIndex.Item]) {
    let gone = Set(items.map { key($0.path) })
    kept.removeAll { gone.contains($0) }
    saveKept()
  }

  /// The kept pages of `kind`, as their shards hold them.
  public func kept(of kind: String) -> [String] { kept.filter { byPath[$0]?.kind.rawValue == kind }.map(shardPath) }

  /// The site split a kind's pages anew (`counts`, the index's `pages`): the kept shards are another count's files, so
  /// that kind's kept pages are no longer on the phone as the app reads them. They come off the list (kept again from
  /// their shelf), returned with the old count for their files to go.
  public func dropOtherCounts(_ counts: [String: Int]) -> [(kind: String, count: Int, paths: [String])] {
    var out: [(kind: String, count: Int, paths: [String])] = []
    for (kind, old) in keptCounts where counts[kind] != old {
      let paths = kept.filter { byPath[$0]?.kind.rawValue == kind }
      kept.removeAll { paths.contains($0) }
      keptCounts[kind] = nil
      out.append((kind, old, paths.map(shardPath)))
    }
    if !out.isEmpty { saveKept() }
    return out
  }

  private func change(_ edit: (inout ReadingList) -> Void) {
    edit(&reading)
    defaults.set(try? JSONEncoder().encode(reading), forKey: "handbook.reading.\(lang)")
  }

  private func saveKept() {
    defaults.set(kept, forKey: "handbook.kept.\(lang)")
    defaults.set(keptCounts, forKey: "handbook.kept.counts.\(lang)")
  }
}
