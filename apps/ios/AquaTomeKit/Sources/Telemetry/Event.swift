import Foundation

/// One anonymous event, as it is sent (`Wire`; protocols/app-telemetry.openapi.json). Only what the privacy policy
/// lists: the page opened (its site path) or the app's screen, how far down it was read and for how long, a shop link
/// tapped, and how some actions went. Never an account, a name, a device's address or name, a tank's name, search text
/// or a photo: the constructors below are the only way to make one, and each takes a fixed name, a number, a site path
/// or a code from a fixed list (`Kind`, `refusals`). One the contract would refuse is never sent (`fits`).
public struct Event: Sendable {
  /// `view`, `scroll`, `time`, `aff` or `action`.
  public let t: String
  /// Milliseconds since this launch's session started, set when it's recorded.
  public internal(set) var at: Int = 0
  /// A page of the site, by its path: `/ca/ca-neon/` (Vietnamese, at the root) or `/vi/ca/ca-neon/` as the app's index
  /// gives it, `/id/…`, `/th/…`.
  public let path: String?
  /// One of the app's own screens (`Screen`).
  public let screen: String?
  /// How far down the page has been seen, in percent: 50 or 90 (`Event.depths`).
  public let depth: Int?
  /// How long the page has been on the screen with the app in front: 30, 60 or 180 s (`Event.times`).
  public let seconds: Int?
  /// The shop a shop link goes to (the network in its /go/ link), and the link itself, on the site.
  public let shop: String?
  public let href: String?
  /// An action's name (`Action`), whether it worked, and why not (`Kind`, or "refused:" and one of `refusals`), or fish
  /// ID's verdict.
  public let name: String?
  public let ok: Bool?
  public let kind: String?

  private init(_ t: String, path: String? = nil, screen: String? = nil, depth: Int? = nil, seconds: Int? = nil, shop: String? = nil,
               href: String? = nil, name: String? = nil, ok: Bool? = nil, kind: String? = nil) {
    self.t = t
    self.path = path
    self.screen = screen
    self.depth = depth
    self.seconds = seconds
    self.shop = shop
    self.href = href
    self.name = name
    self.ok = ok
    self.kind = kind
  }

  /// As it's sent, and kept in the queue's file: the fields it has.
  var json: [String: Any] {
    var o: [String: Any] = ["t": t, "at": at]
    o["path"] = path
    o["screen"] = screen
    o["depth"] = depth
    o["seconds"] = seconds
    o["shop"] = shop
    o["href"] = href
    o["name"] = name
    o["ok"] = ok
    o["kind"] = kind
    return o
  }

  /// One read back from the queue's file (whether the contract takes it is `fits`, asked again before it's sent).
  init?(json: Any) {
    guard let o = json as? [String: Any], let t = o["t"] as? String, let at = o["at"] as? Int else { return nil }
    self.init(t, path: o["path"] as? String, screen: o["screen"] as? String, depth: o["depth"] as? Int, seconds: o["seconds"] as? Int,
              shop: o["shop"] as? String, href: o["href"] as? String, name: o["name"] as? String, ok: o["ok"] as? Bool, kind: o["kind"] as? String)
    self.at = at
  }

  /// A page of the site opened in the app, drawn by the app or as the web page.
  public static func view(path: String) -> Event { Event("view", path: path) }
  /// A tab or one of the app's own screens opened.
  public static func view(_ screen: Screen) -> Event { Event("view", screen: screen.rawValue) }
  /// A page seen down to `depth` percent (one of `Event.depths`).
  public static func scroll(path: String, depth: Int) -> Event { Event("scroll", path: path, depth: depth) }
  /// A page on the screen, with the app in front, for `seconds` (one of `Event.times`).
  public static func time(path: String, seconds: Int) -> Event { Event("time", path: path, seconds: seconds) }
  /// A shop link (`/go/<shop>/…` on the site) tapped on a page; nil for any other link. The link as the site has it,
  /// its query in the characters the contract takes (any other percent-encoded), or without its query past 300.
  public static func aff(path: String, link: URL) -> Event? {
    let parts = link.path(percentEncoded: true).split(separator: "/")
    guard parts.count == 2, parts[0] == "go" else { return nil }
    let shop = String(parts[1])
    guard (1...24).contains(shop.count), shop.allSatisfy({ isLower($0) || isDigit($0) || $0 == "-" }) else { return nil }
    var href = "/go/\(shop)/"
    if let q = link.query(percentEncoded: true), !q.isEmpty {
      let kept = q.utf8.map { b -> String in
        let c = Character(Unicode.Scalar(b))
        return b < 128 && (isLetter(c) || isDigit(c) || "%._~&=+,-".contains(c)) ? String(c) : String(format: "%%%02X", b)
      }.joined()
      if href.count + 1 + kept.count <= 300 { href += "?" + kept }
    }
    return Event("aff", path: path, shop: shop, href: href)
  }
  /// How an action went: `kind` says why it didn't (or, for fish ID, its verdict), from a fixed list.
  public static func action(_ a: Action, ok: Bool, kind: Kind? = nil) -> Event { Event("action", name: a.rawValue, ok: ok, kind: kind?.rawValue) }
  /// A post the site refused, by its code: "refused:<code>" for one of `refusals`, "refused:other" for any other.
  public static func action(_ a: Action, refused code: String) -> Event {
    Event("action", name: a.rawValue, ok: false, kind: "refused:" + (refusals.contains(code) ? code : Kind.other.rawValue))
  }

  /// The codes the site's Worker refuses a reader's comment or photo with (apps/site/worker/comments/api.ts,
  /// apps/site/worker/photos.ts; protocols/talk.openapi.json), as `Readers.answer` gives them; "failed" when it gave none.
  /// Only these are sent as they are: a code the Worker adds later is "other" until it's listed here.
  public static let refusals: Set<String> = [
    "rate", "too large", "bad name", "bad entity", "bad form", "consent", "kind", "no file", "not an image", "not found",
    "comments_off", "photos_off", "turnstile", "verification_required", "cross-origin", "failed",
  ]

  /// The scroll depths a page reports, as the site's pages do (apps/site/src/layouts/Base.astro).
  public static let depths = [50, 90]
  /// The reading times a page reports, as the site's pages do.
  public static let times = [30, 60, 180]
  /// The latest `at` the Worker takes: 30 days.
  static let maxAt = 2_592_000_000

  /// Whether the contract takes it as it is: the Worker drops one that doesn't, so the app doesn't send it.
  var fits: Bool {
    guard (0...Self.maxAt).contains(at) else { return false }
    let none = (path: path == nil, screen: screen == nil, depth: depth == nil, seconds: seconds == nil, shop: shop == nil,
                href: href == nil, name: name == nil, ok: ok == nil, kind: kind == nil)
    let onlyPath = none.screen && none.depth && none.seconds && none.shop && none.href && none.name && none.ok && none.kind
    switch t {
    case "view":
      if let path { return onlyPath && Self.fits(path: path) }
      if let screen { return none.depth && none.seconds && none.shop && none.href && none.name && none.ok && none.kind && Self.fits(screen: screen) }
      return false
    case "scroll":
      guard let path, let depth else { return false }
      return none.screen && none.seconds && none.shop && none.href && none.name && none.ok && none.kind && Self.fits(path: path) && Self.depths.contains(depth)
    case "time":
      guard let path, let seconds else { return false }
      return none.screen && none.depth && none.shop && none.href && none.name && none.ok && none.kind && Self.fits(path: path) && Self.times.contains(seconds)
    case "aff":
      guard let path, let shop, let href else { return false }
      return none.screen && none.depth && none.seconds && none.name && none.ok && none.kind && Self.fits(path: path)
        && href.count <= 300 && (href == "/go/\(shop)/" || href.hasPrefix("/go/\(shop)/?"))
        && (1...24).contains(shop.count) && shop.allSatisfy { isLower($0) || isDigit($0) || $0 == "-" }
        && href.dropFirst("/go/\(shop)/?".count).allSatisfy { isLetter($0) || isDigit($0) || "%._~&=+,-".contains($0) }
    case "action":
      guard let name, ok != nil else { return false }
      return none.path && none.screen && none.depth && none.seconds && none.shop && none.href
        && Action(rawValue: name) != nil && (kind.map(Self.fits(kind:)) ?? true)
    default:
      return false
    }
  }

  /// A handbook page's path, as the contract's `Path` takes it: a Vietnamese page at the root under one of the site's
  /// sections (`/ca/…`, `/huong-dan/…`; the home `/`) or the same under `/vi/`, or an Indonesian or Thai page under
  /// `/id/` or `/th/`; segments of letters, digits, `_` and `-`, each ending in "/"; at most `maxPath`, no host or query.
  /// Nothing else at the root is a page (`/app/`, `/go/`, a file).
  static func fits(path: String) -> Bool {
    let whole = NSRange(path.startIndex..., in: path)
    return path.utf16.count <= maxPath && pathRegex.firstMatch(in: path, range: whole)?.range == whole
  }

  /// The contract's `Path` pattern and length, as they are (ContractTests fails when they differ): the site's
  /// Vietnamese sections are listed in it.
  static let pathPattern = #"^/(?:(?:vi/)?(?:(?:ca|cay|chinh-sach-bao-mat|cong-cu|dang-nhap|gioi-thieu|huong-dan|kham-pha|lien-he|moi-cap-nhat|nguon-goc|nhom|phan-loai|san-pham|thiet-bi|thuat-ngu|tim-kiem|video)/(?:[A-Za-z0-9_-]+/)*)?|(?:id|th|ms)/(?:[A-Za-z0-9_-]+/)*)$"#
  static let maxPath = 200
  private static let pathRegex = try! NSRegularExpression(pattern: pathPattern)

  /// A lowercase letter, then up to 23 lowercase letters, digits and "-".
  static func fits(screen: String) -> Bool {
    guard let first = screen.first, isLower(first), screen.count <= 24 else { return false }
    return screen.allSatisfy { isLower($0) || isDigit($0) || $0 == "-" }
  }

  /// A lowercase letter or digit, then up to 39 of those, " ", "_", ":", "." and "-".
  static func fits(kind: String) -> Bool {
    guard let first = kind.first, isLower(first) || isDigit(first), kind.count <= 40 else { return false }
    return kind.allSatisfy { isLower($0) || isDigit($0) || " _:.-".contains($0) }
  }

}

private func isLower(_ c: Character) -> Bool { c.isASCII && c.isLowercase }
private func isLetter(_ c: Character) -> Bool { c.isASCII && c.isLetter }
private func isDigit(_ c: Character) -> Bool { c.isASCII && c.isNumber }

/// The app's own screens a `view` names.
public enum Screen: String, Sendable, CaseIterable {
  /// The tabs.
  case handbook, tanks, lights
  /// A tank's screen, and a shelf of the handbook (a fish group, plants by where they go…).
  case tank, shelf
}

extension Event {
  /// Why an action didn't work, or fish ID's verdict: the only words an `action` event carries. An error the app has no
  /// case for here is `other`; never an error's text or what it holds (a light's or plug's name, a message).
  public enum Kind: String, Sendable, CaseIterable {
    // A light (Lights): none found by its name, a model the app doesn't drive, or a schedule it didn't read back; then
    // Bluetooth's errors (BluetoothError) and the light's (SessionError).
    case notNearby = "not-nearby", unsupportedModel = "unsupported-model", notReadBack = "not-read-back"
    case unauthorized, poweredOff = "powered-off", unsupported, timeout, notFound = "not-found", disconnected
    case noUART = "no-uart", failed, busy, firmwareTooOld = "firmware-too-old", noStatus = "no-status"
    // A plug (PlugBoard's outcome), then the maker's cloud's errors (PlugError); `busy` and `notFound` above too.
    case unconfirmed, unknown, offline, badKeys = "bad-keys", expired, notSubscribed = "not-subscribed", quota, clock
    case noAccess = "no-access", plugOffline = "plug-offline", noSuchPlug = "no-such-plug", maker, badReply = "bad-reply"
    // A tank not added (TankStoreError).
    case unknownVersion = "unknown-version", notAStore = "not-a-store", tooManyTanks = "too-many-tanks"
    case tooManyDevices = "too-many-devices", blankName = "blank-name", invalid
    // A post: the account's session over, or no answer from the site.
    case signedOut = "signed-out", noAnswer = "no-answer"
    // Fish ID's verdict (protocols/fishid.openapi.json): never what the photo shows, by name or species.
    case fish, plant, unclear
    /// Anything else.
    case other
  }
}

/// The actions whose outcome is sent.
public enum Action: String, Sendable, CaseIterable {
  case lightConnect = "light.connect"
  case lightWrite = "light.write"
  case plugSwitch = "plug.switch"
  /// Fish ID's answer to a reader's photo, `kind` its verdict (`fish`, `plant`, `unclear` or `other`; never the photo or
  /// a species): recorded by the fish ID screen's model where its answer comes, once that screen is in the app.
  case fishID = "fishid"
  case tankAdd = "tank.add"
  case postComment = "post.comment"
  case postPhoto = "post.photo"
}
