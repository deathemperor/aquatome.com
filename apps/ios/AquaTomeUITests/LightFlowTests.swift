import XCTest

/// The lights screen's main flows, on the simulator's fake light: a WRGB II Slim (firmware 24) holding
/// 12:00–20:00 at 70% with a 30-minute ramp, answering the way the real one did in hands-on tests.
final class LightFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testConnectsAndReadsFirmwareClockAndSavedSchedule() {
    let app = launch()
    connect(app)
    expect(app, "notice", contains: "firmware 24")
    expect(app, "saved", contains: "12:00–20:00 · 70% · sáng dần 30 phút")
    expect(app, "clock", lacks: "chưa đặt")
  }

  func testWritesAPresetThenPutsTheOldScheduleBack() {
    let app = launch()
    connect(app)
    tap(app, "preset-new")
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày.")
    tap(app, "write")
    app.alerts.buttons["Ghi lịch"].tap()
    expect(app, "saved", contains: "13:00–19:00 · 40% · sáng dần 30 phút")
    expect(app, "notice", contains: "Đã ghi lịch: bật 13:00, tắt 19:00.")
    expect(app, "restore", contains: "12:00–20:00 · 70% · sáng dần 30 phút")
    tap(app, "restore")
    expect(app, "saved", contains: "12:00–20:00 · 70% · sáng dần 30 phút")
  }

  func testSetsAClockLostInAPowerCut() {
    let app = launch("-fake-clock-unset")
    connect(app)
    expect(app, "clock", contains: "chưa đặt")
    tap(app, "sync-clock")
    expect(app, "notice", contains: "Đã chỉnh giờ đèn")
    expect(app, "clock", lacks: "chưa đặt")
  }

  func testOldFirmwareCannotWriteSchedules() {
    let app = launch("-fake-old-firmware")
    connect(app)
    expect(app, "notice", contains: "firmware 19: bản này chưa hẹn giờ được")
    XCTAssertFalse(scrolledTo(app, "write").isEnabled)
  }

  func testDisconnectGoesBackToFindingLights() {
    let app = launch()
    connect(app)
    app.buttons["disconnect"].tap()
    XCTAssertTrue(app.buttons["scan"].waitForExistence(timeout: 5))
  }

  // MARK: Helpers

  private func launch(_ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults"] + args
    app.launch()
    return app
  }

  private func connect(_ app: XCUIApplication) {
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    XCTAssertTrue(app.buttons["disconnect"].waitForExistence(timeout: 10), "not connected")
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }

  /// Form rows off the screen aren't built until scrolled to: towards the row if it's built, else down, then up.
  private func scrolledTo(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    let e = element(app, id)
    _ = e.waitForExistence(timeout: 2) // it may still be appearing
    if id == "notice" { return e } // the status bar pinned to the bottom: always in view
    var downs = 0
    let window = app.windows.firstMatch.frame
    for _ in 0..<16 {
      // Clear of the status bar pinned to the bottom of the screen.
      if e.exists && e.isHittable && e.frame.maxY < window.maxY - window.height / 4 { break }
      if e.exists ? e.frame.midY < window.midY : downs >= 6 { app.swipeDown() } else { app.swipeUp(); downs += 1 }
    }
    return e
  }

  private func tap(_ app: XCUIApplication, _ id: String) {
    let e = scrolledTo(app, id)
    XCTAssertTrue(e.waitForExistence(timeout: 5), "\(id) missing")
    e.tap()
  }

  private func expect(_ app: XCUIApplication, _ id: String, contains text: String, file: StaticString = #filePath, line: UInt = #line) {
    wait(app, id, NSPredicate(format: "label CONTAINS %@", text), "“\(text)”", file: file, line: line)
  }

  private func expect(_ app: XCUIApplication, _ id: String, lacks text: String, file: StaticString = #filePath, line: UInt = #line) {
    wait(app, id, NSPredicate(format: "exists == true AND NOT (label CONTAINS %@)", text), "no “\(text)”", file: file, line: line)
  }

  private func wait(_ app: XCUIApplication, _ id: String, _ p: NSPredicate, _ what: String, file: StaticString, line: UInt) {
    let e = scrolledTo(app, id)
    if XCTWaiter.wait(for: [expectation(for: p, evaluatedWith: e)], timeout: 10) != .completed {
      XCTFail("\(id): expected \(what), got “\(e.exists ? e.label : "(missing)")”", file: file, line: line)
    }
  }
}
