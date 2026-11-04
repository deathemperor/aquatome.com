import XCTest

/// The app's anonymous telemetry, against the simulator's stand-in Worker (`FakeCollector`, in `TelemetryModel`),
/// whose requests the app shows the tests (`telemetry-received`), with whether the queue's file is on the phone
/// (`telemetry-queue`). It sends nothing until the site's index, read fresh, says it takes it (`-site-telemetry` on the
/// fixed index), sends every 30 s and when the app goes to the background, and nothing it sends names the reader's
/// account or a light.
final class TelemetryFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testNothingIsSentUntilTheSiteSaysItTakesItThenThePageOpenedIs() {
    // The fixed index says nothing of telemetry: as the site before it's live.
    var app = launch()
    openGuide(app)
    leaveAndComeBack(app)
    let quiet = expectation(for: NSPredicate(format: "label != 'none'"), evaluatedWith: received(app))
    XCTAssertEqual(XCTWaiter.wait(for: [quiet], timeout: 5), .timedOut, "sent without the site's flag: \(received(app).label)")
    app.terminate()

    app = launch("-site-telemetry")
    openGuide(app)
    leaveAndComeBack(app)
    expectSent(app, #""path":"/vi/huong-dan/nuoi-ca-neon/","t":"view""#)
    expectSent(app, #""screen":"handbook","t":"view""#)
  }

  func testTheFlagOfTheIndexKeptFromBeforeSendsNothingWhileTheSitesDoesntCome() {
    // The index kept from an earlier launch says the site takes it, and the site's own never comes (offline, or slow):
    // the site may have turned it off since.
    let app = launch("-site-telemetry", "-index-kept-only")
    openGuide(app)
    leaveAndComeBack(app)
    let quiet = expectation(for: NSPredicate(format: "label != 'none'"), evaluatedWith: received(app))
    XCTAssertEqual(XCTWaiter.wait(for: [quiet], timeout: 5), .timedOut, "sent on the kept index's flag: \(received(app).label)")
  }

  func testConnectingTheLightIsSentWithoutTheLightsNameOrTheAccount() {
    let app = launch("-site-telemetry", "-fake-accounts", "on", "-reset-fake-server")
    // Signed in, so an account's id is there to leak.
    app.openTab("Bể của tôi")
    tap(app, "apple-sign-in")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 10), "not signed in")
    app.openTab("Đèn")
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    let connected = expectation(for: NSPredicate(format: "label CONTAINS 'Đã kết nối'"), evaluatedWith: app.descendants(matching: .any)["notice"].firstMatch)
    XCTAssertEqual(XCTWaiter.wait(for: [connected], timeout: 10), .completed, "not connected")
    leaveAndComeBack(app)
    expectSent(app, #""name":"light.connect","ok":true"#)

    let sent = received(app).label
    // In any form: as it is, or lowercased with marks between its parts (as a code is sent).
    XCTAssertFalse(sent.lowercased().filter { $0.isLetter || $0.isNumber }.contains("dysl30a1b2c3"), "the light's name was sent")
    // The only ids sent are the sessions': not the account's, nor the light's.
    let uuid = try! NSRegularExpression(pattern: "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
    let ids = Set(uuid.matches(in: sent, range: NSRange(sent.startIndex..., in: sent)).map { String(sent[Range($0.range, in: sent)!]) })
    let session = try! NSRegularExpression(pattern: #""session":"([^"]+)""#)
    let sessions = Set(session.matches(in: sent, range: NSRange(sent.startIndex..., in: sent)).map { String(sent[Range($0.range(at: 1), in: sent)!]) })
    XCTAssertFalse(sessions.isEmpty, "no session in \(sent)")
    XCTAssertEqual(ids, sessions, "an id that isn't a session's was sent: \(sent)")
  }

  func testTurningTheSwitchOffDropsWhatWaitsAndStopsSending() {
    // The Worker down: what's recorded waits on the phone, in the queue's file.
    var app = launch("-site-telemetry", "-telemetry-down")
    app.openTab("Bể của tôi")
    addTank(app)
    leaveAndComeBack(app)
    expectQueue(app, "kept")
    toggle(app, on: false)
    // Emptied by the switch itself, before any relaunch.
    expectQueue(app, "none")
    app.terminate()

    // The next launch, the Worker up: the switch is still off, and nothing goes.
    app = launch("-site-telemetry", reset: false)
    app.openTab("Bể của tôi")
    leaveAndComeBack(app)
    let quiet = expectation(for: NSPredicate(format: "label != 'none'"), evaluatedWith: received(app))
    XCTAssertEqual(XCTWaiter.wait(for: [quiet], timeout: 5), .timedOut, "sent with the switch off: \(received(app).label)")
    // On again: what happens from then on goes, and what waited before it went off doesn't.
    toggle(app, on: true)
    app.openTab("Đèn")
    leaveAndComeBack(app)
    expectSent(app, #""screen":"lights","t":"view""#)
    XCTAssertFalse(received(app).label.contains("tank.add"), "what waited before the switch went off was sent")
    XCTAssertFalse(received(app).label.contains(#""screen":"tanks""#), "recorded with the switch off")
  }

  func testWithNoTanksAndSignedOutTheSwitchIsThereAndOffEmptiesTheQueue() {
    // The Worker down: the tabs opened wait in the queue's file.
    let app = launch("-site-telemetry", "-telemetry-down")
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "not the empty tanks tab")
    leaveAndComeBack(app)
    expectQueue(app, "kept")
    toggle(app, on: false)
    expectQueue(app, "none")
  }

  // MARK: Helpers

  private func launch(_ args: String..., reset: Bool = true) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"] + (reset ? ["-reset-defaults"] : []) + args
    app.launch()
    return app
  }

  private func received(_ app: XCUIApplication) -> XCUIElement { app.descendants(matching: .any)["telemetry-received"].firstMatch }

  /// "kept" or "none": whether the queue's file is on the phone.
  private func expectQueue(_ app: XCUIApplication, _ state: String, file: StaticString = #filePath, line: UInt = #line) {
    let queue = app.descendants(matching: .any)["telemetry-queue"].firstMatch
    let seen = expectation(for: NSPredicate(format: "label == %@", state), evaluatedWith: queue)
    XCTAssertEqual(XCTWaiter.wait(for: [seen], timeout: 10), .completed, "the queue's file: \(queue.label), not \(state)", file: file, line: line)
  }

  private func expectSent(_ app: XCUIApplication, _ part: String, file: StaticString = #filePath, line: UInt = #line) {
    let sent = expectation(for: NSPredicate(format: "label CONTAINS %@", part), evaluatedWith: received(app))
    XCTAssertEqual(XCTWaiter.wait(for: [sent], timeout: 10), .completed, "\(part) not sent: \(received(app).label)", file: file, line: line)
  }

  /// The neon guide, drawn by the app.
  private func openGuide(_ app: XCUIApplication) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("nuoi ca neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no guide")
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the guide isn't drawn by the app")
  }

  private func addTank(_ app: XCUIApplication) {
    tap(app, "add-first")
    let field = app.textFields["name"]
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no tank form")
    field.tap()
    field.typeText("Bể thử")
    app.buttons["save"].tap()
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "the tank isn't listed")
  }

  /// "Gửi thống kê ẩn danh", in Bể của tôi: at the end of its list, or under the empty tab's sign-in.
  private func toggle(_ app: XCUIApplication, on: Bool) {
    let s = app.switches["telemetry-switch"]
    for _ in 0..<6 where !(s.exists && s.isHittable) { app.swipeUp() }
    XCTAssertTrue(s.isHittable, "no switch")
    if (s.value as? String == "1") != on { s.switches.firstMatch.exists ? s.switches.firstMatch.tap() : s.tap() }
    let set = expectation(for: NSPredicate(format: "value == %@", on ? "1" : "0"), evaluatedWith: s)
    XCTAssertEqual(XCTWaiter.wait(for: [set], timeout: 5), .completed, "the switch didn't turn \(on ? "on" : "off")")
  }

  private func tap(_ app: XCUIApplication, _ id: String) {
    let e = app.descendants(matching: .any)[id].firstMatch
    XCTAssertTrue(e.waitForExistence(timeout: 5), "no \(id)")
    for _ in 0..<5 where !e.isHittable { app.swipeUp() }
    e.tap()
  }

  /// To the background (where the app sends what it recorded) and back.
  private func leaveAndComeBack(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
    XCUIDevice.shared.press(.home)
    let states = [XCUIApplication.State.runningBackground, .runningBackgroundSuspended].map { NSNumber(value: $0.rawValue) }
    let gone = expectation(for: NSPredicate(format: "state IN %@", states), evaluatedWith: app)
    XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 5), .completed, "the app didn't go to the background", file: file, line: line)
    app.activate()
  }
}
