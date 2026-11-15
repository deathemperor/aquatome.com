import XCTest

/// A page's videos play in the page, in YouTube's own player (PagePlayer), not in the YouTube app: nothing of the player
/// before play is pressed, then the player where the thumbnail was, a chapter seeking it, full screen and back with the
/// same player playing on, one video at a time, paused or gone when the page is left. UI tests read no network: the
/// player's page gets a stand-in for YouTube's script that shows what it was asked, a line each (PagePlayer.standIn);
/// `-slow-player` makes it late, `-silent-player` never ready, `-impatient` gives up on it sooner. `-count-players` has
/// the app count its players' web views made and still alive (PlayerCount), to see one let go of is gone.
final class VideoFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAVideoPlaysInThePageAndAChapterSeeksIt() throws {
    let app = openGuide()
    let page = app.descendants(matching: .any)["native-page"]
    XCTAssertEqual(app.webViews.count, 0, "the player loaded before play was pressed")
    let credit = app.links["Xem trên YouTube: Hạn chế rêu hại"]
    XCTAssertTrue(credit.exists, "no way to the video on YouTube, named for its video")
    let play = app.buttons["Phát video: Hạn chế rêu hại"]
    XCTAssertTrue(play.exists, "no thumbnail to play")
    play.tap()
    // A web view's first start can take a while on a slow runner.
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 0 · vi · https://www.youtube-nocookie.com").waitForExistence(timeout: 15),
                  "not YouTube's player from the start, with Vietnamese captions, from youtube-nocookie.com")
    XCTAssertEqual(app.state, .runningForeground, "left the app")
    XCTAssertTrue(page.descendants(matching: .any)["video-player"].webViews.firstMatch.exists, "the player isn't in the page where the video was")
    XCTAssertTrue(play.waitForNonExistence(timeout: 5), "the thumbnail still over the player")
    XCTAssertTrue(credit.exists, "no way to the video on YouTube beside the player")
    XCTAssertTrue(app.buttons["Toàn màn hình: Hạn chế rêu hại"].exists, "full screen not named for its video")
    // The video's own Vietnamese captions.
    XCTAssertTrue(asked(app, "captions vi").waitForExistence(timeout: 5), "not the video's Vietnamese captions")
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

  /// A video guide opens on its card's photo, its poster, not on YouTube's thumbnail (often people) (the Design Lead's
  /// frames, 14 Nov). `-fixed-pictures` gives each address its own colour (PageImages.fixedPicture): the poster's hue is
  /// 0.49 and the thumbnail's 0.62, each going 0.05 further down its picture.
  func testAVideoGuideOpensOnItsPosterNotYouTubesThumbnail() {
    let app = openGuide("-fixed-pictures")
    let play = app.buttons["Phát video: Hạn chế rêu hại"]
    XCTAssertTrue(play.waitForExistence(timeout: 5), "no video")
    wait(1)
    let f = play.frame
    let h = hue(XCUIScreen.main.screenshot(), in: CGRect(x: f.minX + f.width * 0.05, y: f.minY + f.height * 0.3, width: f.width * 0.2, height: f.height * 0.4))
    XCTAssertLessThan(abs(h - 0.51), abs(h - 0.645), "the guide's video opens on YouTube's thumbnail, not its poster (hue \(h))")
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
    app.openTab("Bể của tôi")
    wait(1)
    app.openTab("Tìm")
    XCTAssertTrue(asked(app, "paused").waitForExistence(timeout: 5), "the video played on behind another tab")
  }

  /// The page left with its video playing: its player gone with it at once, not kept a while to play on unseen.
  func testAPlayerGoesWithItsPage() {
    let app = openGuide()
    app.buttons["Phát video: Hạn chế rêu hại"].tap()
    XCTAssertTrue(app.webViews.staticTexts["play"].waitForExistence(timeout: 15), "not playing")
    expectPlayers(app, "made 1 alive 1", "no player")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    expectPlayers(app, "made 1 alive 0", "the player outlived its page")
  }

  /// The page left while its player loads (its page there, YouTube's player not up yet, `-silent-player`): nothing left
  /// to come up and play unseen.
  func testAVideoLeftAsItsPlayerLoadsGoesWithThePage() {
    let app = openGuide("-silent-player")
    app.buttons["Phát video: Hạn chế rêu hại"].tap()
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 0").waitForExistence(timeout: 15), "no player")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    expectPlayers(app, "made 1 alive 0", "the loading player outlived its page")
  }

  /// Another tab before the player is ready (`-slow-player`): no player left to start once ready, off the screen; its
  /// thumbnail again.
  func testAVideoLeftBeforeItsPlayerIsReadyDoesntStartUnseen() {
    let app = openGuide("-slow-player")
    let play = app.buttons["Phát video: Hạn chế rêu hại"]
    play.tap()
    expectPlayers(app, "made 1 alive 1", "no player")
    app.openTab("Bể của tôi")
    expectPlayers(app, "made 1 alive 0", "a player left to start off the screen")
    // Long enough for a player left to have come and started (5 s, then 2 s).
    wait(8)
    expectPlayers(app, "made 1 alive 0", "a player left to start off the screen")
    app.openTab("Tìm")
    XCTAssertTrue(play.waitForExistence(timeout: 5), "no thumbnail to play again")
    XCTAssertEqual(app.webViews.count, 0, "a player in the page")
  }

  /// A player that never comes up (`-silent-player`, `-impatient`): after its time limit, its thumbnail again with a note
  /// and the player gone; a tap tries again with another, and its time limit too gives the thumbnail back.
  func testAPlayerThatNeverComesUpGivesTheThumbnailBack() {
    let app = openGuide("-silent-player", "-impatient")
    let play = app.buttons["Phát video: Hạn chế rêu hại"]
    play.tap()
    let note = app.staticTexts["Không mở được video. Kiểm tra mạng rồi thử lại."]
    XCTAssertTrue(note.waitForExistence(timeout: 20), "the spinner stayed")
    expectPlayers(app, "made 1 alive 0", "the player that never came up stayed")
    XCTAssertEqual(app.webViews.count, 0, "the player that never came up stayed in the page")
    // The note goes at the tap, so the one after the second player is its own.
    play.tap()
    expectPlayers(app, "made 2 alive 0", "no second try, or it stayed", timeout: 20)
    XCTAssertTrue(note.waitForExistence(timeout: 5), "no note after the second try")
  }

  /// A fish's videos: the second started stops the first, whose thumbnail comes back and whose web view goes; each
  /// video's controls named for it; English captions as they are, not a translation YouTube refuses.
  func testOneVideoPlaysAtATime() {
    let app = openFish()
    let first = app.buttons["Phát video: Đàn neon trong bể thủy sinh"], second = app.buttons["Phát video: Cá neon ăn trùn chỉ"]
    reveal(app, first)
    first.tap()
    XCTAssertTrue(asked(app, "video neonVid_001 from 0").waitForExistence(timeout: 15), "the first video didn't play")
    XCTAssertTrue(asked(app, "captions en").waitForExistence(timeout: 5), "no captions in the video's own language")
    XCTAssertFalse(asked(app, "→").exists, "captions translated")
    reveal(app, second)
    second.tap()
    XCTAssertTrue(asked(app, "video neonVid_002 from 0").waitForExistence(timeout: 15), "the second video didn't play")
    XCTAssertFalse(asked(app, "neonVid_001").exists, "the first video still playing")
    XCTAssertTrue(first.exists, "the first video's thumbnail didn't come back")
    XCTAssertEqual(players(app), 1, "two players")
    expectPlayers(app, "made 2 alive 1", "the first player stayed")
    for title in ["Đàn neon trong bể thủy sinh", "Cá neon ăn trùn chỉ"] {
      XCTAssertTrue(app.links["Xem trên YouTube: \(title)"].exists, "\(title): its way to YouTube not named for it")
    }
    XCTAssertTrue(app.buttons["Toàn màn hình: Cá neon ăn trùn chỉ"].exists, "full screen not named for its video")
  }

  /// A link in YouTube's player that opens a new window (its title, "Watch on YouTube"): out of the app, to YouTube in
  /// Safari (or YouTube's app, on a phone that has it), not nowhere; back in the app, the page and its player still there.
  func testALinkOpeningANewWindowGoesOutOfTheApp() {
    let app = openGuide()
    app.buttons["Phát video: Hạn chế rêu hại"].tap()
    let link = app.webViews.links["Watch on YouTube"]
    XCTAssertTrue(link.waitForExistence(timeout: 15), "no player")
    link.tap()
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 15), "the link opening a new window went nowhere")
    app.activate()
    XCTAssertTrue(asked(app, "video abc123XYZ_- from 0").waitForExistence(timeout: 10), "the player's page went")
    expectPlayers(app, "made 1 alive 1", "a second player, or none")
  }

  /// A video YouTube's player refuses (its owner keeps it off other sites): its thumbnail again with a note, not a blank
  /// box, the player gone, and the thumbnail opening the video on YouTube.
  func testAVideoYouTubeRefusesOpensOnYouTube() {
    let app = openFish()
    let play = app.buttons["Phát video: Cá neon đẻ trứng"]
    reveal(app, play)
    play.tap()
    let note = app.staticTexts["Video này chỉ xem được trên YouTube."]
    XCTAssertTrue(note.waitForExistence(timeout: 15), "no note that it plays only on YouTube")
    XCTAssertTrue(play.exists, "no thumbnail")
    XCTAssertEqual(players(app), 0, "the refused player stayed")
    expectPlayers(app, "made 1 alive 0", "the refused player stayed")
    play.tap()
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 15), "the thumbnail didn't open the video on YouTube")
    app.activate()
    expectPlayers(app, "made 1 alive 0", "the thumbnail tried the player again")
  }

  // MARK: Helpers

  /// Web views in the app with a player in them (a web view shows as three nested ones).
  private func players(_ app: XCUIApplication) -> Int {
    app.descendants(matching: .any).matching(identifier: "video-player").allElementsBoundByIndex.filter { $0.webViews.firstMatch.exists }.count
  }

  /// The players' web views the app made and those still alive (`-count-players`), as "made 1 alive 0", within `timeout`.
  private func expectPlayers(_ app: XCUIApplication, _ count: String, _ why: String, timeout: TimeInterval = 5,
                             file: StaticString = #filePath, line: UInt = #line) {
    let e = app.staticTexts["players"], p = NSPredicate(format: "label == %@", count)
    // Checked once more after the wait: on a loaded runner a snapshot can take the whole timeout.
    if XCTWaiter.wait(for: [expectation(for: p, evaluatedWith: e)], timeout: timeout) != .completed, !p.evaluate(with: e) {
      XCTFail("\(why): \(e.exists ? e.label : "no count")", file: file, line: line)
    }
  }

  /// A line the stand-in player shows: what it was asked.
  private func asked(_ app: XCUIApplication, _ s: String) -> XCUIElement {
    app.webViews.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
  }

  /// A chapter of the guide's video, by its time and name.
  private func chapter(_ app: XCUIApplication, _ s: String) -> XCUIElement {
    app.links.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
  }

  /// The hue (0 to 1) of `area`'s mean colour, in points.
  private func hue(_ shot: XCUIScreenshot, in area: CGRect) -> CGFloat {
    let s = shot.image.scale, cg = shot.image.cgImage!.cropping(to: CGRect(x: area.minX * s, y: area.minY * s, width: area.width * s, height: area.height * s))!
    let ctx = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    let p = ctx.data!.assumingMemoryBound(to: UInt8.self), n = cg.width * cg.height
    var sum = [0.0, 0.0, 0.0]
    for i in 0..<n { for c in 0..<3 { sum[c] += Double(p[i * 4 + c]) } }
    var h: CGFloat = 0
    UIColor(red: sum[0] / Double(n) / 255, green: sum[1] / Double(n) / 255, blue: sum[2] / Double(n) / 255, alpha: 1).getHue(&h, saturation: nil, brightness: nil, alpha: nil)
    return h
  }

  private func launch(_ more: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-count-players"] + more
    app.launchForFlow(.old)
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

  /// The neon's page, drawn by the app, with its three videos.
  private func openFish() -> XCUIApplication {
    let app = launch()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("ca neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no fish")
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the fish isn't drawn by the app")
    return app
  }

  private func wait(_ seconds: TimeInterval) {
    let until = Date().addingTimeInterval(seconds)
    while Date() < until { RunLoop.current.run(until: Date().addingTimeInterval(0.2)) }
  }

  /// Scrolled into view half a screen at a time, only down, without a fling.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    repeatUntil(e.exists && e.isHittable, times: 24) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .fast,
               thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
