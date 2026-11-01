import XCTest

/// Pages saved to read later, and read last, listed in the Tìm tab before a search and kept on the phone.
final class ReadingFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testSavesAGuideToReadLaterKeptAfterARelaunchAndTakesItOff() {
    var app = launch()
    openGuide(app)
    app.buttons["save-for-later"].tap()
    XCTAssertEqual(app.buttons["save-for-later"].label, "Bỏ lưu", "not saved")
    back(app)
    XCTAssertTrue(row(app, in: "Đã lưu để đọc sau").waitForExistence(timeout: 5), "not listed as saved")

    app.terminate()
    app = launch(reset: false)
    let saved = row(app, in: "Đã lưu để đọc sau")
    XCTAssertTrue(saved.waitForExistence(timeout: 5), "not kept")
    saved.swipeLeft()
    app.buttons["Bỏ lưu"].tap()
    XCTAssertTrue(app.staticTexts["Đã lưu để đọc sau"].waitForNonExistence(timeout: 5), "still saved")
  }

  func testListsThePagesReadLastNewestFirst() {
    let app = launch()
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "item").firstMatch.waitForExistence(timeout: 5), "no handbook")
    XCTAssertFalse(app.staticTexts["Đọc gần đây"].exists, "something read already")
    openGuide(app)
    back(app)
    search(app, "ca dia")
    item(app, "Cá đĩa").tap()
    XCTAssertTrue(app.navigationBars["Cá đĩa"].waitForExistence(timeout: 5))
    back(app)
    XCTAssertTrue(app.staticTexts["Đọc gần đây"].waitForExistence(timeout: 5))
    let items = app.descendants(matching: .any).matching(identifier: "item").allElementsBoundByIndex.prefix(2).map { $0.label }
    XCTAssertTrue(items.count == 2 && items[0].hasPrefix("Cá đĩa") && items[1].hasPrefix("Nuôi cá neon"), "\(items)")
  }

  /// UI tests start from a clean phone: a page read in one run isn't listed in the next.
  func testATestsResetForgetsThePagesRead() {
    var app = launch()
    openGuide(app)
    app.terminate()
    app = launch()
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "item").firstMatch.waitForExistence(timeout: 5), "no handbook")
    XCTAssertFalse(app.staticTexts["Đọc gần đây"].exists, "a page read before the reset")
  }

  // MARK: Helpers

  private func launch(reset: Bool = true) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"] + (reset ? ["-reset-defaults"] : [])
    app.launch()
    return app
  }

  private func openGuide(_ app: XCUIApplication) {
    search(app, "nuoi ca neon")
    item(app, "Nuôi cá neon").tap()
    XCTAssertTrue(app.buttons["save-for-later"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.buttons["save-for-later"].label, "Lưu để đọc sau")
  }

  /// Back to the Tìm tab, and out of the search, which stays after a page (the reading lists show before a search).
  private func back(_ app: XCUIApplication) {
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let close = app.buttons.matching(NSPredicate(format: "label IN {'Đóng', 'Hủy'}")).firstMatch
    XCTAssertTrue(close.waitForExistence(timeout: 5), "no way out of the search")
    close.tap()
  }

  private func search(_ app: XCUIApplication, _ text: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(text)
  }

  private func item(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    let e = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(e.waitForExistence(timeout: 5), "no \(name)")
    return e
  }

  /// The first row under a section's header: the guide, saved.
  private func row(_ app: XCUIApplication, in header: String) -> XCUIElement {
    XCTAssertTrue(app.staticTexts[header].waitForExistence(timeout: 5), "no \(header)")
    return app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Nuôi cá neon'")).firstMatch
  }
}
