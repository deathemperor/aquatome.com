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
    XCTAssertFalse(app.alerts.firstMatch.waitForExistence(timeout: 1), "asked again with a known schedule on the light")
    expect(app, "notice", contains: "Đã ghi: bật 12:00, tắt 20:00.")
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
    XCTAssertFalse(element(app, "notice").waitForExistence(timeout: 1), "the last notice still showing as the preview starts")
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
    XCTAssertFalse(element(app, "hand").waitForExistence(timeout: 1), "still kept as set by hand after “Theo lịch”")
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
    // What writing does is said once, in the notes at the end.
    XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Ghi lịch mới sẽ xóa các lịch đang lưu trên đèn")).count, 1)
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
    XCTAssertFalse(app.alerts.firstMatch.waitForExistence(timeout: 1), "asked again with a known schedule on the light")
    expect(app, "notice", contains: "Đã ghi: bật 13:00, tắt 19:00.")
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
    if id.hasPrefix("notice") || id == "write" || id == "summary" { _ = e.waitForExistence(timeout: 2); return e }
    return scrolledTo(app, e)
  }

  private func scrolledTo(_ app: XCUIApplication, _ e: XCUIElement) -> XCUIElement {
    _ = e.waitForExistence(timeout: 2) // it may still be appearing
    var downs = 0
    // Read once (each query costs the test a moment): the bars don't move while the content scrolls. The navigation
    // bar is at its tallest here or taller than it will be, so the margin only grows.
    let window = app.windows.firstMatch.frame
    let pinned = ["notice", "summary", "write"].map { element(app, $0) }.filter { $0.exists }.map { $0.frame.minY }.min() ?? .infinity
    let bar = app.navigationBars.firstMatch
    let top = bar.exists ? bar.frame.maxY + 8 : window.minY
    let bottom = min(window.maxY - window.height / 5, pinned - 16)
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
  /// width is 24 hours. Below the ramp knob for on and off.
  private func drag(_ app: XCUIApplication, _ id: String, from at: Double, to minute: Double) {
    let day = scrolledTo(app, "day").frame
    let start = element(app, id).coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: id == "handle-ramp" ? 0.5 : 0.8))
    let end = start.withOffset(CGVector(dx: day.width * (minute - at) / 1440, dy: 0))
    start.press(forDuration: 0.1, thenDragTo: end, withVelocity: .slow, thenHoldForDuration: 0.1)
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
