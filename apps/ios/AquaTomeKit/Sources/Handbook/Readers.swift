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
    /// Who wrote it, opaque: the same for everything one account posts; nil from a Worker that doesn't say.
    public let author: String?
  }

  public struct Photo: Sendable, Equatable {
    public let id: String
    public let name: String
    public let url: String
    public let thumb: String
    public let width: Int
    public let height: Int
    /// Who sent it, as a comment's `author`.
    public let author: String?
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
      return Comment(id: id, name: name, body: body, helpful: o["helpful"] as? Bool ?? false, createdAt: at, author: o["author"] as? String)
    }
  }

  public static func photos(_ data: Data) -> [Photo] {
    entries(data, "photos").compactMap { o in
      guard let id = o["id"] as? String, let name = o["name"] as? String, let url = o["url"] as? String, let thumb = o["thumb"] as? String,
            let w = o["width"] as? Int, let h = o["height"] as? Int, w > 0, h > 0 else { return nil }
      return Photo(id: id, name: name, url: url, thumb: thumb, width: w, height: h, author: o["author"] as? String)
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

  /// A reader's photo of the page's species (`jpeg`: shrunk, with no location or camera data), with their consent if they
  /// gave it (the site's form sends its box's `1` only when it's ticked).
  public static func post(photo key: String, name: String, consent: Bool, jpeg: Data, site: URL, token: String, version: String,
                          boundary: String = UUID().uuidString) -> URLRequest {
    var r = posting(site.appending(path: "_p"), token: token, version: version)
    r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    var body = Data()
    func part(_ field: String, _ value: Data, file: Bool = false) {
      body += Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(field)\"\(file ? "; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg" : "")\r\n\r\n".utf8)
      body += value + Data("\r\n".utf8)
    }
    part("e", Data(key.utf8))
    part("name", Data(name.utf8))
    if consent { part("consent", Data("1".utf8)) }
    part("file", jpeg, file: true)
    body += Data("--\(boundary)--\r\n".utf8)
    r.httpBody = body
    return r
  }

  /// A photo as the app sends it, as the site's form does (apps/site/src/scripts/reader-photos.ts): at most `maxSide`
  /// pixels, upright, a JPEG written anew, so none of the original's data (its GPS position, the camera) goes with it.
  /// With `region` (0…1 of the upright photo), only that part, cut from the photo at full size and then shrunk, as the
  /// site's fish-ID tool cuts the fish a reader boxed.
  public static func shrink(_ photo: Data, maxSide: Int = 2000, quality: Double = 0.88, region: CGRect? = nil) -> Data? {
    guard let source = CGImageSourceCreateWithData(photo as CFData, nil) else { return nil }
    var size = maxSide
    let part = region?.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
    if let part {
      // Read only as large as the part needs, not a phone's tens of megapixels.
      guard !part.isEmpty, let (w, h) = uprightSize(source) else { return nil }
      let long = max(part.width * w, part.height * h, 1)
      size = Int((max(w, h) * min(1, Double(maxSide) / long)).rounded(.up))
    }
    guard var image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: size] as CFDictionary) else { return nil }
    if let part {
      let w = Double(image.width), h = Double(image.height)
      let cut = CGRect(x: part.minX * w, y: part.minY * h, width: part.width * w, height: part.height * h).integral
        .intersection(CGRect(x: 0, y: 0, width: w, height: h))
      guard let piece = image.cropping(to: cut) else { return nil }
      image = piece
      // Rounding can leave it a pixel or two over.
      if max(image.width, image.height) > maxSide {
        guard let fitted = fit(image, maxSide) else { return nil }
        image = fitted
      }
    }
    let out = NSMutableData()
    guard let dest = CGImageDestinationCreateWithData(out, UTType.jpeg.identifier as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(dest, image, [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary)
    return CGImageDestinationFinalize(dest) ? out as Data : nil
  }

  /// A smaller picture for sending with an owner report.
  public static func shrinkForReport(_ photo: Data) -> Data? { shrink(photo, maxSide: 2000, quality: 0.7) }

  /// The photo's width and height as it shows, turned by its orientation.
  private static func uprightSize(_ source: CGImageSource) -> (Double, Double)? {
    guard let p = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
          let w = (p[kCGImagePropertyPixelWidth] as? NSNumber)?.doubleValue, let h = (p[kCGImagePropertyPixelHeight] as? NSNumber)?.doubleValue
    else { return nil }
    // Orientations 5 to 8 turn it a quarter.
    return ((p[kCGImagePropertyOrientation] as? NSNumber)?.intValue ?? 1) >= 5 ? (h, w) : (w, h)
  }

  private static func fit(_ image: CGImage, _ maxSide: Int) -> CGImage? {
    let k = Double(maxSide) / Double(max(image.width, image.height))
    let w = max(1, Int((Double(image.width) * k).rounded())), h = max(1, Int((Double(image.height) * k).rounded()))
    guard let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return nil }
    ctx.interpolationQuality = .high
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    return ctx.makeImage()
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
    /// A photo received, to be moderated before it shows, with the path that takes it back (`deleteUrl`, given once).
    case received(delete: String?)
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
      case "pending": return .received(delete: o?["deleteUrl"] as? String)
      default: return .refused("failed")
      }
    }
    let code = o?["error"] as? String
    return status == 401 && code == "session" ? .signedOut : .refused(code ?? "failed")
  }

  // Reporting (POST /api/v1/report): a reader's comment or photo, to moderation, which takes it off public pages at once.

  /// A report of the comment or photo `id` (`kind`: "comment" or "photo"), with the reader's reason if they gave one: as
  /// the account when signed in (`token`), else as the site's own page sends it (same-origin).
  public static func report(_ kind: String, id: String, reason: String?, site: URL, token: String?, version: String) -> URLRequest {
    var r = request(site.appending(path: "api/v1/report"), version: version)
    r.httpMethod = "POST"
    r.httpShouldHandleCookies = false
    if let token {
      r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    } else {
      r.setValue(site.absoluteString.trimmingCharacters(in: ["/"]), forHTTPHeaderField: "Origin")
    }
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    r.httpBody = try? JSONSerialization.data(withJSONObject: ["kind": kind, "id": id].merging(reason.map { ["reason": $0] } ?? [:]) { a, _ in a },
                                             options: [.sortedKeys])
    return r
  }

  /// What became of a report: received (also one sent before, or of an item already gone from public pages), the
  /// account's session over, or refused with the site's code (`rate`, `bad report`, …; `failed` with none).
  public enum Reported: Sendable, Equatable {
    case received, signedOut
    case refused(String)
  }

  public static func reported(_ data: Data, status: Int) -> Reported {
    let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    if status == 202 && o?["status"] as? String == "received" { return .received }
    let code = o?["error"] as? String
    // Not public any more: taken off by another report, or removed. The reader's wish is met. Only the report's own
    // answer: another 404 (no such path, accounts off, a proxy's page) is a report that went nowhere.
    if status == 404 && code == "not found" { return .received }
    return status == 401 && code == "session" ? .signedOut : .refused(code ?? "failed")
  }

  /// What the reader blocks to hide a comment's or photo's poster on their phone: its `author`, or, from a Worker that
  /// doesn't say, that one post.
  public static func blockKey(author: String?, id: String) -> String { author ?? "post:\(id)" }

  /// Whether a block's `key` hides the post `id` by `author`: its poster's, or that one post's, kept by a block made
  /// before the site said who posted it (the same post then carries an `author` the key isn't).
  public static func blocks(_ key: String, author: String?, id: String) -> Bool { key == author || key == "post:\(id)" }

  /// The Worker's code for a comment it refuses unread (apps/site/worker/comments/rules.ts parseComment), or nil: a name
  /// of 1–40 and a comment of 2–2000, trimmed, counted as JavaScript counts them (UTF-16 units).
  public static func refusal(comment name: String, body: String) -> String? {
    if !(1...40).contains(trimmed(name).utf16.count) { return "name must be 1–40 characters" }
    if !(2...2000).contains(trimmed(body).utf16.count) { return "comment must be 2–2000 characters" }
    return nil
  }

  /// The Worker's code for a photo's name it refuses (apps/site/worker/photos.ts), or nil: 1–40, trimmed, in UTF-16
  /// units, with no "<" (which holds a comment). The Worker's other rules (links, blocked words) it says itself.
  public static func refusal(photoName name: String) -> String? {
    let t = trimmed(name)
    return (1...40).contains(t.utf16.count) && !t.contains("<") ? nil : "bad name"
  }

  private static func trimmed(_ s: String) -> String { s.trimmingCharacters(in: .whitespacesAndNewlines) }

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
