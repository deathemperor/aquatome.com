import XCTest

/// A tank's fish and plants changed in the app (TankLife.swift): put on a tank from a page of the handbook or from the
/// tank, a fish's number changed, either taken off; kept across launches. The handbook is the fixed one (no network).
final class TankLifeFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testPutsAFishFromItsPageOnATankStartingAtItsSchoolSize() {
    let app = launch("-seed-tanks", "litres") // one tank, "Bể cũ", no fish
    openPage(app, "Cá neon")
    // On the page the app draws, under the fish's name, not in the bar.
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].buttons["put-on-tank"].exists, "not on the page")
    XCTAssertFalse(app.navigationBars.buttons["put-on-tank"].exists, "in the bar as well")
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
    app.openTab("Bể của tôi")
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

    // The tank's screen has grown (the check above, the guides below): the plant may be under the tab bar.
    let rotala = life(app, "Rotala đỏ")
    for _ in 0..<4 where !(rotala.exists && rotala.isHittable) { app.swipeUp() }
    rotala.swipeLeft()
    app.buttons["Xóa"].tap()
    XCTAssertTrue(life(app, "Rotala đỏ").waitForNonExistence(timeout: 5), "the plant is still on the tank")

    app.terminate()
    app = launch(reset: false)
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(life(app, "Cá ngựa vằn").waitForExistence(timeout: 5), "the fish wasn't kept")
    XCTAssertTrue(life(app, "Cá ngựa vằn").label.contains("× 10"))
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 12"), "another fish changed")
    XCTAssertFalse(life(app, "Rotala đỏ").exists, "the plant came back")
  }

  func testChangesTheNumberOfTheFirstFishOnATankLongerThanTheScreen() {
    let app = launch("-seed-tanks", "many") // 20 kinds: the add row is far below
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    let neon = life(app, "Cá neon")
    XCTAssertTrue(neon.waitForExistence(timeout: 5))
    let add = app.buttons["add-life"]
    XCTAssertFalse(add.exists && add.isHittable, "the add row is on screen: the tank isn't long enough to test this")
    neon.swipeLeft()
    app.buttons["Số con"].tap()
    XCTAssertTrue(app.textFields["put-count"].waitForExistence(timeout: 5), "no sheet for a fish far above the add row")
    app.textFields["put-count"].clearAndType("9")
    app.buttons["put-save"].tap()
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 9"), life(app, "Cá neon").label)
  }

  func testListsTheGuidesThatNameTheTanksFishAndOpensThem() {
    let app = launch("-seed-tanks", "life") // neons: one guide names them, and one video guide
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(life(app, "Cá neon").waitForExistence(timeout: 5))
    // Under the fish, the plants and the tank-mates check: it may start under the tab bar.
    let guide = app.buttons.matching(identifier: "tank-guide").firstMatch
    for _ in 0..<4 where !(guide.exists && guide.isHittable) { app.swipeUp() }
    XCTAssertTrue(guide.waitForExistence(timeout: 5), "no related guide")
    XCTAssertEqual(app.buttons.matching(identifier: "tank-guide").count, 1)
    XCTAssertTrue(guide.label.contains("Nuôi cá neon trong bể nhỏ"), guide.label)
    // The video guide apart, as a species page on the site lists them.
    let video = app.buttons.matching(identifier: "tank-video").firstMatch
    for _ in 0..<2 where !(video.exists && video.isHittable) { app.swipeUp() }
    XCTAssertTrue(video.exists && video.label.contains("Cách hạn chế rêu hại"), "no video guide apart")
    XCTAssertTrue(app.staticTexts["Có trong video hướng dẫn"].exists)
    guide.tap()
    XCTAssertTrue(app.navigationBars["Nuôi cá neon trong bể nhỏ"].waitForExistence(timeout: 5), "its page didn't open")
  }

  // MARK: What the handbook has no page for (docs/my-tanks-sync.md, "Entries without a page")

  func testAddsAFishWithoutAPageByNameSendsItOnceAndKeepsItAfterARelaunch() {
    var app = launch("-seed-tanks", "life")
    openTank(app)
    // Typed as a scientific name: nothing in the handbook has it, and the field to add it takes it as one too.
    let new = searchLife(app, "Rhinogobius duospilus")
    XCTAssertEqual(new.label, "Thêm “Rhinogobius duospilus” (chưa có trong cẩm nang)")
    XCTAssertEqual(app.buttons.matching(identifier: "life-item").count, 0, "a page offered for a name the handbook lacks")
    new.tap()
    let name = app.textFields["new-name"], sci = app.textFields["new-sci"]
    XCTAssertTrue(name.waitForExistence(timeout: 5), "no form to add it")
    XCTAssertEqual(name.value as? String, "Rhinogobius duospilus")
    XCTAssertEqual(sci.value as? String, "Rhinogobius duospilus", "the scientific name typed isn't taken as one")
    XCTAssertTrue(app.segmentedControls["new-kind"].buttons["Cá, tép hoặc ốc"].isSelected, "not a fish to begin with")
    // A segmented picker doesn't show its own label, so VoiceOver read the two choices without saying what they choose.
    XCTAssertTrue(app.staticTexts["Đây là"].exists, "nothing says what the fish-or-plant choice is")
    name.clearAndType("Ca bong mat tre")
    app.textFields["new-count"].tap()
    app.textFields["new-count"].typeText("3")
    app.buttons["new-save"].tap()

    let fish = life(app, "Ca bong mat tre")
    XCTAssertTrue(fish.waitForExistence(timeout: 5), "not on the tank")
    // What VoiceOver reads: its name, its scientific name, how many, and that it has no page.
    XCTAssertTrue(fish.label.contains("Rhinogobius duospilus") && fish.label.contains("× 3") && fish.label.contains("chưa có trang"), fish.label)
    let sent = #"{"kind":"fish","name":"Ca bong mat tre","sci":"Rhinogobius duospilus"}"#
    XCTAssertTrue(waitForWanted(app, sent), "not sent as wanted, or not as the server takes it: \(wanted(app))")
    // Not checked with the fish the handbook has figures for: said so.
    let unchecked = app.staticTexts["unchecked"]
    for _ in 0..<4 where !(unchecked.exists && unchecked.isHittable) { app.swipeUp() }
    let line = "Chưa kiểm tra Ca bong mat tre: cẩm nang chưa có trang nên chưa có số liệu để so."
    let said = expectation(for: NSPredicate(format: "label == %@", line), evaluatedWith: unchecked)
    XCTAssertEqual(XCTWaiter.wait(for: [said], timeout: 5), .completed, "said instead: \(unchecked.label)")

    // Its number changed: not sent again.
    for _ in 0..<4 where !(fish.exists && fish.isHittable) { app.swipeDown() }
    swipeOpen(app, fish, "Số con")
    app.buttons["Số con"].tap()
    let count = app.textFields["put-count"]
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    XCTAssertEqual(count.value as? String, "3")
    count.clearAndType("5")
    app.buttons["put-save"].tap()
    XCTAssertTrue(life(app, "Ca bong mat tre").label.contains("× 5"), life(app, "Ca bong mat tre").label)
    XCTAssertFalse(waitForWanted(app, sent + "\n" + sent, timeout: 2), "sent again for a number changed")
    XCTAssertEqual(wanted(app), sent)

    app.terminate()
    app = launch(reset: false)
    openTank(app)
    XCTAssertTrue(life(app, "Ca bong mat tre").waitForExistence(timeout: 5), "not kept")
    XCTAssertTrue(life(app, "Ca bong mat tre").label.contains("× 5"))
    XCTAssertEqual(wanted(app), "", "sent again after a relaunch")
  }

  func testAPlantWithoutAPageGoesWithThePlantsUncountedAndComesOff() {
    let app = launch("-seed-tanks", "life")
    openTank(app)
    searchLife(app, "reu suoi").tap() // not read as a scientific name: no capital
    XCTAssertTrue(app.textFields["new-name"].waitForExistence(timeout: 5))
    let sci = app.textFields["new-sci"]
    XCTAssertEqual(sci.value as? String, sci.placeholderValue, "a common name taken as a scientific one") // empty: its prompt
    app.segmentedControls["new-kind"].buttons["Cây"].tap()
    XCTAssertFalse(app.textFields["new-count"].exists, "a plant isn't counted")
    app.buttons["new-save"].tap()

    let plant = life(app, "reu suoi")
    XCTAssertTrue(plant.waitForExistence(timeout: 5), "not on the tank")
    for _ in 0..<4 where !(plant.exists && plant.isHittable) { app.swipeUp() }
    XCTAssertTrue(plant.exists && plant.label.contains("chưa có trang"), "not with the tank's plants: \(plant.label)")
    // Among the plants: after the tank's rotala, in the same section.
    XCTAssertGreaterThan(plant.frame.minY, life(app, "Rotala đỏ").frame.minY)
    XCTAssertTrue(waitForWanted(app, #"{"kind":"plant","name":"reu suoi"}"#), "not sent as wanted: \(wanted(app))")
    swipeOpen(app, plant, "Xóa")
    XCTAssertFalse(app.buttons["Số con"].exists, "a plant isn't counted")
    app.buttons["Xóa"].tap()
    XCTAssertTrue(life(app, "reu suoi").waitForNonExistence(timeout: 5), "still on the tank")
  }

  func testAnEntryWithAPagesScientificNameShowsAsThatPageAndIsntWanted() {
    let app = launch("-seed-tanks", "life")
    openTank(app)
    searchLife(app, "ca soc").tap()
    let sci = app.textFields["new-sci"]
    XCTAssertTrue(sci.waitForExistence(timeout: 5))
    sci.tap()
    sci.typeText("danio  Rerio")
    app.textFields["new-count"].tap()
    app.textFields["new-count"].typeText("4")
    app.buttons["new-save"].tap()

    // Shown as the handbook's page with that name (Danio rerio), with the entry's number, opening the page.
    let danio = life(app, "Cá ngựa vằn")
    XCTAssertTrue(danio.waitForExistence(timeout: 5), "not shown as its page")
    XCTAssertTrue(danio.label.contains("× 4") && !danio.label.contains("chưa có trang"), danio.label)
    XCTAssertFalse(life(app, "ca soc").exists, "shown by the name typed")
    XCTAssertFalse(waitForWanted(app, "{", timeout: 2), "the handbook has its page, yet it was sent: \(wanted(app))")
    danio.tap()
    XCTAssertTrue(app.navigationBars["Cá ngựa vằn"].waitForExistence(timeout: 5), "its page didn't open")
    // One the handbook hasn't, put on after: it alone is sent (sent in order, the first would be there by now).
    app.navigationBars.buttons.firstMatch.tap()
    searchLife(app, "ca la").tap()
    XCTAssertTrue(app.buttons["new-save"].waitForExistence(timeout: 5))
    app.buttons["new-save"].tap()
    let only = #"{"kind":"fish","name":"ca la"}"#
    XCTAssertTrue(waitForWanted(app, only), "the one with no page wasn't sent: \(wanted(app))")
    XCTAssertEqual(wanted(app), only, "the one with a page was sent too")
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
    app.launchForFlow()
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

  private func openTank(_ app: XCUIApplication) {
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(app.buttons["add-life"].waitForExistence(timeout: 5), "the tank didn't open")
  }

  /// The tank's "Thêm cá hoặc cây", searched for `text`: its last row, which adds what was typed without a page.
  @discardableResult
  private func searchLife(_ app: XCUIApplication, _ text: String) -> XCUIElement {
    app.buttons["add-life"].tap()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText(text)
    let new = app.buttons["life-new"]
    XCTAssertTrue(new.waitForExistence(timeout: 5), "no row to add “\(text)” without a page")
    return new
  }

  /// What the stand-in server took as wanted (POST /api/v1/wanted) since launch, a body a line: a debug build's value
  /// on the tank's "Thêm cá hoặc cây".
  private func wanted(_ app: XCUIApplication) -> String { app.buttons["add-life"].value as? String ?? "" }

  private func waitForWanted(_ app: XCUIApplication, _ text: String, timeout: TimeInterval = 5) -> Bool {
    let has = NSPredicate(format: "value CONTAINS %@", text)
    return XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: has, object: app.buttons["add-life"])], timeout: timeout) == .completed
  }

  /// Swipes a row open until `action` shows. A swipe that lands while the list is still moving only stops it: swiped
  /// once more.
  private func swipeOpen(_ app: XCUIApplication, _ row: XCUIElement, _ action: String, file: StaticString = #filePath, line: UInt = #line) {
    row.swipeLeft()
    if !app.buttons[action].waitForExistence(timeout: 3) { row.swipeLeft() }
    XCTAssertTrue(app.buttons[action].waitForExistence(timeout: 3), "no \(action) on the row", file: file, line: line)
  }
}

private extension XCUIElement {
  /// Taps at the end of the text, deletes it all (a few more times than it has letters: the first key can be lost while
  /// the field takes focus), then types.
  func clearAndType(_ text: String) {
    let old = value as? String ?? ""
    coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
    typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count + 3) + text)
  }
}
