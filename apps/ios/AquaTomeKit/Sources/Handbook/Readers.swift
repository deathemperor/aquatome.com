import Foundation

/// A page's readers' own comments and photos, read from the site's Worker as its web page reads them (`GET /_c?e=<key>`,
/// `GET /_p?e=<key>`, apps/site/worker), by the keys the page names (PageDoc.Talk).
public enum Readers {
  public struct Comment: Sendable, Equatable {
    public let id: String
    public let name: String
    /// Plain text, paragraphs apart by a blank line: a link in it stays text, as on the site.
    public let body: String
    /// Marked "Trả lời hay" on the site.
    public let helpful: Bool
    public let createdAt: Date
  }

  public struct Photo: Sendable, Equatable {
    public let id: String
    public let name: String
    public let url: String
    public let thumb: String
    public let width: Int
    public let height: Int
  }

  /// Where the comments, or readers' photos, of the page `key` names are on `site`.
  public static func url(comments key: String, site: URL) -> URL { url("_c", key, site) }
  public static func url(photos key: String, site: URL) -> URL { url("_p", key, site) }

  private static func url(_ path: String, _ key: String, _ site: URL) -> URL {
    var c = URLComponents(url: site.appending(path: path), resolvingAgainstBaseURL: false)!
    c.queryItems = [URLQueryItem(name: "e", value: key)]
    return c.url!
  }

  /// The Worker's answers, read leniently: an entry missing a part is left out, not the others; an answer that isn't one
  /// is none.
  public static func comments(_ data: Data) -> [Comment] {
    entries(data, "comments").compactMap { o in
      guard let id = o["id"] as? String, let name = o["name"] as? String, let body = o["body"] as? String,
            let at = (o["createdAt"] as? String).flatMap(date) else { return nil }
      return Comment(id: id, name: name, body: body, helpful: o["helpful"] as? Bool ?? false, createdAt: at)
    }
  }

  public static func photos(_ data: Data) -> [Photo] {
    entries(data, "photos").compactMap { o in
      guard let id = o["id"] as? String, let name = o["name"] as? String, let url = o["url"] as? String, let thumb = o["thumb"] as? String,
            let w = o["width"] as? Int, let h = o["height"] as? Int, w > 0, h > 0 else { return nil }
      return Photo(id: id, name: name, url: url, thumb: thumb, width: w, height: h)
    }
  }

  private static func entries(_ data: Data, _ key: String) -> [[String: Any]] {
    (((try? JSONSerialization.jsonObject(with: data)) as? [String: Any])?[key] as? [Any] ?? []).compactMap { $0 as? [String: Any] }
  }

  /// The Worker's times (`toISOString()`), with or without the milliseconds.
  static func date(_ s: String) -> Date? {
    (try? Date(s, strategy: .iso8601.year().month().day().time(includingFractionalSeconds: true))) ?? (try? Date(s, strategy: .iso8601))
  }

  /// The day a comment was written, as the site writes it: the day in Vietnam, in figures, in the page's language (Thai
  /// counting Buddhist-era years, as the site's browsers do).
  public static func day(_ d: Date, lang: String) -> String {
    var c = Calendar(identifier: lang == "th" ? .buddhist : .gregorian)
    c.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    let p = c.dateComponents([.day, .month, .year], from: d)
    return "\(p.day!)/\(p.month!)/\(p.year!)"
  }
}
