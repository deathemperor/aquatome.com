import XCTest

/// Every tab's scrolling screens, flung to their end: their last words end above the tab bar, whether it shrank on the
/// way down or not (iOS 26 shrinks it while scrolling down). Tìm's home, a fish's page, the fish-ID tool, Bể của tôi and
/// Đèn, on the fixed handbook.
final class ScrollEndFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testTimsHomeEndsAboveTheTabBar() {
    let app = launch()
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 10), "not Tìm's home")
    app.endsAboveTheTabBar(barTop(app), "Tìm's home")
  }

  func testAFishsPageEndsAboveTheTabBar() {
    let app = launch()
    open(app, "ca neon", "Cá neon")
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 10), "the fish's page didn't open")
    app.endsAboveTheTabBar(barTop(app), "a fish's page")
  }

  func testTheFishIdToolEndsAboveTheTabBar() {
    let app = launch()
    open(app, "nhan dien", "Đây là cá gì?")
    XCTAssertTrue(app.descendants(matching: .any)["fish-id"].waitForExistence(timeout: 10), "not the fish-ID screen")
    app.endsAboveTheTabBar(barTop(app), "the fish-ID tool")
  }

  func testTheTanksTabEndsAboveTheTabBar() {
    let app = launch()
    app.openTab("Bể của tôi")
    app.endsAboveTheTabBar(barTop(app), "Bể của tôi")
  }

  func testTheLightsTabEndsAboveTheTabBar() {
    let app = launch()
    app.openTab("Đèn")
    app.endsAboveTheTabBar(barTop(app), "Đèn")
  }

  // MARK: Helpers

  private func launch() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fake-accounts", "on",
                           "-reset-fake-server"]
    app.launchForFlow()
    return app
  }

  /// The tab bar's top at its full height, as a screen opens, before any scroll.
  private func barTop(_ app: XCUIApplication) -> CGFloat {
    let bar = app.tabBars.firstMatch
    XCTAssertTrue(bar.waitForExistence(timeout: 5), "no tab bar")
    XCTAssertGreaterThan(bar.buttons.count, 1, "the tab bar is already shrunk")
    return bar.frame.minY
  }

  /// A page of the handbook, found by its words in Tìm's search.
  private func open(_ app: XCUIApplication, _ query: String, _ name: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 10), "no search field")
    field.tap()
    field.typeText(query)
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no \(name)")
    row.tap()
  }
}
