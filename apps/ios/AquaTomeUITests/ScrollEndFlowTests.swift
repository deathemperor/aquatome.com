import XCTest

/// Every tab's scrolling screens, flung to their end: their last words end above the tab bar, and nothing of what passed
/// under the title shows behind it. On the fixed handbook: Tìm's
/// home, a search's results, a fish, a plant, a guide, a video series and a kind of kit, a long list, what's new, the
/// fish-ID tool, the tank volume and tank-mates tools; Bể của tôi and a tank longer than the screen; Đèn, with no light and
/// with one connected.
final class ScrollEndFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testTimsHomeEndsAboveTheTabBar() {
    let app = launch(["-v2", "NO"])
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 10), "not Tìm's home")
    ends(app, "Tìm's home")
  }

  func testASearchsResultsEndAboveTheTabBar() {
    let app = launch(["-v2", "NO"])
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 10), "no search field")
    field.tap()
    field.typeText("ca\n")
    XCTAssertTrue(items(app).firstMatch.waitForExistence(timeout: 5), "no results")
    ends(app, "a search's results")
  }

  func testAFishsPageEndsAboveTheTabBar() { pageEnds("ca neon", "Cá neon", "a fish's page") }
  func testAPlantsPageEndsAboveTheTabBar() { pageEnds("rotala", "Rotala đỏ", "a plant's page") }
  func testAGuideEndsAboveTheTabBar() { pageEnds("nuoi ca neon", "Nuôi cá neon trong bể nhỏ", "a guide") }
  func testAVideoSeriesEndsAboveTheTabBar() { pageEnds("reu hai tu a", "Rêu hại từ A đến Z", "a video series") }
  func testAKindOfKitEndsAboveTheTabBar() { pageEnds("loc", "Lọc", "a kind of kit", ["-equipment"]) }

  func testALongListEndsAboveTheTabBar() {
    let app = launch(["-v2", "NO", "-equipment"])
    open(app, "loc", "Lọc")
    let all = app.descendants(matching: .any)["pages-all"]
    repeatUntil(all.exists && all.isHittable, times: 12) { app.swipeUp() }
    all.tap()
    XCTAssertTrue(app.navigationBars["Loài cá cần lọc"].waitForExistence(timeout: 5), "the list didn't open")
    ends(app, "a long list")
  }

  func testWhatsNewEndsAboveTheTabBar() {
    let app = launch(["-v2", "NO", "-whats-new"])
    let row = app.descendants(matching: .any)["all-latest"]
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 10), "not Tìm's home")
    repeatUntil(row.exists && row.isHittable, times: 8) { app.swipeUp() }
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["latest"].firstMatch.waitForExistence(timeout: 5), "the list didn't open")
    ends(app, "what's new")
  }

  func testTheFishIdToolEndsAboveTheTabBar() {
    let app = launch(["-v2", "NO"])
    open(app, "nhan dien", "Đây là cá gì?")
    XCTAssertTrue(app.descendants(matching: .any)["fish-id"].waitForExistence(timeout: 10), "not the fish-ID screen")
    ends(app, "the fish-ID tool")
  }

  func testTheTankVolumeToolEndsAboveTheTabBar() {
    let app = launch(["-v2", "NO"])
    open(app, "the tich be", "Bể bao nhiêu lít?")
    XCTAssertTrue(app.navigationBars["Bể bao nhiêu lít?"].waitForExistence(timeout: 5), "the tool's screen didn't open")
    ends(app, "the tank volume tool")
  }

  func testTheTankMatesToolEndsAboveTheTabBar() {
    let app = launch(["-v2", "NO"])
    open(app, "ca neon", "Cá neon")
    let link = app.links["Kiểm tra nuôi chung với loài khác →"].firstMatch
    repeatUntil(link.exists && link.isHittable, times: 12) { app.swipeUp() }
    link.tap()
    XCTAssertTrue(app.buttons["add-mate"].waitForExistence(timeout: 5), "the tool's screen didn't open")
    ends(app, "the tank-mates tool")
  }

  func testTheTanksTabEndsAboveTheTabBar() {
    let app = launch()
    app.openTab("Bể của tôi")
    ends(app, "Bể của tôi")
  }

  func testATankLongerThanTheScreenEndsAboveTheTabBar() {
    let app = launch(["-seed-tanks", "many"])
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Bể đông"].waitForExistence(timeout: 5), "the tank didn't open")
    ends(app, "a tank")
  }

  func testTheLightsTabEndsAboveTheTabBar() {
    let app = launch()
    app.openTab("Đèn")
    ends(app, "Đèn")
  }

  func testALightConnectedEndsAboveTheTabBar() {
    let app = launch()
    app.openTab("Đèn")
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    XCTAssertTrue(app.descendants(matching: .any)["notice"].waitForExistence(timeout: 10), "not connected")
    ends(app, "a light connected")
  }

  // Part-way down a screen, where its words are under the title, as well as at its end. Đèn's words at the largest text
  // read through the soft edge behind the clock and title (8 Nov); so did Tìm's tools, and a fish's page at any size.
  func testAFishsTitleReadsCleanly() { pageTitleReads("a fish's page") }
  func testAFishsTitleReadsCleanlyInTheDark() { pageTitleReads("a fish's page, dark", ["-dark"]) }
  func testAFishsTitleReadsCleanlyAtTheLargestText() { pageTitleReads("a fish's page, the largest text", Self.largest) }

  func testTimsTitleReadsCleanlyAtTheLargestText() {
    let app = launch(["-v2", "NO"] + Self.largest)
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 10), "not Tìm's home")
    downAWay(app)
    app.titleReadsCleanly("Tìm's home, the largest text")
  }

  func testTheLightsTitleReadsCleanlyAtTheLargestText() {
    let app = launch(["-v2", "NO"] + Self.largest)
    app.openTab("Đèn")
    downAWay(app)
    app.titleReadsCleanly("Đèn, the largest text")
  }

  // v2, the app's look (the owner, 8 Nov): its tabs lay their own band behind the bar (ClearUnderTopBar).
  // The band behind the bar comes only once a large title has gone up: at rest it would stand over the title (10 Nov).
  func testLargeTitlesAreOnScreenAtRest() {
    let app = launch(["-v2", "YES", "-seed-tanks", "life"])
    for (tab, title) in [("Bể của tôi", "Bể của tôi"), ("Đèn", "Đèn Chihiros")] {
      app.openTab(tab)
      app.largeTitleIsOnScreen(title)
    }
  }

  func testV2sTodayTitleReadsCleanly() { v2TitleReads("Hôm nay", "v2's Hôm nay") }
  func testV2sBrowseTitleReadsCleanly() { v2TitleReads("Khám phá", "v2's Khám phá") }
  func testV2sTanksTitleReadsCleanly() { v2TitleReads("Bể của tôi", "v2's Bể của tôi", ["-seed-tanks", "many"]) }
  func testV2sLightsTitleReadsCleanlyAtTheLargestText() { v2TitleReads("Đèn", "v2's Đèn, the largest text", Self.largest) }

  // MARK: Helpers

  private static let largest = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]

  private func ends(_ app: XCUIApplication, _ screen: String, file: StaticString = #filePath, line: UInt = #line) {
    app.endsAboveTheTabBar(screen, file: file, line: line)
    app.titleReadsCleanly(screen, file: file, line: line)
  }

  private func downAWay(_ app: XCUIApplication) {
    app.swipeUp()
    app.swipeUp()
    _ = XCTWaiter.wait(for: [XCTestExpectation(description: "still")], timeout: 1)
  }

  private func pageTitleReads(_ screen: String, _ more: [String] = [], file: StaticString = #filePath, line: UInt = #line) {
    let app = launch(["-v2", "NO"] + more)
    open(app, "ca neon", "Cá neon")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 10), "\(screen) didn't open", file: file, line: line)
    downAWay(app)
    app.titleReadsCleanly(screen, file: file, line: line)
  }

  /// A tab of v2's, part-way down.
  private func v2TitleReads(_ tab: String, _ screen: String, _ more: [String] = [], file: StaticString = #filePath, line: UInt = #line) {
    let app = launch(["-v2", "YES"] + more)
    app.openTab(tab)
    downAWay(app)
    app.titleReadsCleanly(screen, file: file, line: line)
  }

  private func launch(_ more: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fake-accounts", "on",
                           "-reset-fake-server"] + more
    app.launchForFlow()
    return app
  }

  private func pageEnds(_ query: String, _ name: String, _ screen: String, _ more: [String] = []) {
    let app = launch(["-v2", "NO"] + more)
    open(app, query, name)
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 10), "\(screen) didn't open")
    ends(app, screen)
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
