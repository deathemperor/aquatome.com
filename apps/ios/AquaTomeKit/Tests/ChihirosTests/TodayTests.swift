import Foundation
import Testing
@testable import Chihiros

// "Bật với màu của lịch": the schedule written as two periods, the six other days and today's own.

private let vietnam = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

/// Saturday 7 November 2026 at `hour`:`minute` in `zone`.
private func saturday(_ hour: Int, _ minute: Int = 0, in zone: TimeZone = vietnam) -> Date {
  var cal = Calendar(identifier: .gregorian)
  cal.timeZone = zone
  return cal.date(from: DateComponents(year: 2026, month: 11, day: 7, hour: hour, minute: minute))!
}

private func plan(_ s: Schedule, _ end: TodayEnd, at date: Date, light: String = "DYSL30A1B2C3") throws -> TodayPlan {
  try s.today(end, at: date, timeZone: vietnam, light: light)
}
/// The owner's schedule's.
private func plan(_ end: TodayEnd, at date: Date, light: String = "DYSL30A1B2C3") throws -> TodayPlan {
  try plan(owners, end, at: date, light: light)
}

private func at(_ hour: Int, _ minute: Int = 0) -> TimeOfDay { TimeOfDay(hour: hour, minute: minute) }

@Test func weekdayBitsRunFromMondayDownToSunday() {
  #expect((1...7).map(Weekdays.bit) == [64, 32, 16, 8, 4, 2, 1])
  #expect((1...7).map(Weekdays.bit).reduce(0, |) == Weekdays.everyday)
  // The weekday byte is the period's sixth: every day unless a mask is given.
  #expect(Frame.scheduleParams(owners, channels: 3)[5] == 127)
  #expect(Frame.scheduleParams(owners, channels: 3, weekdays: Weekdays.bit(6))[5] == 2)
  let frame = Frame.setSchedule(owners, channels: 3, weekdays: 0x7d, id: 1)
  #expect(Array(frame[6..<12]) == [12, 0, 20, 0, 30, 0x7d])
}

@Test func lightsWithoutWeekdayPeriodsAreKnownByName() {
  for name in ["DYZSD1", "DYNA2N1", "DYNA21", "DYNC2N1", "DYCXD1", "DYECO1", "MDTM1", "DYDD1"] {
    #expect(!Model.hasWeekdayPeriods(name: name), "\(name)")
  }
  for name in ["DYSL30A1B2C3", "DYWPRO60X", "DYNC2X", "DYU600"] {
    #expect(Model.hasWeekdayPeriods(name: name), "\(name)")
  }
}

@Test func whereNowFallsDecidesTheEndsOffered() {
  // 12:00–20:00: before its on, until its off; while it's on, nothing; after its off, an hour or two.
  #expect(owners.todayEnds(atMinute: 8 * 60) == [.nextPoint])
  #expect(owners.todayEnds(atMinute: 11 * 60 + 59) == [.nextPoint])
  #expect(owners.todayEnds(atMinute: 12 * 60) == [])
  #expect(owners.todayEnds(atMinute: 19 * 60 + 59) == [])
  #expect(owners.todayEnds(atMinute: 20 * 60) == [.oneHour, .twoHours])
  #expect(owners.todayEnds(atMinute: 23 * 60 + 58) == [.oneHour, .twoHours])
  #expect(owners.todayEnds(atMinute: 23 * 60 + 59) == [])
  // A schedule ending at midnight has no after.
  let late = Schedule(on: at(14), off: at(0), ramp: 30, levels: [60, 60, 60])
  #expect(late.todayEnds(atMinute: 23 * 60 + 30) == [])
}

@Test func beforeItsOnTheLightComesOnARampAgoAndKeepsTheSchedulesOff() throws {
  let p = try plan(.nextPoint, at: saturday(8))
  #expect(p.schedule == owners)
  // At full at 08:00, then the schedule's own evening: off at 20:00 after its 30-minute ramp.
  #expect(p.today == Schedule(on: at(7, 30), off: at(20), ramp: 30, levels: [70, 70, 70]))
  #expect(p.today.level(atMinute: 8 * 60) == 1)
  #expect(p.weekday == 6 && p.todayBit == 2 && p.otherDays == 0x7d)
  #expect(p.ends == at(20) && p.minutesOn == 12 * 60)
  #expect(p.mark == TodayMark(day: "2026-11-07", weekday: 6, end: at(20)))
  // Never before midnight.
  let early = Schedule(on: at(0, 10), off: at(8), ramp: 30, levels: [60, 60, 60])
  #expect(try plan(early, .nextPoint, at: saturday(0, 5)).today.on == at(0))
}

@Test func afterItsOffTheLightComesOnForAnHourOrTwo() throws {
  let one = try plan(.oneHour, at: saturday(21))
  // The schedule's own period stretched to 22:00: at full now, then its ramp down.
  #expect(one.today == Schedule(on: at(12), off: at(22), ramp: 30, levels: [70, 70, 70]))
  #expect(one.today.level(atMinute: 21 * 60) == 1)
  #expect(one.schedule == owners && one.otherDays == 0x7d && one.todayBit == 2)
  #expect(try plan(.twoHours, at: saturday(21)).today.off == at(23))
  // A ramp longer than the hour left is cut to it: still at full now.
  let slow = Schedule(on: at(8), off: at(18), ramp: 90, levels: [50, 50, 50])
  let p = try plan(slow, .oneHour, at: saturday(19))
  #expect(p.today == Schedule(on: at(8), off: at(20), ramp: 60, levels: [50, 50, 50]))
  #expect(p.today.level(atMinute: 19 * 60) == 1)
  #expect(p.today.problem == nil)
}

@Test func neverPastMidnight() throws {
  let one = try plan(.oneHour, at: saturday(23, 10))
  #expect(one.ends == at(23, 59) && one.minutesOn == 49)
  #expect(try plan(.twoHours, at: saturday(23, 10)).ends == at(23, 59))
  // The ramp fits what's left.
  let p = try plan(.oneHour, at: saturday(23, 45))
  #expect(p.today.ramp == 14 && p.today.problem == nil)
  #expect(Array(Frame.scheduleParams(p.today, channels: 3, weekdays: p.todayBit)[0..<6]) == [12, 0, 23, 59, 14, 2])
  #expect(throws: TodayProblem.tooLate) { try plan(.oneHour, at: saturday(23, 59)) }
}

@Test func refusesWhatItCantDo() {
  // A light with one period for every day.
  #expect(throws: TodayProblem.noWeekdayPeriods) { try plan(.nextPoint, at: saturday(8), light: "DYNA2N1A2B3") }
  // Before the schedule's on, an end before it would replace the day's light: only until its off, even when an hour
  // or two would reach its on.
  #expect(throws: TodayProblem.onlyUntilItsOff) { try plan(.oneHour, at: saturday(8)) }
  #expect(throws: TodayProblem.onlyUntilItsOff) { try plan(.twoHours, at: saturday(11)) }
  // After its off, never all night.
  #expect(throws: TodayProblem.onlyAnHourOrTwo) { try plan(.nextPoint, at: saturday(21)) }
  // On already.
  for end in TodayEnd.allCases { #expect(throws: TodayProblem.lit) { try plan(end, at: saturday(15)) } }
}

@Test func theMarkIsOverOnceItsDayIsDoneOrItsTimeHasPassed() {
  let mark = TodayMark(day: "2026-11-07", weekday: 6, end: at(20))
  #expect(!mark.isOver(at: saturday(19, 59), timeZone: vietnam))
  #expect(mark.isOver(at: saturday(20), timeZone: vietnam))
  #expect(mark.isOver(at: saturday(0).addingTimeInterval(86_400 + 3600), timeZone: vietnam)) // Sunday 01:00
  #expect(!mark.isOver(at: saturday(0).addingTimeInterval(-3600), timeZone: vietnam)) // Friday 23:00
  // One that runs to midnight is over the next day only.
  let midnight = TodayMark(day: "2026-11-07", weekday: 6, end: at(0))
  #expect(!midnight.isOver(at: saturday(23, 59), timeZone: vietnam))
  #expect(midnight.isOver(at: saturday(0).addingTimeInterval(86_400), timeZone: vietnam))
}

@MainActor @Test func writesTheSixDaysThenTodayThenReadsOnce() async throws {
  let light = FakeLight(schedule: owners, channels: 3)
  // A light still showing the cleared curve isn't read again: one read, whatever it says.
  light.staleReadbacks = 2
  let s = session(light)
  try await s.refresh()
  let now = saturday(8, in: .current)
  let p = try owners.today(.nextPoint, at: now, light: s.name)
  let before = light.sent.count
  try await s.writeToday(p, now: now)
  let sent = Array(light.sent[before...])
  #expect(sent.map { [$0[0], $0[5]] } == [[0x5a, 0x09], [0x5a, 0x05], [0x5a, 0x05], [0xa5, 0x19], [0xa5, 0x19], [0x5a, 0x04]])
  #expect(sent[1][6] == Mode.sceneReset && sent[2][6] == Mode.scene)
  #expect(Array(sent[3][6..<12]) == [12, 0, 20, 0, 30, 0x7d])
  #expect(Array(sent[4][6..<12]) == [7, 30, 20, 0, 30, 0x02])
  #expect(light.periods == [0x7d: owners, 0x02: Schedule(on: at(7, 30), off: at(20), ramp: 30, levels: [70, 70, 70])])
  #expect(light.clock == Snapshot.Clock(weekday: 6, time: at(8)))
  #expect(!s.isManual)

  // Back to every day: the scenes cleared, one period for all seven days.
  try await s.backToSchedule(owners)
  #expect(light.periods == [Weekdays.everyday: owners])
}

@MainActor @Test func oldFirmwareTakesNoPeriods() async throws {
  let light = FakeLight(firmware: 19, schedule: owners, channels: 3)
  let s = session(light)
  try await s.refresh()
  let p = try owners.today(.nextPoint, at: saturday(8, in: .current), light: s.name)
  await #expect(throws: SessionError.firmwareTooOld(19)) { try await s.writeToday(p) }
  #expect(light.sent.count == 1) // the status request only
}
