import Foundation
import Testing
@testable import Handbook

// protocols/unlisted-vectors.json: which page a tank's entry without a page is shown as, the cases the site's tests run
// on packages/schema/src/unlisted.ts.
private struct Vectors: Decodable {
  struct Key: Decodable { let note: String; let `in`: String; let key: String }
  struct Page: Decodable { let kind: String; let id: String; let sci: String?; let synonyms: [String]? }
  struct Match: Decodable { let note: String; let kind: String; let sci: String?; let page: String? }
  let sciKey: [Key]
  let pages: [Page]
  let match: [Match]
}
private let vectors: Vectors = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSONDecoder().decode(Vectors.self, from: Data(contentsOf: url.appendingPathComponent("protocols/unlisted-vectors.json")))
}()

@Test func comparesScientificNamesAsTheSite() {
  #expect(!vectors.sciKey.isEmpty)
  for c in vectors.sciKey { #expect(PageMatcher.sciKey(c.in) == c.key, Comment(rawValue: c.note)) }
}

@Test func matchesTheSamePageAsTheSite() {
  #expect(vectors.match.count > 10)
  let m = PageMatcher(vectors.pages.map { .init(kind: $0.kind, id: $0.id, sci: $0.sci, synonyms: $0.synonyms ?? []) })
  for c in vectors.match { #expect(m.page(kind: c.kind, sci: c.sci) == c.page, Comment(rawValue: c.note)) }
}

@Test func readsTheIndexAsTheSitesPageDoes() {
  // The index gives a page's scientific name as `sub`, and a plant's former names among its other names (aka).
  let m = PageMatcher(index: [
    .init(kind: .fish, contentId: "corydoras-sterbai", name: "Cá chuột sterbai", sub: "Corydoras sterbai", aka: ["Corydoras haraldschultzi"], path: "/vi/ca/a/"),
    .init(kind: .fish, contentId: "betta-halfmoon", name: "Betta halfmoon", aka: ["Betta splendens"], path: "/vi/ca/b/"),
    .init(kind: .plant, contentId: "microsorum-pteropus", name: "Dương xỉ Java", sub: "Microsorum pteropus",
          aka: ["Leptochilus pteropus", "Java fern", "dương xỉ java"], path: "/vi/cay/c/"),
    .init(kind: .guide, name: "Corydoras sterbai", sub: "Corydoras sterbai", path: "/vi/huong-dan/d/"),
  ])
  #expect(m.page(kind: "fish", sci: "corydoras sterbai") == "corydoras-sterbai")
  #expect(m.page(kind: "plant", sci: "Leptochilus pteropus") == "microsorum-pteropus")
  // Read like a scientific name (a capital, then a word in lower case), as the site reads them: other names are too.
  #expect(m.page(kind: "plant", sci: "Java fern") == "microsorum-pteropus")
  #expect(m.page(kind: "plant", sci: "dương xỉ java") == nil, "a name that doesn't read like a scientific one")
  #expect(m.page(kind: "fish", sci: "Corydoras haraldschultzi") == nil, "a fish's other names are never its former ones")
  #expect(m.page(kind: "fish", sci: "Betta splendens") == nil, "a breed has no scientific name of its own")
  #expect(m.page(kind: "guide", sci: "Corydoras sterbai") == nil, "only fish and plants")
}
