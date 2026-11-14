import Testing
@testable import Handbook

/// The top of a fish page: the shade holds through the bar, as iOS's back button has no ground of ours (Design, 12 Nov:
/// on a white photo 3.5:1 with it, 2.4:1 with a shade behind the clock alone).
@Test func aFishPagesShadeHoldsThroughTheBar() {
  #expect(PageTop.shadeHeight == 180 && PageTop.shadeOpacity == 0.5 && PageTop.shadeHeldOpacity == 0.46 && PageTop.shadeHeld == 0.62)
}

@Test func itsCirclesAndMucLucsCapsuleAre36PointsAtNoLessThan45Percent() {
  #expect(PageTop.disc == 36 && PageTop.capsule == 36 && PageTop.capsuleSide == 12)
  #expect(PageTop.ground(reduceTransparency: false) == 0.45 && PageTop.ground(reduceTransparency: true) == 0.7)
}
