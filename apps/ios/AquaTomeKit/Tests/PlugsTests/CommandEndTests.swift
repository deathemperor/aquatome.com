import Foundation
import Testing
@testable import Plugs
import Tanks

// The master button's card never says a command wasn't sent when some of it may have reached the device (the chief,
// 17 Nov). Every way a plug's command ends, through Tuya's source, the stand-in cloud and the plug board as they end
// there, with the keys removed or changed while its answer is on its way or not, and then a sign-out or a role change;
// and every way the lamp's ends. Whether a command reached the plug is the stand-in cloud's own count of commands and
// what the case set it to do with them, never what the board or CommandEnd say.

/// How the stand-in cloud and the plug take a command.
enum Taking: Equatable, CustomStringConvertible {
  case confirmed
  /// Taken; the plug doesn't switch.
  case ignores
  /// Taken; the plug reports its new state only after more reads than the 3 seconds allow.
  case lags
  /// Taken; its status can't be read back.
  case unreadable
  /// Carried out; the answer lost on the way back.
  case losesAnswer
  /// Carried out; the call then ends cancelled.
  case cancelledAfter
  /// Refused by Tuya with this code: nothing switched.
  case refuses(Int)
  /// The plug went offline before the command reached it: nothing switched.
  case dropsOff
  /// Withdrawn as it was about to go (`allowed` said no): nothing left the phone.
  case withdrawn

  static let all: [Taking] = [.confirmed, .ignores, .lags, .unreadable, .losesAnswer, .cancelledAfter, .dropsOff, .withdrawn]
    // Every refusal the app tells apart (TuyaPlugs.error), and the maker's own (2008: command not supported).
    + [1004, 1013, 1106, 28841002, 28841001, 28841004, 1110, 2010, 2008].map(Taking.refuses)

  /// The plug carries out a command that reaches it.
  var reaches: Bool {
    switch self {
    case .refuses, .dropsOff, .withdrawn: false
    case .confirmed, .ignores, .lags, .unreadable, .losesAnswer, .cancelledAfter: true
    }
  }

  func device(_ d: FakeTuya.Device) -> FakeTuya.Device {
    var d = d
    switch self {
    case .ignores: d.ignores = true
    case .lags: d.lags = 100
    case .unreadable: d.unreadable = true
    case .refuses(let code): d.refuses = code
    case .dropsOff: d.dropsOff = true
    case .confirmed, .losesAnswer, .cancelledAfter, .withdrawn: break
    }
    return d
  }

  var description: String {
    switch self {
    case .confirmed: "confirmed"
    case .ignores: "the plug doesn't switch"
    case .lags: "the plug reports late"
    case .unreadable: "not read back"
    case .losesAnswer: "its answer lost"
    case .cancelledAfter: "cancelled after it went"
    case .refuses(let code): "refused \(code)"
    case .dropsOff: "the plug went offline"
    case .withdrawn: "withdrawn"
    }
  }
}

/// Holds a switch's answer once its command has been through the cloud, until opened; reads of the list fail from when
/// told.
actor AnswerHold {
  private(set) var arrived = false
  private var open = false
  private var waiting: [CheckedContinuation<Void, Never>] = []
  private(set) var listsFail = false
  func wait() async {
    arrived = true
    if !open { await withCheckedContinuation { waiting.append($0) } }
  }
  func release() { open = true; waiting.forEach { $0.resume() }; waiting = [] }
  func failLists() { listsFail = true }
}

struct Held: PlugSource {
  let base: any PlugSource
  let hold: AnswerHold
  let cancelAfter: Bool
  var owner: String { base.owner }
  func list() async throws -> PlugList {
    if await hold.listsFail { throw PlugError.offline }
    return try await base.list()
  }
  func set(provider: String, device: String, outlet code: String, on: Bool, allowed: @escaping @Sendable () async -> Bool) async throws -> Switched {
    let r: Result<Switched, any Error>
    do {
      let s = try await base.set(provider: provider, device: device, outlet: code, on: on, allowed: allowed)
      r = cancelAfter ? .failure(CancellationError()) : .success(s)
    } catch {
      r = .failure(error)
    }
    await hold.wait()
    return try r.get()
  }
  func timers(provider: String, device: String) async throws -> [PlugTimer] { try await base.timers(provider: provider, device: device) }
  func countdown(provider: String, device: String, outlet code: String, seconds: Int) async throws -> Bool {
    try await base.countdown(provider: provider, device: device, outlet: code, seconds: seconds)
  }
}

enum KeysThen: CaseIterable, CustomStringConvertible {
  case kept, removed, another
  var description: String { "keys \(self == .kept ? "kept" : self == .removed ? "removed" : "changed")" }
}

/// One plug command, ended as `taking` says, the keys as `keys` says while its answer is held, the list then read or
/// not: what the board answered the call, and whether the command reached the plug.
@MainActor
func ending(_ taking: Taking, _ keysThen: KeysThen, listFails: Bool) async -> (outcome: PlugBoard.Outcome?, reached: Bool) {
  let c = Cloud([taking.device(strip())])
  let hold = AnswerHold()
  let board = PlugBoard()
  await board.refresh(Held(base: c.source(), hold: hold, cancelAfter: taking == .cancelledAfter))
  c.fake.losesAnswers = taking == .losesAnswer
  let allowed = taking != .withdrawn
  let call = Task { await board.set(lamp, on: false, allowed: { allowed }) }
  while !(await hold.arrived) { await Task.yield() }
  if listFails { await hold.failLists() }
  switch keysThen {
  case .kept: break
  case .removed: await board.refresh(nil)
  case .another: await board.refresh(Cloud([]).source(TuyaKeys(accessId: keys.accessId, accessSecret: keys.accessSecret, dataCenter: .india)))
  }
  await hold.release()
  let outcome = await call.value
  return (outcome, c.posts > 0 && taking.reaches)
}

@MainActor @Test("No line says a command wasn't sent when it may have reached the device: every way a plug's and the lamp's end")
func noLineSaysNotSentWhenItWent() async {
  var reached = 0, notReached = 0
  for taking in Taking.all {
    for keysThen in KeysThen.allCases {
      for listFails in [false, true] {
        let (outcome, went) = await ending(taking, keysThen, listFails: listFails)
        if went { reached += 1 } else { notReached += 1 }
        // Then signed out, or the outlet's role changed, or neither.
        for w in [nil, .signedOut, .role] as [CommandEnd.Withdrawal?] {
          let e = CommandEnd.plug(outcome, withdrawn: w)
          #expect(!(went && e.nothingSent), """
            \(taking), \(keysThen), list \(listFails ? "not read" : "read"), \(w.map { "then \($0)" } ?? "not withdrawn"): \
            the plug took it, the board answered \(String(describing: outcome)), the card says \(e)
            """)
        }
      }
    }
  }
  // Both kinds were met: the check isn't empty.
  #expect(reached > 0 && notReached > 0)
  // The lamp: any of its recordings out, whether it failed, whether it said why; then signed out, or not.
  for sentAny in [false, true] {
    for failed in [false, true] where failed || sentAny {
      for withReason in [false, true] where failed || !withReason {
        for w in [nil, .signedOut, .role] as [CommandEnd.Withdrawal?] {
          let e = CommandEnd.lamp(sentAny: sentAny, failed: failed, withReason: withReason, withdrawn: w)
          #expect(!(sentAny && e.nothingSent), "lamp: sent any \(sentAny), failed \(failed), reason \(withReason), \(String(describing: w)): \(e)")
          #expect(sentAny || e.nothingSent, "lamp: nothing broadcast, and the card says it may have gone: \(e)")
        }
      }
    }
  }
}

@MainActor @Test("What a failed command says: why it was withdrawn only when nothing reached the device; the lamp on without its colour keeps its reason")
func whatAFailedCommandSays() async {
  // Nothing went: why it was withdrawn.
  #expect(CommandEnd.plug(nil, withdrawn: .signedOut) == .withdrawn(.signedOut))
  #expect(CommandEnd.plug(.refused(.quota), withdrawn: .role) == .withdrawn(.role))
  #expect(CommandEnd.plug(nil, withdrawn: nil) == .notSent && CommandEnd.plug(.refused(.quota), withdrawn: nil) == .refused(.quota))
  // It went: its own line, after a sign-out too (the Writing Lead, 17 Nov).
  #expect(CommandEnd.plug(.unknown, withdrawn: .signedOut) == .unknown && CommandEnd.plug(.unconfirmed, withdrawn: .role) == .unconfirmed)
  #expect(CommandEnd.plug(.confirmed, withdrawn: .signedOut) == .done)
  // The lamp: "on" went and its colour didn't. Bluetooth's reason kept, a sign-out after it too; signed out with no
  // other reason: the sign-out (Codex, 17 Nov).
  #expect(CommandEnd.lamp(sentAny: true, failed: true, withReason: true, withdrawn: .signedOut) == .lampOnOnly(.own))
  #expect(CommandEnd.lamp(sentAny: true, failed: true, withReason: false, withdrawn: .signedOut) == .lampOnOnly(.signedOut))
  #expect(CommandEnd.lamp(sentAny: true, failed: true, withReason: false, withdrawn: nil) == .lampOnOnly(.unknown))
  #expect(CommandEnd.lamp(sentAny: false, failed: true, withReason: true, withdrawn: .signedOut) == .withdrawn(.signedOut))
  #expect(CommandEnd.lamp(sentAny: false, failed: true, withReason: true, withdrawn: nil) == .lampNotSent)
  // The keys changed while its answer was lost: the board says it may have switched.
  #expect(await ending(.losesAnswer, .removed, listFails: false).outcome == .unknown)
  #expect(await ending(.losesAnswer, .another, listFails: false).outcome == .unknown)
  #expect(await ending(.withdrawn, .another, listFails: false).outcome == nil)
}
