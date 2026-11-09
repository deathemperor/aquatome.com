import XCTest

/// What the app costs a reader: launch time, the work and memory of flinging through a long list of fish. Each
/// measurement is checked against apps/ios/perf-budgets.json by scripts/check-perf.py after the run (job `app`). Launched
/// with the animations on (not `launchForFlow`): what a reader waits for is part of what's measured.
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

  /// A long fish page on v2, whole, at the largest text: the app's CPU time and its memory while flinging down through it.
  func testFlingingThroughALongFishPageAtTheLargestText() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-long-page", "-v2", "YES",
                           "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 10), "v2 didn't open")
    XCUIDevice.shared.system.open(URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    let ask = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
    if ask.waitForExistence(timeout: 2) { ask.buttons.element(boundBy: ask.buttons.count - 1).tap() }
    let page = app.descendants(matching: .any)["v2-species"]
    XCTAssertTrue(page.waitForExistence(timeout: 10), "the fish's page didn't open")
    let options = XCTMeasureOptions()
    options.invocationOptions = [.manuallyStop]
    measure(metrics: [XCTCPUMetric(application: app), XCTMemoryMetric(application: app)], options: options) {
      for _ in 0..<3 { page.swipeUp(velocity: .fast) }
      stopMeasuring()
      for _ in 0..<3 { page.swipeDown(velocity: .fast) } // back to the top for the next run
    }
  }

  /// A gallery of 300 photos in its grid (`-hundreds-gallery`, stand-in pictures): the same, flinging down through them.
  func testFlingingThroughThePhotoGrid() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fixed-pictures", "-hundreds-gallery"]
    app.launch()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 10))
    field.tap()
    field.typeText("ca neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10))
    row.tap()
    let lead = app.buttons["lead-photo-grid"]
    XCTAssertTrue(lead.waitForExistence(timeout: 10))
    lead.tap()
    XCTAssertTrue(app.buttons["grid-photo-1"].waitForExistence(timeout: 10))
    let options = XCTMeasureOptions()
    options.invocationOptions = [.manuallyStop]
    measure(metrics: [XCTCPUMetric(application: app), XCTMemoryMetric(application: app)], options: options) {
      for _ in 0..<3 { app.swipeUp(velocity: .fast) }
      stopMeasuring()
      for _ in 0..<3 { app.swipeDown(velocity: .fast) } // back to the top for the next run
    }
  }
}
