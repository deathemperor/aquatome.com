import Foundation

// "Bật với màu của lịch": the light on now with its schedule's colours, for today only, then on its schedule again by
// itself, with no phone near. The light keeps one schedule period per weekday (chihiros-led-control's service refuses two
// that share a day), so the schedule is written as two periods: the six other days as they are, and today's one period,
// the schedule's own stretched to light the light from now.

/// Days of the week in the schedule frame's weekday byte: Monday 64, Tuesday 32, Wednesday 16, Thursday 8, Friday 4,
/// Saturday 2, Sunday 1.
public enum Weekdays {
  public static let everyday: UInt8 = 127
  /// An ISO weekday's bit (1 Monday … 7 Sunday).
  public static func bit(_ iso: Int) -> UInt8 { UInt8(1 << (7 - iso)) }
}

/// Where a minute of the day falls on a schedule: before its on, while it has the light on (ramps too), after its off.
public enum Moment: Sendable, Equatable { case beforeOn, lit, afterOff }

/// When "Bật với màu của lịch" ends: an hour or two from now, or the schedule's own off ("đến lịch tiếp theo").
public enum TodayEnd: String, Sendable, CaseIterable { case oneHour, twoHours, nextPoint }

/// Why it can't be done now.
public enum TodayProblem: Error, Sendable, Equatable {
  /// The light keeps one period for every day (`Model.hasWeekdayPeriods`).
  case noWeekdayPeriods
  /// The schedule has the light on already.
  case lit
  /// Before the schedule's on, only until its off: today's one period replaces the day's, so one that ended sooner would
  /// leave the day dark.
  case onlyUntilItsOff
  /// After the schedule's off, an hour or two: until its next on would be all night, and grow algae.
  case onlyAnHourOrTwo
  /// 23:59: no minute left today (a period can't cross midnight).
  case tooLate
}

/// The last minute a period can end at: the frame can't cross midnight.
private let lastMinute = 23 * 60 + 59

extension Schedule {
  public func moment(atMinute m: Int) -> Moment { m < on.minutes ? .beforeOn : m < offMinute ? .lit : .afterOff }

  /// The ends offered at minute `m` of the day: before the schedule's on, until its off (an hour or two would either end
  /// before its on, leaving the day dark, or reach it and be the same); after its off, an hour or two, never past
  /// 23:59; none while it has the light on.
  public func todayEnds(atMinute m: Int) -> [TodayEnd] {
    switch moment(atMinute: m) {
    case .beforeOn: [.nextPoint]
    case .lit: []
    case .afterOff: m < lastMinute ? [.oneHour, .twoHours] : []
    }
  }
  /// The ends offered at `now`, as the phone's calendar has it.
  public func todayEnds(at now: Date, timeZone: TimeZone = .current) -> [TodayEnd] {
    todayEnds(atMinute: Local(now, timeZone).minute)
  }

  /// This schedule as two periods from `now` until `end`, for the light named `name`; or why not (`TodayProblem`).
  /// Today's period is this one stretched: before its on, it comes on `ramp` minutes ago, so the light is at full now, and
  /// keeps its own off and evening ramp; after its off, it goes off an hour or two from now (23:59 at the latest), its ramp
  /// no longer than that so the light is at full now too. Stretched, not a new period, so that a light the app doesn't
  /// reach again before the same weekday next week runs its day then, only longer (see `TodayMark`).
  public func today(_ end: TodayEnd, at now: Date, timeZone: TimeZone = .current, light name: String) throws -> TodayPlan {
    guard Model.hasWeekdayPeriods(name: name) else { throw TodayProblem.noWeekdayPeriods }
    let here = Local(now, timeZone)
    let m = here.minute
    var today = self
    switch (moment(atMinute: m), end) {
    case (.lit, _):
      throw TodayProblem.lit
    case (.beforeOn, .nextPoint):
      today.on = TimeOfDay(minutes: max(0, m - ramp))
    case (.beforeOn, _):
      throw TodayProblem.onlyUntilItsOff
    case (.afterOff, .nextPoint):
      throw TodayProblem.onlyAnHourOrTwo
    case (.afterOff, _):
      guard m < lastMinute else { throw TodayProblem.tooLate }
      let off = min(lastMinute, m + (end == .oneHour ? 60 : 120))
      today.off = TimeOfDay(minutes: off)
      today.ramp = min(ramp, off - m)
    }
    return TodayPlan(end: end, schedule: self, today: today, weekday: here.weekday, day: here.day, minute: m)
  }
}

/// A schedule written as two periods for the rest of today (`Schedule.today`): `schedule` on the six other days as it
/// is, `today` on today alone.
public struct TodayPlan: Sendable, Equatable {
  public let end: TodayEnd
  /// The schedule as written for every day.
  public let schedule: Schedule
  /// Today's one period.
  public let today: Schedule
  /// Today, as an ISO weekday (1 Monday … 7 Sunday), and as the phone's date ("2026-11-07").
  public let weekday: Int
  public let day: String
  /// The minute of the day it was planned at: now.
  public let minute: Int

  public var todayBit: UInt8 { Weekdays.bit(weekday) }
  public var otherDays: UInt8 { Weekdays.everyday - todayBit }
  /// When the light goes off today (00:00: at the end of the day).
  public var ends: TimeOfDay { today.off }
  /// Minutes the light stays on from now.
  public var minutesOn: Int { today.offMinute - minute }
  /// What the phone keeps until the light has its everyday schedule again.
  public var mark: TodayMark { TodayMark(day: day, weekday: weekday, end: ends) }
}

/// Kept on the phone while a light runs a today-only period, so that the next connection once that day is over writes
/// the schedule for every day again. Until then the light runs the today-only period on the same weekday every week:
/// a light the app doesn't reach for a week comes on early that day (or, after an hour or two added in the evening, goes
/// off late), and keeps doing so until the app connects to it.
public struct TodayMark: Sendable, Equatable {
  /// The phone's date ("2026-11-07"), its ISO weekday, and when the period ends (00:00: at the end of the day).
  public let day: String
  public let weekday: Int
  public let end: TimeOfDay
  public init(day: String, weekday: Int, end: TimeOfDay) { self.day = day; self.weekday = weekday; self.end = end }

  /// Over at `now`: a later day, or the same day past its end.
  public func isOver(at now: Date, timeZone: TimeZone = .current) -> Bool {
    let here = Local(now, timeZone)
    return here.day > day || (here.day == day && end.minutes != 0 && here.minute >= end.minutes)
  }
}

/// A moment as the phone's calendar has it (Gregorian, as `Frame.setTime` sends it to the light).
private struct Local {
  let day: String
  let weekday: Int
  let minute: Int
  init(_ date: Date, _ timeZone: TimeZone) {
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = timeZone
    let c = cal.dateComponents([.year, .month, .day, .weekday, .hour, .minute], from: date)
    day = String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    weekday = (c.weekday! + 5) % 7 + 1 // Calendar: Sunday 1 … Saturday 7; ISO: Monday 1 … Sunday 7
    minute = c.hour! * 60 + c.minute!
  }
}
