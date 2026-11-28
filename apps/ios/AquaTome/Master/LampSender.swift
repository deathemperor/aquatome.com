import FishLamp
import Foundation
import Observation
import Tanks

/// The phone's one broadcaster for the Love Ecology lamp, shared by its card and the master button: two would talk over
/// each other. Made at the first send.
@MainActor
enum LampRadio {
  static let air: LampAir = {
    #if DEBUG && targetEnvironment(simulator)
    FakeLampAir()
    #else
    BluetoothLampAir()
    #endif
  }()
  /// The light's gap between two broadcasts, whichever sends them: about two seconds (on 14 Nov it didn't take an orange
  /// begun 0.9 s after a yellow it took had ended). `-lamp-gap <seconds>` in a debug build, so a flow can act while a
  /// send waits its turn.
  nonisolated static let gap: Duration = {
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    if let i = args.firstIndex(of: "-lamp-gap"), i + 1 < args.count, let s = Double(args[i + 1]) { return .seconds(s) }
    #endif
    return .seconds(2)
  }()
  /// Who broadcasts now. A stop from another (the card's three seconds ending after the button took over) is ignored.
  private static var holder: ObjectIdentifier?
  /// When the last broadcast ended, the card's or the button's: the next, either's, waits the gap after it. Kept here,
  /// not by the card, which may not have seen the button's step (Đèn not showing).
  private(set) static var lastEnded: ContinuousClock.Instant?

  /// A start Bluetooth had and cut before it answered (stopped, replaced, or Bluetooth reset as it began) may have gone:
  /// its end is marked as it's told, so the next broadcast, either's, waits the gap after it (Codex, 20 Nov).
  static func start(_ uuids: [String], by who: AnyObject, allowed: @escaping @MainActor () -> Bool = { true },
                    done told: @escaping @MainActor (LampAirError?) -> Void) {
    holder = ObjectIdentifier(who)
    let done: @MainActor (LampAirError?) -> Void = { e in
      if e == .cut { lastEnded = .now }
      told(e)
    }
    air.start(uuids, allowed: allowed, done: done)
  }

  /// Whether `who` still broadcasts: false once another took the broadcaster, or after a stop.
  static func holds(_ who: AnyObject) -> Bool { holder == ObjectIdentifier(who) }

  /// The end is marked before the broadcast stops: the stop answers a start not yet answered at once, and the card's
  /// answer may ask for its next send there, which must wait the gap after this one (Fable, 20 Nov).
  static func stop(by who: AnyObject) {
    guard holds(who) else { return }
    holder = nil
    lastEnded = .now
    air.stop()
  }

  /// The broadcaster for `who` (the button's lamp step): another's broadcast still going (the card's three seconds) ends
  /// here, and the step then waits the gap after it, as after any other.
  static func take(by who: AnyObject) {
    guard let h = holder, h != ObjectIdentifier(who) else { return }
    holder = nil
    lastEnded = .now
    air.stop()
  }

  /// Returns once the gap after the last broadcast has passed (at once if it has).
  static func gapPassed() async {
    while let e = lastEnded, ContinuousClock.now < e + gap {
      do { try await Task.sleep(until: e + gap, clock: .continuous) } catch { return }
    }
  }
}

/// The last command this phone sent the lamp (its card's off, on or a colour, or the master button's), kept across
/// launches: the lamp reports nothing, so this is all the phone knows of it, and what the master button puts it back to.
enum LampMemory {
  private static let key = "lamp.last", atKey = "lamp.lastAt"

  static var last: DeviceCommand? {
    UserDefaults.standard.data(forKey: key).flatMap { try? JSONDecoder().decode(DeviceCommand.self, from: $0) }
  }

  /// When it was sent.
  static var lastAt: Date? { UserDefaults.standard.object(forKey: atKey) as? Date }

  static func remember(_ c: DeviceCommand) {
    let kept = DeviceCommand(device: c.device, on: c.on, colour: c.on ? c.colour : nil)
    UserDefaults.standard.set(try? JSONEncoder().encode(kept), forKey: key)
    UserDefaults.standard.set(Date(), forKey: atKey)
  }

  /// The card sent one of its recordings: off, on or a colour. Its trials say nothing of what the lamp shows.
  static func sent(_ id: String) {
    switch id {
    case "off": remember(DeviceCommand(device: "", on: false))
    case "on": remember(DeviceCommand(device: "", on: true, colour: last?.on == true ? last?.colour : nil))
    case _ where DeviceCommand.colours.contains(id): remember(DeviceCommand(device: "", on: true, colour: id))
    default: break
    }
  }
}

/// A lamp command as the owner's recordings send it: off; on; or on, then the colour. Each for three seconds, two
/// seconds apart (a colour begun 0.9 s after another ended wasn't taken, 14 Nov); the first after the light's gap since
/// the last broadcast, the card's included, whose send still going ends first.
@MainActor
@Observable
final class LampSender {
  /// The recordings broadcast, by id, for the UI tests (`master-lamp-sent` on the master card, debug builds).
  private(set) var sent: [String] = []
  /// The recordings asked of the air, by id, whether they then went or not (`master-lamp-asked`): a flow sees one waiting
  /// for Bluetooth.
  private(set) var asked: [String] = []
  /// The recordings handed to Bluetooth and cut before it said they had started (`LampAirError.cut`): they may have gone.
  private(set) var cut: [String] = []
  /// How many recordings went out, or may have.
  var mayHaveGone: Int { sent.count + cut.count }

  static func recordings(_ c: DeviceCommand) -> [FishLamp.Command] {
    let ids = !c.on ? ["off"] : ["on"] + (c.colour.map { [$0] } ?? [])
    return ids.compactMap { id in FishLamp.loveEcology.first { $0.id == id } }
  }

  #if DEBUG
  /// `-lamp-colour-wait <seconds>`: a colour waits that much longer after "on", so a flow can sign out between them.
  private static let colourWait = ProcessInfo.processInfo.arguments.firstIndex(of: "-lamp-colour-wait")
    .flatMap { i in ProcessInfo.processInfo.arguments.dropFirst(i + 1).first.flatMap(TimeInterval.init) }
  #endif

  /// Nil when every recording went out; why not otherwise (then the rest aren't sent). `allowed` is asked before each
  /// recording, and again as its broadcast begins, after any wait for Bluetooth: no, and it and the rest don't go (the
  /// master button's owner signed out since, Codex, 17 Nov).
  func send(_ c: DeviceCommand, allowed: @escaping @MainActor () -> Bool = { true }) async -> LampAirError? {
    let list = Self.recordings(c)
    guard !list.isEmpty else { return .failed }
    for (i, r) in list.enumerated() {
      if i > 0 {
        try? await Task.sleep(for: .seconds(2))
      } else {
        LampRadio.take(by: self)
        await LampRadio.gapPassed()
      }
      #if DEBUG
      if i > 0, let wait = Self.colourWait { try? await Task.sleep(for: .seconds(wait)) }
      #endif
      guard allowed() else {
        // "On" went out and its colour doesn't: the lamp is on, in a colour not known.
        if i > 0 { LampMemory.remember(DeviceCommand(device: c.device, on: true)) }
        return .failed
      }
      asked.append(r.id)
      // Answered once: when the broadcast started, or why not.
      let started: LampAirError? = await withCheckedContinuation { done in
        LampRadio.start(r.uuids, by: self, allowed: allowed) { done.resume(returning: $0) }
      }
      if let started {
        if started == .cut { cut.append(r.id) }
        // "On" went out and its colour didn't: the lamp is on, in a colour not known.
        if i > 0 { LampMemory.remember(DeviceCommand(device: c.device, on: true)) }
        return started
      }
      sent.append(r.id)
      try? await Task.sleep(for: LoveEcologyModel.seconds)
      LampRadio.stop(by: self)
    }
    LampMemory.remember(c)
    return nil
  }
}

extension LampAirError {
  /// What the lamp's card says of it.
  var line: String {
    switch self {
    case .off: String(localized: "Bật Bluetooth để gửi lệnh tới đèn.", bundle: .app)
    case .refused: String(localized: "AquaTome chưa được dùng Bluetooth. Bật trong Cài đặt → AquaTome → Bluetooth.", bundle: .app)
    case .unsupported: String(localized: "Máy này không có Bluetooth.", bundle: .app)
    case .failed: String(localized: "Không gửi được lệnh tới đèn. Thử lại.", bundle: .app)
    case .cut: String(localized: "Không rõ đèn Love Ecology đã nhận lệnh chưa. Bạn xem lại đèn.", bundle: .app)
    }
  }
}
