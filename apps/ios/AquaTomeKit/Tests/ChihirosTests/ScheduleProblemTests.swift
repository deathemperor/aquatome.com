import Testing
@testable import Chihiros

// The same rules as the site's schedule form (den-chihiros.astro): the light takes on and off within one day.

func sched(_ on: String, _ off: String, ramp: Int) -> Schedule {
  Schedule(on: TimeOfDay(on)!, off: TimeOfDay(off)!, ramp: ramp, levels: [70, 70, 70])
}

@Test func validSchedulesHaveNoProblem() {
  #expect(sched("12:00", "20:00", ramp: 30).problem == nil)
  #expect(sched("09:30", "00:00", ramp: 150).problem == nil) // ending at midnight
  #expect(sched("12:00", "13:00", ramp: 30).problem == nil) // ramps meet in the middle
  #expect(sched("00:00", "00:00", ramp: 0).problem == nil) // all day
}

@Test func hoursShownAreTheHoursTheLightIsOn() {
  #expect(sched("00:00", "00:00", ramp: 0).minutesLit == 1440) // not 0
  #expect(sched("09:30", "00:00", ramp: 0).minutesLit == 870)
  #expect(sched("12:00", "20:00", ramp: 0).minutesLit == 480)
}

@Test func offMustComeAfterOnTheSameDay() {
  #expect(sched("20:00", "12:00", ramp: 0).problem == .offNotAfterOn)
  #expect(sched("12:00", "12:00", ramp: 0).problem == .offNotAfterOn)
}

@Test func rampLimits() {
  #expect(sched("08:00", "20:00", ramp: 151).problem == .rampOutOfRange)
  #expect(sched("08:00", "20:00", ramp: -1).problem == .rampOutOfRange)
  #expect(sched("12:00", "13:00", ramp: 31).problem == .rampTooLong)
}

@Test func levelsFitAnotherLight() {
  #expect(fit([20, 60, 40], to: 1) == [60]) // a white-only light: the brightest, not the first
  #expect(fit([70, 50, 60], to: 4) == [70, 50, 60, 70])
  #expect(fit([70, 50, 60, 40], to: 3) == [70, 50, 60])
  #expect(fit([], to: 3) == [0, 0, 0])
}
