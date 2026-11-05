import XCTest

/// A fish's facts on its page, under its name (FactsCard.swift), as the site's data card has them (DataCard.astro), from the
/// handbook's index on the phone: there without the network (the fixed index), and a plant's care.
final class FactsCardFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// The site's seven in its order (the lifespan after the size, in years), the difficulty as its badge reads to a screen
  /// reader ("Độ khó 2/8: dễ"), three to a row.
  func testAFishPageShowsItsFactsAsTheSiteWritesThem() {
    let app = launch()
    open(app, "Ca neon")
    let card = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(card.waitForExistence(timeout: 5), "no facts card")
    let facts = card.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.label }
    XCTAssertEqual(facts, ["Nhiệt độ, 20–26°C", "pH, 5–7", "Độ cứng (dGH), 1–2", "Kích thước, 4 cm", "Tuổi thọ, 5–10 năm", "Bể tối thiểu, 60 cm",
                           "Độ khó 2/8: dễ"])
    // Three to a row, then two and two: the last not alone on its row.
    let rows = card.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.frame.minY }
    XCTAssertEqual(rows[2], rows[0], accuracy: 1)
    XCTAssertGreaterThan(rows[3], rows[2])
    XCTAssertEqual(rows[4], rows[3], accuracy: 1)
    XCTAssertEqual(rows[6], rows[5], accuracy: 1, "the difficulty alone on its row")
  }

  /// No lifespan (none of its sources states one) and no hardness: no row for either, and nothing in their place.
  func testAFishMissingAFigureShowsWhatItHas() {
    let app = launch()
    open(app, "Ca dia")
    let card = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(card.waitForExistence(timeout: 5))
    let facts = card.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.label }
    XCTAssertEqual(facts, ["Nhiệt độ, 28–31°C", "pH, 4,5–6,5", "Kích thước, 15 cm", "Bể tối thiểu, 120 cm", "Độ khó 7/8: khó"])
  }

  /// As on the site, the sources behind each figure ("Nguồn và độ tin cậy") and the line naming whose text it is sit
  /// under the card, once each, before the page's first heading: not above the card, nor at the end of the page.
  func testTheSourcesAndTheCreditSitUnderTheCard() {
    let app = launch()
    open(app, "Ca neon")
    let card = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(card.waitForExistence(timeout: 5), "no facts card")
    let sources = app.descendants(matching: .any).matching(identifier: "page-more")
    XCTAssertEqual(sources.count, 1, "the sources shown \(sources.count) times")
    let credit = app.staticTexts["Dịch và tổng hợp từ Seriously Fish. Cập nhật 2026-10-28."]
    XCTAssertTrue(credit.exists, "no credit line")
    let heading = app.staticTexts["Tóm tắt nhanh"]
    XCTAssertTrue(heading.exists, "no first heading")
    XCTAssertGreaterThanOrEqual(sources.firstMatch.frame.minY, card.frame.maxY - 1, "the sources above the card")
    XCTAssertGreaterThanOrEqual(credit.frame.minY, sources.firstMatch.frame.maxY - 1, "the credit above the sources")
    XCTAssertLessThan(credit.frame.maxY, heading.frame.minY, "the credit after the page's first heading")
    // Tapped, each figure's sources.
    let toggle = sources.firstMatch
    for _ in 0..<4 where !toggle.isHittable { app.swipeUp() }
    toggle.tap()
    let opened = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Seriously Fish: 20–26°C")).firstMatch
    XCTAssertTrue(opened.waitForExistence(timeout: 2), "the sources behind a figure don't open")
    XCTAssertTrue(opened.label.contains("Tuổi thọ\nSeriously Fish"), "no sources for the lifespan: \(opened.label)")
  }

  /// A lifespan of one figure (min = max), in months: one number, written as the site writes it ("3,5 năm"). Here over
  /// its web page (the fixed pages have none of its own), as a row.
  func testALifespanOfOneFigureShowsOneNumber() {
    let app = launch()
    open(app, "Ca ngua van")
    let row = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no facts row")
    let facts = row.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.label }
    XCTAssertEqual(facts, ["Tuổi thọ, 3,5 năm"])
  }

  /// Over a web page (the site's fish pages not drawn by the app), the facts as a row across its top, the difficulty
  /// as the same badge.
  func testOverAWebPageTheRowShowsTheDifficultyAsTheCardDoes() {
    let app = launch(more: "-pages-count", "1")
    open(app, "Ca dia")
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "not the web page")
    let row = app.descendants(matching: .any)["facts-card"]
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no facts row")
    let facts = row.descendants(matching: .any).matching(identifier: "fact").allElementsBoundByIndex.map { $0.label }
    XCTAssertEqual(facts, ["Nhiệt độ, 28–31°C", "pH, 4,5–6,5", "Kích thước, 15 cm", "Bể tối thiểu, 120 cm", "Độ khó 7/8: khó"])
    XCTAssertFalse(app.descendants(matching: .any)["page-more"].exists, "the sources over the web page, which has its own")
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

  private func launch(language: String = "vi", locale: String = "vi_VN", more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale, "-reset-defaults", "-fixed-handbook"] + more
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
