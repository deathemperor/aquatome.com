import XCTest

/// What the app costs a reader: launch time, the work and memory of flinging through a long list of fish. Each
/// measurement is checked against apps/ios/perf-budgets.json by scripts/check-perf.py after the run (job `app`). Launched
/// with the animations on (not `launchForFlow`): what a reader waits for is part of what's measured.
final class PerformanceTests: XCTestCase {
  private let args = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-large-handbook"]

  /// From a tap on the icon to the first screen answering touches: v2's, the app's look.
  func testLaunch() {
    let app = XCUIApplication()
    app.launchArguments = args + ["-v2", Look.v2.rawValue]
    measure(metrics: [XCTApplicationLaunchMetric(waitUntilResponsive: true)]) { app.launch() }
  }

  /// The handbook's fish, more than the site has: the app's CPU time and its memory while flinging down through them.
  /// The simulator reports no scroll hitches, only the length of the deceleration animation, which the app doesn't
  /// set; the hosted runners' virtual Macs read CPU instructions and cycles as 0, so the budget is on CPU time.
  /// On the old look, whose "Tất cả loài" lists every fish on one long list.
  func testFlingingThroughTheFish() {
    let app = XCUIApplication()
    app.launchArguments = args + ["-v2", Look.old.rawValue]
    app.launch()
    // Every fish: the home's "Tất cả loài", as photo cards.
    app.descendants(matching: .any)["all-fish"].tap()
    let list = app.scrollViews["shelf-pages"]
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
