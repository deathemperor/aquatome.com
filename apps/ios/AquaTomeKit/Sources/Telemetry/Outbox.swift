import Foundation

public typealias Send = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)

/// What waits to be sent, kept in a file so it outlasts the app being closed, and sending it: oldest first, one request
/// a batch or report, each only while both switches are on (`allowed`), and after a failure not again until a wait that
/// doubles each time. Capped: past `cap` events, the oldest go; past `diagnosticsCap` reports, the oldest go.
actor Outbox {
  static let cap = 500
  static let diagnosticsCap = 8

  struct Queued: Codable, Equatable {
    /// This phone's order, to find a batch again after sending it; not sent.
    let seq: Int
    var batch: Batch
  }

  struct State: Codable, Equatable {
    var batches: [Queued] = []
    var diagnostics: [Diagnostic] = []
    var next = 0
  }

  private(set) var state = State()
  /// The file has been read: not until something is to be sent, so never while the app launches.
  private var loaded = false
  private var sending = false
  private var changed = false
  private var failures = 0
  private var retryAt: Double = 0
  private let file: URL?
  private let site: URL
  private let send: Send
  private let userAgent: @Sendable () -> String?
  /// Seconds, on a clock that only goes forward.
  private let now: @Sendable () -> Double
  /// Both switches on, asked before each request: one turned off while the queue is being sent stops it there.
  private let allowed: @Sendable () -> Bool

  init(file: URL?, site: URL, send: @escaping Send, userAgent: @escaping @Sendable () -> String?, now: @escaping @Sendable () -> Double,
       allowed: @escaping @Sendable () -> Bool = { true }) {
    self.file = file
    self.site = site
    self.send = send
    self.userAgent = userAgent
    self.now = now
    self.allowed = allowed
  }

  /// Events of one session, in batches of at most `Wire.batchSize` (which keeps a batch under `Wire.maxBatch`: the
  /// largest event the contract takes is under 650 bytes); then the cap.
  /// Not when a switch is off: what was taken before it went off and reaches the queue after is dropped, not kept.
  func add(_ events: [Event], about: About, session: String) {
    guard !events.isEmpty, allowed() else { return }
    load()
    for part in stride(from: 0, to: events.count, by: Wire.batchSize) {
      state.batches.append(Queued(seq: state.next, batch: Batch(about, session: session, events: Array(events[part..<min(part + Wire.batchSize, events.count)]))))
      state.next += 1
    }
    var over = state.batches.reduce(0) { $0 + $1.batch.events.count } - Self.cap
    while over > 0, !state.batches.isEmpty {
      let n = min(over, state.batches[0].batch.events.count)
      state.batches[0].batch.events.removeFirst(n)
      if state.batches[0].batch.events.isEmpty { state.batches.removeFirst() }
      over -= n
    }
    changed = true
  }

  func add(_ diagnostics: [Diagnostic]) {
    guard !diagnostics.isEmpty, allowed() else { return }
    load()
    state.diagnostics = Array((state.diagnostics + diagnostics).suffix(Self.diagnosticsCap))
    changed = true
  }

  /// Everything waiting, on the phone and in the file, gone.
  func clear() {
    state = State()
    loaded = true
    changed = false
    if let file { try? FileManager.default.removeItem(at: file) }
  }

  /// Sends what waits, unless a failure's wait isn't over; then keeps what's left in the file.
  func flush() async {
    load()
    guard !sending, now() >= retryAt else { return save() }
    sending = true
    defer { sending = false; save() }
    while let q = state.batches.first {
      // Done with: it goes. Found by its number, since the cap or a switch turned off may have changed the queue meanwhile.
      guard await post(Wire.events, Wire.body(q.batch)) else { return }
      state.batches.removeAll { $0.seq == q.seq }
      changed = true
      if now() < retryAt { return }
    }
    while let d = state.diagnostics.first {
      guard await post(Wire.diagnostics, Wire.body(d)) else { return }
      if let i = state.diagnostics.firstIndex(of: d) { state.diagnostics.remove(at: i) }
      changed = true
      if now() < retryAt { return }
    }
  }

  /// Whether it's done with: taken (a 2xx), refused as it is (any other 4xx), or refused as too many this hour (429:
  /// dropped, as the contract asks, and nothing more sent until a wait). Otherwise (no network, a 5xx, the Worker not set
  /// up for it yet) it's tried again after a wait. Each wait doubles with each failure in a row. Not sent, and kept,
  /// when a switch is off (the switch's own task empties the queue).
  private func post(_ path: String, _ body: Data) async -> Bool {
    guard allowed() else { return false }
    let r = Wire.request(path, body: body, site: site, userAgent: userAgent())
    let status = (try? await send(r))?.1.statusCode
    if let status, (200..<500).contains(status), status != 408, status != 429 {
      failures = 0
      retryAt = 0
      return true
    }
    failures += 1
    retryAt = now() + Self.wait(afterFailures: failures)
    return status == 429
  }

  /// 30 s after the first failure, doubling, at most 30 minutes.
  static func wait(afterFailures n: Int) -> Double { min(30 * pow(2, Double(max(n, 1) - 1)), 1800) }

  private func load() {
    guard !loaded else { return }
    loaded = true
    guard let file, let data = try? Data(contentsOf: file), let kept = try? JSONDecoder().decode(State.self, from: data) else { return }
    state = kept
  }

  /// Written when the queue changed: not every half minute while it waits for the network.
  private func save() {
    guard changed, let file else { return }
    changed = false
    if state.batches.isEmpty && state.diagnostics.isEmpty {
      try? FileManager.default.removeItem(at: file)
      return
    }
    try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? JSONEncoder().encode(state).write(to: file, options: .atomic)
  }
}
