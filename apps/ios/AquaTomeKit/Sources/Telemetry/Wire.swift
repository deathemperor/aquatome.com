import Foundation

/// What the app sends aquatome.com's Worker, and how: all of it here, so the site's contract changes this file alone.
/// Built against the draft of `POST /api/v1/app/events` and `POST /api/v1/app/diagnostics` (JSON, no sign-in, no
/// cookie); the Worker adds the country from Cloudflare, so the app doesn't send it.
public enum Wire {
  public static let events = "/api/v1/app/events"
  public static let diagnostics = "/api/v1/app/diagnostics"
  /// The most events one request carries.
  public static let batchSize = 100

  /// The fields a batch, an event and a diagnostics report may carry: the privacy policy's list. A field outside them
  /// fails the field audit (TelemetryTests).
  public static let batchFields: Set<String> = ["app", "os", "device", "lang", "session", "events"]
  public static let eventFields: Set<String> = ["t", "at", "path", "screen", "depth", "seconds", "shop", "href", "name", "ok", "kind"]
  public static let diagnosticFields: Set<String> = ["kind", "app", "os", "device", "payload"]

  /// A batch's body: `{app, os, device, lang, session, events}`.
  static func body(_ b: Batch) -> Data { (try? encoder.encode(b)) ?? Data() }

  /// A diagnostics report's body: MetricKit's own JSON as `payload`, with what it is and which app, iOS and phone
  /// model sent it.
  static func body(_ d: Diagnostic) -> Data {
    let payload = (try? JSONSerialization.jsonObject(with: Data(d.payload.utf8))) ?? [String: Any]()
    let o: [String: Any] = ["kind": d.kind.rawValue, "app": d.about.app, "os": d.about.os, "device": d.about.device, "payload": payload]
    return (try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys])) ?? Data()
  }

  /// A POST of `body` to `path` on `site`: JSON, no cookie; `userAgent` marks our own copies of the app
  /// (`AccountsClient.ourCopy`), so the site leaves their events out as it leaves out their page views.
  static func request(_ path: String, body: Data, site: URL, userAgent: String?) -> URLRequest {
    var r = URLRequest(url: URL(string: path, relativeTo: site)!.absoluteURL)
    r.httpMethod = "POST"
    r.httpShouldHandleCookies = false
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if let userAgent { r.setValue(userAgent, forHTTPHeaderField: "User-Agent") }
    r.httpBody = body
    return r
  }

  private static let encoder: JSONEncoder = {
    let e = JSONEncoder()
    e.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    return e
  }()
}

/// Which app, iOS and phone a batch or report comes from, and the app's language.
public struct About: Codable, Sendable, Equatable {
  /// The app's version and build, as "1.0 (114)".
  public let app: String
  /// iOS's version, as "26.5".
  public let os: String
  /// The phone's model, as "iPhone17,3": the model, the same on every phone of it.
  public let device: String
  /// The app's language: vi, id or th.
  public let lang: String

  public init(app: String, os: String, device: String, lang: String) {
    self.app = app
    self.os = os
    self.device = device
    self.lang = lang
  }
}

/// One request's events: those of one session, in the order they happened.
struct Batch: Codable, Sendable, Equatable {
  let app: String
  let os: String
  let device: String
  let lang: String
  /// Random for each launch of the app; never kept for another. A batch waiting on the phone keeps its own until sent.
  let session: String
  var events: [Event]

  init(_ about: About, session: String, events: [Event]) {
    app = about.app
    os = about.os
    device = about.device
    lang = about.lang
    self.session = session
    self.events = events
  }
}

/// A crash, hang, launch or memory report from iOS (MetricKit), sent as iOS wrote it.
public struct Diagnostic: Codable, Sendable, Equatable {
  /// `metric`: a day's measures (launch time, memory, hangs…); `diagnostic`: a crash or hang with its call stacks.
  public enum Kind: String, Codable, Sendable { case metric, diagnostic }
  public let kind: Kind
  let about: About
  /// MetricKit's `jsonRepresentation()`, as text.
  let payload: String
}
