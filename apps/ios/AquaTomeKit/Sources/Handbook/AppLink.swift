import Foundation

/// A way into the app from outside it, to the site's page it names. The site's "Mở trong ứng dụng" button opens
/// `aquatome://open?url=<the page's address, percent-encoded>`; a bare `aquatome://` opens the app's home. The page's own
/// address (the Smart App Banner's `app-argument`, a universal link) names it too.
public enum AppLink: Equatable, Sendable {
  /// The app's home: the Tìm tab, at its top.
  case home
  /// A page of the site: the app's own screen for it (AppScreen), else its web page in the app.
  case page(URL)

  /// What `url` asks for; nil for anything but `site`'s own pages over https (another site, another scheme or form, a
  /// name or port before the site's), which the app ignores.
  public static func of(_ url: URL, site: URL) -> AppLink? {
    switch url.scheme?.lowercased() {
    case "aquatome":
      guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
      let host = parts.host?.lowercased() ?? ""
      if host.isEmpty && parts.path.isEmpty && parts.query == nil { return .home }
      guard host == "open", parts.path.isEmpty else { return nil }
      guard let items = parts.queryItems, !items.isEmpty else { return .home }
      guard let named = items.first(where: { $0.name == "url" })?.value, let page = URL(string: named) else { return nil }
      return ours(page, site) ? .page(page) : nil
    case "https":
      return ours(url, site) ? .page(url) : nil
    default:
      return nil
    }
  }

  private static func ours(_ url: URL, _ site: URL) -> Bool {
    url.scheme?.lowercased() == "https" && url.user == nil && url.password == nil && url.port == nil
      && bare(url.host) != nil && bare(url.host) == bare(site.host)
  }

  private static func bare(_ host: String?) -> String? {
    guard let h = host?.lowercased() else { return nil }
    return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
  }
}
