import XCTest

/// The handbook tab on a small fixed index (`-fixed-handbook`, HandbookIndex.fixture): searching and browsing work
/// without the network, the same way each run.
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

  func testBrowsesOneKind() {
    let app = launch()
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    app.buttons["kind"].tap()
    app.buttons["Cây"].tap()
    XCTAssertTrue(item(app, "Rotala đỏ").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cá đĩa").exists)
  }

  func testTheChihirosToolOpensTheLightsTab() {
    let app = launch()
    search(app, "chihiros")
    item(app, "Đèn Chihiros").tap()
    XCTAssertTrue(app.buttons["scan"].waitForExistence(timeout: 5), "the Lights tab")
  }

  func testAPageOpensInTheApp() {
    let app = launch()
    item(app, "Cá neon").tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.descendants(matching: .any)["page"].exists)
  }

  // MARK: Helpers

  private func launch() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"]
    app.launch()
    return app
  }

  private func search(_ app: XCUIApplication, _ text: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(text)
  }

  /// A result row, by its name (the row reads its name, then its scientific name or kind).
  private func item(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
  }
}
