import XCTest

/// "Bể của tôi": tanks added, edited and deleted on the phone, kept in the shared store (docs/my-tanks-sync.md) across
/// launches, with no account; a store the app can't keep whole is left alone.
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

  func testShowsTheLitresWhileTypingAndRoundsHalvesUp() {
    let app = launch()
    app.buttons["add-first"].tap()
    type(app, "l", "100")
    type(app, "w", "45")
    type(app, "h", "45")
    // Still in the height field: the figure follows each key, as on the site.
    XCTAssertTrue(app.staticTexts["litres"].waitForExistence(timeout: 5), "no litres while typing")
    XCTAssertEqual(app.staticTexts["litres"].label, "202,5 lít")
    type(app, "name", "Bể lớn")
    app.buttons["save"].tap()
    // Whole litres from 100 up, a half rounded up as the browser does (not to the even 202).
    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    XCTAssertTrue(row.label.contains("100 × 45 × 45 cm · 203 lít"), row.label)
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

  func testKeepsANameToTheSitesLength() {
    let app = launch()
    app.buttons["add-first"].tap()
    type(app, "name", String(repeating: "a", count: 90))
    XCTAssertEqual((app.textFields["name"].value as? String)?.count, 80)
  }

  func testEditsATankKeepingItsOtherFieldsAndFindsItAfterARelaunch() {
    var app = launch()
    app.buttons["add-first"].tap()
    type(app, "name", "Bể cũ")
    type(app, "l", "60")
    type(app, "w", "30")
    type(app, "h", "36")
    app.buttons["substrate"].tap()
    app.buttons["Cát"].firstMatch.tap()
    type(app, "notes-field", "Thay nước thứ bảy")
    app.buttons["save"].tap()

    app.buttons["tank"].firstMatch.tap()
    app.buttons["edit"].tap()
    let name = app.textFields["name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5))
    XCTAssertEqual(name.value as? String, "Bể cũ", "the form isn't filled with the tank")
    name.clearAndType("Bể phòng khách")
    app.buttons["save"].tap()
    XCTAssertTrue(app.navigationBars["Bể phòng khách"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["facts"].label, "60 × 30 × 36 cm · 64,8 lít · Cát")
    XCTAssertEqual(app.staticTexts["notes"].label, "Thay nước thứ bảy")

    app.terminate()
    app = launch(reset: false)
    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the tank wasn't kept")
    XCTAssertTrue(row.label.contains("Bể phòng khách"), row.label)
    XCTAssertEqual(app.buttons.matching(identifier: "tank").count, 1, "the edit made another tank")
  }

  func testANewSizeDropsLitresGivenForTheOldOne() {
    let app = launch("-seed-tanks", "litres")
    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    XCTAssertTrue(row.label.contains("100 × 40 × 50 cm · 180 lít"), row.label) // the litres someone gave, over the box's 200
    row.tap()
    app.buttons["edit"].tap()
    let h = app.textFields["h"]
    XCTAssertTrue(h.waitForExistence(timeout: 5))
    h.clearAndType("30")
    app.buttons["save"].tap()
    XCTAssertTrue(app.staticTexts["facts"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["facts"].label, "100 × 40 × 30 cm · 120 lít", "the old size's litres stayed")
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

  func testLeavesAStoreFromANewerAppAlone() {
    let app = launch("-seed-tanks", "newer")
    XCTAssertTrue(text(app, "bản ứng dụng mới hơn").waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["add"].isEnabled, "it could be written over")
    XCTAssertFalse(app.buttons["add-first"].exists)
  }

  func testLeavesAStoreItCantReadAlone() {
    let app = launch("-seed-tanks", "unreadable")
    XCTAssertTrue(text(app, "Không đọc được các bể").waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["add"].isEnabled, "it could be written over")
  }

  func testCanTryAgainAfterASaveFails() {
    let app = launch("-seed-tanks", "unwritable")
    app.buttons["add-first"].tap()
    type(app, "name", "Bể 60")
    app.buttons["save"].tap()
    XCTAssertTrue(text(app, "Chưa lưu được thay đổi").waitForExistence(timeout: 5), "the failure isn't said")
    app.buttons["Hủy"].tap()
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.buttons["add-first"].isEnabled && app.buttons["add"].isEnabled, "adding is stuck after one failure")
  }

  // MARK: Helpers

  private func launch(reset: Bool = true, _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"] + (reset ? ["-reset-defaults"] : []) + args
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

  private func text(_ app: XCUIApplication, _ part: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", part)).firstMatch
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
