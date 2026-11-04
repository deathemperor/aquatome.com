import AccountSync
import Foundation
import MetricKit
import Observation
import Telemetry
import UIKit

/// The app's anonymous telemetry, as the privacy policy says it (AquaTomeKit's `Telemetry`): the reader's switch,
/// "Gửi thống kê ẩn danh", on unless they turn it off; the site's flag (its index's `telemetry`), without which nothing
/// is sent; iOS's crash and performance reports (MetricKit); and the sending, every 30 s and when the app goes to the
/// background. Models record where an outcome is known (`Telemetry.record`).
@Observable
@MainActor
final class TelemetryModel {
  /// "Gửi thống kê ẩn danh". Off drops what waits to be sent, and nothing more is recorded.
  var readerOn: Bool {
    didSet {
      UserDefaults.standard.set(readerOn, forKey: Self.key)
      let on = readerOn
      Task { await telemetry.readerAllows(on) }
    }
  }
  @ObservationIgnored let telemetry: Telemetry
  @ObservationIgnored private var reports: Reports?
  #if DEBUG
  /// What the stand-in Worker received (the newest last), for the UI tests to read.
  fileprivate(set) var received: [String] = []
  #endif

  private static let key = "telemetry.on"
  /// The queue between launches: in the caches folder, out of the phone's backup.
  static let file = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "telemetry/queue.json")

  init(lang: String) {
    let on = UserDefaults.standard.object(forKey: Self.key) as? Bool ?? true
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0"
    let about = About(app: "\(version) (\(build))", os: UIDevice.current.systemVersion, device: Self.model, lang: lang)
    // Our own copies are marked, so the site leaves their events out as it leaves out their page views (OwnCopy).
    let mark: @Sendable () -> String? = { OwnCopy.isOurs ? "AquaTome-iOS \(AccountsClient.ourCopy)" : nil }
    var send = AccountsClient.urlSession()
    #if DEBUG && targetEnvironment(simulator)
    // The simulator (every UI test) never reaches the Worker: a stand-in, whose requests the tests read on the screen.
    let relay = Relay()
    let fake = FakeCollector(told: { r in
      let body = String(decoding: r.body, as: UTF8.self)
      Task { @MainActor in relay.model?.received = Array(((relay.model?.received ?? []) + [body]).suffix(12)) }
    })
    // `-telemetry-down`: it answers 503, as a Worker that's down (or a phone offline) leaves the queue waiting.
    if ProcessInfo.processInfo.arguments.contains("-telemetry-down") { fake.answer(503) }
    send = { try await fake.send($0) }
    #endif
    telemetry = Telemetry(about: about, readerAllows: on, file: Self.file, site: AccountsClient.site, send: send, userAgent: mark)
    readerOn = on
    #if DEBUG && targetEnvironment(simulator)
    relay.model = self
    #endif
  }

  /// After the first screen: iOS's reports, then a send every 30 s.
  func start() async {
    let reports = Reports(telemetry)
    self.reports = reports
    await Task.detached(priority: .utility) { MXMetricManager.shared.add(reports) }.value
    await telemetry.run()
  }

  /// The site's index said whether it takes the app's telemetry.
  func siteAllows(_ on: Bool) { Task { await telemetry.siteAllows(on) } }

  /// The app went to the background: what's recorded goes now, with a little time asked of iOS to finish.
  func leave() {
    let t = telemetry
    var id = UIBackgroundTaskIdentifier.invalid
    id = UIApplication.shared.beginBackgroundTask(withName: "telemetry") { UIApplication.shared.endBackgroundTask(id) }
    Task {
      await t.flush()
      UIApplication.shared.endBackgroundTask(id)
    }
  }

  /// The phone's model, as "iPhone17,3" (the same on every phone of that model); the simulator's, the model it runs as.
  private static var model: String {
    #if targetEnvironment(simulator)
    return ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? "simulator"
    #else
    var u = utsname()
    uname(&u)
    return withUnsafeBytes(of: &u.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
    #endif
  }
}

#if DEBUG
/// Passes the stand-in's requests on to the model, made after it.
@MainActor
private final class Relay {
  weak var model: TelemetryModel?
}
#endif

/// iOS's reports, as MetricKit gives them: a day's measures (launch time, memory, hangs) and crashes and hangs with their
/// call stacks, each sent as iOS wrote it.
private final class Reports: NSObject, MXMetricManagerSubscriber, Sendable {
  let telemetry: Telemetry
  init(_ telemetry: Telemetry) { self.telemetry = telemetry }
  func didReceive(_ payloads: [MXMetricPayload]) { for p in payloads { telemetry.diagnostic(.metric, json: p.jsonRepresentation()) } }
  func didReceive(_ payloads: [MXDiagnosticPayload]) { for p in payloads { telemetry.diagnostic(.diagnostic, json: p.jsonRepresentation()) } }
}
