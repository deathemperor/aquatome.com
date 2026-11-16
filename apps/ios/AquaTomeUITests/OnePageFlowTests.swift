import XCTest

/// Every tile and card on Tìm and Khám phá that opens a page opens that one page, and one Back comes back to where it was
/// tapped (the owner, 16 Nov: a tap on any of Tìm's Thiết bị tiles opened all nine kinds of kit, "Thức ăn" on top, and
/// Back walked down through every one of them to Tìm). Each grid and each row of cards, its first and its last.
final class OnePageFlowTests: XCTestCase {
  // Every grid is tried and named, not only the first that fails.
  override func setUp() { continueAfterFailure = true }

  func testEachTileAndCardOnTimOpensOnePage() {
    let app = launch()
    app.openTab("Tìm kiếm")
    XCTAssertTrue(app.handbookShown(timeout: 10), "no handbook on Tìm")
    let any = app.descendants(matching: .any)
    // The tools, then each shelf's chips and picks, the video series, Thiết bị's nine tiles, top to bottom.
    opensOnePage(app, any.matching(identifier: "tool-tile").firstMatch, "a tool's tile")
    opensOnePage(app, any.matching(identifier: "shelf").firstMatch, "a shelf's chip")
    opensOnePage(app, any.matching(identifier: "item").firstMatch, "a shelf's first pick")
    opensOnePage(app, any.matching(identifier: "series").firstMatch, "a video series' card")
    let kit = any.matching(identifier: "kit")
    opensOnePage(app, kit.element(boundBy: 0), "Thiết bị's first tile", named: "Bể cá")
    opensOnePage(app, kit.element(boundBy: 4), "Thiết bị's middle tile", named: "Nền và lá")
    opensOnePage(app, kit.element(boundBy: 8), "Thiết bị's last tile", named: "Thức ăn")
  }

  func testEachTileAndCardOnKhamPhaOpensOnePage() {
    let app = launch()
    app.openTab("Khám phá")
    XCTAssertTrue(app.staticTexts["Loài quen thuộc"].firstMatch.waitForExistence(timeout: 10), "no Khám phá")
    func button(_ name: String) -> XCUIElement {
      app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", name, name + ",")).firstMatch
    }
    // A shelf's fish, a video series, Thiết bị's first column (its others a swipe away).
    opensOnePage(app, button("Cá neon"), "Loài quen thuộc's first fish")
    opensOnePage(app, button("Rêu hại từ A đến Z"), "a video series")
    opensOnePage(app, button("Bể cá"), "Thiết bị's first kind", named: "Bể cá")
    opensOnePage(app, button("Sưởi và làm mát"), "Thiết bị's third kind", named: "Sưởi và làm mát")
  }

  private func launch() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-kit", "-series", "9"]
    app.launchForFlow(.v2)
    return app
  }

  /// `e`, scrolled to and tapped, opens one page (`named`, where the page says its name), and one Back comes back to it.
  private func opensOnePage(_ app: XCUIApplication, _ e: XCUIElement, _ what: String, named: String? = nil,
                            file: StaticString = #filePath, line: UInt = #line) {
    app.scrolledDown(to: e)
    guard e.exists, e.isHittable else { return XCTFail("\(what): not on the screen", file: file, line: line) }
    e.tap()
    guard app.pageBack.waitForExistence(timeout: 5) else { return XCTFail("\(what): opened no page", file: file, line: line) }
    if let named {
      // The page's title (`navigationTitle`, the bar's name for it even where the bar shows its own item): a kind of kit
      // with no shard of its own in the fixture opens as the web page, offline, so its heading may never come.
      let bar = app.navigationBars[named]
      let heading = app.staticTexts[named].firstMatch
      XCTAssertTrue(bar.waitForExistence(timeout: 5) || heading.exists,
                    "\(what): opened \(app.navigationBars.firstMatch.identifier), not \(named)", file: file, line: line)
    }
    app.pageBack.tap()
    XCTAssertTrue(e.waitForExistence(timeout: 5) && e.isHittable, "\(what): one Back didn't come back to it", file: file, line: line)
    // A second page under the first leaves a Back button after one Back.
    XCTAssertFalse(app.pageBack.waitForExistence(timeout: 1), "\(what): opened more than one page", file: file, line: line)
    // Back to where it was, whatever it opened, for the next.
    for _ in 0..<12 where app.pageBack.exists { app.pageBack.tap() }
  }
}
