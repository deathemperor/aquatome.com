import Foundation

/// The site's pages that the app has as its own screens, and the app's Tài khoản sheet, which no page is. In the app, a
/// link to one of the pages (the tools' "Xem trong Bể của tôi →" after a save, the site's menus) opens the screen, not
/// the web page.
public enum AppScreen: Equatable, Sendable {
  /// "Bể của tôi", showing the tank the link names (`#be-<id>`, as the site's page marks each tank), if any.
  case tanks(String?)
  /// The Chihiros light page: the app's Lights tab.
  case lights
  /// The tank volume tool, with the state its link gives (`hinh=tru&d=40&h=50`, as the site's page keeps it in its
  /// address), if any: the app's own screen, on the tab in front.
  case tankVolume(String?)
  /// The fish-ID tool: the app's own screen for it, which asks as the reader's account.
  case fishId
  /// The tank-mates tool, with the fish and tank its link sets (`ca=ca-neon:6&l=60&w=30&h=36`, TankMatesLink), if any:
  /// the app's own screen, on the tab in front.
  case tankMates(String?)
  /// A page the app index lists, by its path ("/vi/ca/ca-neon/"): the app's screen for it, on the tab in front.
  case page(String)
  /// A group's page ("/vi/nhom/catfish/", and its numbered pages): the app's shelf of that group's fish.
  case group(String)
  /// The app's Tài khoản sheet (the profile button's), which no page of the site is: the empty "Bể của tôi" opens it to
  /// sign in.
  case account

  /// The screen `url` is, if it's one of these pages on `site`, in any of the site's languages (Vietnamese under "/vi/"
  /// or at the root, PathForm); with `listed` (whether the app index has a path, as the link gives it), also any other
  /// page the index lists; with `group` (whether the app has fish of a group), also those groups' pages. `lang`: the
  /// index's language, whose pages' names a link to the tank-mates tool must use to set its fish.
  public static func of(_ url: URL, site: URL, lang: String? = nil, listed: (String) -> Bool = { _ in false },
                        group: (String) -> Bool = { _ in false }) -> AppScreen? {
    guard ["http", "https"].contains(url.scheme?.lowercased() ?? ""), bare(url.host) == bare(site.host) else { return nil }
    // The site's Vietnamese is at its root ("/ca/ca-neon/"), and its old /vi/ form still leads there (PathForm): matched
    // as the /vi/ form.
    let parts = PathForm.underVi.path(url.path(percentEncoded: false)).split(separator: "/").map(String.init)
    switch parts.joined(separator: "/") {
    // apps/site/src/lib/i18n.ts: the tools section and each page's segment in each language.
    case "vi/cong-cu/be-cua-toi", "id/alat/akuarium-saya", "th/tools/my-tanks":
      let id = url.fragment(percentEncoded: false).flatMap { $0.hasPrefix("be-") ? String($0.dropFirst(3)) : nil }
      return .tanks(id?.isEmpty == false ? id : nil)
    case "vi/cong-cu/den-chihiros", "id/alat/lampu-chihiros", "th/tools/chihiros-light":
      return .lights
    case "vi/cong-cu/the-tich-be", "id/alat/volume-akuarium", "th/tools/tank-volume":
      return .tankVolume(url.query(percentEncoded: true).flatMap { $0.isEmpty ? nil : $0 })
    case "vi/cong-cu/nhan-dien-ca", "id/alat/kenali-ikan", "th/tools/fish-id":
      return .fishId
    case "vi/cong-cu/nuoi-chung", "id/alat/kecocokan-ikan", "th/tools/tank-mates":
      // Its fish are named by their pages' names in the link's language ("neon-tetra" in Indonesian, "ca-neon" in
      // Vietnamese): a link that names fish in another language than the index's is the web page, which knows them.
      let fish = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.contains { $0.name == "ca" && $0.value?.isEmpty == false }
      if let lang, parts.first != lang, fish == true { return nil }
      return .tankMates(url.query(percentEncoded: true).flatMap { $0.isEmpty ? nil : $0 })
    default:
      // A link asking for more than the page (the tools page set to a tank, `?l=60&w=30&h=36`) isn't the page as the app
      // shows it: the web takes it whole.
      guard url.query == nil else { return nil }
      if let g = Self.group(parts), group(g) { return .group(g) }
      // The index's paths end in "/", as the site's pages do; a link may leave it off. The page as the index lists it, in
      // whichever form.
      let path = url.path(percentEncoded: false)
      let page = path.hasSuffix("/") ? path : path + "/"
      let other = [PathForm.underVi.path(page), PathForm.atRoot.path(page)].first { $0 != page }
      if listed(page) { return .page(page) }
      return other.flatMap { listed($0) ? .page($0) : nil }
    }
  }

  /// The group a path names: ["vi", "nhom", "catfish"], or one of its numbered pages (…, "trang", "2").
  private static func group(_ parts: [String]) -> String? {
    // apps/site/src/lib/i18n.ts: the groups' section, and a list's numbered pages, in each language.
    let words = ["vi": ("nhom", "trang"), "id": ("kelompok", "halaman"), "th": ("groups", "page")]
    guard parts.count == 3 || parts.count == 5, let (section, page) = words[parts[0]], parts[1] == section else { return nil }
    guard parts.count == 3 || (parts[3] == page && Int(parts[4]) != nil) else { return nil }
    return parts[2]
  }

  private static func bare(_ host: String?) -> String? {
    guard let h = host?.lowercased() else { return nil }
    return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
  }
}
