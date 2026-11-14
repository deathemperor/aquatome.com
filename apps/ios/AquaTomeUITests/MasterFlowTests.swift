import XCTest

/// The master button on Đèn (Design Lead's master/spec.md): made in its sheet, pressed, ended by a tap or by the clock,
/// and what it changed put back; on the stand-in Tuya cloud's strips (the CO2 outlet has a countdown) and the simulator's
/// stand-in lamp, as the owner's account. And its states for the Design Lead's parity check, kept with the run
/// (`shot-master-…`): none yet, ready, running, ended on a tap, a step that failed, the sheet and the second ask, light and
/// dark, at the default and the largest text.
final class MasterFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testMakesTheButtonPressesItAndEndsItEarlyPuttingBackWhatItChanged() {
    let app = launch(signIn: false)
    XCTAssertFalse(element(app, "master-create").waitForExistence(timeout: 2), "the master button before the owner signed in")
    signIn(app)
    make(app, end: "60")
    expect(app, "master-name", contains: "Ngắm bể")
    expect(app, "master-summary", contains: "Đèn sáng, CO2 bật, đèn tắt · 1 giờ")
    tap(app, "master-start")
    // The lamp on in white, CO2 on, the light's outlet off; no countdown written to a plug.
    expect(app, "master-log", contains: "lamp on+white", timeout: 20)
    expect(app, "master-log", contains: "switch_2 on")
    expect(app, "master-log", contains: "switch_1 off")
    expect(app, "master-log", lacks: "countdown")
    expect(app, "master-left", contains: "1:00")
    expect(app, "master-summary", contains: "· kết thúc lúc ")
    XCTAssertTrue(element(app, "master-end").waitForExistence(timeout: 20), "not running")
    // Kept: it runs on after a relaunch.
    let again = launch(signIn: false, reset: false)
    XCTAssertTrue(element(again, "master-left").waitForExistence(timeout: 10), "not running after a relaunch")
    tap(again, "master-end")
    // Each put back by the phone; the lamp the other way (nothing was sent to it before).
    expect(again, "master-log", contains: "switch_2 back off", timeout: 20)
    expect(again, "master-log", contains: "switch_1 back on")
    expect(again, "master-log", contains: "lamp back off")
    XCTAssertTrue(element(again, "master-start").waitForExistence(timeout: 20), "not ready again")
    XCTAssertFalse(element(again, "master-problems").exists, element(again, "master-problems").label)
  }

  func testEndsByTheClockAndPutsBackTheLastColourSentToTheLamp() {
    let app = launch(["-master-ends-in", "6"])
    // The card's yellow, sent before: what the lamp goes back to.
    tap(app, "lamp-yellow")
    expect(app, "lamp-status", contains: "Đã gửi “Vàng”")
    make(app, end: "tap")
    expect(app, "master-summary", contains: "· đến khi bạn bấm Kết thúc")
    tap(app, "master-start")
    expect(app, "master-log", contains: "lamp on+white", timeout: 20)
    // Ended by the clock (six seconds here), the app open: everything back from the phone.
    expect(app, "master-log", contains: "lamp back on+yellow", timeout: 30)
    expect(app, "master-log", contains: "switch_2 back off")
    expect(app, "master-log", lacks: "countdown")
    XCTAssertTrue(element(app, "master-start").waitForExistence(timeout: 10), "not ready again")
  }

  func testTheUntilKetThucButtonShowsWhenItStarted() {
    let app = launch()
    make(app, end: "tap")
    tap(app, "master-start")
    XCTAssertTrue(element(app, "master-since").waitForExistence(timeout: 20), "no start time")
    XCTAssertNotNil(element(app, "master-since").label.range(of: #"^\d{2}:\d{2}$"#, options: .regularExpression), element(app, "master-since").label)
    expect(app, "master-summary", contains: "· đến khi bạn bấm Kết thúc")
    tap(app, "master-end")
    XCTAssertTrue(element(app, "master-start").waitForExistence(timeout: 20), "not ready again")
  }

  func testTheOwnersCountdownTrialSwitchesAnOutletOffAndSeesItComeBackOn() {
    let app = launch(["-countdown-trial-seconds", "3"])
    // The stand-in strip's light outlet is on and has a countdown; CO2 is never offered.
    tap(app, "trial-pick")
    XCTAssertFalse(app.buttons["CO2"].exists, "CO2 offered for the trial")
    let light = app.buttons["Đèn"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "the light's outlet not offered")
    light.tap()
    tap(app, "trial-run")
    XCTAssertTrue(element(app, "trial-running").waitForExistence(timeout: 10), "not counting down")
    expect(app, "trial-result", contains: "ổ Đèn bật lại khi đếm về 0.", timeout: 40)
  }

  func testWithBluetoothOffTheLampSaysSoAndThePlugsStillGo() {
    let app = launch(["-fake-lamp-off"])
    make(app, end: "120")
    tap(app, "master-start")
    expect(app, "master-problems", contains: "Bật Bluetooth để gửi lệnh tới đèn.", timeout: 20)
    expect(app, "master-log", contains: "switch_2 on")
  }

  func testTurningOffAFilterAsksAgainAndDeletingTheButtonAsksOnce() {
    let app = launch()
    tap(app, "master-create")
    add(app, "master-add-Lọc")
    tap(app, "master-step-Lọc")
    tap(app, "master-choice-Tắt")
    XCTAssertTrue(app.staticTexts["Tắt lọc trong lúc chạy nút?"].waitForExistence(timeout: 5), "no second ask")
    app.buttons["Hủy"].firstMatch.tap()
    tap(app, "master-choice-Tắt")
    let anyway = app.buttons["master-turn-off-anyway"].firstMatch
    XCTAssertTrue(anyway.waitForExistence(timeout: 5), "no second ask")
    anyway.tap()
    app.navigationBars.buttons.element(boundBy: 0).tap()
    expect(app, "master-step-Lọc", contains: "Ổ cắm · Tắt")
    tap(app, "master-done")
    expect(app, "master-summary", contains: "Lọc tắt · 2 giờ")
    tap(app, "master-edit")
    tap(app, "master-delete")
    let delete = app.buttons["Xóa nút"].firstMatch
    XCTAssertTrue(delete.waitForExistence(timeout: 5), "deleting doesn't ask")
    delete.tap()
    XCTAssertTrue(element(app, "master-create").waitForExistence(timeout: 10), "not deleted")
  }

  // MARK: Parity shots for the Design Lead

  func testShotsLight() { shots("light", dark: false, size: nil) }
  func testShotsDark() { shots("dark", dark: true, size: nil) }
  func testShotsLargestLight() { shots("largest-light", dark: false, size: "UICTContentSizeCategoryAccessibilityXXXL") }
  func testShotsLargestDark() { shots("largest-dark", dark: true, size: "UICTContentSizeCategoryAccessibilityXXXL") }

  private func shots(_ name: String, dark: Bool, size: String?) {
    let app = launch((dark ? ["-dark"] : []) + (size.map { ["-UIPreferredContentSizeCategoryName", $0] } ?? []))
    XCTAssertTrue(element(app, "master-create").waitForExistence(timeout: 10), "no card")
    shoot("none-\(name)")
    make(app, end: "120", shots: name)
    shoot("ready-\(name)")
    tap(app, "master-start")
    XCTAssertTrue(element(app, "master-left").waitForExistence(timeout: 20), "not running")
    shoot("running-\(name)")
    tap(app, "master-end")
    XCTAssertTrue(element(app, "master-start").waitForExistence(timeout: 20), "not ready again")
    // Until Kết thúc: the start time in place of the time left.
    tap(app, "master-edit")
    tap(app, "master-end-tap")
    tap(app, "master-done")
    tap(app, "master-start")
    XCTAssertTrue(element(app, "master-since").waitForExistence(timeout: 20), "not running")
    shoot("running-until-tap-\(name)")
  }

  // MARK: Helpers

  /// The app on Đèn as the owner, the stand-in Tuya cloud's keys entered and the master flows' tank with its strips.
  private func launch(_ more: [String] = [], signIn: Bool = true, reset: Bool = true) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["TZ"] = "Asia/Ho_Chi_Minh"
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-seed-tuya-keys"]
      + (reset ? ["-reset-defaults", "-seed-tanks", "master"] + XCUIApplication.standInOwner : ["-fake-accounts", "on", "-fake-owner", "ui-apple"]) + more
    app.launchForFlow()
    if signIn && reset { self.signIn(app) } else { app.openTab("Đèn") }
    return app
  }

  private func signIn(_ app: XCUIApplication) {
    app.openAccount()
    app.signInWithStandInApple()
    app.openTab("Đèn")
  }

  /// "Tạo nút tổng": the lamp (in white), CO2 on and the light's outlet off, ending as `end` says ("60", "120", "tap").
  private func make(_ app: XCUIApplication, end: String, shots: String? = nil) {
    tap(app, "master-create")
    add(app, "master-add-lamp")
    add(app, "master-add-CO2")
    add(app, "master-add-Đèn")
    tap(app, "master-step-Đèn")
    tap(app, "master-choice-Tắt")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    expect(app, "master-co2-warning", contains: "CO2 bật ngoài giờ đèn sáng (12:00–20:00)")
    tap(app, "master-end-\(end)")
    if let shots { shoot("sheet-\(shots)") }
    tap(app, "master-done")
  }

  /// "Thêm thiết bị", then the device.
  private func add(_ app: XCUIApplication, _ id: String) {
    tap(app, "master-add")
    tap(app, id)
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }

  private func tap(_ app: XCUIApplication, _ id: String) {
    let e = element(app, id)
    XCTAssertTrue(e.waitForExistence(timeout: 10), "\(id) missing")
    repeatUntil(e.isHittable, times: 8) { app.swipeUp() }
    e.tap()
  }

  private func expect(_ app: XCUIApplication, _ id: String, contains text: String, timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) {
    let e = element(app, id)
    let found = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", text), object: e)
    XCTAssertEqual(XCTWaiter.wait(for: [found], timeout: timeout), .completed, "\(id): no “\(text)” in “\(e.exists ? e.label : "(missing)")”", file: file, line: line)
  }

  private func expect(_ app: XCUIApplication, _ id: String, lacks text: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertFalse(element(app, id).label.contains(text), "\(id) has “\(text)”", file: file, line: line)
  }

  /// The screen kept with the run, after a moment to settle.
  private func shoot(_ name: String) {
    RunLoop.current.run(until: Date().addingTimeInterval(1))
    let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    shot.name = "shot-master-\(name)"
    shot.lifetime = .keepAlways
    add(shot)
  }
}
