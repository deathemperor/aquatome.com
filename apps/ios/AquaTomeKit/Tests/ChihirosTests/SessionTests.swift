import Foundation
import Testing
@testable import Chihiros

// LightSession against FakeLight, which answers the way the real light did in hands-on tests.

let slim = Model.of(name: "DYSL30A1B2C3")!
let owners = Schedule(on: TimeOfDay(hour: 12, minute: 0), off: TimeOfDay(hour: 20, minute: 0), ramp: 30, levels: [70, 70, 70])
let newTank = Schedule(on: TimeOfDay(hour: 13, minute: 0), off: TimeOfDay(hour: 19, minute: 0), ramp: 15, levels: [40, 50, 60])

@MainActor
func session(_ light: FakeLight) -> LightSession { LightSession(name: "DYSL30A1B2C3", model: slim, link: light, pacing: .none) }

@MainActor @Test func readsFirmwareClockAndSavedSchedule() async throws {
  let light = FakeLight(schedule: owners, channels: 3)
  let s = session(light)
  let snap = try await s.refresh()
  #expect(s.firmware == 24)
  #expect(snap.clock.time == TimeOfDay(hour: 15, minute: 41))
  #expect(snap.schedule(channels: 3) == owners)
}

@MainActor @Test func writesClockThenClearsThenSceneThenSchedule() async throws {
  let light = FakeLight(schedule: owners, channels: 3)
  let s = session(light)
  try await s.refresh()
  let now = Calendar(identifier: .gregorian).date(from: DateComponents(year: 2026, month: 10, day: 31, hour: 16, minute: 2))!
  let snap = try await s.writeSchedule(newTank, now: now)
  let kinds = light.sent.map { [$0[0], $0[5]] }
  #expect(kinds == [[0x5a, 0x04], [0x5a, 0x09], [0x5a, 0x05], [0x5a, 0x05], [0xa5, 0x19], [0x5a, 0x04]])
  #expect(light.sent[2][6] == Mode.sceneReset && light.sent[3][6] == Mode.scene)
  #expect(light.sent.map { UInt16($0[3]) << 8 | UInt16($0[4]) } == [1, 2, 3, 4, 5, 6])
  #expect(snap.holds(newTank, channels: 3))
  #expect(snap.clock.time == TimeOfDay(hour: 16, minute: 2))
  // The curve keeps the first channel's level only.
  #expect(snap.schedule(channels: 3)?.levels == [40, 40, 40])
}

@MainActor @Test func readsAgainWhileTheLightStillShowsTheClearedSchedule() async throws {
  let light = FakeLight(schedule: owners, channels: 3)
  light.staleReadbacks = 2
  let s = session(light)
  let snap = try await s.writeSchedule(newTank)
  #expect(snap.holds(newTank, channels: 3))
  #expect(light.sent.filter { $0[5] == 0x04 }.count == 3)
}

@MainActor @Test func refusesSchedulesOnOldFirmware() async throws {
  let light = FakeLight(firmware: 19, schedule: owners, channels: 3)
  let s = session(light)
  try await s.refresh()
  #expect(!s.canWriteSchedule)
  await #expect(throws: SessionError.firmwareTooOld(19)) { try await s.writeSchedule(newTank) }
  #expect(light.sent.count == 1) // the status request only
}

@MainActor @Test func aSilentLightTimesOut() async throws {
  let light = FakeLight(schedule: owners, channels: 3)
  light.silent = true
  await #expect(throws: SessionError.noStatus) { try await session(light).refresh() }
}

@MainActor @Test func syncsTheClock() async throws {
  let light = FakeLight(points: [])
  light.clock = Snapshot.Clock(weekday: 0, time: TimeOfDay(hour: 0, minute: 0)) // after a power cut
  let s = session(light)
  #expect(try await s.refresh().clock.isSet == false)
  let sunday = Calendar(identifier: .gregorian).date(from: DateComponents(year: 2026, month: 11, day: 1, hour: 8, minute: 30))!
  let snap = try await s.syncClock(now: sunday)
  #expect(snap.clock == Snapshot.Clock(weekday: 7, time: TimeOfDay(hour: 8, minute: 30)))
}

@MainActor @Test func manualLevelsSwitchToManualOnce() async throws {
  let light = FakeLight(schedule: owners, channels: 3)
  let s = session(light)
  try await s.setLevel(channel: 0, level: 30)
  try await s.setLevel(channel: 2, level: 80)
  #expect(light.sent.filter { $0[5] == 0x05 }.count == 1)
  #expect(light.isManual && light.levels == [0: 30, 2: 80])
  try await s.writeSchedule(owners)
  #expect(!s.isManual)
}

@MainActor @Test func overlappingCommandsDoNotInterleave() async throws {
  let light = FakeLight(schedule: owners, channels: 3)
  light.writeDelay = .milliseconds(5)
  let s = session(light)
  try await s.refresh()
  async let write: Snapshot = s.writeSchedule(newTank)
  async let level: Void = s.setLevel(channel: 1, level: 10)
  _ = try await (write, level)
  // The schedule's four frames stay together, whichever command went first.
  let kinds = light.sent.map { $0[5] }
  let start = try #require(kinds.firstIndex(of: 0x09))
  #expect(Array(kinds[start..<(start + 4)]) == [0x09, 0x05, 0x05, 0x19])
  // Ids stay in order.
  let ids = light.sent.map { UInt16($0[3]) << 8 | UInt16($0[4]) }
  #expect(ids == ids.sorted())
}

@MainActor @Test func aScheduleStartingAtMidnightKeepsItsFirstPoint() throws {
  // The light stores 00:00 at 0% as `00 00 00`, the same bytes as an unused slot: only trailing ones are unused.
  let s = Schedule(on: TimeOfDay(hour: 0, minute: 0), off: TimeOfDay(hour: 8, minute: 0), ramp: 30, levels: [60, 60, 60])
  let snap = try #require(Snapshot(lightHolding: s))
  #expect(snap.points.count == 4)
  #expect(snap.holds(s, channels: 3))
  #expect(snap.schedule(channels: 3) == s)
}

@MainActor @Test func rampsThatMeetInTheMiddleReadBack() throws {
  let s = Schedule(on: TimeOfDay(hour: 12, minute: 0), off: TimeOfDay(hour: 13, minute: 0), ramp: 30, levels: [50, 50, 50])
  let snap = try #require(Snapshot(lightHolding: s))
  #expect(snap.holds(s, channels: 3))
  #expect(snap.schedule(channels: 3) == s)
}

extension Snapshot {
  /// What the fake light reports after `s` is written.
  @MainActor init?(lightHolding s: Schedule) {
    let light = FakeLight(schedule: s, channels: 3)
    self.init(FakeLight.snapshot(firmware: 24, clock: light.clock, points: light.points))
  }
}
