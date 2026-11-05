import Foundation
import Testing
@testable import Plugs
import Tanks

// A strip's own timers (Smart Life's schedules), read to warn of one that cuts a light's power. The reply below is made
// up in the shape Tuya gives /v1.0/devices/{id}/timers: no real ids.

let timersReply = #"""
[
  { "category": { "category": "category_switch_1", "status": 1 }, "groups": [
    { "id": "1000000001", "timers": [ { "functions": [ { "code": "switch_1", "value": false } ], "loops": "1111111", "time": "00:00", "status": 1, "timezone_id": "Asia/Ho_Chi_Minh", "date": "20261101" } ] },
    { "id": "1000000002", "timers": [ { "functions": [ { "code": "switch_1", "value": true } ], "loops": "1111111", "time": "18:00", "status": 1, "timezone_id": "Asia/Ho_Chi_Minh", "date": "20261101" } ] }
  ] },
  { "category": { "category": "category_switch_2", "status": 1 }, "groups": [
    { "id": "1000000003", "timers": [
      { "functions": [ { "code": "switch_2", "value": false } ], "loops": "0111110", "time": "22:30", "status": 0, "timezone_id": "Asia/Ho_Chi_Minh", "date": "20261101" },
      { "functions": [ { "code": "switch_2", "value": false }, { "code": "switch_3", "value": true } ], "loops": "1000001", "time": "21:00", "status": 1, "timezone_id": "Asia/Ho_Chi_Minh", "date": "20261101" },
      { "functions": [ { "code": "switch_2", "value": false } ], "loops": "0000000", "time": "12:00", "status": 1, "timezone_id": "Asia/Ho_Chi_Minh", "date": "20261105" }
    ] }
  ] },
  { "category": { "category": "category_other", "status": 1 }, "groups": [
    { "id": "1000000004", "timers": [
      { "functions": [ { "code": "countdown_1", "value": 600 } ], "loops": "1111111", "time": "07:00", "status": 1 },
      { "functions": [ { "code": "switch_led", "value": false } ], "loops": "1111111", "time": "07:00", "status": 1 },
      { "functions": [ { "code": "switch_1", "value": false } ], "loops": "111111", "time": "07:00", "status": 1 },
      { "functions": [ { "code": "switch_1", "value": false } ], "loops": "1111111", "time": "7h", "status": 1 },
      { "functions": [ { "code": "switch_1", "value": false } ], "loops": "1111111", "time": "07:00" },
      "not a timer"
    ] },
    { "id": "1000000005" }
  ] }
]
"""#

func parsed(_ text: String) throws -> JSON { try JSON.parse(Data(text.utf8)) }

/// 4 November 2026, 12:00 in Ho Chi Minh City (the fixture's zone).
let nov4 = ISO8601DateFormatter().date(from: "2026-11-04T05:00:00Z")!

@Test("Tuya's timers read: each outlet's switch, its time, its days from Sunday, its zone, enabled or not; one it can't read left out")
func readsTuyasTimers() throws {
  let t = try PlugTimer.tuya(parsed(timersReply))
  let every = Array(repeating: true, count: 7), zone = "Asia/Ho_Chi_Minh"
  #expect(t == [
    PlugTimer(actions: [.init(code: "switch_1", on: false)], time: "00:00", days: every, date: "20261101", timezone: zone, enabled: true),
    PlugTimer(actions: [.init(code: "switch_1", on: true)], time: "18:00", days: every, date: "20261101", timezone: zone, enabled: true),
    PlugTimer(actions: [.init(code: "switch_2", on: false)], time: "22:30", days: [false, true, true, true, true, true, false], date: "20261101",
              timezone: zone, enabled: false),
    PlugTimer(actions: [.init(code: "switch_2", on: false), .init(code: "switch_3", on: true)], time: "21:00",
              days: [true, false, false, false, false, false, true], date: "20261101", timezone: zone, enabled: true),
    PlugTimer(actions: [.init(code: "switch_2", on: false)], time: "12:00", days: Array(repeating: false, count: 7), date: "20261105",
              timezone: zone, enabled: true),
  ])
  #expect(t[0].everyDay && !t[0].once && !t[3].everyDay && t[4].once)
  // No timers at all, as an empty list or none; anything but a list isn't Tuya's answer.
  #expect(try PlugTimer.tuya(parsed("[]")) == [] && PlugTimer.tuya(.null) == [])
  #expect(throws: PlugError.badReply) { try PlugTimer.tuya(parsed(#"{"groups": []}"#)) }
}

@Test("A timer cuts an outlet's power when it's enabled and switches that outlet off, on whichever days")
func cutsPower() throws {
  let t = try PlugTimer.tuya(parsed(timersReply))
  // Off at 00:00 every day: cuts. On at 18:00: doesn't.
  #expect(t[0].cuts("switch_1", at: nov4) && !t[1].cuts("switch_1", at: nov4))
  // Disabled in Smart Life: doesn't.
  #expect(!t[2].cuts("switch_2", at: nov4))
  // Some days only, or once (tomorrow): cuts. One that switches another outlet off cuts that one only.
  #expect(t[3].cuts("switch_2", at: nov4) && !t[3].cuts("switch_3", at: nov4) && t[4].cuts("switch_2", at: nov4))
  #expect(!t[0].cuts("switch_2", at: nov4))
  #expect(t.filter { $0.cuts("switch_1", at: nov4) } == [t[0]])
}

@Test("A timer that runs once, on a day before today in its own zone, has run: it no longer cuts")
func pastOnceDoesNotCut() {
  func once(_ date: String?, _ zone: String?) -> PlugTimer {
    PlugTimer(actions: [.init(code: "switch_1", on: false)], time: "12:00", days: Array(repeating: false, count: 7), date: date, timezone: zone, enabled: true)
  }
  // 18:00 UTC on 4 November is already the 5th in Ho Chi Minh City: a timer of the 4th there has run; in UTC, not yet.
  let late = ISO8601DateFormatter().date(from: "2026-11-04T18:00:00Z")!
  #expect(!once("20261104", "Asia/Ho_Chi_Minh").cuts("switch_1", at: late) && once("20261104", "Asia/Ho_Chi_Minh").isPast(late))
  #expect(once("20261104", "UTC").cuts("switch_1", at: late))
  // Today and later cut; a day long gone doesn't.
  #expect(once("20261105", "Asia/Ho_Chi_Minh").cuts("switch_1", at: late) && once("20261201", "Asia/Ho_Chi_Minh").cuts("switch_1", at: late))
  #expect(!once("20251231", "Asia/Ho_Chi_Minh").cuts("switch_1", at: late))
  // A day it can't read: kept, as it may still run. A timer with days is never past.
  #expect(once(nil, "UTC").cuts("switch_1", at: late) && once("4 Nov", "UTC").cuts("switch_1", at: late))
  let daily = PlugTimer(actions: [.init(code: "switch_1", on: false)], time: "00:00", days: Array(repeating: true, count: 7), date: "20200101",
                        timezone: "UTC", enabled: true)
  #expect(daily.cuts("switch_1", at: late))
}

@Test("A timer's zone is told apart from the phone's by the time it keeps now, not by its name")
func zones() {
  func timer(_ zone: String?) -> PlugTimer {
    PlugTimer(actions: [.init(code: "switch_1", on: false)], time: "00:00", days: Array(repeating: true, count: 7), date: nil, timezone: zone, enabled: true)
  }
  let saigon = TimeZone(identifier: "Asia/Saigon")!, berlin = TimeZone(identifier: "Europe/Berlin")!
  // Another name for the same zone, or another zone at the same time: the same.
  #expect(!timer("Asia/Ho_Chi_Minh").zoneDiffers(from: saigon, at: nov4) && !timer("Asia/Bangkok").zoneDiffers(from: saigon, at: nov4))
  #expect(timer("Asia/Ho_Chi_Minh").zoneDiffers(from: berlin, at: nov4))
  // None given: taken as the phone's. One the phone doesn't know: another.
  #expect(!timer(nil).zoneDiffers(from: berlin, at: nov4) && timer("Mars/Olympus").zoneDiffers(from: saigon, at: nov4))
}

@MainActor @Test("A plug's timers: one signed read with the project's token, a stale token replaced once, Tuya's refusals as for the list")
func readsAPlugsTimers() async throws {
  var d = strip()
  d.timers = try parsed(timersReply)
  let c = Cloud([d])
  let s = c.source()
  _ = try await s.list()
  let before = c.fake.log.count
  #expect(try await s.timers(provider: "tuya", device: "fake-strip-1") == PlugTimer.tuya(parsed(timersReply)))
  // One request, a read, with the list's token.
  #expect(c.fake.log.count - before == 1 && c.tokens == 1)
  #expect(c.fake.log.last?.method == "GET" && c.fake.log.last?.path == "/v1.0/devices/fake-strip-1/timers")
  // A revoked token: refused, a new one, and the read once more.
  c.fake.revoke()
  #expect(try await s.timers(provider: "tuya", device: "fake-strip-1").count == 5)
  #expect(c.tokens == 2 && c.fake.log.filter { $0.path.hasSuffix("/timers") }.count == 3)
  // A strip with none.
  #expect(try await Cloud().source().timers(provider: "tuya", device: "fake-strip-1") == [])
  // Refused as any other request is; another maker's plug isn't asked of Tuya.
  c.fake.failing = 28841002
  await #expect(throws: PlugError.expired) { try await s.timers(provider: "tuya", device: "fake-strip-1") }
  c.fake.failing = nil
  let asked = c.fake.log.count
  await #expect(throws: PlugError.noSuchPlug) { try await s.timers(provider: "ewelink", device: "fake-strip-1") }
  #expect(c.fake.log.count == asked)
  // Nothing written: no command sent.
  #expect(c.posts == 0)
}

@MainActor @Test("A light's card reads its outlet's timers once when it opens: opened again for the same outlet, nothing is asked")
func outletTimersReadOnce() async throws {
  var d = strip()
  d.timers = try parsed(timersReply)
  let c = Cloud([d])
  let s = c.source()
  let card = OutletTimers()
  var reads: Int { c.fake.log.filter { $0.path.hasSuffix("/timers") }.count }
  let off = try PlugTimer.tuya(parsed(timersReply))[0]
  await card.open(s, provider: "tuya", device: "fake-strip-1", code: "switch_1", at: nov4)
  #expect(card.state == .read([off]))
  await card.open(s, provider: "tuya", device: "fake-strip-1", code: "switch_1", at: nov4)
  async let again: Void = card.open(s, provider: "tuya", device: "fake-strip-1", code: "switch_1", at: nov4)
  async let more: Void = card.open(s, provider: "tuya", device: "fake-strip-1", code: "switch_1", at: nov4)
  _ = await (again, more)
  #expect(reads == 1, "the timers read again for the same outlet")
  // Another outlet picked: read for it.
  await card.open(s, provider: "tuya", device: "fake-strip-1", code: "switch_3", at: nov4)
  #expect(reads == 2 && card.state == .read([]))
  // A new card (the light connected again): read again.
  let next = OutletTimers()
  await next.open(s, provider: "tuya", device: "fake-strip-1", code: "switch_1", at: nov4)
  #expect(reads == 3)
}

@MainActor @Test("A failed read of the timers says why, once; no keys, nothing asked and nothing said")
func outletTimersFail() async throws {
  let c = Cloud()
  c.fake.failing = 28841002
  let card = OutletTimers()
  await card.open(c.source(), provider: "tuya", device: "fake-strip-1", code: "switch_1", at: nov4)
  #expect(card.state == .failed(.expired))
  let asked = c.fake.log.count
  await card.open(c.source(), provider: "tuya", device: "fake-strip-1", code: "switch_1", at: nov4)
  #expect(c.fake.log.count == asked, "a failed read tried again while the card is open")
  c.fake.offline = true
  let lost = OutletTimers()
  await lost.open(c.source(), provider: "tuya", device: "fake-strip-1", code: "switch_1", at: nov4)
  #expect(lost.state == .failed(.offline))
  let none = OutletTimers()
  await none.open(nil, provider: "tuya", device: "fake-strip-1", code: "switch_1", at: nov4)
  #expect(none.state == nil)
}
