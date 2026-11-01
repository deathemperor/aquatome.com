import Chihiros
import ChihirosBLE
import Foundation
import Observation
import Tanks

/// The lights screen, as the site's Chihiros page (pages/vi/cong-cu/den-chihiros.astro, scripts/light-page.ts): the light
/// card (find, connect, what the app knows of the light, quick actions), the schedule being edited, writing it.
@Observable
@MainActor
final class LightsModel {
  struct Notice: Equatable {
    let text: String
    var isError = false
    /// A button beside the text: put the last schedule back, or connect again to the light that dropped.
    var action: Action?
  }
  enum Action { case undo, reconnect }
  /// What the light card shows.
  enum Card { case unsupported, idle, connecting, ready }
  enum ClockState: Equatable {
    case right
    case unread
    /// Reset by a power cut: it isn't any real time.
    case lost
    /// Minutes ahead (negative: behind).
    case off(Int)
  }

  private(set) var found: [FoundLight] = []
  private(set) var isScanning = false
  /// While connecting: what the card says (looking for a saved light, connecting, connecting again).
  private(set) var connecting: String?
  private(set) var light: FoundLight?
  private(set) var model: Model?
  private(set) var firmware: Int?
  private(set) var snapshot: Snapshot?
  /// When the light sent `snapshot`: its clock is compared with the phone's at that moment, not whenever the screen redraws.
  private var snapshotAt = Date()
  private(set) var isBusy = false
  private(set) var isWriting = false
  /// The light is in manual mode because of this app (a level set by hand): "Theo lịch" takes it back.
  private(set) var isManual = false
  /// Bluetooth refused or missing: the card says so, and planning still works.
  private(set) var refused: BluetoothError?
  /// The light dropped on its own; `lastLight` is connected to again without a scan.
  private(set) var isLost = false
  private var lastLight: FoundLight?
  /// The clock was set while connected.
  private(set) var synced = false
  /// The schedule written before the last write, to put back ("Hoàn tác").
  private var undo: (schedule: Schedule, name: String?)?
  var notice: Notice?
  #if DEBUG
  /// The last frames sent, for the UI tests (the site's tests read the fake light's frames the same way).
  private(set) var sentFrames: [String] = []
  #endif

  /// The schedule being edited, kept on the phone (as the site keeps its draft) until written.
  var on = TimeOfDay(hour: 12, minute: 0) { didSet { if on != oldValue { planName = nil; edit() } } }
  var off = TimeOfDay(hour: 20, minute: 0) { didSet { if off != oldValue { planName = nil; edit() } } }
  var ramp = 30 { didSet { if ramp != oldValue { planName = nil; edit() } } }
  /// The preset the form came from, kept with the schedule written (as the site does); changing its hours drops it,
  /// changing only its levels keeps it.
  private(set) var planName: String?
  var levels = [70, 70, 70, 70] { didSet { if levels != oldValue { edit() } } }
  /// Touched since the app opened: a known light's schedule doesn't replace the reader's edits.
  private(set) var edited = false
  /// The manual sliders, by channel.
  var manual: [Int: Int] = [:]

  private let radio: Radio
  private let store: UserDefaults
  /// "Bể của tôi": each light connected, the schedules written to it and when its clock was set, as on the site.
  private let tanks: TanksModel?
  private var session: LightSession?
  private var scanTask: Task<Void, Never>?
  private var pending: [Int: Int] = [:]
  private var flushing = false
  /// Counts connection attempts: one that was cancelled or overtaken reports nothing.
  private var attempt = 0
  private var filling = false
  private static let draftKey = "light.draft"

  init(radio: Radio, store: UserDefaults = .standard, tanks: TanksModel? = nil) {
    self.radio = radio
    self.store = store
    self.tanks = tanks
    if radio.isRefused { refused = .unauthorized }
    loadDraft()
  }

  var isConnected: Bool { session != nil }
  var card: Card {
    if connecting != nil { return .connecting }
    if session != nil { return .ready }
    return refused == nil ? .idle : .unsupported
  }
  /// The light's channels; before connecting, those of the light last used here.
  var channels: [Channel] {
    model?.channels ?? savedLights.lazy.compactMap { $0.bleName.flatMap(Model.of(name:)) }.first?.channels ?? [.red, .green, .blue]
  }
  var form: Schedule { Schedule(on: on, off: off, ramp: ramp, levels: Array(levels.prefix(channels.count))) }

  /// The lights kept on the reader's tanks, the one changed last first.
  var savedLights: [Device] {
    (tanks?.store.liveDevices ?? []).filter { $0.kind == "light" }
      .sorted { Array($1.updatedAt.utf16).lexicographicallyPrecedes(Array($0.updatedAt.utf16)) }
  }
  /// The record of the light connected (or the one that dropped).
  var device: Device? { (light ?? (isLost ? lastLight : nil)).flatMap { tanks?.store.light(bleName: $0.name) } }
  /// The schedule last written to this light from AquaTome (here or on the site). What the light runs isn't shown as
  /// such: it may have been changed since in the My Chihiros app.
  var active: SavedSchedule? { device.flatMap { d in d.schedules.first { $0.id == d.activeScheduleId } } }
  /// The form is the schedule last written: nothing to write.
  var formIsActive: Bool {
    guard let a = active else { return false }
    let f = form
    return a.on == f.on.description && a.off == f.off.description && a.ramp == f.ramp && a.levels == f.levels
  }
  var canWrite: Bool { isConnected && !isBusy && form.problem == nil && (firmware ?? 0) >= 20 && !formIsActive }
  /// The first write from AquaTome replaces whatever the light holds, maybe a schedule from the My Chihiros app: ask.
  var writeNeedsConfirming: Bool { active == nil }
  var canGoBackToSchedule: Bool { isConnected && !isBusy && (isManual || device?.manual != nil) }

  var clock: ClockState {
    if synced { return .right }
    guard let c = snapshot?.clock else { return .unread }
    guard let d = c.drift(from: snapshotAt) else { return .lost }
    return abs(d) <= 1 ? .right : .off(d)
  }

  /// A saved light's name: the reader's, else its model.
  static func title(_ d: Device) -> String { d.nickname ?? d.model ?? d.bleName ?? "" }

  // MARK: Finding and connecting

  func scan() {
    guard !isScanning else { return }
    found = []
    isScanning = true
    notice = nil
    scanTask = Task {
      do {
        let stream = try await radio.scan()
        let stop = Task { do { try await Task.sleep(for: .seconds(15)); self.stopScan() } catch {} }
        for await l in stream where !found.contains(where: { $0.id == l.id }) && Model.of(name: l.name) != nil {
          found.append(l)
        }
        stop.cancel()
      } catch {
        fail(error)
      }
      isScanning = false
    }
  }

  func stopScan() {
    radio.stopScan()
    scanTask?.cancel()
    isScanning = false
  }

  /// A light kept on the tanks: the one that just dropped is connected to again as it was; any other is looked for by
  /// its name first.
  func connect(saved d: Device) async {
    guard let name = d.bleName else { return }
    if isLost, let l = lastLight, l.name == name { return await reconnect() }
    stopScan()
    attempt += 1
    let mine = attempt
    connecting = String(localized: "Đang tìm \(Self.title(d))…")
    notice = nil
    do {
      let stream = try await radio.scan()
      let stop = Task { do { try await Task.sleep(for: .seconds(15)); self.radio.stopScan() } catch {} }
      var hit: FoundLight?
      for await l in stream where l.name == name { hit = l; break }
      stop.cancel()
      radio.stopScan()
      guard mine == attempt else { return }
      guard let hit else {
        connecting = nil
        notice = Notice(text: String(localized: "Không thấy \(Self.title(d)) quanh đây. Bật đèn, lại gần rồi thử lại."), isError: true)
        return
      }
      await connect(hit)
    } catch {
      guard mine == attempt else { return }
      connecting = nil
      fail(error)
    }
  }

  /// The light that dropped, without a scan; if that fails, looked for again by its name.
  func reconnect() async {
    guard let l = lastLight else { return }
    if await connect(l, again: true) {
      lastLight = nil
      if let d = tanks?.store.light(bleName: l.name) { await connect(saved: d) }
    }
  }

  /// Whether it failed (an error reported; not cancelled).
  @discardableResult
  func connect(_ l: FoundLight, again: Bool = false) async -> Bool {
    guard let m = Model.of(name: l.name) else {
      notice = Notice(text: String(localized: "Đèn \(l.name) chưa được hỗ trợ."), isError: true)
      return true
    }
    stopScan()
    attempt += 1
    let mine = attempt
    connecting = again ? String(localized: "Đang kết nối lại…") : String(localized: "Đang kết nối…")
    notice = nil
    defer { if mine == attempt { connecting = nil } }
    var s: LightSession?
    do {
      let link = try await radio.connect(l) { [weak self] in self?.lost() }
      guard mine == attempt else { link.disconnect(); return false } // cancelled while connecting
      let new = LightSession(name: l.name, model: m, link: link, pacing: radio.pacing)
      #if DEBUG
      new.trace = { [weak self] sent, bytes in
        guard sent, let self else { return }
        self.sentFrames = Array((self.sentFrames + [bytes.map { String(format: "%02x", $0) }.joined(separator: " ")]).suffix(12))
      }
      #endif
      s = new
      session = new
      light = l
      let before = channels.count
      model = m
      found = []
      isManual = false
      isLost = false
      lastLight = nil
      synced = false
      undo = nil
      manual = [:]
      let snap = try await new.refresh()
      guard session === new else { return false } // disconnected while reading
      let known = tanks?.store.light(bleName: l.name) != nil
      tanks?.metLight(bleName: l.name, model: m.name)
      show(snap)
      if let a = active, !edited {
        fill(Schedule(on: TimeOfDay(a.on) ?? on, off: TimeOfDay(a.off) ?? off, ramp: a.ramp, levels: a.levels), name: a.name)
        keepDraft()
      } else {
        // The levels planned for another light, fitted to this one's channels (a white-only light takes the brightest).
        let fitted = fit(Array(levels.prefix(before)), to: m.channels.count)
        for (i, l) in fitted.enumerated() where i < levels.count { levels[i] = l }
      }
      let name = device?.nickname ?? m.name
      notice = Notice(text: !new.canWriteSchedule
        ? String(localized: "Đã kết nối \(m.name), firmware \(snap.firmware): bản này chưa hẹn giờ được từ ứng dụng, cập nhật firmware bằng ứng dụng My Chihiros.")
        : known ? String(localized: "Đã kết nối \(name).") : String(localized: "Đã kết nối \(m.name). Đèn mới: làm theo các bước trong khung này."))
      return false
    } catch {
      guard mine == attempt, s == nil || session === s else { return false } // disconnected while reading: nothing to report
      session?.disconnect()
      session = nil
      light = nil
      fail(error)
      return true
    }
  }

  /// Ngắt kết nối, or Hủy while connecting.
  func disconnect() {
    attempt += 1
    radio.stopScan()
    connecting = nil
    session?.disconnect()
    reset()
    isLost = false
    lastLight = nil
    notice = nil
  }

  func forget(_ d: Device) {
    if isLost, lastLight?.name == d.bleName { isLost = false; lastLight = nil }
    tanks?.forgetLight(d.id)
    notice = Notice(text: String(localized: "Đã quên đèn trên máy này."))
  }

  /// Back from the Settings app, maybe with Bluetooth allowed now.
  func checkBluetooth() {
    if refused == .unauthorized, !radio.isRefused { refused = nil }
  }

  private func lost() {
    guard session != nil, let l = light else { return }
    attempt += 1
    connecting = nil // dropped while its status was being read
    reset()
    isLost = true
    lastLight = l
    notice = Notice(text: String(localized: "Mất kết nối với đèn. Lại gần đèn rồi bấm “Kết nối lại”."), isError: true, action: .reconnect)
  }

  private func reset() {
    session = nil
    light = nil
    snapshot = nil
    firmware = nil
    isBusy = false
    isManual = false
    synced = false
    undo = nil
    pending = [:]
  }

  private func fail(_ error: Error) {
    if let e = error as? BluetoothError, e == .unauthorized || e == .unsupported { refused = e }
    notice = Notice(text: Self.describe(error), isError: true)
  }

  // MARK: Commands

  func applyPreset(_ p: Preset) {
    on = p.on
    off = p.off
    levels = levels.map { _ in p.level }
    planName = String(localized: p.name)
    edited = true // even a preset the form already matched: chosen
    keepDraft()
  }

  func rename(_ text: String) {
    let name = TankFields.capped(text.trimmingCharacters(in: .whitespacesAndNewlines), TankFields.nameMax)
    let new = name.isEmpty ? nil : name
    // Unchanged: the same name, or none given (or the model's) where there was none.
    guard let d = device, new != d.nickname, !(d.nickname == nil && (new == nil || new == model?.name)) else { return }
    if changeLight({ $0.nickname = new }) { notice = Notice(text: String(localized: "Đã đổi tên đèn.")) }
  }

  /// Writes the form's schedule, then offers to put back the one written before it.
  func writeSchedule() async { await write(form, name: planName, undoing: false) }

  /// "Hoàn tác": the schedule written before the last write, written again.
  func undoWrite() async {
    guard let u = undo else { return }
    fill(u.schedule, name: u.name)
    keepDraft()
    await write(u.schedule, name: u.name, undoing: true)
  }

  private func write(_ s: Schedule, name: String?, undoing: Bool) async {
    guard let session, s.problem == nil else { return }
    let before = active
    isWriting = true
    defer { isWriting = false }
    await run(session) {
      // The levels being sent by hand stop: the schedule comes next, after any already on their way.
      self.pending = [:]
      while self.flushing { try await Task.sleep(for: .milliseconds(20)) }
      let snap = try await session.writeSchedule(s)
      guard self.session === session else { return }
      self.show(snap)
      self.isManual = false
      // The light runs the schedule now: the manual levels no longer hold.
      self.manual = [:]
      // Kept only once the light read it back: one it didn't confirm isn't recorded as written.
      self.synced = true // the clock went first, acknowledged
      guard snap.holds(s, channels: self.channels.count) else {
        // Not recorded as written, but the levels set by hand no longer hold and the clock was set.
        self.changeLight {
          $0.manual = nil
          $0.clockSyncedAt = Timestamp.string(Date())
        }
        self.notice = Notice(text: String(localized: "Đèn chưa báo lại lịch mới. Kiểm tra lại sau ít phút."), isError: true)
        return
      }
      self.remember(s, name: name, at: Date())
      self.undo = undoing ? nil : before.flatMap { b in
        TimeOfDay(b.on).flatMap { on in TimeOfDay(b.off).map { (Schedule(on: on, off: $0, ramp: b.ramp, levels: b.levels), b.name) } }
      }
      self.notice = Notice(text: String(localized: "Đã ghi: bật \(s.on.description), tắt \(s.off.description). Đèn chạy theo lịch từ bây giờ."),
                           action: self.undo == nil ? nil : .undo)
    }
  }

  func syncClock() async {
    guard let session else { return }
    await run(session) {
      let snap = try await session.syncClock()
      guard self.session === session else { return }
      self.show(snap)
      self.synced = true
      self.changeLight { $0.clockSyncedAt = Timestamp.string(Date()) }
      self.notice = Notice(text: String(localized: "Đã chỉnh giờ đèn: \(Date().formatted(date: .omitted, time: .shortened))."))
    }
  }

  /// "Tắt đèn" (off: true) or "Sáng hết": every channel by hand, kept on the light's record (the light can't report
  /// levels set by hand), until "Theo lịch" or a schedule is written.
  func quick(off: Bool) async {
    guard let session else { return }
    let levels = channels.map { _ in off ? 0 : 100 }
    await run(session) {
      self.pending = [:]
      while self.flushing { try await Task.sleep(for: .milliseconds(20)) }
      for (c, l) in levels.enumerated() { try await session.setLevel(channel: c, level: l) }
      guard self.session === session else { return }
      self.isManual = true
      self.manual = Dictionary(uniqueKeysWithValues: levels.enumerated().map { ($0, $1) })
      self.changeLight { $0.manual = (levels, Timestamp.string(Date())) }
      self.notice = Notice(text: off
        ? String(localized: "Đã tắt đèn. Đèn bỏ qua lịch cho tới khi bấm “Theo lịch”.")
        : String(localized: "Đèn sáng hết. Đèn bỏ qua lịch cho tới khi bấm “Theo lịch”."))
    }
  }

  /// "Theo lịch": a schedule AquaTome wrote is written again as it was; any other (the My Chihiros app's) is left to run
  /// with one frame (LightSession.backToSchedule).
  func backToSchedule() async {
    guard let session else { return }
    let known = active.flatMap { a in TimeOfDay(a.on).flatMap { on in TimeOfDay(a.off).map { Schedule(on: on, off: $0, ramp: a.ramp, levels: a.levels) } } }
    await run(session) {
      self.pending = [:]
      while self.flushing { try await Task.sleep(for: .milliseconds(20)) }
      let snap = try await session.backToSchedule(known)
      guard self.session === session else { return }
      if let snap { self.show(snap) }
      self.isManual = false
      self.manual = [:]
      self.changeLight { $0.manual = nil }
      self.notice = Notice(text: String(localized: "Đèn chạy lại theo lịch."))
    }
  }

  /// A manual level. While a write is under way, only each channel's latest level waits to go next.
  func setLevel(channel: Int, level: Int) {
    manual[channel] = level
    pending[channel] = level
    Task { await flush() }
  }

  private func flush() async {
    guard !flushing, let session else { return }
    flushing = true
    defer { flushing = false }
    do {
      while !pending.isEmpty, self.session === session {
        let batch = pending.sorted { $0.key < $1.key }
        pending = [:]
        for (c, l) in batch { try await session.setLevel(channel: c, level: l) }
        if self.session === session { isManual = true }
      }
    } catch {
      guard self.session === session else { return }
      pending = [:]
      notice = Notice(text: Self.describe(error), isError: true)
    }
  }

  /// A command on `s`. Once `s` is no longer the light shown (disconnected, dropped), its outcome is not reported: the
  /// screen already says what happened.
  private func run(_ s: LightSession, _ body: @escaping @MainActor () async throws -> Void) async {
    isBusy = true
    defer { if session === s { isBusy = false } }
    do { try await body() } catch { if session === s { notice = Notice(text: Self.describe(error), isError: true) } }
  }

  /// After a write: the clock was set and levels set by hand no longer hold, as the site keeps them.
  private func remember(_ s: Schedule, name: String?, at: Date) {
    changeLight {
      $0.wrote(on: s.on.description, off: s.off.description, ramp: s.ramp, levels: s.levels, name: name, at: at)
      $0.manual = nil
      $0.clockSyncedAt = Timestamp.string(at)
    }
  }

  /// Whether it was saved.
  @discardableResult
  private func changeLight(_ change: (inout Device) -> Void) -> Bool {
    guard let light, let model, let tanks else { return false }
    return tanks.changeLight(bleName: light.name, model: model.name, change)
  }

  private func show(_ snap: Snapshot) {
    snapshot = snap
    snapshotAt = Date()
    firmware = snap.firmware
  }

  // MARK: The schedule being edited, kept on the phone

  private func edit() {
    guard !filling else { return }
    edited = true
    keepDraft()
  }

  private func fill(_ s: Schedule, name: String?) {
    filling = true
    defer { filling = false }
    on = s.on
    off = s.off
    ramp = s.ramp
    for (i, l) in s.levels.enumerated() where i < levels.count { levels[i] = l }
    planName = name
  }

  private func keepDraft() {
    var d: [String: Any] = ["on": on.description, "off": off.description, "ramp": ramp, "levels": levels]
    if let planName { d["name"] = planName }
    store.set(d, forKey: Self.draftKey)
  }

  private func loadDraft() {
    guard let d = store.dictionary(forKey: Self.draftKey), let on = (d["on"] as? String).flatMap(TimeOfDay.init),
          let off = (d["off"] as? String).flatMap(TimeOfDay.init), let ramp = d["ramp"] as? Int, let levels = d["levels"] as? [Int],
          levels.count == self.levels.count else { return }
    fill(Schedule(on: on, off: off, ramp: ramp, levels: levels), name: d["name"] as? String)
  }

  // MARK: Messages

  static func describe(_ error: Error) -> String {
    switch error {
    case BluetoothError.unauthorized:
      String(localized: "AquaTome chưa được dùng Bluetooth. Bật trong Cài đặt → AquaTome → Bluetooth.")
    case BluetoothError.poweredOff:
      String(localized: "Bluetooth đang tắt. Bật Bluetooth rồi thử lại.")
    case BluetoothError.unsupported:
      String(localized: "Máy này không có Bluetooth.")
    case BluetoothError.notFound, BluetoothError.timeout, BluetoothError.noUART, BluetoothError.failed:
      String(localized: "Không kết nối được. Lại gần đèn, đóng ứng dụng My Chihiros trên các máy khác rồi thử lại.")
    case SessionError.noStatus:
      String(localized: "Đèn không trả lời. Ngắt kết nối rồi kết nối lại.")
    case SessionError.firmwareTooOld:
      String(localized: "Firmware của đèn chưa hẹn giờ được từ ứng dụng. Cập nhật firmware bằng ứng dụng My Chihiros.")
    default:
      String(localized: "Không gửi được lệnh tới đèn. Lại gần đèn rồi thử lại.")
    }
  }
}

/// Planted-tank starting points: 6–8 hours a day at a fixed time, less and dimmer while a tank is new or fighting algae.
/// The same as the site's Chihiros page.
struct Preset: Identifiable {
  let id: String
  let name: LocalizedStringResource
  let on: TimeOfDay
  let off: TimeOfDay
  let level: Int

  static let all = [
    Preset(id: "new", name: "Bể mới trồng", on: TimeOfDay(hour: 13, minute: 0), off: TimeOfDay(hour: 19, minute: 0), level: 40),
    Preset(id: "settled", name: "Bể đã ổn định", on: TimeOfDay(hour: 12, minute: 0), off: TimeOfDay(hour: 20, minute: 0), level: 70),
    Preset(id: "algae", name: "Bể đang bị rêu", on: TimeOfDay(hour: 14, minute: 0), off: TimeOfDay(hour: 20, minute: 0), level: 50),
  ]
}
