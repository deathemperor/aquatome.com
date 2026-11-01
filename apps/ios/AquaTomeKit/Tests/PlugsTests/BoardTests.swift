import Foundation
import Testing
@testable import Plugs
import Tanks

// PlugBoard: what the app shows of the plugs and the switching rules of docs/smart-plugs.md, over Tuya's source and
// the stand-in cloud. It knows only `PlugSource`.

let lamp = PlugBoard.Outlet(provider: "tuya", device: "fake-strip-1", code: "switch_1")

@MainActor @Test("A tap sets the outlet; it shows what the plug reported, with a confirmation, after one command")
func boardConfirmed() async throws {
  let c = Cloud()
  let board = PlugBoard()
  await board.refresh(c.source())
  #expect(board.on(lamp) == true && board.online(provider: "tuya", device: "fake-strip-1") == true)
  await board.set(lamp, on: false)
  #expect(board.on(lamp) == false && board.outcome(lamp) == .confirmed)
  #expect(c.posts == 1 && c.lists == 1)
  // The next read (the screen opened again) shows the list, without the note.
  await board.refresh(c.source())
  #expect(board.on(lamp) == false && board.outcome(lamp) == nil)
}

@MainActor @Test("A plug that doesn't confirm: the list read once more, never the switch sent again; it shows what the plug reports")
func boardUnconfirmed() async throws {
  let c = Cloud([{ var d = strip(); d.ignores = true; return d }()])
  let board = PlugBoard()
  await board.refresh(c.source())
  await board.set(lamp, on: false)
  #expect(board.on(lamp) == true, "shown as the plug reports it, not as asked")
  #expect(board.outcome(lamp) == .unconfirmed)
  #expect(c.posts == 1 && c.lists == 2)
  // One whose state couldn't be read back, but which did switch: confirmed by the list read again.
  let mute = Cloud([{ var d = strip(); d.unreadable = true; return d }()])
  let b2 = PlugBoard()
  await b2.refresh(mute.source())
  await b2.set(lamp, on: false)
  #expect(b2.on(lamp) == false && b2.outcome(lamp) == .confirmed)
  #expect(mute.posts == 1 && mute.lists == 2)
}

@MainActor @Test("Tuya's error or a lost answer: unknown, the list read once more, nothing sent again")
func boardMakerError() async throws {
  let c = Cloud([{ var d = strip(); d.refuses = 2008; return d }()])
  let board = PlugBoard()
  await board.refresh(c.source())
  await board.set(lamp, on: false)
  // Read again: the plug still reports on.
  #expect(board.on(lamp) == true && board.outcome(lamp) == .unconfirmed)
  #expect(c.posts == 1 && c.lists == 2)

  // Not Tuya's answer, and the list read again can't say either: unknown.
  let down = Cloud()
  let b2 = PlugBoard()
  await b2.refresh(down.source())
  down.fake.down = true
  await b2.set(lamp, on: false)
  #expect(b2.on(lamp) == nil && b2.outcome(lamp) == .unknown && b2.listError == .badReply)

  // No network as the switch went: the same, and nothing queued for later.
  let net = Cloud()
  let b3 = PlugBoard()
  await b3.refresh(net.source())
  net.fake.offline = true
  await b3.set(lamp, on: false)
  #expect(b3.on(lamp) == nil && b3.outcome(lamp) == .unknown && b3.listError == .offline)
  net.fake.offline = false
  await b3.refresh(net.source())
  #expect(net.posts == 0 && b3.on(lamp) == true)
}

@MainActor @Test("A command carried out whose answer was lost: unknown until the list, read again once, says it switched")
func boardLostAnswer() async throws {
  let c = Cloud()
  let board = PlugBoard()
  await board.refresh(c.source())
  c.fake.losesAnswers = true
  await board.set(lamp, on: false)
  #expect(board.on(lamp) == false && board.outcome(lamp) == .confirmed)
  #expect(c.posts == 1 && c.lists == 2)
}

@MainActor @Test("Refused before anything reached the plug: said so, nothing read again; an expired trial, for one")
func boardRefused() async throws {
  let c = Cloud()
  let board = PlugBoard()
  await board.refresh(c.source())
  c.fake.failing = 28841002
  await board.set(lamp, on: false)
  #expect(board.outcome(lamp) == .refused(.expired) && board.on(lamp) == true)
  #expect(c.lists == 1)
}

@MainActor @Test("An offline plug: no switch sent while it's listed offline; one gone offline since is refused and shown offline")
func boardOffline() async throws {
  let c = Cloud([{ var d = strip(); d.dropsOff = true; return d }(), { var d = strip("fake-offline"); d.online = false; return d }()])
  let board = PlugBoard()
  await board.refresh(c.source())
  await board.set(PlugBoard.Outlet(provider: "tuya", device: "fake-offline", code: "switch_1"), on: false)
  #expect(c.posts == 0, "sent to a plug listed offline")
  await board.set(lamp, on: false)
  #expect(board.online(provider: "tuya", device: "fake-strip-1") == false && board.outcome(lamp) == .refused(.plugOffline))
  #expect(board.on(lamp) == true && c.posts == 1)
  await board.set(lamp, on: false)
  #expect(c.posts == 1, "sent again to a plug found offline")
  // Read again: offline in the list too.
  await board.refresh(c.source())
  #expect(board.online(provider: "tuya", device: "fake-strip-1") == false)
  // Nothing before a list, nor once the keys are gone.
  let fresh = PlugBoard()
  await fresh.set(lamp, on: false)
  await board.refresh(nil)
  await board.set(lamp, on: false)
  #expect(c.posts == 1 && board.list == nil)
}

@MainActor @Test("One switch at a time per outlet: a second tap while one is on its way sends nothing")
func boardInFlight() async throws {
  let c = Cloud()
  let board = PlugBoard()
  let source = c.source(wait: .milliseconds(50))
  await board.refresh(source)
  let first = Task { await board.set(lamp, on: false) }
  while !board.switching.contains(lamp) { await Task.yield() }
  await board.set(lamp, on: true)
  await first.value
  #expect(c.posts == 1 && board.on(lamp) == false && board.switching.isEmpty)
}

/// A source whose switch ends cancelled after the command went.
struct CancelledAfterSending: PlugSource {
  let base: any PlugSource
  var owner: String { base.owner }
  func list() async throws -> PlugList { try await base.list() }
  func set(provider: String, device: String, outlet code: String, on: Bool) async throws -> Switched {
    _ = try await base.set(provider: provider, device: device, outlet: code, on: on)
    throw CancellationError()
  }
}

@MainActor @Test("A switch that ends cancelled after its command may have gone: the list read once more says what the plug did")
func boardSwitchCancelled() async throws {
  let c = Cloud()
  let board = PlugBoard()
  await board.refresh(CancelledAfterSending(base: c.source()))
  await board.set(lamp, on: false)
  #expect(board.on(lamp) == false && board.outcome(lamp) == .confirmed)
  #expect(c.posts == 1 && c.lists == 2)
}

@MainActor @Test("Keys removed or changed while a switch is on its way: its answer isn't shown")
func boardKeysChangedMidSwitch() async throws {
  let other = Cloud([])
  for next in [nil, other.source(TuyaKeys(accessId: keys.accessId, accessSecret: keys.accessSecret, dataCenter: .india))] as [TuyaPlugs?] {
    let c = Cloud()
    let board = PlugBoard()
    await board.refresh(c.source(wait: .milliseconds(50)))
    let first = Task { await board.set(lamp, on: false) }
    while !board.switching.contains(lamp) { await Task.yield() }
    await board.refresh(next)
    await first.value
    #expect(c.posts == 1)
    #expect(board.on(lamp) == nil && board.outcome(lamp) == nil, "the old project's answer was shown")
  }
}

/// A source whose lists are answered at once, and reach the phone when the gate opens.
struct Gated: PlugSource {
  let base: any PlugSource
  let gate: Gate
  var owner: String { base.owner }
  func list() async throws -> PlugList {
    let l = try await base.list()
    await gate.wait()
    return l
  }
  func set(provider: String, device: String, outlet code: String, on: Bool) async throws -> Switched {
    try await base.set(provider: provider, device: device, outlet: code, on: on)
  }
}

@MainActor @Test("A list answer older than a switch answer doesn't put the old state back")
func boardStaleList() async throws {
  let c = Cloud()
  let gate = Gate()
  let source = Gated(base: c.source(), gate: gate)
  let board = PlugBoard()
  await gate.open()
  await board.refresh(source)
  await gate.close()
  // A read is answered with the outlet on; the switch's answer (off) reaches the phone first.
  let slow = Task { await board.refresh(source) }
  while !board.loading || c.lists < 2 { await Task.yield() }
  await board.set(lamp, on: false)
  #expect(board.on(lamp) == false)
  await gate.open()
  await slow.value
  #expect(board.on(lamp) == false, "the older list answer put the old state back")
}

@MainActor @Test("Another project's keys: what the last one showed goes")
func boardAnotherOwner() async throws {
  let c = Cloud()
  let board = PlugBoard()
  await board.refresh(c.source())
  #expect(board.list?.plugs.count == 1)
  let other = Cloud([])
  await board.refresh(other.source(TuyaKeys(accessId: keys.accessId, accessSecret: keys.accessSecret, dataCenter: .india)))
  #expect(board.list == PlugList(plugs: [], others: 0) && board.on(lamp) == nil)
}

/// Holds requests until opened.
actor Gate {
  private var isOpen = false
  private var waiting: [CheckedContinuation<Void, Never>] = []
  func wait() async { if !isOpen { await withCheckedContinuation { waiting.append($0) } } }
  func open() { isOpen = true; waiting.forEach { $0.resume() }; waiting = [] }
  func close() { isOpen = false }
}
