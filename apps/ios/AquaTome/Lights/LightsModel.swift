import Chihiros
import ChihirosBLE
import Foundation
import Observation

/// The lights screen: scan, connect, read what the light holds, write a schedule, set its clock, set levels by hand.
@Observable
@MainActor
final class LightsModel {
  struct Notice: Equatable {
    let text: String
    var isError = false
  }

  private(set) var found: [FoundLight] = []
  private(set) var isScanning = false
  private(set) var connecting: FoundLight.ID?
  private(set) var light: FoundLight?
  private(set) var model: Model?
  private(set) var firmware: Int?
  private(set) var snapshot: Snapshot?
  private(set) var isBusy = false
  private(set) var isManual = false
  /// The schedule the light held before this app last replaced it, to put back.
  private(set) var previous: Schedule?
  var notice: Notice?

  /// The schedule form.
  var on = TimeOfDay(hour: 12, minute: 0)
  var off = TimeOfDay(hour: 20, minute: 0)
  var ramp = 30
  var levels = [70, 70, 70, 70]
  /// The manual sliders, by channel.
  var manual: [Int: Int] = [:]

  private let radio: Radio
  private let store: UserDefaults
  private var session: LightSession?
  private var scanTask: Task<Void, Never>?
  private var pending: [Int: Int] = [:]
  private var flushing = false

  init(radio: Radio, store: UserDefaults = .standard) {
    self.radio = radio
    self.store = store
  }

  var isConnected: Bool { session != nil }
  var channels: [Channel] { model?.channels ?? [.red, .green, .blue] }
  var form: Schedule { Schedule(on: on, off: off, ramp: ramp, levels: Array(levels.prefix(channels.count))) }
  var saved: Schedule? { snapshot?.schedule(channels: channels.count) }
  var canWrite: Bool { isConnected && !isBusy && form.problem == nil && (firmware ?? 0) >= 20 }
  /// Minutes the light's clock is off from the phone's; nil if it isn't set (after a power cut).
  var clockOff: Int? { snapshot?.clock.drift(from: Date()).map(abs) }
  var clockNeedsSync: Bool { snapshot.map { !$0.clock.isSet || ($0.clock.drift(from: Date()).map(abs) ?? 0) > 2 } ?? false }

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
        notice = Notice(text: Self.describe(error), isError: true)
      }
      isScanning = false
    }
  }

  func stopScan() {
    radio.stopScan()
    scanTask?.cancel()
    isScanning = false
  }

  func connect(_ l: FoundLight) async {
    guard let m = Model.of(name: l.name) else {
      notice = Notice(text: String(localized: "Đèn \(l.name) chưa được hỗ trợ."), isError: true)
      return
    }
    stopScan()
    connecting = l.id
    notice = Notice(text: String(localized: "Đang kết nối…"))
    defer { connecting = nil }
    var s: LightSession?
    do {
      let link = try await radio.connect(l) { [weak self] in self?.lost() }
      let new = LightSession(name: l.name, model: m, link: link, pacing: radio.pacing)
      s = new
      session = new
      light = l
      model = m
      isManual = false
      manual = [:]
      previous = loadPrevious(l)
      let snap = try await new.refresh()
      guard session === new else { return } // disconnected while reading
      show(snap)
      if let saved { fill(from: saved) }
      notice = Notice(text: new.canWriteSchedule
        ? String(localized: "Đã kết nối \(m.name) (\(l.name)), firmware \(snap.firmware).")
        : String(localized: "Đã kết nối \(m.name) (\(l.name)), firmware \(snap.firmware): bản này chưa hẹn giờ được từ ứng dụng, cập nhật firmware bằng ứng dụng My Chihiros."))
    } catch {
      guard s == nil || session === s else { return } // disconnected while reading: nothing to report
      session?.disconnect()
      session = nil
      light = nil
      notice = Notice(text: Self.describe(error), isError: true)
    }
  }

  func disconnect() {
    session?.disconnect()
    reset()
    notice = nil
  }

  private func lost() {
    guard session != nil else { return }
    reset()
    notice = Notice(text: String(localized: "Đèn đã ngắt kết nối."))
  }

  private func reset() {
    session = nil
    light = nil
    snapshot = nil
    firmware = nil
    isBusy = false
    pending = [:]
  }

  // MARK: Commands

  func applyPreset(_ p: Preset) {
    on = p.on
    off = p.off
    levels = levels.map { _ in p.level }
  }

  /// Writes the form's schedule (after keeping the light's current one to put back).
  func writeSchedule() async {
    let s = form
    guard let session, let light, s.problem == nil else { return }
    // Kept before writing: a write that stops halfway leaves the light with no schedule, and this one must survive.
    // The light keeps one level for all channels, so "the same" is what it would report back.
    if let snapshot, let saved, !snapshot.holds(s, channels: channels.count) { keepPrevious(saved, for: light) }
    await run(session) {
      let snap = try await session.writeSchedule(s)
      guard self.session === session else { return }
      self.show(snap)
      self.isManual = false
      // The light runs the schedule now: the manual levels no longer hold.
      self.manual = [:]
      self.pending = [:]
      self.notice = snap.holds(s, channels: self.channels.count)
        ? Notice(text: String(localized: "Đã ghi lịch: bật \(s.on.description), tắt \(s.off.description). Đèn chạy theo lịch từ bây giờ."))
        : Notice(text: String(localized: "Đèn chưa báo lại lịch mới. Kiểm tra lại sau ít phút."), isError: true)
    }
  }

  /// Puts back the schedule the light held before this app replaced it.
  func restorePrevious() async {
    guard let previous else { return }
    fill(from: previous)
    await writeSchedule()
  }

  func syncClock() async {
    guard let session else { return }
    await run(session) {
      let snap = try await session.syncClock()
      guard self.session === session else { return }
      self.show(snap)
      self.notice = Notice(text: String(localized: "Đã chỉnh giờ đèn: \(Date().formatted(date: .omitted, time: .shortened))."))
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

  private func show(_ snap: Snapshot) {
    snapshot = snap
    firmware = snap.firmware
  }

  private func fill(from s: Schedule) {
    on = s.on
    off = s.off
    ramp = s.ramp
    for (i, l) in s.levels.enumerated() where i < levels.count { levels[i] = l }
  }

  // MARK: The schedule to put back, kept on the phone per light

  private func key(_ l: FoundLight) -> String { "previousSchedule.\(l.id.uuidString)" }

  private func keepPrevious(_ s: Schedule, for l: FoundLight) {
    previous = s
    store.set([s.on.minutes, s.off.minutes, s.ramp] + s.levels, forKey: key(l))
  }

  private func loadPrevious(_ l: FoundLight) -> Schedule? {
    guard let v = store.array(forKey: key(l)) as? [Int], v.count >= 4 else { return nil }
    return Schedule(on: TimeOfDay(minutes: v[0]), off: TimeOfDay(minutes: v[1]), ramp: v[2], levels: Array(v[3...]))
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
      String(localized: "Không gửi được lệnh tới đèn.")
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
