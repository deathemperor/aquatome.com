import Testing
@testable import Handbook

/// The top of a fish page, as the owner chose it on 11 Nov: before it, a shade over 130 points under the status bar
/// (180 for the owner's navigator) and 44-point circles.
@Test func aFishPagesShadeIsOnlyBehindTheClock() {
  #expect(PageTop.shadeHeight == 64 && PageTop.shadeOpacity == 0.45 && PageTop.shadeHeld == 0.6)
}

@Test func itsCirclesAndMucLucsCapsuleAre36PointsAtNoLessThan45Percent() {
  #expect(PageTop.disc == 36 && PageTop.capsule == 36 && PageTop.capsuleSide == 12)
  #expect(PageTop.ground(reduceTransparency: false) == 0.45 && PageTop.ground(reduceTransparency: true) == 0.7)
}
