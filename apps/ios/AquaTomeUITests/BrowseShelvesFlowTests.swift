import XCTest

/// Khám phá's shelves as long as their lists: 24 well-known fish, in columns of three that page sideways.
final class BrowseShelvesFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// "Loài quen thuộc" pages sideways to its last column, which holds its 24th fish and no 25th. The fixture's two
  /// featured fish have no photo, so the top takes neither: the shelf is them, then "Cá quen 1" to "Cá quen 22".
  func testTheFamiliarFishShelfRunsToIts24thFish() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-familiar", "30"]
    app.launchForFlow()
    app.openTab("Khám phá")
    let heading = app.staticTexts["Loài quen thuộc"]
    XCTAssertTrue(heading.waitForExistence(timeout: 10), "no Loài quen thuộc")
    for _ in 0..<6 where heading.frame.minY > app.frame.height * 0.3 { app.swipeUp(velocity: .slow) }
    func fish(_ name: String) -> XCUIElement {
      app.buttons.matching(NSPredicate(format: "label == %@ OR label BEGINSWITH %@", name, name + ",")).firstMatch
    }
    XCTAssertTrue(fish("Cá neon").waitForExistence(timeout: 5), "the shelf doesn't start with the site's first fish")
    // Its first row, swiped from right to left a column at a time.
    let row = heading.frame.maxY + 50
    let last = fish("Cá quen 22")
    for _ in 0..<12 where !(last.exists && last.isHittable) {
      app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.width * 0.85, dy: row))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: app.frame.width * 0.15, dy: row)),
               withVelocity: .default, thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(last.exists && last.isHittable, "no 24th fish at the shelf's end")
    XCTAssertFalse(fish("Cá quen 23").exists, "a 25th fish on the shelf")
  }
}
