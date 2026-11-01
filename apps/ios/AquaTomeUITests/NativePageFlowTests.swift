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
    XCTAssertFalse(app.descendants(matching: .any)["page"].exists, "the web page")
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
    XCTAssertEqual(app.buttons.matching(identifier: "page-web").count, 1)
    web.tap()
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "no web page")
    XCTAssertFalse(app.descendants(matching: .any)["native-page"].exists)
  }

  // MARK: Helpers

  private func openGuide() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"]
    app.launch()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("nuoi ca neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no guide")
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the guide isn't drawn by the app")
    return app
  }

  /// Scrolled into view: the page is longer than the screen.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    for _ in 0..<8 where !(e.exists && e.isHittable) { app.swipeUp() }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
