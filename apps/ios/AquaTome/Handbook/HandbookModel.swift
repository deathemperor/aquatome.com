import Foundation
import Handbook
import Observation
import Tanks

/// The handbook tab: the site's index for this language (kept on the phone for offline use), searched natively.
@Observable
@MainActor
final class HandbookModel {
  enum Status: Equatable { case loading, ready, offline, failed }

  /// The site's language for this app's language: Vietnamese unless the app runs in Indonesian or Thai.
  let lang: String
  let site = URL(string: "https://aquatome.com")!
  private(set) var status = Status.loading
  private(set) var count = 0
  var query = "" { didSet { if query != oldValue { refresh() } } }
  var kind: HandbookIndex.Kind? { didSet { if kind != oldValue { refresh() } } }
  /// What the list shows for the query and kind: worked out when they or the index change, not on every redraw.
  private(set) var results: [HandbookIndex.Item] = []

  private var search = HandbookSearch([])
  /// Fish and plant pages by their content id: what a tank's `species[].id` and `plants[].id` hold.
  private var pages: [String: HandbookIndex.Item] = [:]
  /// The page a tank's entry without a page is shown as, by its scientific name.
  private var matcher = PageMatcher([])
  /// Every page by its path: what the reading list keeps.
  private var byPath: [String: HandbookIndex.Item] = [:]
  /// The index arranged to browse: groups, placements, subjects, the home's picks.
  private(set) var shelves = HandbookShelves(HandbookIndex(lang: "vi", items: []))
  /// The site's words for the keys items carry, in this language.
  private(set) var labels = HandbookIndex.Labels()
  /// How many shards of pages each kind has: the kinds the app draws itself (PageDoc).
  private var shardCounts: [String: Int] = [:]
  /// Pages saved to read later, and the ones read last (kept in the app's settings, on this phone, one list per
  /// language: the pages are this language's).
  private(set) var reading: ReadingList
  /// The pages kept for reading offline, each whole on the phone (KeepPages), newest first: on this phone, one list per
  /// language.
  private(set) var kept: [String]
  /// Keeps on their way, by shelf (KeepOffline's key): how many pictures are in, of how many. Here, not on the shelf's
  /// screen, so a shelf left and opened again still shows its keep and can stop it.
  private(set) var keeping: [String: (done: Int, of: Int)] = [:]
  private var runs: [String: Task<Void, Never>] = [:]
  /// A keep that ended with some pages not kept (kept, of how many), for its shelf to say once.
  private var short: [String: (Int, Int)] = [:]
  /// Each kind's shard count when its pages were kept: with another, the kept shards are other files.
  private var keptCounts: [String: Int]
  private let source: Source
  /// The pages the app draws itself, kept on the phone.
  private let drawn: PageCache
  /// The site's copy has been read this run: showing the tab again doesn't fetch it again (pull to refresh does).
  private var fetched = false
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
    lang = preferred.first.flatMap { ["vi", "id", "th"].contains($0) ? $0 : nil } ?? "vi"
    reading = UserDefaults.standard.data(forKey: "handbook.reading.\(lang)").flatMap { try? JSONDecoder().decode(ReadingList.self, from: $0) } ?? ReadingList()
    kept = UserDefaults.standard.stringArray(forKey: "handbook.kept.\(lang)") ?? []
    keptCounts = UserDefaults.standard.dictionary(forKey: "handbook.kept.counts.\(lang)") as? [String: Int] ?? [:]
    drawn = Self.pageCache(source, site: site)
  }

  /// Whether the app draws this page itself: the site publishes its kind as blocks.
  func drawsItself(_ item: HandbookIndex.Item) -> Bool { shardCounts[item.kind.rawValue] != nil }

  /// The page as blocks, from the phone or the site; nil when the web page is to show instead.
  func doc(_ item: HandbookIndex.Item) async -> PageDoc? {
    guard let count = shardCounts[item.kind.rawValue] else { return nil }
    return await drawn.doc(path: item.path, kind: item.kind.rawValue, lang: lang, count: count)
  }

  /// A page's readers' comments and photos, from the site (Readers): none when it has none or the site doesn't answer.
  func readers(_ talk: PageDoc.Talk) async -> ([Readers.Comment], [Readers.Photo]) {
    async let comments = Self.readers(talk.comments.map { Readers.url(comments: $0, site: site) }, source)
    async let photos = Self.readers(talk.photos.map { Readers.url(photos: $0, site: site) }, source)
    return (await comments.map(Readers.comments) ?? [], await photos.map(Readers.photos) ?? [])
  }

  private nonisolated static func readers(_ url: URL?, _ source: Source) async -> Data? {
    guard let url else { return nil }
    #if DEBUG
    // UI tests read no network: the fixed answers.
    if case .fixed = source { return HandbookIndex.fixtureReaders[url.absoluteString] }
    #endif
    guard let (data, response) = try? await URLSession.shared.data(from: url), (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    return data
  }

  /// The page at a path the index lists ("/vi/ca/ca-neon/").
  func item(at path: String) -> HandbookIndex.Item? { byPath[path] }

  /// Keeps these pages for reading offline: the shards they're in, read from the site now, then every picture in them,
  /// telling how many pictures are kept so far. Returns how many of the pages are on the phone.
  /// A stop (the task cancelled) ends it; a page counts as kept only once it's whole on the phone (KeepPages).
  func keep(_ items: [HandbookIndex.Item], progress: (_ done: Int, _ of: Int) -> Void) async -> Int {
    await KeepPages.run(items.map(\.path), docs: { _ in
      var docs: [PageDoc] = []
      for (kind, list) in Dictionary(grouping: items, by: \.kind) {
        guard let count = shardCounts[kind.rawValue] else { continue }
        docs += await drawn.keep(list.map(\.path), kind: kind.rawValue, lang: lang, count: count)
      }
      return docs
    }, picture: { await PageImages.keep($0) }, kept: { path in
      kept.removeAll { $0 == path }
      kept.insert(path, at: 0)
      if let kind = byPath[path]?.kind.rawValue { keptCounts[kind] = shardCounts[kind] }
      saveKept()
    }, progress: progress)
  }

  /// Starts keeping a shelf's pages (`shelf`: its key), unless that shelf's keep is on its way.
  func startKeeping(_ items: [HandbookIndex.Item], shelf: String) {
    guard runs[shelf] == nil else { return }
    keeping[shelf] = (0, 0)
    runs[shelf] = Task {
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

  private func saveKept() {
    UserDefaults.standard.set(kept, forKey: "handbook.kept.\(lang)")
    UserDefaults.standard.set(keptCounts, forKey: "handbook.kept.counts.\(lang)")
  }

  func isKept(_ item: HandbookIndex.Item) -> Bool { kept.contains(item.path) }

  /// The pages kept for offline that the index has now.
  var keptItems: [HandbookIndex.Item] { ReadingList.items(kept, in: byPath, kind: nil) }

  /// Pages no longer kept for offline: off the list, then their pictures and the shards no kept page is in deleted from
  /// the phone (not what a page still kept needs).
  /// A keep on its way is stopped first, and waited for: it would put back a shard or picture this deletes.
  func unkeep(_ items: [HandbookIndex.Item]) async {
    let running = Array(runs.values)
    for shelf in Array(runs.keys) { stopKeeping(shelf) }
    let gone = Set(items.map(\.path))
    kept.removeAll { gone.contains($0) }
    saveKept()
    for t in running { await t.value }
    for (kind, list) in Dictionary(grouping: items, by: \.kind) {
      guard let count = shardCounts[kind.rawValue] else { continue }
      await forget(list.map(\.path), kind: kind.rawValue, count: count)
    }
  }

  private func forget(_ paths: [String], kind: String, count: Int) async {
    let staying = kept.filter { byPath[$0]?.kind.rawValue == kind }
    for src in await drawn.forget(paths, keeping: staying, kind: kind, lang: lang, count: count) { PageImages.forget(src) }
  }

  /// The site split a kind's pages anew: the kept shards are another count's files, so that kind's kept pages are no
  /// longer on the phone as the app reads them. They come off the list (kept again from their shelf), and the old files go.
  private func dropKeptOfOtherCounts() {
    for (kind, old) in keptCounts where shardCounts[kind] != old {
      let paths = kept.filter { byPath[$0]?.kind.rawValue == kind }
      kept.removeAll { paths.contains($0) }
      keptCounts[kind] = nil
      saveKept()
      Task { await forget(paths, kind: kind, count: old) }
    }
  }

  func url(_ item: HandbookIndex.Item) -> URL { URL(string: item.path, relativeTo: site)!.absoluteURL }

  /// The page of a fish or plant on a tank, once the index is here.
  func page(_ contentId: String) -> HandbookIndex.Item? { pages[contentId] }

  /// The page a tank's entry without a page is shown as, once the index has one with its scientific name (PageMatcher).
  func page(for e: UnlistedEntry) -> HandbookIndex.Item? { matcher.page(kind: e.kind, sci: e.sci).flatMap { pages[$0] } }

  /// The saved pages and the ones read last, of `kind` (all kinds for nil), as the index has them now.
  func saved(_ kind: HandbookIndex.Kind?) -> [HandbookIndex.Item] { ReadingList.items(reading.saved, in: byPath, kind: kind) }
  func recent(_ kind: HandbookIndex.Kind?, limit: Int = 5) -> [HandbookIndex.Item] { ReadingList.items(reading.recent, in: byPath, kind: kind, limit: limit) }

  /// Guides that name these fish and plants (a tank's), the most of them first, then in name order: the written ones,
  /// and the ones made from videos apart, as a species page on the site lists them.
  func guides(about ids: [String]) -> (written: [HandbookIndex.Item], videos: [HandbookIndex.Item]) {
    let all = search.find("", kind: .guide)
    return (HandbookIndex.guides(about: ids, in: all.filter { $0.video == nil }), HandbookIndex.guides(about: ids, in: all.filter { $0.video != nil }))
  }

  func read(_ item: HandbookIndex.Item) {
    change { $0.read(item.path) }
    #if DEBUG
    // UI tests (`-pages-later`): the index says which kinds the app draws only once a page has opened.
    if let ix = pagesLater {
      pagesLater = nil
      Task { try? await Task.sleep(for: .seconds(1)); use(ix, .ready) }
    }
    #endif
  }
  func toggleSaved(_ item: HandbookIndex.Item) { change { $0.toggleSaved(item.path) } }

  private func change(_ edit: (inout ReadingList) -> Void) {
    edit(&reading)
    UserDefaults.standard.set(try? JSONEncoder().encode(reading), forKey: "handbook.reading.\(lang)")
  }

  /// The fish and plants a tank can list, for `query` (all of them for none).
  func life(_ query: String) -> [HandbookIndex.Item] {
    search.find(query, limit: .max).filter { ($0.kind == .fish || $0.kind == .plant) && $0.contentId != nil }
  }

  /// When the tab shows: the index, unless this run already has the site's copy.
  func appear() async {
    if !fetched { await load() }
  }

  /// The kept copy first (instant, offline) if nothing is shown yet, then the site's current one.
  func load() async {
    if case .fixed(let ix) = source {
      #if DEBUG
      if ProcessInfo.processInfo.arguments.contains("-pages-later"), pagesLater == nil, count == 0 {
        pagesLater = ix
        return use(HandbookIndex(lang: ix.lang, items: ix.items, home: ix.home, labels: ix.labels), .ready)
      }
      #endif
      return use(ix, .ready)
    }
    let file = Self.cacheFile(lang)
    if count == 0, let data = try? Data(contentsOf: file), let ix = try? JSONDecoder().decode(HandbookIndex.self, from: data) {
      use(ix, .offline)
    }
    do {
      let (data, response) = try await URLSession.shared.data(from: site.appendingPathComponent("app/\(lang).json"))
      guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
      let ix = try JSONDecoder().decode(HandbookIndex.self, from: data)
      try? data.write(to: file, options: .atomic)
      use(ix, .ready)
      fetched = true
    } catch {
      // Left for another tab or page: tried again when the tab shows next, nothing to report.
      if isInterruption(error) { return }
      if count == 0 { status = .failed }
    }
  }

  private func use(_ ix: HandbookIndex, _ s: Status) {
    search = HandbookSearch(ix.items)
    pages = Dictionary(ix.items.compactMap { i in i.contentId.map { ($0, i) } }, uniquingKeysWith: { a, _ in a })
    matcher = PageMatcher(index: ix.items)
    byPath = Dictionary(ix.items.map { ($0.path, $0) }, uniquingKeysWith: { a, _ in a })
    shardCounts = ix.pages
    dropKeptOfOtherCounts()
    shelves = HandbookShelves(ix)
    labels = ix.labels
    count = ix.items.count
    status = s
    refresh()
  }

  private func refresh() { results = search.find(query, kind: kind) }

  /// The site, except in UI tests (`-fixed-handbook`), which use a small fixed index: no network, same answers each run.
  /// Performance tests use `-large-handbook`: as many fish as the site has, still without the network.
  static func defaultSource() -> Source {
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    if args.contains("-large-handbook") { return .fixed(.large) }
    if args.contains("-fixed-handbook") {
      // `-pages-count N`: the site has split its guides into N shards since the last launch.
      if let i = args.firstIndex(of: "-pages-count"), i + 1 < args.count, let n = Int(args[i + 1]) {
        let f = HandbookIndex.fixture
        return .fixed(HandbookIndex(lang: f.lang, items: f.items, home: f.home, labels: f.labels, pages: ["guide": n]))
      }
      return .fixed(.fixture)
    }
    #endif
    return .site
  }

  /// Kept in Application Support, as the index is; UI tests get the fixed pages, without the network.
  private static func pageCache(_ source: Source, site: URL) -> PageCache {
    #if DEBUG
    if case .fixed = source {
      let dir = FileManager.default.temporaryDirectory.appending(path: "pages-\(UUID().uuidString)")
      return PageCache(dir: dir, site: site, fetch: { _ in HandbookIndex.fixturePages })
    }
    #endif
    var dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "pages")
    // The site's copy, read again when needed: not for the phone's backup.
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? dir.setResourceValues(values)
    return PageCache(dir: dir, site: site, fetch: { url in
      let (data, response) = try await URLSession.shared.data(from: url)
      guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
      return data
    })
  }

  private static func cacheFile(_ lang: String) -> URL {
    let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("handbook", isDirectory: true)
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent("\(lang).json")
  }
}

#if DEBUG
extension HandbookIndex {
  /// UI tests' index: a few pages of each kind, as the site writes them.
  static let fixture = HandbookIndex(lang: "vi", items: [
    .init(kind: .fish, contentId: "symphysodon-aequifasciatus", name: "Cá đĩa", sub: "Symphysodon aequifasciatus", aka: ["Discus"], path: "/vi/ca/ca-dia/",
          facts: .init(tempC: .init(min: 28, max: 31), ph: .init(min: 4.5, max: 6.5), sizeCm: 15, tankCm: 120, difficulty: 7), group: "cichlids"),
    .init(kind: .fish, contentId: "paracheirodon-innesi", name: "Cá neon", sub: "Paracheirodon innesi", aka: ["Neon tetra"], path: "/vi/ca/ca-neon/",
          facts: .init(tempC: .init(min: 20, max: 26), ph: .init(min: 5, max: 7), gh: .init(min: 1, max: 2), sizeCm: 4, tankCm: 60, temperament: "peaceful",
                         schoolMin: 6, difficulty: 2),
          group: "tetras"),
    .init(kind: .fish, contentId: "danio-rerio", name: "Cá ngựa vằn", sub: "Danio rerio", path: "/vi/ca/ca-ngua-van/", group: "danios"),
    .init(kind: .plant, contentId: "rotala-rotundifolia", name: "Rotala đỏ", sub: "Rotala rotundifolia", path: "/vi/cay/rotala-do/",
          facts: .init(tempC: .init(min: 20, max: 28)), plant: .init(difficulty: 2, light: "high", co2: "optional", growth: "fast", placement: ["background"])),
    .init(kind: .guide, name: "Nuôi cá neon trong bể nhỏ", path: "/vi/huong-dan/nuoi-ca-neon/", section: "care", about: ["paracheirodon-innesi"]),
    .init(kind: .guide, name: "Cách hạn chế rêu hại", path: "/vi/huong-dan/cach-han-che-reu-hai/", section: "plantCare", about: ["paracheirodon-innesi"],
          video: 1755),
    .init(kind: .video, name: "Rêu hại từ A đến Z", sub: "MJ Aquascaping", path: "/vi/video/reu-hai-tu-a-den-z/", parts: 1),
    .init(kind: .glossary, name: "Đệm pH", path: "/vi/thuat-ngu/dem-ph/"),
    .init(kind: .tool, name: "Đèn Chihiros", path: "/vi/cong-cu/den-chihiros/"),
    .init(kind: .tool, name: "Bể của tôi", path: "/vi/cong-cu/be-cua-toi/", words: ["Bể của tôi: sổ ghi bể cá, cây và lịch đèn"]),
    .init(kind: .tool, name: "Kiểm tra nuôi chung", path: "/vi/cong-cu/nuoi-chung/"),
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
  ]), pages: ["guide": 1, "fish": 1, "plant": 1, "glossary": 1])

  /// UI tests' pages: the neon guide as the site writes it (/app/pages/vi/guide-0.json), with each kind of block, links
  /// to the fixture's pages and a tool, a word's tip, and two parts in a row from a newer site the app can't draw.
  static let fixturePages = Data(#"""
  {"v":1,"pages":{"/vi/huong-dan/cach-han-che-reu-hai/":{"v":1,"kind":"guide","path":"/vi/huong-dan/cach-han-che-reu-hai/","title":"Cách hạn chế rêu hại","video":{"youtubeId":"abc123XYZ_-","title":"Hạn chế rêu hại","channel":"MJ Aquascaping","durationSec":1755},"blocks":[{"t":"p","c":["Ánh sáng vừa đủ, CO₂ đều, thay nước đúng lịch."]}]},
  "/vi/huong-dan/nuoi-ca-neon/":{"v":1,"kind":"guide","path":"/vi/huong-dan/nuoi-ca-neon/","title":"Nuôi cá neon trong bể nhỏ",
   "meta":"Chăm sóc · đọc khoảng 4 phút","credit":["AquaTome tổng hợp từ ",{"text":"2 nguồn","href":"#nguon"}," rồi tự viết"],
   "lead":{"src":"https://media.aquatome.com/a/neon-lead.webp","w":1200,"h":800,"credit":{"text":"Ảnh: Aquarium Co-op","licence":"CC BY 4.0"}},
   "blocks":[
    {"t":"summary","title":"Tóm tắt nhanh","items":["Nuôi từ 6 con trở lên.","Nước mềm, hơi chua."]},
    {"t":"h","text":"Bể và nước","id":"be-va-nuoc"},
    {"t":"p","c":["Cá ",{"text":"neon","href":"/vi/ca/ca-neon/"}," sống theo đàn và cần nước có ",{"text":"pH","href":"/vi/thuat-ngu/dem-ph/","tip":{"term":"Đệm pH","text":"Khả năng giữ pH của nước khi có thêm axit."}}," từ 5 đến 7."]},
    {"t":"list","ordered":true,"items":[[{"t":"p","c":["Bể từ ",{"text":"60 cm","b":true},"."]}],[{"t":"p","c":["Cây thủy sinh và lũa."]}]]},
    {"t":"table","head":[["Thông số"],["Mức"]],"rows":[[["Nhiệt độ"],["20–26°C"]],[["pH"],["5–7"]]]},
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
    {"t":"pages","title":"Loài và cây trong bài","paths":["/vi/ca/ca-neon/","/vi/ca/khong-co/","/vi/cong-cu/be-cua-toi/"]}
   ]},
  "/vi/ca/ca-neon/":{"v":1,"kind":"fish","path":"/vi/ca/ca-neon/","title":"Cá neon","sub":"Paracheirodon innesi","where":["Characidae, ",{"text":"Peru","href":"/vi/nguon-goc/south-america/peru/"}],"aka":"Tên khác: Neon tetra","credit":["Dịch và tổng hợp từ Seriously Fish. Cập nhật 2026-10-28."],"lead":{"src":"https://media.aquatome.com/a/neon.webp","w":1200,"h":800,"alt":"Cá neon, Paracheirodon innesi","credit":{"text":"Ảnh: Holger Krisp","licence":"CC BY 3.0","url":"https://example.org/photo/neon"}},"talk":{"comments":"species:paracheirodon-innesi","photos":"species:paracheirodon-innesi"},"blocks":[{"t":"trust","title":"Nguồn và độ tin cậy","legend":"Các nguồn ghi khác nhau","rows":[{"field":"tempC","label":"Nhiệt độ","conflict":true,"note":"Mức mọi nguồn cùng khuyên","items":["Seriously Fish: 20–26°C","Aquarium Glaser: 22–28°C"]},{"field":"ph","label":"pH","items":["Seriously Fish"]}]},{"t":"mates","title":"Nuôi chung","good":{"title":"Hợp với","items":[{"path":"/vi/ca/ca-ngua-van/","name":"Cá ngựa vằn","img":{"src":"https://media.aquatome.com/a/danio-480.webp","w":960,"h":640,"credit":{"text":"Ảnh: Tác giả 5","licence":"CC BY 4.0","url":"https://example.org/photo/danio"}}}]},"avoid":{"title":"Tránh","items":[{"path":"/vi/ca/ca-dia/","name":"Cá đĩa","why":"Lớn tới 15 cm, có thể ăn Cá neon"}]},"note":"Gợi ý theo nhiệt độ, pH, kích thước và tính cách của từng loài.","tool":{"text":"Kiểm tra nuôi chung với loài khác →","href":"/vi/cong-cu/nuoi-chung/?ca=ca-neon:6"}},{"t":"climate","title":"Nuôi ở Việt Nam","items":[{"label":"Mùa đông miền Bắc","ok":false,"text":"Cần sưởi: nước bể không sưởi xuống khoảng 16°C, dưới mức tối thiểu 20°C."},{"label":"Miền Nam","ok":true,"text":"Hợp nhiệt độ quanh năm, thường không cần sưởi."}],"note":"Giả định nước bể trong nhà, không sưởi hay làm lạnh. Đo nhiệt độ bể của bạn để chắc chắn."},{"t":"gallery","title":"Ảnh Cá neon","note":"3 ảnh từ iNaturalist và Wikimedia Commons, giấy phép mở.","strip":[0,1],"href":"/vi/ca/ca-neon/anh/","photos":[{"src":"https://media.aquatome.com/g/n1.webp","w":1280,"h":960,"alt":"Đàn cá neon trong bể","thumb":"https://media.aquatome.com/g/n1-480.webp","credit":{"text":"Ảnh: Tác giả 1","licence":"CC BY 2.0","url":"https://example.org/photo/1"}},{"src":"https://media.aquatome.com/g/n2.webp","w":1280,"h":960,"alt":"Cá neon gần cây","thumb":"https://media.aquatome.com/g/n2-480.webp","credit":{"text":"Ảnh: Tác giả 2","licence":"CC BY-SA 4.0","url":"https://example.org/photo/2"}},{"src":"https://media.aquatome.com/g/n3.webp","w":800,"h":600,"alt":"Cá neon bơi","thumb":"https://media.aquatome.com/g/n3-480.webp","credit":{"text":"Ảnh: Tác giả 3","licence":"CC BY 4.0","url":"https://example.org/photo/3"}}]},{"t":"summary","title":"Tóm tắt nhanh","items":["Cá nhỏ, hiền, hợp bể cộng đồng từ 60 cm với nước mềm."],"text":"Cá nhỏ, hiền, hợp bể cộng đồng từ 60 cm với nước mềm.","mistakes":{"title":"Lỗi hay gặp","items":["Thả vài con: nên nuôi đàn từ 6 con trở lên."]},"by":"AquaTome tóm tắt từ các nguồn bên dưới."},{"t":"h","text":"Nước cần thế nào?","id":"muc-waterConditions"},{"t":"p","c":["Nước mềm, hơi chua.",{"text":"1","href":"https://example.org/neon","tip":{"term":"Seriously Fish","text":"example.org · dịch với sự cho phép của nguồn"}}]},{"t":"refs","title":"Nguồn","id":"nguon","items":[{"title":"Seriously Fish","url":"https://example.org/neon"}],"note":"Các phần trên dịch từ những nguồn này, với sự cho phép của họ. Mỗi đoạn ghi số nguồn của nó."},{"t":"cards","title":"Các dòng và cá lai từ Cá neon","items":[{"path":"/vi/ca/ca-neon-vang/","name":"Cá neon vàng","sub":"Dòng cá cảnh"}]},{"t":"pages","title":"Bài viết nhắc đến loài này","paths":["/vi/huong-dan/nuoi-ca-neon/"]},{"t":"videos","title":"Video","items":[{"youtubeId":"neonVid_01","title":"Đàn neon trong bể thủy sinh","durationSec":724,"lang":"EN"}]}]},
  "/vi/cay/rotala-do/":{"v":1,"kind":"plant","path":"/vi/cay/rotala-do/","title":"Rotala đỏ","sub":"Rotala rotundifolia","lead":{"src":"https://media.aquatome.com/a/rotala.webp","w":1200,"h":900,"alt":"Rotala đỏ, Rotala rotundifolia","credit":{"text":"Ảnh: Tropica","licence":"dùng với sự cho phép","url":"https://example.org/photo/rotala"}},"talk":{"comments":"plant:rotala-rotundifolia"},"blocks":[{"t":"h","text":"Trồng và chăm","id":"muc-care"},{"t":"p","c":["Cần ánh sáng mạnh để lên màu đỏ."]},{"t":"refs","title":"Nguồn","id":"nguon","items":[{"title":"Tropica","url":"https://example.org/rotala"}]}]},
  "/vi/thuat-ngu/dem-ph/":{"v":1,"kind":"glossary","path":"/vi/thuat-ngu/dem-ph/","title":"Đệm pH","blocks":[{"t":"p","c":["Tiếng Anh: pH buffer"]},{"t":"p","c":["Khả năng giữ pH của nước khi có thêm axit."]}]}}}
  """#.utf8)

  /// UI tests' readers' content, by the address the app asks for it: the neon's comments (one a good answer) and two
  /// readers' photos, as the site's Worker answers. The plant asks too, and the site has none for it.
  static let fixtureReaders: [String: Data] = [
    "https://aquatome.com/_c?e=species:paracheirodon-innesi": Data(#"""
    {"comments":[{"id":"c1","name":"Lan","body":"Nuôi đàn 10 con, khỏe sau 2 năm.","helpful":true,"createdAt":"2026-10-30T18:30:00.000Z"},
                 {"id":"c2","name":"Minh","body":"Nước mềm thì màu đẹp hơn.","helpful":false,"createdAt":"2026-11-01T02:00:00.000Z"}],
     "sitekey":"k","verification":"none"}
    """#.utf8),
    "https://aquatome.com/_p?e=species:paracheirodon-innesi": Data(#"""
    {"photos":[{"id":"p1","name":"Lan","url":"https://media.aquatome.com/r/p1.webp","thumb":"https://media.aquatome.com/r/p1-t.webp","width":1600,"height":1200,"createdAt":"2026-10-30T18:30:00.000Z"},
               {"id":"p2","name":"Minh","url":"https://media.aquatome.com/r/p2.webp","thumb":"https://media.aquatome.com/r/p2-t.webp","width":1200,"height":1200,"createdAt":"2026-10-29T08:00:00.000Z"}],
     "sitekey":"k","verification":"none"}
    """#.utf8),
    "https://aquatome.com/_c?e=plant:rotala-rotundifolia": Data(#"{"comments":[],"sitekey":"k","verification":"none"}"#.utf8),
  ]

  /// Performance tests' index: the fixture plus 800 fish (the site lists about 700), named and shaped like real ones,
  /// with no pictures (those come from the network).
  static let large = HandbookIndex(lang: "vi", items: fixture.items + (1...800).map { n in
    .init(kind: .fish, contentId: "loai-\(n)", name: "Cá thử \(n)", sub: "Genus species\(n)", aka: ["Fish \(n)"], path: "/vi/ca/ca-thu-\(n)/")
  }, home: fixture.home, labels: fixture.labels)
}
#endif
