import XCTest

/// Khám phá's shelves as long as the App Store's, seven columns at most: 21 well-known fish, in columns of three that page
/// sideways.
final class BrowseShelvesFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// "Loài quen thuộc" pages sideways to its seventh and last column, which holds its 21st fish and no 22nd. The
  /// fixture's two featured fish have no photo, so the top takes neither: the shelf is them, then "Cá quen 1" to
  /// "Cá quen 19".
  func testTheFamiliarFishShelfRunsToIts21stFish() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-familiar", "30"]
    app.launchForFlow()
    app.openTab("Khám phá")
    let heading = app.staticTexts["Loài quen thuộc"].firstMatch
    XCTAssertTrue(heading.waitForExistence(timeout: 10), "no Loài quen thuộc")
    // The page dragged up by what's left to bring the shelf near the top, so its heading stays on screen (a swipe
    // flings past it on a short page).
    for _ in 0..<8 where heading.frame.minY > app.frame.height * 0.3 {
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.8))
      let by = min(heading.frame.minY - app.frame.height * 0.2, app.frame.height * 0.5)
      from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: -by)), withVelocity: .slow, thenHoldForDuration: 0.3)
    }
    func fish(_ name: String) -> XCUIElement {
      app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", name, name + ",")).firstMatch
    }
    let first = fish("Cá neon")
    XCTAssertTrue(first.waitForExistence(timeout: 5) && first.isHittable, "the shelf doesn't start with the site's first fish")
    // Its first row, swiped from right to left a column at a time.
    let row = first.frame.midY
    // On screen by its frame: one in the next column, past the edge, exists but has no point to tap.
    let last = fish("Cá quen 19")
    let shown = { last.exists && app.frame.contains(last.frame) }
    for _ in 0..<12 where !shown() {
      app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.width * 0.85, dy: row))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.width * 0.15, dy: row)),
               withVelocity: .default, thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(shown(), "no 21st fish at the shelf's end")
    XCTAssertFalse(fish("Cá quen 20").exists, "a 22nd fish on the shelf: more than seven columns")
  }
}
