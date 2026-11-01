import XCTest

/// A tank's fish and plants changed in the app (TankLife.swift): put on a tank from a page of the handbook or from the
/// tank, a fish's number changed, either taken off; kept across launches. The handbook is the fixed one (no network).
final class TankLifeFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testPutsAFishFromItsPageOnATankStartingAtItsSchoolSize() {
    let app = launch("-seed-tanks", "litres") // one tank, "Bể cũ", no fish
    openPage(app, "Cá neon")
    app.buttons["put-on-tank"].tap()
    let count = app.textFields["put-count"]
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    XCTAssertEqual(count.value as? String, "6", "not the school size, as the site's tool starts it")
    count.clearAndType("12")
    app.buttons["put-save"].tap()
    XCTAssertTrue(app.staticTexts["put-saved"].waitForExistence(timeout: 5), "no word of the save")
    XCTAssertEqual(app.staticTexts["put-saved"].label, "Đã lưu vào “Bể cũ”.")
    app.buttons["put-open"].tap()
    XCTAssertTrue(app.navigationBars["Bể cũ"].waitForExistence(timeout: 5), "the tank didn't open")
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 12"), life(app, "Cá neon").label)
  }

  func testAFishAlreadyOnTheTankGetsTheNewNumber() {
    let app = launch("-seed-tanks", "life") // "Bể cá neon": 12 neons, a fish the handbook lacks, a rotala
    openPage(app, "Cá neon")
    app.buttons["put-on-tank"].tap()
    let count = app.textFields["put-count"]
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    XCTAssertEqual(count.value as? String, "12", "not the number already on the tank")
    count.clearAndType("20")
    app.buttons["put-save"].tap()
    app.buttons["put-open"].tap()
    XCTAssertTrue(app.navigationBars["Bể cá neon"].waitForExistence(timeout: 5))
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 20"), life(app, "Cá neon").label)
    XCTAssertEqual(app.buttons.matching(identifier: "life").matching(NSPredicate(format: "label CONTAINS 'Cá neon'")).count, 1, "listed twice")
  }

  func testPutsAPlantOnANewTank() {
    let app = launch()
    openPage(app, "Rotala đỏ")
    app.buttons["put-on-tank"].tap()
    XCTAssertTrue(app.textFields["put-name"].waitForExistence(timeout: 5), "no new tank offered")
    XCTAssertFalse(app.textFields["put-count"].exists, "a plant isn't counted")
    app.textFields["put-name"].tap()
    app.textFields["put-name"].typeText("Bể cây")
    app.buttons["put-save"].tap()
    XCTAssertTrue(app.buttons["put-open"].waitForExistence(timeout: 5))
    app.buttons["put-open"].tap()
    XCTAssertTrue(app.navigationBars["Bể cây"].waitForExistence(timeout: 5), "the new tank didn't open")
    XCTAssertTrue(life(app, "Rotala đỏ").exists)
  }

  func testAddsAFishFromTheTankChangesItsNumberAndTakesItOffKeptAfterARelaunch() {
    var app = launch("-seed-tanks", "life")
    app.tabBars.buttons["Bể của tôi"].tap()
    app.buttons["tank"].firstMatch.tap()
    app.buttons["add-life"].tap()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText("ngua van")
    let row = app.buttons.matching(identifier: "life-item").matching(NSPredicate(format: "label BEGINSWITH 'Cá ngựa vằn'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "not found in the handbook")
    XCTAssertEqual(app.buttons.matching(identifier: "life-item").count, 1, "more than the fish typed")
    row.tap()
    let count = app.textFields["put-count"]
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["put-tank"].exists, "the tank is already chosen")
    count.clearAndType("8")
    app.buttons["put-save"].tap()
    let danio = life(app, "Cá ngựa vằn")
    XCTAssertTrue(danio.waitForExistence(timeout: 5), "not on the tank")
    XCTAssertTrue(danio.label.contains("× 8"), danio.label)

    danio.swipeLeft()
    app.buttons["Số con"].tap()
    XCTAssertTrue(app.textFields["put-count"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.textFields["put-count"].value as? String, "8")
    app.textFields["put-count"].clearAndType("10")
    app.buttons["put-save"].tap()
    XCTAssertTrue(life(app, "Cá ngựa vằn").label.contains("× 10"), life(app, "Cá ngựa vằn").label)

    life(app, "Rotala đỏ").swipeLeft()
    app.buttons["Xóa"].tap()
    XCTAssertTrue(life(app, "Rotala đỏ").waitForNonExistence(timeout: 5), "the plant is still on the tank")

    app.terminate()
    app = launch(reset: false)
    app.tabBars.buttons["Bể của tôi"].tap()
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(life(app, "Cá ngựa vằn").waitForExistence(timeout: 5), "the fish wasn't kept")
    XCTAssertTrue(life(app, "Cá ngựa vằn").label.contains("× 10"))
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 12"), "another fish changed")
    XCTAssertFalse(life(app, "Rotala đỏ").exists, "the plant came back")
  }

  func testNothingIsPutIntoAStoreTheAppMustLeaveAlone() {
    let app = launch("-seed-tanks", "newer")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    row.tap()
    let put = app.buttons["put-on-tank"]
    XCTAssertTrue(put.waitForExistence(timeout: 5))
    XCTAssertFalse(put.isEnabled, "it could be written over")
  }

  // MARK: Helpers

  private func launch(reset: Bool = true, _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"] + (reset ? ["-reset-defaults"] : []) + args
    app.launch()
    return app
  }

  /// A page from the Tìm tab, searched by its name (a row below the fold isn't there to find), typed without accents: the
  /// simulator's keyboard sometimes drops them, and the search folds them anyway.
  private func openPage(_ app: XCUIApplication, _ name: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(name.replacingOccurrences(of: "đ", with: "d").folding(options: .diacriticInsensitive, locale: nil))
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no \(name) in the handbook")
    row.tap()
    XCTAssertTrue(app.buttons["put-on-tank"].waitForExistence(timeout: 5), "no way to put \(name) on a tank")
  }

  /// A fish or plant row on the tank, by its name.
  private func life(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "life").matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
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
