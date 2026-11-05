import Foundation

/// The site's pages that the app has as its own screens. In the app, a link to one (the tools' "Xem trong Bể của tôi →"
/// after a save, the site's menus) opens the screen, not the web page.
public enum AppScreen: Equatable, Sendable {
  /// "Bể của tôi", showing the tank the link names (`#be-<id>`, as the site's page marks each tank), if any.
  case tanks(String?)
  /// The Chihiros light page: the app's Lights tab.
  case lights
  /// The fish-ID tool: the app's own screen for it, which asks as the reader's account.
  case fishId
  /// A page the app index lists, by its path ("/vi/ca/ca-neon/"): the app's screen for it, on the tab in front.
  case page(String)
  /// A group's page ("/vi/nhom/catfish/", and its numbered pages): the app's shelf of that group's fish.
  case group(String)

  /// The screen `url` is, if it's one of these pages on `site`, in any of the site's languages; with `listed` (whether
  /// the app index has a path), also any other page the index lists; with `group` (whether the app has fish of a
  /// group), also those groups' pages.
  public static func of(_ url: URL, site: URL, listed: (String) -> Bool = { _ in false }, group: (String) -> Bool = { _ in false }) -> AppScreen? {
    guard ["http", "https"].contains(url.scheme?.lowercased() ?? ""), bare(url.host) == bare(site.host) else { return nil }
    switch url.pathComponents.filter({ $0 != "/" }).joined(separator: "/") {
    // apps/site/src/lib/i18n.ts: the tools section and each page's segment in each language.
    case "vi/cong-cu/be-cua-toi", "id/alat/akuarium-saya", "th/tools/my-tanks":
      let id = url.fragment(percentEncoded: false).flatMap { $0.hasPrefix("be-") ? String($0.dropFirst(3)) : nil }
      return .tanks(id?.isEmpty == false ? id : nil)
    case "vi/cong-cu/den-chihiros", "id/alat/lampu-chihiros", "th/tools/chihiros-light":
      return .lights
    case "vi/cong-cu/nhan-dien-ca", "id/alat/kenali-ikan", "th/tools/fish-id":
      return .fishId
    default:
      // A link asking for more than the page (the tank-mates tool set to a fish, `?ca=ca-neon:6`) isn't the page as the
      // app shows it: the web takes it whole.
      guard url.query == nil else { return nil }
      if let g = Self.group(url.pathComponents.filter { $0 != "/" }), group(g) { return .group(g) }
      // The index's paths end in "/", as the site's pages do; a link may leave it off.
      let path = url.path(percentEncoded: false)
      let page = path.hasSuffix("/") ? path : path + "/"
      return listed(page) ? .page(page) : nil
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
