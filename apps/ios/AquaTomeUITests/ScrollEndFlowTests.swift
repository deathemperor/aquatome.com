import XCTest

/// Every tab's scrolling screens, flung to their end: their last words end above the tab bar. On the fixed handbook: Tìm's
/// home, a search's results, a fish, a plant, a guide, a video series and a kind of kit, a long list, what's new, the
/// fish-ID tool, the tank volume and tank-mates tools; Bể của tôi and a tank longer than the screen; Đèn, with no light and
/// with one connected.
final class ScrollEndFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testTimsHomeEndsAboveTheTabBar() {
    let app = launch()
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 10), "not Tìm's home")
    app.endsAboveTheTabBar("Tìm's home")
  }

  func testASearchsResultsEndAboveTheTabBar() {
    let app = launch()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 10), "no search field")
    field.tap()
    field.typeText("ca\n")
    XCTAssertTrue(items(app).firstMatch.waitForExistence(timeout: 5), "no results")
    app.endsAboveTheTabBar("a search's results")
  }

  func testAFishsPageEndsAboveTheTabBar() { pageEnds("ca neon", "Cá neon", "a fish's page") }
  func testAPlantsPageEndsAboveTheTabBar() { pageEnds("rotala", "Rotala đỏ", "a plant's page") }
  func testAGuideEndsAboveTheTabBar() { pageEnds("nuoi ca neon", "Nuôi cá neon trong bể nhỏ", "a guide") }
  func testAVideoSeriesEndsAboveTheTabBar() { pageEnds("reu hai tu a", "Rêu hại từ A đến Z", "a video series") }
  func testAKindOfKitEndsAboveTheTabBar() { pageEnds("loc", "Lọc", "a kind of kit", ["-equipment"]) }

  func testALongListEndsAboveTheTabBar() {
    let app = launch(["-equipment"])
    open(app, "loc", "Lọc")
    let all = app.descendants(matching: .any)["pages-all"]
    repeatUntil(all.exists && all.isHittable, times: 12) { app.swipeUp() }
    all.tap()
    XCTAssertTrue(app.navigationBars["Loài cá cần lọc"].waitForExistence(timeout: 5), "the list didn't open")
    app.endsAboveTheTabBar("a long list")
  }

  func testWhatsNewEndsAboveTheTabBar() {
    let app = launch(["-whats-new"])
    let row = app.descendants(matching: .any)["all-latest"]
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 10), "not Tìm's home")
    repeatUntil(row.exists && row.isHittable, times: 8) { app.swipeUp() }
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["latest"].firstMatch.waitForExistence(timeout: 5), "the list didn't open")
    app.endsAboveTheTabBar("what's new")
  }

  func testTheFishIdToolEndsAboveTheTabBar() {
    let app = launch()
    open(app, "nhan dien", "Đây là cá gì?")
    XCTAssertTrue(app.descendants(matching: .any)["fish-id"].waitForExistence(timeout: 10), "not the fish-ID screen")
    app.endsAboveTheTabBar("the fish-ID tool")
  }

  func testTheTankVolumeToolEndsAboveTheTabBar() {
    let app = launch()
    open(app, "the tich be", "Bể bao nhiêu lít?")
    XCTAssertTrue(app.navigationBars["Bể bao nhiêu lít?"].waitForExistence(timeout: 5), "the tool's screen didn't open")
    app.endsAboveTheTabBar("the tank volume tool")
  }

  func testTheTankMatesToolEndsAboveTheTabBar() {
    let app = launch()
    open(app, "ca neon", "Cá neon")
    let link = app.links["Kiểm tra nuôi chung với loài khác →"].firstMatch
    repeatUntil(link.exists && link.isHittable, times: 12) { app.swipeUp() }
    link.tap()
    XCTAssertTrue(app.buttons["add-mate"].waitForExistence(timeout: 5), "the tool's screen didn't open")
    app.endsAboveTheTabBar("the tank-mates tool")
  }

  func testTheTanksTabEndsAboveTheTabBar() {
    let app = launch()
    app.openTab("Bể của tôi")
    app.endsAboveTheTabBar("Bể của tôi")
  }

  func testATankLongerThanTheScreenEndsAboveTheTabBar() {
    let app = launch(["-seed-tanks", "many"])
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Bể đông"].waitForExistence(timeout: 5), "the tank didn't open")
    app.endsAboveTheTabBar("a tank")
  }

  func testTheLightsTabEndsAboveTheTabBar() {
    let app = launch()
    app.openTab("Đèn")
    app.endsAboveTheTabBar("Đèn")
  }

  func testALightConnectedEndsAboveTheTabBar() {
    let app = launch()
    app.openTab("Đèn")
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    XCTAssertTrue(app.descendants(matching: .any)["notice"].waitForExistence(timeout: 10), "not connected")
    app.endsAboveTheTabBar("a light connected")
  }

  // MARK: Helpers

  private func launch(_ more: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fake-accounts", "on",
                           "-reset-fake-server"] + more
    app.launchForFlow()
    return app
  }

  private func pageEnds(_ query: String, _ name: String, _ screen: String, _ more: [String] = []) {
    let app = launch(more)
    open(app, query, name)
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 10), "\(screen) didn't open")
    app.endsAboveTheTabBar(screen)
  }

  private func items(_ app: XCUIApplication) -> XCUIElementQuery { app.descendants(matching: .any).matching(identifier: "item") }

  /// A page of the handbook, found by its words in Tìm's search.
  private func open(_ app: XCUIApplication, _ query: String, _ name: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 10), "no search field")
    field.tap()
    field.typeText(query)
    let row = items(app).matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no \(name)")
    row.tap()
  }
}
