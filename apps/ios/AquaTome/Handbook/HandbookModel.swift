import Foundation
import Handbook
import Observation
import Tanks
import Telemetry

/// The handbook tab: the site's index for this language (kept on the phone for offline use), searched natively.
@Observable
@MainActor
final class HandbookModel {
  enum Status: Equatable { case loading, ready, offline, failed }

  /// The site's language for this app's language: the one iOS chose, if the app offers it (SiteLanguage), else Vietnamese.
  let lang: String
  /// The app's language, as the site has it: its pages' addresses (SiteLanguage).
  var language: SiteLanguage { SiteLanguage.served(lang) ?? .vietnamese }
  let site = URL(string: "https://aquatome.com")!
  private(set) var status = Status.loading
  private(set) var count = 0
  /// The query, the kind picked and what they find (SearchState): searched once a change, not on every redraw.
  private(set) var searching = SearchState(HandbookSearch([]), page: HandbookModel.searchPage())
  var query: String { get { searching.query } set { searching.query = newValue } }
  /// Counts the times a screen asked for Tìm with its words (AppScreen.search): typing changes `query` too, and v2 opens
  /// its search tab for this alone.
  var searchAsked = 0
  var kind: HandbookIndex.Kind? { get { searching.kind } set { searching.kind = newValue } }
  var results: [HandbookIndex.Item] { searching.results }
  /// How many pages the query finds of each kind, and in all under nil: what the chips above the results say.
  var counts: [HandbookIndex.Kind?: Int] { searching.counts }
  /// How many the kind picked finds past the rows listed: a page more of them for "Xem thêm kết quả".
  var left: Int { searching.left }
  func showMore() { searching.showMore() }

  /// The index searched, for the tanks tab's guides and fish picker: a copy of the one in `searching`, set with it, so
  /// what they read changes with the index, not with each letter typed in the Tìm tab, which would redraw them and
  /// search again for them.
  private var search = HandbookSearch([])
  /// Fish and plant pages by their content id: what a tank's `species[].id` and `plants[].id` hold.
  private var pages: [String: HandbookIndex.Item] = [:]
  /// The page a tank's entry without a page is shown as, by its scientific name.
  private var matcher = PageMatcher([])
  /// Every page by its path, and what the reader keeps on this phone by path (the pages saved to read later and read
  /// last, the pages kept for offline), one set per language: all in the index's form, moved when it changes.
  private let paths: HandbookPaths
  /// What's new on the site as last read: none until read, and none from a site without it (the index names no file).
  private var whatsNew: Latest?
  /// Its entries with their pages in the index shown now, newest first (looked up in the index's form).
  var latest: [Latest.Row] { whatsNew?.rows { paths.item(at: $0) } ?? [] }
  /// The whole of what's new, on the web.
  var latestWeb: URL? { whatsNew.flatMap { URL(string: $0.web, relativeTo: site)?.absoluteURL } }
  /// The index arranged to browse: groups, placements, subjects, the home's picks.
  private(set) var shelves = HandbookShelves(HandbookIndex(lang: "vi", items: []))
  /// The reader's own comments shown at once, by page key, until the site's list has them (`readers`).
  @ObservationIgnored private var mine: [String: [Readers.Comment]] = [:]
  /// The readers the reader blocks and the posts they report, kept off their screen on this phone.
  let safety = ReaderSafety()
  /// The site's words for the keys items carry, in this language.
  private(set) var labels = HandbookIndex.Labels()
  /// How many shards of pages each kind has: the kinds the app draws itself (PageDoc).
  private var shardCounts: [String: Int] = [:]
  /// Whether the site takes the app's anonymous telemetry, as its index read fresh this launch says; nil until then. Not
  /// from the copy kept from an earlier launch: a flag the site has turned off since must not let anything go.
  private(set) var siteTelemetry: Bool?
  /// The app's anonymous telemetry: each page opened. The app sets it.
  @ObservationIgnored var telemetry: Telemetry?
  /// Keeps on their way, by shelf (KeepOffline's key): how many pictures are in, of how many. Here, not on the shelf's
  /// screen, so a shelf left and opened again still shows its keep and can stop it.
  private(set) var keeping: [String: (done: Int, of: Int)] = [:]
  private var runs: [String: Task<Void, Never>] = [:]
  #if DEBUG
  /// Keeps whose work hasn't ended, stopped or not: a stopped one is off `keeping` at once, but its last picture can
  /// still be on its way. The UI tests read it before saying a stopped keep kept nothing (BrowseView).
  private(set) var keepsWorking = 0
  #endif
  /// A keep that ended with some pages not kept (kept, of how many), for its shelf to say once.
  private var short: [String: (Int, Int)] = [:]
  private let source: Source
  /// The pages the app draws itself, kept on the phone.
  private let drawn: PageCache
  /// The site's copy has been read this run: showing the tab again doesn't fetch it again (pull to refresh does).
  private var fetched = false
  /// When the index in use was last read: coming back to the front reads it again once it's older than `staleAfter`
  /// (`cameToFront`). Else an app left open kept the first one until iOS ended it, days on (the owner, 11 Nov: build 347's
  /// longer lists, put on the site that evening, didn't show).
  private var readAt: Date?
  #if DEBUG
  /// UI tests (`-index-changes-after <s>`): the site's index has changed, once a read came that long after the one before.
  @ObservationIgnored private var siteChanged = false
  #endif
  #if DEBUG
  /// UI tests (`-pages-later`): the fixed index, with its `pages`, held back until a page opens.
  private var pagesLater: HandbookIndex?
  #endif

  /// Where the index comes from: the site, or (UI tests) a fixed one.
  enum Source {
    case site
    case fixed(HandbookIndex)
  }

  init(source: Source = HandbookModel.defaultSource(), preferred: [String] = Bundle.main.preferredLocalizations) {
    self.source = source
    lang = SiteLanguage.of(preferred).code
    drawn = Self.pageCache(source, site: site)
    paths = HandbookPaths(lang: lang, cache: drawn)
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("-watch-tank-searches") { tankSearchChanges = 0; watchTankSearches() }
    #endif
  }

  #if DEBUG
  /// UI tests (`-watch-tank-searches`): how many times what the tanks tab's guides and fish picker search has changed
  /// (each change redraws them and searches again), shown in the Tìm tab. Nil unless watched.
  private(set) var tankSearchChanges: Int?
  private func watchTankSearches() {
    withObservationTracking { _ = guides(about: []); _ = life("") } onChange: { [weak self] in
      Task { @MainActor in
        self?.tankSearchChanges? += 1
        self?.watchTankSearches()
      }
    }
  }
  #endif

  /// Whether the app draws this page itself: the site publishes its kind as blocks.
  func drawsItself(_ item: HandbookIndex.Item) -> Bool { shardCounts[item.kind.rawValue] != nil }

  /// The page as blocks, from the phone or the site; nil when the web page is to show instead.
  func doc(_ item: HandbookIndex.Item) async -> PageDoc? {
    guard let count = shardCounts[item.kind.rawValue] else { return nil }
    await paths.settled()
    return await drawn.doc(path: paths.shardPath(item.path), kind: item.kind.rawValue, lang: lang, count: count)
  }

  /// A page's readers' comments and photos, from the site (Readers): each nil when the page has none to ask for or the
  /// site doesn't answer. The reader's own comments come last until the site's list has them: a read within a minute of
  /// posting may be the one cached before it.
  func readers(_ talk: PageDoc.Talk) async -> ([Readers.Comment]?, [Readers.Photo]?) {
    async let comments = Self.readers(talk.comments.map { Readers.url(comments: $0, site: site) }, source)
    async let photos = Self.readers(talk.photos.map { Readers.url(photos: $0, site: site) }, source)
    var read = await comments.map(Readers.comments)
    if let key = talk.comments, let list = read {
      let have = Set(list.map(\.id))
      mine[key] = mine[key]?.filter { !have.contains($0.id) }
      read = list + (mine[key] ?? [])
    }
    return (read, await photos.map(Readers.photos))
  }

  /// A comment the reader posted that shows at once, on the page whose comments `key` names.
  func posted(_ comment: Readers.Comment, on key: String) { mine[key, default: []].append(comment) }

  private nonisolated static func readers(_ url: URL?, _ source: Source) async -> Data? {
    guard let url else { return nil }
    #if DEBUG
    // UI tests read no network: the fixed answers.
    if case .fixed = source { return HandbookIndex.fixtureReaders[url.absoluteString] }
    #endif
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    guard let (data, response) = try? await URLSession.shared.data(for: Readers.request(url, version: version)),
          (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    return data
  }

  /// The page at a path the index lists ("/vi/ca/ca-neon/"), the path in either form (PathForm): a link from a page
  /// read before the site moved its Vietnamese pages, or after.
  /// The index's page at `path`, or a taxon or origin page the app draws as a shelf of the index's fish.
  func item(at path: String) -> HandbookIndex.Item? { paths.item(at: path) ?? shelves.page(at: path)?.item }

  /// Keeps these pages for reading offline: the shards they're in, read from the site now, then every picture in them,
  /// telling how many pictures are kept so far. Returns how many of the pages are on the phone.
  /// A stop (the task cancelled) ends it; a page counts as kept only once it's whole on the phone (KeepPages).
  func keep(_ items: [HandbookIndex.Item], progress: (_ done: Int, _ of: Int) -> Void) async -> Int {
    await KeepPages.run(items.map { paths.shardPath($0.path) }, docs: { _ in
      await paths.settled()
      var docs: [PageDoc] = []
      for (kind, list) in Dictionary(grouping: items, by: \.kind) {
        guard let count = shardCounts[kind.rawValue] else { continue }
        docs += await drawn.keep(list.map { paths.shardPath($0.path) }, kind: kind.rawValue, lang: lang, count: count)
      }
      return docs
    }, picture: { await PageImages.keep($0) }, kept: { paths.markKept($0, counts: shardCounts) }, progress: progress)
  }

  /// Starts keeping a shelf's pages (`shelf`: its key), unless that shelf's keep is on its way.
  func startKeeping(_ items: [HandbookIndex.Item], shelf: String) {
    guard runs[shelf] == nil else { return }
    keeping[shelf] = (0, 0)
    #if DEBUG
    keepsWorking += 1
    #endif
    runs[shelf] = Task {
      #if DEBUG
      defer { keepsWorking -= 1 }
      #endif
      let n = await keep(items) { done, of in if !Task.isCancelled { keeping[shelf] = (done, of) } }
      // Stopped: already off the list, and the pages kept so far are whole.
      guard !Task.isCancelled else { return }
      runs[shelf] = nil
      keeping[shelf] = nil
      if n < items.count { short[shelf] = (n, items.count) }
    }
  }

  func stopKeeping(_ shelf: String) {
    runs[shelf]?.cancel()
    runs[shelf] = nil
    keeping[shelf] = nil
  }

  /// How a shelf's last keep fell short (kept, of how many), once: then forgotten.
  func takeShort(_ shelf: String) -> (Int, Int)? { short.removeValue(forKey: shelf) }

  func isKept(_ item: HandbookIndex.Item) -> Bool { paths.isKept(item) }

  /// The pages kept for offline that the index has now.
  var keptItems: [HandbookIndex.Item] { paths.keptItems }

  /// Pages no longer kept for offline: off the list, then their pictures and the shards no kept page is in deleted from
  /// the phone (not what a page still kept needs).
  /// A keep on its way is stopped first, and waited for: it would put back a shard or picture this deletes.
  func unkeep(_ items: [HandbookIndex.Item]) async {
    let running = Array(runs.values)
    for shelf in Array(runs.keys) { stopKeeping(shelf) }
    paths.unmark(items)
    for t in running { await t.value }
    for (kind, list) in Dictionary(grouping: items, by: \.kind) {
      guard let count = shardCounts[kind.rawValue] else { continue }
      await forget(list.map { paths.shardPath($0.path) }, kind: kind.rawValue, count: count)
    }
  }

  private func forget(_ gone: [String], kind: String, count: Int) async {
    await paths.settled()
    for src in await drawn.forget(gone, keeping: paths.kept(of: kind), kind: kind, lang: lang, count: count) { PageImages.forget(src) }
  }

  /// The site split a kind's pages anew: that kind's kept pages come off the list (HandbookPaths), and their old files go.
  private func dropKeptOfOtherCounts() {
    for d in paths.dropOtherCounts(shardCounts) { Task { await forget(d.paths, kind: d.kind, count: d.count) } }
  }

  func url(_ item: HandbookIndex.Item) -> URL { URL(string: item.path, relativeTo: site)!.absoluteURL }

  /// The page of a fish or plant on a tank, once the index is here.
  func page(_ contentId: String) -> HandbookIndex.Item? { pages[contentId] }

  /// The page a tank's entry without a page is shown as, once the index has one with its scientific name (PageMatcher).
  func page(for e: UnlistedEntry) -> HandbookIndex.Item? { matcher.page(kind: e.kind, sci: e.sci).flatMap { pages[$0] } }

  /// The saved pages and the ones read last, of `kind` (all kinds for nil), as the index has them now.
  func saved(_ kind: HandbookIndex.Kind?) -> [HandbookIndex.Item] { paths.saved(kind) }
  func recent(_ kind: HandbookIndex.Kind?, limit: Int = 5) -> [HandbookIndex.Item] { paths.recent(kind, limit: limit) }

  /// Guides that name these fish and plants (a tank's), the most of them first, then in name order: the written ones,
  /// and the ones made from videos apart, as a species page on the site lists them.
  func guides(about ids: [String]) -> (written: [HandbookIndex.Item], videos: [HandbookIndex.Item]) {
    let all = search.find("", kind: .guide)
    return (HandbookIndex.guides(about: ids, in: all.filter { $0.video == nil }), HandbookIndex.guides(about: ids, in: all.filter { $0.video != nil }))
  }

  /// A page opened (drawn by the app or as the web page): on the pages read last, and its view for the telemetry.
  func read(_ item: HandbookIndex.Item) {
    paths.read(item)
    telemetry?.record(.view(path: item.path))
    #if DEBUG
    // UI tests (`-pages-later`): the index says which kinds the app draws only once a page has opened.
    if let ix = pagesLater {
      pagesLater = nil
      Task { try? await Task.sleep(for: .seconds(1)); use(ix, .ready) }
    }
    #endif
  }
  func toggleSaved(_ item: HandbookIndex.Item) { paths.toggleSaved(item) }
  func isSaved(_ item: HandbookIndex.Item) -> Bool { paths.isSaved(item) }

  /// The fish and plants a tank can list, for `query` (all of them for none).
  func life(_ query: String) -> [HandbookIndex.Item] {
    search.find(query, limit: .max).filter { ($0.kind == .fish || $0.kind == .plant) && $0.contentId != nil }
  }

  /// When the tab shows: the index, unless this run already has the site's copy.
  func appear() async {
    if !fetched { await load() }
  }

  /// How old the index in use may be when the app comes back to the front: 15 minutes, as a reader back after a break sees
  /// what the site put up meanwhile. UI tests shorten it (`-index-stale-after <s>`).
  static var staleAfter: TimeInterval {
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    if let i = args.firstIndex(of: "-index-stale-after"), i + 1 < args.count, let s = TimeInterval(args[i + 1]) { return s }
    #endif
    return 15 * 60
  }

  /// Back in front: the index read again if the one in use is older than `staleAfter`. In place, as a pull to refresh
  /// reads it: the shelves and pages shown stay until it comes, so nothing flashes and the reader stays where they were.
  /// Not before a first read (the tabs' `appear` has that), so not at launch.
  func cameToFront(now: Date = .now) async {
    guard let readAt, now.timeIntervalSince(readAt) >= Self.staleAfter else { return }
    await load()
  }

  /// The kept copy first (instant, offline) if nothing is shown yet, then the site's current one.
  func load() async {
    if case .fixed(var ix) = source {
      #if DEBUG
      // `-index-changes-after <s>`: a read that long after the one before finds the site's index changed, and so does every
      // read after it: a fish just added comes first on Khám phá's shelf ("Cá mới đến").
      let args = ProcessInfo.processInfo.arguments
      if let i = args.firstIndex(of: "-index-changes-after"), i + 1 < args.count, let s = TimeInterval(args[i + 1]),
         let readAt, Date().timeIntervalSince(readAt) >= s {
        siteChanged = true
      }
      if siteChanged { ix = ix.withAFishJustAdded() }
      if ProcessInfo.processInfo.arguments.contains("-pages-later"), pagesLater == nil, count == 0 {
        pagesLater = ix
        return use(HandbookIndex(lang: ix.lang, items: ix.items, home: ix.home, labels: ix.labels, places: ix.places, telemetry: ix.telemetry), .ready)
      }
      // `-index-kept-only`: only the copy kept from an earlier launch is read, and the site's never comes (offline, or a
      // slow site).
      if ProcessInfo.processInfo.arguments.contains("-index-kept-only") { return use(ix, .offline) }
      // `-index-later`: the index read a moment after the app opens, as the site's on a phone (a link opening the app
      // waits for it: AppLink).
      if ProcessInfo.processInfo.arguments.contains("-index-later"), count == 0 { try? await Task.sleep(for: .seconds(2)) }
      #endif
      use(ix, .ready)
      readAt = .now
      #if DEBUG
      if ix.latest != nil { whatsNew = HandbookIndex.fixtureLatest }
      #endif
      return
    }
    let file = Self.cacheFile(lang)
    if count == 0, let data = try? Data(contentsOf: file), let ix = try? JSONDecoder().decode(HandbookIndex.self, from: data) {
      use(ix, .offline)
      if ix.latest != nil { whatsNew = latestFile.kept() }
    }
    do {
      let (data, response) = try await URLSession.shared.data(from: site.appendingPathComponent("app/\(lang).json"))
      guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
      let ix = try JSONDecoder().decode(HandbookIndex.self, from: data)
      try? data.write(to: file, options: .atomic)
      use(ix, .ready)
      readAt = .now
      // What's new after it, the index shown without waiting; left for another tab, both are read again when it shows.
      switch await latestFile.read(ix.latest) {
      case .noList: whatsNew = nil
      case .read(let l): whatsNew = l
      case .failed: break
      case .interrupted: return
      }
      fetched = true
    } catch {
      // Left for another tab or page: tried again when the tab shows next, nothing to report.
      if isInterruption(error) { return }
      if count == 0 { status = .failed }
    }
  }

  private var latestFile: LatestFile { LatestFile(file: Self.cacheFile("latest-\(lang)"), site: site, fetch: Self.fromSite) }

  private func use(_ ix: HandbookIndex, _ s: Status) {
    search = HandbookSearch(ix.items)
    searching.search = search
    pages = Dictionary(ix.items.compactMap { i in i.contentId.map { ($0, i) } }, uniquingKeysWith: { a, _ in a })
    matcher = PageMatcher(index: ix.items)
    paths.use(ix)
    shardCounts = ix.pages
    if s == .ready { siteTelemetry = ix.telemetry }
    dropKeptOfOtherCounts()
    shelves = HandbookShelves(ix)
    labels = ix.labels
    count = ix.items.count
    status = s
  }

  /// How many of its best a search lists at first, and then a page more: 200, except in UI tests (`-search-page N`),
  /// whose small index lists a few to see "Xem thêm kết quả" without scrolling through 200 rows.
  private static func searchPage() -> Int {
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    if let i = args.firstIndex(of: "-search-page"), i + 1 < args.count, let n = Int(args[i + 1]) { return n }
    #endif
    return 200
  }

  /// The site, except in UI tests (`-fixed-handbook`), which use a small fixed index: no network, same answers each run.
  /// Performance tests use `-large-handbook`: as many fish as the site has, still without the network.
  static func defaultSource() -> Source {
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    // `-index-file PATH`: the index read from a file on this Mac (one built from today's content), for parity shots with the
    // site's real pages.
    if let i = args.firstIndex(of: "-index-file"), i + 1 < args.count, let data = FileManager.default.contents(atPath: args[i + 1]),
       let ix = try? JSONDecoder().decode(HandbookIndex.self, from: data) { return .fixed(ix) }
    if args.contains("-large-handbook") { return .fixed(.large) }
    if args.contains("-fixed-handbook") {
      // `-vi-at-root`: the site has taken "/vi" out of its Vietnamese pages' addresses.
      let f = args.contains("-vi-at-root") ? HandbookIndex.fixtureAtRoot : .fixture
      // `-pages-count N`: the site has split its guides into N shards since the last launch.
      let counted = args.firstIndex(of: "-pages-count").flatMap { $0 + 1 < args.count ? Int(args[$0 + 1]) : nil }.map { ["guide": $0] } ?? f.pages
      // `-equipment`: the site lists a kind of kit too, with the many fish it's for, and has its page as blocks.
      let kit = args.contains("-equipment")
      let pages = kit ? counted.merging(["equipment": 1]) { a, _ in a } : counted
      // `-whats-new`: the index names the site's what's new too (`fixtureLatest`).
      let latest = args.contains("-whats-new") ? "/app/latest/vi.json" : nil
      // `-breeds`: the site lists a breed of the discus too, as it lists breeds.
      var items = (args.contains("-breeds") ? f.items + HandbookIndex.fixtureBreeds : f.items) + (kit ? HandbookIndex.fixtureKit : [])
      // `-series N`: N video series, the fixture's own first (0: none, as the Indonesian and Thai sites have).
      if let n = args.firstIndex(of: "-series").flatMap({ $0 + 1 < args.count ? Int(args[$0 + 1]) : nil }) {
        let own = items.filter { $0.kind == .video }
        items.removeAll { $0.kind == .video }
        items += Array(own.prefix(n)) + (own.count..<max(n, own.count)).map {
          .init(kind: .video, name: "Bộ video \($0 + 1)", sub: "Kênh \($0 + 1)", path: "/vi/video/bo-video-\($0 + 1)/", parts: $0 + 2)
        }
      }
      // `-plan`: the editors have planned Hôm nay's days (`fixtureDays`).
      var home = f.home
      // `-wide-pictures`: each fish and plant has a photo (a wide stand-in, `-fixed-pictures`) with its fish's box across
      // nearly all of it, and each group one: a photo the frame rule shows whole wherever it goes (WholePhotoFlowTests).
      if args.contains("-wide-pictures") {
        let box = PhotoBox(x: 0.04, y: 0.1, w: 0.92, h: 0.8)
        items = items.map { i in
          guard i.kind == .fish || i.kind == .plant,
                var o = (try? JSONSerialization.jsonObject(with: JSONEncoder().encode(i))) as? [String: Any] else { return i }
          o["img"] = "https://aquatome.com/img/wide-\(i.contentId ?? i.name)-480.webp"
          o["imgBox"] = ["x": box.x, "y": box.y, "w": box.w, "h": box.h]
          return (try? JSONSerialization.data(withJSONObject: o)).flatMap { try? JSONDecoder().decode(HandbookIndex.Item.self, from: $0) } ?? i
        }
        if let groups = home?.groups {
          home?.groups = groups.map { .init(id: $0.id, img: "https://aquatome.com/img/wide-\($0.id)-480.webp", imgBox: box) }
        }
      }
      // `-familiar N`: Khám phá's fish shelf runs long, N fish after the fixture's own, as the hobbyists' list does.
      if let n = args.firstIndex(of: "-familiar").flatMap({ $0 + 1 < args.count ? Int(args[$0 + 1]) : nil }), n > 0 {
        let more = (1...n).map { HandbookIndex.Item(kind: .fish, contentId: "quen-\($0)", name: "Cá quen \($0)", sub: "Genus familiaris", path: "/vi/ca/ca-quen-\($0)/", group: "tetras") }
        items += more
        let browse = HandbookIndex.Home.Browse(fish: (home?.fish ?? []) + more.map(\.path), plants: home?.plants ?? [], guides: home?.guides ?? [])
        home?.browse = browse
      }
      if args.contains("-plan") { home?.days = HandbookIndex.fixtureDays }
      // `-site-telemetry`: the site takes the app's anonymous telemetry (the fixed index says nothing of it otherwise).
      return .fixed(HandbookIndex(lang: f.lang, items: items, home: home, labels: f.labels, pages: pages, places: f.places,
                                  telemetry: args.contains("-site-telemetry"),
                                  latest: latest))
    }
    #endif
    return .site
  }

  /// Kept in Application Support, as the index is; UI tests get the fixed pages, without the network.
  private static func pageCache(_ source: Source, site: URL) -> PageCache {
    #if DEBUG
    if case .fixed = source {
      let launch = ProcessInfo.processInfo.arguments
      // `-keep-pages`: the same folder from one launch to the next, so a page's kept copy can differ from the site's.
      let dir = FileManager.default.temporaryDirectory.appending(path: launch.contains("-keep-pages") ? "pages-kept" : "pages-\(UUID().uuidString)")
      // `-newer-part`: the neon's page holds a part from a newer site, which this build can't draw.
      let pages = launch.contains("-equipment") ? HandbookIndex.fixtureKitPages
        : launch.contains("-vi-at-root") ? HandbookIndex.fixturePagesAtRoot
        : launch.contains("-newer-part") ? HandbookIndex.fixturePagesWithANewerPart
        : launch.contains("-long-page") ? HandbookIndex.fixturePagesLong
        : launch.contains("-long-part") ? HandbookIndex.fixturePagesWithLongParts
        : launch.contains("-long-guide") ? HandbookIndex.fixturePagesWithALongGuide
        : launch.contains("-lead-in-gallery") ? HandbookIndex.fixturePagesLeadInGallery : HandbookIndex.fixturePages
      // `-slow-pages`: a page that takes its time to be read.
      let slow = launch.contains("-slow-pages")
      return PageCache(dir: dir, site: site, fetch: { _ in
        if slow { try? await Task.sleep(for: .seconds(4)) }
        return pages
      })
    }
    #endif
    var dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "pages")
    // The site's copy, read again when needed: not for the phone's backup.
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? dir.setResourceValues(values)
    return PageCache(dir: dir, site: site, fetch: fromSite)
  }

  /// A file of the site's, or why not.
  private static let fromSite: @Sendable (URL) async throws -> Data = { url in
    let (data, response) = try await URLSession.shared.data(from: url)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
    return data
  }

  private static func cacheFile(_ lang: String) -> URL {
    let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("handbook", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent("\(lang).json")
  }
}

#if DEBUG
extension HandbookIndex {
  /// UI tests' calendar (`-plan`): 13 November planned whole, its fish one Hôm nay's own picks never are, each card with
  /// its photo; the 14th planned with no fish, and a guide and a story without a photo, the story's
  /// line as long as the editors write them; the 15th not planned. The 13th's story tells the guide the app's own picks
  /// lead with, in the editors' words.
  static let fixtureDays: [Home.Day] = [
    .init(date: "2026-11-13", fish: "/vi/ca/ca-ngua-van/", img: "https://media.aquatome.com/a/danio-large.webp",
          guide: "/vi/huong-dan/cach-han-che-reu-hai/", guideImg: "https://media.aquatome.com/a/reu-hai-large.webp",
          story: .init(path: "/vi/huong-dan/nuoi-ca-neon/", img: "https://media.aquatome.com/a/neon-large.webp", eyebrow: "Cho người mới",
                       title: "Đàn neon đầu tiên", dek: "Sáu con trở lên, nước mềm, thả khi bể đã chạy ổn định")),
    .init(date: "2026-11-14", guide: "/vi/huong-dan/nuoi-ca-neon/",
          story: .init(path: "/vi/huong-dan/cach-han-che-reu-hai/", eyebrow: "Mẹo chăm bể", title: "Ít rêu hơn khi bể đủ cây",
                       dek: "Đèn bật 6 đến 8 tiếng, trồng dày cây mọc nhanh ngay từ đầu, thay nước đều mỗi tuần và cho ăn vừa đủ cá ăn hết")),
  ]

  /// UI tests' index: a few pages of each kind, as the site writes them.
  static let fixture = HandbookIndex(lang: "vi", items: [
    .init(kind: .fish, contentId: "symphysodon-aequifasciatus", name: "Cá đĩa", sub: "Symphysodon aequifasciatus", aka: ["Discus"], path: "/vi/ca/ca-dia/",
          facts: .init(tempC: .init(min: 28, max: 31), ph: .init(min: 4.5, max: 6.5), sizeCm: 15, tankCm: 120, difficulty: 7), group: "cichlids",
          tax: ["Perciformes", "Cichlidae", "Symphysodon"], from: ["south-america", "brazil", "colombia", "peru"]),
    .init(kind: .fish, contentId: "paracheirodon-innesi", name: "Cá neon", sub: "Paracheirodon innesi", aka: ["Neon tetra"], path: "/vi/ca/ca-neon/",
          facts: .init(tempC: .init(min: 20, max: 26), ph: .init(min: 5, max: 7), gh: .init(min: 1, max: 2), sizeCm: 4, tankCm: 60, temperament: "peaceful",
                         schoolMin: 6, difficulty: 2, lifeYears: .init(min: 5, max: 10)),
          group: "tetras", tax: ["Characiformes", "Characidae", "Paracheirodon"], from: ["south-america", "brazil", "colombia", "peru"]),
    // Its lifespan alone, one figure with a fraction of a year (min = max): none of the figures the fish list filters by.
    .init(kind: .fish, contentId: "danio-rerio", name: "Cá ngựa vằn", sub: "Danio rerio", path: "/vi/ca/ca-ngua-van/",
          facts: .init(lifeYears: .init(min: 3.5, max: 3.5)), group: "danios",
          tax: ["Cypriniformes", "Cyprinidae", "Danio"], from: ["asia", "india"]),
    .init(kind: .plant, contentId: "rotala-rotundifolia", name: "Rotala đỏ", sub: "Rotala rotundifolia", path: "/vi/cay/rotala-do/",
          facts: .init(tempC: .init(min: 20, max: 28)), plant: .init(difficulty: 2, light: "high", co2: "optional", growth: "fast", placement: ["background"])),
    .init(kind: .guide, name: "Nuôi cá neon trong bể nhỏ", path: "/vi/huong-dan/nuoi-ca-neon/", section: "care", about: ["paracheirodon-innesi"]),
    .init(kind: .guide, name: "Cách hạn chế rêu hại", path: "/vi/huong-dan/cach-han-che-reu-hai/", section: "plantCare", about: ["paracheirodon-innesi"],
          video: 1755),
    .init(kind: .video, name: "Rêu hại từ A đến Z", sub: "MJ Aquascaping", path: "/vi/video/reu-hai-tu-a-den-z/", parts: 1),
    .init(kind: .glossary, name: "Đệm pH", path: "/vi/thuat-ngu/dem-ph/"),
    // The tools page, which lists them all: no tile of its own on Tìm.
    .init(kind: .tool, name: "Công cụ", path: "/vi/cong-cu/"),
    .init(kind: .tool, name: "Đèn Chihiros", path: "/vi/cong-cu/den-chihiros/", short: "Đèn Chihiros"),
    .init(kind: .tool, name: "Bể của tôi", path: "/vi/cong-cu/be-cua-toi/", words: ["Bể của tôi: sổ ghi bể cá, cây và lịch đèn"], short: "Bể của tôi"),
    .init(kind: .tool, name: "Kiểm tra nuôi chung", path: "/vi/cong-cu/nuoi-chung/", short: "Nuôi chung"),
    .init(kind: .tool, name: "Bể bao nhiêu lít?", path: "/vi/cong-cu/the-tich-be/", words: ["Tính thể tích bể cá: lít, gallon, độ dày kính"],
          short: "Thể tích bể"),
    // A tool the app has no screen for: its web page.
    .init(kind: .tool, name: "Set một bể hết bao nhiêu tiền?", path: "/vi/cong-cu/du-toan-be/",
          words: ["Dự toán chi phí set bể thủy sinh: tiền mua đồ và tiền nuôi mỗi tháng"], short: "Dự toán chi phí"),
    .init(kind: .tool, name: "Đây là cá gì?", path: "/vi/cong-cu/nhan-dien-ca/", words: ["Nhận diện cá qua ảnh"], short: "Nhận diện cá"),
  ], home: .init(groups: [.init(id: "cichlids"), .init(id: "tetras"), .init(id: "danios")], fish: ["/vi/ca/ca-neon/", "/vi/ca/ca-dia/"],
                 plants: [], guides: ["/vi/huong-dan/nuoi-ca-neon/"]),
  labels: .init([
    "group": ["cichlids": "Cichlid", "tetras": "Cá tetra", "danios": "Danio", "other": "Loài khác"],
    "placement": ["foreground": "Tiền cảnh", "midground": "Trung cảnh", "background": "Hậu cảnh", "epiphyte": "Bám đá, lũa", "floating": "Thả nổi"],
    "section": ["setup": "Setup bể", "care": "Chăm sóc", "plantCare": "Chăm cây"],
    "light": ["low": "Yếu", "medium": "Trung bình", "high": "Mạnh"],
    "co2": ["none": "Không cần", "optional": "Tùy chọn", "required": "Bắt buộc"],
    "growth": ["slow": "Chậm", "medium": "Vừa", "fast": "Nhanh"],
    "difficulty": ["1": "Dễ", "2": "Trung bình", "3": "Khó"],
    "taxon": ["title": "Phân loại", "order": "Bộ", "family": "Họ", "genus": "Chi", "intro": "{level} {name}: {n} loài."],
    "origin": ["title": "Nguồn gốc", "intro": "{n} loài có nguồn gốc từ {place}."],
  ]), pages: ["guide": 1, "fish": 1, "plant": 1, "glossary": 1, "video": 1], places: [
    .init(id: "asia", name: "Châu Á", kind: .continent),
    .init(id: "india", name: "Ấn Độ", kind: .country, parent: "asia", kids: ["Kerala", "Assam"]),
    .init(id: "south-america", name: "Nam Mỹ", kind: .continent),
    .init(id: "brazil", name: "Brazil", kind: .country, parent: "south-america", kids: [
      "Amazonas", "Araguaia", "Cuiabá", "Japurá", "Juruá", "Madeira", "Mato Grosso", "Negro", "Pantanal", "Pará", "Purus", "Rio Negro",
      "Rio Tapajós", "Rio Xingu", "São Paulo", "Tefé", "Tocantins", "Trombetas", "Uatumã", "Xingu",
    ]),
    .init(id: "colombia", name: "Colombia", kind: .country, parent: "south-america",
          kids: ["Amazonas", "Guaviare", "Meta", "Orinoco", "Putumayo", "Vaupés"]),
    .init(id: "peru", name: "Peru", kind: .country, parent: "south-america", kids: ["Nanay", "Ucayali"]),
  ])

  /// UI tests' kit (`-equipment`): a kind of kit, and more fish needing it than its page lists in place.
  static let fixtureKit: [Item] = [.init(kind: .equipment, name: "Lọc", path: "/vi/thiet-bi/loc/")]
    + (1...40).map { .init(kind: .fish, contentId: "ca-thu-\($0)", name: "Cá thử \($0)", sub: "Piscis \($0)", path: "/vi/ca/ca-thu-\($0)/") }

  /// UI tests' what's new (`-whats-new`), as the site writes it: newest first, a page the index doesn't have (left out), the neon there
  /// twice, updated then new.
  static let fixtureLatest = Latest(lang: "vi", entries: [
    .init(date: "2026-10-28", path: "/vi/ca/ca-neon/", action: "updated", source: "Seriously Fish"),
    .init(date: "2026-10-27", path: "/vi/huong-dan/nuoi-ca-neon/", action: "new", source: "2Hr Aquarist"),
    .init(date: "2026-10-27", path: "/vi/ca/khong-co/", action: "new", source: "Aquarium Glaser"),
    .init(date: "2026-10-20", path: "/vi/cay/rotala-do/", action: "new", source: "Tropica"),
    .init(date: "2026-10-12", path: "/vi/ca/ca-neon/", action: "new", source: "Seriously Fish"),
  ], web: "/vi/moi-cap-nhat/")

  /// UI tests' breeds (`-breeds`): a form of the discus, as the site lists one: the species it's a form of, its own
  /// figures as its page's data card gives them, and none of the tank-mates figures (a tank check counts it as the discus).
  static let fixtureBreeds: [Item] = [
    .init(kind: .fish, contentId: "pigeon-blood-discus", name: "Cá đĩa Pigeon Blood", path: "/vi/ca/ca-dia-pigeon-blood/",
          of: "symphysodon-aequifasciatus",
          card: .init(tempC: .init(min: 28, max: 30), ph: .init(min: 5.5, max: 7), sizeCm: 15, tankCm: 120, difficulty: 7)),
  ]

  /// UI tests' page of a kind of kit (`-equipment`), as the site writes it.
  static let fixtureKitPages = Data(#"""
  {"v":1,"pages":{"/vi/thiet-bi/loc/":{"v":1,"kind":"equipment","path":"/vi/thiet-bi/loc/","title":"Lọc","meta":"40 loài cá cần · 2 loại · 1 bài viết","lead":{"src":"https://media.aquatome.com/a/loc.webp","w":1000,"h":667,"alt":"Lọc","credit":{"text":"Ảnh: Aquarium Co-op","licence":"dùng với sự cho phép","url":"https://example.org/photo/loc"}},"blocks":[{"t":"p","c":["Bộ lọc giữ nước trong và nuôi vi sinh xử lý chất thải của cá."]},{"t":"p","c":["Lọc làm ba việc: giữ cặn, nuôi vi sinh, tạo dòng chảy."]},{"t":"h","text":"Các loại lọc"},{"t":"h","text":"Lọc thùng","id":"loc-thung"},{"t":"figure","img":{"src":"https://media.aquatome.com/a/loc-thung.webp","w":960,"h":720,"alt":"Lọc thùng","credit":{"text":"Ảnh: Tác giả 6","licence":"CC BY 4.0","url":"https://example.org/photo/loc-thung"}}},{"t":"p","c":["Đặt ngoài bể, khỏe và êm, hợp bể từ 60 cm."]},{"t":"p","c":[{"text":"Chọn thế nào:","b":true}," Lưu lượng gấp 4 lần thể tích bể mỗi giờ."]},{"t":"p","c":["Đã tìm hiểu kỹ: ",{"text":"Oase BioMaster 350","href":"/vi/san-pham/oase-biomaster-350/"}]},{"t":"p","c":[{"text":"Mua lọc thùng trên Shopee","href":"/go/shopee/?k=l%E1%BB%8Dc+th%C3%B9ng&c=loc&e=equipment%3Aloc"}]},{"t":"p","c":["Hay tìm: ",{"text":"lọc thùng mini","href":"/go/shopee/?k=l%E1%BB%8Dc+th%C3%B9ng+mini&c=loc&e=equipment%3Aloc"}]},{"t":"cards","title":"Loài dùng lọc thùng","items":[{"path":"/vi/ca/ca-neon/","name":"Cá neon"},{"path":"/vi/ca/ca-dia/","name":"Cá đĩa"}]},{"t":"p","c":["+38 loài"]},{"t":"h","text":"Lọc bọt biển","id":"loc-bot-bien"},{"t":"p","c":["Rẻ và hiền, hợp bể nhỏ và bể tép."]},{"t":"p","c":[{"text":"Chọn thế nào:","b":true}," Một miếng cho bể đến 40 lít."]},{"t":"h","text":"Cách chọn"},{"t":"list","items":[[{"t":"p","c":["Chọn theo cỡ bể và cá nuôi."]}]]},{"t":"h","text":"Sai lầm thường gặp"},{"t":"list","items":[[{"t":"p","c":["Rửa vật liệu lọc bằng nước máy."]}]]},{"t":"pages","title":"Loài cá cần lọc","paths":["/vi/ca/ca-thu-1/","/vi/ca/ca-thu-2/","/vi/ca/ca-thu-3/","/vi/ca/ca-thu-4/","/vi/ca/ca-thu-5/","/vi/ca/ca-thu-6/","/vi/ca/ca-thu-7/","/vi/ca/ca-thu-8/","/vi/ca/ca-thu-9/","/vi/ca/ca-thu-10/","/vi/ca/ca-thu-11/","/vi/ca/ca-thu-12/","/vi/ca/ca-thu-13/","/vi/ca/ca-thu-14/","/vi/ca/ca-thu-15/","/vi/ca/ca-thu-16/","/vi/ca/ca-thu-17/","/vi/ca/ca-thu-18/","/vi/ca/ca-thu-19/","/vi/ca/ca-thu-20/","/vi/ca/ca-thu-21/","/vi/ca/ca-thu-22/","/vi/ca/ca-thu-23/","/vi/ca/ca-thu-24/","/vi/ca/ca-thu-25/","/vi/ca/ca-thu-26/","/vi/ca/ca-thu-27/","/vi/ca/ca-thu-28/","/vi/ca/ca-thu-29/","/vi/ca/ca-thu-30/","/vi/ca/ca-thu-31/","/vi/ca/ca-thu-32/","/vi/ca/ca-thu-33/","/vi/ca/ca-thu-34/","/vi/ca/ca-thu-35/","/vi/ca/ca-thu-36/","/vi/ca/ca-thu-37/","/vi/ca/ca-thu-38/","/vi/ca/ca-thu-39/","/vi/ca/ca-thu-40/"]},{"t":"faq","title":"Hỏi đáp","items":[{"q":"Bao lâu rửa lọc một lần?","a":"Khoảng mỗi tháng, bằng nước bể."}]},{"t":"pages","title":"Bài viết liên quan","paths":["/vi/huong-dan/nuoi-ca-neon/"]},{"t":"h","text":"Gợi ý mua hay gặp (1)"},{"t":"list","items":[[{"t":"p","c":[{"text":"lọc thùng mini","href":"/go/shopee/?k=l%E1%BB%8Dc+th%C3%B9ng+mini&c=loc&e=equipment%3Aloc"}]}]]},{"t":"p","c":["Liên kết tiếp thị — trang có thể nhận hoa hồng khi bạn mua qua liên kết."]}]}}}
  """#.utf8)

  /// UI tests' pages: the neon guide as the site writes it (/app/pages/vi/guide-0.json), with each kind of block, links
  /// to the fixture's pages and a tool, a word's tip, and two parts in a row from a newer site the app can't draw; a
  /// video guide with its chapters; a fish with three videos (the last one YouTube refuses), a plant, a term and a video
  /// series, each as the site writes it.
  static let fixturePages = Data(#"""
  {"v":1,"pages":{"/vi/huong-dan/cach-han-che-reu-hai/":{"v":1,"kind":"guide","path":"/vi/huong-dan/cach-han-che-reu-hai/","title":"Cách hạn chế rêu hại","credit":["AquaTome tổng hợp từ ",{"text":"1 nguồn","href":"#nguon"}," rồi tự viết"],"video":{"youtubeId":"abc123XYZ_-","title":"Hạn chế rêu hại","channel":"MJ Aquascaping","durationSec":1755,"poster":{"src":"https://media.aquatome.com/a/reu-hai-480.webp","w":1200,"h":800,"alt":"Rêu hại trên lá cây"},"chapters":[{"at":0,"title":"Vì sao rêu mọc"},{"at":95,"title":"Ánh sáng và CO₂"}]},"blocks":[{"t":"p","c":["Ánh sáng vừa đủ, CO₂ đều, thay nước đúng lịch."]},{"t":"refs","title":"Nguồn tham khảo","id":"nguon","items":[{"title":"Video gốc: Hạn chế rêu hại, kênh MJ Aquascaping · 29:15","url":"https://www.youtube.com/watch?v=abc123XYZ_-"}]}]},
  "/vi/video/reu-hai-tu-a-den-z/":{"v":1,"kind":"video","path":"/vi/video/reu-hai-tu-a-den-z/","title":"Rêu hại từ A đến Z","credit":["1 bài · 29 phút video · theo playlist “",{"text":"ALGAE! Everything you need to know!","href":"https://www.youtube.com/playlist?list=PLtest"},"” của kênh ",{"text":"MJ Aquascaping","href":"https://www.youtube.com/@MJAquascaping"}],"blocks":[{"t":"p","c":["Từng loại rêu hại: vì sao mọc và cách hạn chế."]},{"t":"cards","title":"Video","items":[{"path":"/vi/huong-dan/reu-toc/","name":"Rêu tóc","sub":"Chăm cây · 12:40","img":{"src":"https://i.ytimg.com/vi/fixtureV001/hqdefault.jpg","w":1280,"h":720,"credit":{"text":"Ảnh: Tác giả 8","licence":"YouTube","url":"https://www.youtube.com/watch?v=fixtureV001"}}},{"path":"/vi/huong-dan/cach-han-che-reu-hai/","name":"Cách hạn chế rêu hại","sub":"Chăm cây · 29:15","img":{"src":"https://i.ytimg.com/vi/abc123XYZ_-/hqdefault.jpg","w":1280,"h":720,"credit":{"text":"Ảnh: MJ Aquascaping","licence":"YouTube","url":"https://www.youtube.com/watch?v=abc123XYZ_-"}}},{"path":"/vi/huong-dan/reu-nau/","name":"Rêu nâu","sub":"Chăm cây · 9:05","img":{"src":"https://i.ytimg.com/vi/fixtureV002/hqdefault.jpg","w":1280,"h":720,"credit":{"text":"Ảnh: Tác giả 8","licence":"YouTube","url":"https://www.youtube.com/watch?v=fixtureV002"}}},{"path":"/vi/huong-dan/reu-xanh-lam/","name":"Rêu xanh lam","sub":"Chăm cây · 15:20","img":{"src":"https://i.ytimg.com/vi/fixtureV003/hqdefault.jpg","w":1280,"h":720,"credit":{"text":"Ảnh: Tác giả 8","licence":"YouTube","url":"https://www.youtube.com/watch?v=fixtureV003"}}}]}]},
  "/vi/huong-dan/nuoi-ca-neon/":{"v":1,"kind":"guide","path":"/vi/huong-dan/nuoi-ca-neon/","title":"Nuôi cá neon trong bể nhỏ",
   "meta":"Chăm sóc · đọc khoảng 4 phút","credit":["AquaTome tổng hợp từ ",{"text":"2 nguồn","href":"#nguon"}," rồi tự viết"],
   "lead":{"src":"https://media.aquatome.com/a/neon-lead.webp","w":1200,"h":800,"credit":{"text":"Ảnh: Aquarium Co-op","licence":"CC BY 4.0"}},
   "blocks":[
    {"t":"summary","title":"Tóm tắt nhanh","items":["Nuôi từ 6 con trở lên.","Nước mềm, hơi chua."]},
    {"t":"h","text":"Bể và nước","id":"be-va-nuoc"},
    {"t":"p","c":["Cá ",{"text":"neon","href":"/vi/ca/ca-neon/"}," sống theo đàn và cần nước có ",{"text":"pH","href":"/vi/thuat-ngu/dem-ph/","tip":{"term":"Đệm pH","text":"Khả năng giữ pH của nước khi có thêm axit."}}," từ 5 đến 7."]},
    {"t":"list","ordered":true,"items":[[{"t":"p","c":["Bể từ ",{"text":"60 cm","b":true},"."]}],[{"t":"p","c":["Cây thủy sinh và lũa."]}]]},
    {"t":"table","head":[["Thông số"],["Mức"]],"rows":[[["Nhiệt độ"],["20–26°C"]],[["pH"],["5–7"]]]},
    {"t":"table","head":[["Ưu điểm"],["Nhược điểm"]],"rows":[[["• Rẻ, đặt vừa trên bàn làm việc\n• Ít nước, thay nước nhanh"],["• Nước nóng lên và bẩn đi nhanh hơn bể lớn\n• Ít chỗ cho cá bơi theo đàn"]]]},
    {"t":"carousel","items":[{"src":"https://example.org/1.webp"}]},
    {"t":"quiz","q":"Cá neon sống ở đâu?"},
    {"t":"h","text":"Cho ăn","id":"cho-an"},
    {"t":"p","c":["Ngày hai lần, lượng ăn hết trong hai phút."]},
    {"t":"p","c":["Thức ăn viên nhỏ, thêm trùn chỉ hoặc artemia vài lần một tuần."]},
    {"t":"p","c":["Cá ăn ít hơn khi nước lạnh; giữ nhiệt độ ổn định."]},
    {"t":"h","text":"Bệnh thường gặp","id":"benh"},
    {"t":"p","c":["Bệnh neon (Pleistophora) không chữa được: tách con bệnh ra ngay."]},
    {"t":"p","c":["Đốm trắng: tăng nhiệt độ từ từ và thay nước."]},
    {"t":"p","c":["Nấm: cách ly và giữ nước sạch."]},
    {"t":"faq","title":"Câu hỏi thường gặp","items":[{"q":"Nuôi mấy con?","a":"Từ 6 con trở lên."}]},
    {"t":"refs","title":"Nguồn tham khảo","id":"nguon","items":[{"title":"Neon tetra care","url":"https://example.org/neon"},{"title":"Cá neon","url":"https://example.org/ca-neon"}]},
    {"t":"pages","title":"Loài và cây trong bài","paths":["/vi/ca/ca-neon/","/vi/ca/khong-co/","/vi/cong-cu/be-cua-toi/","/vi/cong-cu/the-tich-be/"]}
   ]},
  "/vi/ca/ca-neon/":{"v":1,"kind":"fish","path":"/vi/ca/ca-neon/","title":"Cá neon","sub":"Paracheirodon innesi","where":["Characidae, ",{"text":"Peru","href":"/vi/nguon-goc/south-america/peru/"}],"aka":"Tên khác: Neon tetra","credit":["Dịch và tổng hợp từ Seriously Fish. Cập nhật 2026-10-28."],"lead":{"src":"https://media.aquatome.com/a/neon.webp","w":1200,"h":800,"alt":"Cá neon, Paracheirodon innesi","credit":{"text":"Ảnh: John Roe trên Unsplash","licence":"Unsplash License","url":"https://example.org/photo/neon","author":"John Roe"}},"talk":{"comments":"species:paracheirodon-innesi","photos":"species:paracheirodon-innesi"},"blocks":[{"t":"trust","title":"Nguồn và độ tin cậy","legend":"Các nguồn ghi khác nhau","rows":[{"field":"tempC","label":"Nhiệt độ","conflict":true,"note":"Mức mọi nguồn cùng khuyên","items":["Seriously Fish: 20–26°C","Aquarium Glaser: 22–28°C"]},{"field":"ph","label":"pH","items":["Seriously Fish"]},{"field":"lifeYears","label":"Tuổi thọ","items":["Seriously Fish"]},{"field":"tankCm","label":"Bể tối thiểu","conflict":true,"marked":true,"note":"Mỗi nguồn ghi một mức","items":["Seriously Fish: 60 cm","Aquarium Glaser: 45 cm"]}]},{"t":"mates","title":"Nuôi chung","good":{"title":"Hợp với","items":[{"path":"/vi/ca/ca-ngua-van/","name":"Cá ngựa vằn","img":{"src":"https://media.aquatome.com/a/danio-480.webp","w":960,"h":640,"credit":{"text":"Ảnh: Jane Doe trên Unsplash","licence":"Unsplash License","url":"https://example.org/photo/danio","author":"Jane Doe","authorUrl":"https://unsplash.com/@jane_doe_fixture?utm_source=aquatome&utm_medium=referral"}}}]},"avoid":{"title":"Tránh","items":[{"path":"/vi/ca/ca-dia/","name":"Cá đĩa","why":"Lớn tới 15 cm, có thể ăn Cá neon"}]},"note":"Gợi ý theo nhiệt độ, pH, kích thước và tính cách của từng loài.","tool":{"text":"Kiểm tra nuôi chung với loài khác →","href":"/vi/cong-cu/nuoi-chung/?ca=ca-neon:6"}},{"t":"climate","title":"Nuôi ở Việt Nam","items":[{"label":"Mùa đông miền Bắc","ok":false,"text":"Cần sưởi: nước bể không sưởi xuống khoảng 16°C, dưới mức tối thiểu 20°C."},{"label":"Miền Nam","ok":true,"text":"Hợp nhiệt độ quanh năm, thường không cần sưởi."}],"note":"Giả định nước bể trong nhà, không sưởi hay làm lạnh. Đo nhiệt độ bể của bạn để chắc chắn."},{"t":"gallery","title":"Ảnh Cá neon","note":"3 ảnh từ iNaturalist và Wikimedia Commons, giấy phép mở.","strip":[0,1],"href":"/vi/ca/ca-neon/anh/","photos":[{"src":"https://media.aquatome.com/g/n1.webp","w":1280,"h":960,"alt":"Đàn cá neon trong bể","thumb":"https://media.aquatome.com/g/n1-480.webp","credit":{"text":"Ảnh: Tác giả 1","licence":"CC BY 2.0","url":"https://example.org/photo/1"}},{"src":"https://media.aquatome.com/g/n2.webp","w":1280,"h":960,"alt":"Cá neon gần cây","thumb":"https://media.aquatome.com/g/n2-480.webp","credit":{"text":"Ảnh: Tác giả 2","licence":"CC BY-SA 4.0","url":"https://example.org/photo/2"}},{"src":"https://media.aquatome.com/g/n3.webp","w":800,"h":600,"alt":"Cá neon bơi","thumb":"https://media.aquatome.com/g/n3-480.webp","credit":{"text":"Ảnh: Tác giả 3","licence":"CC BY 4.0","url":"https://example.org/photo/3"}}]},{"t":"summary","title":"Tóm tắt nhanh","items":["Cá nhỏ, hiền, hợp bể cộng đồng từ 60 cm với nước mềm."],"text":"Cá nhỏ, hiền, hợp bể cộng đồng từ 60 cm với nước mềm.","mistakes":{"title":"Lỗi hay gặp","items":["Thả vài con: nên nuôi đàn từ 6 con trở lên."]},"by":"AquaTome tóm tắt từ các nguồn bên dưới."},{"t":"h","text":"Thông tin nhanh","id":"muc-quickFacts"},{"t":"p","c":["Cá neon là loài cá nhỏ sống theo đàn ở suối rừng Nam Mỹ."]},{"t":"list","items":[[{"t":"p","c":["Tên thường gọi: Cá neon, neon tetra"]}],[{"t":"p","c":["Nhiệt độ: 20–26°C"]}]]},{"t":"h","text":"Nước cần thế nào?","id":"muc-waterConditions"},{"t":"p","c":["Nước mềm, hơi chua.",{"text":"1","href":"https://example.org/neon","tip":{"term":"Seriously Fish","text":"example.org · dịch từ nguồn"}}]},{"t":"p","c":["Như các ",{"text":"cá tetra","href":"/vi/nhom/tetras/"}," khác, cá neon sống theo đàn."]},{"t":"p","c":["Cá neon thuộc họ ",{"text":"Characidae","href":"/vi/phan-loai/characiformes/characidae/"},", bộ ",{"text":"Characiformes","href":"/vi/phan-loai/characiformes/"},", sống ở các suối rừng ",{"text":"Nam Mỹ","href":"/vi/nguon-goc/south-america/"},"."]},{"t":"h","text":"Cho ăn gì?","id":"muc-diet"},{"t":"p","c":["Thức ăn viên nhỏ, thêm trùn chỉ vài lần một tuần."]},{"t":"h","text":"Sinh sản ra sao?","id":"muc-reproduction"},{"t":"p","c":["Khó cho đẻ trong bể nuôi chung: cần bể đẻ riêng, nước rất mềm."]},{"t":"refs","title":"Nguồn","id":"nguon","items":[{"title":"Seriously Fish","url":"https://example.org/neon"}],"note":"Các phần trên dịch từ những nguồn này. Mỗi đoạn ghi số nguồn của nó."},{"t":"cards","title":"Các dòng và cá lai từ Cá neon","items":[{"path":"/vi/ca/ca-neon-vang/","name":"Cá neon vàng","sub":"Dòng cá cảnh"}]},{"t":"pages","title":"Bài viết nhắc đến loài này","paths":["/vi/huong-dan/nuoi-ca-neon/"]},{"t":"videos","title":"Video","items":[{"youtubeId":"neonVid_001","title":"Đàn neon trong bể thủy sinh","durationSec":724,"lang":"EN"},{"youtubeId":"neonVid_002","title":"Cá neon ăn trùn chỉ","durationSec":95,"lang":"EN"},{"youtubeId":"noEmbed_001","title":"Cá neon đẻ trứng","durationSec":310,"lang":"EN"}]}]},
  "/vi/cay/rotala-do/":{"v":1,"kind":"plant","path":"/vi/cay/rotala-do/","title":"Rotala đỏ","sub":"Rotala rotundifolia","aka":"Tên khác: Rotala tròn lá","lead":{"src":"https://media.aquatome.com/a/rotala.webp","w":1200,"h":900,"alt":"Rotala đỏ, Rotala rotundifolia","credit":{"text":"Ảnh: Tropica","licence":"","url":"https://example.org/photo/rotala"}},"talk":{"comments":"plant:rotala-rotundifolia"},"blocks":[{"t":"h","text":"Thông tin nhanh","id":"muc-quickFacts"},{"t":"p","c":["Cây thân mọc nhanh, lên đỏ dưới đèn mạnh."]},{"t":"h","text":"Trồng và chăm","id":"muc-care"},{"t":"p","c":["Cần ánh sáng mạnh để lên màu đỏ."]},{"t":"refs","title":"Nguồn","id":"nguon","items":[{"title":"Tropica","url":"https://example.org/rotala"}]}]},
  "/vi/thuat-ngu/dem-ph/":{"v":1,"kind":"glossary","path":"/vi/thuat-ngu/dem-ph/","title":"Đệm pH","blocks":[{"t":"p","c":["Tiếng Anh: pH buffer"]},{"t":"p","c":["Khả năng giữ pH của nước khi có thêm axit."]}]}}}
  """#.utf8)

  /// UI tests (`-vi-at-root`): the fixture and its pages with the Vietnamese pages at the root, as the site has them
  /// once it takes "/vi" out of their addresses: every path and link that starts "/vi/" without it, but one. The video
  /// series' card for its guide stays under "/vi/", as in a page kept on the phone from before.
  static let fixtureAtRoot: HandbookIndex = {
    let e = JSONEncoder()
    e.outputFormatting = .withoutEscapingSlashes
    return try! JSONDecoder().decode(HandbookIndex.self, from: atRoot(e.encode(fixture)))
  }()
  static let fixturePagesAtRoot = Data(String(decoding: atRoot(fixturePages), as: UTF8.self)
    .replacingOccurrences(of: #"{"path":"/huong-dan/cach-han-che-reu-hai/""#, with: #"{"path":"/vi/huong-dan/cach-han-che-reu-hai/""#).utf8)
  /// UI tests (`-newer-part`): the fixture's pages, the neon's with a part from a newer site after its feeding.
  static let fixturePagesWithANewerPart = Data(String(decoding: fixturePages, as: UTF8.self)
    .replacingOccurrences(of: #"{"t":"p","c":["Thức ăn viên nhỏ, thêm trùn chỉ vài lần một tuần."]}"#,
                          with: #"{"t":"p","c":["Thức ăn viên nhỏ, thêm trùn chỉ vài lần một tuần."]},{"t":"quiz","q":"Cá neon ăn gì?"}"#).utf8)
  /// UI tests (`-lead-in-gallery`): the fixture's pages, the neon's top photo the first of its gallery's, as a live page's
  /// is: the photos under the top are one fewer than the gallery.
  static let fixturePagesLeadInGallery = Data(String(decoding: fixturePages, as: UTF8.self)
    .replacingOccurrences(of: #""lead":{"src":"https://media.aquatome.com/a/neon.webp""#, with: #""lead":{"src":"https://media.aquatome.com/g/n1.webp""#).utf8)
  /// UI tests (`-long-part`): the fixture's pages, the neon's feeding six paragraphs long and its breeding one long
  /// paragraph with a link: parts that fold. The breeding paragraph folds on the owner's 13 Pro Max too: at its wider column
  /// ten lines showed whole, under the fold's eleven (14 Nov).
  static let fixturePagesWithLongParts = Data(String(decoding: fixturePages, as: UTF8.self)
    .replacingOccurrences(of: #"{"t":"h","text":"Sinh sản ra sao?","id":"muc-reproduction"}"#,
                          with: #"{"t":"h","text":"Cần thiết bị gì?","id":"muc-equipment"},{"t":"p","c":["Bể nhỏ cho cá neon không cần nhiều thứ đắt tiền, nhưng mấy món cơ bản thì nên có ngay từ đầu để nước ổn định. Nước trong bể mới chưa có vi sinh, nên cần chạy lọc vài tuần rồi mới thả cá. Cá neon nhỏ và nhạy, nên dòng chảy phải êm, đèn đừng quá gắt, và nhiệt độ cần giữ đều suốt ngày đêm thì cá mới lên màu đẹp."]},{"t":"p","c":["Một bể neon nhỏ chỉ cần vài thứ, gồm:"]},{"t":"list","items":[[{"t":"p","c":["Lọc thác hoặc lọc bông, chảy êm, đủ cho thể tích bể."]}],[{"t":"p","c":["Sưởi có điều nhiệt nếu phòng xuống dưới 22°C vào mùa lạnh."]}],[{"t":"p","c":["Đèn vừa phải, bật chừng tám tiếng mỗi ngày là đủ."]}],[{"t":"p","c":["Nền cát mịn hoặc nền trồng cây, rửa sạch trước khi đổ vào."]}],[{"t":"p","c":["Vài bụi cây và một khúc lũa cho cá có chỗ núp."]}],[{"t":"p","c":["Bộ test pH và nitrit để biết bể đã chạy xong chưa."]}]]},{"t":"h","text":"Nuôi chung với con gì?","id":"muc-behaviour"},{"t":"p","c":["Hợp với các loài cá nhỏ hiền."]},{"t":"h","text":"Sinh sản ra sao?","id":"muc-reproduction"}"#)
    .replacingOccurrences(of: #"{"t":"p","c":["Thức ăn viên nhỏ, thêm trùn chỉ vài lần một tuần."]}"#,
                          with: #"{"t":"p","c":["Thức ăn viên nhỏ, thêm trùn chỉ vài lần một tuần."]}"# + #",{"t":"p","c":["Cá con mới mua về thường nhát ăn vài ngày đầu: cho ít, quan sát xem cá có lên ăn không rồi mới tăng dần lượng thức ăn."]},{"t":"p","c":["Thức ăn đông lạnh như trùn chỉ hay artemia nên rã đông trong một ít nước bể trước khi thả, để cá không ăn phải miếng còn cứng lạnh."]},{"t":"p","c":["Mỗi tuần nên có một ngày không cho ăn: hệ tiêu hóa của cá được nghỉ, nước bể cũng sạch hơn vì ít thức ăn thừa."]},{"t":"p","c":["Thức ăn thừa chìm xuống đáy sau vài phút cần hút bỏ, vì nó làm nước đục và tăng amoniac rất nhanh trong bể nhỏ."]},{"t":"p","c":["Đoạn cuối về cho ăn: khi đi vắng vài ngày, cá khỏe chịu nhịn được, không cần thả viên thức ăn tan chậm."]}"#)
    .replacingOccurrences(of: #"{"t":"p","c":["Khó cho đẻ trong bể nuôi chung: cần bể đẻ riêng, nước rất mềm."]}"#,
                          with: #"{"t":"p","c":["Muốn cho đẻ, nuôi riêng một cặp như ",{"text":"cá ngựa vằn","href":"/vi/ca/ca-ngua-van/"}," vẫn làm: bể đẻ nhỏ, nước rất mềm và hơi chua, ánh sáng yếu, đáy có lưới hoặc rêu để trứng rơi xuống mà cá bố mẹ không ăn được; sau khi đẻ thì vớt cá bố mẹ ra ngay, che tối bể vì trứng sợ sáng, giữ nhiệt độ ổn định, đến khi cá bột bơi được thì cho ăn infusoria rồi chuyển dần sang artemia mới nở, thay một ít nước mỗi ngày bằng nước cùng nhiệt độ và độ cứng, và kiên nhẫn vì tỉ lệ sống của cá bột neon trong bể nuôi ở nhà thường thấp. Cá bột rất nhỏ, nên vài ngày đầu chỉ để lọc bông thật nhẹ hoặc tắt lọc, kẻo cá bị hút vào; đợi cá lớn bằng hạt cát rồi mới chuyển sang bể to hơn, và đừng thả chung với cá trưởng thành cho tới khi cá đủ lớn để không bị ăn."]}"#).utf8)
  /// UI tests (`-long-guide`): the fixture's pages, the neon guide's parts each eight paragraphs long, past three screens,
  /// and its readers' comments: a guide long enough for the owner's navigator.
  static let fixturePagesWithALongGuide: Data = {
    var all = try! JSONSerialization.jsonObject(with: fixturePages) as! [String: Any]
    var pages = all["pages"] as! [String: Any]
    var guide = pages["/vi/huong-dan/nuoi-ca-neon/"] as! [String: Any]
    let more: [String: Any] = ["t": "p", "c": ["Một đoạn dài cho phần này: cá neon nhỏ và nhạy, nên mọi thay đổi trong bể cần làm từ từ, "
      + "theo dõi cá vài ngày rồi mới làm bước tiếp theo, và ghi lại những gì đã làm để biết điều gì giúp cá khỏe hơn."]]
    var blocks: [Any] = []
    for b in guide["blocks"] as! [[String: Any]] {
      blocks.append(b)
      if b["t"] as? String == "h" { blocks += Array(repeating: more, count: 8) }
    }
    guide["blocks"] = blocks
    guide["talk"] = ["comments": "guide:nuoi-ca-neon"]
    pages["/vi/huong-dan/nuoi-ca-neon/"] = guide
    all["pages"] = pages
    return try! JSONSerialization.data(withJSONObject: all)
  }()
  /// Performance tests (`-long-page`): the fixture's pages, the neon's with its text twelve times over, a long page.
  static let fixturePagesLong: Data = {
    var all = try! JSONSerialization.jsonObject(with: fixturePages) as! [String: Any]
    var pages = all["pages"] as! [String: Any]
    var neon = pages["/vi/ca/ca-neon/"] as! [String: Any]
    let blocks = neon["blocks"] as! [[String: Any]]
    let text = blocks.filter { ["h", "p", "list"].contains($0["t"] as? String) }
    neon["blocks"] = blocks + Array(Array(repeating: text, count: 12).joined())
    pages["/vi/ca/ca-neon/"] = neon
    all["pages"] = pages
    return try! JSONSerialization.data(withJSONObject: all)
  }()
  /// Only a string that starts with the path: not the "/vi/" in a YouTube picture's address.
  private static func atRoot(_ json: Data) -> Data {
    Data(String(decoding: json, as: UTF8.self).replacingOccurrences(of: #""/vi/"#, with: #""/"#).utf8)
  }

  /// UI tests' readers' content, by the address the app asks for it: the neon's comments (one a good answer) and two
  /// readers' photos, as the site's Worker answers. The plant asks too, and the site has none for it.
  static let fixtureReaders: [String: Data] = [
    "https://aquatome.com/_c?e=species:paracheirodon-innesi": Data(#"""
    {"comments":[{"id":"c1","name":"Lan","body":"Nuôi đàn 10 con, khỏe sau 2 năm.","helpful":true,"createdAt":"2026-10-30T18:30:00.000Z","author":"a1a1a1a1a1a1a1a1"},
                 {"id":"c2","name":"Minh","body":"Nước mềm thì màu đẹp hơn.","helpful":false,"createdAt":"2026-11-01T02:00:00.000Z","author":"b2b2b2b2b2b2b2b2"}],
     "sitekey":"k","verification":"none"}
    """#.utf8),
    "https://aquatome.com/_p?e=species:paracheirodon-innesi": Data(#"""
    {"photos":[{"id":"p1","name":"Lan","url":"https://media.aquatome.com/r/p1.webp","thumb":"https://media.aquatome.com/r/p1-t.webp","width":1600,"height":1200,"createdAt":"2026-10-30T18:30:00.000Z","author":"a1a1a1a1a1a1a1a1"},
               {"id":"p2","name":"Minh","url":"https://media.aquatome.com/r/p2.webp","thumb":"https://media.aquatome.com/r/p2-t.webp","width":1200,"height":1200,"createdAt":"2026-10-29T08:00:00.000Z","author":"b2b2b2b2b2b2b2b2"}],
     "sitekey":"k","verification":"none"}
    """#.utf8),
    "https://aquatome.com/_c?e=plant:rotala-rotundifolia": Data(#"{"comments":[],"sitekey":"k","verification":"none"}"#.utf8),
    // The long neon guide's (`-long-guide`).
    "https://aquatome.com/_c?e=guide:nuoi-ca-neon": Data(#"""
    {"comments":[{"id":"g1","name":"Lan","body":"Bể 40 lít nuôi 8 con vẫn ổn.","helpful":false,"createdAt":"2026-11-02T08:00:00.000Z","author":"a1a1a1a1a1a1a1a1"},
                 {"id":"g2","name":"Minh","body":"Thay nước mỗi tuần, cá lên màu đẹp.","helpful":false,"createdAt":"2026-11-03T08:00:00.000Z","author":"b2b2b2b2b2b2b2b2"},
                 {"id":"g3","name":"Hà","body":"Cho ăn ít thôi là đúng.","helpful":false,"createdAt":"2026-11-04T08:00:00.000Z","author":"c3c3c3c3c3c3c3c3"}],
     "sitekey":"k","verification":"none"}
    """#.utf8),
  ]

  /// Performance tests' index: the fixture plus 800 fish (the site lists about 700), named and shaped like real ones,
  /// with no pictures (those come from the network).
  static let large = HandbookIndex(lang: "vi", items: fixture.items + (1...800).map { n in
    .init(kind: .fish, contentId: "loai-\(n)", name: "Cá thử \(n)", sub: "Genus species\(n)", aka: ["Fish \(n)"], path: "/vi/ca/ca-thu-\(n)/",
          tax: largeTaxa[n % largeTaxa.count] + ["Genus\(n % 300)"], from: [n % 2 == 0 ? "asia" : "south-america", "country-\(n % 90)"])
  }, home: fixture.home, labels: fixture.labels, places: fixture.places)
  /// Orders and families as the site's are (its longest names among them), for the large index's fish.
  private static let largeTaxa = [["Cypriniformes", "Cyprinidae"], ["Characiformes", "Characidae"], ["Siluriformes", "Loricariidae"],
                                  ["Cyprinodontiformes", "Nothobranchiidae"], ["Anabantiformes", "Osphronemidae"], ["Perciformes", "Cichlidae"]]
}
#endif

#if DEBUG
extension HandbookIndex {
  /// The same index with a fish the site has just added, first on Khám phá's fish shelf (`-index-changes-after`).
  func withAFishJustAdded() -> HandbookIndex {
    let fish = Item(kind: .fish, contentId: "moi-den", name: "Cá mới đến", sub: "Genus novus", path: "/vi/ca/ca-moi-den/", group: "tetras")
    let browse = Home.Browse(fish: [fish.path] + (home?.browse?.fish ?? home?.fish ?? []), plants: home?.browse?.plants ?? home?.plants ?? [],
                             guides: home?.browse?.guides ?? home?.guides ?? [])
    var home = home
    home?.browse = browse
    return HandbookIndex(lang: lang, items: items + [fish], home: home, labels: labels, pages: pages, places: places, telemetry: telemetry, latest: latest)
  }
}
#endif
