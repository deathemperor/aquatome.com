import Foundation

// The schedule being edited, as the site's page draws and edits it (apps/site/src/scripts/light-view.ts and
// light-page.ts): the day's curve and the timeline's handles.

/// Minutes of the day: 0 … 1440 (the end of the day, written "00:00").
public enum Day {
  public static let minutes = 1440
  /// A minute dragged to on the timeline, to the nearest `step`, within the day.
  public static func snap(_ m: Double, step: Int = 15) -> Int {
    max(0, min(minutes, Int((m / Double(step)).rounded()) * step))
  }
}

extension Schedule {
  /// The off time as a minute of the day: 00:00 is the end of it (1440).
  public var offMinute: Int { off.minutes == 0 ? Day.minutes : off.minutes }

  /// Hours the light is on, to one decimal, from `minutesLit`: 00:00 to 00:00 is 24 (`hoursLit`, the site's count,
  /// says 0).
  public var hoursOn: Double { (Double(minutesLit) / 60 * 10).rounded() / 10 }

  /// The brightest channel's level.
  public var top: Int { levels.max() ?? 0 }

  public enum Handle: Sendable { case on, off }

  /// Where a handle may go: on and off stay at least 30 minutes apart, and far enough apart for the ramps.
  public func range(of h: Handle) -> ClosedRange<Int> {
    let gap = max(30, ramp * 2)
    switch h {
    case .on: return 0...max(0, offMinute - gap)
    case .off: return min(Day.minutes, on.minutes + gap)...Day.minutes
    }
  }

  /// The schedule with a handle moved to minute `m`: snapped to 15 minutes, kept in its range.
  public func moving(_ h: Handle, to m: Double) -> Schedule {
    let r = range(of: h)
    let v = min(r.upperBound, max(r.lowerBound, Day.snap(m)))
    var s = self
    switch h {
    case .on: s.on = TimeOfDay(minutes: v)
    case .off: s.off = TimeOfDay(minutes: v % Day.minutes)
    }
    return s
  }

  /// The day's light as points (minute, share of `top`): off, rising over the ramp from on, full, falling to off. A
  /// ramp longer than half the time lit meets in the middle.
  public func curve(top: Double) -> [(minute: Double, level: Double)] {
    let (a, b) = (Double(on.minutes), Double(offMinute))
    let r = min(Double(ramp), (b - a) / 2)
    return [(0, 0), (a, 0), (a + r, top), (b - r, top), (b, 0), (Double(Day.minutes), 0)]
  }

  /// The ramps offered (the site's list), in minutes.
  public static let ramps = [0, 10, 15, 20, 30, 45, 60, 90, 120, 150]
  /// The ramps that fit this schedule: up and down take at most the time the light is on.
  public var fittingRamps: [Int] { Schedule.ramps.filter { $0 * 2 <= max(0, minutesLit) } }
  /// The fitting ramp nearest `m` minutes (the ramp handle dragged there).
  public func ramp(near m: Double) -> Int {
    fittingRamps.min { abs(Double($0) - m) < abs(Double($1) - m) } ?? 0
  }
  /// The next fitting ramp up or down from this one (VoiceOver adjusting the ramp handle); this one at the end.
  public func ramp(steppedUp up: Bool) -> Int {
    let r = fittingRamps
    return (up ? r.first { $0 > ramp } : r.last { $0 < ramp }) ?? ramp
  }
}

/// Levels scaled so the brightest is `level`, keeping the mix; all at `level` when everything was off.
public func scaled(_ levels: [Int], to level: Int) -> [Int] {
  let top = levels.max() ?? 0
  return top == 0 ? levels.map { _ in level } : levels.map { Int((Double($0) / Double(top) * Double(level)).rounded()) }
}

/// "Xem thử cả ngày": the day in ten seconds, as the site plays it, on screen and on the light.
public enum DayPreview {
  public static let seconds = 10.0
  /// The minute of the day shown `t` seconds into a preview `length` seconds long.
  public static func minute(at t: Double, lasting length: Double = seconds) -> Double {
    min(Double(Day.minutes), t / length * Double(Day.minutes))
  }
  /// Whether the light gets new levels at `percent` of the schedule's (last sent: `last`, -1 for none): when they moved
  /// 4% or more, or the light goes on or off (the site's rule), or reaches full or leaves it, so that it shows the
  /// schedule's own levels however small the last step was; not with every frame, which the light couldn't take.
  public static func sends(_ percent: Int, after last: Int) -> Bool {
    abs(percent - last) >= 4 || (percent == 0) != (last == 0) || (percent == 100) != (last == 100)
  }
}

