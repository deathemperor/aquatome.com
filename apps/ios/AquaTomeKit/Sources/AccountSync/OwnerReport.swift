import Foundation

/// What the owner was looking at when they sent a report (protocols/owner-feedback.openapi.json `Where`): names and ids
/// the app knows, never text read from a screen, which the Worker checks field by field.
public struct OwnerReportPlace: Sendable, Equatable {
  public var screen: String?
  /// The page of the site it shows, by its path as the index gives it ("/vi/ca/x/").
  public var path: String?
  public var lang: String?
  public var version: String?
  public var theme: String?
  public var textSize: String?
  public var device: String?
  public var viewport: String?

  public init(screen: String? = nil, path: String? = nil, lang: String? = nil, version: String? = nil, theme: String? = nil,
              textSize: String? = nil, device: String? = nil, viewport: String? = nil) {
    self.screen = screen
    self.path = path
    self.lang = lang
    self.version = version
    self.theme = theme
    self.textSize = textSize
    self.device = device
    self.viewport = viewport
  }

  /// What each section of the site's pages holds, by its folder.
  private static let kinds = [
    "ca": "fish", "cay": "plant", "huong-dan": "guide", "thuat-ngu": "glossary", "video": "video", "thiet-bi": "equipment",
    "ikan": "fish", "fish": "fish", "tanaman": "plant", "plant": "plant",
  ]

  /// The kind and id of the page at a path, when it's one of the site's kinds; a language's prefix doesn't count.
  public static func item(of path: String?) -> (kind: String, id: String)? {
    guard var parts = path?.split(separator: "/").map(String.init), !parts.isEmpty else { return nil }
    if ["vi", "id", "th", "ms"].contains(parts[0]) { parts.removeFirst() }
    guard parts.count >= 2, let kind = kinds[parts[0]] else { return nil }
    return (kind, parts[parts.count - 1])
  }

  /// As the report's `where` has it, with its address on the site.
  func fields(site: URL) -> [String: String] {
    var o = ["source": "app"]
    o["screen"] = screen
    if let path, let url = URL(string: path, relativeTo: site)?.absoluteURL { o["url"] = url.absoluteString }
    if let item = Self.item(of: path) {
      o["kind"] = item.kind
      o["item"] = item.id
    }
    o["lang"] = lang
    o["version"] = version
    o["theme"] = theme
    o["textSize"] = textSize
    o["device"] = device
    o["viewport"] = viewport
    return o
  }
}

extension OwnerClient {
  /// Sends a report: the owner's words and the screenshot, as a form, with this app's session. Answers how many wait for
  /// the Mac, this one too: more than one means it hasn't collected lately. Throws as the rest of the owner's client does,
  /// and nothing is kept here: a failed report stays on the sheet.
  public func report(words: String, place: OwnerReportPlace, jpeg: Data?) async throws -> Int {
    let boundary = "aquatome-\(UUID().uuidString)"
    var r = URLRequest(url: base.appending(path: "api/feedback"))
    r.httpMethod = "POST"
    r.httpShouldHandleCookies = false
    r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    let report = try JSONSerialization.data(withJSONObject: ["words": words, "where": place.fields(site: base)], options: [.sortedKeys])
    var body = Data()
    body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"report\"\r\n\r\n".utf8))
    body.append(report)
    if let jpeg {
      body.append(Data("\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"image\"; filename=\"screenshot.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8))
      body.append(jpeg)
    }
    body.append(Data("\r\n--\(boundary)--\r\n".utf8))
    r.httpBody = body

    let data: Data, res: HTTPURLResponse
    do { (data, res) = try await send(r) } catch let e as URLError { throw e.code == .cancelled ? CancellationError() : OwnerError.offline }
    let reply = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    switch res.statusCode {
    case 201:
      guard let waiting = reply?["waiting"] as? Int else { throw OwnerError.badReply }
      return waiting
    case 401: throw OwnerError.signedOut
    case 404 where reply?["error"] as? String == "not_found": throw OwnerError.notFound
    default: throw OwnerError.refused(reply?["error"] as? String ?? "http_\(res.statusCode)", message: nil)
    }
  }
}
