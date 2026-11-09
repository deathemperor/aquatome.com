import XCTest

/// The site with its Vietnamese pages at the root ("/ca/ca-neon/", "/vi/…" sent there): the fixed handbook in that form
/// (`-vi-at-root`), every path and link in it without "/vi" but one card's. The handbook's other flows read it under
/// "/vi/".
final class ViAtRootFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAFishFromSearchOpensDrawnByTheApp() {
    let app = launch()
    open(app, "ca neon", "Cá neon")
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the fish didn't open")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not drawn by the app")
  }

  func testALinkInAPageOpensItsPage() {
    let app = launch()
    openGuide(app)
    let neon = app.links["neon"].firstMatch
    reveal(app, neon)
    neon.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the link didn't open the fish")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not drawn by the app")
  }

  /// A card still linking under "/vi/" (a page kept from before the change) opens the app's page for it, not the web.
  func testALinkStillUnderViOpensThePageDrawnByTheApp() {
    let app = launch()
    open(app, "reu hai tu a", "Rêu hại từ A đến Z")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the series isn't drawn by the app")
    let card = app.descendants(matching: .any).matching(identifier: "card").matching(NSPredicate(format: "label CONTAINS 'Cách hạn chế rêu hại'")).firstMatch
    reveal(app, card)
    card.tap()
    XCTAssertTrue(app.navigationBars["Cách hạn chế rêu hại"].waitForExistence(timeout: 5), "the card didn't open its guide")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the web page, not the app's")
  }

  /// "/nhom/tetras/": the app's shelf of the group, not its web page.
  func testAGroupNamedInAPageOpensTheAppsShelfOfIt() {
    let app = launch()
    open(app, "ca neon", "Cá neon")
    let group = app.links["cá tetra"].firstMatch
    reveal(app, group)
    group.tap()
    XCTAssertTrue(app.navigationBars["Cá tetra"].waitForExistence(timeout: 5), "not the group's shelf")
    XCTAssertFalse(app.descendants(matching: .any)["page"].exists, "the group's web page")
  }

  /// "/cong-cu/be-cua-toi/" among the pages a guide names: the tanks tab, not the site's page.
  func testTheMyTanksToolOpensTheTanksTab() {
    let app = launch()
    openGuide(app)
    let tool = app.descendants(matching: .any)["native-page"].buttons.matching(NSPredicate(format: "label BEGINSWITH 'Bể của tôi'")).firstMatch
    reveal(app, tool)
    tool.tap()
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "not the tanks tab")
  }

  /// "/cong-cu/den-chihiros/" from search: the lights tab.
  func testTheChihirosToolOpensTheLightsTab() {
    let app = launch()
    open(app, "chihiros", "Đèn Chihiros")
    XCTAssertTrue(app.buttons["scan"].waitForExistence(timeout: 5), "not the lights tab")
  }

  /// A guide saved and read while the site had its pages under "/vi/", then the app opened once the index has them at
  /// the root: still saved and read, listed, and opening.
  func testAReadingListSavedUnderViShowsAndOpensOnceTheIndexIsAtTheRoot() {
    var app = launch(atRoot: false)
    openGuide(app)
    app.buttons["save-for-later"].tap()
    XCTAssertEqual(app.buttons["save-for-later"].label, "Bỏ lưu", "not saved")
    app.terminate()

    app = launch(reset: false)
    let read = app.descendants(matching: .any)["recent"].descendants(matching: .any).matching(identifier: "item")
    XCTAssertTrue(read.matching(NSPredicate(format: "label BEGINSWITH 'Nuôi cá neon'")).firstMatch.waitForExistence(timeout: 5), "not listed as read")
    let saved = app.descendants(matching: .any)["all-saved"].firstMatch
    XCTAssertTrue(saved.exists && saved.label.contains("1"), "not listed as saved")
    saved.tap()
    app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Nuôi cá neon'")).firstMatch.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the saved guide didn't open")
    XCTAssertEqual(app.buttons["save-for-later"].label, "Bỏ lưu", "not saved at its new path")
  }

  // MARK: Helpers

  private func launch(atRoot: Bool = true, reset: Bool = true) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-v2", "NO"]
      + (atRoot ? ["-vi-at-root"] : []) + (reset ? ["-reset-defaults"] : [])
    app.launch()
    return app
  }

  /// A search's row by its name, opened.
  private func open(_ app: XCUIApplication, _ query: String, _ name: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no \(name)")
    row.tap()
  }

  private func openGuide(_ app: XCUIApplication) {
    open(app, "nuoi ca neon", "Nuôi cá neon")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the guide isn't drawn by the app")
  }

  /// Scrolled into view half a screen at a time, as NativePageFlowTests does.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    repeatUntil(e.exists && e.isHittable, times: 24) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .fast,
               thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
