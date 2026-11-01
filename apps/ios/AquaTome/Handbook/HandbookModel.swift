import Foundation
import Handbook
import Observation

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
  private let source: Source
  /// The pages the app draws itself, kept on the phone.
  private let drawn: PageCache
  /// The site's copy has been read this run: showing the tab again doesn't fetch it again (pull to refresh does).
  private var fetched = false

  /// Where the index comes from: the site, or (UI tests) a fixed one.
  enum Source {
    case site
    case fixed(HandbookIndex)
  }

  init(source: Source = HandbookModel.defaultSource(), preferred: [String] = Bundle.main.preferredLocalizations) {
    self.source = source
    lang = preferred.first.flatMap { ["vi", "id", "th"].contains($0) ? $0 : nil } ?? "vi"
    reading = UserDefaults.standard.data(forKey: "handbook.reading.\(lang)").flatMap { try? JSONDecoder().decode(ReadingList.self, from: $0) } ?? ReadingList()
    drawn = Self.pageCache(source, site: site)
  }

  /// Whether the app draws this page itself: the site publishes its kind as blocks.
  func drawsItself(_ item: HandbookIndex.Item) -> Bool { shardCounts[item.kind.rawValue] != nil }

  /// The page as blocks, from the phone or the site; nil when the web page is to show instead.
  func doc(_ item: HandbookIndex.Item) async -> PageDoc? {
    guard let count = shardCounts[item.kind.rawValue] else { return nil }
    return await drawn.doc(path: item.path, kind: item.kind.rawValue, lang: lang, count: count)
  }

  /// The page at a path the index lists ("/vi/ca/ca-neon/").
  func item(at path: String) -> HandbookIndex.Item? { byPath[path] }

  func url(_ item: HandbookIndex.Item) -> URL { URL(string: item.path, relativeTo: site)!.absoluteURL }

  /// The page of a fish or plant on a tank, once the index is here.
  func page(_ contentId: String) -> HandbookIndex.Item? { pages[contentId] }

  /// The saved pages and the ones read last, of `kind` (all kinds for nil), as the index has them now.
  func saved(_ kind: HandbookIndex.Kind?) -> [HandbookIndex.Item] { ReadingList.items(reading.saved, in: byPath, kind: kind) }
  func recent(_ kind: HandbookIndex.Kind?, limit: Int = 5) -> [HandbookIndex.Item] { ReadingList.items(reading.recent, in: byPath, kind: kind, limit: limit) }

  /// Guides that name these fish and plants (a tank's), the most of them first, then in name order.
  func guides(about ids: [String]) -> [HandbookIndex.Item] { HandbookIndex.guides(about: ids, in: search.find("", kind: .guide)) }

  func read(_ item: HandbookIndex.Item) { change { $0.read(item.path) } }
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
    if case .fixed(let ix) = source { return use(ix, .ready) }
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
    byPath = Dictionary(ix.items.map { ($0.path, $0) }, uniquingKeysWith: { a, _ in a })
    shardCounts = ix.pages
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
    if args.contains("-fixed-handbook") { return .fixed(.fixture) }
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
    let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "pages")
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
          facts: .init(tempC: .init(min: 20, max: 26), ph: .init(min: 5, max: 7), sizeCm: 4, tankCm: 60, temperament: "peaceful", schoolMin: 6, difficulty: 2),
          group: "tetras"),
    .init(kind: .fish, contentId: "danio-rerio", name: "Cá ngựa vằn", sub: "Danio rerio", path: "/vi/ca/ca-ngua-van/", group: "danios"),
    .init(kind: .plant, contentId: "rotala-rotundifolia", name: "Rotala đỏ", sub: "Rotala rotundifolia", path: "/vi/cay/rotala-do/",
          facts: .init(tempC: .init(min: 20, max: 28)), plant: .init(difficulty: 2, light: "high", co2: "optional", growth: "fast", placement: ["background"])),
    .init(kind: .guide, name: "Nuôi cá neon trong bể nhỏ", path: "/vi/huong-dan/nuoi-ca-neon/", section: "care", about: ["paracheirodon-innesi"]),
    .init(kind: .glossary, name: "Đệm pH", path: "/vi/thuat-ngu/dem-ph/"),
    .init(kind: .tool, name: "Đèn Chihiros", path: "/vi/cong-cu/den-chihiros/"),
    .init(kind: .tool, name: "Bể của tôi", path: "/vi/cong-cu/be-cua-toi/"),
  ], home: .init(groups: [.init(id: "cichlids"), .init(id: "tetras"), .init(id: "danios")], fish: ["/vi/ca/ca-neon/", "/vi/ca/ca-dia/"],
                 plants: [], guides: ["/vi/huong-dan/nuoi-ca-neon/"]),
  labels: .init([
    "group": ["cichlids": "Cichlid", "tetras": "Cá tetra", "danios": "Danio", "other": "Loài khác"],
    "placement": ["foreground": "Tiền cảnh", "midground": "Trung cảnh", "background": "Hậu cảnh", "epiphyte": "Bám đá, lũa", "floating": "Thả nổi"],
    "section": ["setup": "Setup bể", "care": "Chăm sóc", "plantCare": "Chăm cây"],
    "light": ["low": "Yếu", "medium": "Trung bình", "high": "Mạnh"],
    "co2": ["none": "Không cần", "optional": "Tùy chọn", "required": "Bắt buộc"],
  ]), pages: ["guide": 1])

  /// UI tests' pages: the neon guide as the site writes it (/app/pages/vi/guide-0.json), with each kind of block, links
  /// to the fixture's pages, a word's tip, and a part from a newer site the app can't draw.
  static let fixturePages = Data(#"""
  {"v":1,"pages":{"/vi/huong-dan/nuoi-ca-neon/":{"v":1,"kind":"guide","path":"/vi/huong-dan/nuoi-ca-neon/","title":"Nuôi cá neon trong bể nhỏ",
   "meta":"Chăm sóc · đọc khoảng 4 phút","credit":["AquaTome tổng hợp từ ",{"text":"2 nguồn","href":"#nguon"}," rồi tự viết"],
   "lead":{"src":"https://media.aquatome.com/a/neon-lead.webp","w":1200,"h":800,"credit":{"text":"Ảnh: Aquarium Co-op","licence":"CC BY 4.0"}},
   "blocks":[
    {"t":"summary","title":"Tóm tắt nhanh","items":["Nuôi từ 6 con trở lên.","Nước mềm, hơi chua."]},
    {"t":"h","text":"Bể và nước","id":"be-va-nuoc"},
    {"t":"p","c":["Cá ",{"text":"neon","href":"/vi/ca/ca-neon/"}," sống theo đàn và cần nước có ",{"text":"pH","href":"/vi/thuat-ngu/dem-ph/","tip":{"term":"Đệm pH","text":"Khả năng giữ pH của nước khi có thêm axit."}}," từ 5 đến 7."]},
    {"t":"list","ordered":true,"items":[[{"t":"p","c":["Bể từ ",{"text":"60 cm","b":true},"."]}],[{"t":"p","c":["Cây thủy sinh và lũa."]}]]},
    {"t":"table","head":[["Thông số"],["Mức"]],"rows":[[["Nhiệt độ"],["20–26°C"]],[["pH"],["5–7"]]]},
    {"t":"carousel","items":[{"src":"https://example.org/1.webp"}]},
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
    {"t":"pages","title":"Loài và cây trong bài","paths":["/vi/ca/ca-neon/","/vi/ca/khong-co/"]}
   ]}}}
  """#.utf8)

  /// Performance tests' index: the fixture plus 800 fish (the site lists about 700), named and shaped like real ones,
  /// with no pictures (those come from the network).
  static let large = HandbookIndex(lang: "vi", items: fixture.items + (1...800).map { n in
    .init(kind: .fish, contentId: "loai-\(n)", name: "Cá thử \(n)", sub: "Genus species\(n)", aka: ["Fish \(n)"], path: "/vi/ca/ca-thu-\(n)/")
  }, home: fixture.home, labels: fixture.labels)
}
#endif
