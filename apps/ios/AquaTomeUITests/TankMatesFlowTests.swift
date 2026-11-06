import XCTest

/// The tank-mates tool drawn by the app (TankMatesView), not the site's page: set to a fish by its page's link, empty
/// from search, its fish checked by the app's tank check (the site's own code), alone or with one of the reader's tanks,
/// and saved onto a tank. No network: the fixed handbook.
final class TankMatesFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// A fish page's "Kiểm tra nuôi chung với loài khác →" (`?ca=ca-neon:6`): the tool on the tab in front, with the fish at
  /// the number its link gives, and, with no tank given, the tank it needs.
  func testAFishPagesLinkOpensTheToolSetToThatFish() {
    let app = openFromFish()
    XCTAssertTrue(app.tabBars.buttons["Tìm"].isSelected, "not on the tab in front")
    XCTAssertEqual(app.webViews.count, 0, "the web page opened")
    let count = app.textFields["mate-count"]
    XCTAssertEqual(count.label, "Số con Cá neon")
    XCTAssertEqual(count.value as? String, "6", "not the link's number")
    XCTAssertEqual(app.textFields.matching(identifier: "mate-count").count, 1)
    XCTAssertTrue(text(app, "Thêm một loài nữa để so.").exists, "no hint")
    XCTAssertTrue(text(app, "Bể dài tối thiểu cho cả nhóm: 60 cm.").waitForExistence(timeout: 5), "not the tank the fish needs")
    XCTAssertFalse(app.descendants(matching: .any)["verdict"].exists, "a verdict for one fish")
    keep(app, "from-fish")
  }

  /// A second fish, from the handbook's fish: the check's answer as the site's tool gives it; taken off, the answer goes.
  func testAddingASecondFishShowsAVerdict() {
    let app = openFromFish()
    add(app, "dia", "Cá đĩa")
    let verdict = app.descendants(matching: .any)["verdict"]
    XCTAssertTrue(verdict.waitForExistence(timeout: 5), "no verdict")
    XCTAssertTrue(verdict.label.contains("Không nên nuôi chung: Cá đĩa có thể ăn Cá neon; nhiệt độ không có khoảng chung."), verdict.label)
    XCTAssertTrue(text(app, "Cá đĩa (15 cm) có thể ăn Cá neon (4 cm).").exists, "no warning")
    XCTAssertTrue(reveal(app, text(app, "Bể dài tối thiểu cho cả nhóm: 120 cm.")), "not the tank they need")
    keep(app, "verdict")

    // A fish already chosen is marked, not added twice.
    app.buttons["add-mate"].tap()
    let search = app.searchFields.matching(NSPredicate(format: "placeholderValue == %@", "Gõ tên Việt hoặc tên khoa học")).firstMatch
    XCTAssertTrue(search.waitForExistence(timeout: 5))
    search.tap()
    search.typeText("neon")
    // Its row marked (not the bar's back button, which names the fish page the tool came from).
    let chosen = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Cá neon' AND label CONTAINS 'Đã thêm'")).firstMatch
    XCTAssertTrue(chosen.waitForExistence(timeout: 5), "the chosen fish not marked")
    XCTAssertFalse(chosen.isEnabled, "the chosen fish can be added again")
    // Its search ended ("Đóng", where the bar's buttons were while it's typed in), then the sheet closed.
    app.buttons["Đóng"].tap()
    let cancel = app.buttons["Hủy"]
    if cancel.waitForExistence(timeout: 2) { cancel.tap() }
    XCTAssertTrue(app.navigationBars["Thêm loài"].waitForNonExistence(timeout: 5), "the sheet stayed")
    XCTAssertEqual(app.textFields.matching(identifier: "mate-count").count, 2)

    app.swipeDown()
    labelled(app.buttons, "Bỏ Cá đĩa").tap()
    XCTAssertTrue(verdict.waitForNonExistence(timeout: 5), "a verdict for one fish")
    XCTAssertTrue(text(app, "Thêm một loài nữa để so.").exists, "no hint")
  }

  /// The search's tool item: the tool with no fish yet, saying what to do.
  func testTheSearchsToolItemOpensItEmpty() {
    let app = openFromSearch()
    XCTAssertEqual(app.webViews.count, 0, "the web page opened")
    XCTAssertFalse(app.textFields["mate-count"].exists, "a fish chosen")
    XCTAssertTrue(text(app, "Thêm 2 loài trở lên để xem có nuôi chung được không.").exists, "no hint")
    XCTAssertFalse(app.descendants(matching: .any)["verdict"].exists)
    XCTAssertFalse(app.buttons["save-mates"].exists, "nothing to save offered")
  }

  /// One of the reader's tanks: its fish checked with the chosen ones in its size (a fish on it at the chosen number),
  /// then the chosen fish saved onto it.
  func testTriesTheFishWithATankThenSavesThemOntoIt() {
    let app = openFromSearch("-seed-tanks", "clash") // "Bể 60": 60 × 30 × 36 cm, 2 discus, 12 neons
    add(app, "neon", "Cá neon")
    add(app, "ngua van", "Cá ngựa vằn")
    let picker = app.buttons["mates-tank"]
    XCTAssertTrue(picker.waitForExistence(timeout: 5), "no tank to try")
    picker.tap()
    let tank = app.buttons["Bể 60"]
    XCTAssertTrue(tank.waitForExistence(timeout: 5))
    tank.tap()
    let verdict = app.descendants(matching: .any)["verdict"]
    XCTAssertTrue(reveal(app, verdict), "no verdict")
    XCTAssertTrue(verdict.label.contains("Không nên nuôi chung") && verdict.label.contains("Cá đĩa có thể ăn Cá neon"), verdict.label)
    // The tank's 12 neons at the tool's 6: less full than the tank as it is.
    let stocking = app.descendants(matching: .any)["stocking"]
    XCTAssertTrue(reveal(app, stocking), "no stocking for the tank's size")
    XCTAssertFalse(stocking.label.contains("188%"), stocking.label)
    keep(app, "tried")
    // The neons at 12 again: the tank as its own check reads it (TankCheckFlowTests).
    app.swipeDown()
    labelled(app.textFields, "Số con Cá neon").clearAndType("12")
    XCTAssertTrue(reveal(app, stocking))
    XCTAssertTrue(stocking.label.contains("188% · Quá tải"), stocking.label)

    let save = app.buttons["save-mates"]
    XCTAssertTrue(reveal(app, save))
    XCTAssertFalse(app.textFields["mates-name"].exists, "a new tank's name asked for the tank picked")
    save.tap()
    XCTAssertTrue(app.staticTexts["mates-saved"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["mates-saved"].label, "Đã lưu vào “Bể 60”.")
    let open = app.buttons["Xem trong Bể của tôi →"]
    XCTAssertTrue(reveal(app, open))
    open.tap()
    XCTAssertTrue(app.navigationBars["Bể 60"].waitForExistence(timeout: 5), "not the tank saved")
    XCTAssertTrue(life(app, "Cá ngựa vằn").waitForExistence(timeout: 5), "the new fish not on the tank")
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 12"), life(app, "Cá neon").label)
  }

  /// No tank yet: the chosen fish start one, named as the site's tool names it.
  func testSavesTheFishOntoANewTank() {
    let app = openFromFish()
    XCTAssertFalse(app.buttons["mates-tank"].exists, "a tank to try, with none saved")
    let save = app.buttons["save-mates"]
    XCTAssertTrue(reveal(app, save))
    save.tap()
    XCTAssertTrue(app.staticTexts["mates-saved"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["mates-saved"].label, "Đã lưu vào “Bể mới”.")
    let open = app.buttons["Xem trong Bể của tôi →"]
    XCTAssertTrue(reveal(app, open))
    open.tap()
    XCTAssertTrue(app.navigationBars["Bể mới"].waitForExistence(timeout: 5), "not the new tank")
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 6"), life(app, "Cá neon").label)
  }

  // MARK: Helpers

  private func launch(_ more: [String]) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"] + more
    app.launchForFlow()
    return app
  }

  /// The neon's page, drawn by the app, then its link to the tool.
  private func openFromFish(_ more: String...) -> XCUIApplication {
    let app = launch(more)
    search(app, "ca neon", "Cá neon")
    let link = app.links["Kiểm tra nuôi chung với loài khác →"].firstMatch
    XCTAssertTrue(reveal(app, link), "no link to the tool")
    link.tap()
    XCTAssertTrue(app.navigationBars["Kiểm tra nuôi chung"].waitForExistence(timeout: 5), "the tool's screen didn't open")
    return app
  }

  /// The tool by the search's tool item.
  private func openFromSearch(_ more: String...) -> XCUIApplication {
    let app = launch(more)
    search(app, "nuoi chung", "Kiểm tra nuôi chung")
    XCTAssertTrue(app.navigationBars["Kiểm tra nuôi chung"].waitForExistence(timeout: 5), "the tool's screen didn't open")
    return app
  }

  /// A search's row by its name, opened.
  private func search(_ app: XCUIApplication, _ query: String, _ name: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no \(name)")
    row.tap()
  }

  /// A fish from the tool's search of the handbook's fish.
  private func add(_ app: XCUIApplication, _ query: String, _ name: String) {
    let add = app.buttons["add-mate"]
    repeatUntil(add.exists && add.isHittable, times: 4) { app.swipeDown() }
    add.tap()
    // The sheet's own field, tapped: the Tìm tab's, under the sheet, is a search field too.
    let field = app.searchFields.matching(NSPredicate(format: "placeholderValue == %@", "Gõ tên Việt hoặc tên khoa học")).firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let row = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no \(name)")
    row.tap()
    XCTAssertTrue(labelled(app.textFields, "Số con \(name)").waitForExistence(timeout: 5), "\(name) not chosen")
  }

  /// One with this label (one with an identifier too).
  private func labelled(_ query: XCUIElementQuery, _ label: String) -> XCUIElement {
    query.matching(NSPredicate(format: "label == %@", label)).firstMatch
  }

  /// A fish on the tank's screen.
  private func life(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.buttons.matching(identifier: "life").matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
  }

  private func text(_ app: XCUIApplication, _ part: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", part)).firstMatch
  }

  /// Scrolled down to: a form draws only the rows near the screen. Says whether it's there.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) -> Bool {
    if e.waitForExistence(timeout: 3) && e.isHittable { return true }
    repeatUntil(e.exists && e.isHittable, times: 8) { app.swipeUp() }
    return e.exists && e.isHittable
  }

  /// A screenshot kept with the results, to look at.
  private func keep(_ app: XCUIApplication, _ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}

private extension XCUIElement {
  /// Its number replaced: picked whole by a double tap, as where a tap leaves the cursor varies (a tap near the end of
  /// "6" left it before the 6, and "12" made 126), then typed over; as TankVolumeFlowTests' does.
  func clearAndType(_ text: String) {
    tap()
    if let old = value as? String, !old.isEmpty, old != placeholderValue {
      doubleTap()
      typeText(XCUIKeyboardKey.delete.rawValue)
    }
    typeText(text)
    XCTAssertEqual(value as? String, text, "not typed over")
  }
}
