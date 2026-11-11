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

  /// An app left open doesn't keep its first index until iOS ends it (the owner, 11 Nov: the longer lists, on the site that
  /// evening, didn't show). Back in front once the index in use is older than `HandbookModel.staleAfter` (3 s here), it's
  /// read again: a fish the site added meanwhile (`-index-changes-after`: a read 15 s after the one before finds it) comes
  /// first on the shelf, the shelf there all along and the page where the reader left it.
  func testBackInFrontAfterAWhileTheShelvesAreTheSitesCurrentOnes() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults",
                           "-index-stale-after", "3", "-index-changes-after", "15"]
    app.launchForFlow()
    app.openTab("Khám phá")
    let heading = app.staticTexts["Loài quen thuộc"].firstMatch
    XCTAssertTrue(heading.waitForExistence(timeout: 10), "no Loài quen thuộc")
    for _ in 0..<8 where heading.frame.minY > app.frame.height * 0.3 {
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.8))
      let by = min(heading.frame.minY - app.frame.height * 0.2, app.frame.height * 0.5)
      from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: -by)), withVelocity: .slow, thenHoldForDuration: 0.3)
    }
    let added = app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", "Cá mới đến", "Cá mới đến,")).firstMatch
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch.exists, "the shelf isn't the fixture's")
    XCTAssertFalse(added.exists, "the added fish on the shelf before the site added it")
    let at = heading.frame.minY
    // Away long enough for the site's change, the index read when Khám phá showed now older than its age.
    Thread.sleep(forTimeInterval: 16)
    XCUIDevice.shared.press(.home)
    sleep(1)
    app.activate()
    XCTAssertTrue(heading.waitForExistence(timeout: 3) && heading.isHittable, "the shelf went on coming back")
    XCTAssertTrue(added.waitForExistence(timeout: 10), "back in front, the shelf is still the index read before the app left")
    XCTAssertEqual(heading.frame.minY, at, accuracy: 2, "the page moved while the index was read again")
    XCTAssertTrue(app.tabBars.buttons["Khám phá"].isSelected, "not on Khám phá any more")
  }
}
