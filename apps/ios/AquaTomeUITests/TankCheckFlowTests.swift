import XCTest

/// "Nuôi chung" on a tank (TankCheckView.swift): its fish checked by the site's own tank-mates code, so the app says what
/// the site's tool says for the same fish and tank (protocols/tankmates-vectors.json holds the code to it).
final class TankCheckFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testWarnsWhenTheFishDontGoTogetherAndTheTankIsTooSmall() {
    let app = launch("-seed-tanks", "clash") // 60 × 30 × 36 cm: 2 discus, 12 neons
    let verdict = app.descendants(matching: .any)["verdict"]
    XCTAssertTrue(reveal(app, verdict), "no verdict")
    XCTAssertTrue(verdict.label.contains("Không nên nuôi chung: Cá đĩa có thể ăn Cá neon; nhiệt độ không có khoảng chung."), verdict.label)
    XCTAssertTrue(text(app, "Cá đĩa (15 cm) có thể ăn Cá neon (4 cm).").exists, "no warning")
    XCTAssertTrue(app.descendants(matching: .any)["stocking"].label.contains("188% · Quá tải"), "not overstocked")
    XCTAssertTrue(reveal(app, text(app, "Cá đĩa cần bể dài từ 120 cm.")), "the tank isn't said to be too short")
  }

  func testTheCheckFollowsTheFish() {
    let app = launch("-seed-tanks", "clash")
    let discus = app.descendants(matching: .any).matching(identifier: "life").matching(NSPredicate(format: "label CONTAINS 'Cá đĩa'")).firstMatch
    XCTAssertTrue(discus.waitForExistence(timeout: 5))
    discus.swipeLeft()
    app.buttons["Xóa"].tap()
    // One kind of fish left: nothing to compare, and the neons fit the tank. (The check drawn first: an answer far below
    // the screen isn't, so its absence there would prove nothing.)
    XCTAssertTrue(reveal(app, app.descendants(matching: .any)["stocking"]), "no stocking")
    XCTAssertTrue(app.descendants(matching: .any)["verdict"].waitForNonExistence(timeout: 5), "a verdict for one fish")
    XCTAssertTrue(app.descendants(matching: .any)["stocking"].label.contains("44% · Còn thưa"), app.descendants(matching: .any)["stocking"].label)
    XCTAssertTrue(reveal(app, app.buttons["delete"]), "the end of the tank not reached") // past the check's notes
    XCTAssertFalse(text(app, "cần bể dài").exists)
  }

  func testATankWithNoSizeSaysTheTankItsFishNeedAndWhatItCouldntCheck() {
    let app = launch("-seed-tanks", "life") // 12 neons and a fish the handbook doesn't have, no size
    // The fish the handbook doesn't have is in the check, with nothing known: not left out for a sure answer. (Top to
    // bottom: reveal only scrolls down.)
    let verdict = app.descendants(matching: .any)["verdict"]
    XCTAssertTrue(reveal(app, verdict), "the unknown fish left out")
    XCTAssertTrue(verdict.label.contains("chưa đủ dữ liệu để chắc") && verdict.label.contains("loai-chua-co-trang"), verdict.label)
    XCTAssertTrue(reveal(app, text(app, "Bể dài tối thiểu cho cả nhóm: 60 cm.")))
    XCTAssertTrue(reveal(app, app.buttons["delete"]), "the end of the tank not reached") // past where a meter would be
    XCTAssertFalse(app.descendants(matching: .any)["stocking"].exists)
  }

  // MARK: Helpers

  private func launch(_ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults"] + args
    app.launch()
    app.tabBars.buttons["Bể của tôi"].tap()
    app.buttons["tank"].firstMatch.tap()
    return app
  }

  /// The check comes after the tank's fish and plants: scrolls down until an element of it is drawn (the list draws only
  /// rows near the screen) and says whether it's there. Only down: reveal from the top of the screen to the bottom.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) -> Bool {
    if e.waitForExistence(timeout: 5) && e.isHittable { return true }
    for _ in 0..<4 where !(e.exists && e.isHittable) { app.swipeUp() }
    return e.exists
  }

  private func text(_ app: XCUIApplication, _ part: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", part)).firstMatch
  }
}
