import Foundation
import Testing
@testable import Handbook

private let site = URL(string: "https://aquatome.com")!
private func screen(_ s: String) -> AppScreen? { AppScreen.of(URL(string: s)!, site: site) }

@Test func theToolsLinkAfterASaveOpensThatTank() {
  // apps/site/src/scripts/save-to-tank.ts: `${cpath('/vi/cong-cu/be-cua-toi/')}#be-${tank.id}`
  #expect(screen("https://aquatome.com/vi/cong-cu/be-cua-toi/#be-3f2a9c1e-0d4b-4e8a-9b7c-1a2b3c4d5e6f") == .tanks("3f2a9c1e-0d4b-4e8a-9b7c-1a2b3c4d5e6f"))
  #expect(screen("https://aquatome.com/id/alat/akuarium-saya/#be-t1") == .tanks("t1"))
  #expect(screen("https://www.aquatome.com/th/tools/my-tanks/#be-t1") == .tanks("t1"))
}

@Test func theTanksPageWithoutATankOpensTheList() {
  #expect(screen("https://aquatome.com/vi/cong-cu/be-cua-toi/") == .tanks(nil))
  #expect(screen("https://aquatome.com/vi/cong-cu/be-cua-toi") == .tanks(nil))
  #expect(screen("https://aquatome.com/vi/cong-cu/be-cua-toi/#mt-add") == .tanks(nil))
  #expect(screen("https://aquatome.com/vi/cong-cu/be-cua-toi/#be-") == .tanks(nil))
}

@Test func theChihirosPageInEachLanguageOpensTheLightsTab() {
  #expect(screen("https://aquatome.com/vi/cong-cu/den-chihiros/") == .lights)
  #expect(screen("https://aquatome.com/id/alat/lampu-chihiros/") == .lights)
  #expect(screen("https://aquatome.com/th/tools/chihiros-light/") == .lights)
}

@Test func otherPagesAndOtherSitesStayPages() {
  #expect(screen("https://aquatome.com/vi/cong-cu/nuoi-chung/") == nil)
  #expect(screen("https://aquatome.com/vi/ca/ca-neon/") == nil)
  #expect(screen("https://aquatome.com/vi/cong-cu/be-cua-toi/khac/") == nil)
  #expect(screen("https://example.com/vi/cong-cu/be-cua-toi/") == nil)
  #expect(screen("mailto:hi@aquatome.com") == nil)
}

@Test func aLinkToAPageTheIndexListsOpensTheAppsScreenForIt() {
  let listed: (String) -> Bool = { ["/vi/ca/ca-neon/", "/vi/huong-dan/nuoi-ca-neon/"].contains($0) }
  let page = { (s: String) in AppScreen.of(URL(string: s)!, site: site, listed: listed) }
  #expect(page("https://aquatome.com/vi/ca/ca-neon/") == .page("/vi/ca/ca-neon/"))
  #expect(page("https://www.aquatome.com/vi/ca/ca-neon") == .page("/vi/ca/ca-neon/"))
  #expect(page("https://aquatome.com/vi/huong-dan/nuoi-ca-neon/#cham-soc") == .page("/vi/huong-dan/nuoi-ca-neon/"))
  // One the index leaves out, or on another site, stays a web page; the tools stay their tabs.
  #expect(page("https://aquatome.com/vi/ca/ca-mong/") == nil)
  #expect(page("https://example.com/vi/ca/ca-neon/") == nil)
  #expect(page("https://aquatome.com/vi/cong-cu/den-chihiros/") == .lights)
  // A link asking for more than the page (a tool set to a fish) is the web page, query and all: not the bare page.
  let tool = { (s: String) in AppScreen.of(URL(string: s)!, site: site, listed: { $0 == "/vi/cong-cu/nuoi-chung/" }) }
  #expect(tool("https://aquatome.com/vi/cong-cu/nuoi-chung/") == .page("/vi/cong-cu/nuoi-chung/"))
  #expect(tool("https://aquatome.com/vi/cong-cu/nuoi-chung/?ca=ca-neon:6") == nil)
  // Without the index (a web page's own links), as before.
  #expect(screen("https://aquatome.com/vi/ca/ca-neon/") == nil)
}

@Test func aLinkToAGroupTheAppHasOpensItsShelfInEachLanguage() {
  // apps/site/src/lib/i18n.ts: nhom, kelompok, groups; a group's numbered pages are the same shelf.
  let hasGroup: (String) -> Bool = { ["catfish", "tetras"].contains($0) }
  let group = { (s: String) in AppScreen.of(URL(string: s)!, site: site, group: hasGroup) }
  #expect(group("https://aquatome.com/vi/nhom/catfish/") == .group("catfish"))
  #expect(group("https://www.aquatome.com/vi/nhom/tetras") == .group("tetras"))
  #expect(group("https://aquatome.com/id/kelompok/catfish/") == .group("catfish"))
  #expect(group("https://aquatome.com/th/groups/catfish/") == .group("catfish"))
  #expect(group("https://aquatome.com/vi/nhom/catfish/trang/2/") == .group("catfish"))
  #expect(group("https://aquatome.com/id/kelompok/catfish/halaman/3/") == .group("catfish"))
  // A group the app has no fish of, a segment of another language, or a link asking for more: the web page.
  #expect(group("https://aquatome.com/vi/nhom/killifish/") == nil)
  #expect(group("https://aquatome.com/vi/groups/catfish/") == nil)
  #expect(group("https://aquatome.com/vi/nhom/catfish/?sort=size") == nil)
  #expect(group("https://aquatome.com/vi/nhom/") == nil)
  #expect(group("https://aquatome.com/vi/nhom/catfish/khac/") == nil)
  // Without what the app has (a web page's own links), as before.
  #expect(screen("https://aquatome.com/vi/nhom/catfish/") == nil)
}
