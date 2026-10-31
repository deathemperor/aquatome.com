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
