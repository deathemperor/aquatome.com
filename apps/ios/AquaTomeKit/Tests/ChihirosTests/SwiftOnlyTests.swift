import Foundation
import Testing
@testable import Chihiros

// Cases the site has no counterpart for: phone settings a browser doesn't expose the same way.

@Test func clockUsesTheGregorianYearWhateverThePhoneCalendar() {
  // A Thai phone set to the Buddhist calendar would say 2569; the light wants 26.
  let zone = TimeZone(identifier: "Asia/Bangkok")!
  var buddhist = Calendar(identifier: .buddhist)
  buddhist.timeZone = zone
  let d = buddhist.date(from: DateComponents(year: 2569, month: 10, day: 31, hour: 12, minute: 5, second: 9))!
  #expect(Array(Frame.setTime(d, timeZone: zone, id: 1)[6..<12]) == [26, 10, 6, 12, 5, 9])
}

@Test func timesOfDayParseStrictly() {
  #expect(TimeOfDay("08:30") == TimeOfDay(hour: 8, minute: 30))
  #expect(TimeOfDay("24:00") == nil)
  #expect(TimeOfDay("8") == nil)
  #expect(TimeOfDay(hour: 7, minute: 5).description == "07:05")
}
