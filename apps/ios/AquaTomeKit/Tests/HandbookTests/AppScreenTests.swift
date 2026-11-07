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

@Test func theTankVolumeToolInEachLanguageOpensTheAppsScreenWithWhatItsLinkSets() {
  #expect(screen("https://aquatome.com/vi/cong-cu/the-tich-be/") == .tankVolume(nil))
  #expect(screen("https://www.aquatome.com/vi/cong-cu/the-tich-be") == .tankVolume(nil))
  #expect(screen("https://aquatome.com/id/alat/volume-akuarium/") == .tankVolume(nil))
  #expect(screen("https://aquatome.com/th/tools/tank-volume/#faq-h") == .tankVolume(nil))
  // The page keeps its state in its address (a row of its table, a result shared): the screen opens set to it.
  #expect(screen("https://aquatome.com/vi/cong-cu/the-tich-be/?hinh=chu-nhat&l=60&w=30&h=36") == .tankVolume("hinh=chu-nhat&l=60&w=30&h=36"))
  #expect(screen("https://aquatome.com/vi/cong-cu/the-tich-be/?") == .tankVolume(nil))
  // Whatever the index lists, it's the tool's screen, not a page of the handbook.
  #expect(AppScreen.of(URL(string: "https://aquatome.com/vi/cong-cu/the-tich-be/")!, site: site, listed: { _ in true }) == .tankVolume(nil))
  #expect(screen("https://aquatome.com/vi/cong-cu/the-tich-be/khac/") == nil)
}

@Test func theTankMatesToolInEachLanguageOpensTheAppsScreenSetAsItsLinkSets() {
  #expect(screen("https://aquatome.com/vi/cong-cu/nuoi-chung/") == .tankMates(nil))
  #expect(screen("https://www.aquatome.com/vi/cong-cu/nuoi-chung") == .tankMates(nil))
  #expect(screen("https://aquatome.com/id/alat/kecocokan-ikan/") == .tankMates(nil))
  #expect(screen("https://aquatome.com/th/tools/tank-mates/#mat-do") == .tankMates(nil))
  // A fish page's link sets the tool to the fish; a shared result, to its fish and tank. In each language.
  #expect(screen("https://aquatome.com/vi/cong-cu/nuoi-chung/?ca=ca-neon:6") == .tankMates("ca=ca-neon:6"))
  #expect(screen("https://aquatome.com/id/alat/kecocokan-ikan/?ca=neon-tetra:6,discus:2&l=60&w=30&h=36") == .tankMates("ca=neon-tetra:6,discus:2&l=60&w=30&h=36"))
  #expect(screen("https://aquatome.com/th/tools/tank-mates/?ca=pla-neon") == .tankMates("ca=pla-neon"))
  #expect(screen("https://aquatome.com/vi/cong-cu/nuoi-chung/?") == .tankMates(nil))
  // Whatever the index lists (the search's tool item), it's the tool's screen, not a page of the handbook.
  #expect(AppScreen.of(URL(string: "https://aquatome.com/vi/cong-cu/nuoi-chung/")!, site: site, listed: { _ in true }) == .tankMates(nil))
  #expect(AppScreen.of(URL(string: "https://aquatome.com/vi/cong-cu/nuoi-chung/?ca=ca-neon:6")!, site: site, listed: { _ in true }) == .tankMates("ca=ca-neon:6"))
  #expect(screen("https://aquatome.com/vi/cong-cu/nuoi-chung/khac/") == nil)
  #expect(screen("https://example.com/vi/cong-cu/nuoi-chung/?ca=ca-neon:6") == nil)
  // At the site's root, as its own links give it.
  #expect(screen("https://aquatome.com/cong-cu/nuoi-chung/?ca=ca-neon:6") == .tankMates("ca=ca-neon:6"))
}

/// A link to the tank-mates tool naming fish in another language than the index's: the web page, which knows their
/// names; the tool alone, or set only to a tank, is the app's screen in any language.
@Test func theTankMatesToolsFishInAnotherLanguageAreTheWebPage() {
  let of = { (s: String, lang: String) in AppScreen.of(URL(string: s)!, site: site, lang: lang) }
  #expect(of("https://aquatome.com/id/alat/kecocokan-ikan/?ca=neon-tetra:6", "vi") == nil)
  #expect(of("https://aquatome.com/id/alat/kecocokan-ikan/?ca=neon-tetra:6", "id") == .tankMates("ca=neon-tetra:6"))
  #expect(of("https://aquatome.com/cong-cu/nuoi-chung/?ca=ca-neon:6", "th") == nil)
  #expect(of("https://aquatome.com/cong-cu/nuoi-chung/?ca=ca-neon:6", "vi") == .tankMates("ca=ca-neon:6"))
  #expect(of("https://aquatome.com/th/tools/tank-mates/", "vi") == .tankMates(nil))
  #expect(of("https://aquatome.com/id/alat/kecocokan-ikan/?l=60&w=30&h=36", "vi") == .tankMates("l=60&w=30&h=36"))
  #expect(of("https://aquatome.com/id/alat/kecocokan-ikan/?ca=", "vi") == .tankMates("ca="))
}

@Test func otherPagesAndOtherSitesStayPages() {
  #expect(screen("https://aquatome.com/vi/cong-cu/du-toan-be/") == nil)
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
  // A link asking for more than the page (the tools page set to a tank, as the volume tool's heater link) is the web
  // page, query and all: not the bare page.
  let tool = { (s: String) in AppScreen.of(URL(string: s)!, site: site, listed: { $0 == "/vi/cong-cu/" }) }
  #expect(tool("https://aquatome.com/vi/cong-cu/") == .page("/vi/cong-cu/"))
  #expect(tool("https://aquatome.com/vi/cong-cu/?l=60&w=30&h=36") == nil)
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
  #expect(group("https://aquatome.com/th/groups/catfish/page/2/") == .group("catfish"))
  // A group the app has no fish of, a segment of another language, or a link asking for more: the web page.
  #expect(group("https://aquatome.com/vi/nhom/killifish/") == nil)
  #expect(group("https://aquatome.com/vi/groups/catfish/") == nil)
  #expect(group("https://aquatome.com/th/groups/catfish/trang/2/") == nil)
  #expect(group("https://aquatome.com/vi/nhom/catfish/?sort=size") == nil)
  #expect(group("https://aquatome.com/vi/nhom/") == nil)
  #expect(group("https://aquatome.com/vi/nhom/catfish/khac/") == nil)
  // Without what the app has (a web page's own links), as before.
  #expect(screen("https://aquatome.com/vi/nhom/catfish/") == nil)
}

@Test func aVietnamesePageAtTheRootOpensTheSameScreen() {
  // The site without "/vi": the tools, a group and its numbered pages, and a page the index lists in either form.
  #expect(screen("https://aquatome.com/cong-cu/be-cua-toi/#be-t1") == .tanks("t1"))
  #expect(screen("https://www.aquatome.com/cong-cu/be-cua-toi") == .tanks(nil))
  #expect(screen("https://aquatome.com/cong-cu/den-chihiros/") == .lights)
  let hasGroup: (String) -> Bool = { $0 == "catfish" }
  let group = { (s: String) in AppScreen.of(URL(string: s)!, site: site, group: hasGroup) }
  #expect(group("https://aquatome.com/nhom/catfish/") == .group("catfish"))
  #expect(group("https://aquatome.com/nhom/catfish/trang/2/") == .group("catfish"))
  #expect(group("https://aquatome.com/nhom/catfish/?sort=size") == nil)
  #expect(group("https://aquatome.com/nhom/killifish/") == nil)
  #expect(group("https://aquatome.com/groups/catfish/") == nil)
  // The index's paths in the root form, a link in either: `listed` is asked with the link's path, for the app to put
  // in the index's form (HandbookModel.item(at:)).
  let index: Set = ["/ca/ca-neon/", "/cong-cu/du-toan-be/"]
  let page = { (s: String) in AppScreen.of(URL(string: s)!, site: site, listed: { index.contains(PathForm.atRoot.path($0)) }) }
  #expect(page("https://aquatome.com/ca/ca-neon/") == .page("/ca/ca-neon/"))
  #expect(page("https://aquatome.com/vi/ca/ca-neon") == .page("/vi/ca/ca-neon/"))
  #expect(page("https://aquatome.com/cong-cu/du-toan-be/") == .page("/cong-cu/du-toan-be/"))
  #expect(page("https://aquatome.com/cong-cu/du-toan-be/?be=60") == nil)
  #expect(page("https://aquatome.com/vi/cong-cu/du-toan-be/?be=60") == nil)
  // Not Vietnamese pages: the other languages' tools at the root, the app's data, a shop link.
  #expect(screen("https://aquatome.com/alat/akuarium-saya/") == nil)
  #expect(page("https://aquatome.com/app/vi.json") == nil)
  #expect(page("https://aquatome.com/go/shopee/1") == nil)
}

@Test func theFishIDToolInEachLanguageOpensTheAppsOwnScreen() {
  #expect(screen("https://aquatome.com/vi/cong-cu/nhan-dien-ca/") == .fishId)
  #expect(screen("https://aquatome.com/id/alat/kenali-ikan/") == .fishId)
  #expect(screen("https://www.aquatome.com/th/tools/fish-id") == .fishId)
  #expect(screen("https://example.com/vi/cong-cu/nhan-dien-ca/") == nil)
}

/// Vietnamese at the site's root, as its pages link and as it is served (apps/site/src/lib/i18n.ts): the same screens as
/// its /vi/ form, and a page found in the index in whichever form the index lists it.
@Test func aVietnamesePageAtTheSitesRootOpensAsItsViFormDoes() {
  #expect(screen("https://aquatome.com/cong-cu/be-cua-toi/#be-t1") == .tanks("t1"))
  #expect(screen("https://www.aquatome.com/cong-cu/be-cua-toi") == .tanks(nil))
  #expect(screen("https://aquatome.com/cong-cu/den-chihiros/") == .lights)
  #expect(screen("https://aquatome.com/cong-cu/nhan-dien-ca/") == .fishId)
  let hasGroup: (String) -> Bool = { $0 == "catfish" }
  #expect(AppScreen.of(URL(string: "https://aquatome.com/nhom/catfish/trang/2/")!, site: site, group: hasGroup) == .group("catfish"))
  // The index's /vi/ form today, its root form once the site moves it.
  let vi = { (s: String) in AppScreen.of(URL(string: s)!, site: site, listed: { $0 == "/vi/ca/ca-neon/" }) }
  #expect(vi("https://aquatome.com/ca/ca-neon/") == .page("/vi/ca/ca-neon/"))
  #expect(vi("https://aquatome.com/ca/ca-neon") == .page("/vi/ca/ca-neon/"))
  let atRoot = { (s: String) in AppScreen.of(URL(string: s)!, site: site, listed: { $0 == "/ca/ca-neon/" }) }
  #expect(atRoot("https://aquatome.com/ca/ca-neon/") == .page("/ca/ca-neon/"))
  #expect(atRoot("https://aquatome.com/vi/ca/ca-neon/") == .page("/ca/ca-neon/"))
  // Another language's pages keep their own form; the site's home and its other pages aren't the app's.
  #expect(AppScreen.of(URL(string: "https://aquatome.com/id/ca/ca-neon/")!, site: site, listed: { $0 == "/vi/ca/ca-neon/" }) == nil)
  #expect(vi("https://aquatome.com/") == nil)
  #expect(vi("https://aquatome.com/go/shopee/abc") == nil)
  #expect(screen("https://aquatome.com/nhom/catfish/") == nil)
}
