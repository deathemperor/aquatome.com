import Testing
@testable import Chihiros

// The schedule as the timeline edits it: the same rules as the site's light-view.ts and light-page.ts, with the cases
// of its tests (apps/site/test/light-view.test.ts).

private func t(_ h: Int, _ m: Int) -> TimeOfDay { TimeOfDay(hour: h, minute: m) }

@Test func timesOnTheTimelineSnapToFifteenMinutesWithinTheDay() {
  #expect(Day.snap(727) == 720)
  #expect(Day.snap(1500) == 1440)
  #expect(Day.snap(-20) == 0)
  #expect(TimeOfDay(minutes: 1440) == t(0, 0))
}

@Test func theDaysCurveIsOffRampFullRampOff() {
  let s = Schedule(on: t(12, 0), off: t(20, 0), ramp: 30, levels: [70, 70, 70])
  #expect(s.curve(top: 0.7).map { [$0.minute, $0.level] } == [[0, 0], [720, 0], [750, 0.7], [1170, 0.7], [1200, 0], [1440, 0]])
  // A ramp longer than half the time lit meets in the middle instead of crossing.
  let short = Schedule(on: t(12, 0), off: t(12, 40), ramp: 30, levels: [100])
  #expect(short.curve(top: 1).map(\.minute) == [0, 720, 740, 740, 760, 1440])
}

@Test func handlesStayApartByThirtyMinutesOrTheRampsAndSnap() {
  let s = Schedule(on: t(12, 0), off: t(20, 0), ramp: 30, levels: [70, 70, 70])
  #expect(s.range(of: .on) == 0...1140)
  #expect(s.range(of: .off) == 780...1440)
  #expect(s.moving(.on, to: 790).on == t(13, 15))
  #expect(s.moving(.on, to: 1300).on == t(19, 0)) // held an hour before off: two 30-minute ramps
  #expect(s.moving(.off, to: 1500).off == t(0, 0)) // the end of the day
  #expect(s.moving(.off, to: 100).off == t(13, 0))
  #expect(Schedule(on: t(12, 0), off: t(20, 0), ramp: 0, levels: [70]).range(of: .on).upperBound == 1170)
}

@Test func theRampsOfferedFitTheTimeLit() {
  let s = Schedule(on: t(12, 0), off: t(13, 0), ramp: 30, levels: [70])
  #expect(s.fittingRamps == [0, 10, 15, 20, 30])
  #expect(s.ramp(near: 22) == 20)
  #expect(s.ramp(near: 400) == 30)
  #expect(s.ramp(steppedUp: false) == 20)
  #expect(s.ramp(steppedUp: true) == 30) // none longer fits
}

@Test func levelsScaleToABrightnessKeepingTheMix() {
  #expect(scaled([70, 56, 35], to: 40) == [40, 32, 20])
  #expect(scaled([0, 0, 0], to: 40) == [40, 40, 40])
}

@Test func aWholeDayIsTwentyFourHoursOn() {
  #expect(Schedule(on: t(0, 0), off: t(0, 0), ramp: 30, levels: [70]).hoursOn == 24)
  #expect(Schedule(on: t(12, 0), off: t(0, 0), ramp: 30, levels: [70]).hoursOn == 12)
  #expect(Schedule(on: t(13, 0), off: t(19, 20), ramp: 30, levels: [70]).hoursOn == 6.3)
}
