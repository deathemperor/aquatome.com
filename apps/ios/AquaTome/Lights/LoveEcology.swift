@preconcurrency import CoreBluetooth
import FishLamp
import SwiftUI
import Tanks
import UIKit

/// The owner's Love Ecology light ("Aquarium Light III" in the Fish lamp app). It takes commands by broadcast, as Fish lamp
/// sends them, never over a connection: there's nothing to find or connect, and the light says nothing back. Each command
/// is broadcast for three seconds: on and off play back the owner's own recordings (`FishLamp.loveEcology`), as the Mac's
/// replays did that the owner watched work (31 Oct, 6 Nov; docs/research/aquarium-device-control.md); colours are built
/// anew at the card's brightness, as a white was that the light took from the Mac on 14 Nov, and the owner's trial row
/// tries a built on and off. iOS broadcasts only while the app is in front. The owner's account alone sees it: whether
/// the recordings work on anyone else's light is untested.
@MainActor
protocol LampAir: AnyObject {
  /// Broadcasts the 16-bit service UUIDs (4 hex digits each), in order, until `stop`. `done` says whether it started.
  func start(_ uuids: [String], done: @escaping @MainActor (LampAirError?) -> Void)
  func stop()
}

enum LampAirError: Error { case off, refused, unsupported, failed }

/// The phone's Bluetooth, broadcasting as Fish lamp does. Its manager is made at the first tap, not when the screen opens.
@MainActor
final class BluetoothLampAir: NSObject, LampAir {
  private var manager: CBPeripheralManager?
  /// A broadcast asked for before Bluetooth said it was on.
  private var waiting: (uuids: [CBUUID], done: @MainActor (LampAirError?) -> Void)?
  private var starting: (@MainActor (LampAirError?) -> Void)?

  func start(_ uuids: [String], done: @escaping @MainActor (LampAirError?) -> Void) {
    let ids = uuids.map { CBUUID(string: $0) }
    // One broadcast at a time: one still starting, or waiting for Bluetooth, is replaced, and told it didn't go (the
    // master button awaits its answer).
    if let w = waiting { waiting = nil; w.done(.failed) }
    if let s = starting { starting = nil; s(.failed) }
    guard let manager else {
      waiting = (ids, done)
      manager = CBPeripheralManager(delegate: self, queue: nil)
      return
    }
    advertise(ids, on: manager, done: done)
  }

  /// Ends the broadcast; one still starting, or waiting for Bluetooth, is told it didn't go.
  func stop() {
    if let w = waiting { waiting = nil; w.done(.failed) }
    if let s = starting { starting = nil; s(.failed) }
    manager?.stopAdvertising()
  }

  private func advertise(_ ids: [CBUUID], on manager: CBPeripheralManager, done: @escaping @MainActor (LampAirError?) -> Void) {
    if let e = Self.error(manager.state) { return done(e) }
    // Unknown or resetting: wait for the state.
    guard manager.state == .poweredOn else { waiting = (ids, done); return }
    manager.stopAdvertising()
    starting = done
    manager.startAdvertising([CBAdvertisementDataServiceUUIDsKey: ids])
  }

  private static func error(_ state: CBManagerState) -> LampAirError? {
    switch state {
    case .poweredOff: .off
    case .unauthorized: .refused
    case .unsupported: .unsupported
    default: nil
    }
  }
}

extension BluetoothLampAir: @preconcurrency CBPeripheralManagerDelegate {
  func peripheralManagerDidUpdateState(_ manager: CBPeripheralManager) {
    // Bluetooth went off or reset while a broadcast was starting: say so, rather than leave the card sending.
    if manager.state != .poweredOn, let done = starting {
      starting = nil
      done(Self.error(manager.state) ?? .failed)
    }
    guard let w = waiting else { return }
    if let e = Self.error(manager.state) {
      waiting = nil
      w.done(e)
    } else if manager.state == .poweredOn {
      waiting = nil
      advertise(w.uuids, on: manager, done: w.done)
    }
  }

  func peripheralManagerDidStartAdvertising(_ manager: CBPeripheralManager, error: Error?) {
    let done = starting
    starting = nil
    done?(error == nil ? nil : .failed)
  }
}

// Debug builds only: the UI tests' stand-in, kept out of the App Store build.
#if DEBUG
/// The simulator has no Bluetooth to broadcast with. `-fake-lamp-off`: Bluetooth is off. `-fake-lamp-late-first
/// <seconds>`: the first start answers that late, as one waiting on Bluetooth might.
@MainActor
final class FakeLampAir: LampAir {
  private var starts = 0

  func start(_ uuids: [String], done: @escaping @MainActor (LampAirError?) -> Void) {
    let args = ProcessInfo.processInfo.arguments
    starts += 1
    if starts == 1, let i = args.firstIndex(of: "-fake-lamp-late-first"), i + 1 < args.count, let late = Double(args[i + 1]) {
      Task { try? await Task.sleep(for: .seconds(late)); done(nil) }
      return
    }
    done(args.contains("-fake-lamp-off") ? .off : nil)
  }
  func stop() {}
}
#endif

@MainActor
@Observable
final class LoveEcologyModel {
  /// What goes out: Bật, Tắt or a trial as recorded, or a colour built anew at the slider's level, a swatch's (at the hue
  /// and saturation Fish lamp sent for it) or the wheel's.
  enum Choice: Equatable, Codable {
    case recording(String)
    case swatch(String)
    case wheel(Wheel)
  }

  /// A colour from the wheel: hue in degrees, from 0 to under 360; saturation from 0 (white) to 1. Any hue is taken round
  /// into that range, a kept one too. A saturation that reads 0% is white, which the light is sent as hue 00 00.
  struct Wheel: Equatable, Codable {
    let hue: Double
    let saturation: Double
    var colour: Color { Color(hue: hue / 360, saturation: saturation, brightness: 1) }

    init(hue: Double, saturation: Double) {
      let h = hue.isFinite ? hue.truncatingRemainder(dividingBy: 360) : 0
      self.hue = h < 0 ? h + 360 : h
      let s = saturation.isFinite ? min(max(saturation, 0), 1) : 0
      self.saturation = (s * 100).rounded() == 0 ? 0 : s
    }

    init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      self.init(hue: try c.decode(Double.self, forKey: .hue), saturation: try c.decode(Double.self, forKey: .saturation))
    }
  }

  /// A choice at a level, 1–100% (a recording's level isn't used).
  struct Send: Equatable, Codable {
    var choice: Choice
    var level: Int
    var isRecording: Bool { if case .recording = choice { true } else { false } }

    init(choice: Choice, level: Int) {
      self.choice = choice
      self.level = level
    }

    /// A recording kept without its level reads as at 100%.
    init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      choice = try c.decode(Choice.self, forKey: .choice)
      level = min(max(try c.decodeIfPresent(Int.self, forKey: .level) ?? 100, 1), 100)
    }
  }

  struct Sent: Equatable, Codable {
    var send: Send
    var at: Date
  }

  /// The card's line: what this phone sent or is sending, never what the light shows (it says nothing back).
  enum Line: Equatable {
    case never
    /// A drag not yet paused or lifted.
    case moving(Send)
    /// Waiting its turn, or on air; `tap`: its button shows the spinner.
    case going(Send, tap: Bool)
    case sent(Sent)
    /// The last sent, once the app has left the front since.
    case last(Sent)
    /// Going or waiting when the app left the front, which stops iOS's broadcast: "Gửi lại" sends it again.
    case cut(Send)
    case problem(LampAirError)
  }

  /// Kept on the phone, so the line, the slider's place and Khác's colour come back after a relaunch. A JSON string, so a
  /// launch argument can stand in for it to draw a state such as the day after: quoted as a property list string
  /// (`-loveEcology.sent '"{\"last\":…}"'`), as unquoted braces are read as a dictionary.
  struct Kept: Codable {
    var last: Sent?
    /// The last colour sent, which the slider sends at its new level (white before any).
    var colour: Choice?
    /// The last colour sent from the wheel: Khác's centre.
    var wheel: Wheel?
    /// The last level a colour was sent at: the slider's place.
    var level = 100
    /// Byte 0 of the last colour built, so a relaunch goes on from it.
    var byte0: UInt8?

    init() {}

    /// Each part read if it's there: a record kept without its level keeps the rest, the slider at 100%.
    init(from decoder: any Decoder) throws {
      let c = try decoder.container(keyedBy: CodingKeys.self)
      last = try c.decodeIfPresent(Sent.self, forKey: .last)
      colour = try c.decodeIfPresent(Choice.self, forKey: .colour)
      wheel = try c.decodeIfPresent(Wheel.self, forKey: .wheel)
      level = min(max(try c.decodeIfPresent(Int.self, forKey: .level) ?? 100, 1), 100)
      byte0 = try c.decodeIfPresent(UInt8.self, forKey: .byte0)
    }
  }

  /// Off, on, then the colours, as recorded.
  static let commands = FishLamp.loveEcology
  /// The owner's trial of on and off built anew (14 Nov), until they have tried them.
  static let trials = FishLamp.trials.filter { ["trial-off", "trial-on", "trial-off-recorded", "trial-on-recorded"].contains($0.id) }
  /// How long each command is broadcast, and the wait after one ends before the next starts: on 14 Nov the light didn't
  /// take an orange begun 0.9 s after a yellow it took had ended. A drag sends once the finger pauses this long, or lifts.
  static let seconds: Duration = .seconds(3)
  static let pacer = FishLamp.Pacer(pause: .milliseconds(500), gap: .seconds(gap))
  /// The light's gap: 2 s; `-lamp-gap <seconds>` in a debug build, so a flow can act while a send waits its turn.
  private static var gap: Double {
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    if let i = args.firstIndex(of: "-lamp-gap"), i + 1 < args.count, let s = Double(args[i + 1]) { return s }
    #endif
    return 2
  }
  /// How long a start's answer may take: Bluetooth says within a moment whether a broadcast started, or never.
  static let answer: Duration = .seconds(5)
  private static let key = "loveEcology.sent"

  private(set) var line: Line {
    didSet {
      switch line {
      case .moving, .going: break
      default: settled = line
      }
      #if DEBUG
      shown = Array((shown + [words]).suffix(40))
      #endif
    }
  }
  #if DEBUG
  /// The words the line has shown, for the UI tests: a drag's ("Ngừng kéo để gửi…") are gone before a test can read the
  /// screen, since its finger lifts first. Read with the line, which it changes with.
  @ObservationIgnored private(set) var shown: [String] = []
  #endif
  /// The slider's place.
  private(set) var level: Int
  /// The wheel's newest colour: where its thumb is when the sheet opens again.
  private(set) var wheel: Wheel?
  private(set) var kept: Kept {
    didSet { if let data = try? JSONEncoder().encode(kept) { UserDefaults.standard.set(String(decoding: data, as: UTF8.self), forKey: Self.key) } }
  }
  /// The commands broadcast (`cyan@35`, `wheel@35`, `off`), for the UI tests.
  private(set) var sent: [String] = []

  /// A send in line, numbered so the line follows the one it names.
  private struct Queued { let n: Int; let send: Send; let tap: Bool }
  /// The colour the slider sends: the newest chosen, so a drag after a tap that is still waiting sends that colour.
  @ObservationIgnored private var colour: Choice
  @ObservationIgnored private var count = 0
  @ObservationIgnored private var named: Int?
  @ObservationIgnored private var dragging: Send?
  @ObservationIgnored private var waiting: Queued?
  @ObservationIgnored private var onAir: Queued?
  @ObservationIgnored private var lastEnded: ContinuousClock.Instant?
  @ObservationIgnored private var pause: Task<Void, Never>?
  @ObservationIgnored private var gap: Task<Void, Never>?
  @ObservationIgnored private var ending: Task<Void, Never>?
  /// Gives up on a start whose answer hasn't come; nil once it has.
  @ObservationIgnored private var watchdog: Task<Void, Never>?
  /// Which broadcast is the latest: the answer to one before it (replaced, stopped or given up on) is ignored, so a repeat
  /// tap on the same command keeps its send and a late answer credits nothing.
  @ObservationIgnored private var latest = 0
  /// The line once nothing is moving or going: what it says again when what waits is dropped.
  @ObservationIgnored private var settled: Line
  /// The master button's steps are going out: nothing of the card's starts meanwhile.
  @ObservationIgnored private var held = false
  @ObservationIgnored private var listening: (any NSObjectProtocol)?

  init() {
    let kept = UserDefaults.standard.string(forKey: Self.key).flatMap { try? JSONDecoder().decode(Kept.self, from: Data($0.utf8)) } ?? Kept()
    self.kept = kept
    level = kept.level
    wheel = kept.wheel
    colour = kept.colour ?? .swatch("white")
    let line: Line = kept.last.map { .last($0) } ?? .never
    self.line = line
    settled = line
  }

  /// Bật, Tắt, a trial or a swatch: goes at once unless one is on air or just ended.
  func tap(_ choice: Choice) {
    if case .recording = choice {} else { colour = choice }
    stopDragging()
    queue(Send(choice: choice, level: level), tap: true)
  }

  /// The slider moved: the card's colour at the new level, sent once the finger pauses or lifts.
  func slide(to level: Int) {
    self.level = level
    move(Send(choice: colour, level: level))
  }

  /// The wheel moved: its colour at the slider's level, sent the same way.
  func turn(to wheel: Wheel) {
    self.wheel = wheel
    colour = .wheel(wheel)
    move(Send(choice: .wheel(wheel), level: level))
  }

  /// The finger lifted from the slider or the wheel: what it moved to goes now, if the pause hasn't sent it already.
  func lift() {
    guard let s = dragging else { return }
    stopDragging()
    queue(s, tap: false)
  }

  /// "Gửi lại": the one cut off when the app left the front.
  func again() {
    guard case .cut(let s) = line else { return }
    queue(s, tap: false)
  }

  /// The app went to the background, where iOS stops the broadcast: the card's own stops here too (never the master
  /// button's), nothing waiting goes, and the line says which was cut off. A line that said "Đã gửi" reads as the last
  /// sent when the app is back. Heard by the model, whatever screen is showing.
  func leave() {
    let cut = dragging ?? waiting?.send ?? onAir?.send
    stopDragging()
    gap?.cancel()
    waiting = nil
    stopOnAir()
    named = nil
    if let cut { line = .cut(cut) } else if case .sent(let s) = line { line = .last(s) }
  }

  /// The card left the screen (another tab, or a screen opened from Đèn): the one on air finishes its three seconds, and
  /// nothing waiting goes.
  func leftScreen() { drop() }

  /// Signed out, or the account is no longer the owner's: the card's own broadcast stops, on air or still starting, and
  /// nothing waiting goes.
  func stop() {
    stopOnAir()
    drop()
  }

  /// While the master button's steps go out (`on`), nothing of the card's starts: the press is the newer choice, so what
  /// waits is dropped, and one still starting stops; a choice made meanwhile waits for the steps to end.
  func hold(_ on: Bool) {
    guard on != held else { return }
    held = on
    if on {
      if watchdog != nil { stopOnAir() }
      drop()
    } else {
      next()
    }
  }

  /// What waits doesn't go, nor a drag not yet sent: the line names the one on air, or says again what it said before.
  private func drop() {
    stopDragging()
    gap?.cancel()
    waiting = nil
    if let q = onAir {
      named = q.n
      line = .going(q.send, tap: q.tap)
    } else {
      named = nil
      line = settled
    }
  }

  /// Ends the card's own broadcast, on air or still starting; the broadcaster ignores it once the master button holds it.
  /// The start's answer, if it hasn't come, is ignored: the phone's broadcaster answers a stopped start at once.
  private func stopOnAir() {
    guard onAir != nil else { return }
    ending?.cancel()
    watchdog?.cancel()
    watchdog = nil
    latest += 1
    onAir = nil
    lastEnded = .now
    LampRadio.stop(by: self)
  }

  /// The background is heard from the first choice on: a card that has sent nothing has nothing to stop.
  private func listen() {
    guard listening == nil else { return }
    listening = NotificationCenter.default.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.leave() }
    }
  }

  private func move(_ s: Send) {
    listen()
    dragging = s
    // A newer choice: the one waiting doesn't go.
    gap?.cancel()
    waiting = nil
    named = nil
    line = .moving(s)
    pause?.cancel()
    pause = Task { [weak self] in
      try? await Task.sleep(for: Self.pacer.pause)
      guard !Task.isCancelled else { return }
      self?.lift()
    }
  }

  private func stopDragging() {
    pause?.cancel()
    dragging = nil
  }

  /// In line after the one on air, replacing any waiting.
  private func queue(_ s: Send, tap: Bool) {
    listen()
    count += 1
    waiting = Queued(n: count, send: s, tap: tap)
    named = count
    line = .going(s, tap: tap)
    next()
  }

  /// The one waiting goes once nothing is on air, the gap after the last has passed and the master button's steps aren't
  /// going out.
  private func next() {
    gap?.cancel()
    guard !held, onAir == nil, let q = waiting else { return }
    let due = Self.pacer.due(moved: .now, lifted: true, lastEnded: lastEnded)
    if due <= .now { return broadcast(q) }
    gap = Task { [weak self] in
      try? await Task.sleep(until: due, clock: .continuous)
      guard !Task.isCancelled else { return }
      self?.next()
    }
  }

  private func broadcast(_ q: Queued) {
    waiting = nil
    guard let command = command(q.send) else {
      if named == q.n { line = .problem(.failed) }
      return
    }
    onAir = q
    latest += 1
    let mine = latest
    // Armed first: the simulator's stand-in answers within `start`.
    watchdog = Task { [weak self] in
      try? await Task.sleep(for: Self.answer)
      guard !Task.isCancelled, let self, self.latest == mine else { return }
      let named = self.named == q.n
      self.stopOnAir()
      if named { self.line = .problem(.failed) }
      self.next()
    }
    // The phone's one broadcaster, shared with the master button.
    LampRadio.start(command.uuids, by: self) { [weak self] e in
      guard let self, self.latest == mine, self.onAir?.n == q.n else { return }
      self.watchdog?.cancel()
      self.watchdog = nil
      if let e {
        self.onAir = nil
        if self.named == q.n { self.line = .problem(e) }
        self.next()
        return
      }
      self.sent.append(Self.entry(q.send, command))
      Self.remember(q.send)
      // Held to its end whatever the screen does: a broadcast left going would go on until the app left the front.
      self.ending = Task {
        try? await Task.sleep(for: Self.seconds)
        guard !Task.isCancelled else { return }
        LampRadio.stop(by: self)
        self.onAir = nil
        self.lastEnded = .now
        self.ended(q)
        self.next()
      }
    }
  }

  private func ended(_ q: Queued) {
    let done = Sent(send: q.send, at: Date())
    kept.last = done
    if !q.send.isRecording {
      kept.colour = q.send.choice
      kept.level = q.send.level
    }
    if case .wheel(let w) = q.send.choice { kept.wheel = w }
    // Named or not, it's what the line goes back to if the one it names is dropped.
    if named == q.n { line = .sent(done) } else { settled = .sent(done) }
  }

  /// A recording as it is, or a colour built with the next byte 0.
  private func command(_ s: Send) -> FishLamp.Command? {
    let brightness = Double(s.level) / 100
    switch s.choice {
    case .recording(let id): return (Self.commands + Self.trials).first { $0.id == id }
    case .swatch(let id):
      guard let recording = Self.commands.first(where: { $0.id == id }) else { return nil }
      return FishLamp.colour(like: recording, brightness: brightness, sequence: nextByte0())
    case .wheel(let w): return FishLamp.colour(hue: w.hue, saturation: w.saturation, brightness: brightness, sequence: nextByte0())
    }
  }

  private func nextByte0() -> UInt8 {
    let b = FishLamp.sequence(after: kept.byte0 ?? 0)
    kept.byte0 = b
    return b
  }

  /// A wheel colour with the hue and saturation it went as (`wheel:0000:0000@35`, white).
  private static func entry(_ s: Send, _ c: FishLamp.Command) -> String {
    switch s.choice {
    case .recording(let id): return id
    case .swatch(let id): return "\(id)@\(s.level)"
    case .wheel:
      let p = c.plain, hex = { (i: Int) in String(format: "%02x%02x", p[i], p[i + 1]) }
      return p.count >= 14 ? "wheel:\(hex(10)):\(hex(12))@\(s.level)" : "wheel@\(s.level)"
    }
  }

  /// What the master button puts the lamp back to (`LampMemory`): Bật, Tắt or a swatch by its recording, at the
  /// recording's own brightness; a wheel colour as the lamp on in a colour no recording has. Trials say nothing of it.
  private static func remember(_ s: Send) {
    switch s.choice {
    case .recording(let id), .swatch(let id): LampMemory.sent(id)
    case .wheel: LampMemory.remember(DeviceCommand(device: "", on: true))
    }
  }
}

extension LoveEcologyModel {
  /// The line's words. "Đã gửi" (sent), never that the light took it: it may not have.
  var words: String {
    switch line {
    case .never: return String(localized: "Chưa gửi lệnh nào từ máy này")
    case .moving(let s): return String(localized: "Ngừng kéo để gửi \(Self.subject(s.choice)), \(s.level)%")
    case .going(let s, _):
      return s.isRecording ? String(localized: "Đang gửi \(Self.subject(s.choice))…")
        : String(localized: "Đang gửi \(Self.subject(s.choice)), \(s.level)%…")
    case .sent(let t):
      let what = Self.subject(t.send.choice), at = Self.clock(t.at)
      guard t.send.isRecording else { return String(localized: "Đã gửi \(what), \(t.send.level)% lúc \(at).") }
      // A trial's line asks for ten seconds before the next tap, so the owner's eyes judge one command at a time.
      let trial = if case .recording(let id) = t.send.choice, id.hasPrefix("trial-") { " Đợi 10 giây rồi bấm tiếp." } else { "" }
      return String(localized: "Đã gửi \(what) lúc \(at).") + trial
    case .last(let t):
      let what = Self.subject(t.send.choice), at = Self.day(t.at)
      return t.send.isRecording ? String(localized: "Lần cuối máy này gửi: \(what) · \(at)")
        : String(localized: "Lần cuối máy này gửi: \(what), \(t.send.level)% · \(at)")
    case .cut(let s):
      return s.isRecording ? String(localized: "Gửi \(Self.subject(s.choice)) bị ngắt vì bạn rời ứng dụng.")
        : String(localized: "Gửi \(Self.subject(s.choice)), \(s.level)% bị ngắt vì bạn rời ứng dụng.")
    case .problem(.off): return String(localized: "Bật Bluetooth để gửi lệnh tới đèn.")
    case .problem(.refused): return String(localized: "AquaTome chưa được dùng Bluetooth. Bật trong Cài đặt → AquaTome → Bluetooth.")
    case .problem(.unsupported): return String(localized: "Máy này không có Bluetooth.")
    case .problem(.failed): return String(localized: "Không gửi được lệnh tới đèn. Thử lại.")
    }
  }

  /// The colour the line's dot shows: none for Bật, Tắt or a problem.
  var dot: Color? {
    let s: Send? = switch line {
    case .moving(let s), .going(let s, _), .cut(let s): s
    case .sent(let t), .last(let t): t.send
    case .never, .problem: nil
    }
    guard let s, !s.isRecording, !isCut else { return nil }
    return Self.look(s.choice)
  }

  var isCut: Bool { if case .cut = line { true } else { false } }

  /// A tapped button sending, or waiting its turn: its name gives way to a spinner.
  func spinning(_ choice: Choice) -> Bool {
    if case .going(let s, tap: true) = line { s.choice == choice } else { false }
  }

  /// A colour's dot: the hue and saturation it is sent at, at full brightness.
  static func look(_ choice: Choice) -> Color? {
    switch choice {
    case .recording: return nil
    case .wheel(let w): return w.colour
    case .swatch(let id):
      // A colour command (`02 07`): on and off aren't swatches.
      guard let p = commands.first(where: { $0.id == id })?.plain, p.count >= 14, p[8] == 0x02, p[9] == 0x07 else { return nil }
      let hue = Double(UInt16(p[10]) << 8 | UInt16(p[11])) / 65535, saturation = Double(UInt16(p[12]) << 8 | UInt16(p[13])) / 65535
      return Color(hue: hue, saturation: saturation, brightness: 1)
    }
  }

  /// A swatch or button by its name in quotes; a wheel colour as "màu tự chọn".
  private static func subject(_ choice: Choice) -> String {
    switch choice {
    case .recording(let id), .swatch(let id): "“\(name(id))”"
    case .wheel: String(localized: "màu tự chọn")
    }
  }

  /// "19:23", as the schedule beside it writes times, whatever the phone's 12- or 24-hour setting.
  static func clock(_ at: Date) -> String {
    let t = Calendar.current.dateComponents([.hour, .minute], from: at)
    return String(format: "%02d:%02d", t.hour ?? 0, t.minute ?? 0)
  }

  /// "19:23" today, "hôm qua 19:23", or "12/11 19:23".
  private static func day(_ at: Date) -> String {
    let calendar = Calendar.current
    if calendar.isDateInToday(at) { return clock(at) }
    if calendar.isDateInYesterday(at) { return String(localized: "hôm qua \(clock(at))") }
    let d = calendar.dateComponents([.day, .month], from: at)
    return String(format: "%02d/%02d ", d.day ?? 0, d.month ?? 0) + clock(at)
  }

  static func name(_ id: String) -> String {
    switch id {
    case "on": String(localized: "Bật")
    case "off": String(localized: "Tắt")
    case "white": String(localized: "Trắng")
    case "red": String(localized: "Đỏ")
    case "orange": String(localized: "Cam")
    case "yellow": String(localized: "Vàng")
    case "green": String(localized: "Xanh lá")
    case "cyan": String(localized: "Xanh lơ")
    case "blue": String(localized: "Xanh dương")
    case "magenta": String(localized: "Hồng tím")
    // The owner's trial row, not translated.
    case "trial-off": "Tắt (tự tạo 1)"
    case "trial-on": "Bật (tự tạo 1)"
    case "trial-off-recorded": "Tắt (tự tạo 2)"
    case "trial-on-recorded": "Bật (tự tạo 2)"
    default: id
    }
  }
}

/// The light's card on the Đèn tab: on and off as recorded, the eight colours and any other from a wheel, built at the
/// slider's level. It says what this phone sent, never what the light shows. The owner's account alone.
struct LoveEcologyCard: View {
  @Environment(AccountModel.self) private var account
  @Environment(MasterModel.self) private var master
  @Environment(\.dynamicTypeSize) private var size
  @Environment(\.colorScheme) private var scheme
  /// The colour dots grow with their names, up to about a large tap target.
  @ScaledMetric(relativeTo: .caption) private var dot: CGFloat = 32
  /// Five swatches a row at the default size and four from XL, so no name wraps below the accessibility sizes.
  @ScaledMetric(relativeTo: .caption) private var cell: CGFloat = 66
  @State private var lamp = LoveEcologyModel()
  @State private var wheel = false

  /// The owner's account alone.
  private var shown: Bool { account.owner.isOwner == true && account.user != nil && !LoveEcologyModel.commands.isEmpty }

  var body: some View {
    if shown {
      VStack(alignment: .leading, spacing: 12) {
        Text("Đèn Love Ecology").font(.title3.weight(.semibold))
        Text("Đứng gần đèn, giữ ứng dụng mở khi gửi. Đèn không báo lại, nên AquaTome chỉ biết những gì máy này đã gửi. Hẹn giờ vẫn đặt trong ứng dụng Fish lamp.")
          .font(.subheadline).foregroundStyle(.secondary)
        HStack(spacing: 12) {
          ForEach(["on", "off"], id: \.self) { id in
            let c = LoveEcologyModel.Choice.recording(id)
            Button { lamp.tap(c) } label: {
              // The word keeps its room while a spinner stands in for it, so the button doesn't change size.
              Text(LoveEcologyModel.name(id)).opacity(lamp.spinning(c) ? 0 : 1).overlay { if lamp.spinning(c) { ProgressView() } }
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered).controlSize(.large)
            .disabled(master.sending)
            .accessibilityLabel(LoveEcologyModel.name(id))
            .accessibilityIdentifier("lamp-\(id)")
          }
        }
        // No swatch is marked as chosen: a ring would read as the light's colour the morning after Fish lamp changed it.
        LazyVGrid(columns: [GridItem(.adaptive(minimum: size.isAccessibilitySize ? 150 : cell), spacing: 4, alignment: .top)], spacing: 12) {
          ForEach(LoveEcologyModel.commands.filter { LoveEcologyModel.look(.swatch($0.id)) != nil }) { c in
            let choice = LoveEcologyModel.Choice.swatch(c.id)
            Button { lamp.tap(choice) } label: {
              swatch(LoveEcologyModel.name(c.id), spinning: lamp.spinning(choice)) {
                // A hairline ring in both looks: a deep blue dot is faint on the dark card without one.
                Circle().fill(LoveEcologyModel.look(choice) ?? .clear).overlay { Circle().strokeBorder(ring) }
              }
            }
            .buttonStyle(.plain)
            .disabled(master.sending)
            .opacity(master.sending ? 0.4 : 1)
            .accessibilityLabel(LoveEcologyModel.name(c.id))
            .accessibilityIdentifier("lamp-\(c.id)")
          }
          Button { wheel = true } label: {
            swatch(String(localized: "Khác"), spinning: false) { OtherWell(colour: lamp.kept.wheel?.colour, ring: ring) }
          }
          .buttonStyle(.plain)
          .disabled(master.sending)
          .opacity(master.sending ? 0.4 : 1)
          .accessibilityIdentifier("lamp-other")
        }
        ChannelSlider(id: "lamp-level", title: String(localized: "Độ sáng"), swatch: nil, value: lamp.level, range: 1...100) {
          lamp.slide(to: $0)
        } onLift: { lamp.lift() }
        .disabled(master.sending)
        LampLine(lamp: lamp)
        // The owner's trial of on and off built anew (14 Nov), the light's answer seen by eye: it says nothing back. Taken
        // out once they have been tried. Not translated: the owner's.
        VStack(alignment: .leading, spacing: 8) {
          Text(verbatim: "Thử lệnh tự tạo").font(.subheadline.weight(.semibold))
          LazyVGrid(columns: [GridItem(.adaptive(minimum: size.isAccessibilitySize ? 220 : 140), alignment: .top)], spacing: 8) {
            ForEach(LoveEcologyModel.trials) { c in
              let choice = LoveEcologyModel.Choice.recording(c.id)
              Button { lamp.tap(choice) } label: {
                Text(verbatim: LoveEcologyModel.name(c.id)).opacity(lamp.spinning(choice) ? 0 : 1)
                  .overlay { if lamp.spinning(choice) { ProgressView() } }
                  .frame(maxWidth: .infinity)
              }
              .buttonStyle(.bordered)
              .disabled(master.sending)
              .accessibilityIdentifier("lamp-\(c.id)")
            }
          }
        }
      }
      .padding()
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
      .sheet(isPresented: $wheel) { ColourWheelSheet(lamp: lamp) }
      // Gone because the account signed out or isn't the owner's: the card's broadcast stops. Gone from the screen: the
      // one on air finishes, nothing waiting goes. (The background is the model's: LoveEcologyModel.leave.)
      .onDisappear { if shown { lamp.leftScreen() } else { lamp.stop() } }
      // The two share the phone's one broadcast.
      .onAppear { lamp.hold(master.sending) }
      .onChange(of: master.sending) { lamp.hold(master.sending) }
      .onChange(of: lamp.line) {
        switch lamp.line {
        case .never, .moving: break
        default: AccessibilityNotification.Announcement(lamp.words).post()
        }
      }
      #if DEBUG
      .background {
        // The commands broadcast, for the UI tests to read (debug builds only).
        Text(verbatim: lamp.sent.joined(separator: " ")).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("lamp-sent")
        // And the words the line has shown.
        Text(verbatim: lamp.shown.joined(separator: " | ")).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("lamp-lines")
      }
      #endif
    }
  }

  private var ring: Color { .primary.opacity(scheme == .dark ? 0.5 : 0.25) }

  private func swatch(_ name: String, spinning: Bool, @ViewBuilder face: () -> some View) -> some View {
    VStack(spacing: 4) {
      face().frame(width: min(dot, 44), height: min(dot, 44))
      Text(name).font(.caption).foregroundStyle(.primary).multilineTextAlignment(.center)
        .opacity(spinning ? 0 : 1).overlay { if spinning { ProgressView().controlSize(.small) } }
    }
    .frame(maxWidth: .infinity, minHeight: 44)
    .contentShape(Rectangle())
  }
}

/// Khác's swatch: iOS's colour-well look, a ring through the hues, its centre the last colour sent from the wheel.
private struct OtherWell: View {
  let colour: Color?
  let ring: Color

  var body: some View {
    GeometryReader { g in
      let d = g.size.width
      ZStack {
        Circle().strokeBorder(AngularGradient(colors: ColourWheel.hues, center: .center, startAngle: .degrees(-90), endAngle: .degrees(270)),
                              lineWidth: d * 3 / 32)
        if let colour { Circle().fill(colour).overlay { Circle().strokeBorder(ring) }.padding(d * 6 / 32) }
      }
    }
  }
}

/// The line: a row two lines high from the first frame, so a wrap or "Gửi lại" moves nothing below. On the card, and
/// under the wheel, which covers the card's.
struct LampLine: View {
  let lamp: LoveEcologyModel
  @Environment(\.dynamicTypeSize) private var size
  @Environment(\.colorScheme) private var scheme
  @ScaledMetric(relativeTo: .footnote) private var dot: CGFloat = 10

  var body: some View {
    let problem: Bool = switch lamp.line { case .cut, .problem: true; default: false }
    // Centred: on its words' baseline, "Gửi lại" would reach above two lines of them and make the row taller. At the
    // accessibility sizes the dot or triangle stays by the first line, and Gửi lại has its own row.
    let row = HStack(alignment: size.isAccessibilitySize ? .firstTextBaseline : .center, spacing: size.isAccessibilitySize ? 12 : 6) {
      if problem {
        Image(systemName: "exclamationmark.triangle.fill").accessibilityHidden(true)
      } else if let c = lamp.dot {
        Circle().fill(c).overlay { Circle().strokeBorder(.primary.opacity(scheme == .dark ? 0.5 : 0.25)) }
          .frame(width: min(dot, 24), height: min(dot, 24))
          .accessibilityHidden(true)
      }
      Text(verbatim: lamp.words)
        .foregroundStyle(problem ? HierarchicalShapeStyle.primary : lamp.line == .never ? .tertiary : .secondary)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityIdentifier("lamp-status")
      if lamp.isCut, !size.isAccessibilitySize { again }
    }
    VStack(alignment: .leading, spacing: 8) {
      // Two lines' room, measured off two lines of the same words' style: Vietnamese lines are taller than the font's
      // size alone says (two footnote lines are 37.7 pt at L, not 36).
      ZStack(alignment: .leading) {
        Text(verbatim: "Đ\nĐ").hidden().accessibilityHidden(true)
        row
      }
      if lamp.isCut, size.isAccessibilitySize { again }
    }
    .font(.footnote)
  }

  /// A small bordered button whose tap target reaches 44 pt past the row's height; full width at the accessibility sizes.
  private var again: some View {
    Button { lamp.again() } label: {
      Text("Gửi lại").font(.subheadline)
        .padding(.horizontal, 12).frame(minHeight: 28)
        .frame(maxWidth: size.isAccessibilitySize ? .infinity : nil)
        .background(Color(.secondarySystemFill), in: Capsule())
        .padding(.vertical, 8).contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .foregroundStyle(.tint)
    .padding(.vertical, -8)
    .accessibilityIdentifier("lamp-again")
  }
}
