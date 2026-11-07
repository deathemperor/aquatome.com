import Foundation
import Testing
@testable import Handbook

/// A file of the site's, from the repository's root.
private func site(_ path: String) throws -> String {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() } // the file, HandbookTests, Tests, AquaTomeKit, ios, apps
  return try String(contentsOf: url.appending(path: path), encoding: .utf8)
}

/// packages/schema/src/langs.ts's rows: each one's code, whether the site serves it, and its own name.
private func siteRows() throws -> [(code: String, served: Bool, name: String)] {
  try site("packages/schema/src/langs.ts").split(separator: "\n").compactMap { line in
    line.firstMatch(of: /^  ([a-z][a-zA-Z-]*): \{ served: (true|false), .*\bname: '([^']+)'/).map { (String($0.1), $0.2 == "true", String($0.3)) }
  }
}

/// apps/site/src/lib/i18n.ts's words for the Vietnamese segments, SECTIONS' and SUB's, by language.
private func siteWords() throws -> [String: [String: String]] {
  let text = try site("apps/site/src/lib/i18n.ts")
  var words: [String: [String: String]] = [:]
  for table in ["const SECTIONS", "const SUB"] {
    let start = try #require(text.range(of: table)).upperBound
    let body = try #require(text[start...].range(of: "= {\n")).upperBound
    let end = try #require(text[body...].range(of: "\n}\n")).lowerBound
    var lang: String?
    for line in text[body..<end].split(separator: "\n") {
      if let m = line.firstMatch(of: /^  ([a-z][a-zA-Z-]*): \{/) { lang = String(m.1) }
      guard let lang else { continue }
      for m in line.matches(of: /'?([a-z][a-z-]*)'?: '([^']*)'/) { words[lang, default: [:]][String(m.1)] = String(m.2) }
    }
  }
  return words
}

@Test func theLanguagesAreTheSitesRowsAndTheAppOffersNoneTheSiteDoesNot() throws {
  let rows = try siteRows()
  #expect(rows.map(\.code).prefix(3) == ["vi", "id", "th"], "\(rows)")
  // Every row of the app's is the site's, in its order, with its own name.
  #expect(SiteLanguage.all.map(\.code) == Array(rows.map(\.code).prefix(SiteLanguage.all.count)))
  for l in SiteLanguage.all {
    let row = try #require(rows.first { $0.code == l.code }, "\(l.code)")
    #expect(l.name == row.name, "\(l.code)")
    // A language the site doesn't serve has no pages for the app to show.
    if l.served { #expect(row.served, "\(l.code) is offered, and the site doesn't serve it") }
  }
  #expect(SiteLanguage.served.first == .vietnamese)
}

@Test func eachServedLanguagesWordsAreTheSites() throws {
  let words = try siteWords()
  #expect(words["id"]?["cong-cu"] == "alat" && words["th"]?["trang"] == "page", "\(words)")
  for l in SiteLanguage.served where l != .vietnamese {
    #expect(!l.words.isEmpty, "\(l.code)")
    for (vi, word) in l.words { #expect(words[l.code]?[vi] == word, "\(l.code): \(vi)") }
  }
  #expect(SiteLanguage.vietnamese.words.isEmpty)
}

@Test func theAppsLanguageIsTheOneIOSChoseIfOfferedElseVietnamese() {
  #expect(SiteLanguage.of(["th"]).code == "th")
  #expect(SiteLanguage.of(["id-ID", "th"]).code == "id")
  #expect(SiteLanguage.of(["ms", "id"]).code == "vi", "Malay isn't offered yet")
  #expect(SiteLanguage.of(["en"]).code == "vi")
  #expect(SiteLanguage.of([]).code == "vi")
}

@Test func aPathsLanguageAndAPageInALanguage() {
  #expect(SiteLanguage.of(path: "/id/ikan/neon/")?.code == "id")
  #expect(SiteLanguage.of(path: "/ms/ikan/neon/") == nil, "not offered")
  #expect(SiteLanguage.of(path: "/ca/ca-neon/") == nil)
  #expect(SiteLanguage.served("th")?.path("cong-cu") == "/th/tools/")
  #expect(SiteLanguage.vietnamese.path("cong-cu", "nuoi-chung") == "/vi/cong-cu/nuoi-chung/")
}
