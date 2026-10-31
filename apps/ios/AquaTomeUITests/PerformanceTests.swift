import XCTest

/// What the app costs a reader: launch time, the work and memory of flinging through a long list of fish. Each
/// measurement is checked against apps/ios/perf-budgets.json by scripts/check-perf.py after the run (job `app`).
final class PerformanceTests: XCTestCase {
  private let args = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-large-handbook"]

  /// From a tap on the icon to the first screen answering touches.
  func testLaunch() {
    let app = XCUIApplication()
    app.launchArguments = args
    measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)]) { app.launch() }
  }

  /// The handbook's fish, more than the site has: the app's CPU time and its memory while flinging down through them.
  /// The simulator reports no scroll hitches, only the length of the deceleration animation, which the app doesn't
  /// set; the hosted runners' virtual Macs read CPU instructions and cycles as 0, so the budget is on CPU time.
  func testFlingingThroughTheFish() {
    let app = XCUIApplication()
    app.launchArguments = args
    app.launch()
    app.buttons["kind"].tap()
    app.buttons["Loài cá"].tap()
    let list = app.collectionViews.firstMatch
    XCTAssertTrue(list.waitForExistence(timeout: 5))
    let options = XCTMeasureOptions()
    options.invocationOptions = [.manuallyStop]
    measure(metrics: [XCTCPUMetric(application: app), XCTMemoryMetric(application: app)], options: options) {
      for _ in 0..<3 { list.swipeUp(velocity: .fast) }
      stopMeasuring()
      for _ in 0..<3 { list.swipeDown(velocity: .fast) } // back to the top for the next run
    }
  }
}
