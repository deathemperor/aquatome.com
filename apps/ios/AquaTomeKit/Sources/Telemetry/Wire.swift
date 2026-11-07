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

  /// A batch's body: `{app, os, device, lang, session, events}`.
  static func body(_ b: Batch) -> Data { json(b.json) }

  /// A diagnostics report's body: `{kind, app, os, device, payload}`, the payload (`Diagnostic.kept`) written in as it
  /// is.
  static func body(_ d: Diagnostic) -> Data {
    let head = json(["kind": d.kind.rawValue, "app": d.about.app, "os": d.about.os, "device": d.about.device])
    return head.dropLast() + Data(#","payload":"#.utf8) + Data(d.payload.utf8) + Data("}".utf8)
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

  /// JSON as it's sent and kept: keys sorted, "/" as it is. (JSONSerialization, not Codable: the app's size.)
  static func json(_ o: Any) -> Data { (try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys, .withoutEscapingSlashes])) ?? Data() }
}

/// Which app, iOS and phone a batch or report comes from, and the app's language.
public struct About: Sendable {
  /// The app's version and build, as "1.0 (114)".
  public let app: String
  /// iOS's version, as "26.5".
  public let os: String
  /// The phone's model, as "iPhone17,3": the model, the same on every phone of it.
  public let device: String
  /// The app's language: one the telemetry contract lists (vi, id, th, ms).
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
    self.lang = ["vi", "id", "th", "ms"].contains(lang) ? lang : "vi"
  }
}

/// One request's events: those of one session, in the order they happened.
struct Batch: Sendable {
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

  /// As it's sent, and kept in the queue's file.
  var json: [String: Any] { ["app": app, "os": os, "device": device, "lang": lang, "session": session, "events": events.map(\.json)] }

  /// One read back from the queue's file.
  init?(json: Any) {
    guard let o = json as? [String: Any], let app = o["app"] as? String, let os = o["os"] as? String, let device = o["device"] as? String,
          let lang = o["lang"] as? String, let session = o["session"] as? String, let events = o["events"] as? [Any] else { return nil }
    self.init(About(app: app, os: os, device: device, lang: lang), session: session, events: events.compactMap(Event.init(json:)))
  }
}

/// A crash, hang, launch or memory report from iOS (MetricKit), cut down to what the privacy policy names (`kept`).
public struct Diagnostic: Sendable {
  /// `metric`: a day's measures (launch time, memory, hangs…); `diagnostic`: a crash or hang with its call stacks.
  public enum Kind: String, Sendable { case metric, diagnostic }
  public let kind: Kind
  let about: About
  /// MetricKit's `jsonRepresentation()`, cut down (`kept`), as text.
  let payload: String

  init(kind: Kind, about: About, payload: String) {
    self.kind = kind
    self.about = about
    self.payload = payload
  }

  /// As it's kept in the queue's file.
  var json: [String: Any] {
    ["kind": kind.rawValue, "app": about.app, "os": about.os, "device": about.device, "lang": about.lang, "payload": payload]
  }

  /// One read back from the queue's file.
  init?(json: Any) {
    guard let o = json as? [String: Any], let kind = (o["kind"] as? String).flatMap(Kind.init(rawValue:)), let app = o["app"] as? String,
          let os = o["os"] as? String, let device = o["device"] as? String, let lang = o["lang"] as? String,
          let payload = o["payload"] as? String else { return nil }
    self.init(kind: kind, about: About(app: app, os: os, device: device, lang: lang), payload: payload)
  }

  /// What of MetricKit's `jsonRepresentation()` is sent, as the privacy policy names it: unexpected quits, hangs, launch
  /// time and memory, and crashes and hangs with their call stacks, each by the fields MetricKit writes for it; nil when
  /// none of that is in it. From the report's
  /// own details only the app's build, iOS's version and the phone's model. The rest never leaves the phone: the
  /// phone's region and low power mode, network, cellular, location, display, GPU, disk and animation measures, other
  /// kinds of diagnostics, and any free text (an exception's message, a reason for ending the app).
  static func kept(_ kind: Kind, json: Data) -> Data? {
    guard let all = try? JSONSerialization.jsonObject(with: json),
          let kept = Keep.apply(all, kind == .metric ? Keep.metric : Keep.diagnostic) as? [String: Any],
          kept.keys.contains(where: { $0 != "metaData" }) else { return nil }
    return try? JSONSerialization.data(withJSONObject: kept, options: [.sortedKeys, .withoutEscapingSlashes])
  }

  /// A part of a report kept, by an allow-list at every level: a field it doesn't name is dropped, however deep, and so
  /// is a field of another shape than named (an object where a number goes). A part left empty is dropped too.
  private indirect enum Keep: Sendable {
    /// A number (or true or false) or a string.
    case value
    /// An object, with only these fields, each kept by its own rule.
    case only([String: Keep])
    /// A list, each item kept by the rule.
    case list(Keep)
    /// An object of numbered entries, as a histogram's buckets ("0", "1"…), each kept by the rule.
    case numbered(Keep)
    /// A call stack's frame, its subframes frames too.
    case frame

    static func fields(_ names: [String], _ keep: Keep = .value) -> [String: Keep] {
      Dictionary(uniqueKeysWithValues: names.map { ($0, keep) })
    }

    /// The report's details (`metaData`, a diagnostic's `diagnosticMetaData`): the build, iOS's version, the model.
    static let about = fields(["appBuildVersion", "osVersion", "deviceType"])
    /// A histogram, as MetricKit writes launch times and hangs: its buckets' counts and bounds.
    static let histogram = Keep.only([
      "histogramNumBuckets": .value,
      "histogramValue": .numbered(.only(fields(["bucketCount", "bucketStart", "bucketEnd"]))),
    ])
    /// Each way the app ended, counted, in the front or in the background.
    static let exits = Keep.only(fields([
      "cumulativeNormalAppExitCount", "cumulativeMemoryResourceLimitExitCount", "cumulativeCPUResourceLimitExitCount",
      "cumulativeMemoryPressureExitCount", "cumulativeBadAccessExitCount", "cumulativeAbnormalExitCount",
      "cumulativeIllegalInstructionExitCount", "cumulativeAppWatchdogExitCount", "cumulativeSuspendedWithLockedFileExitCount",
      "cumulativeBackgroundTaskAssertionTimeoutExitCount", "cumulativeBackgroundURLSessionCompletionTimeoutExitCount",
      "cumulativeBackgroundFetchCompletionTimeoutExitCount",
    ]))
    static let metric = Keep.only([
      "metaData": .only(about),
      "applicationExitMetrics": .only(["foregroundExitData": exits, "backgroundExitData": exits]),
      // MetricKit's JSON names, and its properties' names, which some iOS versions write instead.
      "applicationResponsivenessMetrics": .only(fields(["histogrammedAppHangTime", "histogrammedApplicationHangTime"], histogram)),
      "applicationLaunchMetrics": .only(fields([
        "histogrammedTimeToFirstDrawKey", "histogrammedTimeToFirstDraw", "histogrammedOptimizedTimeToFirstDrawKey",
        "histogrammedOptimizedTimeToFirstDraw", "histogrammedResumeTime", "histogrammedApplicationResumeTime", "histogrammedExtendedLaunch",
      ], histogram)),
      "memoryMetrics": .only([
        "peakMemoryUsage": .value, "averageSuspendedMemory": .only(fields(["averageValue", "standardDeviation", "sampleCount"])),
      ]),
    ])
    /// The threads' call stacks: frames by their binary's name and id and an address in it.
    static let stacks = Keep.only(["callStackPerThread": .value, "callStacks": .list(.only(["threadAttributed": .value, "callStackRootFrames": .list(.frame)]))])
    static let frameFields = fields(["binaryUUID", "binaryName", "address", "offsetIntoBinaryTextSegment", "sampleCount"]).merging(["subFrames": .list(.frame)]) { a, _ in a }
    static let diagnostic = Keep.only([
      "crashDiagnostics": .list(.only(["version": .value, "callStackTree": stacks,
                                       "diagnosticMetaData": .only(about.merging(fields(["exceptionType", "exceptionCode", "signal"])) { a, _ in a })])),
      "hangDiagnostics": .list(.only(["version": .value, "callStackTree": stacks, "diagnosticMetaData": .only(about.merging(fields(["hangDuration"])) { a, _ in a })])),
    ])

    /// `v` as the rule keeps it, or nil when nothing of it is.
    static func apply(_ v: Any, _ keep: Keep) -> Any? {
      switch keep {
      case .value:
        return v is NSNumber || v is String ? v : nil
      case .list(let item):
        let kept = (v as? [Any])?.compactMap { apply($0, item) } ?? []
        return kept.isEmpty ? nil : kept
      case .only(let named):
        guard let o = v as? [String: Any] else { return nil }
        let kept = named.reduce(into: [String: Any]()) { out, f in if let x = o[f.key], let y = apply(x, f.value) { out[f.key] = y } }
        return kept.isEmpty ? nil : kept
      case .numbered(let item):
        guard let o = v as? [String: Any] else { return nil }
        let kept = o.reduce(into: [String: Any]()) { out, e in
          if !e.key.isEmpty, e.key.allSatisfy({ $0.isASCII && $0.isNumber }), let y = apply(e.value, item) { out[e.key] = y }
        }
        return kept.isEmpty ? nil : kept
      case .frame:
        return apply(v, .only(frameFields))
      }
    }
  }
}
