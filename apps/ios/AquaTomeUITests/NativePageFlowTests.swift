import XCTest

/// A guide the app draws itself from the site's blocks (NativePage), from the fixed pages (no network): its parts, its
/// links into the app, a word's tip, the sources its credit points to, and the web page for a part it can't draw.
final class NativePageFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAGuideIsDrawnByTheAppNotTheWebPage() {
    let app = openGuide()
    XCTAssertTrue(app.staticTexts["Tóm tắt nhanh"].exists, "no summary")
    XCTAssertTrue(app.staticTexts["Bể và nước"].exists, "no heading")
    XCTAssertTrue(app.staticTexts["Chăm sóc · đọc khoảng 4 phút"].exists, "no header line")
    // A list numbered, a table as lines under its columns' names, the answers under their questions, the sources.
    XCTAssertTrue(text(app, "2. Cây thủy sinh và lũa.").exists, "no numbered list")
    XCTAssertTrue(text(app, "Mức: 20–26°C").exists, "no table under its columns' names")
    XCTAssertTrue(text(app, "Nuôi mấy con?\nTừ 6 con trở lên.").exists, "no answer under its question")
    XCTAssertTrue(app.links["Neon tetra care"].exists, "no sources")
    XCTAssertFalse(app.descendants(matching: .any)["page"].exists, "the web page")
  }

  /// Every part VoiceOver lands on says what it is: no picture read as an empty or dimmed button.
  func testEveryPartSaysWhatItIs() throws {
    let app = openGuide()
    try app.performAccessibilityAudit(for: .sufficientElementDescription)
  }

  /// Opened before the index says the app draws guides (`-pages-later`): the web page for this visit, not a spinner
  /// once it says so; opened again, drawn by the app.
  func testAGuideOpenedBeforeTheAppDrawsItsKindStaysOnTheWebPage() {
    let app = launch("-pages-later")
    openRow(app, "nuoi ca neon")
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "not the web page")
    // The index says so a second after the page opens.
    let after = Date().addingTimeInterval(3)
    while Date() < after { RunLoop.current.run(until: Date().addingTimeInterval(0.2)) }
    XCTAssertTrue(app.descendants(matching: .any)["page"].exists, "the web page went away")
    XCTAssertFalse(app.activityIndicators.firstMatch.exists, "a spinner")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.descendants(matching: .any).matching(identifier: "item").firstMatch.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not drawn by the app the next time")
  }

  /// From the tanks tab, a link in a guide pushes its page on the tanks tab, not on the Tìm tab.
  func testALinkFromTheTanksTabOpensOnTheTanksTab() {
    let app = launch("-seed-tanks", "life") // "Bể cá neon": a guide names its neons
    app.tabBars.buttons["Bể của tôi"].tap()
    app.buttons["tank"].firstMatch.tap()
    let guide = app.buttons.matching(identifier: "tank-guide").firstMatch
    for _ in 0..<6 where !(guide.exists && guide.isHittable) { app.swipeUp() }
    guide.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the guide isn't drawn by the app")
    app.links["neon"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the link didn't open the fish")
    XCTAssertTrue(app.tabBars.buttons["Bể của tôi"].isSelected, "not on the tanks tab")
  }

  /// A tool among the pages a guide names opens the app's own screen for it, as in search: not its web page first, left
  /// on the Tìm tab.
  func testAToolItNamesOpensItsTab() {
    let app = openGuide()
    // In the page, not the tab bar's button of the same name.
    let tool = app.descendants(matching: .any)["native-page"].buttons.matching(NSPredicate(format: "label BEGINSWITH 'Bể của tôi'")).firstMatch
    reveal(app, tool)
    tool.tap()
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "not the tanks tab")
    app.tabBars.buttons["Tìm"].tap()
    XCTAssertTrue(app.navigationBars["Nuôi cá neon trong bể nhỏ"].waitForExistence(timeout: 5), "the tool's web page was pushed on the Tìm tab")
  }

  func testAPageItNamesOpensInTheAppAndOneTheIndexLacksIsLeftOut() {
    let app = openGuide()
    let fish = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    reveal(app, fish)
    XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label CONTAINS 'khong-co'")).count, 0)
    fish.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the fish didn't open")
    XCTAssertTrue(app.descendants(matching: .any)["facts-card"].waitForExistence(timeout: 5), "not the fish's page")
  }

  func testALinkInTheTextOpensItsPageOnTheSameTab() {
    let app = openGuide()
    app.links["neon"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the link didn't open the fish")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Nuôi cá neon trong bể nhỏ"].waitForExistence(timeout: 5), "not back on the guide")
  }

  func testAWordsTipShowsWhatItMeans() {
    let app = openGuide()
    app.links["pH"].firstMatch.tap()
    let alert = app.alerts["Đệm pH"]
    XCTAssertTrue(alert.waitForExistence(timeout: 5), "no tip")
    XCTAssertTrue(alert.staticTexts["Khả năng giữ pH của nước khi có thêm axit."].exists)
    alert.buttons["Xem thêm"].tap()
    XCTAssertTrue(app.navigationBars["Đệm pH"].waitForExistence(timeout: 5), "the word's page didn't open")
  }

  func testTheCreditsSourcesLinkScrollsToTheSources() {
    let app = openGuide()
    let sources = app.staticTexts["Nguồn tham khảo"]
    XCTAssertFalse(sources.exists && sources.isHittable, "already in view: the test proves nothing")
    app.links["2 nguồn"].firstMatch.tap()
    XCTAssertTrue(sources.waitForExistence(timeout: 5))
    let deadline = Date().addingTimeInterval(3)
    while !sources.isHittable && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
    XCTAssertTrue(sources.isHittable, "the sources aren't in view")
  }

  func testAPartItCantDrawOpensTheWebPage() {
    let app = openGuide()
    let web = app.buttons["page-web"]
    reveal(app, web)
    // Two parts in a row it can't draw: one offer of the web page.
    XCTAssertEqual(app.buttons.matching(identifier: "page-web").count, 1)
    web.tap()
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "no web page")
    XCTAssertFalse(app.descendants(matching: .any)["native-page"].exists)
  }

  // MARK: Helpers

  private func launch(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"] + more
    app.launch()
    return app
  }

  private func openRow(_ app: XCUIApplication, _ query: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let row = app.descendants(matching: .any).matching(identifier: "item").firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no guide")
    row.tap()
  }

  private func openGuide() -> XCUIApplication {
    let app = launch()
    openRow(app, "nuoi ca neon")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the guide isn't drawn by the app")
    return app
  }

  private func text(_ app: XCUIApplication, _ s: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
  }

  /// Scrolled into view: the page is longer than the screen.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    for _ in 0..<8 where !(e.exists && e.isHittable) { app.swipeUp() }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
