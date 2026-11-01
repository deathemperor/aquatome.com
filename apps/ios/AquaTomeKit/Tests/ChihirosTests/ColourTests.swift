import Testing
@testable import Chihiros

// What a setting looks like and the colour looks: the same rules as the site's light-view.ts, with the cases of its
// tests (apps/site/test/light-view.test.ts), and the day preview's pace.

private let rgb: [Channel] = [.red, .green, .blue]

@Test func equalRedGreenAndBlueMixToANearWhiteOneChannelToItsOwnColourNothingOnIsDark() {
  let w = Mix(channels: rgb, levels: [100, 100, 100])
  #expect(min(w.rgb.r, w.rgb.g, w.rgb.b) > 220)
  #expect(w.power == 1)
  #expect(abs(Mix(channels: rgb, levels: [50, 50, 50]).power - 0.5) < 0.05)
  let red = Mix(channels: rgb, levels: [80, 0, 0])
  #expect(red.rgb.r == 255 && red.rgb.b < 60)
  let off = Mix(channels: rgb, levels: [0, 0, 0])
  #expect(off.rgb == RGB(0, 0, 0) && off.power == 0)
  #expect(Mix(channels: [.white], levels: [100]).rgb == RGB(255, 240, 220))
}

@Test func aRedPlantLooksRedderUnderMoreRedAndDarkWithTheLightOff() {
  let plant = RGB(180, 60, 60)
  let warm = Mix(channels: rgb, levels: [90, 50, 50]).lit(plant)
  let cool = Mix(channels: rgb, levels: [40, 60, 90]).lit(plant)
  #expect(Double(warm.r) / Double(warm.b) > Double(cool.r) / Double(cool.b))
  let off = Mix(channels: rgb, levels: [0, 0, 0]).lit(plant)
  #expect(max(off.r, off.g, off.b) < 10)
}

@Test func looksAreSharesOfTheBrightestChannel() {
  let red = Look.all[1]
  #expect(red.levels(rgb, top: 70) == [70, 56, 53])
  #expect(red.matches([70, 56, 53], channels: rgb))
  #expect(red.matches([70, 57, 52], channels: rgb)) // within one
  #expect(!red.matches([70, 70, 70], channels: rgb))
  #expect(!red.matches([0, 0, 0], channels: rgb))
  #expect(Look.all[0].levels([.red, .green, .blue, .white], top: 0) == [70, 70, 70, 70]) // off: from 70
}

@Test func theEyeSeesTheLightOnACurve() {
  let m = Mix(channels: rgb, levels: [40, 40, 40])
  #expect(abs(m.seen.power - m.power.squareRoot()) < 1e-9)
  #expect(m.seen.rgb == m.rgb)
}

@Test func theDayPreviewTakesTenSecondsAndSendsOnlyWhenTheLightChangesEnough() {
  #expect(DayPreview.minute(at: 5) == 720)
  #expect(DayPreview.minute(at: 12) == 1440)
  #expect(DayPreview.minute(at: 60, lasting: 120) == 720)
  #expect(DayPreview.sends(0, after: -1)) // the first: off
  #expect(!DayPreview.sends(0, after: 0))
  #expect(DayPreview.sends(3, after: 0)) // on
  #expect(!DayPreview.sends(6, after: 3))
  #expect(DayPreview.sends(7, after: 3))
  #expect(DayPreview.sends(0, after: 2)) // off again
  #expect(DayPreview.sends(100, after: 97)) // full: the schedule's own levels
  #expect(!DayPreview.sends(100, after: 100))
  #expect(DayPreview.sends(99, after: 100)) // dimming again
}
