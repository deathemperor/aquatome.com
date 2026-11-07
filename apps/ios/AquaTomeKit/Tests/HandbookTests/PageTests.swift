import Foundation
import Testing
@testable import Handbook

// protocols/page-vectors.json: the cases the site's tests run too (apps/site/test/app-page.test.ts,
// packages/schema/test/app-page.test.ts), so the app reads pages as the site writes them.
private func cases(_ key: String) -> [[String: Any]] {
  // Tests/HandbookTests/PageTests.swift → the repository root, six levels up.
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  let data = try! Data(contentsOf: url.appendingPathComponent("protocols/page-vectors.json"))
  return (try! JSONSerialization.jsonObject(with: data) as! [String: Any])[key] as! [[String: Any]]
}

private func doc(_ json: Any) throws -> PageDoc {
  try #require(PageDoc(data: JSONSerialization.data(withJSONObject: json)))
}
/// A page holding these blocks, as a shard would.
private func page(_ blocks: Any, path: String = "/vi/huong-dan/x/") -> [String: Any] {
  ["v": 1, "kind": "guide", "path": path, "title": "Nuôi cá neon trong bể nhỏ", "blocks": blocks]
}

// What was read, written back in the format: equal to the vector means nothing was lost or misread.
private func json(_ d: PageDoc) -> [String: Any] {
  var o: [String: Any] = ["v": 1, "kind": d.kind, "path": d.path, "title": d.title, "blocks": d.blocks.map(json)]
  o["sub"] = d.sub
  o["meta"] = d.meta
  if !d.where.isEmpty { o["where"] = d.where.map(json) }
  o["aka"] = d.aka
  if !d.credit.isEmpty { o["credit"] = d.credit.map(json) }
  o["lead"] = d.lead.map(json)
  if let v = d.video {
    var j: [String: Any] = ["youtubeId": v.youtubeId, "title": v.title, "channel": v.channel, "durationSec": v.durationSec]
    j["subtitles"] = v.subtitles
    j["chapters"] = v.chapters?.map { ["at": $0.at, "title": $0.title] as [String: Any] }
    o["video"] = j
  }
  if let t = d.talk {
    var j: [String: Any] = [:]
    j["comments"] = t.comments
    j["photos"] = t.photos
    o["talk"] = j
  }
  return o
}
private func json(_ r: PageDoc.Run) -> Any {
  guard r.bold || r.italic || r.href != nil || r.tip != nil else { return r.text }
  var o: [String: Any] = ["text": r.text]
  if r.bold { o["b"] = true }
  if r.italic { o["i"] = true }
  o["href"] = r.href
  o["tip"] = r.tip.map { ["term": $0.term, "text": $0.text] as [String: Any] }
  return o
}
private func json(_ i: PageDoc.Image) -> [String: Any] {
  var o: [String: Any] = ["src": i.src, "w": i.w, "h": i.h]
  o["alt"] = i.alt
  o["thumb"] = i.thumb
  if let c = i.credit {
    var j: [String: Any] = ["text": c.text, "licence": c.licence]
    j["url"] = c.url
    j["author"] = c.author
    j["authorUrl"] = c.authorUrl
    o["credit"] = j
  }
  return o
}
private func json(_ b: PageDoc.Block) -> [String: Any] {
  var o: [String: Any] = ["t": b.t]
  switch b {
  case let .heading(text, id): o["text"] = text; o["id"] = id
  case let .paragraph(c): o["c"] = c.map(json)
  case let .list(ordered, items): if ordered { o["ordered"] = true }; o["items"] = items.map { $0.map(json) }
  case let .table(head, rows): o["head"] = head.map { $0.map { $0.map(json) } }; o["rows"] = rows.map { $0.map { $0.map(json) } }
  case let .figure(img, caption, href): o["img"] = json(img); if !caption.isEmpty { o["caption"] = caption.map(json) }; o["href"] = href
  case let .moments(title, youtubeId, items):
    o["title"] = title; o["youtubeId"] = youtubeId; o["items"] = items.map { ["at": $0.at, "img": json($0.img), "caption": $0.caption] }
  case let .summary(title, items, text, mistakes, by):
    o["title"] = title; o["items"] = items; o["text"] = text; o["by"] = by
    o["mistakes"] = mistakes.map { ["title": $0.title, "items": $0.items] as [String: Any] }
  case let .faq(title, items): o["title"] = title; o["items"] = items.map { ["q": $0.q, "a": $0.a] }
  case let .refs(title, id, items, note): o["title"] = title; o["id"] = id; o["items"] = items.map { ["title": $0.title, "url": $0.url] }; o["note"] = note
  case let .pages(title, paths): o["title"] = title; o["paths"] = paths
  case .web: break
  case let .gallery(title, note, photos, strip, href): o["title"] = title; o["note"] = note; o["photos"] = photos.map(json); o["strip"] = strip; o["href"] = href
  case let .trust(title, legend, rows):
    o["title"] = title; o["legend"] = legend
    o["rows"] = rows.map { r in
      var j: [String: Any] = ["field": r.field, "label": r.label, "items": r.items]
      if r.conflict { j["conflict"] = true }
      if r.marked { j["marked"] = true }
      j["note"] = r.note
      return j
    }
  case let .mates(m):
    let group = { (g: (title: String, items: [PageDoc.Mates.Mate])) -> [String: Any] in
      ["title": g.title, "items": g.items.map { x in
        var j: [String: Any] = ["path": x.path, "name": x.name]
        j["img"] = x.img.map(json)
        j["why"] = x.why
        return j
      }]
    }
    o["title"] = m.title; o["good"] = m.good.map(group); o["avoid"] = m.avoid.map(group); o["note"] = m.note
    o["tool"] = ["text": m.tool.text, "href": m.tool.href]
  case let .climate(title, items, note): o["title"] = title; o["items"] = items.map { ["label": $0.label, "ok": $0.ok, "text": $0.text] }; o["note"] = note
  case let .cards(title, items):
    o["title"] = title
    o["items"] = items.map { c in
      var j: [String: Any] = ["path": c.path, "name": c.name]
      j["sub"] = c.sub
      j["img"] = c.img.map(json)
      return j
    }
  case let .videos(title, items):
    o["title"] = title; o["items"] = items.map { ["youtubeId": $0.youtubeId, "title": $0.title, "durationSec": $0.durationSec, "lang": $0.lang] }
  }
  return o
}
private func same(_ a: Any, _ b: Any) -> Bool { (a as AnyObject).isEqual(b) }

@Test func readsEveryPageTheSiteWritesAsWritten() throws {
  let valid = cases("docs").filter { $0["valid"] as! Bool }
  #expect(valid.count >= 2)
  for c in valid {
    let d = try doc(c["doc"]!)
    #expect(same(json(d), c["doc"]!), "\(c["note"]!)")
  }
}

@Test func aPageFromANewerSiteOrWithBrokenBlocksStillShowsWithTheWebForWhatItCantRead() throws {
  let other = cases("docs").filter { !($0["valid"] as! Bool) }
  #expect(other.count >= 2)
  for c in other {
    let d = try doc(c["doc"]!)
    // Each block this app can't read is one "open on the web", in its place: none merged, none lost.
    #expect(d.blocks.map(\.t) == c["blocks"] as! [String], "\(c["note"]!)")
  }
}

/// Fish, plant and glossary pages, with the blocks and fields added for them: this app reads every one as written (an
/// older one shows the web for the blocks it doesn't know: the vectors' `older`, the site's and the schema's check).
@Test func readsTheFishPlantAndGlossaryPagesAsWritten() throws {
  let added = cases("added")
  #expect(added.count >= 3)
  for c in added {
    let d = try doc(c["doc"]!)
    #expect(same(json(d), c["doc"]!), "\(c["note"]!)")
    #expect(!d.blocks.contains { $0.t == "web" }, "\(c["note"]!)")
  }
}

/// A source's mark (drawn small and raised, as the site's `.cite`) is told from a word's tip: in the site's cases each
/// mark on a fish's or plant's page links one of its sources, and no word with a tip is taken for one.
@Test func aSourcesMarkIsToldFromAWordsTip() throws {
  var marks = 0, words = 0
  for c in cases("docs") + cases("added") {
    let page = c["doc"] as! [String: Any]
    let numbered = ["fish", "plant"].contains(page["kind"] as? String ?? "")
    let sources = Set((page["blocks"] as? [[String: Any]] ?? []).filter { $0["t"] as? String == "refs" }
      .flatMap { ($0["items"] as! [[String: Any]]).map { $0["url"] as! String } })
    func walk(_ v: Any) {
      if let o = v as? [String: Any] {
        if o["tip"] != nil, let r = PageDoc.Run(json: o) {
          let linksSource = sources.contains(r.href ?? ""), number = r.text.allSatisfy(\.isNumber)
          if r.isSourceMark { marks += 1; #expect(!numbered || linksSource, "\(r.text) in \(c["note"]!) links no source") }
          else { words += 1; #expect(!number, "\(r.text)") }
        }
        o.values.forEach(walk)
      } else if let a = v as? [Any] { a.forEach(walk) }
    }
    walk(page)
  }
  #expect(marks >= 2 && words >= 1, "marks \(marks), words \(words)")
}

@Test func aPageNamesWhereItsReadersCommentsAndPhotosAre() throws {
  let fish = try #require(cases("added").first { ($0["doc"] as? [String: Any])?["kind"] as? String == "fish" })
  #expect(try doc(fish["doc"]!).talk == .init(comments: "species:paracheirodon-axelrodi", photos: "species:paracheirodon-axelrodi"))
  let plant = try #require(cases("added").first { ($0["doc"] as? [String: Any])?["kind"] as? String == "plant" })
  #expect(try doc(plant["doc"]!).talk == .init(comments: "plant:cryptocoryne-wendtii", photos: nil))
  // Comments alone (a plant, a guide); neither, or a part this app can't read, is no section.
  var p = page([])
  p["talk"] = ["comments": "id:plant:rotala-rotundifolia"]
  #expect(try doc(p).talk == .init(comments: "id:plant:rotala-rotundifolia", photos: nil))
  for odd: Any in [[String: Any](), ["comments": 3], "species:x"] {
    p["talk"] = odd
    #expect(try doc(p).talk == nil)
  }
}

@Test func readersCommentsAndPhotosAreReadAsTheWorkerAnswersAndALooseEntryIsLeftOut() {
  let site = URL(string: "https://aquatome.com")!
  #expect(Readers.url(comments: "id:species:betta-splendens", site: site).absoluteString == "https://aquatome.com/_c?e=id:species:betta-splendens")
  #expect(Readers.url(photos: "species:betta-splendens", site: site).absoluteString == "https://aquatome.com/_p?e=species:betta-splendens")
  // Named as the app's, for the site's logs.
  #expect(Readers.request(site, version: "1.4").value(forHTTPHeaderField: "User-Agent") == "AquaTome-iOS/1.4")
  // apps/site/worker/comments/api.ts and photos.ts: their answers, with one entry each missing a part.
  let comments = Data(#"""
  {"comments":[{"id":"c1","name":"Lan","body":"Nuôi đàn 10 con.\n\nỔn.","helpful":true,"createdAt":"2026-10-30T18:30:00.000Z","author":"0f1e2d3c4b5a6978"},
               {"id":"c2","name":"Minh","helpful":false,"createdAt":"2026-10-31T01:00:00.000Z"},
               {"id":"c3","name":"Hà","body":"https://x.example","helpful":false,"createdAt":"2026-10-31T01:00:00Z"}],
   "sitekey":"k","verification":"none"}
  """#.utf8)
  let read = Readers.comments(comments)
  #expect(read.map(\.id) == ["c1", "c3"])
  #expect(read[0].helpful && read[0].body == "Nuôi đàn 10 con.\n\nỔn." && !read[1].helpful)
  // Who wrote it, when the Worker says (protocols/talk.openapi.json `author`); an older Worker's, nobody.
  #expect(read[0].author == "0f1e2d3c4b5a6978" && read[1].author == nil)
  let photos = Data(#"""
  {"photos":[{"id":"p1","name":"Lan","url":"https://media.aquatome.com/r/p1.webp","thumb":"https://media.aquatome.com/r/p1-t.webp","width":1600,"height":1200,"createdAt":"2026-10-30T18:30:00.000Z","author":"0f1e2d3c4b5a6978"},
             {"id":"p2","name":"Minh","url":"https://media.aquatome.com/r/p2.webp","width":0,"height":1200}]}
  """#.utf8)
  #expect(Readers.photos(photos) == [.init(id: "p1", name: "Lan", url: "https://media.aquatome.com/r/p1.webp", thumb: "https://media.aquatome.com/r/p1-t.webp", width: 1600, height: 1200,
                                            author: "0f1e2d3c4b5a6978")])
  #expect(Readers.comments(Data("off".utf8)).isEmpty && Readers.photos(Data(#"{"error":"bad entity"}"#.utf8)).isEmpty)
}

@Test func aCommentsDayIsTheSitesInEachLanguage() throws {
  // What apps/site/src/scripts/comments.ts's date() gives, from node's Intl: the day in Vietnam, Buddhist years in Thai.
  let days: [(String, [String])] = [
    ("2026-10-30T18:30:00.000Z", ["31/10/2026", "31/10/2026", "31/10/2569"]),
    ("2026-01-05T03:00:00.000Z", ["5/1/2026", "5/1/2026", "5/1/2569"]),
    ("2026-12-31T17:30:00.000Z", ["1/1/2027", "1/1/2027", "1/1/2570"]),
    // A time written at Vietnam's offset (late on the 31st there), and one without its milliseconds.
    ("2026-12-31T23:30:00.000+07:00", ["31/12/2026", "31/12/2026", "31/12/2569"]),
    ("2026-12-31T17:30:00Z", ["1/1/2027", "1/1/2027", "1/1/2570"]),
    ("2026-12-31T16:59:59.000Z", ["31/12/2026", "31/12/2026", "31/12/2569"]),
  ]
  for (iso, want) in days {
    let d = try #require(Readers.comments(Data(#"{"comments":[{"id":"c","name":"n","body":"b","createdAt":"\#(iso)"}]}"#.utf8)).first?.createdAt)
    #expect(["vi", "id", "th"].map { Readers.day(d, lang: $0) } == want, "\(iso)")
  }
}

@Test func aGalleryNamingAPhotoItLacksIsTheWebNotACrash() throws {
  let photo: [String: Any] = ["src": "https://x/1.jpg", "w": 4, "h": 3]
  let d = try doc(page([["t": "gallery", "title": "Ảnh", "note": "1 ảnh", "photos": [photo], "strip": [0, 3]]]))
  #expect(d.blocks.map(\.t) == ["web"])
}

/// An Unsplash photo's credit (protocols/page.schema.json `Credit`): the photographer's name as the line writes it, and
/// their page once the site's engine has it. Any other photo's credit is read as before; a name or a page that isn't
/// text is none, never a lost credit.
@Test func anUnsplashCreditIsReadWithItsPhotographerAndAnyOtherAsBefore() throws {
  let profile = "https://unsplash.com/@jane_doe_fixture?utm_source=aquatome&utm_medium=referral"
  func credit(_ c: [String: Any]) throws -> PageDoc.Image.Credit? {
    var p = page([])
    p["lead"] = ["src": "https://x/1.jpg", "w": 4, "h": 3, "credit": c] as [String: Any]
    return try doc(p).lead?.credit
  }
  let unsplash: [String: Any] = ["text": "Ảnh: Jane Doe trên Unsplash", "licence": "Unsplash License", "url": "https://unsplash.com/photos/abc", "author": "Jane Doe"]
  var c = try #require(try credit(unsplash.merging(["authorUrl": profile]) { a, _ in a }))
  #expect(c.text == "Ảnh: Jane Doe trên Unsplash" && c.licence == "Unsplash License" && c.url == "https://unsplash.com/photos/abc")
  #expect(c.author == "Jane Doe" && c.authorUrl == profile)
  // Before the engine has the photographer's page: the name alone.
  c = try #require(try credit(unsplash))
  #expect(c.author == "Jane Doe" && c.authorUrl == nil)
  c = try #require(try credit(["text": "Ảnh: Tác giả 1", "licence": "CC BY 4.0", "url": "https://x/p/1"]))
  #expect(c.text == "Ảnh: Tác giả 1" && c.licence == "CC BY 4.0" && c.url == "https://x/p/1" && c.author == nil && c.authorUrl == nil)
  c = try #require(try credit(["text": "Ảnh: Jane Doe trên Unsplash", "licence": "Unsplash License", "author": 3, "authorUrl": ["x"]]))
  #expect(c.text == "Ảnh: Jane Doe trên Unsplash" && c.author == nil && c.authorUrl == nil)
  // The first page the site sends with both (#535's breed page, the pigeon blood discus's lead in page-vectors.json): its
  // photographer named and linked, "Unsplash" Unsplash's home.
  let mai = "https://unsplash.com/@mailin?utm_source=aquatome&utm_medium=referral"
  c = try #require(try credit(["text": "Ảnh: Mai Lin trên Unsplash", "licence": "Unsplash License",
                               "url": "https://unsplash.com/photos/a-red-discus-fish-Pb1Fixture1?utm_source=aquatome&utm_medium=referral",
                               "authorUrl": mai, "author": "Mai Lin"]))
  #expect(c.author == "Mai Lin" && c.authorUrl == mai)
  #expect(pieces(c) == ["Ảnh: ", "Mai Lin → \(mai)", " trên ", "Unsplash → \(PageDoc.Image.Credit.unsplashHome)", " · Unsplash License"])
}

/// A credit's line in pieces, each with where it links (`text → link`).
private func pieces(_ c: PageDoc.Image.Credit, photo: Bool = true) -> [String] {
  c.parts(photo: photo).map { p in p.link.map { "\(p.text) → \($0)" } ?? p.text }
}

/// A credit's line as the site links it (apps/site/src/lib/unsplash.ts): an Unsplash photo's name linking the
/// photographer's page, else the photo's own, and "Unsplash" Unsplash's home with AquaTome's UTM, the rest unlinked, in
/// any language's line; a line that doesn't hold the name links the photo's own page and "Unsplash" still. A credit
/// without a name is one link to the photo's own page, licence and all, as before.
@Test func anUnsplashCreditsNameAndUnsplashAreLinksAndAnyOtherIsOneLink() {
  typealias Credit = PageDoc.Image.Credit
  let home = "https://unsplash.com/?utm_source=aquatome&utm_medium=referral"
  let profile = "https://unsplash.com/@jane_doe_fixture?utm_source=aquatome&utm_medium=referral"
  let photo = "https://unsplash.com/photos/abc"
  #expect(Credit.unsplashHome == home)
  let full = Credit(text: "Ảnh: Jane Doe trên Unsplash", licence: "Unsplash License", url: photo, author: "Jane Doe", authorUrl: profile)
  #expect(pieces(full) == ["Ảnh: ", "Jane Doe → \(profile)", " trên ", "Unsplash → \(home)", " · Unsplash License"])
  // In a list that links each photo's page by a number: the same, the photo's page not in it.
  #expect(pieces(full, photo: false) == pieces(full))
  // Until the site has the photographer's page, the name links the photo's; in such a list, nothing.
  let named = Credit(text: "Ảnh: Jane Doe trên Unsplash", licence: "Unsplash License", url: photo, author: "Jane Doe")
  #expect(pieces(named) == ["Ảnh: ", "Jane Doe → \(photo)", " trên ", "Unsplash → \(home)", " · Unsplash License"])
  #expect(pieces(named, photo: false) == ["Ảnh: ", "Jane Doe", " trên ", "Unsplash → \(home)", " · Unsplash License"])
  // The flowerhorn's gallery on the site (test/fixture-content/gallery/flowerhorn-cichlid.json): a photographer whose page
  // is known, and one whose isn't yet, unlinked in the gallery's list.
  let jo = "https://unsplash.com/@jopark?utm_source=aquatome&utm_medium=referral"
  #expect(pieces(Credit(text: "Ảnh: Jo Park trên Unsplash", licence: "Unsplash License", url: photo, author: "Jo Park", authorUrl: jo), photo: false)
          == ["Ảnh: ", "Jo Park → \(jo)", " trên ", "Unsplash → \(home)", " · Unsplash License"])
  #expect(pieces(Credit(text: "Ảnh: Sam Reyes trên Unsplash", licence: "Unsplash License", url: photo, author: "Sam Reyes"), photo: false)
          == ["Ảnh: ", "Sam Reyes", " trên ", "Unsplash → \(home)", " · Unsplash License"])
  // Another language's words around the name, and a name holding the word: "Unsplash" is the one outside it.
  let thai = Credit(text: "ภาพ: Jane Doe บน Unsplash", licence: "Unsplash License", url: photo, author: "Jane Doe", authorUrl: profile)
  #expect(pieces(thai) == ["ภาพ: ", "Jane Doe → \(profile)", " บน ", "Unsplash → \(home)", " · Unsplash License"])
  let fan = Credit(text: "Ảnh: Unsplash Fan trên Unsplash", licence: "Unsplash License", url: photo, author: "Unsplash Fan", authorUrl: profile)
  #expect(pieces(fan) == ["Ảnh: ", "Unsplash Fan → \(profile)", " trên ", "Unsplash → \(home)", " · Unsplash License"])
  // The name with other spaces than the line's (the site collapses the line's), and a name that is the line's first word.
  let spaced = Credit(text: "Ảnh: Jane Doe trên Unsplash", licence: "Unsplash License", url: photo, author: " Jane  Doe ", authorUrl: profile)
  #expect(pieces(spaced) == pieces(full))
  let word = Credit(text: "Foto: Foto di Unsplash", licence: "Unsplash License", url: photo, author: "Foto", authorUrl: profile)
  #expect(pieces(word) == ["Foto: ", "Foto → \(profile)", " di ", "Unsplash → \(home)", " · Unsplash License"])
  // A name the line doesn't hold, or an empty one: the line linking the photo's page as before, "Unsplash" still its home.
  let elsewhere = Credit(text: "Ảnh: Jane Doe trên Unsplash", licence: "Unsplash License", url: photo, author: "Janet Roe", authorUrl: profile)
  #expect(pieces(elsewhere) == ["Ảnh: Jane Doe trên  → \(photo)", "Unsplash → \(home)", " · Unsplash License"])
  let empty = Credit(text: "Ảnh: Jane Doe trên Unsplash", licence: "Unsplash License", url: photo, author: "")
  #expect(pieces(empty, photo: false) == ["Ảnh: Jane Doe trên ", "Unsplash → \(home)", " · Unsplash License"])
  // Without "Unsplash" in the line either: one link, as before.
  #expect(pieces(Credit(text: "Ảnh: Jane Doe", licence: "CC BY 4.0", url: photo, author: "")) == ["Ảnh: Jane Doe · CC BY 4.0 → \(photo)"])
  let other = Credit(text: "Ảnh: Tác giả 1", licence: "CC BY 4.0", url: "https://x/p/1")
  #expect(pieces(other) == ["Ảnh: Tác giả 1 · CC BY 4.0 → https://x/p/1"])
  #expect(pieces(other, photo: false) == ["Ảnh: Tác giả 1 · CC BY 4.0"])
  // A reader's photo: their name, no licence, no page.
  #expect(pieces(Credit(text: "Lan", licence: "", url: nil)) == ["Lan"])
}

@Test func readsEveryHtmlCasesBlocksAsWritten() throws {
  let html = cases("html")
  #expect(html.count >= 10)
  for c in html {
    let d = try doc(page(c["blocks"]!))
    #expect(same(d.blocks.map(json), c["blocks"]!), "\(c["note"]!)")
  }
}

@Test func findsAPagesShardAsTheSiteDoes() {
  let shards = cases("shards")
  #expect(shards.count >= 3)
  for c in shards {
    #expect(PageDoc.shard(of: c["path"] as! String, count: c["shards"] as! Int) == c["n"] as! Int, "\(c["path"]!)")
  }
}

@Test func aShardCountPast32BitsIsNoCrash() {
  // The index's `pages` is any whole number: one past the hash's 32 bits leaves every path in the shard it hashes to.
  let path = "/vi/huong-dan/nuoi-ca-neon/"
  let n = PageDoc.shard(of: path, count: 1 << 40)
  #expect(n == PageDoc.shard(of: path, count: 1 << 33))
  #expect(n >= 0 && n < 1 << 32)
}

@Test func aPageOfAnotherVersionIsNotReadAsThisOne() {
  var p = page([["t": "p", "c": ["Cá neon sống theo đàn."]]])
  p["v"] = 2
  #expect(PageDoc(data: try! JSONSerialization.data(withJSONObject: p)) == nil)
}

@Test func aShardKeepsThePagesItCanReadUnderTheirOwnPaths() throws {
  var newer = page([], path: "/vi/huong-dan/moi/")
  newer["v"] = 2
  let shard: [String: Any] = ["v": 1, "pages": [
    "/vi/huong-dan/a/": page([["t": "p", "c": ["Một."]]], path: "/vi/huong-dan/a/"),
    "/vi/huong-dan/moi/": newer,
    "/vi/huong-dan/khac/": page([], path: "/vi/huong-dan/b/"), // filed under another page's path
  ]]
  let s = try #require(PageShard(data: JSONSerialization.data(withJSONObject: shard)))
  #expect(Array(s.pages.keys) == ["/vi/huong-dan/a/"])
  #expect(same(try #require(s.pages["/vi/huong-dan/a/"]).blocks.map(json), [["t": "p", "c": ["Một."]]]))
  #expect(PageShard(data: try JSONSerialization.data(withJSONObject: ["v": 2, "pages": [:]] as [String: Any])) == nil)
}

@Test func theIndexSaysHowManyShardsOfPagesEachKindHasAndKeepsItInItsCopy() throws {
  let withPages = Data(#"{"version":1,"lang":"vi","items":[],"pages":{"guide":32,"fish":128}}"#.utf8)
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: withPages)
  #expect(ix.pages == ["guide": 32, "fish": 128])
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(ix)).pages == ix.pages)
  // From an older site, none; one this app can't read is none too, never the index.
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: sample).pages.isEmpty)
  let odd = Data(#"{"version":1,"lang":"vi","items":[{"kind":"tool","name":"Đèn Chihiros","path":"/vi/cong-cu/den-chihiros/"}],"pages":"many"}"#.utf8)
  let read = try JSONDecoder().decode(HandbookIndex.self, from: odd)
  #expect(read.pages.isEmpty && read.items.count == 1)
}

@Test func drawsTheKindsAtOrBelowItsLevelAsTheSitesCasesSay() throws {
  let levels = cases("levels")
  #expect(levels.count >= 3)
  for c in levels {
    let shards = try JSONDecoder().decode([String: HandbookIndex.Shards].self, from: JSONSerialization.data(withJSONObject: c["shards"]!))
    #expect(Set(HandbookIndex.drawn(shards, level: c["appLevel"] as! Int).keys) == Set(c["draws"] as! [String]), "\(c["note"]!)")
  }
  // This app draws fish, plants and glossary terms: level 2.
  #expect(PageDoc.level == 2)
}

@Test func theAppDrawsTheKindsTheIndexGivesItsLevelOrALowerOneAndKeepsTheRestOnTheWeb() throws {
  // `pages` stays guides only, for apps older than levels; `shards` gives each kind its level.
  let json = #"{"version":1,"lang":"vi","items":[],"pages":{"guide":32},"shards":{"guide":{"n":32,"level":1},"fish":{"n":128,"level":2},"plant":{"n":"x","level":2},"glossary":4,"breed":{"n":8,"level":3}}}"#
  let ix = try JSONDecoder().decode(HandbookIndex.self, from: Data(json.utf8))
  // A kind it can't read (plant's count, glossary not an entry at all) is left on the web, each on its own; one of a
  // later level too.
  #expect(ix.pages == ["guide": 32, "fish": 128])
  // The copy kept on the phone reads back the same.
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(ix)).pages == ix.pages)
  // A site with levels but none this app knows: nothing drawn, not its frozen `pages`.
  let later = #"{"version":1,"lang":"vi","items":[],"pages":{"guide":32},"shards":{"guide":{"n":32,"level":9}}}"#
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: Data(later.utf8)).pages.isEmpty)
}

@Test func aPagesPicturesAreTheLeadThenEachPhotoAndStillInTheText() throws {
  let img = { (src: String) in ["src": src, "w": 4, "h": 3] as [String: Any] }
  let blocks: [Any] = [
    ["t": "figure", "img": img("https://x/1.jpg")],
    ["t": "list", "items": [[["t": "figure", "img": img("https://x/2.jpg")]]]],
    ["t": "moments", "title": "Cảnh", "youtubeId": "abc", "items": [["at": 5, "img": img("https://x/3.jpg"), "caption": "c"]]],
    ["t": "p", "c": ["chữ"]],
  ]
  var p = page(blocks)
  p["lead"] = img("https://x/lead.jpg")
  #expect(try doc(p).pictures == ["https://x/lead.jpg", "https://x/1.jpg", "https://x/2.jpg", "https://x/3.jpg"])
  // A video guide shows its video's picture, not a lead photo.
  p["video"] = ["youtubeId": "abc", "title": "t", "channel": "c", "durationSec": 60]
  #expect(try doc(p).pictures.first == "https://i.ytimg.com/vi/abc/hqdefault.jpg")
  #expect(try doc(p).pictures.count == 4)
}

@Test func aFishPagesPicturesKeptForOfflineAreItsGalleryRowNotEveryPhotoAndItsMatesBreedsAndVideos() throws {
  let img = { (src: String) in ["src": src, "w": 4, "h": 3] as [String: Any] }
  let blocks: [Any] = [
    ["t": "gallery", "title": "Ảnh", "note": "3 ảnh", "strip": [2, 0],
     "photos": [img("https://x/g0.jpg").merging(["thumb": "https://x/g0-480.jpg"]) { a, _ in a }, img("https://x/g1.jpg"), img("https://x/g2.jpg")]],
    ["t": "mates", "title": "Nuôi chung", "tool": ["text": "Kiểm tra", "href": "/vi/cong-cu/nuoi-chung/"],
     "good": ["title": "Hợp với", "items": [["path": "/vi/ca/a/", "name": "A", "img": img("https://x/m.jpg").merging(["thumb": "https://x/m-160.jpg"]) { a, _ in a }],
                                              ["path": "/vi/ca/b/", "name": "B"]]]],
    ["t": "cards", "title": "Các dòng", "items": [["path": "/vi/ca/c/", "name": "C", "img": img("https://x/c.jpg")]]],
    ["t": "videos", "title": "Video", "items": [["youtubeId": "v1", "title": "V", "durationSec": 60, "lang": "EN"]]],
  ]
  // A card's small photo when it has one: the one it shows.
  #expect(try doc(page(blocks)).pictures == ["https://x/g2.jpg", "https://x/g0-480.jpg", "https://x/m-160.jpg", "https://x/c.jpg", "https://i.ytimg.com/vi/v1/hqdefault.jpg"])
}

@Test func aShelfIsKeptForOfflineOnWiFiAskedFirstOnMobileDataAndNotWithoutRoomOrNetwork() {
  let room: Int64 = 1 << 30
  #expect(KeepPlan.of(online: true, expensive: false, constrained: false, freeBytes: room) == .go)
  #expect(KeepPlan.of(online: true, expensive: true, constrained: false, freeBytes: room) == .ask)
  #expect(KeepPlan.of(online: true, expensive: false, constrained: true, freeBytes: room) == .ask, "Low Data Mode")
  #expect(KeepPlan.of(online: true, expensive: false, constrained: false, freeBytes: 100 << 20) == .noRoom)
  #expect(KeepPlan.of(online: true, expensive: true, constrained: false, freeBytes: 100 << 20) == .noRoom, "no room: not even asked")
  #expect(KeepPlan.of(online: true, expensive: false, constrained: false, freeBytes: nil) == .go, "room unknown")
  #expect(KeepPlan.of(online: false, expensive: false, constrained: false, freeBytes: room) == .offline)
}

@Test func onlyAVideoIdAsYouTubeGivesThemPlaysInThePage() {
  #expect(PageDoc.isYouTubeId("oHh1FU_k1jo"))
  #expect(PageDoc.isYouTubeId("abc123XYZ_-"))
  #expect(!PageDoc.isYouTubeId("neonVid_01"), "10 characters")
  #expect(!PageDoc.isYouTubeId("oHh1FU_k1jo1"), "12 characters")
  #expect(!PageDoc.isYouTubeId("//h1FU_k1jo"), "no link can be made of it")
  #expect(!PageDoc.isYouTubeId("<!--<script"), "markup in the player's page")
  #expect(!PageDoc.isYouTubeId("oHh1FU k1jo"), "a space")
  #expect(!PageDoc.isYouTubeId("oHh1FU_k1j\u{00F3}"), "a letter outside A–Z")
  #expect(!PageDoc.isYouTubeId(""))
}

@Test func aListOfPagesShowsWholeUpToThirtyAndTwelveBeyond() {
  #expect([0, 12, 30, 31, 1387].map(PageList.inPlace) == [0, 12, 30, 12, 12])
}
