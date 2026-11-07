import XCTest

/// A shelf of guides kept for reading offline (KeepOffline), on the fixed pages (no network): at once on Wi-Fi, listed in
/// one place and let go of there, counted in the Tài khoản sheet, whose row opens them; asked first on mobile data; stopped with nothing half-kept, also after leaving the
/// shelf; stopped by a removal; not started with too little room on the phone; no longer listed once the site splits its
/// pages anew.
final class OfflineFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// The Tài khoản sheet counts the pages kept ("Đã tải để đọc offline"), and its row closes the sheet and opens their
  /// shelf on Tìm; with none kept, it has no row.
  func testTheAccountSheetCountsTheKeptPagesAndOpensTheirShelfOnTim() {
    let app = openGuides()
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.buttons["Đã tải về đọc offline"].waitForExistence(timeout: 10), "not kept")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.openAccount()
    let row = app.buttons["kept-row"]
    repeatUntil(row.exists && row.isHittable, times: 6) { app.swipeUp() }
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the sheet doesn't list the kept pages")
    XCTAssertTrue(row.label.contains("1 trang"), row.label)
    row.tap()
    XCTAssertTrue(app.navigationBars["Đã tải để đọc offline"].waitForExistence(timeout: 5), "their shelf didn't open")
    XCTAssertFalse(app.buttons["account-done"].exists, "the sheet is still open")
    let guide = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Nuôi cá neon'")).firstMatch
    XCTAssertTrue(guide.waitForExistence(timeout: 5), "the kept guide isn't on the shelf")
    app.buttons["unkeep-all"].tap()
    XCTAssertTrue(guide.waitForNonExistence(timeout: 5), "still kept")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.openAccount()
    XCTAssertTrue(app.buttons["account-done"].waitForExistence(timeout: 5), "no sheet")
    let icon = app.descendants(matching: .any)["app-icon-row"]
    repeatUntil(icon.exists && icon.isHittable, times: 6) { app.swipeUp() }
    XCTAssertTrue(icon.exists, "no Ứng dụng section")
    XCTAssertFalse(row.exists, "a row for kept pages with none kept")
  }

  func testAStoppedKeepKeepsNothingHalfDone() {
    // Each picture takes 20 s to come (the guide has one): stopped before, its page isn't kept, even once it comes.
    let app = openGuides("-slow-keep")
    app.buttons["keep-offline"].tap()
    let stop = app.buttons["Dừng tải"]
    XCTAssertTrue(stop.waitForExistence(timeout: 5), "no way to stop")
    stop.tap()
    XCTAssertTrue(app.buttons["Tải về đọc offline"].waitForExistence(timeout: 2), "didn't stop")
    XCTAssertTrue(keepsEnded(app), "the stopped keep is still at work")
    XCTAssertFalse(app.buttons["Đã tải về đọc offline"].exists, "kept after all")
    // The Tài khoản sheet, where kept pages are counted, has none.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertFalse(keptRow(app).exists, "listed as kept")
  }

  func testAKeepGoesOnWhenItsShelfIsLeftAndStopsFromItWhenBack() {
    let app = openGuides("-slow-keep")
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.buttons["Dừng tải"].waitForExistence(timeout: 5), "not started")
    // Back to the home and into the shelf again: the keep is still on its way, and stops from there.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    openShelf(app)
    let stop = app.buttons["Dừng tải"]
    XCTAssertTrue(stop.waitForExistence(timeout: 2), "the keep is lost: no way to stop it")
    stop.tap()
    XCTAssertTrue(app.buttons["Tải về đọc offline"].waitForExistence(timeout: 2), "didn't stop")
    XCTAssertTrue(keepsEnded(app), "the stopped keep is still at work")
    XCTAssertFalse(app.buttons["Đã tải về đọc offline"].exists, "kept after all")
  }

  func testRemovingKeptPagesStopsAKeepOnItsWay() {
    // The video kept first, at once (from the list of every series, more than the home's eight).
    var app = launch(["-series", "9"])
    let videos = app.descendants(matching: .any)["all-videos"]
    repeatUntil(videos.exists && videos.isHittable, times: 8) { app.swipeUp() }
    videos.tap()
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.buttons["Đã tải về đọc offline"].waitForExistence(timeout: 10), "the video isn't kept")
    // Then, each picture slow, the written guides on their way while every kept page is removed.
    app = openGuides("-slow-keep", reset: false)
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.buttons["Dừng tải"].waitForExistence(timeout: 5), "not started")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let kept = keptRow(app)
    // Only the video is kept yet: the guide's keep is still on its way.
    XCTAssertTrue(kept.label.contains("1 trang"), kept.label)
    kept.tap()
    app.buttons["unkeep-all"].tap()
    app.navigationBars.buttons.element(boundBy: 0).tap()
    // The keep was stopped (its pictures would come after the removal): its shelf offers to keep again.
    openShelf(app)
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
    app.launchForFlow()
    XCTAssertTrue(app.handbookShown(), "no handbook")
    XCTAssertFalse(keptRow(app).exists, "listed as kept")
    app.buttons["account-done"].tap()
    openShelf(app)
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
    app.launchForFlow()
    return app
  }

  /// Every keep's work over (KeepOffline's on the shelf): a stopped keep's last picture, 20 s long with `-slow-keep`, has
  /// stopped or come, so the page it was for is kept by now if it ever will be.
  private func keepsEnded(_ app: XCUIApplication) -> Bool {
    let working = app.descendants(matching: .any)["keeps-working"]
    return XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == '0'"), object: working)], timeout: 30) == .completed
  }

  /// A shelf of guides on the Tìm tab: "Chăm sóc", the fixture's one written guide, drawn by the app. (Its one guide is
  /// the home's pick too, so the home has no "Tất cả hướng dẫn".)
  private func openGuides(_ more: String..., reset: Bool = true) -> XCUIApplication {
    let app = launch(more, reset: reset)
    XCTAssertTrue(app.handbookShown(), "no handbook")
    openShelf(app)
    return app
  }

  /// From the Tìm home, the guides' "Chăm sóc" chip, further down (a lazy list draws only what's on screen).
  private func openShelf(_ app: XCUIApplication) {
    let chip = app.descendants(matching: .any).matching(identifier: "shelf").matching(NSPredicate(format: "label BEGINSWITH 'Chăm sóc'")).firstMatch
    repeatUntil(chip.exists && chip.isHittable, times: 8) { app.swipeUp() }
    chip.tap()
    XCTAssertTrue(app.navigationBars["Chăm sóc"].waitForExistence(timeout: 5), "the guides' shelf didn't open")
  }

  /// The Tài khoản sheet's row for the pages kept (none: no row), the sheet left open.
  private func keptRow(_ app: XCUIApplication) -> XCUIElement {
    app.openAccount()
    let row = app.buttons["kept-row"], icon = app.descendants(matching: .any)["app-icon-row"]
    repeatUntil(icon.exists && icon.isHittable, times: 6) { app.swipeUp() }
    XCTAssertTrue(icon.exists, "no Ứng dụng section")
    return row
  }
}
