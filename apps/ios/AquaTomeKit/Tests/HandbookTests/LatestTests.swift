import Foundation
import Testing
@testable import Handbook

// What's new as the site writes it (apps/site/src/lib/app-latest.ts).
let latestJSON = Data(#"""
{"version":1,"lang":"vi","entries":[
 {"date":"2026-10-28","path":"/vi/ca/ca-neon/","action":"updated","source":"Seriously Fish"},
 {"date":"2026-10-27","path":"/vi/ca/khong-co/","action":"new","source":"Aquarium Glaser"},
 {"date":"2026-10-27","path":"/vi/huong-dan/nuoi-ca-neon/","action":"new","source":"2Hr Aquarist"},
 {"date":"2026-10-20","path":"/vi/ca/ca-neon/","action":"new","source":"Seriously Fish"},
 {"date":"2026-10-19","path":"/vi/ca/ca-dia/","action":"renamed","source":"Seriously Fish"}],
 "web":"/vi/moi-cap-nhat/"}
"""#.utf8)

@Test func whatsNewReadsAsTheSiteWritesIt() throws {
  let latest = try JSONDecoder().decode(Latest.self, from: latestJSON)
  #expect(latest.lang == "vi")
  #expect(latest.web == "/vi/moi-cap-nhat/")
  #expect(latest.entries.count == 5)
  let first = try #require(latest.entries.first)
  #expect(first == .init(date: "2026-10-28", path: "/vi/ca/ca-neon/", action: "updated", source: "Seriously Fish"))
  // The date as the site's list writes it.
  #expect(first.shown == "28/10/2026")
  // Another version is another format: not read as this one.
  let v2 = Data(String(decoding: latestJSON, as: UTF8.self).replacingOccurrences(of: #""version":1"#, with: #""version":2"#).utf8)
  #expect(throws: DecodingError.self) { try JSONDecoder().decode(Latest.self, from: v2) }
}

// Each entry with its page from the index, in the site's order: a page the index doesn't have left out, a page updated
// twice there twice, an action this app doesn't know with no word for it.
@Test func whatsNewListsTheIndexsPagesInTheSitesOrder() throws {
  let latest = try JSONDecoder().decode(Latest.self, from: latestJSON)
  let items = [HandbookIndex.Item(kind: .fish, name: "Cá neon", path: "/vi/ca/ca-neon/"),
               HandbookIndex.Item(kind: .fish, name: "Cá đĩa", path: "/vi/ca/ca-dia/"),
               HandbookIndex.Item(kind: .guide, name: "Nuôi cá neon", path: "/vi/huong-dan/nuoi-ca-neon/")]
  let byPath = Dictionary(uniqueKeysWithValues: items.map { ($0.path, $0) })
  let rows = latest.rows { byPath[$0] }
  #expect(rows.map(\.item.path) == ["/vi/ca/ca-neon/", "/vi/huong-dan/nuoi-ca-neon/", "/vi/ca/ca-neon/", "/vi/ca/ca-dia/"])
  #expect(rows.map(\.entry.date) == ["2026-10-28", "2026-10-27", "2026-10-20", "2026-10-19"])
  #expect(Set(rows.map(\.id)).count == rows.count)
  #expect(rows.map(\.entry.isNew) == [false, true, true, false])
  #expect(rows.map(\.entry.isUpdate) == [true, false, false, false])
}

// The index names the file where the site has what's new, and the copy kept on the phone keeps it.
@Test func theIndexNamesWhatsNewAndItsKeptCopyKeepsIt() throws {
  let named = try JSONDecoder().decode(HandbookIndex.self, from: Data(#"""
  {"version":1,"lang":"vi","items":[],"latest":"/app/latest/vi.json"}
  """#.utf8))
  #expect(named.latest == "/app/latest/vi.json")
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: JSONEncoder().encode(named)).latest == "/app/latest/vi.json")
  // A site without it, or a value this app can't read: none, the index still read.
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: Data(#"{"version":1,"lang":"id","items":[]}"#.utf8)).latest == nil)
  #expect(try JSONDecoder().decode(HandbookIndex.self, from: Data(#"{"version":1,"lang":"vi","items":[],"latest":7}"#.utf8)).latest == nil)
}

/// The site as the file sees it: what it answers, and what was asked.
private actor LatestSite {
  var answer: Result<Data, any Error>
  var asked: [String] = []
  init(_ answer: Result<Data, any Error>) { self.answer = answer }
  func set(_ a: Result<Data, any Error>) { answer = a }
  func get(_ url: URL) throws -> Data {
    asked.append(url.absoluteString)
    return try answer.get()
  }
}
private func latestFile(_ dir: URL, _ s: LatestSite) -> LatestFile {
  LatestFile(file: dir.appending(path: "latest-vi"), site: URL(string: "https://aquatome.com")!, fetch: { try await s.get($0) })
}
private func latestDir() throws -> URL {
  let dir = FileManager.default.temporaryDirectory.appending(path: "latest-\(UUID().uuidString)")
  try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
  return dir
}
private let path = "/app/latest/vi.json"

// Read where the index says, and kept: the next launch shows it offline, and no failed read loses it.
@Test func whatsNewIsKeptSoItShowsOffline() async throws {
  let dir = try latestDir()
  let want = try JSONDecoder().decode(Latest.self, from: latestJSON)
  let online = LatestSite(.success(latestJSON))
  #expect(latestFile(dir, online).kept() == nil)
  #expect(await latestFile(dir, online).read(path) == .read(want))
  #expect(await online.asked == ["https://aquatome.com/app/latest/vi.json"])
  let offline = LatestSite(.failure(URLError(.notConnectedToInternet)))
  #expect(latestFile(dir, offline).kept() == want)
  #expect(await latestFile(dir, offline).read(path) == .failed)
  #expect(latestFile(dir, offline).kept() == want)
}

// An answer this app can't read (a newer format, an error page) reads as failed and leaves the kept copy as it was.
@Test func whatsNewUnreadableLeavesTheKeptCopy() async throws {
  let dir = try latestDir()
  let want = try JSONDecoder().decode(Latest.self, from: latestJSON)
  let site = LatestSite(.success(latestJSON))
  _ = await latestFile(dir, site).read(path)
  let v2 = Data(String(decoding: latestJSON, as: UTF8.self).replacingOccurrences(of: #""version":1"#, with: #""version":2"#).utf8)
  for answer in [v2, Data("<html>".utf8)] {
    await site.set(.success(answer))
    #expect(await latestFile(dir, site).read(path) == .failed)
    #expect(latestFile(dir, site).kept() == want)
  }
}

// An index naming none: the site has no such list, so nothing is asked and nothing kept.
@Test func anIndexNamingNoWhatsNewEndsTheList() async throws {
  let dir = try latestDir()
  let site = LatestSite(.success(latestJSON))
  _ = await latestFile(dir, site).read(path)
  #expect(latestFile(dir, site).kept() != nil)
  let asked = await site.asked.count
  #expect(await latestFile(dir, site).read(nil) == .noList)
  #expect(await site.asked.count == asked)
  #expect(latestFile(dir, site).kept() == nil)
}

// Left for another tab before it came: told apart from a failure, so the tab reads it again when it shows.
@Test func whatsNewCutOffIsToBeReadAgain() async throws {
  let dir = try latestDir()
  let site = LatestSite(.success(latestJSON))
  _ = await latestFile(dir, site).read(path)
  for cut in [URLError(.cancelled), CancellationError()] as [any Error] {
    await site.set(.failure(cut))
    #expect(await latestFile(dir, site).read(path) == .interrupted)
    #expect(latestFile(dir, site).kept() != nil)
  }
}
