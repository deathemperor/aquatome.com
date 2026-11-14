import XCTest

/// A guide, opened from Khám phá: iOS's swipe from the left edge goes back near the top, in the middle and near
/// the bottom (`edgeSwipesGoBack`).
final class GuideEdgeSwipeFlowTests: XCTestCase {
  func testFromTheLeftEdgeNearTheTopAGuideGoesBack() { edgeSwipesGoBack(.guideFromKhamPha, at: 0.2) }
  func testFromTheLeftEdgeInTheMiddleAGuideGoesBack() { edgeSwipesGoBack(.guideFromKhamPha, at: 0.5) }
  func testFromTheLeftEdgeNearTheBottomAGuideGoesBack() { edgeSwipesGoBack(.guideFromKhamPha, at: 0.8) }
}
