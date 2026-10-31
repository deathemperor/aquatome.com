import XCTest

/// "Bể của tôi": tanks added, edited and deleted on the phone, kept in the shared store (docs/my-tanks-sync.md) across
/// launches, with no account.
final class TanksFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAddsATankWithItsSize() {
    let app = launch()
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "the empty state")
    app.buttons["add-first"].tap()
    type(app, "name", "Bể 60")
    type(app, "l", "60")
    type(app, "w", "30")
    type(app, "h", "36")
    // Saved straight from the last field: the height counts without leaving it first.
    app.buttons["save"].tap()

    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no tank listed")
    XCTAssertTrue(row.label.contains("Bể 60"), row.label)
    XCTAssertTrue(row.label.contains("60 × 30 × 36 cm · 64,8 lít"), row.label)
  }

  func testShowsTheLitresWhileTyping() {
    let app = launch()
    app.buttons["add-first"].tap()
    type(app, "l", "100")
    type(app, "w", "40")
    type(app, "h", "50")
    type(app, "name", "Bể lớn") // leaves the height field
    XCTAssertTrue(app.staticTexts["litres"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["litres"].label, "200 lít")
  }

  func testRefusesPartOfTheSize() {
    let app = launch()
    app.buttons["add-first"].tap()
    type(app, "name", "Bể nano")
    type(app, "l", "30")
    app.buttons["save"].tap()
    XCTAssertTrue(app.staticTexts["dims-error"].waitForExistence(timeout: 5), "partial size accepted")
    XCTAssertTrue(app.buttons["save"].exists, "the form closed")
  }

  func testEditsATankAndKeepsItAfterARelaunch() {
    var app = launch()
    add(app, "Bể cũ")
    app.buttons["tank"].firstMatch.tap()
    app.buttons["edit"].tap()
    let name = app.textFields["name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    name.clearAndType("Bể phòng khách")
    type(app, "notes-field", "Thay nước thứ bảy")
    app.buttons["save"].tap()
    XCTAssertTrue(app.navigationBars["Bể phòng khách"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["notes"].label, "Thay nước thứ bảy")
    XCTAssertEqual(app.staticTexts["facts"].label, "Chưa có kích thước.")

    app.terminate()
    app = launch(reset: false)
    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the tank wasn't kept")
    XCTAssertTrue(row.label.contains("Bể phòng khách"), row.label)
  }

  func testDeletesATank() {
    let app = launch()
    add(app, "Bể tạm")
    app.buttons["tank"].firstMatch.tap()
    app.buttons["delete"].tap()
    let confirm = app.buttons["Xóa"].firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    confirm.tap()
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "the tank is still listed")
  }

  // MARK: Helpers

  private func launch(reset: Bool = true) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"] + (reset ? ["-reset-defaults"] : [])
    app.launch()
    app.tabBars.buttons["Bể của tôi"].tap()
    return app
  }

  private func add(_ app: XCUIApplication, _ name: String) {
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5))
    app.buttons["add-first"].tap()
    type(app, "name", name)
    app.buttons["save"].tap()
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "no tank listed")
  }

  private func type(_ app: XCUIApplication, _ id: String, _ text: String) {
    let field = app.descendants(matching: .any)[id].firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no field \(id)")
    field.tap()
    field.typeText(text)
  }
}

private extension XCUIElement {
  /// Taps at the end of the text, deletes it all, then types.
  func clearAndType(_ text: String) {
    let old = value as? String ?? ""
    coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
    typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count) + text)
  }
}
