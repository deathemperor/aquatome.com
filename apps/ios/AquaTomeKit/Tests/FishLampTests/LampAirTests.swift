import Testing
@testable import FishLamp

// LampAirCore: what each broadcast to the lamp is told, over a stand-in for the phone's Bluetooth. One handed to
// Bluetooth is never told it didn't go unless Bluetooth's answer to that very start says so (Codex, 18 Nov). Which start
// each answer is for is the stand-in's own record (answers come in the order the starts were handed, from the advertiser
// they were handed to), never the core's.

/// A stand-in for one CBPeripheralManager: its state, and the starts handed to it, oldest first.
@MainActor
final class FakePeripheral: LampPeripheral {
  var bluetooth: LampBluetooth
  /// The starts handed to it, by broadcast, and those not answered yet.
  private(set) var handed: [String] = []
  private(set) var unanswered: [String] = []
  private(set) var stops = 0
  init(_ bluetooth: LampBluetooth) { self.bluetooth = bluetooth }
  func startAdvertising(_ uuids: [String]) {
    handed += uuids
    unanswered += uuids
  }
  func stopAdvertising() { stops += 1 }
  /// The oldest start not answered yet: the one Bluetooth's next answer is for.
  func answering() -> String? { unanswered.isEmpty ? nil : unanswered.removeFirst() }
}

/// The core over stand-ins, with what each broadcast was told and Bluetooth's own answer to each start.
@MainActor
final class Air {
  var made: [FakePeripheral] = []
  /// The state a new advertiser reads (CoreBluetooth's is not known yet until it says).
  var startsAs: LampBluetooth = .notYet
  var told: [String: [LampAirError?]] = [:]
  /// Bluetooth's answer to each start, as the stand-in had it: true, it started.
  var own: [String: Bool] = [:]
  var next = 0
  lazy var core = LampAirCore(make: { [unowned self] in
    let p = FakePeripheral(self.startsAs)
    self.made.append(p)
    return p
  })

  @discardableResult
  func start(allowed: Bool = true) -> String {
    next += 1
    let id = "b\(next)"
    core.start([id], allowed: { allowed }, done: { [unowned self] e in self.told[id, default: []].append(e) })
    return id
  }

  func bluetooth(_ b: LampBluetooth) {
    guard let p = made.last else { return }
    p.bluetooth = b
    core.stateChanged(p)
  }

  /// Bluetooth answers the oldest start on advertiser `p` (the newest, or one let go).
  func answer(_ p: FakePeripheral?, started: Bool) {
    guard let p, let id = p.answering() else { return }
    own[id] = started
    core.answered(p, started: started)
  }

  var handed: Set<String> { Set(made.flatMap(\.handed)) }
}

@MainActor @Test("A broadcast goes once Bluetooth is on, and is told it started when Bluetooth says so")
func lampAirStarts() {
  let air = Air()
  let a = air.start()
  #expect(air.made.count == 1 && air.handed.isEmpty)
  air.bluetooth(.on)
  #expect(air.handed == [a])
  air.answer(air.made.last, started: true)
  #expect(air.told[a] == [nil])
}

@MainActor @Test("Another start before Bluetooth answered: the first may have gone (cut), and its late answer is never the second's")
func lampAirReplacedBeforeItsAnswer() {
  let air = Air()
  air.startsAs = .on
  let a = air.start()
  let first = air.made.last
  let b = air.start()
  #expect(air.told[a] == [.cut])
  #expect(air.made.count == 2 && first!.stops > 0, "the first advertiser not stopped and let go")
  // The first's answer comes late, an error: it is the first's, not the second's.
  air.answer(first, started: false)
  #expect(air.told[b] == nil)
  air.answer(air.made.last, started: true)
  #expect(air.told[b] == [nil])
}

@MainActor @Test("Bluetooth reset or stopped with a start unanswered: it may have gone; nothing later is taken for it")
func lampAirCutByResetOrStop() {
  for reset in [true, false] {
    let air = Air()
    air.startsAs = .on
    let a = air.start()
    let first = air.made.last
    if reset { air.bluetooth(.notYet) } else { air.core.stop() }
    #expect(air.told[a] == [.cut])
    air.answer(first, started: true)
    #expect(air.told[a] == [.cut], "told twice")
  }
}

@MainActor @Test("Nothing handed to Bluetooth: told why, nothing went")
func lampAirNothingHanded() {
  let air = Air()
  let a = air.start()
  let b = air.start()
  #expect(air.told[a] == [.failed])
  air.bluetooth(.off)
  #expect(air.told[b] == [.off])
  air.bluetooth(.on)
  let c = air.start(allowed: false)
  #expect(air.told[c] == [.failed] && air.handed.isEmpty)
}

@MainActor @Test("Every order of starts, stops, Bluetooth's states and its answers: one handed is told it didn't go only when its own answer says so")
func lampAirEveryOrder() {
  enum Event: CaseIterable { case start, stop, on, notYet, off, startedNewest, failedNewest, startedOlder, failedOlder }
  var orders: [[Event]] = [[]]
  for _ in 0..<5 { orders = orders.flatMap { o in Event.allCases.map { o + [$0] } } }
  var handedAny = 0
  for order in orders {
    let air = Air()
    for e in order {
      switch e {
      case .start: air.start()
      case .stop: air.core.stop()
      case .on: air.bluetooth(.on)
      case .notYet: air.bluetooth(.notYet)
      case .off: air.bluetooth(.off)
      case .startedNewest: air.answer(air.made.last, started: true)
      case .failedNewest: air.answer(air.made.last, started: false)
      case .startedOlder: air.answer(air.made.dropLast().last, started: true)
      case .failedOlder: air.answer(air.made.dropLast().last, started: false)
      }
    }
    let handed = air.handed
    handedAny += handed.count
    for (id, told) in air.told {
      #expect(told.count == 1, "\(order): \(id) told \(told)")
      guard let t = told.first else { continue }
      if handed.contains(id), let t, t != .cut {
        // Told it didn't go, though Bluetooth had it: only on Bluetooth's own answer to it.
        #expect(air.own[id] == false, "\(order): \(id) handed to Bluetooth, told \(t), its own answer \(String(describing: air.own[id]))")
      }
      if t == nil {
        #expect(air.own[id] == true, "\(order): \(id) told it started, its own answer \(String(describing: air.own[id]))")
      }
      if !handed.contains(id) { #expect(t != nil && t != .cut, "\(order): \(id) never handed, told \(String(describing: t))") }
    }
  }
  #expect(handedAny > 0)
}
