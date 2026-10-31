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
    write(app)
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
    XCTAssertFalse(element(app, "notice").exists, "the connected light's notice stayed")
  }

  func testDisconnectWhileReadingTheLightReportsNothing() {
    let app = launch("-fake-slow") // the first status read takes seconds
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    XCTAssertTrue(app.buttons["disconnect"].waitForExistence(timeout: 5), "not connected")
    app.buttons["disconnect"].tap()
    XCTAssertTrue(app.buttons["scan"].waitForExistence(timeout: 5))
    // The read stops without an answer (timeout 2 s, after a 1.5 s frame): that is no error to the reader.
    let notice = element(app, "notice")
    let shown = XCTWaiter.wait(for: [expectation(for: NSPredicate(format: "exists == true"), evaluatedWith: notice)], timeout: 6)
    XCTAssertNotEqual(shown, .completed, "notice after a deliberate disconnect: “\(notice.label)”")
  }

  func testFillsTheFormWithTheLightsSchedule() {
    let app = launch("-fake-other-schedule")
    connect(app)
    expect(app, "saved", contains: "10:00–17:00 · 55% · sáng dần 15 phút")
    expect(app, "hours", contains: "Đèn sáng 7 tiếng mỗi ngày.")
    expect(app, "level-0", contains: "55%")
  }

  func testWritingAScheduleEndsTheManualLevels() {
    let app = launch()
    connect(app)
    scrolledTo(app, "manual-0").adjust(toNormalizedSliderPosition: 0.3)
    expect(app, "manual-0-level", lacks: "–")
    write(app)
    expect(app, "notice", contains: "Đã ghi lịch")
    // The light runs the schedule again: no level set by hand holds now.
    expect(app, "manual-0-level", contains: "–")
  }

  // MARK: Helpers

  private func launch(_ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"] + args
    app.launch()
    app.tabBars.buttons["Đèn"].tap()
    return app
  }

  /// Connects and waits for the first status read (the notice says so), not just the light's screen.
  private func connect(_ app: XCUIApplication) {
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    XCTAssertTrue(app.buttons["disconnect"].waitForExistence(timeout: 10), "not connected")
    expect(app, "notice", contains: "Đã kết nối")
  }

  private func write(_ app: XCUIApplication) {
    tap(app, "write")
    let confirm = app.alerts.buttons["Ghi lịch"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    confirm.tap()
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
    XCTAssertTrue(e.isHittable, "\(id) not reached by scrolling")
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
    // Checked once more after the wait: on a loaded CI runner a snapshot can take the whole timeout, and the screen was
    // already right ("expected X, got X", PR #212).
    if XCTWaiter.wait(for: [expectation(for: p, evaluatedWith: e)], timeout: 10) != .completed, !p.evaluate(with: e) {
      XCTFail("\(id): expected \(what), got “\(e.exists ? e.label : "(missing)")”", file: file, line: line)
    }
  }
}
