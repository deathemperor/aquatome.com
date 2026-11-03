import XCTest

/// A page's videos play in the page, in YouTube's own player (PagePlayer), not in the YouTube app: nothing of the player
/// before play is pressed, then the player where the thumbnail was, a chapter seeking it, full screen and back with the
/// same player playing on, one video at a time, paused or gone when the page is left. UI tests read no network: the
/// player's page gets a stand-in for YouTube's script that shows what it was asked, a line each (PagePlayer.standIn);
/// `-slow-player` makes it late, `-silent-player` never ready.
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
    XCTAssertTrue(play.waitForNonExistence(timeout: 5), "the thumbnail still over the player")
    XCTAssertTrue(app.links["Xem trên YouTube"].exists, "no way to the video on YouTube beside the player")
    chapter(app, "1:35  Ánh sáng và CO₂").tap()
    XCTAssertTrue(asked(app, "seek 95").waitForExistence(timeout: 5), "the chapter didn't seek the player")
    XCTAssertEqual(players(app), 1, "a second player")
    // A link out of YouTube's player (its title, its logo) doesn't take the player's place.
    app.webViews.links["YouTube"].tap()
    wait(2)
    XCTAssertTrue(asked(app, "seek 95").exists, "a link replaced the player's page")
    XCTAssertEqual(app.state, .runningForeground, "left the app")
    // The player and its controls each say what they are to VoiceOver.
    try app.performAccessibilityAudit(for: .sufficientElementDescription)
  }

  /// A chapter tapped before play: the player starts at its time.
  func testAChapterStartsThePlayerAtItsTime() {
    let app = openGuide()
    chapter(app, "1:35  Ánh sáng và CO₂").tap()
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 95").waitForExistence(timeout: 15), "the player didn't start at the chapter")
  }

  /// Two chapters tapped one after the other while the player's page is still on its way (`-slow-player`): it ends on
  /// the second, which isn't lost on a page not there yet.
  func testTwoChaptersTappedAsThePlayerLoadsEndOnTheSecond() {
    let app = openGuide("-slow-player")
    chapter(app, "0:00  Vì sao rêu mọc").tap()
    chapter(app, "1:35  Ánh sáng và CO₂").tap()
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 0").waitForExistence(timeout: 20), "no player")
    XCTAssertTrue(asked(app, "seek 95").waitForExistence(timeout: 10), "the second chapter was lost")
  }

  /// Full screen is the same player, not a new one: what it was asked before is still there; closed, it's back in the
  /// page, still that player.
  func testFullScreenKeepsThePlayerAndClosesBackToThePage() {
    let app = openGuide()
    app.buttons["Phát video: Hạn chế rêu hại"].tap()
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 0").waitForExistence(timeout: 15), "no player")
    chapter(app, "1:35  Ánh sáng và CO₂").tap()
    XCTAssertTrue(asked(app, "seek 95").waitForExistence(timeout: 5), "the chapter didn't seek the player")
    app.buttons["video-full"].tap()
    let full = app.descendants(matching: .any)["video-full-screen"]
    XCTAssertTrue(full.waitForExistence(timeout: 5), "not full screen")
    XCTAssertTrue(full.webViews.staticTexts["seek 95"].waitForExistence(timeout: 5), "full screen loaded the video again")
    // Swiped down on the video, it closes.
    let video = full.webViews.firstMatch
    video.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
      .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.95)))
    XCTAssertTrue(full.waitForNonExistence(timeout: 5), "swiping down didn't close full screen")
    let player = app.descendants(matching: .any)["native-page"].descendants(matching: .any)["video-player"]
    XCTAssertTrue(player.webViews.staticTexts["seek 95"].waitForExistence(timeout: 5), "back in the page, not the same player")
    XCTAssertFalse(player.webViews.staticTexts["paused"].exists, "full screen paused the video")
    XCTAssertEqual(players(app), 1, "a second player")
  }

  /// Another tab over the page: the video paused, not playing on unseen.
  func testAnotherTabPausesTheVideo() {
    let app = openGuide()
    app.buttons["Phát video: Hạn chế rêu hại"].tap()
    XCTAssertTrue(app.webViews.staticTexts["play"].waitForExistence(timeout: 15), "not playing")
    app.tabBars.buttons["Bể của tôi"].tap()
    wait(1)
    app.tabBars.buttons["Tìm"].tap()
    XCTAssertTrue(asked(app, "paused").waitForExistence(timeout: 5), "the video played on behind another tab")
  }

  /// Left while the player is still coming (`-slow-player`): no player left to start once ready, off the screen; its
  /// thumbnail again.
  func testAVideoLeftBeforeItsPlayerIsReadyDoesntStartUnseen() {
    let app = openGuide("-slow-player")
    let play = app.buttons["Phát video: Hạn chế rêu hại"]
    play.tap()
    app.tabBars.buttons["Bể của tôi"].tap()
    // Long enough for the player to have come and started (5 s, then 2 s).
    wait(9)
    app.tabBars.buttons["Tìm"].tap()
    XCTAssertTrue(play.waitForExistence(timeout: 5), "no thumbnail to play again")
    XCTAssertEqual(app.webViews.count, 0, "a player left to start off the screen")
  }

  /// A player that never comes up (`-silent-player`): after its time limit, its thumbnail again with a note, and a tap
  /// tries again.
  func testAPlayerThatNeverComesUpGivesTheThumbnailBack() {
    let app = openGuide("-silent-player")
    let play = app.buttons["Phát video: Hạn chế rêu hại"]
    play.tap()
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 0").waitForExistence(timeout: 15), "no player")
    let note = app.staticTexts["Không mở được video. Kiểm tra mạng rồi thử lại."]
    XCTAssertTrue(note.waitForExistence(timeout: 10), "the spinner stayed")
    XCTAssertEqual(app.webViews.count, 0, "the player that never came up stayed")
    play.tap()
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 0").waitForExistence(timeout: 15), "no second try")
    XCTAssertFalse(note.exists, "the note stayed on the second try")
  }

  /// A fish's two videos: the second started stops the first, whose thumbnail comes back.
  func testOneVideoPlaysAtATime() {
    let app = launch()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("ca neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no fish")
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the fish isn't drawn by the app")
    let first = app.buttons["Phát video: Đàn neon trong bể thủy sinh"], second = app.buttons["Phát video: Cá neon ăn trùn chỉ"]
    reveal(app, first)
    first.tap()
    XCTAssertTrue(asked(app, "video neonVid_001 from 0").waitForExistence(timeout: 15), "the first video didn't play")
    reveal(app, second)
    second.tap()
    XCTAssertTrue(asked(app, "video neonVid_002 from 0").waitForExistence(timeout: 15), "the second video didn't play")
    XCTAssertFalse(asked(app, "neonVid_001").exists, "the first video still playing")
    XCTAssertTrue(first.exists, "the first video's thumbnail didn't come back")
    XCTAssertEqual(players(app), 1, "two players")
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

  /// A chapter of the guide's video, by its time and name.
  private func chapter(_ app: XCUIApplication, _ s: String) -> XCUIElement {
    app.links.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
  }

  private func launch(_ more: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"] + more
    app.launch()
    return app
  }

  /// The video guide, drawn by the app.
  private func openGuide(_ more: String...) -> XCUIApplication {
    let app = launch(more)
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

  private func wait(_ seconds: TimeInterval) {
    let until = Date().addingTimeInterval(seconds)
    while Date() < until { RunLoop.current.run(until: Date().addingTimeInterval(0.2)) }
  }

  /// Scrolled into view half a screen at a time, only down, without a fling.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    for _ in 0..<24 where !(e.exists && e.isHittable) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .fast,
               thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
