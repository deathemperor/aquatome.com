import Foundation

/// What the app sends aquatome.com's Worker, and how (protocols/app-telemetry.openapi.json): `POST /api/v1/app/events`
/// and `POST /api/v1/app/diagnostics`, JSON, no sign-in, no cookie, no Origin. The Worker adds the country from
/// Cloudflare, so the app doesn't send it. What each event may hold is `Event.fits`.
public enum Wire {
  public static let events = "/api/v1/app/events"
  public static let diagnostics = "/api/v1/app/diagnostics"
  /// The most events one request carries, and the most bytes.
  public static let batchSize = 100
  public static let maxBatch = 64 * 1024
  /// The most bytes a report's request carries, the wrapper included.
  public static let maxReport = 1024 * 1024

  /// The fields a batch, an event and a diagnostics report may carry: the privacy policy's list. A field outside them
  /// fails the field audit (TelemetryTests).
  public static let batchFields: Set<String> = ["app", "os", "device", "lang", "session", "events"]
  public static let eventFields: Set<String> = ["t", "at", "path", "screen", "depth", "seconds", "shop", "href", "name", "ok", "kind"]
  public static let diagnosticFields: Set<String> = ["kind", "app", "os", "device", "payload"]

  /// A batch's body: `{app, os, device, lang, session, events}`.
  static func body(_ b: Batch) -> Data { (try? encoder.encode(b)) ?? Data() }

  /// A diagnostics report's body: `{kind, app, os, device, payload}`, the payload (`Diagnostic.kept`) written in as it
  /// is.
  static func body(_ d: Diagnostic) -> Data {
    let head = (try? encoder.encode(Report(kind: d.kind, app: d.about.app, os: d.about.os, device: d.about.device))) ?? Data("{}".utf8)
    return head.dropLast() + Data(#","payload":"#.utf8) + Data(d.payload.utf8) + Data("}".utf8)
  }

  /// A report's wrapper, around its payload.
  private struct Report: Encodable {
    let kind: Diagnostic.Kind
    let app: String
    let os: String
    let device: String
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

  /// Each as the contract takes it, or a stand-in it takes: a batch with one it doesn't would be refused whole.
  public init(app: String, os: String, device: String, lang: String) {
    let digits = { (s: Substring, most: Int) in (1...most).contains(s.count) && s.allSatisfy { $0.isASCII && $0.isNumber } }
    let version = { (s: Substring, most: Int) in
      let parts = s.split(separator: ".", omittingEmptySubsequences: false)
      return (1...4).contains(parts.count) && parts.allSatisfy { digits($0, most) }
    }
    // "1.0 (114)"
    let a = app.split(separator: " ", maxSplits: 1)
    let build = a.count == 2 && a[1].hasPrefix("(") && a[1].hasSuffix(")") ? a[1].dropFirst().dropLast() : ""
    self.app = a.count == 2 && version(a[0], 4) && digits(build, 9) ? app : "0 (0)"
    self.os = version(Substring(os), 3) ? os : "0"
    // "iPhone17,3"
    let d = device.first.map { $0.isASCII && $0.isLetter } == true && (2...32).contains(device.count)
      && device.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || $0 == "," || $0 == "_") }
    self.device = d ? device : "unknown"
    self.lang = ["vi", "id", "th"].contains(lang) ? lang : "vi"
  }
}

/// One request's events: those of one session, in the order they happened.
struct Batch: Codable, Sendable, Equatable {
  let app: String
  let os: String
  let device: String
  let lang: String
  /// Random, made anew at each launch and never reused for another launch. A batch waiting in the queue keeps its
  /// launch's until it is sent.
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

/// A crash, hang, launch or memory report from iOS (MetricKit), cut down to what the privacy policy names (`kept`).
public struct Diagnostic: Codable, Sendable, Equatable {
  /// `metric`: a day's measures (launch time, memory, hangs…); `diagnostic`: a crash or hang with its call stacks.
  public enum Kind: String, Codable, Sendable { case metric, diagnostic }
  public let kind: Kind
  let about: About
  /// MetricKit's `jsonRepresentation()`, cut down (`kept`), as text.
  let payload: String

  /// What of MetricKit's `jsonRepresentation()` is sent, as the privacy policy names it: unexpected quits, hangs, launch
  /// time and memory, and crashes and hangs with their call stacks; nil when none of that is in it. From the report's
  /// own details only the app's build, iOS's version and the phone's model. The rest never leaves the phone: the
  /// phone's region and low power mode, network, cellular, location, display, GPU, disk and animation measures, other
  /// kinds of diagnostics, and any free text (an exception's message, a reason for ending the app).
  static func kept(_ kind: Kind, json: Data) -> Data? {
    guard let all = try? JSONSerialization.jsonObject(with: json) as? [String: Any],
          let kept = Keep.apply(all, kind == .metric ? Keep.metric : Keep.diagnostic) as? [String: Any],
          kept.contains(where: { k, v in k != "metaData" && (v as? [Any])?.isEmpty != true }) else { return nil }
    return try? JSONSerialization.data(withJSONObject: kept, options: [.sortedKeys, .withoutEscapingSlashes])
  }

  /// A part of a report kept: whole, only the fields named (in each item, for a list), or a call stack's frame.
  private indirect enum Keep: Sendable {
    case all, frame
    case only([String: Keep])

    /// The report's details (`metaData`, a diagnostic's `diagnosticMetaData`): the build, iOS's version, the model.
    static let about: [String: Keep] = ["appBuildVersion": .all, "osVersion": .all, "deviceType": .all]
    static let metric = Keep.only([
      "metaData": .only(about), "applicationExitMetrics": .all, "applicationResponsivenessMetrics": .all,
      "applicationLaunchMetrics": .all, "memoryMetrics": .all,
    ])
    /// The threads' call stacks: frames by their binary's name and id and an address in it.
    static let stacks = Keep.only(["callStackPerThread": .all, "callStacks": .only(["threadAttributed": .all, "callStackRootFrames": .frame])])
    static let frameFields: [String: Keep] = [
      "binaryUUID": .all, "binaryName": .all, "address": .all, "offsetIntoBinaryTextSegment": .all, "sampleCount": .all, "subFrames": .frame,
    ]
    static let diagnostic = Keep.only([
      "crashDiagnostics": .only(["version": .all, "callStackTree": stacks,
                                 "diagnosticMetaData": .only(about.merging(["exceptionType": .all, "exceptionCode": .all, "signal": .all]) { a, _ in a })]),
      "hangDiagnostics": .only(["version": .all, "callStackTree": stacks, "diagnosticMetaData": .only(about.merging(["hangDuration": .all]) { a, _ in a })]),
    ])

    static func apply(_ v: Any, _ keep: Keep) -> Any? {
      if let list = v as? [Any] { return list.compactMap { apply($0, keep) } }
      switch keep {
      case .all: return v
      case .frame: return apply(v, .only(frameFields))
      case .only(let fields):
        guard let o = v as? [String: Any] else { return nil }
        var out: [String: Any] = [:]
        for (k, f) in fields { if let x = o[k], let y = apply(x, f) { out[k] = y } }
        return out
      }
    }
  }
}
