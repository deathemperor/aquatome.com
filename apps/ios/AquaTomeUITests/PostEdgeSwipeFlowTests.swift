import XCTest

/// A Hôm nay post: iOS's swipe from the left edge goes back near the top, in the middle and near
/// the bottom (`edgeSwipesGoBack`).
final class PostEdgeSwipeFlowTests: XCTestCase {
  func testFromTheLeftEdgeNearTheTopAHomNayPostCloses() { edgeSwipesGoBack(.homNayPost, at: 0.2) }
  func testFromTheLeftEdgeInTheMiddleAHomNayPostCloses() { edgeSwipesGoBack(.homNayPost, at: 0.5) }
  func testFromTheLeftEdgeNearTheBottomAHomNayPostCloses() { edgeSwipesGoBack(.homNayPost, at: 0.8) }
}
