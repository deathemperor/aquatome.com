import XCTest

/// The handbook tab on a small fixed index (`-fixed-handbook`, HandbookIndex.fixture): searching and browsing (the
/// home's shelves: fish groups, placements, the glossary) work without the network, the same way each run.
final class HandbookFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testFindsAFishTypedWithoutAccents() {
    let app = launch()
    search(app, "ca dia")
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cá neon").exists)
  }

  func testFindsByAnotherName() {
    let app = launch()
    search(app, "neon tetra")
    XCTAssertTrue(item(app, "Cá neon").waitForExistence(timeout: 5))
  }

  func testBrowsesAFishGroupNotEverything() {
    let app = launch()
    // The home leads with ways in, not every page: the discus is a well-known fish, the zebra danio isn't.
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5), "no fish groups")
    // All the way down the home (a lazy list draws only what's on screen), then back to the groups.
    for _ in 0..<6 {
      XCTAssertFalse(item(app, "Cá ngựa vằn").exists, "every fish on the home")
      app.swipeUp()
    }
    XCTAssertFalse(item(app, "Cá ngựa vằn").exists, "every fish on the home")
    for _ in 0..<8 where !shelf(app, "Cichlid").isHittable { app.swipeDown() }
    // Hittable while still under the top bar, where a tap lands on the status bar and only scrolls: once more, to the top.
    app.swipeDown()
    shelf(app, "Cichlid").tap()
    XCTAssertTrue(app.navigationBars["Cichlid"].waitForExistence(timeout: 5))
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cá neon").exists)
  }

  func testBrowsesEveryFishAndThePlantsByWhereTheyGo() {
    let app = launch()
    let all = app.descendants(matching: .any)["all-fish"]
    XCTAssertTrue(all.waitForExistence(timeout: 5))
    XCTAssertTrue(all.label.hasPrefix("Tất cả loài"), all.label)
    all.tap()
    for name in ["Cá đĩa", "Cá neon", "Cá ngựa vằn"] { XCTAssertTrue(item(app, name).waitForExistence(timeout: 5), name) }
    XCTAssertFalse(item(app, "Rotala đỏ").exists, "a plant among the fish")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    shelf(app, "Hậu cảnh").tap()
    XCTAssertTrue(item(app, "Rotala đỏ").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cá đĩa").exists)
  }

  func testFiltersTheFishToMyTank() {
    // Bể 60 (60 cm long): the neon fits, the discus needs 120 cm, the zebra danio has no figures yet.
    let app = launch("-seed-tanks", "clash")
    let all = app.descendants(matching: .any)["all-fish"]
    XCTAssertTrue(all.waitForExistence(timeout: 5))
    all.tap()
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    app.buttons["filter"].tap()
    let tank = app.buttons.matching(identifier: "my-tank").matching(NSPredicate(format: "label BEGINSWITH 'Bể 60'")).firstMatch
    XCTAssertTrue(tank.waitForExistence(timeout: 5), "the reader's tank not offered")
    tank.tap()
    app.buttons["Xong"].tap()

    XCTAssertTrue(app.staticTexts["1 loài phù hợp · 1 loài chưa đủ dữ liệu để chắc"].waitForExistence(timeout: 5))
    XCTAssertTrue(item(app, "Cá neon").exists)
    XCTAssertFalse(item(app, "Cá đĩa").exists, "a fish too big for the tank")
    XCTAssertTrue(app.staticTexts["Chưa đủ dữ liệu để chắc (1)"].exists)
    XCTAssertTrue(item(app, "Cá ngựa vằn").exists, "a fish with no figures left out")

    app.buttons["Xóa lọc"].tap()
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["Chưa đủ dữ liệu để chắc (1)"].exists)
  }

  func testFiltersThePlantsToTheTanksLight() {
    let app = launch()
    let all = app.descendants(matching: .any)["all-plants"]
    for _ in 0..<4 where !(all.exists && all.isHittable) { app.swipeUp() }
    all.tap()
    XCTAssertTrue(item(app, "Rotala đỏ").waitForExistence(timeout: 5))
    app.buttons["filter"].tap()
    // Rotala needs strong light: out under weak light, in under strong.
    pick(app, "Ánh sáng bể", "Yếu")
    app.buttons["Xong"].tap()
    XCTAssertTrue(app.staticTexts["Không có loài nào khớp. Thử nới điều kiện lọc."].waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Rotala đỏ").exists)
    app.buttons["filter"].tap()
    pick(app, "Ánh sáng bể", "Mạnh")
    app.buttons["Xong"].tap()
    XCTAssertTrue(app.staticTexts["1 loài phù hợp"].waitForExistence(timeout: 5))
    XCTAssertTrue(item(app, "Rotala đỏ").exists)
  }

  func testFindsAToolByWhatItsPageSays() {
    let app = launch()
    // "Bể của tôi" by the words of its page's title ("sổ ghi bể cá"), not its name.
    search(app, "so ghi")
    XCTAssertTrue(item(app, "Bể của tôi").waitForExistence(timeout: 5), "the tool not found by its page's words")
  }

  /// A video's length as the site writes it in every language: "29:15", not the phone's time style ("29.15" in
  /// Indonesian).
  func testAVideosLengthReadsAsTheSiteWritesItInIndonesianToo() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(id)", "-AppleLocale", "id_ID", "-reset-defaults", "-fixed-handbook"]
    app.launch()
    let all = app.descendants(matching: .any)["all-videos"]
    for _ in 0..<8 where !(all.exists && all.isHittable) { app.swipeUp() }
    all.tap()
    let video = item(app, "Cách hạn chế rêu hại")
    XCTAssertTrue(video.waitForExistence(timeout: 5))
    XCTAssertEqual(video.value as? String, "29:15")
  }

  func testVideosHaveAShelfOfTheirOwn() {
    let app = launch()
    let all = app.descendants(matching: .any)["all-videos"]
    for _ in 0..<8 where !(all.exists && all.isHittable) { app.swipeUp() }
    XCTAssertTrue(item(app, "Rêu hại từ A đến Z").exists, "no video series on the home")
    all.tap()
    XCTAssertTrue(app.navigationBars["Video"].waitForExistence(timeout: 5))
    let video = item(app, "Cách hạn chế rêu hại")
    XCTAssertTrue(video.waitForExistence(timeout: 5))
    XCTAssertEqual(video.value as? String, "29:15", "no length")
    // Not among the written guides, as on the site's guide list.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let guides = app.descendants(matching: .any)["all-guides"]
    for _ in 0..<8 where !(guides.exists && guides.isHittable) { app.swipeDown() }
    guides.tap()
    XCTAssertTrue(item(app, "Nuôi cá neon").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cách hạn chế rêu hại").exists, "a video among the written guides")
  }

  func testSearchesOneKind() {
    let app = launch()
    search(app, "neon")
    XCTAssertTrue(item(app, "Cá neon").waitForExistence(timeout: 5))
    let guides = chip(app, "guide")
    guides.tap()
    XCTAssertTrue(item(app, "Nuôi cá neon trong bể nhỏ").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cá neon").exists, "a fish among the guides")
    XCTAssertTrue(guides.isSelected, "the kind picked isn't marked")
    XCTAssertFalse(chip(app, "all").isSelected, "“Tất cả” still marked")
    XCTAssertEqual(guides.value as? String, "\(rows(app))", "the guides' count isn't the rows shown")
  }

  // The kinds under the search field were the system's scope bar: seven in one capsule, their names cut short.
  func testTypingShowsTheKindsFoundWithHowMany() {
    let app = launch()
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5))
    XCTAssertFalse(chip(app, "all").exists, "kinds before a search")
    search(app, "ca")
    let all = chip(app, "all")
    XCTAssertTrue(all.waitForExistence(timeout: 5), "no kinds once the reader types")
    XCTAssertEqual(app.descendants(matching: .any)["kinds"].label, "Lọc kết quả")
    XCTAssertTrue(all.isSelected, "not every kind to begin with")
    // Each kind whole, and how many it finds: all of them for “Tất cả”, as many as the rows.
    XCTAssertEqual(all.label, "Tất cả")
    // The tools: "Bể của tôi" (its words say "bể cá") and fish ID ("Đây là cá gì?").
    XCTAssertEqual(all.value as? String, "8")
    XCTAssertEqual(rows(app), 8)
    for (kind, title, count) in [("fish", "Loài cá", 3), ("guide", "Hướng dẫn", 2), ("video", "Video", 2), ("tool", "Công cụ", 2)] {
      let c = chip(app, kind)
      XCTAssertTrue(c.exists, "no \(title)")
      XCTAssertEqual(c.label, title)
      XCTAssertEqual(c.value as? String, "\(count)", title)
      XCTAssertFalse(c.isSelected, title)
    }
    // A kind with nothing found has no chip.
    XCTAssertFalse(chip(app, "plant").exists, "plants, with none found")
    XCTAssertFalse(chip(app, "glossary").exists, "the glossary, with none found")
  }

  // A kind picked keeps its chip when the next letters find none of it: the way back to the others.
  func testAKindPickedStaysWhenTheSearchFindsNoneOfIt() {
    let app = launch()
    search(app, "do")
    chip(app, "plant").tap()
    XCTAssertTrue(item(app, "Rotala đỏ").waitForExistence(timeout: 5))
    app.searchFields.firstMatch.typeText("n")
    let plants = chip(app, "plant")
    XCTAssertTrue(plants.waitForExistence(timeout: 5) && plants.isSelected, "the kind picked went with its last result")
    XCTAssertEqual(plants.value as? String, "0")
    XCTAssertEqual(rows(app), 0)
    XCTAssertEqual(chip(app, "fish").value as? String, "2")
    chip(app, "all").tap()
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    XCTAssertEqual(rows(app), 2)
  }

  func testClearingTheSearchHidesTheKindsAndShowsTheHome() {
    let app = launch()
    search(app, "neon")
    chip(app, "guide").tap()
    let field = app.searchFields.firstMatch
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 4))
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5), "not the home")
    XCTAssertFalse(chip(app, "all").exists, "kinds without a search")
    // The next search starts with every kind, not the one picked for the last.
    field.typeText("ca")
    XCTAssertTrue(chip(app, "all").waitForExistence(timeout: 5) && chip(app, "all").isSelected, "still narrowed to the guides")
    XCTAssertEqual(rows(app), 8)
  }

  func testTheGlossaryGoesByLetter() {
    let app = launch()
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5))
    // The last section: drawn once it's scrolled to.
    let all = app.descendants(matching: .any)["all-glossary"]
    for _ in 0..<6 where !(all.exists && all.isHittable) { app.swipeUp() }
    all.tap()
    XCTAssertTrue(app.navigationBars["Thuật ngữ"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Đ"].exists, "no letter")
    XCTAssertTrue(item(app, "Đệm pH").exists)
  }

  func testTheChihirosToolOpensTheLightsTab() {
    let app = launch()
    search(app, "chihiros")
    item(app, "Đèn Chihiros").tap()
    XCTAssertTrue(app.buttons["scan"].waitForExistence(timeout: 5), "the Lights tab")
  }

  func testTheMyTanksToolOpensTheTanksTab() {
    let app = launch()
    search(app, "be cua toi")
    item(app, "Bể của tôi").tap()
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "the tanks tab, not the site's page")
  }

  func testAPageOpensInTheApp() {
    let app = launch()
    item(app, "Cá neon").tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5))
    // The site writes the neon's page as blocks: the app draws it.
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not drawn by the app")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    // The discus has no copy among them: its web page, stood in for, naming its path (no test reaches aquatome.com). A web
    // view's first start can take a while on a slow runner.
    item(app, "Cá đĩa").tap()
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "not the web page")
    XCTAssertTrue(app.webViews.staticTexts["/vi/ca/ca-dia/"].waitForExistence(timeout: 15), "not the stand-in page")
  }

  // Reading down a page, the tab bar shrinks to the open tab's button; a tap on it, or the page back at its top, brings
  // it back. (iOS 26 shrinks it; older iOS keeps the bar as it is.)
  func testTheTabBarShrinksWhileScrollingDownAndComesBack() throws {
    guard #available(iOS 26.0, *) else { throw XCTSkip("the tab bar shrinks from iOS 26") }
    let app = launch()
    let tabs = app.tabBars.buttons
    XCTAssertTrue(tabs["Tìm"].waitForExistence(timeout: 5))
    let all = tabs.count
    XCTAssertGreaterThanOrEqual(all, 3)
    app.swipeUp()
    app.swipeUp()
    XCTAssertTrue(waitFor(tabs, 1), "the tab bar didn't shrink")
    XCTAssertEqual(tabs.firstMatch.label, "Tìm", "the open tab isn't the one left")
    app.swipeDown()
    app.swipeDown()
    app.swipeDown()
    XCTAssertTrue(waitFor(tabs, all), "back at the top, the tab bar didn't come back")
    app.swipeUp()
    app.swipeUp()
    XCTAssertTrue(waitFor(tabs, 1), "the tab bar didn't shrink again")
    app.showTabs()
    XCTAssertTrue(waitFor(tabs, all), "a tap on the shrunk tab bar didn't bring it back")
  }

  private func waitFor(_ tabs: XCUIElementQuery, _ n: Int) -> Bool {
    XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "count == %d", n), object: tabs)], timeout: 5) == .completed
  }

  // MARK: Helpers

  private func launch(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"] + more
    app.launch()
    return app
  }

  private func search(_ app: XCUIApplication, _ text: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(text)
  }

  /// A way into a shelf on the home (a fish group, a placement, a subject), by its word.
  private func shelf(_ app: XCUIApplication, _ label: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "shelf").matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
  }

  /// Picks an option of a filter's picker (which reads its label, then the option picked).
  private func pick(_ app: XCUIApplication, _ picker: String, _ option: String) {
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", picker)).firstMatch.tap()
    let choice = app.buttons[option]
    XCTAssertTrue(choice.waitForExistence(timeout: 5), "no \(option) under \(picker)")
    choice.tap()
  }

  /// The chip of a kind under the search field (`all` for every kind).
  private func chip(_ app: XCUIApplication, _ kind: String) -> XCUIElement { app.buttons["kind-\(kind)"] }

  /// How many result rows show: the list's cells holding a page, not the chips' header (and once each: a row's button and
  /// what it draws both carry its "item").
  private func rows(_ app: XCUIApplication) -> Int { app.collectionViews.firstMatch.cells.containing(.any, identifier: "item").count }

  /// A result row, by its name (the row reads its name, then its scientific name or kind).
  private func item(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
  }
}
