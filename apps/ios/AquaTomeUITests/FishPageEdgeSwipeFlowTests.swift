import XCTest

/// A fish's page, opened from Khám phá: iOS's swipe from the left edge goes back near the top, in the middle and near
/// the bottom (`edgeSwipesGoBack`).
final class FishPageEdgeSwipeFlowTests: XCTestCase {
  func testFromTheLeftEdgeNearTheTopAFishsPageGoesBack() { edgeSwipesGoBack(.fishFromKhamPha, at: 0.2) }
  func testFromTheLeftEdgeInTheMiddleAFishsPageGoesBack() { edgeSwipesGoBack(.fishFromKhamPha, at: 0.5) }
  func testFromTheLeftEdgeNearTheBottomAFishsPageGoesBack() { edgeSwipesGoBack(.fishFromKhamPha, at: 0.8) }
}
