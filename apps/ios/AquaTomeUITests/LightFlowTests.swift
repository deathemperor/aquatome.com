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
    expect(app, "hours", contains: "Đèn sáng 8 tiếng mỗi ngày, sáng hẳn 7 tiếng.")
    expect(app, "master", value: "70%")
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
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày, sáng hẳn 5 tiếng.")
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
    // Written without asking: had it asked, nothing would be written until answered.
    expect(app, "notice", contains: "Đã ghi: bật 12:00, tắt 20:00.")
    XCTAssertFalse(app.alerts.firstMatch.exists, "asked again with a known schedule on the light")
    expect(app, "notice-action", contains: "Hoàn tác")
    tap(app, "notice-action")
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    expect(app, "saved", contains: "Lịch 13:00–19:00 · 40%")
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày, sáng hẳn 5 tiếng.")
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
    app.openTab("Bể của tôi")
    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the light wasn't kept on a tank")
    XCTAssertTrue(row.label.contains("Bể của tôi") && row.label.contains("1 đèn"), row.label)
    row.tap()
    XCTAssertTrue(text(app, "WRGB II Slim").waitForExistence(timeout: 5))
    XCTAssertTrue(text(app, "Chưa lưu lịch nào cho đèn này.").exists)

    app.openTab("Đèn")
    tap(app, "preset-new")
    write(app)
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    app.openTab("Bể của tôi")
    XCTAssertTrue(text(app, "13:00 → 19:00 · sáng dần 30 phút · Bể mới trồng").waitForExistence(timeout: 5),
                  "the schedule written wasn't kept with its preset's name")
  }

  // A light on a tank was shown there but did nothing when tapped.
  func testALightOnATankOpensOnTheLightsTabAndConnects() {
    let app = launch()
    connect(app)
    tap(app, "disconnect")
    XCTAssertTrue(element(app, "scan").waitForExistence(timeout: 5), "not disconnected")
    app.openTab("Bể của tôi")
    let tank = app.buttons["tank"].firstMatch
    XCTAssertTrue(tank.waitForExistence(timeout: 5), "the light wasn't kept on a tank")
    tank.tap()
    let light = app.buttons["tank-light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "the light on the tank can't be tapped")
    light.tap()
    let lightsTab = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isSelected == true"), object: app.tabBars.buttons["Đèn"])
    XCTAssertEqual(XCTWaiter().wait(for: [lightsTab], timeout: 5), .completed, "the light didn't open on the Đèn tab")
    expect(app, "notice", contains: "Đã kết nối")
  }

  // A light already connected stays as it is: the tap opens Đèn, and no second connection starts and lets it go.
  func testALightOnATankOpensTheConnectedLightAsItIs() {
    let app = launch()
    connect(app)
    // What was written to the light: a second connection would read the light again, and add to it.
    let written = element(app, "frames").label
    app.openTab("Bể của tôi")
    let tank = app.buttons["tank"].firstMatch
    XCTAssertTrue(tank.waitForExistence(timeout: 5), "the light wasn't kept on a tank")
    tank.tap()
    let light = app.buttons["tank-light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "the light on the tank can't be tapped")
    light.tap()
    // On Đèn: the tap has done what it does, and a second connection would be looking for the light by now.
    let lightsTab = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isSelected == true"), object: app.tabBars.buttons["Đèn"])
    XCTAssertEqual(XCTWaiter().wait(for: [lightsTab], timeout: 5), .completed, "the light didn't open on the Đèn tab")
    // A second connection clears the notice before its first wait (LightsModel's connect(saved:)), and the tap's task has
    // run by the time the tab shows: the first connection's "Đã kết nối", still there at once, means none started.
    let notice = element(app, "notice")
    let said = notice.exists ? notice.label : "nothing"
    XCTAssertTrue(said.contains("Đã kết nối"), "a second connection started: the notice says \(said)")
    let looking = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Đang tìm'")).firstMatch
    XCTAssertFalse(looking.exists, "a second connection started")
    XCTAssertEqual(element(app, "frames").label, written, "a second connection started")
    XCTAssertTrue(element(app, "disconnect").exists, "the light was let go")
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
    expect(app, "hours", contains: "Đèn sáng 8 tiếng mỗi ngày, sáng hẳn 7 tiếng.") // the plan left last time
    tap(app, "saved-light")
    expect(app, "notice", contains: "Đã kết nối WRGB II Slim.")
    XCTAssertFalse(element(app, "steps").exists, "setup steps for a light already written to")
    expect(app, "saved", contains: "Lịch 13:00–19:00 · 40%, sáng dần 30 phút")
    // Not edited since the app opened: the form takes what was written to this light.
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày, sáng hẳn 5 tiếng.")
  }

  func testThePlanIsKeptWithoutALight() {
    var app = launch()
    tap(app, "preset-algae")
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày, sáng hẳn 5 tiếng.")
    XCTAssertFalse(element(app, "write").isEnabled)
    app.terminate()
    app = launch(reset: false)
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày, sáng hẳn 5 tiếng.")
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

  // "Bật với màu của lịch". The weekday masks are today's, whichever day the flow runs: the kit's tests check the bits.
  private let sixDays = "(3f|5f|6f|77|7b|7d|7e)", oneDay = "(40|20|10|08|04|02|01)"

  func testLightsUpWithTheSchedulesColoursUntilItsOffThenTheoLichWritesEveryDayAgain() {
    let app = launch("-now", "08:00") // before the schedule's on
    connect(app)
    // Only with a schedule AquaTome wrote: the light's own isn't known.
    XCTAssertFalse(element(app, "quick-as-scheduled").exists, "offered with no schedule written from AquaTome")
    tap(app, "preset-new")
    write(app)
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    tap(app, "quick-as-scheduled")
    let confirm = app.alerts.buttons["Bật với màu của lịch"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    let asked = app.alerts.staticTexts.matching(NSPredicate(format: "label == %@", "Đèn sáng từ bây giờ tới 19:00 (giờ tắt của lịch), 11 giờ."))
    XCTAssertTrue(asked.firstMatch.exists, "the confirmation doesn't say until when")
    confirm.tap()
    expect(app, "notice", contains: "Đèn sáng với màu của lịch tới 19:00, rồi tự chạy lại theo lịch.")
    // The scenes cleared, the six other days as they were, today's from a ramp ago (07:30) to the schedule's own 19:00,
    // then one status read.
    expectFrames(app, ".* 05 28 ff ff .. \\| .* 05 12 ff ff .. \\| a5 01 13 .. .. 19 0d 00 13 00 1e \(sixDays) 28 28 28 ff ff ff ff ff .. "
                 + "\\| a5 01 13 .. .. 19 07 1e 13 00 1e \(oneDay) 28 28 28 ff ff ff ff ff .. \\| 5a 01 06 .. .. 04 01 ..")

    // "Theo lịch": the schedule for every day again, and nothing left to take back.
    tap(app, "quick-auto")
    expect(app, "notice", contains: "Đèn chạy lại theo lịch.")
    expectFrames(app, ".* 05 28 ff ff .. \\| .* 05 12 ff ff .. \\| a5 01 13 .. .. 19 0d 00 13 00 1e 7f 28 28 28 ff .*")
    let back = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == false"), object: element(app, "quick-auto"))
    XCTAssertEqual(XCTWaiter().wait(for: [back], timeout: 5), .completed, "“Theo lịch” still offered")
  }

  func testAfterTheSchedulesOffItLightsUpForAnHourOrTwo() {
    let app = launch("-now", "21:00") // after the schedule's off
    connect(app)
    tap(app, "preset-new")
    write(app)
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    tap(app, "quick-as-scheduled")
    let hour = app.buttons["1 giờ, tới 22:00"]
    XCTAssertTrue(hour.waitForExistence(timeout: 5), "no hour to choose")
    XCTAssertTrue(app.buttons["2 giờ, tới 23:00"].exists, "no two hours to choose")
    hour.tap()
    expect(app, "notice", contains: "Đèn sáng với màu của lịch tới 22:00, rồi tự chạy lại theo lịch.")
    // Today's period is the schedule's own, stretched to 22:00: never past it into the night.
    expectFrames(app, ".* a5 01 13 .. .. 19 0d 00 13 00 1e \(sixDays) 28 28 28 ff ff ff ff ff .. "
                 + "\\| a5 01 13 .. .. 19 0d 00 16 00 1e \(oneDay) 28 28 28 ff ff ff ff ff .. \\| 5a 01 06 .. .. 04 01 ..")
  }

  func testTheFirstConnectionAfterItEndsPutsTheScheduleForEveryDayBack() {
    var app = launch("-now", "08:00")
    connect(app)
    tap(app, "preset-new")
    write(app)
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    tap(app, "quick-as-scheduled")
    let confirm = app.alerts.buttons["Bật với màu của lịch"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    confirm.tap()
    expect(app, "notice", contains: "Đèn sáng với màu của lịch tới 19:00")
    app.terminate()

    // Past its end: connected again, the light gets the schedule for every day before the card says it's connected.
    app = launch("-now", "20:00", reset: false)
    tap(app, "saved-light")
    expect(app, "notice", contains: "Đã kết nối WRGB II Slim.")
    expectFrames(app, ".* 05 28 ff ff .. \\| .* 05 12 ff ff .. \\| a5 01 13 .. .. 19 0d 00 13 00 1e 7f 28 28 28 ff .*")
    XCTAssertFalse(element(app, "quick-auto").isEnabled, "still taken for a light with a period for today alone")
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

  // At the largest text the row's button squeezed its words into a narrow column beside it (shot in v2's tabs, 8 Nov).
  func testASavedLightsButtonGoesUnderItsWordsAtTheLargestText() {
    let app = launch("-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    tap(app, "scan")
    tap(app, "light")
    expect(app, "notice", contains: "Đã kết nối")
    tap(app, "disconnect")
    let button = scrolledTo(app, "saved-light")
    XCTAssertTrue(button.isHittable, "Kết nối not reached by scrolling")
    XCTAssertGreaterThanOrEqual(button.frame.minY, element(app, "saved-meta").frame.maxY, "Kết nối beside the light's words")
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
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày, sáng hẳn 5 tiếng.")
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
    // The first status read takes seconds. At -fake-slow's 1.5 s the card turned to the connected screen between the tap on
    // Hủy being aimed and landing, so it hit nothing and the light stayed connected (main's run, 7 Nov).
    let app = launch("-fake-slower")
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    XCTAssertTrue(app.buttons["disconnect"].waitForExistence(timeout: 5), "not connecting")
    XCTAssertEqual(app.buttons["disconnect"].label, "Hủy", "already connected: not a disconnect while reading")
    app.buttons["disconnect"].tap()
    XCTAssertTrue(app.buttons["scan"].waitForExistence(timeout: 5))
    // The read stops without an answer (timeout 2 s, after a 4 s frame): that is no error to the reader.
    let notice = element(app, "notice")
    let shown = XCTWaiter.wait(for: [expectation(for: NSPredicate(format: "exists == true"), evaluatedWith: notice)], timeout: 8)
    XCTAssertNotEqual(shown, .completed, "notice after a deliberate disconnect: “\(notice.label)”")
  }

  func testWritingAScheduleEndsTheManualLevels() {
    let app = launch()
    connect(app)
    tap(app, "try")
    expect(app, "notice", contains: "Đèn đang hiện màu thử.")
    expect(app, "try", contains: "Thôi thử, chạy theo lịch")
    expectFrames(app, ".*5a 01 08 .. .. 05 0b ff ff .. \\| .* 07 02 46 ..") // the light in manual mode, at 70%
    write(app)
    expect(app, "notice", contains: "Đã ghi")
    // The light runs the schedule again: the test colour no longer holds.
    expect(app, "try", contains: "Thử màu trên đèn")
    XCTAssertFalse(element(app, "quick-auto").isEnabled, "“Theo lịch” with nothing set by hand")
  }


  func testPresetsByTankTypeSayWhyMarkTheChosenOneAndKeepTheMix() {
    let app = launch()
    expect(app, "preset-fish", contains: "Bể cá, không trồng cây")
    expect(app, "preset-fish", contains: "12:00–20:00 · 40%")
    expect(app, "preset-fish", contains: "Đủ để ngắm cá, ít rêu.")
    XCTAssertTrue(element(app, "preset-settled").isSelected, "the form starts as “Bể đã ổn định”, unmarked")
    // A look mixed first (70, 56, 35): a preset sets the brightness and keeps the mix.
    tap(app, "look-warm")
    tap(app, "each")
    expect(app, "level-1", value: "56%")
    tap(app, "preset-fish")
    XCTAssertTrue(element(app, "preset-fish").isSelected, "the chosen preset unmarked")
    XCTAssertFalse(element(app, "preset-settled").isSelected, "a preset with the same hours but brighter marked too")
    expect(app, "hours", contains: "Đèn sáng 8 tiếng mỗi ngày, sáng hẳn 7 tiếng. 6–8 tiếng là vừa cho bể thủy sinh.")
    expect(app, "master", value: "40%")
    expect(app, "level-1", value: "32%")
    expect(app, "level-2", value: "20%")
    XCTAssertTrue(element(app, "look-warm").isSelected, "the mix not kept")
    tap(app, "preset-settled")
    expect(app, "master", value: "70%")
    expect(app, "level-1", value: "56%")
    XCTAssertFalse(element(app, "preset-fish").isSelected, "the preset left still marked")
  }

  func testTheDaysHandlesAndTheRampMenuSetTheScheduleWritten() {
    let app = launch()
    connect(app)
    expect(app, "handle-on", value: "Bật lúc 12:00")
    expect(app, "handle-off", value: "Tắt lúc 20:00")
    expect(app, "handle-ramp", value: "30 phút")
    // A touch held still changes nothing, even one beside the handle's line (it once jumped the time to the finger).
    _ = scrolledTo(app, "day")
    element(app, "handle-on").coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.8)).press(forDuration: 0.6)
    element(app, "handle-off").coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.8)).press(forDuration: 0.6)
    expect(app, "handle-on", value: "Bật lúc 12:00")
    expect(app, "handle-off", value: "Tắt lúc 20:00")
    XCTAssertTrue(element(app, "preset-settled").isSelected, "a touch on a handle changed the schedule")
    drag(app, "handle-on", from: 12 * 60, to: 14 * 60)
    expect(app, "handle-on", value: "Bật lúc 14:00")
    expect(app, "hours", contains: "Đèn sáng 6 tiếng mỗi ngày, sáng hẳn 5 tiếng. 6–8 tiếng là vừa")
    drag(app, "handle-off", from: 20 * 60, to: 23 * 60)
    expect(app, "handle-off", value: "Tắt lúc 23:00")
    expect(app, "hours", contains: "Đèn sáng 9 tiếng mỗi ngày, sáng hẳn 8 tiếng. Trên 8 tiếng dễ lên rêu.")
    drag(app, "handle-ramp", from: 30, to: 60)
    expect(app, "handle-ramp", value: "60 phút")
    expect(app, "hours", contains: "sáng hẳn 7 tiếng")
    // Off stays two ramps after on, however far it is dragged.
    drag(app, "handle-off", from: 23 * 60, to: 12 * 60)
    expect(app, "handle-off", value: "Tắt lúc 16:00")
    expect(app, "hours", contains: "Đèn sáng 2 tiếng mỗi ngày, sáng hẳn 0 tiếng. Dưới 5 tiếng, cây trồng lớn chậm.")
    drag(app, "handle-off", from: 16 * 60, to: 22 * 60)
    expect(app, "handle-off", value: "Tắt lúc 22:00")
    // The exact fields follow, and the ramp menu sets the ramp.
    XCTAssertEqual(element(app, "on").buttons.firstMatch.value as? String, "14:00", "the on time doesn't follow the day")
    XCTAssertEqual(element(app, "off").buttons.firstMatch.value as? String, "22:00", "the off time doesn't follow the day")
    tap(app, "ramp")
    let choice = app.buttons["45 phút"]
    XCTAssertTrue(choice.waitForExistence(timeout: 5), "no 45-minute ramp in the menu")
    choice.tap()
    expect(app, "handle-ramp", value: "45 phút")
    write(app)
    expect(app, "notice", contains: "Đã ghi: bật 14:00, tắt 22:00.")
    // 14:00, 22:00, a 45-minute ramp, 70% each.
    expectFrames(app, ".*a5 01 13 .. .. 19 0e 00 16 00 2d 7f 46 46 46 .*")
  }

  func testLooksOneBrightnessAndEachColourMixTheLight() {
    let app = launch()
    expect(app, "tank-now", contains: "Bây giờ")
    expect(app, "tank-now", contains: "Màu trên màn hình chỉ gần đúng.")
    XCTAssertTrue(element(app, "look-natural").isSelected, "an even mix not marked “Tự nhiên”")
    tap(app, "look-red")
    XCTAssertTrue(element(app, "look-red").isSelected, "the chosen look unmarked")
    XCTAssertFalse(element(app, "look-natural").isSelected, "the look left still marked")
    tap(app, "each")
    expect(app, "level-0", value: "70%")
    expect(app, "level-1", value: "56%")
    expect(app, "level-2", value: "53%")
    // One brightness for every channel: the mix stays the look.
    // Down to almost nothing and back up: the look as it is at full, not a mix rounded low (100/80/80) or at 70%
    // (100/80/76). Not to 0%, which is no look at all, as on the site.
    let low = slideLow(app, "master")
    XCTAssertFalse(["70%", "0%"].contains(low ?? ""), "the brightness at \(low ?? "?"), not low and above 0")
    XCTAssertTrue(element(app, "look-red").isSelected, "the mix changed with the brightness (at \(low ?? "?"))")
    slideToEnd(app, "master")
    expect(app, "master", value: "100%")
    expect(app, "level-0", value: "100%")
    expect(app, "level-1", value: "80%")
    expect(app, "level-2", value: "75%")
    XCTAssertTrue(element(app, "look-red").isSelected, "the mix changed with the brightness")
    // One colour by hand: no look any more, and the brightness is the brightest channel's.
    slideToEnd(app, "level-1")
    expect(app, "level-1", value: "100%")
    expect(app, "master", value: "100%")
    XCTAssertFalse(element(app, "look-red").isSelected, "a look marked for a mix of its own")
  }

  func testTryingAColourShowsItOnTheLightThenTheScheduleRunsAgain() {
    let app = launch()
    connect(app)
    tap(app, "try")
    expect(app, "notice", contains: "Đèn đang hiện màu thử.")
    // Manual mode, then each channel at 70%.
    expectFrames(app, ".*5a 01 08 .. .. 05 0b ff ff .. \\| 5a 01 07 .. .. 07 00 46 .. \\| 5a 01 07 .. .. 07 01 46 .. \\| 5a 01 07 .. .. 07 02 46 ..")
    // Each change shows at once.
    tap(app, "look-warm")
    expectFrames(app, ".* 07 00 46 .. \\| 5a 01 07 .. .. 07 01 38 .. \\| 5a 01 07 .. .. 07 02 23 ..")
    tap(app, "try")
    expect(app, "notice", contains: "Đèn chạy lại theo lịch.")
    expect(app, "try", contains: "Thử màu trên đèn")
    // Nothing written from AquaTome yet: only the scene mode, after the levels.
    expectFrames(app, ".* 07 02 23 .. \\| 5a 01 08 .. .. 05 12 ff ff ..")
  }

  func testTheDayPreviewStopsAtOnceOnTheScreenAndOnTheLight() {
    // Two minutes long: no step of the test, however slow the runner, outlasts it, so only "Dừng" can end it.
    let app = launch("-preview-seconds", "120")
    // Without a light: on the screen only.
    tap(app, "play")
    expect(app, "play", contains: "Dừng")
    tap(app, "play")
    expect(app, "play", contains: "Xem thử cả ngày", timeout: 3)
    // One playing on the screen stops when a light connects: the light wasn't part of it.
    tap(app, "play")
    expect(app, "play", contains: "Dừng")
    connect(app)
    expect(app, "play", contains: "Xem thử cả ngày trên đèn")
    // "Dừng" on the light: its own schedule again at once (the scene mode: nothing written yet). Nothing is written
    // while it plays.
    XCTAssertTrue(element(app, "write").isEnabled, "the schedule can't be written before the preview")
    tap(app, "play")
    expectFrames(app, ".*5a 01 08 .. .. 05 0b ff ff .*")
    XCTAssertFalse(element(app, "write").isEnabled, "the schedule can be written while the day plays on the light")
    tap(app, "play")
    expect(app, "notice", contains: "Xong. Đèn chạy lại theo lịch.", timeout: 4)
    expectFrames(app, ".* 5a 01 08 .. .. 05 12 ff ff ..")
    let writable = expectation(for: NSPredicate(format: "enabled == true"), evaluatedWith: element(app, "write"))
    XCTAssertEqual(XCTWaiter.wait(for: [writable], timeout: 5), .completed, "writing still off after the preview")
  }

  func testTheDayPreviewPlaysOnTheLightThenTheScheduleRunsAgain() {
    // Forty seconds (the site's ten, slowed): the light holds full for about twelve, longer than a slow runner's look.
    let app = launch("-preview-seconds", "40")
    connect(app)
    // The whole day: the light follows it to full (70%) at noon, off at 20:00, then its own schedule.
    tap(app, "play")
    expectFrames(app, ".* 07 02 46 .*", timeout: 30)
    expect(app, "play", contains: "Xem thử cả ngày trên đèn", timeout: 60)
    expectFrames(app, ".* 07 02 00 .. \\| 5a 01 08 .. .. 05 12 ff ff ..")
  }

  func testLeavingTheAppPutsATestColourBackOnTheScheduleWithOneFrame() {
    let app = launch("-preview-seconds", "120") // the preview is stopped by leaving, never by its end

    connect(app)
    tap(app, "try")
    expectFrames(app, ".* 07 02 46 ..")
    leaveAndComeBack(app)
    // One frame, the scene mode: the light runs what it holds; nothing cleared, nothing written again.
    expectFrames(app, ".* 07 02 46 .. \\| 5a 01 08 .. .. 05 12 ff ff ..")
    expect(app, "try", contains: "Thử màu trên đèn")
    // The day preview too: once it has sent its first levels (manual mode, off before 12:00), it stops there.
    tap(app, "play")
    expectFrames(app, ".* 05 12 ff ff .. \\| 5a 01 08 .. .. 05 0b ff ff .. \\| .*")
    XCTAssertFalse(element(app, "notice").exists, "the last notice still showing as the preview starts")
    leaveAndComeBack(app)
    expect(app, "notice", contains: "Đèn chạy lại theo lịch.")
    expect(app, "notice", lacks: "Xong") // stopped, not played to its end
    expect(app, "play", contains: "Xem thử cả ngày trên đèn")
    expectFrames(app, ".* 07 02 .. .. \\| 5a 01 08 .. .. 05 12 ff ff ..")
    // "Tắt đèn" is meant to hold: it stays when the app leaves.
    tap(app, "quick-off")
    expect(app, "hand", contains: "Đèn đang tắt bằng tay")
    expectFrames(app, ".* 07 02 00 ..")
    leaveAndComeBack(app)
    // Still last: the "off" level (any frame after it would be the light sent back to its schedule).
    let undone = expectation(for: NSPredicate(format: "NOT (label MATCHES %@)", ".* 07 02 00 .."), evaluatedWith: element(app, "frames"))
    XCTAssertEqual(XCTWaiter.wait(for: [undone], timeout: 4), .timedOut, "“Tắt đèn” undone when the app left")
  }

  func testLeavingWhileATestColourIsStillOnItsWaySendsTheSceneModeLast() {
    // The slow fake light takes 1.5 s a frame: the app leaves while the colour's levels are still being sent.
    let app = launch("-fake-slow")
    connect(app)
    tap(app, "try")
    expectFrames(app, ".*5a 01 08 .. .. 05 0b ff ff ..")
    leaveAndComeBack(app)
    // The levels already on their way, then the scene mode, and nothing after it (no manual mode again).
    expectFrames(app, ".* 07 02 46 .. \\| 5a 01 08 .. .. 05 12 ff ff ..", timeout: 20)
    let more = expectation(for: NSPredicate(format: "NOT (label MATCHES %@)", ".* 05 12 ff ff .."), evaluatedWith: element(app, "frames"))
    XCTAssertEqual(XCTWaiter.wait(for: [more], timeout: 4), .timedOut, "frames after the scene mode")
  }

  func testDisconnectingMidTestPutsTheLightBackOnItsSchedule() {
    let app = launch()
    connect(app)
    tap(app, "try")
    expectFrames(app, ".* 07 02 46 ..")
    XCTAssertFalse(element(app, "hand").exists, "the card says “set by hand” for a colour being tried")
    // "Ngắt kết nối" mid-test: the scene mode goes first, then the link drops.
    tap(app, "disconnect")
    expectFrames(app, ".* 07 02 46 .. \\| 5a 01 08 .. .. 05 12 ff ff ..")
    // Connected again: nothing left set by hand.
    connect(app)
    XCTAssertFalse(element(app, "hand").exists, "the light is kept as set by hand after it went back to its schedule")
    XCTAssertFalse(element(app, "quick-auto").isEnabled, "“Theo lịch” with nothing set by hand")
  }

  func testDisconnectingMidPreviewPutsTheLightBackOnItsSchedule() {
    let app = launch("-preview-seconds", "120")
    connect(app)
    // Once it has sent its first levels: manual mode, then off (before 12:00).
    tap(app, "play")
    expectFrames(app, ".*5a 01 08 .. .. 05 0b ff ff .. \\| .* 07 02 00 ..")
    tap(app, "disconnect")
    expectFrames(app, ".* 5a 01 07 .. .. 07 02 .. .. \\| 5a 01 08 .. .. 05 12 ff ff ..")
    expect(app, "play", contains: "Xem thử cả ngày")
  }

  func testALightThatDropsMidTestIsKeptAsSetByHandUntilTheoLich() {
    // The fake light drops at the first level set by hand: the colour test's first level.
    let app = launch("-fake-drop")
    connect(app)
    tap(app, "try")
    expect(app, "notice", contains: "Mất kết nối với đèn.")
    tap(app, "notice-action")
    expect(app, "notice", contains: "Đã kết nối WRGB II Slim.")
    // It can't be told to go back while dropped: the card says it is off its schedule, and "Theo lịch" takes it back.
    expect(app, "hand", contains: "Đèn đang chỉnh tay (70%), không chạy theo lịch.")
    XCTAssertTrue(element(app, "quick-auto").isEnabled, "no “Theo lịch” for a light left on a test colour")
    tap(app, "quick-auto")
    expect(app, "notice", contains: "Đèn chạy lại theo lịch.")
    expectFrames(app, ".* 5a 01 08 .. .. 05 12 ff ff ..")
    XCTAssertFalse(element(app, "hand").exists, "still kept as set by hand after “Theo lịch”")
  }

  func testTheWriteBarStaysInViewAndSaysWhatWillBeWritten() {
    let app = launch()
    // Without a light: what would be written, and why it can't be yet, in view at the top of the screen.
    expect(app, "summary", contains: "12:00–20:00 · 70% · 8 tiếng")
    XCTAssertTrue(element(app, "write").isHittable, "the write bar isn't in view at the top of the screen")
    XCTAssertFalse(element(app, "write").isEnabled)
    XCTAssertTrue(text(app, "Kết nối đèn để ghi lịch. Lịch này được nhớ trên máy.").exists, "no note without a light")
    tap(app, "preset-new")
    expect(app, "summary", contains: "13:00–19:00 · 40% · 6 tiếng")
    drag(app, "handle-off", from: 19 * 60, to: 19 * 60 + 30)
    expect(app, "summary", contains: "13:00–19:30 · 40% · 6,5 tiếng")
    connect(app)
    XCTAssertFalse(text(app, "Kết nối đèn để ghi lịch.").exists, "the note for no light, with a light")
    // At the end of the screen too: written from wherever the reader is.
    _ = scrolledTo(app, text(app, "AquaTome không liên quan tới hãng Chihiros"))
    XCTAssertTrue(element(app, "write").isHittable, "the write bar isn't in view at the end of the screen")
    write(app)
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:30.")
    expect(app, "write", contains: "Đèn đang dùng lịch này")
    expectWholeBar(app)
    // What writing does is said once, in the notes at the end.
    XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Ghi lịch mới sẽ xóa các lịch đang lưu trên đèn")).count, 1)
  }

  // Indonesian's "Lampu sedang memakai jadwal ini" left the summary beside it a column so narrow its times broke over
  // four lines (12:00– / 20:00 · / 70% · 8 / jam): it goes above the button instead, on one line.
  func testTheWriteBarKeepsItsTimesWholeBesideALongerButton() {
    let app = launch(indonesian: true)
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    expect(app, "notice", contains: "terhubung") // its status read: Đã kết nối
    tap(app, "write")
    let confirm = app.alerts.buttons["Simpan jadwal"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    confirm.tap()
    expect(app, "write", contains: "Lampu sedang memakai jadwal ini")
    XCTAssertEqual(element(app, "summary").label, "12:00–20:00 · 70% · 8 jam")
    expectWholeBar(app)
  }

  func testASavedScheduleIsUsedAgainAndTheLastSixAreListed() {
    let app = launch()
    connect(app)
    XCTAssertFalse(text(app, "Lịch đã ghi cho đèn này").exists, "a list with nothing written")
    tap(app, "preset-new")
    write(app)
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    tap(app, "preset-settled")
    tap(app, "write")
    expect(app, "notice", contains: "Đã ghi: bật 12:00, tắt 20:00.")
    // The last one written first, in use; the one before it can be used again, with its preset's name and ramp.
    var rows = savedRows(app)
    XCTAssertEqual(rows.count, 2, "\(rows)")
    XCTAssertTrue(rows[0].contains("12:00–20:00 · 70%") && rows[0].contains("Bể đã ổn định · sáng dần 30 phút"), rows[0])
    XCTAssertTrue(rows[1].contains("13:00–19:00 · 40%") && rows[1].contains("Bể mới trồng · sáng dần 30 phút"), rows[1])
    XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "in-use").count, 1)
    let first = element(app, "saved-schedule").frame
    XCTAssertTrue(first.minY...first.maxY ~= element(app, "in-use").frame.midY, "“Đang dùng” isn't on the last one written")

    // Used again while a colour is tried on the light: the form takes it, and the light shows its colour.
    tap(app, "try")
    expect(app, "notice", contains: "Đèn đang hiện màu thử.")
    let again = app.buttons.matching(identifier: "reuse").firstMatch
    XCTAssertEqual(again.label, "Dùng lại: 13:00–19:00 · 40%")
    scrolledTo(app, again).tap()
    expect(app, "notice", contains: "Đã mở lịch 13:00–19:00 · 40%. Bấm “Ghi lịch vào đèn” để dùng.")
    expect(app, "summary", contains: "13:00–19:00 · 40% · 6 tiếng")
    expectFrames(app, ".* 07 00 28 .. \\| 5a 01 07 .. .. 07 01 28 .. \\| 5a 01 07 .. .. 07 02 28 ..")
    tap(app, "write")
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    XCTAssertFalse(app.alerts.firstMatch.exists, "asked again with a known schedule on the light")
    expectFrames(app, ".*a5 01 13 .. .. 19 0d 00 13 00 1e 7f 28 28 28 ff .*")
    // Written again, it is the one in use, first, with its name; nothing is listed twice.
    rows = savedRows(app)
    XCTAssertEqual(rows.count, 2, "\(rows)")
    XCTAssertTrue(rows[0].contains("13:00–19:00 · 40%") && rows[0].contains("Bể mới trồng"), rows[0])
    XCTAssertEqual(app.buttons.matching(identifier: "reuse").firstMatch.label, "Dùng lại: 12:00–20:00 · 70%")
    // Its colour changed and written: a new schedule, still with the name of the one used again.
    tap(app, "look-warm")
    tap(app, "write")
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
    expectFrames(app, ".*a5 01 13 .. .. 19 0d 00 13 00 1e 7f 28 20 14 ff .*")
    rows = savedRows(app)
    XCTAssertEqual(rows.count, 3, "\(rows)")
    XCTAssertTrue(rows[0].contains("13:00–19:00 · 40%") && rows[0].contains("Bể mới trồng"), rows[0])

    // Seven different schedules written: the last six are listed, and the one written longest ago (“Bể đã ổn định”)
    // drops off.
    for (preset, time) in [("preset-algae", "bật 14:00, tắt 20:00"), ("preset-fish", "bật 12:00, tắt 20:00")] {
      tap(app, preset)
      tap(app, "write")
      expect(app, "notice", contains: "Đã ghi: \(time).")
    }
    for off in [21, 22] {
      drag(app, "handle-off", from: Double(off - 1) * 60, to: Double(off) * 60)
      tap(app, "write")
      expect(app, "notice", contains: "Đã ghi: bật 12:00, tắt \(off):00.")
    }
    rows = savedRows(app)
    XCTAssertEqual(rows.count, 6, "\(rows)")
    XCTAssertTrue(rows[0].contains("12:00–22:00 · 40%"), rows[0])
    XCTAssertFalse(rows.contains { $0.contains("12:00–20:00 · 70%") }, "the one written longest ago is still listed: \(rows)")
  }

  func testSchedulesWrittenAreListedOnlyWhileTheLightIsConnected() {
    // Dropping at the first level set by hand.
    let app = launch("-fake-drop")
    connect(app)
    write(app)
    expect(app, "notice", contains: "Đã ghi: bật 12:00, tắt 20:00.")
    XCTAssertEqual(savedRows(app).count, 1)
    // Dropped: not listed, as on the site, which lists them only for a light that is ready.
    tap(app, "try")
    expect(app, "card-title", contains: "Mất kết nối với WRGB II Slim")
    XCTAssertFalse(element(app, "saved-schedule").exists, "schedules listed for a light that dropped")
    // Connected again: listed once the light is read.
    tap(app, "saved-light")
    expect(app, "notice", contains: "Đã kết nối WRGB II Slim.", timeout: 20)
    XCTAssertEqual(savedRows(app).count, 1)
  }

  func testWarnsWhenTheLightsOutletHasATimerThatCutsItsPower() {
    // The light's tank has the stand-in strip on it, its first outlet named "Đèn" in Smart Life, which turns that outlet
    // off at 00:00 and on at 18:00 every day: the light lost its clock in the cut.
    var app = launch("-seed-tanks", "plug", "-seed-tuya-keys", "-stand-in-timer", "enabled", "-fake-clock-unset")
    connect(app)
    expect(app, "clock", contains: "Đèn mất giờ, có thể do mất điện")
    // Nothing assumed: the outlet named for a light is offered first, and only the reader's pick is kept.
    XCTAssertFalse(element(app, "outlet-warning").exists, "warned before an outlet was picked")
    pickOutlet(app, "Đèn · Ổ cắm bể 60 (gợi ý)")
    expect(app, "light-outlet", contains: "Cắm vào ổ “Đèn” (Ổ cắm bể 60).")
    expect(app, "outlet-warning", contains: "Ổ “Đèn” tự tắt lúc 00:00 mỗi ngày. Mất điện là đèn mất giờ nên không tự bật theo lịch của nó.")
    app.terminate()

    // The timers turned off in Smart Life: the pick is kept, the timers read again, and no warning.
    app = launch("-seed-tuya-keys", "-stand-in-timer", "disabled", reset: false)
    connect(app)
    expect(app, "outlet-timers", contains: "Không thấy hẹn giờ tắt nào của ổ này trong Smart Life.")
    expect(app, "light-outlet", contains: "Cắm vào ổ “Đèn” (Ổ cắm bể 60).")
    XCTAssertFalse(element(app, "outlet-warning").exists, "warned of a timer turned off")
  }

  // A phone in another zone than the plug's (its owner abroad): the plug keeps its own time, so the warning says whose.
  func testAnOutletsTimerInAnotherZoneSaysWhose() {
    let app = launch("-seed-tanks", "plug", "-seed-tuya-keys", "-stand-in-timer", "enabled", zone: "Europe/Berlin")
    connect(app)
    pickOutlet(app, "Đèn · Ổ cắm bể 60 (gợi ý)")
    expect(app, "outlet-warning", contains: "Ổ “Đèn” tự tắt lúc 00:00 mỗi ngày (giờ Asia/Ho_Chi_Minh).")
  }

  func testTakingTheOutletBackAsksAgainAndDropsTheWarning() {
    var app = launch("-seed-tanks", "plug", "-seed-tuya-keys", "-stand-in-timer", "enabled")
    connect(app)
    pickOutlet(app, "Đèn · Ổ cắm bể 60 (gợi ý)")
    expect(app, "outlet-warning", contains: "Ổ “Đèn” tự tắt lúc 00:00 mỗi ngày.")
    // "Đổi ổ" → "Bỏ chọn ổ": no outlet, no warning, the question again.
    pickOutlet(app, "Bỏ chọn ổ")
    expect(app, "outlet-question", contains: "Đèn cắm vào ổ nào?")
    XCTAssertFalse(element(app, "outlet-warning").exists || element(app, "light-outlet").exists, "the outlet taken back is still shown")
    app.terminate()
    // Gone from the light's record, not only from the screen.
    app = launch("-seed-tuya-keys", "-stand-in-timer", "enabled", reset: false)
    connect(app)
    expect(app, "outlet-question", contains: "Đèn cắm vào ổ nào?")
    XCTAssertFalse(element(app, "light-outlet").exists, "the outlet taken back was kept")
  }

  func testALightNotOnASmartPlugIsAskedNoMoreOnThisPhone() {
    var app = launch("-seed-tanks", "plug", "-seed-tuya-keys", "-stand-in-timer", "enabled")
    connect(app)
    expect(app, "outlet-question", contains: "Đèn cắm vào ổ nào?")
    pickOutlet(app, "Đèn không cắm ổ cắm Smart Life")
    // The question goes; a quiet way to pick after all stays.
    expect(app, "pick-outlet", contains: "Chọn ổ cắm của đèn")
    XCTAssertFalse(element(app, "outlet-question").exists, "still asked which outlet")
    app.terminate()
    // Kept on this phone across a launch.
    app = launch("-seed-tuya-keys", "-stand-in-timer", "enabled", reset: false)
    connect(app)
    expect(app, "pick-outlet", contains: "Chọn ổ cắm của đèn")
    XCTAssertFalse(element(app, "outlet-question").exists, "asked again after a launch")
    // Picked after all: the outlet and its warning.
    pickOutlet(app, "Đèn · Ổ cắm bể 60 (gợi ý)")
    expect(app, "outlet-warning", contains: "Ổ “Đèn” tự tắt lúc 00:00 mỗi ngày.")
  }

  // MARK: Week Aqua

  // The Week Aqua screen, on the simulator's three 5746 lights and one 5745 (`-fake-weekaqua`). These lights answer
  // nothing: what the app shows is what it sent.

  func testWeekAquaFindsItsLightsAndSendsNothingToAnotherCode() {
    let app = launch("-fake-weekaqua")
    findWeekAqua(app)
    XCTAssertEqual(app.buttons.matching(identifier: "wa-light").count, 3)
    expect(app, "wa-unsupported", contains: "Mã 5745: chưa hỗ trợ, AquaTome không gửi gì tới đèn này.")
    XCTAssertFalse(text(app, "DYSL30").exists, "a Chihiros light listed with the Week Aqua ones")
    expect(app, "wa-no-report", contains: "Đèn Week Aqua không báo lại gì")
    // The 5745 light can't be chosen: nothing to connect to, nothing sent.
    scrolledTo(app, "wa-unsupported").tap()
    XCTAssertFalse(element(app, "wa-connect").isEnabled, "a light of another code chosen")
    XCTAssertFalse(element(app, "wa-write").isEnabled)
    let frames = element(app, "wa-frames")
    XCTAssertTrue(!frames.exists || frames.label.isEmpty, "frames sent: \(frames.label)")
    // The Chihiros screen still finds its own light only.
    app.navigationBars.buttons.firstMatch.tap()
    tap(app, "scan")
    XCTAssertTrue(app.buttons["light"].firstMatch.waitForExistence(timeout: 5), "no Chihiros light found")
    XCTAssertEqual(app.buttons.matching(identifier: "light").count, 1, "Week Aqua lights listed with the Chihiros one")
  }

  func testWeekAquaWritesAGroupInTheOrderTheLightsTakeThenSetsTheirClock() {
    let app = launch("-fake-weekaqua")
    connectWeekAquaGroup(app)
    expect(app, "wa-title", contains: "3 đèn đang kết nối")
    expect(app, "wa-last-sent", contains: "AquaTome chưa gửi gì tới các đèn này.")
    XCTAssertFalse(element(app, "wa-clock").isEnabled, "the clock set with nothing sent yet")
    // The owner's timer: on 02:50, off 02:40, past midnight.
    pick(app, "wa-on-hour", "02")
    pick(app, "wa-on-minute", "50")
    pick(app, "wa-off-hour", "02")
    pick(app, "wa-off-minute", "40")
    expect(app, "wa-hours", contains: "Đèn sáng 23 tiếng 50 phút mỗi ngày.")
    tap(app, "wa-preset-green")
    tap(app, "wa-write")
    let confirm = app.alerts.buttons["Ghi màu và giờ"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "the first write didn't ask")
    confirm.tap()
    expect(app, "wa-notice", contains: "Đã ghi vào 3 đèn: bật 02:50, tắt 02:40.")
    expectWeekAquaWrite(app, levels: "6c e3 73 eb", timer: "02 50 02 40 01")
    expect(app, "wa-last-sent", contains: "Lần gửi cuối từ AquaTome: Green 100% · bật 02:50, tắt 02:40")

    // The clock: the same order again, with what was sent last.
    tap(app, "wa-clock")
    expect(app, "wa-notice", contains: "Đã chỉnh giờ 3 đèn theo máy này")
    expectWeekAquaWrite(app, levels: "6c e3 73 eb", timer: "02 50 02 40 01", writes: 2)
    expect(app, "wa-clock-at", contains: "Chỉnh giờ lần cuối")
  }

  func testWeekAquaColourByHandAndItsBrightness() {
    let app = launch("-fake-weekaqua")
    connectWeekAquaGroup(app)
    tap(app, "wa-preset-green")
    slideToStart(app, "wa-uv")
    expect(app, "wa-uv", value: "0%")
    XCTAssertFalse(element(app, "wa-preset-green").isSelected, "still Green with its UV off")
    let shown = slideLow(app, "wa-brightness")
    let b = Int(shown?.dropLast() ?? "") ?? -1
    XCTAssertTrue((1..<50).contains(b), "brightness \(shown ?? "none")")
    // Green without its UV, scaled by the brightness, each level rounded.
    let l = [108, 227, 115, 0].map { ($0 * b + 50) / 100 }
    expect(app, "wa-levels", contains: "Sẽ gửi: đỏ \(l[0]), xanh lá \(l[1]), xanh dương \(l[2]), UV 0, trên thang 235.")
    tap(app, "wa-write")
    app.alerts.buttons["Ghi màu và giờ"].tap()
    expect(app, "wa-notice", contains: "Đã ghi vào 3 đèn: bật 12:00, tắt 20:00.")
    expectWeekAquaWrite(app, levels: l.prefix(3).map { String(format: "%02x", $0) }.joined(separator: " ") + " 00", timer: "12 00 20 00 01")
    expect(app, "wa-last-sent", contains: "Màu riêng \(b)% · bật 12:00, tắt 20:00")
  }

  func testWeekAquaKeepsTheGroupOnATankAndConnectsItFromThere() {
    let app = launch("-fake-weekaqua")
    connectWeekAquaGroup(app)
    tap(app, "wa-write")
    app.alerts.buttons["Ghi màu và giờ"].tap()
    expect(app, "wa-notice", contains: "Đã ghi vào 3 đèn: bật 12:00, tắt 20:00.")
    tap(app, "wa-disconnect")
    XCTAssertTrue(element(app, "wa-saved").waitForExistence(timeout: 5), "the group isn't listed as saved")
    // Kept on one new tank, each light with what was sent.
    app.openTab("Bể của tôi")
    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the lights weren't kept on a tank")
    XCTAssertTrue(row.label.contains("Bể của tôi") && row.label.contains("3 đèn"), row.label)
    row.tap()
    let sent = app.staticTexts.matching(NSPredicate(format: "label == %@", "Green 100% · bật 12:00, tắt 20:00"))
    XCTAssertTrue(sent.firstMatch.waitForExistence(timeout: 5), "what was sent isn't on the tank")
    XCTAssertEqual(sent.count, 3)
    // A light there opens the Week Aqua screen and connects the whole group.
    app.buttons["tank-light"].firstMatch.tap()
    expect(app, "wa-notice", contains: "Đã kết nối 3 đèn Week Aqua.", timeout: 20)
    expect(app, "wa-last-sent", contains: "Green 100% · bật 12:00, tắt 20:00")
    // The Chihiros screen doesn't list them among its saved lights.
    app.navigationBars.buttons.firstMatch.tap()
    expect(app, "card-title", contains: "Kết nối đèn của bạn")
    XCTAssertFalse(element(app, "saved-light").exists, "a Week Aqua light among the Chihiros ones")
  }

  /// Two tanks: the group lands on the first, and its "Bể" moves all three to the tank they light (the owner, 13 Nov:
  /// "my blackwater, weekaqua").
  func testWeekAquaTheGroupMovesToTheTankItLights() {
    let app = launch("-fake-weekaqua", "-seed-tanks", "two")
    connectWeekAquaGroup(app)
    tap(app, "wa-tank")
    let other = app.buttons["Bể nước đen"].firstMatch
    XCTAssertTrue(other.waitForExistence(timeout: 5), "no other tank in the group's Bể")
    other.tap()
    app.openTab("Bể của tôi")
    let row = app.buttons.matching(identifier: "tank").matching(NSPredicate(format: "label CONTAINS %@", "Bể nước đen")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no Bể nước đen in the list")
    XCTAssertTrue(row.label.contains("3 đèn"), row.label)
  }

  func testWeekAquaALightLostWhileWritingLeavesTheOthersWrittenWholeAndTheRecordTrue() {
    let app = launch("-fake-weekaqua", "-fake-weekaqua-drop")
    connectWeekAquaGroup(app)
    tap(app, "wa-write")
    app.alerts.buttons["Ghi màu và giờ"].tap()
    // The second light drops once it took the levels; the other two get the timer and manual mode after them.
    expect(app, "wa-notice", contains: "Mất kết nối với WEEKAQUA3.0 · …E5:F7 khi đang ghi: các đèn còn lại đã nhận đủ.")
    let clock = "ff [0-9]{2} [0-9]{2} [0-9]{2} 55 55 55 55", manual = "fd f1 55 55 55 55 55 55"
    let each: [(frame: String, lights: Int)] = [(clock, 3), (manual, 3), ("fb f9 6c e3 73 eb 55 55", 3), ("fe f9 12 00 20 00 01 00", 2),
                                                (manual, 2)]
    let frames = each.map { Array(repeating: $0.frame, count: $0.lights).joined(separator: " \\| ") }.joined(separator: " \\| ")
    wait(app, "wa-frames", NSPredicate(format: "label MATCHES %@", frames), "frames like /\(frames)/", file: #filePath, line: #line)
    // The group let go whole, to be connected again together.
    XCTAssertTrue(element(app, "wa-saved").waitForExistence(timeout: 5), "the group wasn't let go")
    // On the tank: the two written with what they were sent, the lost one with nothing.
    app.openTab("Bể của tôi")
    let row = app.buttons["tank"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the lights weren't kept on a tank")
    row.tap()
    let sent = app.staticTexts.matching(NSPredicate(format: "label == %@", "Green 100% · bật 12:00, tắt 20:00"))
    XCTAssertTrue(sent.firstMatch.waitForExistence(timeout: 5), "what was sent isn't on the tank")
    XCTAssertEqual(sent.count, 2)
    XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label == %@", "AquaTome chưa gửi gì tới đèn này.")).count, 1)
    // Connected again, the group asks before writing: one of its lights has nothing from AquaTome yet.
    app.buttons["tank-light"].firstMatch.tap()
    expect(app, "wa-notice", contains: "Đã kết nối 3 đèn Week Aqua.", timeout: 20)
    tap(app, "wa-write")
    XCTAssertTrue(app.alerts.buttons["Ghi màu và giờ"].waitForExistence(timeout: 5), "the light never written to wasn't asked for")
  }

  /// The owner's Love Ecology light (13 Nov: "I cant control love exology on app"): its card is the owner's account's
  /// alone, and off, then a colour, are each broadcast as recorded (the simulator's stand-in keeps what it was given),
  /// the card saying what was sent.
  func testTheOwnersLoveEcologyLightTakesOffThenAColour() {
    let app = launch("-fake-accounts", "on", "-reset-fake-server", "-fake-owner", "ui-apple")
    XCTAssertFalse(element(app, "lamp-off").waitForExistence(timeout: 2), "the light's card before the owner signed in")
    XCTAssertFalse(element(app, "lamp-trial-off").exists, "the trial row before the owner signed in")
    app.openAccount()
    app.signInWithStandInApple()
    app.openTab("Đèn")
    // The line is there before the first send, so sending doesn't push the cards below down.
    expect(app, "lamp-status", contains: "Chưa gửi lệnh nào")
    tap(app, "lamp-off")
    expect(app, "lamp-sent", contains: "off")
    expect(app, "lamp-status", contains: "Đã gửi “Tắt”")
    // The time as the schedule writes it, 24-hour whatever the phone's setting.
    XCTAssertNotNil(element(app, "lamp-status").label.range(of: #"lúc \d{2}:\d{2}\.$"#, options: .regularExpression), element(app, "lamp-status").label)
    tap(app, "lamp-blue")
    expect(app, "lamp-sent", contains: "off blue")
    expect(app, "lamp-status", contains: "Đã gửi “Xanh dương”")
    // The owner's trial of commands built anew (14 Nov): each broadcast as the recorded ones are, green last to put it back.
    // The other buttons wait while one sends (3 s), so each is sent before the next tap.
    let trials = [("trial-white-half", "Trắng 50% (tự tạo)"), ("trial-off", "Tắt (tự tạo 1)"), ("trial-on", "Bật (tự tạo 1)"),
                  ("trial-off-recorded", "Tắt (tự tạo 2)"), ("trial-on-recorded", "Bật (tự tạo 2)"), ("trial-green", "Xanh lá (ghi sẵn)")]
    for (id, name) in trials {
      tap(app, "lamp-" + id)
      expect(app, "lamp-sent", contains: id)
      expect(app, "lamp-status", contains: "Đã gửi “\(name)”")
      expect(app, "lamp-status", contains: "Đợi 10 giây rồi bấm tiếp.")
    }
  }

  // MARK: Helpers

  /// The Week Aqua screen, its lights found (`-fake-weekaqua`).
  private func findWeekAqua(_ app: XCUIApplication) {
    openWeekAqua(app, scrolledTo(app, "weekaqua"))
    tap(app, "wa-scan")
    XCTAssertTrue(app.buttons.matching(identifier: "wa-light").element(boundBy: 2).waitForExistence(timeout: 5), "the three 5746 lights weren't found")
  }

  /// Opens the Week Aqua screen from its row on Đèn, in moments: from the top of Đèn it once froze the app before the
  /// screen opened (13 Nov), and a tap waits for the app to settle before any timeout starts.
  private func openWeekAqua(_ app: XCUIApplication, _ row: XCUIElement, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(row.isHittable, "the Week Aqua row isn't reachable", file: file, line: line)
    let start = Date()
    row.tap()
    XCTAssertTrue(app.buttons["wa-scan"].waitForExistence(timeout: 5), "the Week Aqua screen didn't open", file: file, line: line)
    let took = Date().timeIntervalSince(start)
    XCTAssertLessThan(took, 8, "the Week Aqua screen took \(Int(took)) s to open", file: file, line: line)
  }

  /// The three 5746 lights chosen and connected as one group.
  private func connectWeekAquaGroup(_ app: XCUIApplication) {
    findWeekAqua(app)
    for i in 0..<3 { scrolledTo(app, app.buttons.matching(identifier: "wa-light").element(boundBy: i)).tap() }
    expect(app, "wa-connect", contains: "Kết nối 3 đèn")
    tap(app, "wa-connect")
    expect(app, "wa-notice", contains: "Đã kết nối 3 đèn Week Aqua.")
  }

  /// A menu picker set to `value` ("02").
  private func pick(_ app: XCUIApplication, _ id: String, _ value: String) {
    tap(app, id)
    // The menu's item, not a picker already showing the same value.
    let item = app.buttons.matching(NSPredicate(format: "label == %@ AND NOT (identifier BEGINSWITH 'wa-')", value)).firstMatch
    XCTAssertTrue(item.waitForExistence(timeout: 5), "no \(value) in \(id)")
    item.tap()
  }

  /// The last of `writes` writes in a row, each its five frames to the three lights, frame by frame: the clock, manual
  /// mode, the levels, the timer, manual mode.
  private func expectWeekAquaWrite(_ app: XCUIApplication, levels: String, timer: String, writes: Int = 1, file: StaticString = #filePath, line: UInt = #line) {
    let clock = "ff [0-9]{2} [0-9]{2} [0-9]{2} 55 55 55 55", manual = "fd f1 55 55 55 55 55 55"
    let one = [clock, manual, "fb f9 \(levels) 55 55", "fe f9 \(timer) 00", manual]
      .map { Array(repeating: $0, count: 3).joined(separator: " \\| ") }.joined(separator: " \\| ")
    let pattern = Array(repeating: one, count: writes).joined(separator: " \\| ")
    wait(app, "wa-frames", NSPredicate(format: "label MATCHES %@", "(.* \\| )?" + pattern), "frames like /\(pattern)/", file: file, line: line)
  }

  /// A slider dragged to 0%: its thumb taken well past the start (as `slideToEnd`, the other way).
  private func slideToStart(_ app: XCUIApplication, _ id: String) {
    for _ in 0..<3 {
      let s = scrolledTo(app, id)
      let x = 14 + s.normalizedSliderPosition * (s.frame.width - 28)
      s.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5)).withOffset(CGVector(dx: x, dy: 0))
        .press(forDuration: 0.1, thenDragTo: s.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5)).withOffset(CGVector(dx: -80, dy: 0)))
      if element(app, id).value as? String == "0%" { return }
    }
  }

  /// The app on its Đèn tab, in Vietnamese or in Indonesian (whose words run longer).
  /// `zone`: the phone's time zone, Vietnam's unless a flow says otherwise. GitHub's simulators run in UTC, the own
  /// Mac's in Vietnam time; the stand-in plug keeps Vietnam's, and a time shown in a zone not the phone's says whose.
  private func launch(_ args: String..., reset: Bool = true, indonesian: Bool = false,
                      zone: String = "Asia/Ho_Chi_Minh") -> XCUIApplication {
    let app = XCUIApplication()
    app.launchEnvironment["TZ"] = zone
    let (language, locale, tab) = indonesian ? ("id", "id_ID", "Lampu") : ("vi", "vi_VN", "Đèn")
    app.launchArguments = ["-AppleLanguages", "(\(language))", "-AppleLocale", locale, "-fixed-handbook"] + (reset ? ["-reset-defaults"] : []) + args
    app.launchForFlow()
    app.openTab(tab)
    return app
  }

  /// Opens the light's outlet menu ("Chọn ổ", "Đổi ổ") and taps one of its items.
  private func pickOutlet(_ app: XCUIApplication, _ item: String) {
    tap(app, "pick-outlet")
    let b = app.buttons[item].firstMatch
    XCTAssertTrue(b.waitForExistence(timeout: 5), "no “\(item)” in the outlet menu")
    b.tap()
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

  /// The write bar's words whole: its button on one line (no taller than "Xem thử cả ngày", a button of its size) and
  /// the summary, read as one line, broken once at most (no taller than the button).
  private func expectWholeBar(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
    let play = scrolledTo(app, "play"), button = element(app, "write"), summary = element(app, "summary")
    XCTAssertLessThanOrEqual(button.frame.height, play.frame.height + 1, "the write button's words broken", file: file, line: line)
    XCTAssertLessThanOrEqual(summary.frame.height, button.frame.height, "the summary broken more than once", file: file, line: line)
    XCTAssertFalse(summary.label.contains("\n"), "the summary read with its break", file: file, line: line)
  }

  private func text(_ app: XCUIApplication, _ part: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", part)).firstMatch
  }

  /// By its identifier. The lookup also matches labels, so a text anywhere in the app that reads the same is found too.
  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }

  /// A slider dragged low but not to 0%, and what it then reads. A drag is only "best effort" (XCUIElement): ones aimed
  /// at 5% and at 10% landed on 0% on CI, so it is aimed a little higher each time until the slider reads above 0%.
  private func slideLow(_ app: XCUIApplication, _ id: String) -> String? {
    var value: String?
    for position in [0.1, 0.15, 0.2, 0.3] {
      scrolledTo(app, id).adjust(toNormalizedSliderPosition: position)
      value = element(app, id).value as? String
      if let v = value, let n = Int(v.dropLast()), n > 0, n < 50 { break }
    }
    return value
  }

  /// A slider dragged to 100%: its thumb taken well past the end, where the slider stops at its maximum however the
  /// drag's last steps land. `adjust(toNormalizedSliderPosition: 1)` is only "best effort" (XCUIElement) and stopped at
  /// 87%, 95% and 97% on CI's iPhone, even dragged again. The thumb is found where UIKit draws it: its centre half its
  /// width (28 pt) in from either end of the track at 0 and 1.
  private func slideToEnd(_ app: XCUIApplication, _ id: String) {
    for _ in 0..<3 {
      let s = scrolledTo(app, id)
      let x = 14 + s.normalizedSliderPosition * (s.frame.width - 28)
      s.coordinate(withNormalizedOffset: CGVector(dx: 0, dy: 0.5)).withOffset(CGVector(dx: x, dy: 0))
        .press(forDuration: 0.1, thenDragTo: s.coordinate(withNormalizedOffset: CGVector(dx: 1, dy: 0.5)).withOffset(CGVector(dx: 80, dy: 0)))
      if element(app, id).value as? String == "100%" { return }
    }
  }

  /// Scrolled until the element is clear of the navigation bar above and the status and write bars pinned below (the
  /// content scrolls under them), however tall the notice in them is.
  private func scrolledTo(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    let e = element(app, id)
    // The bars pinned to the bottom: always in view.
    if id.hasPrefix("notice") || id == "write" || id == "summary" || id == "wa-notice" || id == "wa-write" { _ = e.waitForExistence(timeout: 2); return e }
    return scrolledTo(app, e)
  }

  private func scrolledTo(_ app: XCUIApplication, _ e: XCUIElement) -> XCUIElement {
    _ = e.waitForExistence(timeout: 2) // it may still be appearing
    var downs = 0
    // Read once (each query costs the test a moment): the bars don't move while the content scrolls. The navigation
    // bar is at its tallest here or taller than it will be, so the margin only grows.
    let window = app.windows.firstMatch.frame
    let pinned = ["notice", "summary", "write", "wa-notice", "wa-write"].map { element(app, $0) }.filter { $0.exists }.map { $0.frame.minY }.min() ?? .infinity
    let bar = app.navigationBars.firstMatch
    let top = bar.exists ? bar.frame.maxY + 8 : window.minY
    let bottom = min(window.maxY - window.height / 5, pinned - 16)
    let third = window.height / 3
    // The content moves about half again as far as the finger (446 pt for a 291 pt drag on the iPhone 17 simulator CI
    // uses, the large title not counted): a drag shortened by that much lands at the band's middle, and one that misses
    // still ends nearer, whatever that ratio is up to three.
    let carry: CGFloat = 1.5
    for _ in 0..<20 {
      let f = e.exists ? e.frame : nil
      if let f, f.minY > top, f.maxY < bottom { break }
      // To the middle of the clear band, as far as a drag goes. A fixed drag of about a third moved the content past the
      // band each time (the quick actions: 20 drags, up and down, then a tap where they happened to be). Not built yet
      // (off the screen): down the screen first, then back up.
      if let f {
        drag(app, by: max(-third, min(third, ((top + bottom) / 2 - f.midY) / carry)), above: bottom / window.height)
      } else {
        drag(app, by: downs < 8 ? -third : third, above: bottom / window.height)
        downs += 1
      }
    }
    return e
  }

  /// A drag of `dy` points (up when negative) at the screen's right edge, clear of sliders and handles, held before it
  /// lets go so the content settles where the next read finds it. An upward drag starts above `above` (a fraction of the
  /// window): at the largest text the notice bar reaches above 0.65, and a drag begun on it moves nothing.
  private func drag(_ app: XCUIApplication, by dy: CGFloat, above: CGFloat) {
    let a = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: dy < 0 ? min(0.65, above) : 0.3))
    a.press(forDuration: 0.05, thenDragTo: a.withOffset(CGVector(dx: 0, dy: dy)), withVelocity: .default, thenHoldForDuration: 0.2)
  }

  private func tap(_ app: XCUIApplication, _ id: String) {
    let e = scrolledTo(app, id)
    XCTAssertTrue(e.waitForExistence(timeout: 5), "\(id) missing")
    XCTAssertTrue(e.isHittable, "\(id) not reached by scrolling")
    e.tap()
  }

  /// The schedules listed as written to this light, the last one first.
  private func savedRows(_ app: XCUIApplication) -> [String] {
    app.descendants(matching: .any).matching(identifier: "saved-schedule").allElementsBoundByIndex.map { $0.label }
  }

  private func expect(_ app: XCUIApplication, _ id: String, contains text: String, timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) {
    wait(app, id, NSPredicate(format: "label CONTAINS %@", text), "“\(text)”", timeout: timeout, file: file, line: line)
  }

  private func expect(_ app: XCUIApplication, _ id: String, lacks text: String, file: StaticString = #filePath, line: UInt = #line) {
    wait(app, id, NSPredicate(format: "exists == true AND NOT (label CONTAINS %@)", text), "no “\(text)”", file: file, line: line)
  }

  private func expect(_ app: XCUIApplication, _ id: String, value: String, file: StaticString = #filePath, line: UInt = #line) {
    wait(app, id, NSPredicate(format: "value CONTAINS %@", value), "the value “\(value)”", file: file, line: line)
  }

  /// Drags a handle of the day from where it is (`at`, minutes) by as much as it takes to reach `minute`: the day's
  /// width is 24 hours. Below the ramp knob for on and off. A drag that lands a step off (the runners' touches do, now
  /// and then: 20:00 to 23:00 landed on 23:15, twice) is put right by going back an hour the way it came and dragging
  /// the last hour: a step alone is shorter than a handle needs to start moving. Further off is left to fail the test.
  private func drag(_ app: XCUIApplication, _ id: String, from at: Double, to minute: Double) {
    slide(app, id, by: minute - at)
    let back = minute + (minute < at ? 60 : -60)
    for _ in 0..<2 {
      guard let now = minutes(app, id), now != minute, abs(now - minute) <= 30 else { return }
      slide(app, id, by: back - now)
      guard let then = minutes(app, id) else { return }
      slide(app, id, by: minute - then)
    }
  }

  /// One drag of a handle of the day, by `span` minutes.
  private func slide(_ app: XCUIApplication, _ id: String, by span: Double) {
    let day = scrolledTo(app, "day").frame
    let start = element(app, id).coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: id == "handle-ramp" ? 0.5 : 0.8))
    let end = start.withOffset(CGVector(dx: day.width * span / 1440, dy: 0))
    start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
  }

  /// A handle's value in minutes: “Tắt lúc 23:15” is 1395, “60 phút” is 60.
  private func minutes(_ app: XCUIApplication, _ id: String) -> Double? {
    guard let value = element(app, id).value as? String else { return nil }
    if let t = value.firstMatch(of: #/(\d+):(\d+)/#), let h = Double(t.1), let m = Double(t.2) { return h * 60 + m }
    return value.firstMatch(of: #/\d+/#).flatMap { Double($0.0) }
  }

  /// The fake light's last frames (hex, " | " between them), as the app shows them to the tests, match `pattern`.
  private func expectFrames(_ app: XCUIApplication, _ pattern: String, timeout: TimeInterval = 10, file: StaticString = #filePath, line: UInt = #line) {
    wait(app, "frames", NSPredicate(format: "label MATCHES %@", pattern), "frames like /\(pattern)/", timeout: timeout, file: file, line: line)
  }

  /// To the home screen until the app is in the background, then back to it.
  private func leaveAndComeBack(_ app: XCUIApplication, file: StaticString = #filePath, line: UInt = #line) {
    XCUIDevice.shared.press(.home)
    let states = [XCUIApplication.State.runningBackground, .runningBackgroundSuspended].map { NSNumber(value: $0.rawValue) }
    let gone = expectation(for: NSPredicate(format: "state IN %@", states), evaluatedWith: app)
    XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 5), .completed, "the app didn't go to the background", file: file, line: line)
    app.activate()
  }

  /// Every element of this screen is there without scrolling (it isn't a lazy list): only taps need to scroll.
  private func wait(_ app: XCUIApplication, _ id: String, _ p: NSPredicate, _ what: String, timeout: TimeInterval = 10, file: StaticString, line: UInt) {
    let e = element(app, id)
    // Checked once more after the wait: on a loaded CI runner a snapshot can take the whole timeout, and the screen was
    // already right ("expected X, got X", PR #212).
    if XCTWaiter.wait(for: [expectation(for: p, evaluatedWith: e)], timeout: timeout) != .completed, !p.evaluate(with: e) {
      XCTFail("\(id): expected \(what), got “\(e.exists ? e.label : "(missing)")”\(e.exists ? " (value “\(e.value.map { "\($0)" } ?? "")”)" : "")", file: file, line: line)
    }
  }
}
