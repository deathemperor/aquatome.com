import Foundation
import Tanks
import Testing

struct TankReminderTests {
  private let calendar: Calendar = {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = TimeZone(secondsFromGMT: 7 * 3600)!
    return calendar
  }()

  @Test func aOneOffStaysDoneUntilReopened() throws {
    let due = try day(2026, 11, 27, 18)
    let finished = try day(2026, 11, 28, 12)
    var reminder = TankReminder(tankID: "one", due: due)
    reminder.complete(at: finished, in: calendar)
    reminder.complete(at: try day(2026, 11, 29, 10), in: calendar)
    #expect(reminder.finished)
    #expect(reminder.lastDone == finished)
    #expect(reminder.due == due)
    reminder.reopen()
    #expect(!reminder.finished)
    #expect(reminder.lastDone == nil)
  }

  @Test func weeklyReminderUsesTheCompletionDayAndItsOwnTimeOfDay() throws {
    var reminder = TankReminder(tankID: "one", due: try day(2026, 11, 27, 18))
    reminder.interval = .weekly
    let finished = try day(2026, 11, 30, 20)
    reminder.complete(at: finished, in: calendar)
    let next = try day(2026, 12, 7, 18)
    #expect(!reminder.finished)
    #expect(reminder.lastDone == finished)
    #expect(reminder.due == next)
  }

  @Test func seasonalReminderUsesTheNextCalendarYear() throws {
    var reminder = TankReminder(tankID: "one", due: try day(2026, 12, 17, 7))
    reminder.kind = .heater
    reminder.interval = .yearly
    reminder.complete(at: try day(2026, 12, 17, 8), in: calendar)
    let next = try day(2027, 12, 17, 7)
    #expect(reminder.due == next)
    let decoded = try JSONDecoder().decode(TankReminder.self, from: JSONEncoder().encode(reminder))
    #expect(decoded == reminder)
  }

  private func day(_ year: Int, _ month: Int, _ day: Int, _ hour: Int) throws -> Date {
    try #require(calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour)))
  }
}
