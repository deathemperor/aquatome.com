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
  private let source: Source
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
  }

  func url(_ item: HandbookIndex.Item) -> URL { URL(string: item.path, relativeTo: site)!.absoluteURL }

  /// The page of a fish or plant on a tank, once the index is here.
  func page(_ contentId: String) -> HandbookIndex.Item? { pages[contentId] }

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
    .init(kind: .fish, contentId: "symphysodon-aequifasciatus", name: "Cá đĩa", sub: "Symphysodon aequifasciatus", aka: ["Discus"], path: "/vi/ca/ca-dia/"),
    .init(kind: .fish, contentId: "paracheirodon-innesi", name: "Cá neon", sub: "Paracheirodon innesi", aka: ["Neon tetra"], path: "/vi/ca/ca-neon/",
          facts: .init(tempC: .init(min: 20, max: 26), ph: .init(min: 5, max: 7), sizeCm: 4, tankCm: 60, temperament: "peaceful", schoolMin: 6, difficulty: 2)),
    .init(kind: .fish, contentId: "danio-rerio", name: "Cá ngựa vằn", sub: "Danio rerio", path: "/vi/ca/ca-ngua-van/"),
    .init(kind: .plant, contentId: "rotala-rotundifolia", name: "Rotala đỏ", sub: "Rotala rotundifolia", path: "/vi/cay/rotala-do/"),
    .init(kind: .guide, name: "Nuôi cá neon trong bể nhỏ", path: "/vi/huong-dan/nuoi-ca-neon/"),
    .init(kind: .glossary, name: "Đệm pH", path: "/vi/thuat-ngu/dem-ph/"),
    .init(kind: .tool, name: "Đèn Chihiros", path: "/vi/cong-cu/den-chihiros/"),
    .init(kind: .tool, name: "Bể của tôi", path: "/vi/cong-cu/be-cua-toi/"),
  ])

  /// Performance tests' index: the fixture plus 800 fish (the site lists about 700), named and shaped like real ones,
  /// with no pictures (those come from the network).
  static let large = HandbookIndex(lang: "vi", items: fixture.items + (1...800).map { n in
    .init(kind: .fish, contentId: "loai-\(n)", name: "Cá thử \(n)", sub: "Genus species\(n)", aka: ["Fish \(n)"], path: "/vi/ca/ca-thu-\(n)/")
  })
}
#endif
