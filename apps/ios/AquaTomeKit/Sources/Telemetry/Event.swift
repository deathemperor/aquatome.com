import Foundation

/// One anonymous event, as it is sent (`Wire`; protocols/app-telemetry.openapi.json). Only what the privacy policy
/// lists: the page opened (its site path) or the app's screen, how far down it was read and for how long, a shop link
/// tapped, and how some actions went. Never an account, a name, a device's address or name, a tank's name, search text
/// or a photo: the constructors below are the only way to make one, and each takes a fixed name, a number, a site path
/// or a short code. One the contract would refuse is never sent (`fits`).
public struct Event: Codable, Sendable, Equatable {
  /// `view`, `scroll`, `time`, `aff` or `action`.
  public let t: String
  /// Milliseconds since this launch's session started, set when it's recorded.
  public internal(set) var at: Int = 0
  /// A page of the site, by its path (`/vi/ca/ca-neon/`).
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
  /// An action's name (`Action`), whether it worked, and why not: an error kind, a refusal code, or fish ID's verdict.
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
    self.kind = kind.map(Self.code)
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
  /// How an action went: `kind` says why it didn't (or, for fish ID, its verdict).
  public static func action(_ a: Action, ok: Bool, kind: String? = nil) -> Event { Event("action", name: a.rawValue, ok: ok, kind: kind) }
  /// An action that failed, by its error's case (`BluetoothError.notFound` is "not-found"), never its text or what it
  /// holds.
  public static func action(_ a: Action, error: any Error) -> Event {
    action(a, ok: false, kind: String(String(describing: error).prefix { isLetter($0) || isDigit($0) }))
  }
  /// A post the server refused, by its code: "refused:<code>".
  public static func action(_ a: Action, refused code: String) -> Event { action(a, ok: false, kind: "refused:" + code) }

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

  /// A handbook page's path: `/vi/`, `/id/` or `/th/`, then segments of letters, digits, `_` and `-`, each ending in
  /// "/"; at most 200 characters, no host or query.
  static func fits(path: String) -> Bool {
    let parts = path.split(separator: "/", omittingEmptySubsequences: false)
    return path.count <= 200 && parts.count >= 3 && parts.first == "" && parts.last == "" && ["vi", "id", "th"].contains(parts[1])
      && parts.dropFirst().dropLast().allSatisfy { !$0.isEmpty && $0.allSatisfy { isLetter($0) || isDigit($0) || $0 == "_" || $0 == "-" } }
  }

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

  /// A short code as the contract takes it: a case's name in lowercase, its words split by "-" ("plugOffline" is
  /// "plug-offline"); anything else, such as a message or a device's name with spaces, is sent as "other".
  static func code(_ s: String) -> String {
    var out = ""
    var last: Character?
    for c in s {
      if c.isUppercase, let l = last, l.isLowercase || l.isNumber { out.append("-") }
      out += c.lowercased()
      last = c
    }
    return fits(kind: out) ? out : "other"
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

/// The actions whose outcome is sent.
public enum Action: String, Sendable, CaseIterable {
  case lightConnect = "light.connect"
  case lightWrite = "light.write"
  case plugSwitch = "plug.switch"
  /// Fish ID's answer to a reader's photo, `kind` its verdict (never the photo): recorded by the fish ID screen's model
  /// where its answer comes, once that screen is in the app.
  case fishID = "fishid"
  case tankAdd = "tank.add"
  case postComment = "post.comment"
  case postPhoto = "post.photo"
}
