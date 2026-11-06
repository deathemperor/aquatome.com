import Foundation
import Testing
@testable import Handbook

// The index as the site writes it (apps/site/src/lib/app-index.ts): a few real-shaped items.
let sample = Data(#"""
{"version":1,"lang":"vi","items":[
 {"kind":"fish","id":"symphysodon-aequifasciatus","name":"Cá đĩa","sub":"Symphysodon aequifasciatus","aka":["Discus"],"path":"/vi/ca/ca-dia/","img":"https://media.aquatome.com/x-480.webp"},
 {"kind":"fish","id":"paracheirodon-innesi","name":"Cá neon","sub":"Paracheirodon innesi","aka":["Neon tetra"],"path":"/vi/ca/ca-neon/"},
 {"kind":"fish","id":"paracheirodon-axelrodi","name":"Cá neon đỏ","sub":"Paracheirodon axelrodi","path":"/vi/ca/ca-neon-do/"},
 {"kind":"fish","id":"danio-rerio","name":"Cá ngựa vằn","sub":"Danio rerio","aka":["Zebra danio"],"path":"/vi/ca/ca-ngua-van/"},
 {"kind":"plant","id":"rotala-rotundifolia","name":"Rotala đỏ","sub":"Rotala rotundifolia","path":"/vi/cay/rotala-do/"},
 {"kind":"guide","name":"Nuôi cá neon trong bể nhỏ","path":"/vi/huong-dan/nuoi-ca-neon/"},
 {"kind":"glossary","name":"Đệm pH","path":"/vi/thuat-ngu/dem-ph/"},
 {"kind":"tool","name":"Đèn Chihiros","path":"/vi/cong-cu/den-chihiros/"}
]}
"""#.utf8)

func names(_ items: [HandbookIndex.Item]) -> [String] { items.map(\.name) }

@Test func readsTheSitesIndex() throws {
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: sample)
  #expect(ix.lang == "vi" && ix.items.count == 8)
  // The page's content id (what a tank's species hold) is kept apart from the item's identity (its page).
  #expect(ix.items[0].contentId == "symphysodon-aequifasciatus" && ix.items[0].id == "/vi/ca/ca-dia/")
  #expect(ix.items[5].contentId == nil)
}

@Test func aKindANewerSiteAddsIsLeftOutNotTheWholeIndex() throws {
  let newer = Data(#"""
  {"version":1,"lang":"vi","items":[
   {"kind":"fish","id":"danio-rerio","name":"Cá ngựa vằn","path":"/vi/ca/ca-ngua-van/"},
   {"kind":"podcast","name":"Trồng cây","path":"/vi/podcast/trong-cay/"},
   {"kind":"tool","name":"Đèn Chihiros","path":"/vi/cong-cu/den-chihiros/"}
  ]}
  """#.utf8)
  #expect(names(try JSONDecoder().decode(HandbookIndex.self, from: newer).items) == ["Cá ngựa vằn", "Đèn Chihiros"])
  // A format changed on purpose (a new version) isn't read as this one.
  #expect(throws: (any Error).self) { try JSONDecoder().decode(HandbookIndex.self, from: Data(#"{"version":2,"lang":"vi","items":[]}"#.utf8)) }
}

/// The app sends its anonymous telemetry only once the site says it takes it: `telemetry: true`, nothing else.
@Test func theSiteTakesTelemetryOnlyWhenItsIndexSaysTrue() throws {
  func flag(_ field: String) throws -> Bool {
    try JSONDecoder().decode(HandbookIndex.self, from: Data(#"{"version":1,"lang":"vi","items":[]\#(field)}"#.utf8)).telemetry
  }
  #expect(try flag(#","telemetry":true"#))
  #expect(try !flag(""))
  #expect(try !flag(#","telemetry":false"#))
  #expect(try !flag(#","telemetry":"true""#))
  #expect(try !flag(#","telemetry":1"#))
  // The copy kept on the phone says the same.
  let kept = try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(HandbookIndex(lang: "vi", items: [], telemetry: true)))
  #expect(kept.telemetry)
}

@Test func readsAVideoSeriesAVideoGuidesLengthAndAToolsOwnWords() throws {
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"""
  {"version":1,"lang":"vi","items":[
   {"kind":"video","name":"Rêu hại từ A đến Z","sub":"MJ Aquascaping","path":"/vi/video/reu-hai-tu-a-den-z/","img":"https://i.ytimg.com/vi/x/hqdefault.jpg","parts":14},
   {"kind":"guide","name":"Cách hạn chế rêu hại","path":"/vi/huong-dan/cach-han-che-reu-hai/","section":"plantCare","video":1755},
   {"kind":"tool","name":"Bể bao nhiêu lít?","path":"/vi/cong-cu/the-tich-be/","words":["Tính thể tích bể cá: lít, gallon, độ dày kính"]},
   {"kind":"tool","name":"Công cụ","path":"/vi/cong-cu/","words":"not a list","video":"long","parts":-0.5}
  ]}
  """#.utf8))
  #expect(ix.items.map(\.kind) == [.video, .guide, .tool, .tool])
  #expect(ix.items[0].sub == "MJ Aquascaping" && ix.items[0].parts == 14 && ix.items[0].video == nil)
  #expect(ix.items[1].video == 1755 && ix.items[1].words.isEmpty)
  #expect(ix.items[2].words == ["Tính thể tích bể cá: lít, gallon, độ dày kính"])
  // A value this app can't read is left out, never the item.
  #expect(ix.items[3].words.isEmpty && ix.items[3].video == nil && ix.items[3].parts == nil)
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(ix)) == ix, "kept on the phone and read back the same")
}

@Test func aToolIsFoundByWhatItsPageSaysAfterEveryNameMatch() {
  let s = HandbookSearch([
    .init(kind: .tool, name: "Bể bao nhiêu lít?", path: "/vi/cong-cu/the-tich-be/", words: ["Tính thể tích bể cá: lít, gallon, độ dày kính"]),
    // Longer than the tool's name: among equal ranks the shorter name goes first, so only the rank puts it ahead.
    .init(kind: .glossary, name: "Dung tích thực của bể", aka: ["Thể tích bể"], path: "/vi/thuat-ngu/dung-tich/"),
    .init(kind: .guide, name: "Tính thể tích bể", path: "/vi/huong-dan/tinh-the-tich-be/"),
  ])
  // The name, then another name, then the page's own words ("the tich be" would be the glossary's other name whole,
  // and a page named what was searched for comes first).
  #expect(names(s.find("the tich")) == ["Tính thể tích bể", "Dung tích thực của bể", "Bể bao nhiêu lít?"])
  #expect(names(s.find("gallon")) == ["Bể bao nhiêu lít?"])
  #expect(names(s.find("gallon kinh", kind: .tool)) == ["Bể bao nhiêu lít?"])
  #expect(s.find("gallon", kind: .guide).isEmpty)
}

@Test func videosAreTheSeriesAndTheGuidesMadeFromVideos() {
  let series = HandbookIndex.Item(kind: .video, name: "Rêu hại từ A đến Z", sub: "MJ Aquascaping", path: "/vi/video/reu/", parts: 14)
  let video = HandbookIndex.Item(kind: .guide, name: "Cách hạn chế rêu hại", path: "/vi/huong-dan/reu-video/", video: 1755)
  let written = HandbookIndex.Item(kind: .guide, name: "Rêu hại và cách trị", path: "/vi/huong-dan/reu/")
  let s = HandbookSearch([series, video, written])
  #expect(names(s.find("reu", kind: .video)) == ["Rêu hại từ A đến Z", "Cách hạn chế rêu hại"])
  #expect(names(s.find("", kind: .video)) == ["Cách hạn chế rêu hại", "Rêu hại từ A đến Z"])
  // A video guide is still a guide.
  #expect(names(s.find("reu", kind: .guide)) == ["Rêu hại và cách trị", "Cách hạn chế rêu hại"])
  #expect(video.is(.guide) && video.is(.video) && !written.is(.video) && series.is(.video) && !series.is(.guide))
}

@Test func foldsAccentsAndTheVietnameseD() {
  #expect(HandbookSearch.fold("Cá Đĩa") == "ca dia")
  #expect(HandbookSearch.fold("Đệm pH") == "dem ph")
  #expect(HandbookSearch.fold("NGỰA VẰN") == "ngua van")
}

@Test func findsWhatReadersType() throws {
  let s = HandbookSearch(try JSONDecoder().decode(HandbookIndex.self, from: sample).items)
  #expect(names(s.find("ca dia")) == ["Cá đĩa"])                     // without accents
  #expect(names(s.find("discus")) == ["Cá đĩa"])                     // another name
  #expect(names(s.find("danio")) == ["Cá ngựa vằn"])                 // the scientific name
  #expect(names(s.find("van ngua")) == ["Cá ngựa vằn"])              // words in any order
  #expect(names(s.find("dem")) == ["Đệm pH"])                        // đ typed as d
  // The name itself first, then names starting with it, then names containing it.
  #expect(names(s.find("ca neon")) == ["Cá neon", "Cá neon đỏ", "Nuôi cá neon trong bể nhỏ"])
  #expect(names(s.find("neon")).prefix(2) == ["Cá neon", "Cá neon đỏ"])
  #expect(names(s.find("neon", kind: .guide)) == ["Nuôi cá neon trong bể nhỏ"])
  #expect(s.find("khong co").isEmpty)
}

@Test func anEmptySearchListsAKindInNameOrder() throws {
  let s = HandbookSearch(try JSONDecoder().decode(HandbookIndex.self, from: sample).items)
  #expect(names(s.find("", kind: .fish)) == ["Cá đĩa", "Cá neon", "Cá neon đỏ", "Cá ngựa vằn"])
  #expect(s.find("").count == 8)
}

@Test func browsingAKindListsAllOfIt() {
  let many = (0..<700).map { HandbookIndex.Item(kind: .fish, name: "Cá \($0)", path: "/vi/ca/\($0)/") }
  let s = HandbookSearch(many)
  #expect(s.find("", kind: .fish).count == 700)
  #expect(s.find("ca").count == 200) // a search still stops at its best 200
  #expect(s.findAndCount("ca").counts == [nil: 700, .fish: 700], "the count stopped where the list does")
}

@Test func aSearchCountsWhatEachKindFinds() throws {
  let s = HandbookSearch(try JSONDecoder().decode(HandbookIndex.self, from: sample).items)
  let neon = s.findAndCount("NEON ").counts
  // In all under nil, and each kind it finds: none for the others.
  #expect(neon == [nil: 3, .fish: 2, .guide: 1])
  // What a search narrowed to each kind lists, whichever kind the counting search was narrowed to.
  for k in [nil] + HandbookIndex.Kind.allCases {
    let (items, counts) = s.findAndCount("neon", kind: k)
    #expect(counts == neon && items == s.find("neon", kind: k) && neon[k, default: 0] == items.count, "\(String(describing: k))")
  }
  #expect(s.findAndCount("van ngua").counts == [nil: 1, .fish: 1])
  #expect(s.findAndCount("khong co").counts.isEmpty)
}

@Test func aVideoGuideCountsAsAGuideAndAsAVideo() {
  let s = HandbookSearch([
    .init(kind: .video, name: "Rêu hại từ A đến Z", sub: "MJ Aquascaping", path: "/vi/video/reu/", parts: 14),
    .init(kind: .guide, name: "Cách hạn chế rêu hại", path: "/vi/huong-dan/reu-video/", video: 1755),
    .init(kind: .guide, name: "Rêu hại và cách trị", path: "/vi/huong-dan/reu/"),
  ])
  #expect(s.findAndCount("reu").counts == [nil: 3, .guide: 2, .video: 2])
}

@Test func aLoadReplacedByAnotherIsNotAFailure() {
  #expect(isInterruption(URLError(.cancelled)))
  #expect(isInterruption(CancellationError()))
  #expect(isInterruption(NSError(domain: "WebKitErrorDomain", code: 102)))
  #expect(!isInterruption(URLError(.notConnectedToInternet)))
  #expect(!isInterruption(URLError(.timedOut)))
}

@Test func theSitesPagesStayInTheAppTheRestOpenOutside() {
  let site = URL(string: "https://aquatome.com")!
  func route(_ s: String, mainFrame: Bool = true, newWindow: Bool = false) -> PageRoute {
    PageRoute.of(URL(string: s)!, site: site, mainFrame: mainFrame, newWindow: newWindow)
  }
  #expect(route("https://aquatome.com/vi/ca/ca-neon/") == .app)
  #expect(route("https://www.aquatome.com/vi/ca/ca-neon/") == .app)
  // Shop links ask for a new window (target="_blank"), even on the site: the app has none, so they open outside.
  #expect(route("https://aquatome.com/go/shopee/?k=ca-neon", newWindow: true) == .outside)
  // Another site, by a link or a redirect, opens outside.
  #expect(route("https://shopee.vn/search?keyword=ca-neon") == .outside)
  #expect(route("mailto:lienhe@example.com") == .outside)
  // An embed inside the page (a video) stays.
  #expect(route("https://www.youtube-nocookie.com/embed/x", mainFrame: false) == .app)
  #expect(route("about:blank", mainFrame: false) == .app)
  #expect(route("about:blank", newWindow: true) == .none)
}

// The site's pages about itself open in the browser, not the app's web view (the owner's call): about, with its data
// table, contact and privacy, in each language, the Vietnamese under "/vi/" or at the root.
@Test func theSitesPagesAboutItselfOpenInTheBrowser() {
  let site = URL(string: "https://aquatome.com")!
  func route(_ s: String) -> PageRoute { PageRoute.of(URL(string: s)!, site: site, mainFrame: true, newWindow: false) }
  for s in ["https://aquatome.com/vi/gioi-thieu/", "https://aquatome.com/vi/gioi-thieu/bang-du-lieu/",
            "https://aquatome.com/vi/lien-he/", "https://www.aquatome.com/vi/chinh-sach-bao-mat/#tai-khoan",
            "https://aquatome.com/lien-he/", "https://aquatome.com/gioi-thieu",
            "https://aquatome.com/id/tentang/", "https://aquatome.com/id/tentang/tabel-data/", "https://aquatome.com/id/kontak/",
            "https://aquatome.com/id/kebijakan-privasi/#tai-khoan", "https://aquatome.com/th/about/",
            "https://aquatome.com/th/about/data-table/", "https://aquatome.com/th/contact/", "https://aquatome.com/th/privacy/"] {
    #expect(route(s) == .outside, "\(s)")
  }
  // The handbook stays: the home page, a page whose slug starts as one does, one language's words in another's.
  for s in ["https://aquatome.com/vi/", "https://aquatome.com/", "https://aquatome.com/vi/huong-dan/lien-he-nguon-nuoc/",
            "https://aquatome.com/vi/gioi-thieu-ca-canh/", "https://aquatome.com/vi/about/", "https://aquatome.com/id/contact/",
            "https://aquatome.com/about/"] {
    #expect(route(s) == .app, "\(s)")
  }
}

@Test func shopLinksAreTheSitesGoPaths() {
  let site = URL(string: "https://aquatome.com/vi/ca/ca-neon/")!
  #expect(ShopLink.is(URL(string: "https://aquatome.com/go/shopee/?k=ca-neon")!, site: site))
  #expect(ShopLink.is(URL(string: "https://www.aquatome.com/go/tiki/?k=loc")!, site: site))
  #expect(!ShopLink.is(URL(string: "https://aquatome.com/gone/")!, site: site))
  #expect(!ShopLink.is(URL(string: "https://aquatome.com/vi/go/")!, site: site))
  #expect(!ShopLink.is(URL(string: "https://shopee.vn/go/x")!, site: site))
}

// Our copies' taps: the site's redirect is read, not followed, under the mark it leaves out of its click counts.
@Test func aShopLinksShopIsAskedOfTheSiteUnderTheGivenName() async {
  let link = URL(string: "https://aquatome.com/go/shopee/?k=ca-neon")!
  @Sendable func answer(_ status: Int, _ headers: [String: String] = [:]) -> HTTPURLResponse {
    HTTPURLResponse(url: URL(string: "https://aquatome.com/go/shopee/?k=ca-neon")!, statusCode: status, httpVersion: nil, headerFields: headers)!
  }
  // The shop only for the link itself, asked under the name given.
  let shop = await ShopLink.target(of: link, userAgent: "AquaTome-iOS AquaTomeCheck/1") { r in
    r.url == link && r.value(forHTTPHeaderField: "User-Agent") == "AquaTome-iOS AquaTomeCheck/1"
      ? answer(302, ["Location": "https://shopee.vn/search?keyword=ca-neon"]) : answer(500)
  }
  #expect(shop.absoluteString == "https://shopee.vn/search?keyword=ca-neon")
  // Anything else opens the link itself: no redirect, a redirect to no web page, the site out of reach.
  #expect(await ShopLink.target(of: link, userAgent: "x") { _ in answer(404) } == link)
  #expect(await ShopLink.target(of: link, userAgent: "x") { _ in answer(302, ["Location": "javascript:alert(1)"]) } == link)
  #expect(await ShopLink.target(of: link, userAgent: "x") { _ in throw URLError(.notConnectedToInternet) } == link)
  // A Location given as a path is read against the link.
  #expect(await ShopLink.target(of: link, userAgent: "x") { _ in answer(302, ["Location": "/vi/"]) }.absoluteString == "https://aquatome.com/vi/")
  // www. first goes to the bare domain's same link, which is asked too, marked; never more than twice.
  let www = URL(string: "https://www.aquatome.com/go/shopee/?k=ca-neon")!
  let viaApex = await ShopLink.target(of: www, userAgent: "x") { r in
    r.url?.host == "www.aquatome.com" ? answer(301, ["Location": link.absoluteString])
      : answer(302, ["Location": "https://shopee.vn/search?keyword=ca-neon"])
  }
  #expect(viaApex.absoluteString == "https://shopee.vn/search?keyword=ca-neon")
  #expect(await ShopLink.target(of: www, userAgent: "x") { _ in answer(301, ["Location": link.absoluteString]) } == www)
}

@Test func readsAFishsFiguresAndBehaviourUnderTheToolsNames() throws {
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"""
  {"version":1,"lang":"vi","items":[
   {"kind":"fish","id":"paracheirodon-axelrodi","name":"Cá neon đỏ","path":"/vi/ca/ca-neon-do/","tempC":{"min":23,"max":27},"ph":{"min":4,"max":6},"gh":{"min":1,"max":6},"sizeCm":5,"tankCm":60,"temperament":"peaceful","schoolMin":8,"difficulty":3,"lifeYears":{"min":5,"max":10}},
   {"kind":"fish","id":"puntigrus-tetrazona","name":"Cá xăng-đá","path":"/vi/ca/ca-xang-da/","sizeCm":7,"temperament":"shy","finNipper":true},
   {"kind":"fish","id":"danio-rerio","name":"Cá ngựa vằn","path":"/vi/ca/ca-ngua-van/","sizeCm":"5 cm","ph":{"min":6},"tankCm":60,"lifeYears":"3 năm"},
   {"kind":"guide","name":"Nuôi cá neon trong bể nhỏ","path":"/vi/huong-dan/nuoi-ca-neon/"}
  ]}
  """#.utf8))
  #expect(ix.items.count == 4)
  #expect(ix.items[0].facts == .init(tempC: .init(min: 23, max: 27), ph: .init(min: 4, max: 6), gh: .init(min: 1, max: 6), sizeCm: 5, tankCm: 60, temperament: "peaceful", schoolMin: 8, difficulty: 3,
                                  lifeYears: .init(min: 5, max: 10)))
  // A temperament this app doesn't know yet is kept as the site wrote it.
  #expect(ix.items[1].facts == .init(sizeCm: 7, temperament: "shy", finNipper: true))
  // A figure it can't read is left out, not the fish.
  #expect(ix.items[2].name == "Cá ngựa vằn" && ix.items[2].facts == .init(tankCm: 60))
  #expect(ix.items[3].facts == .init())
}

@Test func writesTheFactsBackUnderTheSameNames() throws {
  let item = HandbookIndex.Item(kind: .fish, contentId: "x", name: "Cá", path: "/vi/ca/x/", facts: .init(ph: .init(min: 6, max: 7.5), sizeCm: 4, finNipper: true))
  let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(item)) as! [String: Any]
  #expect(json["sizeCm"] as? Double == 4 && json["finNipper"] as? Bool == true && (json["ph"] as? [String: Double]) == ["min": 6, "max": 7.5])
  #expect(json["tempC"] == nil && json["id"] as? String == "x")
  #expect(try JSONDecoder().decode(HandbookIndex.Item.self, from: JSONEncoder().encode(item)) == item)
}

@Test func readsABreedsSpeciesAndItsOwnFiguresApart() throws {
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"""
  {"version":1,"lang":"vi","items":[
   {"kind":"fish","id":"halfmoon-betta","name":"Cá betta Halfmoon","path":"/vi/ca/ca-betta-halfmoon/","of":"betta-splendens","card":{"tempC":{"min":24,"max":28},"sizeCm":6,"lifeYears":{"min":2,"max":3}}},
   {"kind":"fish","id":"flowerhorn-cichlid","name":"Cá La Hán","path":"/vi/ca/ca-la-han/","sizeCm":30,"card":{"sizeCm":30}},
   {"kind":"fish","id":"x","name":"X","path":"/vi/ca/x/","of":7,"card":"warm"}
  ]}
  """#.utf8))
  // A form of a species: the species it is checked as, no figures of its own in `facts`, its card's figures apart.
  #expect(ix.items[0].of == "betta-splendens" && !ix.items[0].facts.any)
  #expect(ix.items[0].card == .init(tempC: .init(min: 24, max: 28), sizeCm: 6, lifeYears: .init(min: 2, max: 3)))
  // A hybrid: a fish of its own.
  #expect(ix.items[1].of == nil && ix.items[1].facts == .init(sizeCm: 30))
  // What this app can't read is left out, not the fish.
  #expect(ix.items.count == 3 && ix.items[2].of == nil && ix.items[2].card == nil)
  // Kept on the phone as read.
  #expect(try JSONDecoder().decode(HandbookIndex.Item.self, from: JSONEncoder().encode(ix.items[0])) == ix.items[0])
}

@Test func readsAGuidesSubjectAndTheFishItNames() throws {
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"""
  {"version":1,"lang":"vi","items":[
   {"kind":"guide","name":"Setup bể đầu tiên","path":"/vi/huong-dan/setup/","section":"setup","about":["paracheirodon-innesi","anubias-barteri-nana"]},
   {"kind":"guide","name":"Thay nước","path":"/vi/huong-dan/thay-nuoc/","section":"care"},
   {"kind":"guide","name":"Lạ","path":"/vi/huong-dan/la/","section":7,"about":"neon"}
  ]}
  """#.utf8))
  #expect(ix.items.map(\.section) == ["setup", "care", nil])
  #expect(ix.items[0].about == ["paracheirodon-innesi", "anubias-barteri-nana"])
  #expect(ix.items[1].about.isEmpty)
  // Values it can't read are left out, not the guide.
  #expect(ix.items[2].name == "Lạ" && ix.items[2].about.isEmpty)
  let back = try JSONDecoder().decode(HandbookIndex.Item.self, from: JSONEncoder().encode(ix.items[0]))
  #expect(back == ix.items[0])
}

@Test func readsWhatTheAppBrowsesBy() throws {
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"""
  {"version":1,"lang":"vi","items":[
   {"kind":"fish","id":"neon","name":"Cá neon","path":"/vi/ca/neon/","group":"tetras"},
   {"kind":"plant","id":"nana","name":"Ráy nana","path":"/vi/cay/nana/","plant":{"difficulty":1,"light":"low","co2":"none","growth":"slow","placement":["foreground","epiphyte"]}},
   {"kind":"plant","id":"la","name":"Lạ","path":"/vi/cay/la/","plant":{"difficulty":"easy","light":"low","placement":"foreground"}}
  ],
  "home":{"groups":[{"id":"tetras","img":"https://x/neon.jpg"},{"id":"shrimp"}],"fish":["/vi/ca/neon/"],"plants":["/vi/cay/nana/"],"guides":[]},
  "labels":{"group":{"tetras":"Cá tetra"},"placement":{"epiphyte":"Bám đá, lũa"},"difficulty":{"1":"Dễ"},"later":["not words"]}}
  """#.utf8))
  #expect(ix.items[0].group == "tetras")
  #expect(ix.items[1].plant == .init(difficulty: 1, light: "low", co2: "none", growth: "slow", placement: ["foreground", "epiphyte"]))
  // A value this app can't read is left out, not the rest of the plant's care.
  #expect(ix.items[2].plant == .init(light: "low"))
  #expect(ix.home == .init(groups: [.init(id: "tetras", img: "https://x/neon.jpg"), .init(id: "shrimp")], fish: ["/vi/ca/neon/"], plants: ["/vi/cay/nana/"]))
  #expect(ix.labels["group", "tetras"] == "Cá tetra" && ix.labels["placement", "epiphyte"] == "Bám đá, lũa" && ix.labels["difficulty", "1"] == "Dễ")
  // Words this app can't read cost only themselves.
  #expect(ix.labels["group", "cichlids"] == nil && ix.labels.words["later"] == nil)
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(ix)) == ix)
}

@Test func anIndexFromAnOlderSiteOrWithAHomeItCantReadStillLoads() throws {
  let old = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"{"version":1,"lang":"vi","items":[{"kind":"fish","name":"Cá","path":"/vi/ca/x/"}]}"#.utf8))
  #expect(old.home == nil && old.labels.words.isEmpty && old.items[0].group == nil && old.items[0].plant == nil)
  let odd = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"{"version":1,"lang":"vi","items":[{"kind":"fish","name":"Cá","path":"/vi/ca/x/","group":7}],"home":[1],"labels":"x"}"#.utf8))
  #expect(odd.items.count == 1 && odd.items[0].group == nil && odd.home == nil && odd.labels.words.isEmpty)
}

@Test func writesFactsAsTheSitesPagesDo() {
  typealias F = HandbookIndex.Facts
  let vi = Locale(identifier: "vi_VN"), th = Locale(identifier: "th_TH")
  #expect(F.range(.init(min: 20, max: 26), vi) == "20–26")
  #expect(F.range(.init(min: 6.5, max: 7.25), vi) == "6,5–7,3") // a half rounded up, as the browser does
  #expect(F.range(.init(min: 4.5, max: 6.5), th) == "4.5–6.5")
  #expect(F.range(.init(min: 7, max: 7), vi) == "7")
  #expect(F.number(1200, vi) == "1.200" && F.number(1200, th) == "1,200") // thousands grouped, as the site groups them
  // The site's three steps of its 1–8 scale.
  #expect([1, 3, 4, 5, 6, 8].map { F.level($0) } == [.easy, .easy, .mid, .mid, .hard, .hard])
  // The card holds the site's data card's figures: a temperament alone (shown with the tank-mates) is nothing to show.
  #expect(!F().any && !F(temperament: "shy").any && !F(temperament: "predator").any)
  #expect(F(difficulty: 2).any && F(lifeYears: .init(min: 1.5, max: 1.5)).any)
  // A lifespan in months is a fraction of a year, written as the site writes it.
  #expect(F.range(.init(min: 1.5, max: 1.5), vi) == "1,5" && F.range(.init(min: 3, max: 8), vi) == "3–8")
}

@Test func guidesAboutATanksFishTheMostOfThemFirst() {
  let g = { (name: String, section: String, about: [String]) in HandbookIndex.Item(kind: .guide, name: name, path: "/vi/huong-dan/\(name)/", section: section, about: about) }
  let items = [
    g("Neon", "care", ["neon"]),
    g("Bể cộng đồng", "setup", ["neon", "corydoras", "anubias"]),
    g("Hàng mới về", "discovery", ["neon", "corydoras"]),
    g("Cá đĩa", "care", ["discus"]),
    g("Anubias", "plantCare", ["anubias"]),
    HandbookIndex.Item(kind: .fish, contentId: "neon", name: "Cá neon", path: "/vi/ca/neon/"),
  ]
  // Two fish of the tank's first, then the ones naming one, in the order given (the app gives name order).
  #expect(HandbookIndex.guides(about: ["neon", "anubias"], in: items).map(\.name) == ["Bể cộng đồng", "Neon", "Anubias"])
  #expect(HandbookIndex.guides(about: ["neon", "anubias"], in: items.reversed()).map(\.name) == ["Bể cộng đồng", "Anubias", "Neon"])
  #expect(HandbookIndex.guides(about: ["neon", "anubias"], in: items, limit: 1).map(\.name) == ["Bể cộng đồng"])
  #expect(HandbookIndex.guides(about: [], in: items).isEmpty)
  #expect(HandbookIndex.guides(about: ["betta"], in: items).isEmpty)
  // Five at most, unless asked otherwise.
  let many = (1...7).map { g("Neon \($0)", "care", ["neon"]) }
  #expect(HandbookIndex.guides(about: ["neon"], in: many).map(\.name) == ["Neon 1", "Neon 2", "Neon 3", "Neon 4", "Neon 5"])
}

// A kind of kit as the site's index lists it: read, on its shelf, found by its name, its page drawn by the app.
@Test func aKindOfKitIsReadShelvedAndFound() throws {
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"""
  {"version":1,"lang":"vi","items":[{"kind":"equipment","name":"Lọc","path":"/vi/thiet-bi/loc/","img":"https://media.aquatome.com/a/loc-480.webp"}],
   "shards":{"equipment":{"n":1,"level":2}}}
  """#.utf8))
  #expect(ix.items.map(\.kind) == [.equipment])
  #expect(ix.pages == ["equipment": 1])
  #expect(HandbookShelves(ix).all(.equipment).map(\.name) == ["Lọc"])
  #expect(HandbookSearch(ix.items).find("loc", limit: 5).map(\.path) == ["/vi/thiet-bi/loc/"])
}
