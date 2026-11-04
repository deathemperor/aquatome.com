import Foundation

/// Where the site keeps its Vietnamese pages: under "/vi/" ("/vi/ca/ca-neon/"), as it first did, or at the root
/// ("/ca/ca-neon/"), "/vi/…" sent there. Indonesian and Thai pages stay under "/id/" and "/th/". The app index's own
/// paths say which form it's in, and the app puts every page path it matches, hashes or keeps into that form first:
/// a link, a kept list or a page from before the change finds its page in either.
public enum PathForm: String, Sendable {
  case underVi = "vi"
  case atRoot = "root"

  /// The form of the index's Vietnamese pages; nil when it has none (an Indonesian or Thai index, or an empty one).
  public init?(_ index: HandbookIndex) {
    guard let p = index.items.lazy.map(\.path).first(where: { Self.bare($0) != nil }) else { return nil }
    self = p.hasPrefix("/vi/") ? .underVi : .atRoot
  }

  /// `path` (a path on the site, with its query and fragment if it has them) in this form: a Vietnamese page's moved
  /// under "/vi/" or out from under it, the home's too ("/vi/" and "/"); any other path (an Indonesian or Thai page, the
  /// app's data, a shop link, a file) as it is.
  public func path(_ path: String) -> String {
    let end = path.firstIndex(where: { $0 == "?" || $0 == "#" }) ?? path.endIndex
    guard let bare = Self.bare(String(path[..<end])) else { return path }
    return (self == .atRoot ? bare : "/vi" + bare) + path[end...]
  }

  /// A list of paths kept on the phone (the reading list, the pages kept for offline) in this form, in order: a page
  /// listed in both forms is listed once, where it came first.
  public func paths(_ paths: [String]) -> [String] {
    var seen: Set<String> = []
    return paths.map(path).filter { seen.insert($0).inserted }
  }

  /// `url` with its path in this form when it's on `site` (www. or not); any other address as it is.
  public func url(_ url: URL, site: URL) -> URL {
    func host(_ u: URL) -> String? {
      guard let h = u.host?.lowercased() else { return nil }
      return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
    }
    guard host(url) == host(site), var c = URLComponents(url: url, resolvingAgainstBaseURL: true) else { return url }
    let moved = path(c.percentEncodedPath)
    guard moved != c.percentEncodedPath else { return url }
    c.percentEncodedPath = moved
    return c.url ?? url
  }

  /// The first parts of the site's paths that aren't Vietnamese pages at the root: the other languages, the app's data,
  /// shop links, the API, the data downloads and the site search's index. Those starting with "_" (the Worker's comments
  /// and photos) or holding a "." (robots.txt, .well-known) aren't either.
  private static let other: Set<Substring> = ["id", "th", "app", "go", "api", "data", "pagefind", "cdn-cgi"]

  /// A Vietnamese page's path without its "/vi" ("/ca/ca-neon/"; "/" for the home); nil for any other path.
  private static func bare(_ path: String) -> String? {
    guard path.hasPrefix("/") else { return nil }
    if path == "/vi" { return "/" }
    if path.hasPrefix("/vi/") { return String(path.dropFirst(3)) }
    let first = path.dropFirst().prefix { $0 != "/" }
    if other.contains(first) || first.hasPrefix("_") || first.contains(".") { return nil }
    return path
  }
}
