import XCTest

/// The lights screen's main flows, on the simulator's fake light: a WRGB II Slim (firmware 24) holding
/// 12:00–20:00 at 70% with a 30-minute ramp, answering the way the real one did in hands-on tests. The launch arguments
/// that change it are listed on `FakeRadio`.
final class LightFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testConnectsANewLightWithItsSetupSteps() {
    let app = launch()
    connect(app)
    expect(app, "notice", contains: "Đèn mới: làm theo các bước")
    XCTAssertTrue(element(app, "steps").exists, "no setup steps for a new light")
    expect(app, "light-meta", contains: "firmware 24")
    expect(app, "clock", contains: "Đồng hồ đèn đúng giờ.")
    // The light's own schedule is never shown as what it runs: only what AquaTome wrote, and nothing is yet.
    expect(app, "saved", contains: "Chưa ghi lịch nào từ AquaTome.")
    XCTAssertFalse(element(app, "quick-auto").isEnabled, "“Theo lịch” with nothing set by hand")
  }

  func testTheLightsOwnScheduleIsNeverShownAsWhatItRuns() {
    // The fake light holds 10:00–17:00 at 55% (the form starts at 12:00–20:00, 70%): none of it reaches the screen.
    let app = launch("-fake-other-schedule")
    connect(app)
    expect(app, "saved", contains: "Chưa ghi lịch nào từ AquaTome.")
    expect(app, "hours", contains: "Đèn sáng 8 tiếng mỗi ngày.")
    expect(app, "level-0", contains: "70%")
  }

  func testPutsRightAClockThatIsSevenHoursSlow() {
    let app = launch("-fake-clock-slow")
    connect(app)
    expect(app, "clock", contains: "Đồng hồ đèn chậm 7 tiếng: lịch sẽ chạy lệch.")
    tap(app, "sync-clock")
    expect(app, "notice", contains: "Đã chỉnh giờ đèn")
    expect(app, "clock", contains: "Đồng hồ đèn đúng giờ.")
  }

  func testSetsAClockLostInAPowerCut() {
    let app = launch("-fake-clock-unset")
    connect(app)
    expect(app, "clock", contains: "Đèn mất giờ, có thể do mất điện")
    tap(app, "sync-clock")
    expect(app, "notice", contains: "Đã chỉnh giờ đèn")
    expect(app, "clock", contains: "Đồng hồ đèn đúng giờ.")
  }

  func testWritesAPresetThenAnotherThenUndoesBackToTheFirst() {
    let app = launch()
    connect(app)
    tap(app, "preset-new")
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày.")
    write(app) // the first write asks: it replaces whatever the light holds
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    expect(app, "saved", contains: "Lịch 13:00–19:00 · 40%, sáng dần 30 phút")
    expect(app, "saved", contains: "Ghi từ AquaTome ngày")
    XCTAssertFalse(element(app, "steps").exists, "setup steps after the first write")
    expect(app, "write", contains: "Đèn đang dùng lịch này")
    XCTAssertFalse(element(app, "write").isEnabled)

    // The second needs no confirmation (the first is known), and can be undone.
    tap(app, "preset-settled")
    tap(app, "write")
    XCTAssertFalse(app.alerts.firstMatch.waitForExistence(timeout: 1), "asked again with a known schedule on the light")
    expect(app, "notice", contains: "Đã ghi: bật 12:00, tắt 20:00.")
    expect(app, "notice-action", contains: "Hoàn tác")
    tap(app, "notice-action")
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    expect(app, "saved", contains: "Lịch 13:00–19:00 · 40%")
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày.")
    XCTAssertFalse(element(app, "notice-action").exists, "an undo of the undo")

    // Off by hand, then back: the schedule AquaTome wrote is written again as it was (clear, scene, the same bytes).
    tap(app, "quick-off")
    expect(app, "hand", contains: "Đèn đang tắt bằng tay")
    tap(app, "quick-auto")
    expect(app, "notice", contains: "Đèn chạy lại theo lịch.")
    expectFrames(app, ".* 07 02 00 .. \\| .* 05 28 ff ff .. \\| .* 05 12 ff ff .. \\| a5 01 13 .. .. 19 0d 00 13 00 1e 7f 28 28 28 ff .*")
  }

  func testKeepsTheLightAndWhatWasWrittenOnATank() {
    let app = launch()
    connect(app)
    // Met: kept on a new tank, as the site does, with nothing written yet.
    app.tabBars.buttons["Bể của tôi"].tap()
    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the light wasn't kept on a tank")
    XCTAssertTrue(row.label.contains("Bể của tôi") && row.label.contains("1 đèn"), row.label)
    row.tap()
    XCTAssertTrue(text(app, "WRGB II Slim").waitForExistence(timeout: 5))
    XCTAssertTrue(text(app, "Chưa lưu lịch nào cho đèn này.").exists)

    app.tabBars.buttons["Đèn"].tap()
    tap(app, "preset-new")
    write(app)
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    app.tabBars.buttons["Bể của tôi"].tap()
    XCTAssertTrue(text(app, "13:00 → 19:00 · sáng dần 30 phút · Bể mới trồng").waitForExistence(timeout: 5),
                  "the schedule written wasn't kept with its preset's name")
  }

  func testASavedLightIsListedAfterARelaunchAndConnectsWithWhatWasWritten() {
    var app = launch()
    connect(app)
    tap(app, "preset-new")
    write(app)
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    tap(app, "preset-settled") // edited but not written: kept as the plan, not as the light's
    app.terminate()

    app = launch(reset: false)
    expect(app, "card-title", contains: "Đèn đã lưu trên máy này")
    expect(app, "saved-meta", contains: "WRGB II Slim · lịch 13:00–19:00 · 40%")
    expect(app, "hours", contains: "Đèn sáng 8 tiếng mỗi ngày.") // the plan left last time
    tap(app, "saved-light")
    expect(app, "notice", contains: "Đã kết nối WRGB II Slim.")
    XCTAssertFalse(element(app, "steps").exists, "setup steps for a light already written to")
    expect(app, "saved", contains: "Lịch 13:00–19:00 · 40%, sáng dần 30 phút")
    // Not edited since the app opened: the form takes what was written to this light.
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày.")
  }

  func testThePlanIsKeptWithoutALight() {
    var app = launch()
    tap(app, "preset-algae")
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày.")
    XCTAssertFalse(element(app, "write").isEnabled)
    app.terminate()
    app = launch(reset: false)
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày.")
  }

  func testQuickActionsLeaveTheScheduleAndComeBackToIt() {
    let app = launch()
    connect(app)
    tap(app, "quick-off")
    expect(app, "notice", contains: "Đã tắt đèn.")
    expect(app, "hand", contains: "Đèn đang tắt bằng tay, không chạy theo lịch.")
    tap(app, "quick-full")
    expect(app, "hand", contains: "Đèn đang chỉnh tay (100%), không chạy theo lịch.")
    tap(app, "quick-auto")
    expect(app, "notice", contains: "Đèn chạy lại theo lịch.")
    XCTAssertTrue(element(app, "hand").waitForNonExistence(timeout: 5), "still shown as set by hand")
    XCTAssertFalse(element(app, "quick-auto").isEnabled)
    // Nothing written from AquaTome yet: the light only goes back to the schedule it holds, one frame after the levels.
    expectFrames(app, ".* 07 02 64 .. \\| 5a 01 08 .. .. 05 12 ff ff ..")
  }

  func testADroppedLightConnectsAgainWithoutAScan() {
    // The fake light drops at the first level set by hand, and no scan sees it again: only connecting to it as it was
    // works.
    let app = launch("-fake-drop")
    connect(app)
    tap(app, "quick-off")
    expect(app, "notice", contains: "Mất kết nối với đèn.")
    expect(app, "card-title", contains: "Mất kết nối với WRGB II Slim")
    expect(app, "saved-light", contains: "Kết nối lại")
    tap(app, "notice-action")
    expect(app, "notice", contains: "Đã kết nối WRGB II Slim.")
    expect(app, "light-meta", contains: "firmware 24")
  }

  func testALightThatDropsWhileBeingReadCanBeConnectedAgain() {
    let app = launch("-fake-drop-reading")
    tap(app, "scan")
    tap(app, "light")
    expect(app, "notice", contains: "Mất kết nối với đèn.")
    XCTAssertTrue(element(app, "scan").waitForExistence(timeout: 5), "the card stayed on “Đang kết nối…”")
    tap(app, "notice-action")
    expect(app, "notice", contains: "Đã kết nối WRGB II Slim.")
  }

  func testRenamesAndForgetsTheLight() {
    let app = launch()
    connect(app)
    let field = scrolledTo(app, "nickname")
    field.tap()
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 20) + "Bể phòng khách\n")
    expect(app, "notice", contains: "Đã đổi tên đèn.")
    expect(app, "light-meta", contains: "WRGB II Slim · firmware 24")
    tap(app, "disconnect")
    expect(app, "saved-name", contains: "Bể phòng khách")
    tap(app, "forget")
    expect(app, "notice", contains: "Đã quên đèn trên máy này.")
    expect(app, "card-title", contains: "Kết nối đèn của bạn")
    XCTAssertFalse(element(app, "saved-name").exists)
  }

  func testWithoutBluetoothTheScheduleCanStillBePlanned() {
    let app = launch("-fake-no-bluetooth")
    expect(app, "unsupported", contains: "AquaTome chưa được dùng Bluetooth.")
    XCTAssertTrue(element(app, "settings").exists, "no way to the Settings app")
    XCTAssertFalse(element(app, "scan").exists)
    tap(app, "preset-new")
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày.")
    XCTAssertFalse(element(app, "write").isEnabled)
  }

  func testOldFirmwareCannotWriteSchedules() {
    let app = launch("-fake-old-firmware")
    connect(app)
    expect(app, "notice", contains: "firmware 19: bản này chưa hẹn giờ được")
    XCTAssertFalse(element(app, "write").isEnabled)
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
    XCTAssertTrue(app.buttons["disconnect"].waitForExistence(timeout: 5), "not connecting")
    app.buttons["disconnect"].tap()
    XCTAssertTrue(app.buttons["scan"].waitForExistence(timeout: 5))
    // The read stops without an answer (timeout 2 s, after a 1.5 s frame): that is no error to the reader.
    let notice = element(app, "notice")
    let shown = XCTWaiter.wait(for: [expectation(for: NSPredicate(format: "exists == true"), evaluatedWith: notice)], timeout: 6)
    XCTAssertNotEqual(shown, .completed, "notice after a deliberate disconnect: “\(notice.label)”")
  }

  func testWritingAScheduleEndsTheManualLevels() {
    let app = launch()
    connect(app)
    scrolledTo(app, "manual-0").adjust(toNormalizedSliderPosition: 0.3)
    expect(app, "manual-0-level", lacks: "–")
    write(app)
    expect(app, "notice", contains: "Đã ghi")
    // The light runs the schedule again: no level set by hand holds now.
    expect(app, "manual-0-level", contains: "–")
  }

  // MARK: Helpers

  private func launch(_ args: String..., reset: Bool = true) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"] + (reset ? ["-reset-defaults"] : []) + args
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
    expect(app, "notice", contains: "Đã kết nối")
  }

  private func write(_ app: XCUIApplication) {
    tap(app, "write")
    let confirm = app.alerts.buttons["Ghi lịch"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    confirm.tap()
  }

  private func text(_ app: XCUIApplication, _ part: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", part)).firstMatch
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }

  /// Scrolled until `e` is clear of the navigation bar above and the status bar pinned below (the content scrolls under
  /// both), however tall the notice in it is.
  private func scrolledTo(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    let e = element(app, id)
    _ = e.waitForExistence(timeout: 2) // it may still be appearing
    if id.hasPrefix("notice") { return e } // the status bar pinned to the bottom: always in view
    var downs = 0
    // Read once (each query costs the test a moment): the bars don't move while the content scrolls. The navigation
    // bar is at its tallest here or taller than it will be, so the margin only grows.
    let window = app.windows.firstMatch.frame
    let notice = element(app, "notice")
    let bar = app.navigationBars.firstMatch
    let top = bar.exists ? bar.frame.maxY + 8 : window.minY
    let bottom = min(window.maxY - window.height / 5, notice.exists ? notice.frame.minY - 16 : .infinity)
    for _ in 0..<20 {
      let f = e.exists ? e.frame : nil
      if let f, f.minY > top, f.maxY < bottom { break }
      // Not built yet (off the screen): down the screen first, then back up.
      let up = f.map { $0.midY > (top + bottom) / 2 } ?? (downs < 8)
      if up { downs += 1 }
      drag(app, up: up)
    }
    return e
  }

  /// A third of the screen, dragged at its right edge (clear of sliders and handles) and held: no coasting, so the next
  /// tap lands where the element was seen.
  private func drag(_ app: XCUIApplication, up: Bool) {
    let a = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: up ? 0.65 : 0.3))
    let b = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: up ? 0.3 : 0.65))
    a.press(forDuration: 0.05, thenDragTo: b, withVelocity: .default, thenHoldForDuration: 0.2)
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

  /// The fake light's last frames (hex, " | " between them), as the app shows them to the tests, match `pattern`.
  private func expectFrames(_ app: XCUIApplication, _ pattern: String, file: StaticString = #filePath, line: UInt = #line) {
    wait(app, "frames", NSPredicate(format: "label MATCHES %@", pattern), "frames like /\(pattern)/", file: file, line: line)
  }

  /// Every element of this screen is there without scrolling (it isn't a lazy list): only taps need to scroll.
  private func wait(_ app: XCUIApplication, _ id: String, _ p: NSPredicate, _ what: String, file: StaticString, line: UInt) {
    let e = element(app, id)
    // Checked once more after the wait: on a loaded CI runner a snapshot can take the whole timeout, and the screen was
    // already right ("expected X, got X", PR #212).
    if XCTWaiter.wait(for: [expectation(for: p, evaluatedWith: e)], timeout: 10) != .completed, !p.evaluate(with: e) {
      XCTFail("\(id): expected \(what), got “\(e.exists ? e.label : "(missing)")”", file: file, line: line)
    }
  }
}
