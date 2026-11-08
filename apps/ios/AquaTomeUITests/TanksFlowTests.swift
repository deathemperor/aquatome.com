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
    // Typed fast past the cut, the field once went on showing 81–89 characters while 80 were kept, about one time in
    // three: typed ten times, the field shows what's kept each time, and the tank is saved with it.
    let field = app.textFields["name"]
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no name field")
    field.tap()
    for round in 1...10 {
      if round > 1 { field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 90)) }
      field.typeText(String(repeating: "a", count: 90))
      let cut = expectation(for: NSPredicate(format: "value == %@", String(repeating: "a", count: 80)), evaluatedWith: field)
      XCTAssertEqual(XCTWaiter.wait(for: [cut], timeout: 8), .completed, "round \(round): the field shows \((field.value as? String)?.count ?? 0) characters, not 80")
    }
    app.buttons["save"].tap()
    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no tank listed")
    XCTAssertTrue(row.label.contains(String(repeating: "a", count: 80)) && !row.label.contains(String(repeating: "a", count: 81)), row.label)
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

  // A phone in a language the app doesn't have (English): the app's words are Vietnamese, and so are its numbers. Once the
  // app had Malay, iOS made its locale Malay's (8 Nov): a decimal took Malay's point (64.8 lít), and the words looked up
  // through a LocalizedStringResource (a field's prompt, Đèn's presets) came in Malay.
  func testAPhoneInEnglishGetsTheAppsWordsAndDecimals() { phoneInEnglish() }
  /// v2, the app's look (the owner, 8 Nov), whose tabs hold the same screens.
  func testAPhoneInEnglishGetsTheAppsWordsAndDecimalsInV2() { phoneInEnglish(["-v2", "YES"]) }

  private func phoneInEnglish(_ more: [String] = []) {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(en)", "-AppleLocale", "en_US", "-fixed-handbook", "-reset-defaults"] + more
    app.launchForFlow()
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "the empty state")
    app.buttons["add-first"].tap()
    let name = app.descendants(matching: .any)["name"].firstMatch
    XCTAssertTrue(name.waitForExistence(timeout: 5), "no field name")
    XCTAssertEqual(name.placeholderValue, "Ví dụ: Bể 60 phòng khách")
    type(app, "name", "Bể 60")
    type(app, "l", "60")
    type(app, "w", "30")
    type(app, "h", "36")
    app.buttons["save"].tap()
    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no tank listed")
    XCTAssertTrue(row.label.contains("64,8 lít"), row.label)
    app.openTab("Đèn")
    XCTAssertTrue(app.staticTexts["Bể mới trồng"].waitForExistence(timeout: 5), "Đèn's presets not in the app's words")
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

  func testListsATanksFishAndPlantsAndOpensTheirPages() {
    let app = launch("-seed-tanks", "life")
    app.buttons["tank"].firstMatch.tap()
    let neon = app.buttons.matching(identifier: "life").matching(NSPredicate(format: "label CONTAINS 'Cá neon'")).firstMatch
    XCTAssertTrue(neon.waitForExistence(timeout: 5), "the fish isn't named from the handbook")
    XCTAssertTrue(neon.label.contains("× 12"), neon.label)
    XCTAssertTrue(text(app, "Rotala đỏ").exists, "the plant isn't listed")
    XCTAssertTrue(text(app, "loai-chua-co-trang").exists, "a fish the handbook doesn't have isn't shown as it is")
    neon.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "its page didn't open")
  }

  func testDeletesATank() {
    let app = launch()
    add(app, "Bể tạm")
    app.buttons["tank"].firstMatch.tap()
    let delete = app.buttons["delete"]
    delete.tap()
    let confirm = app.buttons["Xóa"].firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    // It pointed at the top of the screen, far from the button tapped at the tank's end: 261 pt off, where on its button it's 23.
    XCTAssertLessThan(abs(confirm.frame.midY - delete.frame.midY), 150, "the question isn't by the button that asked it")
    confirm.tap()
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "the tank is still listed")
  }

  // The + in the bar above was easy to miss: a second tank is added from the list itself.
  func testAddsAnotherTankFromTheList() {
    let app = launch()
    add(app, "Bể 60")
    let more = app.buttons["add-row"]
    XCTAssertTrue(more.waitForExistence(timeout: 5) && more.isHittable, "no “Thêm bể” in the list")
    more.tap()
    type(app, "name", "Bể 90")
    app.buttons["save"].tap()
    XCTAssertTrue(app.buttons.matching(identifier: "tank").matching(NSPredicate(format: "label CONTAINS 'Bể 90'")).firstMatch
      .waitForExistence(timeout: 5), "the second tank isn't listed")
    XCTAssertEqual(app.buttons.matching(identifier: "tank").count, 2)
  }

  func testLeavesAStoreFromANewerAppAlone() {
    let app = launch("-seed-tanks", "newer")
    XCTAssertTrue(text(app, "bản ứng dụng mới hơn").waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["add"].isEnabled, "it could be written over")
    XCTAssertFalse(app.buttons["add-row"].isEnabled, "it could be written over from the list")
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
    app.launchForFlow()
    app.openTab("Bể của tôi")
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
