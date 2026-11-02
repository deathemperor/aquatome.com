import XCTest

/// A fish's facts on its page, under its name (FactsCard.swift), from the handbook's index on the phone: there without the network
/// (the fixed index), and a plant's care.
final class FactsCardFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAFishPageShowsItsFactsAsTheSiteWritesThem() {
    let app = launch()
    open(app, "Ca neon")
    let card = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(card.waitForExistence(timeout: 5), "no facts card")
    let facts = card.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.label }
    XCTAssertEqual(facts, ["Kích thước, 4 cm", "Nhiệt độ, 20–26°C", "pH, 5–7", "Độ cứng (dGH), 1–2", "Bể tối thiểu, 60 cm", "Tính cách, Hiền", "Độ khó, Dễ"])
  }

  func testAFishWithoutATemperamentShowsWhatItHas() {
    let app = launch()
    open(app, "Ca dia")
    let card = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    let facts = card.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.label }
    XCTAssertEqual(facts, ["Kích thước, 15 cm", "Nhiệt độ, 28–31°C", "pH, 4,5–6,5", "Bể tối thiểu, 120 cm", "Độ khó, Khó"])
  }

  /// On a phone in English with a US region the handbook is the Vietnamese one, and its numbers are written the
  /// Vietnamese way, as on the page below, not the region's way ("4.5").
  func testNumbersFollowThePagesLanguageNotThePhonesRegion() {
    let app = launch(language: "en", locale: "en_US")
    open(app, "Ca dia")
    let card = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    let facts = card.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.label }
    XCTAssertTrue(facts.contains("pH, 4,5–6,5"), "\(facts)")
  }

  /// A plant's care, as its page lists it, in the index's words: not the temperature the fixed index also has for it.
  func testAPlantShowsItsCareNotAFishsFigures() {
    let app = launch()
    open(app, "Rotala")
    let card = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(card.waitForExistence(timeout: 5), "no care card")
    let facts = card.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.label }
    XCTAssertEqual(facts, ["Độ khó, Trung bình", "Ánh sáng, Mạnh", "CO₂, Tùy chọn", "Tốc độ mọc, Nhanh", "Vị trí, Hậu cảnh"])
  }

  // MARK: Helpers

  private func launch(language: String = "vi", locale: String = "vi_VN") -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale, "-reset-defaults", "-fixed-handbook"]
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
