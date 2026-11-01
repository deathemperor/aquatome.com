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
    app.buttons["Hướng dẫn"].firstMatch.tap()
    XCTAssertTrue(item(app, "Nuôi cá neon trong bể nhỏ").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cá neon").exists, "a fish among the guides")
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
    XCTAssertTrue(app.descendants(matching: .any)["page"].exists)
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

  /// A result row, by its name (the row reads its name, then its scientific name or kind).
  private func item(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
  }
}
