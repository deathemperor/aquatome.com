import XCTest

/// The Love Ecology card's states as the Design Lead named them for its shots (20 Nov), each in light and dark at the
/// default text size, and those Design marked at the largest text too: idle; the last sent, today and yesterday; a tap
/// sending and sent (a colour, then Tắt); a drag of Độ sáng, its finger down (held by `-lamp-drag-holds`), going and sent;
/// Khác's sheet and its colour sent; a send cut by leaving the app, then Gửi lại, and one cut by Bluetooth as it began;
/// Bluetooth off and not allowed; a trial sent; the card while the master button sends; and a reader's Đèn, no card.
/// Kept with the run as `shot-le-…`.
///
/// Each shot first, then its checks (`continueAfterFailure`: a check that fails doesn't cost the shots after it): the line
/// row keeps its height, the trial row under it never moving; at the largest text the colours fewer a row than the four
/// from XL, none past the screen's side, and the slider full width. The dots' size and the swatches' rings in dark are for
/// the eye.
///
/// On the night Mac only, for Design's review: skipped unless the run sets `TEST_RUNNER_LOVE_ECOLOGY_SHOTS=1` (xcodebuild
/// hands it to the tests as LOVE_ECOLOGY_SHOTS). On GitHub's Macs they would add half an hour to every full run.
final class LoveEcologyShotsFlowTests: XCTestCase {
  override func setUpWithError() throws {
    try XCTSkipUnless(ProcessInfo.processInfo.environment["LOVE_ECOLOGY_SHOTS"] == "1",
                      "the Design Lead's shots of the Love Ecology card: on the night Mac (TEST_RUNNER_LOVE_ECOLOGY_SHOTS=1)")
    continueAfterFailure = true
  }

  private enum Way: String {
    case light, dark, largestLight = "largest-light", largestDark = "largest-dark"
    var dark: Bool { self == .dark || self == .largestDark }
    var largest: Bool { self == .largestLight || self == .largestDark }
  }

  // 1, 3, 4 and 10: idle, a colour then Tắt sending and sent, a trial sent.
  func testIdleSendingAndSentLight() { idleSendingAndSent(.light) }
  func testIdleSendingAndSentDark() { idleSendingAndSent(.dark) }
  func testIdleSendingAndSentLargestLight() { idleSendingAndSent(.largestLight) }
  func testIdleSendingAndSentLargestDark() { idleSendingAndSent(.largestDark) }

  // 2: the last sent, today and yesterday.
  func testLastSentLight() { lastSent(.light) }
  func testLastSentDark() { lastSent(.dark) }

  // 5: Độ sáng's drag, going and sent.
  func testBrightnessLight() { brightness(.light) }
  func testBrightnessDark() { brightness(.dark) }
  func testBrightnessLargestLight() { brightness(.largestLight) }
  func testBrightnessLargestDark() { brightness(.largestDark) }

  // 6: Khác's sheet, and its colour sent.
  func testOtherColourLight() { otherColour(.light) }
  func testOtherColourDark() { otherColour(.dark) }
  func testOtherColourLargestLight() { otherColour(.largestLight) }
  func testOtherColourLargestDark() { otherColour(.largestDark) }

  // 7: cut by leaving the app, then Gửi lại; cut by Bluetooth as it began.
  func testCutByLeavingLight() { cutByLeaving(.light) }
  func testCutByLeavingDark() { cutByLeaving(.dark) }
  func testCutByLeavingLargestLight() { cutByLeaving(.largestLight) }
  func testCutByLeavingLargestDark() { cutByLeaving(.largestDark) }
  func testCutByBluetoothLight() { problem(.light, "07-cut-bluetooth", ["-fake-lamp-cuts", "1"], "Không rõ đèn Love Ecology đã nhận lệnh chưa. Bạn xem lại đèn.") }
  func testCutByBluetoothDark() { problem(.dark, "07-cut-bluetooth", ["-fake-lamp-cuts", "1"], "Không rõ đèn Love Ecology đã nhận lệnh chưa. Bạn xem lại đèn.") }

  // 8: Bluetooth off; not allowed.
  func testBluetoothOffLight() { problem(.light, "08-off", ["-fake-lamp-off"], "Bật Bluetooth để gửi lệnh tới đèn.") }
  func testBluetoothOffDark() { problem(.dark, "08-off", ["-fake-lamp-off"], "Bật Bluetooth để gửi lệnh tới đèn.") }
  func testBluetoothNotAllowedLight() { problem(.light, "08-refused", ["-fake-lamp-refused"], refused) }
  func testBluetoothNotAllowedDark() { problem(.dark, "08-refused", ["-fake-lamp-refused"], refused) }
  func testBluetoothNotAllowedLargestLight() { problem(.largestLight, "08-refused", ["-fake-lamp-refused"], refused) }
  func testBluetoothNotAllowedLargestDark() { problem(.largestDark, "08-refused", ["-fake-lamp-refused"], refused) }

  // 9: the card while the master button sends.
  func testWhileTheMasterButtonSendsLight() { whileTheButtonSends(.light) }
  func testWhileTheMasterButtonSendsDark() { whileTheButtonSends(.dark) }

  // 11: a reader, not the owner.
  func testAReadersLightsTab() {
    let app = signedIn(.light, owner: false)
    XCTAssertTrue(app.navigationBars["Đèn"].waitForExistence(timeout: 5), "not on Đèn")
    shoot("11-reader", .light)
    XCTAssertFalse(element(app, "lamp-level").exists, "the Love Ecology card for a reader who isn't the owner")
    XCTAssertFalse(element(app, "lamp-off").exists, "the Love Ecology card for a reader who isn't the owner")
  }

  private let refused = "AquaTome chưa được dùng Bluetooth. Bật trong Cài đặt → AquaTome → Bluetooth."

  private func idleSendingAndSent(_ way: Way) {
    // At 35%, as Design drew it; on air 8 s, so "sending" holds for its shot (the stand-in answers at once).
    let app = signedIn(way, kept(level: 35) + ["-lamp-on-air", "8"])
    expect(app, "lamp-status", contains: "Chưa gửi lệnh nào từ máy này")
    shots(app, "01-idle", way)
    let rest = rowGap(app)
    if way.largest { largestChecks(app) }
    tap(app, "lamp-red")
    expect(app, "lamp-status", contains: "Đang gửi “Đỏ”, 35%…")
    shots(app, "03-sending-red", way)
    same(app, rest, "a colour sending")
    expect(app, "lamp-status", contains: "Đã gửi “Đỏ”, 35% lúc", timeout: 20)
    shots(app, "04-sent-red", way)
    same(app, rest, "a colour sent")
    tap(app, "lamp-off")
    expect(app, "lamp-status", contains: "Đang gửi “Tắt”…")
    shots(app, "03-sending-off", way)
    expect(app, "lamp-status", contains: "Đã gửi “Tắt” lúc", timeout: 20)
    shots(app, "04-sent-off", way)
    same(app, rest, "Tắt sent")
    tap(app, "lamp-trial-off")
    expect(app, "lamp-status", contains: "Đợi 10 giây rồi bấm tiếp.", timeout: 20)
    shots(app, "10-trial", way)
    same(app, rest, "a trial sent")
  }

  private func lastSent(_ way: Way) {
    // Stamped as the app launches: "today" even a minute after midnight.
    var app = signedIn(way, kept(level: 35, last: "green", at: Date()))
    expect(app, "lamp-status", contains: "Lần cuối máy này gửi: “Xanh lá”, 35% · ")
    shots(app, "02-last-today", way)
    app.terminate()
    app = signedIn(way, kept(level: 35, last: "green", at: Date().addingTimeInterval(-86_400)))
    expect(app, "lamp-status", contains: "Lần cuối máy này gửi: “Xanh lá”, 35% · hôm qua ")
    shots(app, "02-last-yesterday", way)
  }

  private func brightness(_ way: Way) {
    // The finger down: the drag's pause and lift send nothing here (`-lamp-drag-holds`), so its words stay to be shot.
    var app = signedIn(way, kept(level: 35, last: "red", at: Date()) + ["-lamp-drag-holds"])
    let rest = rowGap(app)
    var level = dragSlider(app, "lamp-level", to: 59.0 / 99)
    expect(app, "lamp-status", contains: "Ngừng kéo để gửi “Đỏ”, \(level)")
    shots(app, "05-drag", way)
    same(app, rest, "a drag")
    app.terminate()
    app = signedIn(way, kept(level: 35, last: "red", at: Date()) + ["-lamp-on-air", "8"])
    level = dragSlider(app, "lamp-level", to: 59.0 / 99)
    expect(app, "lamp-status", contains: "Đang gửi “Đỏ”, \(level)…")
    shots(app, "05-going", way)
    same(app, rest, "a drag's colour going")
    expect(app, "lamp-status", contains: "Đã gửi “Đỏ”, \(level) lúc", timeout: 20)
    shots(app, "05-sent", way)
    same(app, rest, "a drag's colour sent")
  }

  private func otherColour(_ way: Way) {
    let app = signedIn(way, kept(level: 35))
    tap(app, "lamp-other")
    let wheel = element(app, "lamp-wheel")
    XCTAssertTrue(wheel.waitForExistence(timeout: 5), "no wheel")
    shoot("06-sheet", way)
    guard !way.largest else { return }
    // From the centre down, to about 80%.
    wheel.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
      .press(forDuration: 0.1, thenDragTo: wheel.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)))
    expect(app, "lamp-status", contains: "Đã gửi màu tự chọn, 35% lúc", timeout: 15)
    element(app, "wheel-done").tap()
    XCTAssertTrue(element(app, "wheel-done").waitForNonExistence(timeout: 5), "the sheet stayed")
    shots(app, "06-sent-wheel", way)
  }

  private func cutByLeaving(_ way: Way) {
    // The light's gap made 8 s (`-lamp-gap`): green still waits when the app leaves the front.
    let app = signedIn(way, kept(level: 35) + ["-lamp-gap", "8"])
    let rest = rowGap(app)
    tap(app, "lamp-red")
    tap(app, "lamp-green")
    expect(app, "lamp-status", contains: "Đang gửi “Xanh lá”, 35%…")
    leaveAndComeBack(app)
    expect(app, "lamp-status", contains: "Gửi “Xanh lá”, 35% bị ngắt vì bạn rời ứng dụng.")
    shots(app, "07-cut-leaving", way)
    same(app, rest, "a send cut by leaving, with Gửi lại")
    tap(app, "lamp-again")
    expect(app, "lamp-status", contains: "Đã gửi “Xanh lá”, 35% lúc", timeout: 20)
    shots(app, "07-again-sent", way)
    same(app, rest, "Gửi lại sent")
  }

  /// A tap on Đỏ that meets a problem: its line, with the triangle.
  private func problem(_ way: Way, _ name: String, _ flags: [String], _ line: String) {
    let app = signedIn(way, kept(level: 35) + flags)
    let rest = rowGap(app)
    tap(app, "lamp-red")
    expect(app, "lamp-status", contains: line, timeout: 15)
    shots(app, name, way)
    same(app, rest, name)
  }

  private func whileTheButtonSends(_ way: Way) {
    // The button's lamp step waits the light's gap after Đỏ (a minute here): the card is disabled the while.
    let app = signedIn(way, kept(level: 35) + ["-seed-tuya-keys", "-seed-tanks", "master", "-lamp-gap", "60"])
    tap(app, "master-create")
    sheetTap(app, "master-add")
    sheetTap(app, "master-add-lamp")
    sheetTap(app, "master-done")
    tap(app, "lamp-red")
    expect(app, "lamp-status", contains: "Đã gửi “Đỏ”, 35% lúc", timeout: 20)
    tap(app, "master-start")
    shots(app, "09-button-sending", way)
    XCTAssertFalse(element(app, "lamp-green").isEnabled, "the card took taps while the button sent")
    XCTAssertFalse(element(app, "lamp-level").isEnabled, "the slider moved while the button sent")
  }

  // MARK: Helpers

  private let largest = "UICTContentSizeCategoryAccessibilityXXXL"

  /// The owner (or a reader) signed in on the stand-in server, on Đèn.
  private func signedIn(_ way: Way, _ more: [String] = [], owner: Bool = true) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["TZ"] = "Asia/Ho_Chi_Minh"
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults",
                           "-fake-accounts", "on", "-reset-fake-server"] + (owner ? ["-fake-owner", "ui-apple"] : [])
      + (way.dark ? ["-dark"] : []) + (way.largest ? ["-UIPreferredContentSizeCategoryName", largest] : []) + more
    app.launchForFlow()
    app.openAccount()
    app.signInWithStandInApple()
    app.openTab("Đèn")
    return app
  }

  /// What this phone keeps of the card (`-loveEcology.sent`): the slider's level, and the last sent if any (a swatch at
  /// that level, then also the card's colour).
  private func kept(level: Int, last swatch: String? = nil, at: Date = Date()) -> [String] {
    let json = swatch.map { s in
      #"{"last":{"send":{"choice":{"swatch":{"_0":"\#(s)"}},"level":\#(level)},"at":\#(at.timeIntervalSinceReferenceDate)},"colour":{"swatch":{"_0":"\#(s)"}},"level":\#(level)}"#
    } ?? #"{"level":\#(level)}"#
    return ["-loveEcology.sent", "\"" + json.replacingOccurrences(of: "\"", with: "\\\"") + "\""]
  }

  /// Each state at the same scroll, Bật's row near the top, for Design to set side by side. At the largest text, where one
  /// screen doesn't hold the colours and the line, a second frame with the line row.
  private func shots(_ app: XCUIApplication, _ name: String, _ way: Way) {
    place(app, "lamp-on", at: 0.2)
    shoot(name + (way.largest ? "-colours" : ""), way)
    if way.largest {
      place(app, "lamp-status", at: 0.45)
      shoot(name + "-line", way)
    }
  }

  /// The screen kept with the run, after a moment to settle.
  private func shoot(_ name: String, _ way: Way) {
    RunLoop.current.run(until: Date().addingTimeInterval(1))
    let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    shot.name = "shot-le-\(name)-\(way.rawValue)"
    shot.lifetime = .keepAlways
    add(shot)
  }

  /// From the slider's top to the trial row's, under the line row: the line row's height and what's around it.
  private func rowGap(_ app: XCUIApplication) -> CGFloat {
    _ = scrolledTo(app, "lamp-trial-off")
    return element(app, "lamp-trial-off").frame.minY - element(app, "lamp-level").frame.minY
  }

  private func same(_ app: XCUIApplication, _ rest: CGFloat, _ state: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertEqual(rowGap(app), rest, accuracy: 0.5, "\(state) moved the trial row: the line row changed height", file: file, line: line)
  }

  /// At the largest text: the colours fewer a row than the four from XL, none past the screen's side; the slider full width.
  private func largestChecks(_ app: XCUIApplication) {
    place(app, "lamp-on", at: 0.2)
    let window = app.windows.firstMatch.frame
    let swatches = ["white", "red", "orange", "yellow", "green", "cyan", "blue", "magenta", "other"]
      .map { element(app, "lamp-" + $0) }.filter(\.exists)
    guard let top = swatches.map(\.frame.minY).min() else { return XCTFail("no colours") }
    let row = swatches.filter { abs($0.frame.minY - top) < 4 }.count
    XCTAssertLessThan(row, 4, "at the largest text \(row) colours a row, as many as from XL")
    for s in swatches {
      XCTAssertTrue(s.frame.minX >= window.minX && s.frame.maxX <= window.maxX, "\(s.identifier) past the screen's side")
    }
    XCTAssertGreaterThan(element(app, "lamp-level").frame.width, window.width * 0.75, "the slider not full width at the largest text")
  }

  /// A slider's thumb dragged to about `position` (0 to 1) in one movement and let go at once, and the value it landed on.
  private func dragSlider(_ app: XCUIApplication, _ id: String, to position: CGFloat) -> String {
    let s = scrolledTo(app, id)
    let row = s.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5))
    let x = 14 + s.normalizedSliderPosition * (s.frame.width - 28)
    row.withOffset(CGVector(dx: x, dy: 0)).press(forDuration: 0.1, thenDragTo: row.withOffset(CGVector(dx: 14 + position * (s.frame.width - 28), dy: 0)))
    return element(app, id).value as? String ?? ""
  }

  private func leaveAndComeBack(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
    XCUIDevice.shared.press(.home)
    let states = [XCUIApplication.State.runningBackground, .runningBackgroundSuspended].map { NSNumber(value: $0.rawValue) }
    let gone = expectation(for: NSPredicate(format: "state IN %@", states), evaluatedWith: app)
    XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 30), .completed, "the app didn't go to the background", file: file, line: line)
    app.activate()
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }

  private func expect(_ app: XCUIApplication, _ id: String, contains text: String, timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) {
    let e = element(app, id)
    let found = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label CONTAINS %@", text), object: e)
    XCTAssertEqual(XCTWaiter.wait(for: [found], timeout: timeout), .completed, "\(id): no “\(text)” in “\(e.exists ? e.label : "(missing)")”", file: file, line: line)
  }

  private func tap(_ app: XCUIApplication, _ id: String, file: StaticString = #filePath, line: UInt = #line) {
    let e = scrolledTo(app, id)
    XCTAssertTrue(e.waitForExistence(timeout: 5), "\(id) missing", file: file, line: line)
    XCTAssertTrue(e.isHittable, "\(id) not reached by scrolling", file: file, line: line)
    e.tap()
  }

  /// In the master button's sheet: up only if at all, as a drag down would close it.
  private func sheetTap(_ app: XCUIApplication, _ id: String, file: StaticString = #filePath, line: UInt = #line) {
    let e = element(app, id)
    XCTAssertTrue(e.waitForExistence(timeout: 10), "\(id) missing", file: file, line: line)
    for _ in 0..<6 where !e.isHittable {
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.65))
      from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: -120)), withVelocity: .default, thenHoldForDuration: 0.2)
    }
    e.tap()
  }

  /// Scrolled so `id`'s top is at `fraction` of the window's height, within 12 points.
  private func place(_ app: XCUIApplication, _ id: String, at fraction: CGFloat) {
    let e = scrolledTo(app, id)
    let window = app.windows.firstMatch.frame
    let target = window.minY + window.height * fraction
    var last: CGRect?
    for _ in 0..<6 {
      let f = e.frame
      if abs(target - f.minY) < 12 || f == last { break }
      last = f
      drag(app, by: max(-window.height / 3, min(window.height / 3, (target - f.minY) / 1.5)), above: 0.65)
    }
  }

  /// Scrolled until the element is clear of the bars, as LightFlowTests does.
  private func scrolledTo(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    let e = element(app, id)
    _ = e.waitForExistence(timeout: 2)
    var downs = 0
    let window = app.windows.firstMatch.frame
    let pinned = ["notice", "summary", "write"].map { element(app, $0) }.filter { $0.exists }.map { $0.frame.minY }.min() ?? .infinity
    let bar = app.navigationBars.firstMatch
    let top = bar.exists ? bar.frame.maxY + 8 : window.minY
    let bottom = min(window.maxY - window.height / 5, pinned - 16)
    let third = window.height / 3
    for _ in 0..<20 {
      let f = e.exists ? e.frame : nil
      if let f, f.minY > top, f.maxY < bottom { break }
      if let f {
        drag(app, by: max(-third, min(third, ((top + bottom) / 2 - f.midY) / 1.5)), above: bottom / window.height)
      } else {
        drag(app, by: downs < 8 ? -third : third, above: bottom / window.height)
        downs += 1
      }
    }
    return e
  }

  /// A drag of `dy` points (up when negative) at the screen's right edge, held before it lets go so the content settles.
  private func drag(_ app: XCUIApplication, by dy: CGFloat, above: CGFloat) {
    let a = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: dy < 0 ? min(0.65, above) : 0.3))
    a.press(forDuration: 0.05, thenDragTo: a.withOffset(CGVector(dx: 0, dy: dy)), withVelocity: .default, thenHoldForDuration: 0.2)
  }
}
