import Chihiros
import Foundation
import Testing
@testable import WeekAqua

// WeekAquaSession against FakeWeekAqua, which takes frames the way the owner's three lights did in hands-on tests.

let green = WeekAquaPreset.named("green")!.levels
/// The owner's group as WEEK AQUA leaves it: Green at half brightness, on 02:50 to 02:40.
let owners = WeekAquaSetting(levels: WeekAquaLevels([54, 114, 57, 117])!, timer: timer("02:50", "02:40"))
let evening = WeekAquaSetting(levels: green, timer: timer("14:00", "21:30"))

@MainActor
func session(_ lights: [FakeWeekAqua], gap: Duration = .zero) throws -> WeekAquaSession {
  try WeekAquaSession(lights: lights, pacing: WeekAquaSession.Pacing(gap: gap))
}

@MainActor @Test func writesTheClockManualLevelsTimerManualAndTheLightRunsIt() async throws {
  let light = FakeWeekAqua()
  try await session([light]).write(owners, now: local("2026-11-03T21:35:07"), timeZone: saigon)
  #expect(light.sent.map { $0[0] } == [0xFF, 0xFD, 0xFB, 0xFE, 0xFD])
  #expect(light.sent.allSatisfy { $0.count == 8 })
  #expect(light.shown == owners.levels)
  #expect(light.timer == owners.timer)
  #expect(light.clock?.hour == 21 && light.clock?.minute == 35 && light.clock?.second == 7)
}

@MainActor @Test func aTimerWithoutTheClockFirstDoesNotTakeAsOnTheLights() throws {
  // The order of the first hands-on tries: manual, levels, then the timer. The light never switched off by it.
  let light = FakeWeekAqua()
  for f in [WeekAquaFrame.manual, WeekAquaFrame.levels(green), WeekAquaFrame.timer(evening.timer)] { try light.send(f) }
  #expect(light.timer == nil)
  try light.send(WeekAquaFrame.manual)
  #expect(light.timer == nil)
  #expect(light.shown == green) // levels show at once
}

@MainActor @Test func neverSendsTheFrameWhoseMeaningIsUnknown() async throws {
  let light = FakeWeekAqua()
  try await session([light]).write(evening)
  #expect(!light.sent.contains { $0.first == 0xF9 })
}

@MainActor @Test func aGroupGetsEachFrameOnEveryLightBeforeTheNext() async throws {
  let lights = (0..<3).map { _ in FakeWeekAqua() }
  var log: [(light: Int, kind: UInt8)] = []
  for (i, l) in lights.enumerated() { l.afterSend = { log.append((i, $0[0])) } }
  try await session(lights).write(owners, now: local("2026-11-03T21:35:07"), timeZone: saigon)
  // Frame by frame: all three lights, then the next frame.
  #expect(log.map(\.light) == Array(repeating: [0, 1, 2], count: 5).flatMap { $0 })
  #expect(log.map(\.kind) == [0xFF, 0xFD, 0xFB, 0xFE, 0xFD].flatMap { Array(repeating: $0, count: 3) })
  // The same bytes to each, and each runs the timer.
  #expect(lights[1].sent == lights[0].sent && lights[2].sent == lights[0].sent)
  #expect(lights.allSatisfy { $0.timer == owners.timer && $0.shown == owners.levels })
}

@MainActor @Test func aGroupWithALightOfAnotherCodeSendsNothing() async throws {
  let ok = FakeWeekAqua(), other = FakeWeekAqua(advert: WeekAquaAdvert(code: "5745", address: nil))
  #expect(throws: WeekAquaError.notSupported("5745")) { try session([ok, other]) }
  #expect(throws: WeekAquaError.notSupported(nil)) { try session([FakeWeekAqua(advert: WeekAquaAdvert(code: nil, address: nil))]) }
  #expect(throws: WeekAquaError.noLights) { try session([]) }
  #expect(ok.sent.isEmpty && other.sent.isEmpty)
}

@MainActor @Test func aLightThatDropsIsLeftOutAndTheOthersGetEveryFrame() async throws {
  let lights = (0..<3).map { _ in FakeWeekAqua() }
  lights[1].afterSend = { [weak l = lights[1]] f in if f[0] == 0xFB { l?.disconnect() } }
  await #expect(throws: WeekAquaError.notSent([1])) { try await session(lights).write(evening) }
  #expect(lights[0].sent.count == 5 && lights[2].sent.count == 5)
  #expect(lights[1].sent.map { $0[0] } == [0xFF, 0xFD, 0xFB])
  #expect(lights[0].timer == evening.timer && lights[1].timer == nil)
}

@MainActor @Test func framesArePacedApart() async throws {
  let light = FakeWeekAqua()
  let start = ContinuousClock.now
  try await session([light], gap: .milliseconds(30)).write(evening)
  // Four pauses between five frames.
  #expect(ContinuousClock.now - start >= .milliseconds(120))
  #expect(WeekAquaSession.Pacing.light.gap == .milliseconds(500))
}

@MainActor @Test func overlappingWritesDoNotInterleave() async throws {
  let light = FakeWeekAqua()
  let s = try session([light], gap: .milliseconds(5))
  async let a: Void = s.write(owners)
  async let b: Void = s.write(evening)
  _ = try await (a, b)
  #expect(light.sent.map { $0[0] } == Array(repeating: [0xFF, 0xFD, 0xFB, 0xFE, 0xFD], count: 2).flatMap { $0 })
  // Each write whole, whichever went first: its levels and timer together (the clocks differ by the moment).
  let writes = [Array(light.sent[1..<5]), Array(light.sent[6..<10])]
  let expected = [owners, evening].map { Array(WeekAquaSession.frames($0, now: Date()).dropFirst()) }
  #expect(writes == expected || writes == expected.reversed())
}

@MainActor @Test func theTwoByteManualFrameOnlyWhenAskedFor() async throws {
  let light = FakeWeekAqua()
  try await WeekAquaSession(lights: [light], pacing: .none, manual: .twoBytes).write(evening)
  #expect(light.sent.map(hex) .filter { $0.hasPrefix("fd f1") } == ["fd f1", "fd f1"])
  #expect(light.timer == evening.timer) // the fake takes either form
  let other = FakeWeekAqua()
  try await session([other]).write(evening)
  #expect(other.sent[1] == WeekAquaFrame.manual && other.sent[4] == WeekAquaFrame.manual)
}
