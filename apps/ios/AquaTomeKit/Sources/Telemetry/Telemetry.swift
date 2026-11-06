import Foundation
import os

/// The app's anonymous telemetry (the privacy policy's "Gửi thống kê ẩn danh"): usage events and iOS's crash and
/// performance reports, sent to aquatome.com's own Worker, never to anyone else.
///
/// - Two switches, both needed: the site's (`siteAllows`, its index's flag, read fresh this launch: nothing is sent
///   before the site takes it) and the reader's (`readerAllows`, on unless they turn it off). Each takes hold at once,
///   and the queue asks both again before each request. Either one off drops what waits, on the phone and in its file,
///   and records nothing more. Until the site's is known, events wait on the phone only, not in the file.
/// - Recording costs the caller an append under a lock: no file, no network. `flush` (every 30 s, and when the app
///   goes to the background) moves them to the queue (`Outbox`) and sends it, off the main thread.
public final class Telemetry: Sendable {
  private struct Waiting {
    var events: [Event] = []
    var diagnostics: [Diagnostic] = []
    /// nil until the site's index has said.
    var site: Bool?
    var reader: Bool
    var allowed: Bool { site == true && reader }
    var closed: Bool { site == false || !reader }

    /// Drops what waits on the phone; true, so the queue is cleared too.
    mutating func drop() -> Bool {
      events = []
      diagnostics = []
      return true
    }
  }

  /// Random, made anew at each launch and never reused for another launch (a batch waiting in the queue keeps its own).
  public let session = UUID().uuidString.lowercased()
  private let about: About
  private let started = ContinuousClock.now
  private let waiting: OSAllocatedUnfairLock<Waiting>
  private let outbox: Outbox

  /// `file`: where the queue is kept between launches (nil: on the phone only). `userAgent`: asked at each send, since
  /// whether this copy is one of ours is learnt after launch.
  public init(about: About, readerAllows: Bool, file: URL?, site: URL, send: @escaping Send,
              userAgent: @escaping @Sendable () -> String? = { nil },
              now: (@Sendable () -> Double)? = nil) {
    self.about = about
    let waiting = OSAllocatedUnfairLock(initialState: Waiting(reader: readerAllows))
    self.waiting = waiting
    outbox = Outbox(file: file, site: site, send: send, userAgent: userAgent, now: now ?? { Telemetry.seconds() },
                    allowed: { waiting.withLock { $0.allowed } })
  }

  /// An event, stamped with the time since the session started. Dropped when a switch is off, or when the contract
  /// wouldn't take it (the Worker would drop it); the oldest go past the cap.
  public func record(_ e: Event) {
    var stamped = e
    stamped.at = Int(started.duration(to: .now) / .milliseconds(1))
    guard stamped.fits else { return }
    let e = stamped
    waiting.withLock { w in
      guard !w.closed else { return }
      w.events.append(e)
      if w.events.count > Outbox.cap { w.events.removeFirst(w.events.count - Outbox.cap) }
    }
  }

  /// A report iOS gave the app (MetricKit's `jsonRepresentation()`), cut down to what the privacy policy names
  /// (`Diagnostic.kept`). Dropped when none of that is in it, or when it's larger than the Worker takes.
  public func diagnostic(_ kind: Diagnostic.Kind, json: Data) {
    guard let kept = Diagnostic.kept(kind, json: json) else { return }
    let d = Diagnostic(kind: kind, about: about, payload: String(decoding: kept, as: UTF8.self))
    guard Wire.body(d).count <= Wire.maxReport else { return }
    waiting.withLock { w in
      guard !w.closed else { return }
      w.diagnostics = Array((w.diagnostics + [d]).suffix(Outbox.diagnosticsCap))
    }
  }

  /// The site's flag, each time its index is read fresh.
  @discardableResult
  public func siteAllows(_ on: Bool) -> Task<Void, Never>? { set { $0.site = on } }

  /// The reader's switch.
  @discardableResult
  public func readerAllows(_ on: Bool) -> Task<Void, Never>? { set { $0.reader = on } }

  /// A switch set, at once: from here on, off, nothing more is recorded or sent, and what waits on the phone is
  /// dropped. The queue's file is emptied by the task returned (nil when on).
  private func set(_ change: @Sendable (inout Waiting) -> Void) -> Task<Void, Never>? {
    guard waiting.withLock({ w in change(&w); return w.closed ? w.drop() : false }) else { return nil }
    let outbox = outbox
    return Task { await outbox.clear() }
  }

  /// Moves what was recorded to the queue and sends what's due, when both switches are on.
  public func flush() async {
    let taken: (events: [Event], diagnostics: [Diagnostic])? = waiting.withLock { w in
      guard w.allowed else { return nil }
      defer { w.events = []; w.diagnostics = [] }
      return (w.events, w.diagnostics)
    }
    guard let taken else { return }
    // A switch turned off since: the queue takes none of it (`Outbox.add`), and sends nothing.
    await outbox.add(taken.events, about: about, session: session)
    await outbox.add(taken.diagnostics)
    await outbox.flush()
  }

  /// Flushes every `interval` until cancelled.
  public func run(every interval: Duration = .seconds(30)) async {
    while true {
      do { try await Task.sleep(for: interval) } catch { return }
      await flush()
    }
  }

  /// Seconds on a clock that only goes forward, since this run's first look at it: not the phone's uptime, which is an
  /// API Apple asks a reason for.
  static func seconds() -> Double { epoch.duration(to: .now) / .seconds(1) }
  private static let epoch = ContinuousClock.now

  /// What's queued now, for tests.
  var queued: (events: [Event], diagnostics: [Diagnostic]) {
    get async {
      let s = await outbox.state
      return (s.batches.flatMap(\.batch.events), s.diagnostics)
    }
  }

  /// What's recorded and not yet queued, for tests.
  var recorded: [Event] { waiting.withLock { $0.events } }
}
