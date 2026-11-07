import Foundation

/// A way into the app from outside it, to the site's page it names. The site's "Mở trong ứng dụng" button opens
/// `aquatome://open?url=<the page's address, percent-encoded>`; a bare `aquatome://` opens the app's home. The page's own
/// address (the Smart App Banner's `app-argument`) names it too.
public enum AppLink: Equatable, Sendable {
  /// The app's home: the Tìm tab, at its top. Also the site's home, in any of its languages.
  case home
  /// A page of the site: the app's own screen for it (AppScreen), else its web page in the app.
  case page(URL)

  /// What `url` asks for; nil for anything but `site`'s own pages over https (another site, another scheme or form, a
  /// name before the site's or a port after it), which the app ignores.
  public static func of(_ url: URL, site: URL) -> AppLink? {
    let named: URL
    switch url.scheme?.lowercased() {
    case "aquatome":
      guard let parts = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
      let host = parts.host?.lowercased() ?? ""
      if host.isEmpty && parts.path.isEmpty && parts.query == nil { return .home }
      guard host == "open", ["", "/"].contains(parts.path) else { return nil }
      guard let items = parts.queryItems, !items.isEmpty else { return .home }
      guard let value = items.first(where: { $0.name == "url" })?.value, let page = URL(string: value) else { return nil }
      named = page
    case "https":
      named = url
    default:
      return nil
    }
    guard ours(named, site) else { return nil }
    let home = ["", "/"] + SiteLanguage.served.flatMap { [$0.prefix, String($0.prefix.dropLast())] }
    return home.contains(named.path(percentEncoded: false)) && named.query == nil && named.fragment == nil ? .home : .page(named)
  }

  /// The only gate: a page opened from here is the site's to the app (PageBridge hands it the reader's tanks). The host
  /// as written: one spelled with escapes (`aquatome%2Ecom`) isn't taken for the site's.
  private static func ours(_ url: URL, _ site: URL) -> Bool {
    let host = url.host(percentEncoded: true)
    return url.scheme?.lowercased() == "https" && url.user == nil && url.password == nil && url.port == nil
      && bare(host) != nil && bare(host) == bare(site.host)
  }

  private static func bare(_ host: String?) -> String? {
    guard let h = host?.lowercased() else { return nil }
    return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
  }
}
