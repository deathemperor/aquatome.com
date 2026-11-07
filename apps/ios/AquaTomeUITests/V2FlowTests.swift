import XCTest

/// The app's v2 (V2Root) behind the Tài khoản sheet's switch: off by default, v1's three tabs; turned on, v2's tabs, and
/// turned off again, v1's, with the same tanks; a link to a tank opens it in v2. The switch's own flows run with UIKit's
/// animations on (a plain `launch()`): the switch swaps the whole tab bar under the open sheet.
final class V2FlowTests: XCTestCase {
  private func launch(_ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults"] + args
    return app
  }

  func testOffByDefaultShowsV1sTabs() {
    let app = launch()
    app.launchForFlow()
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 10), "no Tìm tab")
    XCTAssertTrue(app.tabBars.buttons["Bể của tôi"].exists)
    XCTAssertTrue(app.tabBars.buttons["Đèn"].exists)
    XCTAssertFalse(app.tabBars.buttons["Hôm nay"].exists, "v2 on by default")
  }

  func testTheSwitchTurnsV2OnAndBackKeepingTheTanks() {
    let app = launch("-seed-tanks", "clash")
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 10), "v1 didn't open")

    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 5), "v2 didn't open")
    XCTAssertTrue(app.tabBars.buttons["Khám phá"].exists)
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "v2 lost the tank")
    XCTAssertTrue(app.buttons["tank"].firstMatch.label.contains("Bể 60"), app.buttons["tank"].firstMatch.label)

    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 5), "v1 didn't come back")
    XCTAssertFalse(app.tabBars.buttons["Hôm nay"].exists, "v2's tabs still there")
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "v1 lost the tank")
  }

  func testATankCardOpensTheTankInV2() {
    let app = launch("-seed-tanks", "clash", "-v2", "YES")
    app.launchForFlow()
    let card = app.buttons["v2-tank-card"]
    repeatUntil(card.exists && card.isHittable, times: 8) { app.swipeUp() }
    XCTAssertTrue(card.exists, "no tank card on Hôm nay")
    card.tap()
    XCTAssertTrue(app.navigationBars["Bể 60"].waitForExistence(timeout: 5), "the tank didn't open")
    XCTAssertTrue(app.tabBars.buttons["Bể của tôi"].isSelected, "the tank opened on another tab")
  }

  /// The sheet's switch, tapped, and the sheet closed.
  private func flip(_ app: XCUIApplication) {
    app.openAccount()
    let toggle = app.switches["v2-switch"]
    repeatUntil(toggle.exists && toggle.isHittable, times: 6) { app.swipeUp() }
    XCTAssertTrue(toggle.exists, "no v2 switch in the Tài khoản sheet")
    // A switch's own control, at its trailing end: a tap on the row's middle doesn't flip it.
    toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
    app.closeAccount()
  }
}
