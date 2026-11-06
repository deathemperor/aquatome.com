import Foundation
import Testing
@testable import Handbook

@Test func aVietnamesePageMovesOutFromUnderViAndBack() {
  #expect(PathForm.atRoot.path("/vi/ca/ca-neon-vua/") == "/ca/ca-neon-vua/")
  #expect(PathForm.underVi.path("/ca/ca-neon-vua/") == "/vi/ca/ca-neon-vua/")
  // Already in the form: as it is.
  #expect(PathForm.atRoot.path("/ca/ca-neon-vua/") == "/ca/ca-neon-vua/")
  #expect(PathForm.underVi.path("/vi/ca/ca-neon-vua/") == "/vi/ca/ca-neon-vua/")
  // Without its trailing slash, as a link may leave it off; the home.
  #expect(PathForm.atRoot.path("/vi/ca/ca-neon") == "/ca/ca-neon")
  #expect(PathForm.underVi.path("/ca/ca-neon") == "/vi/ca/ca-neon")
  #expect(PathForm.atRoot.path("/vi/") == "/" && PathForm.atRoot.path("/vi") == "/")
  #expect(PathForm.underVi.path("/") == "/vi/")
}

@Test func theQueryAndFragmentStayAsTheyAre() {
  #expect(PathForm.atRoot.path("/vi/cong-cu/nuoi-chung/?ca=ca-neon:6") == "/cong-cu/nuoi-chung/?ca=ca-neon:6")
  #expect(PathForm.underVi.path("/cong-cu/nuoi-chung/?ca=ca-neon:6") == "/vi/cong-cu/nuoi-chung/?ca=ca-neon:6")
  #expect(PathForm.atRoot.path("/vi/cong-cu/be-cua-toi/#be-t1") == "/cong-cu/be-cua-toi/#be-t1")
  #expect(PathForm.underVi.path("/cong-cu/be-cua-toi/#be-t1") == "/vi/cong-cu/be-cua-toi/#be-t1")
  // A "/vi/" further on is the query's, not the path's.
  #expect(PathForm.underVi.path("/?next=/vi/x") == "/vi/?next=/vi/x")
}

@Test func otherLanguagesAndPathsThatArentPagesStayAsTheyAre() {
  for p in ["/id/ikan/neon/", "/th/fish/neon/", "/id/", "/th", "/app/vi.json", "/app/pages/vi/guide-0.json", "/go/shopee/123",
            "/api/fish-id", "/data/vi/species.json", "/pagefind/pagefind.js",
            "/media/a/neon.webp", "/sitemap/", "/sitemap.xml", "/admin/", "/404/", "/unknown/x/", "/_c?e=species:x", "/_p", "/robots.txt", "/.well-known/apple-app-site-association",
            "", "https://aquatome.com/vi/ca/ca-neon/", "ca/ca-neon/"] {
    #expect(PathForm.atRoot.path(p) == p, "\(p)")
    #expect(PathForm.underVi.path(p) == p, "\(p)")
  }
  // Only a whole first part is the language: "/video/" is a Vietnamese page, not "/vi/deo/".
  #expect(PathForm.atRoot.path("/video/reu-hai/") == "/video/reu-hai/")
  #expect(PathForm.underVi.path("/video/reu-hai/") == "/vi/video/reu-hai/")
}

@Test func theIndexSaysWhichFormItsVietnamesePagesAreIn() {
  let item = { (p: String) in HandbookIndex.Item(kind: .fish, name: p, path: p) }
  #expect(PathForm(HandbookIndex(lang: "vi", items: [item("/vi/ca/ca-neon/")])) == .underVi)
  #expect(PathForm(HandbookIndex(lang: "vi", items: [item("/ca/ca-neon/")])) == .atRoot)
  // An Indonesian or Thai index, or an empty one, says nothing.
  #expect(PathForm(HandbookIndex(lang: "id", items: [item("/id/ikan/neon/")])) == nil)
  #expect(PathForm(HandbookIndex(lang: "th", items: [item("/th/fish/neon/")])) == nil)
  #expect(PathForm(HandbookIndex(lang: "vi", items: [])) == nil)
}

@Test func anAddressOnTheSiteMovesItsPathOnly() {
  let site = URL(string: "https://aquatome.com")!
  let url = { (s: String, f: PathForm) in f.url(URL(string: s)!, site: site).absoluteString }
  #expect(url("https://aquatome.com/ca/ca-neon/", .underVi) == "https://aquatome.com/vi/ca/ca-neon/")
  #expect(url("https://www.aquatome.com/vi/ca/ca-neon/?a=1#b", .atRoot) == "https://www.aquatome.com/ca/ca-neon/?a=1#b")
  // Unchanged: already in the form, another language, another site.
  #expect(url("https://aquatome.com/vi/ca/ca-neon/", .underVi) == "https://aquatome.com/vi/ca/ca-neon/")
  #expect(url("https://aquatome.com/id/ikan/neon/", .underVi) == "https://aquatome.com/id/ikan/neon/")
  #expect(url("https://example.com/ca/ca-neon/", .underVi) == "https://example.com/ca/ca-neon/")
}
