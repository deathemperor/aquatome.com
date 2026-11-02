import Foundation
import ImageIO
import UniformTypeIdentifiers

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

  /// The request for one of those, named as the app's (`AquaTome-iOS/<version>`): the site's logs tell its reads from
  /// the web page's.
  public static func request(_ url: URL, version: String) -> URLRequest {
    var r = URLRequest(url: url)
    r.setValue("AquaTome-iOS/\(version)", forHTTPHeaderField: "User-Agent")
    return r
  }

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

  // Posting from the app (protocols/talk.openapi.json): as the reader's account, `Authorization: Bearer`, in place of the
  // page's Origin and Turnstile token.

  /// A comment to post on the page `key` names.
  public static func post(comment key: String, name: String, body: String, site: URL, token: String, version: String) -> URLRequest {
    var r = posting(site.appending(path: "_c"), token: token, version: version)
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    r.httpBody = try? JSONSerialization.data(withJSONObject: ["e": key, "name": name, "body": body], options: [.sortedKeys])
    return r
  }

  /// A reader's photo of the page's species (`jpeg`: shrunk, with no location or camera data), with their consent.
  public static func post(photo key: String, name: String, jpeg: Data, site: URL, token: String, version: String, boundary: String = UUID().uuidString) -> URLRequest {
    var r = posting(site.appending(path: "_p"), token: token, version: version)
    r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    var body = Data()
    func part(_ field: String, _ value: Data, file: Bool = false) {
      body += Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(field)\"\(file ? "; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg" : "")\r\n\r\n".utf8)
      body += value + Data("\r\n".utf8)
    }
    part("e", Data(key.utf8))
    part("name", Data(name.utf8))
    part("consent", Data("1".utf8))
    part("file", jpeg, file: true)
    body += Data("--\(boundary)--\r\n".utf8)
    r.httpBody = body
    return r
  }

  /// A photo as the app sends it, as the site's form does (apps/site/src/scripts/reader-photos.ts): at most `maxSide`
  /// pixels, upright, a JPEG written anew, so none of the original's data (its GPS position, the camera) goes with it.
  public static func shrink(_ photo: Data, maxSide: Int = 2000) -> Data? {
    guard let source = CGImageSourceCreateWithData(photo as CFData, nil),
          let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: maxSide] as CFDictionary) else { return nil }
    let out = NSMutableData()
    guard let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: 0.88] as CFDictionary)
    return CGImageDestinationFinalize(dest) ? out as Data : nil
  }

  private static func posting(_ url: URL, token: String, version: String) -> URLRequest {
    var r = request(url, version: version)
    r.httpMethod = "POST"
    r.httpShouldHandleCookies = false
    r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    return r
  }

  /// What became of a post.
  public enum Answer: Sendable, Equatable {
    /// A comment shown at once, as it shows.
    case shown(Comment)
    /// A comment held for moderation.
    case held
    /// A photo received, to be moderated before it shows.
    case received
    /// The account's session is over: the reader signs in again.
    case signedOut
    /// Refused, with the site's code for why (`rate`, `bad name`, `too large`, …); `failed` with none.
    case refused(String)
  }

  /// The Worker's answer to a post, by its status and body.
  public static func answer(_ data: Data, status: Int) -> Answer {
    let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    if status == 201 {
      switch o?["status"] as? String {
      case "approved":
        let shown = (o?["comment"]).flatMap { try? JSONSerialization.data(withJSONObject: ["comments": [$0]]) }.flatMap { comments($0).first }
        return shown.map(Answer.shown) ?? .held
      case "held": return .held
      case "pending": return .received
      default: return .refused("failed")
      }
    }
    let code = o?["error"] as? String
    return status == 401 && code == "session" ? .signedOut : .refused(code ?? "failed")
  }

  /// The Worker's times (`toISOString()`), with or without the milliseconds, in UTC or at an offset.
  static func date(_ s: String) -> Date? {
    (try? Date(s, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))) ?? (try? Date(s, strategy: .iso8601))
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
