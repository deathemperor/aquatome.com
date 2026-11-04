import Chihiros
import ChihirosBLE
import Foundation
import Observation
import Tanks
import UIKit
import WeekAqua

/// The Week Aqua screen on the Đèn tab: find the lights (5746 ones can be chosen; other codes are listed and never
/// written to), connect one or a group, set their colour and daily timer, set their clock. The lights report nothing,
/// so what the screen shows of them is what AquaTome last sent, kept on their records in "Bể của tôi".
@Observable
@MainActor
final class WeekAquaModel {
  struct Notice: Equatable {
    let text: String
    var isError = false
  }

  /// The screen is open (a Week Aqua light on a tank opens it).
  var isOpen = false
  private(set) var found: [FoundLight] = []
  private(set) var isScanning = false
  /// The lights chosen to connect together, in the order they were chosen.
  private(set) var chosen: [UUID] = []
  private(set) var isConnecting = false
  /// The lights connected, as one group.
  private(set) var group: [FoundLight] = []
  private(set) var isWriting = false
  var notice: Notice?
  #if DEBUG
  /// The frames sent, one entry a light, for the UI tests.
  private(set) var sentFrames: [String] = []
  #endif

  /// The WEEK AQUA preset the colour is; nil once a channel is moved by hand.
  private(set) var preset: String? = "green"
  /// The colour at full brightness: red, green, blue and UV, each 0–235.
  private(set) var mix = WeekAquaPreset.named("green")!.levels.array
  /// 0–100: scales `mix`, as WEEK AQUA's brightness slider scales a preset.
  var brightness = 100 { didSet { if brightness != oldValue { edited = true } } }
  var on = TimeOfDay(hour: 12, minute: 0) { didSet { if on != oldValue { edited = true } } }
  var off = TimeOfDay(hour: 20, minute: 0) { didSet { if off != oldValue { edited = true } } }
  /// Changed since the app opened: what was last sent doesn't replace the reader's edits.
  private var edited = false

  private let radio: Radio
  private let tanks: TanksModel?
  private var session: WeekAquaSession?
  private var scanTask: Task<Void, Never>?
  /// Counts connection attempts: one that was cancelled or overtaken reports nothing.
  private var attempt = 0

  init(radio: Radio, tanks: TanksModel?) {
    self.radio = radio
    self.tanks = tanks
  }

  var isConnected: Bool { session != nil }
  /// The levels a write sends.
  var levels: WeekAquaLevels { (WeekAquaLevels(mix) ?? .off).scaled(by: brightness) }
  var timer: DailyTimer { DailyTimer(on: on, off: off) }
  var canWrite: Bool { isConnected && !isWriting }
  /// The clock is set with what was last sent: nothing to set it with before the first write.
  var canSetClock: Bool { canWrite && lastSent != nil }
  /// The first write from AquaTome replaces the colour and timer the lights hold, maybe set in WEEK AQUA: ask.
  var writeNeedsConfirming: Bool { lastSent == nil }

  /// The records of the lights connected.
  var devices: [Device] { group.compactMap { tanks?.store.weekAquaLight(address: Self.key($0).address) } }
  /// What AquaTome last sent to the group: the newest send among its lights, which are written together.
  var lastSent: WeekAquaSent? { devices.compactMap(\.lastSent).max { $0.at < $1.at } }
  /// Not every light of the group was sent the same last (one was written apart, or missed a write).
  var sentDiffers: Bool { let last = lastSent; return devices.contains { $0.lastSent != last } }

  /// The Week Aqua lights on one of the reader's tanks: a group.
  struct SavedGroup: Identifiable {
    let tank: Tank
    let lights: [Device]
    var id: String { tank.id }
  }

  /// The Week Aqua lights kept on the reader's tanks, by tank.
  var savedGroups: [SavedGroup] {
    guard let tanks else { return [] }
    let lights = tanks.store.liveDevices.filter(\.isWeekAqua)
    return tanks.tanks.compactMap { t in
      let l = lights.filter { $0.tankId == t.id }
      return l.isEmpty ? nil : SavedGroup(tank: t, lights: l)
    }
  }

  // MARK: Finding and connecting

  func scan() {
    guard !isScanning, !isConnecting, !isConnected else { return }
    found = []
    chosen = []
    isScanning = true
    notice = nil
    scanTask = Task {
      do {
        let stream = try await radio.scan()
        let stop = Task { do { try await Task.sleep(for: .seconds(15)); self.stopScan() } catch {} }
        for await l in stream where l.weekAqua != nil && !found.contains(where: { $0.id == l.id }) { found.append(l) }
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

  /// A light chosen or let go for the group. Only a 5746 light can be.
  func toggle(_ l: FoundLight) {
    guard l.weekAqua?.isSupported == true else { return }
    if let i = chosen.firstIndex(of: l.id) { chosen.remove(at: i) } else { chosen.append(l.id) }
  }

  /// The lights chosen, connected as one group.
  func connectChosen() async {
    let lights = chosen.compactMap { id in found.first { $0.id == id } }
    guard !lights.isEmpty else { return }
    stopScan()
    attempt += 1
    await link(lights, attempt)
  }

  /// A group kept on a tank: looked for by the lights' addresses, then connected together. All of them or none: the
  /// group is written as one.
  func connect(saved lights: [Device]) async {
    var seen = Set<String>()
    let wanted = lights.compactMap(\.bleAddress).filter { seen.insert($0).inserted }
    guard !wanted.isEmpty, !isConnecting, !isConnected else { return }
    stopScan()
    attempt += 1
    let mine = attempt
    isConnecting = true
    notice = nil
    do {
      let stream = try await radio.scan()
      let stop = Task { do { try await Task.sleep(for: .seconds(15)); self.radio.stopScan() } catch {} }
      var hits: [String: FoundLight] = [:]
      for await l in stream {
        if let a = l.weekAqua?.addressText, wanted.contains(a) { hits[a] = l }
        if hits.count == wanted.count { break }
      }
      stop.cancel()
      radio.stopScan()
      guard mine == attempt else { return }
      guard hits.count == wanted.count else {
        isConnecting = false
        let n = wanted.count - hits.count
        notice = Notice(text: String(localized: "Không thấy \(n) đèn của nhóm quanh đây. Bật các đèn, lại gần rồi thử lại."), isError: true)
        return
      }
      await link(wanted.compactMap { hits[$0] }, mine)
    } catch {
      guard mine == attempt else { return }
      isConnecting = false
      fail(error)
    }
  }

  /// Connects each light in turn (one connection attempt at a time), then makes them one session. If one fails, the
  /// ones already connected are let go.
  private func link(_ lights: [FoundLight], _ mine: Int) async {
    isConnecting = true
    notice = nil
    defer { if mine == attempt { isConnecting = false } }
    var links: [WeekAquaLink] = []
    do {
      for l in lights {
        links.append(try await radio.connectWeekAqua(l) { [weak self] in self?.lost(l) })
        guard mine == attempt else { links.forEach { $0.disconnect() }; return } // cancelled meanwhile
      }
      let s = try WeekAquaSession(lights: links, pacing: radio.weekAquaPacing)
      #if DEBUG
      s.trace = { [weak self] _, f in
        guard let self else { return }
        self.sentFrames = Array((self.sentFrames + [f.map { String(format: "%02x", $0) }.joined(separator: " ")]).suffix(45))
      }
      #endif
      session = s
      group = lights
      found = []
      chosen = []
      tanks?.metWeekAqua(lights.map(Self.key))
      if let sent = lastSent, !edited { fill(sent) }
      notice = Notice(text: String(localized: "Đã kết nối \(lights.count) đèn Week Aqua."))
    } catch {
      links.forEach { $0.disconnect() }
      guard mine == attempt else { return }
      fail(error)
    }
  }

  /// Ngắt kết nối, or Hủy while connecting.
  func disconnect() {
    attempt += 1
    radio.stopScan()
    let s = session
    reset()
    notice = nil
    s?.disconnect()
  }

  /// A light of the group dropped: the group is let go whole, to be connected again together.
  private func lost(_ l: FoundLight) {
    guard group.contains(where: { $0.id == l.id }) else { return }
    let s = session
    reset()
    s?.disconnect()
    notice = Notice(text: String(localized: "Mất kết nối với \(l.name). Kết nối lại cả nhóm đèn."), isError: true)
  }

  private func reset() {
    session = nil
    group = []
    isConnecting = false
  }

  private func fail(_ error: Error) {
    notice = Notice(text: Self.describe(error), isError: true)
  }

  // MARK: The colour and the timer

  func choose(_ p: WeekAquaPreset) {
    preset = p.id
    mix = p.levels.array
    edited = true
  }

  /// One channel at `percent` of full (0–100), by hand: the colour is no longer a preset.
  func setChannel(_ i: Int, percent: Int) {
    let v = (max(0, min(100, percent)) * WeekAquaLevels.max + 50) / 100
    guard mix[i] != v else { return }
    mix[i] = v
    preset = nil
    edited = true
  }

  /// A channel's level as a percent of full.
  func percent(_ i: Int) -> Int { (mix[i] * 100 + WeekAquaLevels.max / 2) / WeekAquaLevels.max }

  /// What was last sent, back in the form: its preset and brightness when it came from one, else its levels.
  private func fill(_ s: WeekAquaSent) {
    if let p = s.preset.flatMap(WeekAquaPreset.named), let b = s.brightness, p.levels.scaled(by: b).array == s.levels {
      preset = p.id
      mix = p.levels.array
      brightness = b
    } else {
      preset = nil
      mix = s.levels
      brightness = 100
    }
    on = TimeOfDay(s.on) ?? on
    off = TimeOfDay(s.off) ?? off
    edited = false
  }

  // MARK: Writing

  /// The colour and timer in the form, with the clock, to every light of the group.
  func write() async {
    await send(WeekAquaSetting(levels: levels, timer: timer), preset: preset, brightness: brightness, clockOnly: false)
  }

  /// The lights' clock set to this phone's, sent with what was last sent: every write goes in the one order the lights
  /// take, so the colour and timer go again too, unchanged.
  func setClock() async {
    guard let s = lastSent, let levels = WeekAquaLevels(s.levels), let on = TimeOfDay(s.on), let off = TimeOfDay(s.off) else { return }
    await send(WeekAquaSetting(levels: levels, timer: DailyTimer(on: on, off: off)), preset: s.preset, brightness: s.brightness, clockOnly: true)
  }

  private func send(_ s: WeekAquaSetting, preset: String?, brightness: Int?, clockOnly: Bool) async {
    guard let session, !isWriting else { return }
    isWriting = true
    defer { isWriting = false }
    // A write takes about two seconds: one cut off by the app leaving would leave a light half written.
    let keep = UIApplication.shared.beginBackgroundTask(withName: "Week Aqua")
    defer { if keep != .invalid { UIApplication.shared.endBackgroundTask(keep) } }
    let lights = group
    let now = Date()
    var missed: [Int] = []
    do {
      try await session.write(s, now: now)
    } catch WeekAquaError.notSent(let m) {
      missed = m
    } catch {
      notice = Notice(text: String(localized: "Không gửi được lệnh tới đèn. Lại gần đèn rồi thử lại."), isError: true)
      return
    }
    // Kept only for the lights that took the whole write.
    let at = Timestamp.string(now)
    let sent = WeekAquaSent(levels: s.levels.array, on: s.timer.on.description, off: s.timer.off.description, preset: preset,
                            brightness: brightness, at: at)
    for (i, l) in lights.enumerated() where !missed.contains(i) {
      let k = Self.key(l)
      tanks?.changeWeekAqua(address: k.address, bleName: k.bleName) {
        $0.lastSent = sent
        $0.clockSyncedAt = at
      }
    }
    if !missed.isEmpty {
      let names = missed.map { lights[$0].name }.joined(separator: ", ")
      notice = Notice(text: String(localized: "Không gửi hết được tới \(names). Lại gần đèn rồi ghi lại."), isError: true)
    } else if clockOnly {
      notice = Notice(text: String(localized: "Đã chỉnh giờ \(lights.count) đèn theo máy này, cùng màu và hẹn giờ đã gửi lần cuối."))
    } else {
      notice = Notice(text: String(localized: "Đã ghi vào \(lights.count) đèn: bật \(s.timer.on.description), tắt \(s.timer.off.description)."))
    }
  }

  // MARK: Words

  /// A light's record key: its own address, else (it didn't advertise one) this phone's id for it.
  static func key(_ l: FoundLight) -> (address: String, bleName: String) {
    (l.weekAqua?.addressText ?? l.id.uuidString, l.name)
  }

  /// WEEK AQUA's name for a preset, as its app shows it ("Green").
  static func presetName(_ id: String) -> String { id.prefix(1).uppercased() + id.dropFirst() }

  /// "Green 50% · bật 02:50, tắt 02:40"; a colour set by hand is "Màu riêng".
  static func label(_ s: WeekAquaSent) -> String {
    let colour = s.preset.flatMap(WeekAquaPreset.named).map { presetName($0.id) } ?? String(localized: "Màu riêng")
    let bright = s.brightness.map { " \($0)%" } ?? ""
    return "\(colour)\(bright) · " + String(localized: "bật \(s.on), tắt \(s.off)")
  }

  /// When something was sent, in the phone's words ("3 thg 11, 21:35").
  static func day(_ timestamp: String) -> String {
    guard let ms = Timestamp.millis(timestamp) else { return "" }
    return Date(timeIntervalSince1970: Double(ms) / 1000).formatted(date: .abbreviated, time: .shortened)
  }

  static func describe(_ error: Error) -> String {
    switch error {
    case BluetoothError.unauthorized:
      String(localized: "AquaTome chưa được dùng Bluetooth. Bật trong Cài đặt → AquaTome → Bluetooth.")
    case BluetoothError.poweredOff:
      String(localized: "Bluetooth đang tắt. Bật Bluetooth rồi thử lại.")
    case BluetoothError.unsupported:
      String(localized: "Máy này không có Bluetooth.")
    case BluetoothError.notSupported, WeekAquaError.notSupported:
      String(localized: "Đèn này chưa được hỗ trợ: AquaTome chỉ ghi vào đèn Week Aqua mã 5746.")
    default:
      String(localized: "Không kết nối được. Lại gần đèn, đóng ứng dụng WEEK AQUA trên các máy khác rồi thử lại.")
    }
  }
}
