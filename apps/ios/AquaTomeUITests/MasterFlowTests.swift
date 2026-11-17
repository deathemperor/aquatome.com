import XCTest

/// The master button on Đèn (Design Lead's master/spec.md): made in its sheet (CO2 off only, no heater), pressed, ended
/// by a tap or by the clock, and what it changed put back by the phone; the owner's test of a plug's countdown, both ways;
/// on the stand-in Tuya cloud's strips (the light's outlet has a countdown) and the simulator's stand-in lamp, as the
/// owner's account. And its states for the Design Lead's parity check, kept with the run (`shot-master-…`): none yet, the
/// sheet, CO2's screen, ready, running, running until Kết thúc, light and dark, at the default and the largest text.
final class MasterFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testMakesTheButtonPressesItAndEndsItEarlyPuttingBackWhatItChanged() {
    let app = launch(signIn: false)
    XCTAssertFalse(element(app, "master-create").waitForExistence(timeout: 2), "the master button before the owner signed in")
    signIn(app)
    make(app, end: "60", light: true)
    expect(app, "master-name", contains: "Ngắm bể")
    expect(app, "master-summary", contains: "Đèn sáng, CO2 tắt, quạt tắt, đèn tắt · 1 giờ")
    tap(app, "master-start")
    // The lamp on in white, CO2 and the fan off (both off already), the light's outlet off; no countdown written.
    expect(app, "master-log", contains: "lamp on+white", timeout: 40)
    expect(app, "master-log", contains: "switch_2 off | switch_3 off | switch_1 off")
    expect(app, "master-log", lacks: "countdown")
    // "1:00" on the card; VoiceOver's words.
    expect(app, "master-left", contains: "còn 1 giờ")
    expect(app, "master-summary", contains: "· kết thúc lúc ")
    XCTAssertTrue(element(app, "master-end").waitForExistence(timeout: 20), "not running")
    // Kept: it runs on after a relaunch.
    let again = launch(signIn: false, reset: false)
    XCTAssertTrue(element(again, "master-left").waitForExistence(timeout: 10), "not running after a relaunch")
    tap(again, "master-end")
    // The lamp put back the other way (nothing was sent to it before). The stand-in cloud starts afresh at a launch,
    // its light's outlet on again: to the phone it changed during the run, so it's left as it is, and the card says so.
    // CO2 and the fan were off already: nothing to put back.
    expect(again, "master-log", contains: "lamp back off", timeout: 40)
    expect(again, "master-notes", contains: "Ổ Đèn đã đổi trong lúc chạy nên AquaTome để nguyên.")
    expect(again, "master-log", lacks: "switch_1 back")
    expect(again, "master-log", lacks: "switch_2 back")
    XCTAssertTrue(element(again, "master-start").waitForExistence(timeout: 40), "not ready again")
    XCTAssertFalse(element(again, "master-problems").exists, element(again, "master-problems").label)
    shoot("left-as-is")
  }

  func testEndsByTheClockAndPutsBackTheLastColourSentToTheLamp() {
    let app = launch(["-master-ends-in", "6"])
    // The card's yellow, sent before: what the lamp goes back to.
    tap(app, "lamp-yellow")
    expect(app, "lamp-status", contains: "Đã gửi “Vàng”")
    make(app, end: "tap", light: true)
    expect(app, "master-summary", contains: "· đến khi bạn bấm Kết thúc")
    tap(app, "master-start")
    expect(app, "master-log", contains: "lamp on+white", timeout: 40)
    // Ended by the clock (six seconds here), the app open: everything back from the phone.
    expect(app, "master-log", contains: "lamp back on+yellow", timeout: 40)
    expect(app, "master-log", contains: "switch_1 back on")
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
    XCTAssertTrue(element(app, "master-start").waitForExistence(timeout: 40), "not ready again")
  }

  func testTheOwnersCountdownTrialTriesBothWaysAndLeavesTheOutletOn() {
    let app = launch(["-countdown-trial-seconds", "3"])
    // The stand-in strip's light outlet is on and has a countdown; CO2 is never offered.
    tap(app, "trial-pick")
    XCTAssertFalse(app.buttons["CO2"].exists, "CO2 offered for the trial")
    let light = app.buttons["Đèn"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "the light's outlet not offered")
    light.tap()
    tap(app, "trial-run")
    XCTAssertTrue(element(app, "trial-running").waitForExistence(timeout: 10), "not counting down")
    expect(app, "trial-result", contains: "Tắt rồi đếm ngược: bật lại khi về 0.", timeout: 60)
    expect(app, "trial-result", contains: "Bật rồi đếm ngược: tắt khi về 0.")
    expect(app, "trial-result", contains: "Điện thoại đã bật lại như lúc đầu.")
  }

  func testWithBluetoothOffTheLampSaysSoAndThePlugsStillGo() {
    let app = launch(["-fake-lamp-off", "-dark"])
    make(app, end: "120")
    tap(app, "master-start")
    expect(app, "master-problems", contains: "Bật Bluetooth để gửi lệnh tới đèn.", timeout: 40)
    shoot("failed-dark")
    expect(app, "master-log", contains: "switch_3 off")
  }

  func testWithThePlugsUnreachedNothingGoesAndItSaysWhy() {
    // No network to the stand-in Tuya cloud: how the outlets are now can't be read, so neither can what goes back.
    let app = launch(["-stand-in-offline"])
    make(app, end: "60")
    tap(app, "master-start")
    expect(app, "master-problems", contains: "Không tới được ổ CO2: kiểm tra mạng rồi thử lại", timeout: 40)
    expect(app, "master-problems", contains: "Không tới được ổ Quạt: kiểm tra mạng rồi thử lại")
    shoot("unreached")
    // Nothing went, the lamp included, and it isn't running.
    let log = element(app, "master-log")
    XCTAssertFalse(log.exists && !log.label.isEmpty, log.exists ? log.label : "")
    XCTAssertFalse(element(app, "master-end").exists, "running though nothing went")
    XCTAssertTrue(element(app, "master-start").exists, "not ready")
  }

  func testWithTheTanksUnreadAtTheEndNothingGoesBackAndNothingIsDropped() {
    // The tanks on the phone not read at the end (a newer app's file, or one that can't be read): which devices are
    // still on a tank isn't known, so none is called deleted. Nothing goes back; each stays owed, with the tank list's
    // words, for "Trả lại" once they read.
    let app = launch()
    make(app, end: "60", light: true)
    tap(app, "master-start")
    expect(app, "master-log", contains: "lamp on+white", timeout: 40)
    expect(app, "master-end", contains: "Kết thúc", timeout: 40)
    let again = launch(["-seed-tanks", "unreadable"], signIn: false, reset: false)
    tap(again, "master-end")
    expect(again, "master-problems", contains: "Không đọc được các bể đã lưu trên máy này.", timeout: 40)
    XCTAssertTrue(element(again, "master-put-back").waitForExistence(timeout: 10), "nothing left owed")
    let log = element(again, "master-log")
    XCTAssertFalse(log.exists && log.label.contains("back"), log.exists ? log.label : "")
  }

  func testAnEndWhileTheAppWasClosedPutsThePlugsBackAndTheLampWaitsForTraLai() {
    // Ends 15 s after the press; the app closed then, so away at the end.
    let args = ["-master-ends-in", "15"]
    let app = launch(args)
    make(app, end: "60", light: true)
    tap(app, "master-start")
    expect(app, "master-log", contains: "lamp on+white", timeout: 40)
    XCTAssertTrue(element(app, "master-end").waitForExistence(timeout: 10), "not running")
    // Closed before the end, opened well after it.
    app.terminate()
    RunLoop.current.run(until: Date().addingTimeInterval(20))
    let again = launch(args, signIn: false, reset: false)
    // The lamp waits, near it, for Trả lại. (The stand-in cloud starts afresh at a launch, its light's outlet on again:
    // left as it is, and said so.)
    expect(again, "master-problems", contains: "Đèn chưa về như cũ: đứng gần đèn rồi bấm Trả lại.", timeout: 40)
    expect(again, "master-notes", contains: "Ổ Đèn đã đổi trong lúc chạy nên AquaTome để nguyên.")
    let log = element(again, "master-log")
    XCTAssertFalse(log.exists && log.label.contains("lamp back"), log.label)
    shoot("not-given-back")
    tap(again, "master-put-back")
    expect(again, "master-log", contains: "lamp back off", timeout: 40)
    XCTAssertTrue(element(again, "master-put-back").waitForNonExistence(timeout: 10), "Trả lại stayed")
    XCTAssertFalse(element(again, "master-problems").exists, element(again, "master-problems").label)
  }

  func testTurningOffAFilterAsksAgainNoHeaterAndDeletingTheButtonAsksOnce() {
    let app = launch()
    tap(app, "master-create")
    tap(app, "master-add")
    XCTAssertTrue(element(app, "master-add-Quạt").waitForExistence(timeout: 5), "no outlets offered")
    XCTAssertFalse(element(app, "master-add-Sưởi").exists, "a heater offered")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    add(app, "master-add-Lọc")
    tap(app, "master-step-Lọc")
    tap(app, "master-choice-Tắt")
    XCTAssertTrue(app.staticTexts["Tắt lọc trong lúc chạy nút?"].waitForExistence(timeout: 5), "no second ask")
    shoot("second-ask")
    // A popover, closed by a tap outside it ("Hủy" where iOS shows one). Low on the screen: iOS 27 draws it mid-screen,
    // iOS 26 near the top, where the tap this used to make landed on it and closed nothing (CI, 16 Nov).
    if app.buttons["Hủy"].firstMatch.exists { app.buttons["Hủy"].firstMatch.tap() } else { app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.85)).tap() }
    XCTAssertTrue(app.staticTexts["Tắt lọc trong lúc chạy nút?"].waitForNonExistence(timeout: 5), "the second ask stayed")
    expect(app, "master-choice-Bật", contains: "Bật")
    XCTAssertTrue(element(app, "master-choice-Bật").isSelected, "Lọc turned off without a yes")
    // What makes leaving out Hủy safe (the Design Lead, 15 Nov): after a tap outside, the check still on Bật.
    shoot("second-ask-cancelled")
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
    // The ask's own button: "Xóa nút" alone also finds the row that opened it.
    let delete = app.buttons["master-delete-yes"].firstMatch
    XCTAssertTrue(delete.waitForExistence(timeout: 5), "deleting doesn't ask")
    shoot("delete-ask")
    delete.tap()
    XCTAssertTrue(element(app, "master-create").waitForExistence(timeout: 10), "not deleted")
  }

  // MARK: Codex's read of the master button (17 Nov): each fails without its fix

  func testEachStepIsCheckedAgainstItsOutletsRoleAsItGoesSoCO2NeverGoesOn() {
    // The light's outlet made CO2 (as another phone's sync might) once the press has read the plugs: its "on" step was
    // allowed at the press, and isn't sent. The fan's step still goes.
    let app = launch(["-master-role-mid-press", "switch_1=co2"])
    tap(app, "master-create")
    add(app, "master-add-Quạt")
    add(app, "master-add-Đèn")
    tap(app, "master-step-Đèn")
    tap(app, "master-choice-Bật")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    tap(app, "master-end-60")
    tap(app, "master-done")
    tap(app, "master-start")
    expect(app, "master-problems", contains: "Nút không bật tắt ổ Đèn được trong bản này.", timeout: 40)
    expect(app, "master-log", contains: "switch_3 off")
    expect(app, "master-log", lacks: "switch_1")
  }

  func testSigningOutMidPressSendsNoMoreSteps() {
    // The fan's step waits 30 s before it goes (a debug launch argument): the owner signs out meanwhile.
    let app = launch(["-master-steps-wait", "30"])
    tap(app, "master-create")
    add(app, "master-add-Quạt")
    expect(app, "master-step-Quạt", contains: "Ổ cắm · Tắt")
    tap(app, "master-end-60")
    tap(app, "master-done")
    tap(app, "master-start")
    app.openAccount()
    app.scrollToAndTap("sign-out")
    XCTAssertTrue(element(app, "apple-sign-in").waitForExistence(timeout: 10), "still signed in")
    // Past the step's turn, signed out; then the owner again, to read the card.
    RunLoop.current.run(until: Date().addingTimeInterval(35))
    app.signInWithStandInApple()
    app.openTab("Đèn")
    expect(app, "master-problems", contains: "Chưa gửi vì bạn đã đăng xuất.", timeout: 40)
    let log = element(app, "master-log")
    XCTAssertFalse(log.exists && log.label.contains("switch_3"), log.exists ? log.label : "")
  }

  func testAnEndWhileTheAppWasInTheBackgroundLeavesTheLampForTraLaiHoweverSoonItIsBack() {
    // Ends 45 s after the press. In the background before the end and back within a minute of it: the end came while
    // the app was away (iOS broadcasts nothing then, and the phone may not be near the lamp), so the lamp waits for
    // Trả lại. It used to count as away only when back more than two minutes after the end.
    let app = launch(["-master-ends-in", "45"])
    make(app, end: "60", light: true)
    tap(app, "master-start")
    expect(app, "master-log", contains: "lamp on+white", timeout: 40)
    XCTAssertTrue(element(app, "master-end").waitForExistence(timeout: 10), "not running")
    XCUIDevice.shared.press(.home)
    RunLoop.current.run(until: Date().addingTimeInterval(45))
    app.activate()
    expect(app, "master-problems", contains: "Đèn chưa về như cũ: đứng gần đèn rồi bấm Trả lại.", timeout: 40)
    let log = element(app, "master-log")
    XCTAssertFalse(log.exists && log.label.contains("lamp back"), log.label)
  }

  func testACountdownTrialCutByTheAppClosingIsEndedAndItsOutletPutBackWhenTheAppOpens() {
    let app = launch(["-countdown-trial-seconds", "30"])
    tap(app, "trial-pick")
    let light = app.buttons["Đèn"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "the light's outlet not offered")
    light.tap()
    tap(app, "trial-run")
    XCTAssertTrue(element(app, "trial-running").waitForExistence(timeout: 10), "not counting down")
    // Closed in the middle of the first countdown (the outlet switched off a moment after the trial starts, its
    // countdown 30 s): nothing in memory is left to put the outlet back.
    RunLoop.current.run(until: Date().addingTimeInterval(8))
    app.terminate()
    let again = launch(signIn: false, reset: false)
    // At the start: its countdown ended and the outlet read (the stand-in cloud starts afresh at a launch, the light's
    // outlet on), and said so in the trial's row, at the card's foot.
    RunLoop.current.run(until: Date().addingTimeInterval(10))
    reveal(again, "trial-result")
    expect(again, "trial-result", contains: "ứng dụng đã tắt giữa lúc thử, nên đã dừng đếm ngược.", timeout: 40)
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
    top(app)
    shoot("ready-\(name)")
    tap(app, "master-start")
    // Its steps going out: "Đang gửi…" in Kết thúc's place (the lamp's two recordings take about eight seconds).
    shoot("sending-\(name)")
    XCTAssertTrue(element(app, "master-left").waitForExistence(timeout: 20), "not running")
    expect(app, "master-end", contains: "Kết thúc", timeout: 40)
    top(app)
    shoot("running-\(name)")
    tap(app, "master-end")
    XCTAssertTrue(element(app, "master-start").waitForExistence(timeout: 40), "not ready again")
    // The sheet opened from Sửa, down to Xóa nút (the board's tiles 10 and 14); closed with Hủy.
    tap(app, "master-edit")
    reveal(app, "master-delete")
    shoot("sheet-edit-\(name)")
    app.navigationBars.buttons["Hủy"].firstMatch.tap()
    XCTAssertTrue(element(app, "master-delete").waitForNonExistence(timeout: 5), "the sheet stayed")
    // Until Kết thúc: the start time in place of the time left.
    tap(app, "master-edit")
    tap(app, "master-end-tap")
    tap(app, "master-done")
    tap(app, "master-start")
    XCTAssertTrue(element(app, "master-since").waitForExistence(timeout: 20), "not running")
    expect(app, "master-end", contains: "Kết thúc", timeout: 40)
    top(app)
    shoot("running-until-tap-\(name)")
  }

  // MARK: Helpers

  /// Back to the top of Đèn before a shot, as the taps scroll it up (at the largest text the card's heading goes under
  /// the bar). Only on the tab itself: a drag down on a sheet would close it.
  private func top(_ app: XCUIApplication) {
    for _ in 0..<3 { app.swipeDown(velocity: .fast) }
  }

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

  /// "Tạo nút tổng" as the board draws it: the lamp in white, CO2 off (all it offers), the fan off; and the light's
  /// outlet off too (`light`: the stand-in strip has it on, so there is something to put back). Ending as `end` says
  /// ("60", "120", "tap").
  private func make(_ app: XCUIApplication, end: String, light: Bool = false, shots: String? = nil) {
    tap(app, "master-create")
    add(app, "master-add-lamp")
    add(app, "master-add-CO2")
    expect(app, "master-step-CO2", contains: "Ổ cắm · Tắt")
    tap(app, "master-step-CO2")
    expect(app, "master-co2-off-only", contains: "Nút chỉ tắt được CO2, chưa bật được")
    XCTAssertFalse(element(app, "master-choice-Bật").exists, "CO2 can be set on")
    if let shots { shoot("co2-\(shots)") }
    app.navigationBars.buttons.element(boundBy: 0).tap()
    add(app, "master-add-Quạt")
    expect(app, "master-step-Quạt", contains: "Ổ cắm · Tắt")
    if light {
      add(app, "master-add-Đèn")
      tap(app, "master-step-Đèn")
      tap(app, "master-choice-Tắt")
      app.navigationBars.buttons.element(boundBy: 0).tap()
    }
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

  /// Scrolled up, clear of the bars pinned to Đèn's bottom (its notice and write bars, the tab bar: a tap on a button
  /// under them lands on them), then tapped once it is enabled: "Kết thúc" waits while a start's steps go out.
  private func tap(_ app: XCUIApplication, _ id: String, file: StaticString = #filePath, line: UInt = #line) {
    let e = reveal(app, id, file: file, line: line)
    let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == true"), object: e)
    XCTAssertEqual(XCTWaiter.wait(for: [enabled], timeout: 30), .completed, "\(id) never enabled", file: file, line: line)
    e.tap()
  }

  /// Scrolls until the element is on screen and clear of the bottom bars, without tapping it.
  @discardableResult
  private func reveal(_ app: XCUIApplication, _ id: String, file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
    let e = element(app, id)
    let window = app.windows.firstMatch.frame
    // A look first, and a wait only when it isn't there yet: a wait looks after about a second even when the element is
    // already there, and each reveal waited twice. On main's run on 789ca5218, 371 of these 402 waits found it at once,
    // in 1.6 s each against 0.5 s for a look: about eight of this class's 53 minutes.
    // A list builds its rows only near the screen: at the largest text the sheet's Kết thúc rows are made when scrolled to.
    if !e.exists && !e.waitForExistence(timeout: 5) {
      repeatUntil(e.exists, times: 10) {
        let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.65))
        from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: -window.height / 3)), withVelocity: .default, thenHoldForDuration: 0.2)
      }
      XCTAssertTrue(e.waitForExistence(timeout: 5), "\(id) missing", file: file, line: line)
    }
    let pinned = ["notice", "write"].map { element(app, $0) }.filter { $0.exists }.map { $0.frame.minY }.min() ?? .infinity
    let bar = app.navigationBars.firstMatch
    let top = bar.exists ? bar.frame.maxY + 8 : window.minY
    let bottom = min(window.maxY - window.height / 5, pinned - 16)
    let third = window.height / 3
    var last: CGRect?
    for _ in 0..<12 {
      let f = e.frame
      // Clear of the bars at the bottom (one in a navigation bar, Xong, is above the band, and fine), or as far as the
      // list goes (a sheet's last row: a drag no longer moves it).
      if e.isHittable, f.maxY < bottom || f == last { break }
      last = f
      // Up only, toward the band's middle (the content moves about half again as far as the finger): a drag down on a
      // sheet closes it, as one did on Xong on 15 Nov.
      let dy = min(-40, max(-third, ((top + bottom) / 2 - f.midY) / 1.5))
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: min(0.65, bottom / window.height)))
      from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: dy)), withVelocity: .default, thenHoldForDuration: 0.2)
    }
    return e
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
