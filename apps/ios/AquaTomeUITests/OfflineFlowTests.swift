import XCTest

/// A shelf of guides kept for reading offline (KeepOffline), on the fixed pages (no network): at once on Wi-Fi, listed in
/// one place and let go of there; asked first on mobile data; stopped with nothing half-kept, also after leaving the
/// shelf; stopped by a removal; not started with too little room on the phone; no longer listed once the site splits its
/// pages anew.
final class OfflineFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testKeepsAShelfAtOnceOnWiFiListsItInOnePlaceAndLetsItGo() {
    let app = openGuides()
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.buttons["Đã tải về đọc offline"].waitForExistence(timeout: 10), "not kept")
    // On the Tìm home, with how many.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let kept = app.descendants(matching: .any)["all-kept"]
    for _ in 0..<6 where !(kept.exists && kept.isHittable) { app.swipeDown() }
    XCTAssertTrue(kept.waitForExistence(timeout: 5), "the kept pages aren't listed")
    XCTAssertTrue(kept.label.contains("1"), kept.label)
    kept.tap()
    let guide = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Nuôi cá neon'")).firstMatch
    XCTAssertTrue(guide.waitForExistence(timeout: 5))
    app.buttons["unkeep-all"].tap()
    XCTAssertTrue(guide.waitForNonExistence(timeout: 5), "still kept")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertFalse(kept.waitForExistence(timeout: 2), "the home still lists kept pages")
  }

  func testAStoppedKeepKeepsNothingHalfDone() {
    // Each picture takes 20 s to come (the guide has one): stopped before, its page isn't kept, even once it comes.
    let app = openGuides("-slow-keep")
    app.buttons["keep-offline"].tap()
    let stop = app.buttons["Dừng tải"]
    XCTAssertTrue(stop.waitForExistence(timeout: 5), "no way to stop")
    stop.tap()
    XCTAssertTrue(app.buttons["Tải về đọc offline"].waitForExistence(timeout: 2), "didn't stop")
    XCTAssertFalse(app.buttons["Đã tải về đọc offline"].waitForExistence(timeout: 25), "kept after all")
    // Back up to the top of the Tìm home, where kept pages are listed, above every fish.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let fish = app.descendants(matching: .any)["all-fish"]
    for _ in 0..<6 where !(fish.exists && fish.isHittable) { app.swipeDown() }
    app.swipeDown()
    XCTAssertTrue(fish.waitForExistence(timeout: 5), "not back on the home")
    XCTAssertFalse(app.descendants(matching: .any)["all-kept"].exists, "listed as kept")
  }

  func testAKeepGoesOnWhenItsShelfIsLeftAndStopsFromItWhenBack() {
    let app = openGuides("-slow-keep")
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.buttons["Dừng tải"].waitForExistence(timeout: 5), "not started")
    // Back to the home and into the shelf again: the keep is still on its way, and stops from there.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.descendants(matching: .any)["all-guides"].tap()
    XCTAssertTrue(app.navigationBars["Tất cả hướng dẫn"].waitForExistence(timeout: 5))
    let stop = app.buttons["Dừng tải"]
    XCTAssertTrue(stop.waitForExistence(timeout: 2), "the keep is lost: no way to stop it")
    stop.tap()
    XCTAssertTrue(app.buttons["Tải về đọc offline"].waitForExistence(timeout: 2), "didn't stop")
    XCTAssertFalse(app.buttons["Đã tải về đọc offline"].waitForExistence(timeout: 25), "kept after all")
  }

  func testRemovingKeptPagesStopsAKeepOnItsWay() {
    // The video kept first, at once.
    var app = launch()
    let videos = app.descendants(matching: .any)["all-videos"]
    for _ in 0..<8 where !(videos.exists && videos.isHittable) { app.swipeUp() }
    videos.tap()
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.buttons["Đã tải về đọc offline"].waitForExistence(timeout: 10), "the video isn't kept")
    // Then, each picture slow, the written guides on their way while every kept page is removed.
    app = openGuides("-slow-keep", reset: false)
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.buttons["Dừng tải"].waitForExistence(timeout: 5), "not started")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let kept = app.descendants(matching: .any)["all-kept"]
    for _ in 0..<6 where !(kept.exists && kept.isHittable) { app.swipeDown() }
    // Only the video is kept yet: the guide's keep is still on its way.
    XCTAssertTrue(kept.label.contains("1"), kept.label)
    kept.tap()
    app.buttons["unkeep-all"].tap()
    app.navigationBars.buttons.element(boundBy: 0).tap()
    // The keep was stopped (its pictures would come after the removal): its shelf offers to keep again.
    let guides = app.descendants(matching: .any)["all-guides"]
    for _ in 0..<6 where !(guides.exists && guides.isHittable) { app.swipeUp() }
    guides.tap()
    XCTAssertTrue(app.buttons["Tải về đọc offline"].waitForExistence(timeout: 5), "the keep goes on after the removal")
    XCTAssertFalse(app.buttons["Dừng tải"].exists, "the keep goes on after the removal")
  }

  func testAShelfKeptBeforeTheSiteSplitItsPagesAnewIsNoLongerListed() {
    let app = openGuides()
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.buttons["Đã tải về đọc offline"].waitForExistence(timeout: 10), "not kept")
    // Next launch the index has the guides in 2 shards: the kept shard is another count's file.
    app.terminate()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-pages-count", "2"]
    app.launch()
    let fish = app.descendants(matching: .any)["all-fish"]
    XCTAssertTrue(fish.waitForExistence(timeout: 5), "no handbook")
    app.swipeDown()
    XCTAssertFalse(app.descendants(matching: .any)["all-kept"].exists, "listed as kept")
    let guides = app.descendants(matching: .any)["all-guides"]
    for _ in 0..<6 where !(guides.exists && guides.isHittable) { app.swipeUp() }
    guides.tap()
    XCTAssertTrue(app.buttons["Tải về đọc offline"].waitForExistence(timeout: 5), "shown as kept")
  }

  func testAsksFirstOnMobileData() {
    let app = openGuides("-network-cellular")
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.staticTexts["Tải 1 bài bằng dữ liệu di động?"].waitForExistence(timeout: 5), "didn't ask")
    XCTAssertFalse(app.buttons["Đã tải về đọc offline"].exists, "kept before asking")
    app.buttons["Tải"].tap()
    XCTAssertTrue(app.buttons["Đã tải về đọc offline"].waitForExistence(timeout: 10), "not kept")
  }

  func testDoesntStartWithTooLittleRoom() {
    let app = openGuides("-low-storage")
    app.buttons["keep-offline"].tap()
    let alert = app.alerts["Máy còn ít chỗ trống. Hãy giải phóng bớt dung lượng rồi thử lại."]
    XCTAssertTrue(alert.waitForExistence(timeout: 5), "no word of the room")
    alert.buttons.firstMatch.tap()
    XCTAssertTrue(app.buttons["Tải về đọc offline"].waitForExistence(timeout: 5), "started anyway")
  }

  // MARK: Helpers

  private func launch(_ more: [String] = [], reset: Bool = true) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"] + (reset ? ["-reset-defaults"] : []) + more
    app.launch()
    return app
  }

  /// The Tìm tab's "every guide" shelf: the fixture's one written guide, drawn by the app.
  private func openGuides(_ more: String..., reset: Bool = true) -> XCUIApplication {
    let app = launch(more, reset: reset)
    XCTAssertTrue(app.descendants(matching: .any)["all-fish"].waitForExistence(timeout: 5), "no handbook")
    // Further down the home (a lazy list draws only what's on screen).
    let all = app.descendants(matching: .any)["all-guides"]
    for _ in 0..<6 where !(all.exists && all.isHittable) { app.swipeUp() }
    all.tap()
    XCTAssertTrue(app.navigationBars["Tất cả hướng dẫn"].waitForExistence(timeout: 5))
    return app
  }
}
