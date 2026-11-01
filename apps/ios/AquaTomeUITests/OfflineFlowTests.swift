import XCTest

/// A shelf of guides kept for reading offline (KeepOffline), on the fixed pages (no network): at once on Wi-Fi, listed in
/// one place and let go of there; asked first on mobile data; stopped with nothing half-kept; not started with too little
/// room on the phone.
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
    // The shard takes 3 s to come: stopped before, its page isn't kept, even once it comes.
    let app = openGuides("-slow-keep")
    app.buttons["keep-offline"].tap()
    let stop = app.buttons["Dừng tải"]
    XCTAssertTrue(stop.waitForExistence(timeout: 5), "no way to stop")
    stop.tap()
    XCTAssertTrue(app.buttons["Tải về đọc offline"].waitForExistence(timeout: 2), "didn't stop")
    XCTAssertFalse(app.buttons["Đã tải về đọc offline"].waitForExistence(timeout: 5), "kept after all")
    // Back up to the top of the Tìm home, where kept pages are listed, above every fish.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let fish = app.descendants(matching: .any)["all-fish"]
    for _ in 0..<6 where !(fish.exists && fish.isHittable) { app.swipeDown() }
    app.swipeDown()
    XCTAssertTrue(fish.waitForExistence(timeout: 5), "not back on the home")
    XCTAssertFalse(app.descendants(matching: .any)["all-kept"].exists, "listed as kept")
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

  /// The Tìm tab's "every guide" shelf: the fixture's one written guide, drawn by the app.
  private func openGuides(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"] + more
    app.launch()
    XCTAssertTrue(app.descendants(matching: .any)["all-fish"].waitForExistence(timeout: 5), "no handbook")
    // Further down the home (a lazy list draws only what's on screen).
    let all = app.descendants(matching: .any)["all-guides"]
    for _ in 0..<6 where !(all.exists && all.isHittable) { app.swipeUp() }
    all.tap()
    XCTAssertTrue(app.navigationBars["Tất cả hướng dẫn"].waitForExistence(timeout: 5))
    return app
  }
}
