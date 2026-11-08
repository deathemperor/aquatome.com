import XCTest

/// What each direction of Khám phá's movement (`V2Motion`) costs, against none, with the site's real pages and photos:
/// the app's CPU time sitting at the top for 8 seconds, and flinging down and back. A simulator's CPU is the Mac's, and
/// it reports no scroll hitches, so only the differences between directions mean much.
final class V2MotionCostTests: XCTestCase {
  func testAtRestWithNone() { cost("none", scrolling: false) }
  func testAtRestWithHero() { cost("hero", scrolling: false) }
  func testAtRestWithScroll() { cost("scroll", scrolling: false) }
  func testAtRestWithStill() { cost("still", scrolling: false) }
  func testScrollingWithNone() { cost("none", scrolling: true) }
  func testScrollingWithHero() { cost("hero", scrolling: true) }
  func testScrollingWithScroll() { cost("scroll", scrolling: true) }
  func testScrollingWithStill() { cost("still", scrolling: true) }

  private func cost(_ motion: String, scrolling: Bool) {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-v2", "YES", "-v2-motion", motion]
    app.launch()
    app.tabBars.buttons["Khám phá"].tap()
    let page = app.scrollViews["v2-browse"]
    XCTAssertTrue(page.waitForExistence(timeout: 15), "no Khám phá")
    // Its photos in first.
    Thread.sleep(forTimeInterval: 5)
    let options = XCTMeasureOptions()
    options.invocationOptions = [.manuallyStop]
    options.iterationCount = 3
    measure(metrics: [XCTCPUMetric(application: app)], options: options) {
      if scrolling {
        for _ in 0..<3 { page.swipeUp(velocity: .fast) }
        for _ in 0..<3 { page.swipeDown(velocity: .fast) }
      } else {
        Thread.sleep(forTimeInterval: 8)
      }
      stopMeasuring()
    }
  }
}
