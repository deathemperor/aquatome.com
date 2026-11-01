import XCTest

/// A fish's facts above its page (FactsCard.swift), from the handbook's index on the phone: there without the network
/// (the fixed index; the page itself may never load in a test).
final class FactsCardFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAFishPageShowsItsFactsAsTheSiteWritesThem() {
    let app = launch()
    open(app, "Ca neon")
    let card = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(card.waitForExistence(timeout: 5), "no facts card")
    let facts = card.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.label }
    XCTAssertEqual(facts, ["Kích thước, 4 cm", "Nhiệt độ, 20–26°C", "pH, 5–7", "Bể tối thiểu, 60 cm", "Tính cách, Hiền", "Độ khó, Dễ"])
  }

  func testAFishWithoutATemperamentShowsWhatItHas() {
    let app = launch()
    open(app, "Ca dia")
    let card = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    let facts = card.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.label }
    XCTAssertEqual(facts, ["Kích thước, 15 cm", "Nhiệt độ, 28–31°C", "pH, 4,5–6,5", "Bể tối thiểu, 120 cm", "Độ khó, Khó"])
  }

  func testOtherPagesHaveNoCard() {
    let app = launch()
    open(app, "Rotala")
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.descendants(matching: .any)["facts-card"].exists, "a card on a plant")
  }

  // MARK: Helpers

  private func launch() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"]
    app.launch()
    return app
  }

  /// A page from the Tìm tab, searched without accents (the simulator's keyboard sometimes drops them).
  private func open(_ app: XCUIApplication, _ query: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let row = app.descendants(matching: .any).matching(identifier: "item").firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "nothing found for \(query)")
    row.tap()
  }
}
