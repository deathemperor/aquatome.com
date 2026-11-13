import XCTest

/// Pages saved to read later, and read last, under "Đọc tiếp" in the Tìm tab before a search and kept on the phone: the
/// last read as cards, the saved as one row with their count that opens their list.
final class ReadingFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testSavesAGuideToReadLaterKeptAfterARelaunchAndTakesItOff() {
    var app = launch()
    openGuide(app)
    app.buttons["save-for-later"].tap()
    XCTAssertEqual(app.buttons["save-for-later"].label, "Bỏ lưu", "not saved")
    back(app)
    XCTAssertTrue(savedRow(app).waitForExistence(timeout: 5), "not listed as saved")

    app.terminate()
    app = launch(reset: false)
    let saved = savedRow(app)
    XCTAssertTrue(saved.waitForExistence(timeout: 5), "not kept")
    XCTAssertTrue(saved.label.hasPrefix("Đã lưu để đọc sau") && saved.label.contains("1"), saved.label)
    // Under Tìm's tools it can start under the tab bar, where a tap would land on the bar: half a screen up first.
    let bar = app.tabBars.firstMatch
    repeatUntil(saved.isHittable && (!bar.exists || saved.frame.maxY < bar.frame.minY), times: 4) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)), withVelocity: .slow,
               thenHoldForDuration: 0.1)
    }
    saved.tap()
    XCTAssertTrue(app.navigationBars["Đã lưu để đọc sau"].waitForExistence(timeout: 5), "their list didn't open")
    let guide = item(app, "Nuôi cá neon")
    guide.swipeLeft()
    app.buttons["Bỏ lưu"].tap()
    XCTAssertTrue(guide.waitForNonExistence(timeout: 5), "still saved")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    // Read, so "Đọc tiếp" stays, without the row.
    XCTAssertTrue(app.staticTexts["Đọc tiếp"].waitForExistence(timeout: 5), "the pages read went too")
    XCTAssertFalse(savedRow(app).exists, "still a row for saved pages")
  }

  func testListsThePagesReadLastNewestFirst() {
    let app = launch()
    XCTAssertTrue(app.handbookShown(), "no handbook")
    XCTAssertFalse(app.staticTexts["Đọc tiếp"].exists, "something read already")
    openGuide(app)
    back(app)
    search(app, "ca dia")
    item(app, "Cá đĩa").tap()
    XCTAssertTrue(app.navigationBars["Cá đĩa"].waitForExistence(timeout: 5))
    back(app)
    XCTAssertTrue(app.staticTexts["Đọc tiếp"].waitForExistence(timeout: 5))
    let read = app.descendants(matching: .any)["recent"].descendants(matching: .any).matching(identifier: "item")
    let items = read.allElementsBoundByIndex.map { $0.label }
    XCTAssertTrue(items.count == 2 && items[0].hasPrefix("Cá đĩa") && items[1].hasPrefix("Nuôi cá neon"), "\(items)")
    // Each says what it is.
    XCTAssertTrue(items[0].contains("Loài cá") && items[1].contains("Hướng dẫn"), "\(items)")
    XCTAssertFalse(savedRow(app).exists, "a row for saved pages with none saved")
  }

  /// UI tests start from a clean phone: a page read in one run isn't listed in the next.
  func testATestsResetForgetsThePagesRead() {
    var app = launch()
    openGuide(app)
    app.terminate()
    app = launch()
    XCTAssertTrue(app.handbookShown(), "no handbook")
    XCTAssertFalse(app.staticTexts["Đọc tiếp"].exists, "a page read before the reset")
  }

  // MARK: Helpers

  private func launch(reset: Bool = true) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"] + (reset ? ["-reset-defaults"] : [])
    app.launchForFlow(.old)
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

  /// "Đọc tiếp"'s row for the pages saved, with their count.
  private func savedRow(_ app: XCUIApplication) -> XCUIElement { app.descendants(matching: .any)["all-saved"].firstMatch }
}
