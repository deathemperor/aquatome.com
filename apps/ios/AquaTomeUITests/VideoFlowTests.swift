import XCTest

/// A guide's video plays in its page, in YouTube's own player (PagePlayer), not in the YouTube app: nothing of the player
/// before play is pressed, then the player where the thumbnail was, a chapter seeking it, full screen and back with the
/// same player playing on. UI tests read no network: the player's page gets a stand-in for YouTube's script that shows
/// what it was asked, a line each.
final class VideoFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAVideoPlaysInThePageAndAChapterSeeksIt() throws {
    let app = openGuide()
    let page = app.descendants(matching: .any)["native-page"]
    XCTAssertEqual(app.webViews.count, 0, "the player loaded before play was pressed")
    XCTAssertTrue(app.links["Xem trên YouTube"].exists, "no way to the video on YouTube")
    let play = app.buttons["Phát video: Hạn chế rêu hại"]
    XCTAssertTrue(play.exists, "no thumbnail to play")
    play.tap()
    // A web view's first start can take a while on a slow runner.
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 0 · vi · https://www.youtube-nocookie.com").waitForExistence(timeout: 15),
                  "not YouTube's player from the start, with Vietnamese captions, from youtube-nocookie.com")
    XCTAssertEqual(app.state, .runningForeground, "left the app")
    XCTAssertTrue(page.descendants(matching: .any)["video-player"].webViews.firstMatch.exists, "the player isn't in the page where the video was")
    XCTAssertFalse(play.exists, "the thumbnail still over the player")
    XCTAssertTrue(app.links["Xem trên YouTube"].exists, "no way to the video on YouTube beside the player")
    let chapter = app.links.matching(NSPredicate(format: "label CONTAINS %@", "1:35  Ánh sáng và CO₂")).firstMatch
    XCTAssertTrue(chapter.exists, "no chapter")
    chapter.tap()
    XCTAssertTrue(asked(app, "seek 95").waitForExistence(timeout: 5), "the chapter didn't seek the player")
    XCTAssertEqual(players(app), 1, "a second player")
    XCTAssertEqual(app.state, .runningForeground, "left the app")
    // The player and its controls each say what they are to VoiceOver.
    try app.performAccessibilityAudit(for: .sufficientElementDescription)
  }

  /// A chapter tapped before play: the player starts at its time.
  func testAChapterStartsThePlayerAtItsTime() {
    let app = openGuide()
    app.links.matching(NSPredicate(format: "label CONTAINS %@", "1:35  Ánh sáng và CO₂")).firstMatch.tap()
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 95").waitForExistence(timeout: 15), "the player didn't start at the chapter")
  }

  /// Full screen is the same player, not a new one: what it was asked before is still there; closed, it's back in the
  /// page, still that player.
  func testFullScreenKeepsThePlayerAndClosesBackToThePage() {
    let app = openGuide()
    app.buttons["Phát video: Hạn chế rêu hại"].tap()
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 0").waitForExistence(timeout: 15), "no player")
    app.links.matching(NSPredicate(format: "label CONTAINS %@", "1:35  Ánh sáng và CO₂")).firstMatch.tap()
    XCTAssertTrue(asked(app, "seek 95").waitForExistence(timeout: 5), "the chapter didn't seek the player")
    app.buttons["video-full"].tap()
    let full = app.descendants(matching: .any)["video-full-screen"]
    XCTAssertTrue(full.waitForExistence(timeout: 5), "not full screen")
    XCTAssertTrue(full.webViews.staticTexts["seek 95"].waitForExistence(timeout: 5), "full screen loaded the video again")
    XCTAssertFalse(app.descendants(matching: .any)["video-player"].webViews.firstMatch.exists, "the player left in the page too")
    // Swiped down on the video, it closes.
    let video = full.webViews.firstMatch
    video.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
      .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95)))
    XCTAssertTrue(full.waitForNonExistence(timeout: 5), "swiping down didn't close full screen")
    let page = app.descendants(matching: .any)["native-page"]
    let player = page.descendants(matching: .any)["video-player"]
    XCTAssertTrue(player.webViews.staticTexts["seek 95"].waitForExistence(timeout: 5), "back in the page, not the same player")
    XCTAssertFalse(player.webViews.staticTexts["paused"].exists, "full screen paused the video")
    XCTAssertEqual(players(app), 1, "a second player")
  }

  // MARK: Helpers

  /// Web views in the app with a player in them (a web view shows as three nested ones).
  private func players(_ app: XCUIApplication) -> Int {
    app.descendants(matching: .any).matching(identifier: "video-player").allElementsBoundByIndex.filter { $0.webViews.firstMatch.exists }.count
  }

  /// A line the stand-in player shows: what it was asked.
  private func asked(_ app: XCUIApplication, _ s: String) -> XCUIElement {
    app.webViews.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
  }

  /// The video guide, drawn by the app.
  private func openGuide() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"]
    app.launch()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("han che reu")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", "Cách hạn chế rêu hại")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no video guide")
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the guide isn't drawn by the app")
    return app
  }
}
