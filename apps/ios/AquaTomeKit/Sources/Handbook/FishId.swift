import CoreGraphics
import Foundation

/// The fish-ID tool from the app (protocols/fishid.openapi.json): a reader's photo, sent as their aquatome.com account,
/// comes back as Claude's guesses with the handbook's pages for them (apps/site/worker/fishid/api.ts). What is sent and
/// how an answer reads follow the site's page (apps/site/src/scripts/fish-id-client.ts); the words are the app's.
public enum FishId {
  /// The photo as the site's page sends it (apps/site/worker/fishid/photo.ts): its long side at most this many pixels,
  /// a JPEG at this quality.
  public static let maxSide = 1024
  public static let quality = 0.85

  /// One of the handbook's pages a guess leads to, in the reader's language.
  public struct Linked: Sendable, Hashable {
    public let id: String
    public let name: String
    /// Its scientific name.
    public let sci: String?
    /// Its path ("/vi/ca/ca-neon/"): nil when the page has none in this language, or the answer gives one that isn't
    /// this site's, as the site's page leaves those unlinked (`own`).
    public let path: String?
    /// Its photo, on our media host (https only).
    public let img: URL?
  }

  /// One of Claude's guesses, most likely first.
  public struct Guess: Sendable, Equatable {
    public let scientificName: String
    public let commonName: String
    /// A bred form ("Halfmoon"), when Claude sees one.
    public let variety: String?
    public let confidence: Double
    /// What in the photo points to it, in the reader's language.
    public let reason: String
    /// The handbook's page for it: the breed its variety names, else the species or plant.
    public let page: Linked?
    /// The species beside a breed's page.
    public let species: Linked?
    /// The genus's other pages, for "not this one?": a photo often gets the genus right and the species wrong.
    public let sameGenus: [Linked]

    /// The genus `sameGenus` is of, as the site's page names it: a former name's page lists its own genus.
    public var genus: String {
      String((species?.sci ?? page?.sci ?? scientificName).split(whereSeparator: \.isWhitespace).first ?? "")
    }
  }

  /// How sure Claude is, in the site's four words for it, not a number that looks more exact than it is.
  public enum Sure: Sendable, Equatable {
    case almostCertain, quiteLike, maybe, unlikely
    public init(_ confidence: Double) {
      self = confidence >= 0.8 ? .almostCertain : confidence >= 0.55 ? .quiteLike : confidence >= 0.3 ? .maybe : .unlikely
    }
  }

  public struct Identification: Sendable, Equatable {
    /// "fish", "plant", "other" (no fish or plant in the photo) or "unclear" (one is there but can't be told).
    public let verdict: String
    public let results: [Guess]

    /// Whether there are guesses to show.
    public var hasGuesses: Bool { verdict != "other" && !results.isEmpty }
    /// What to say before the guesses, or instead of them.
    public var line: Line? {
      if verdict == "other" { return .notFish }
      if results.isEmpty { return .unclear }
      return verdict == "unclear" ? .onlyAGuess : nil
    }
  }

  public enum Line: Sendable, Equatable { case notFish, unclear, onlyAGuess }

  /// What GET says: whether the tool is on, every key resting, and an account's identifications a day.
  public struct Status: Sendable, Equatable {
    public let on: Bool
    public let resting: Bool
    public let perAccount: Int?
  }

  public enum Answer: Sendable, Equatable {
    case identified(Identification)
    /// The account's session is over: the reader signs in again.
    case signedOut
    /// Refused, with the Worker's code (`rate` with the reader's limit, `busy`, `resting`, `fish_id_off`, …), or
    /// `failed` for an answer that isn't the contract's.
    case refused(String, limit: Int?)
  }

  // Requests. Both name the app as `Readers` does (`AquaTome-iOS/<version>`), with `ownCopy` after it from our own copies
  // (AccountsClient.ourCopy): the Worker then counts no wanted name from their guesses.

  /// GET /api/fish-id.
  public static func status(site: URL, version: String, ownCopy: String?) -> URLRequest {
    var r = URLRequest(url: site.appending(path: "api/fish-id"))
    r.httpShouldHandleCookies = false
    r.setValue(agent(version, ownCopy), forHTTPHeaderField: "User-Agent")
    return r
  }

  /// POST /api/fish-id as the account: its bearer in place of the page's Origin and Turnstile token, and the form the
  /// page sends (`file`, `lang`, `from`). `jpeg` is `photo(_:box:)`'s.
  public static func identify(jpeg: Data, lang: String, site: URL, token: String, version: String, ownCopy: String?,
                              boundary: String = UUID().uuidString) -> URLRequest {
    var r = status(site: site, version: version, ownCopy: ownCopy)
    r.httpMethod = "POST"
    // Claude has up to 25 s on the Worker (apps/site/worker/fishid/keys.ts), and #473's agent would cap a run at 45 s:
    // past the app's usual 20 s with nothing heard. 65, not 60: 60 is URLRequest's own, so a test couldn't tell it set,
    // and unset, the accounts session's 20 s applies.
    r.timeoutInterval = 65
    r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    var body = Data()
    func part(_ name: String, _ value: Data, file: Bool = false) {
      body += Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\(file ? "; filename=\"photo.jpg\"\r\nContent-Type: image/jpeg" : "")\r\n\r\n".utf8)
      body += value + Data("\r\n".utf8)
    }
    part("file", jpeg, file: true)
    part("lang", Data(lang.utf8))
    // The tool's own screen, as the site's page says of itself: the owner's log tells it from a tank's button.
    part("from", Data("page".utf8))
    // Not yet: the reader's opt-in to keep the photo (`keep`), with the site's next change.
    body += Data("--\(boundary)--\r\n".utf8)
    r.httpBody = body
    return r
  }

  private static func agent(_ version: String, _ ownCopy: String?) -> String {
    ["AquaTome-iOS/\(version)", ownCopy].compactMap { $0 }.joined(separator: " ")
  }

  /// The photo as sent: the whole of it, or the part `box` holds (0…1 of the upright photo, as the reader drew it on
  /// its preview), shrunk and stripped of its location and camera (`Readers.shrink`).
  public static func photo(_ data: Data, box: CGRect? = nil) -> Data? {
    Readers.shrink(data, maxSide: maxSide, quality: quality, region: box)
  }

  // Answers, read leniently: a guess missing its name or confidence is left out, not the others.

  public static func status(_ data: Data, status: Int) -> Status? {
    guard status == 200, let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let on = o["on"] as? Bool else { return nil }
    return Status(on: on, resting: o["resting"] as? Bool ?? false, perAccount: o["perAccount"] as? Int)
  }

  public static func answer(_ data: Data, status: Int) -> Answer {
    let o = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    if status == 200, let verdict = o?["verdict"] as? String, let results = o?["results"] as? [Any] {
      return .identified(Identification(verdict: verdict, results: results.compactMap { ($0 as? [String: Any]).flatMap(guess) }))
    }
    let code = o?["error"] as? String
    if status == 401 && code == "session" { return .signedOut }
    return .refused(code ?? "failed", limit: o?["limit"] as? Int)
  }

  private static func guess(_ o: [String: Any]) -> Guess? {
    guard let sci = o["scientificName"] as? String, let confidence = (o["confidence"] as? NSNumber)?.doubleValue else { return nil }
    return Guess(scientificName: sci, commonName: o["commonName"] as? String ?? "", variety: o["variety"] as? String, confidence: confidence,
                 reason: o["reason"] as? String ?? "", page: linked(o["page"]), species: linked(o["species"]),
                 sameGenus: (o["sameGenus"] as? [Any] ?? []).compactMap(linked))
  }

  private static func linked(_ v: Any?) -> Linked? {
    guard let o = v as? [String: Any], let id = o["id"] as? String, let name = o["name"] as? String else { return nil }
    // Only this site's own pages and our media host's photos, whatever the answer holds.
    let path = (o["url"] as? String).flatMap { ["/vi/", "/id/", "/th/"].contains(String($0.prefix(4))) ? $0 : nil }
    let img = (o["img"] as? String).flatMap { $0.hasPrefix("https://") ? URL(string: $0) : nil }
    return Linked(id: id, name: name, sci: o["sci"] as? String, path: path, img: img)
  }
}
