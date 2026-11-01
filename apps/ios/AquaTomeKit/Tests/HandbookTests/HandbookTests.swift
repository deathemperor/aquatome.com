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
   {"kind":"video","name":"Trồng cây","path":"/vi/video/trong-cay/"},
   {"kind":"tool","name":"Đèn Chihiros","path":"/vi/cong-cu/den-chihiros/"}
  ]}
  """#.utf8)
  #expect(names(try JSONDecoder().decode(HandbookIndex.self, from: newer).items) == ["Cá ngựa vằn", "Đèn Chihiros"])
  // A format changed on purpose (a new version) isn't read as this one.
  #expect(throws: (any Error).self) { try JSONDecoder().decode(HandbookIndex.self, from: Data(#"{"version":2,"lang":"vi","items":[]}"#.utf8)) }
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

@Test func readsAFishsFiguresAndBehaviourUnderTheToolsNames() throws {
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"""
  {"version":1,"lang":"vi","items":[
   {"kind":"fish","id":"paracheirodon-axelrodi","name":"Cá neon đỏ","path":"/vi/ca/ca-neon-do/","tempC":{"min":23,"max":27},"ph":{"min":4,"max":6},"gh":{"min":1,"max":6},"sizeCm":5,"tankCm":60,"temperament":"peaceful","schoolMin":8,"difficulty":3},
   {"kind":"fish","id":"puntigrus-tetrazona","name":"Cá xăng-đá","path":"/vi/ca/ca-xang-da/","sizeCm":7,"temperament":"shy","finNipper":true},
   {"kind":"fish","id":"danio-rerio","name":"Cá ngựa vằn","path":"/vi/ca/ca-ngua-van/","sizeCm":"5 cm","ph":{"min":6},"tankCm":60},
   {"kind":"guide","name":"Nuôi cá neon trong bể nhỏ","path":"/vi/huong-dan/nuoi-ca-neon/"}
  ]}
  """#.utf8))
  #expect(ix.items.count == 4)
  #expect(ix.items[0].facts == .init(tempC: .init(min: 23, max: 27), ph: .init(min: 4, max: 6), gh: .init(min: 1, max: 6), sizeCm: 5, tankCm: 60, temperament: "peaceful", schoolMin: 8, difficulty: 3))
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
