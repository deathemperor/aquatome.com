import Foundation

/// One anonymous event, as it is sent (`Wire`). Only what the privacy policy lists: the page opened (its site path) or
/// the app's screen, how far down it was read and for how long, a shop link tapped, and how some actions went. Never an
/// account, a name, a device's address or name, a tank's name, search text or a photo: the constructors below are the
/// only way to make one, and each takes a fixed name, a number, a site path or a short code.
public struct Event: Codable, Sendable, Equatable {
  /// `view`, `scroll`, `time`, `aff` or `action`.
  public let t: String
  /// Milliseconds since this launch's session started, set when it's recorded.
  public internal(set) var at: Int = 0
  /// A page of the site, by its path (`/vi/ca/ca-neon/`).
  public let path: String?
  /// One of the app's own screens (`Screen`).
  public let screen: String?
  /// How far down the page has been seen, in percent: 25, 50, 75 or 100.
  public let depth: Int?
  /// How long the page has been open and on the screen.
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
    self.path = path.map(Self.path)
    self.screen = screen
    self.depth = depth
    self.seconds = seconds
    self.shop = shop
    self.href = href
    self.name = name
    self.ok = ok
    self.kind = kind.map(Self.code)
  }

  /// A page of the site opened in the app.
  public static func view(path: String) -> Event { Event("view", path: path) }
  /// A tab or one of the app's own screens opened.
  public static func view(_ screen: Screen) -> Event { Event("view", screen: screen.rawValue) }
  /// A page seen down to `depth` percent (one of `Event.depths`).
  public static func scroll(path: String, depth: Int) -> Event { Event("scroll", path: path, depth: depth) }
  /// A page open and on the screen `seconds` after it opened (one of `Event.times`).
  public static func time(path: String, seconds: Int) -> Event { Event("time", path: path, seconds: seconds) }
  /// A shop link (`/go/<shop>/…` on the site) tapped on a page; nil for any other link.
  public static func aff(path: String, link: URL) -> Event? {
    let p = link.path(percentEncoded: true)
    let parts = p.split(separator: "/")
    guard parts.count >= 2, parts[0] == "go", parts[1].allSatisfy({ $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "-") }) else { return nil }
    let href = p + (link.query(percentEncoded: true).map { "?" + $0 } ?? "")
    return Event("aff", path: path, shop: String(parts[1].prefix(30)).lowercased(), href: String(href.prefix(300)))
  }
  /// How an action went: `kind` says why it didn't (or, for fish ID, its verdict).
  public static func action(_ a: Action, ok: Bool, kind: String? = nil) -> Event { Event("action", name: a.rawValue, ok: ok, kind: kind) }
  /// An action that failed, by its error's case (`BluetoothError.timeout` is "timeout"), never its text or what it holds.
  public static func action(_ a: Action, error: any Error) -> Event {
    action(a, ok: false, kind: String(String(describing: error).prefix { $0.isLetter || $0.isNumber }))
  }

  /// The scroll depths a page reports, as it passes each one.
  public static let depths = [25, 50, 75, 100]
  /// The reading times a page reports, as the site's pages do (apps/site/src/layouts/Base.astro).
  public static let times = [30, 60, 180]

  /// A site path as the site's own events keep it: from its first "/", without a query, at most 200 characters.
  static func path(_ s: String) -> String {
    let p = s.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false).first.map(String.init) ?? ""
    return String((p.hasPrefix("/") ? p : "/" + p).prefix(200))
  }

  /// A short code (an error's kind, a refusal code, a verdict): letters, digits, `_`, `-` and `.`, at most 40; anything
  /// else, such as a message or a device's name, is sent as "other".
  static func code(_ s: String) -> String {
    let allowed = s.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "_-.".contains($0)) }
    return allowed && !s.isEmpty && s.count <= 40 ? s : "other"
  }
}

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
