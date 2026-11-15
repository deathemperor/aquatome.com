import XCTest

/// "Ngôn ngữ" in the Tài khoản sheet: a language picked there shows at once, without closing the app. The sheet stays open
/// and its words change under the finger; every tab goes back to its first screen in that language, as opening the app in
/// it would, the tab in front staying in front; the lights, the plugs and the account stay as they were. The language is
/// read off the app's words (the tab bar, the sheet's title, SwiftUI's own) and off the handbook's (a fish's name in the
/// test index: Cá neon, ปลานีออน), on v2 and on the old look, and "Theo máy" both ways.
final class LanguageFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// The words a `String(localized:)` looks up (the sheet's privacy line) follow too: each lookup is given the language
  /// picked (`bundle: .app`, which check-strings.py holds every one to).
  private static let lookupsFollow = true

  private struct Words {
    let fish, sheet, done, privacy: String
    let tabs: [String]
  }

  private static let vi = Words(fish: "Cá neon", sheet: "Tài khoản", done: "Xong", privacy: "Thống kê không gồm tài khoản",
                                tabs: ["Hôm nay", "Khám phá", "Bể của tôi", "Đèn"])
  private static let th = Words(fish: "ปลานีออน", sheet: "บัญชี", done: "เสร็จ", privacy: "สถิติไม่รวมบัญชี",
                                tabs: ["วันนี้", "สำรวจ", "ตู้ของฉัน", "ไฟ"])

  /// v2: a fish's page open on Khám phá, Thai picked from Bể của tôi, then Tiếng Việt again.
  func testAPickedLanguageShowsAtOnceOnV2() {
    let app = launch(.v2)
    app.openTab("Khám phá")
    let neon = fish(app, Self.vi.fish)
    XCTAssertTrue(neon.waitForExistence(timeout: 10), "no Cá neon on Khám phá")
    neon.tap()
    XCTAssertTrue(app.buttons["v2-add"].waitForExistence(timeout: 5), "Cá neon's page didn't open")
    app.openTab("Bể của tôi")

    pick(app, "ภาษาไทย", Self.th)
    app.openTab("สำรวจ")
    XCTAssertTrue(fish(app, Self.th.fish).waitForExistence(timeout: 10), "Khám phá's fish aren't in Thai")
    XCTAssertFalse(fish(app, Self.vi.fish).exists, "a Vietnamese name on Khám phá in Thai")
    XCTAssertFalse(app.buttons["v2-add"].exists, "the page opened before is still there")
    XCTAssertFalse(app.pageBack.exists, "Khám phá isn't at its first screen")

    pick(app, "Tiếng Việt", Self.vi, tab: "Khám phá")
    XCTAssertTrue(fish(app, Self.vi.fish).waitForExistence(timeout: 10), "Khám phá's fish aren't in Vietnamese again")
    XCTAssertFalse(fish(app, Self.th.fish).exists, "a Thai name on Khám phá in Vietnamese")
  }

  /// The old look: a fish's page open on Tìm (from its every-fish shelf), Thai picked from Bể của tôi, then Tiếng Việt
  /// again from Tìm.
  func testAPickedLanguageShowsAtOnceOnTheOldLook() {
    let app = launch(.old)
    openEveryFish(app, Self.vi.fish).tap()
    XCTAssertTrue(app.pageBack.waitForExistence(timeout: 5), "Cá neon's page didn't open")
    app.openTab("Bể của tôi")

    let th = Words(fish: Self.th.fish, sheet: Self.th.sheet, done: Self.th.done, privacy: Self.th.privacy, tabs: ["ค้นหา", "ตู้ของฉัน", "ไฟ"])
    pick(app, "ภาษาไทย", th)
    app.openTab("ค้นหา")
    XCTAssertFalse(app.pageBack.exists, "the page opened before is still there")
    XCTAssertTrue(openEveryFish(app, Self.th.fish).exists, "Tìm's fish aren't in Thai")
    XCTAssertFalse(item(app, Self.vi.fish).exists, "a Vietnamese name on Tìm in Thai")
    app.pageBack.tap()

    let vi = Words(fish: Self.vi.fish, sheet: Self.vi.sheet, done: Self.vi.done, privacy: Self.vi.privacy, tabs: ["Tìm", "Bể của tôi", "Đèn"])
    pick(app, "Tiếng Việt", vi, tab: "Tìm")
    XCTAssertTrue(openEveryFish(app, Self.vi.fish).exists, "Tìm's fish aren't in Vietnamese again")
  }

  /// "Theo máy" on a phone in Thai: Tiếng Việt picked, then Theo máy (in the menu's Vietnamese) gives the phone's Thai
  /// back, at once.
  func testTheoMayGivesThePhonesLanguageBackAtOnce() {
    let app = launch(.v2, phone: "th")
    XCTAssertTrue(app.tabBars.buttons["ตู้ของฉัน"].waitForExistence(timeout: 10), "the app didn't open in the phone's Thai")
    app.openTab("ตู้ของฉัน")
    pick(app, "Tiếng Việt", Self.vi)
    pick(app, "Theo máy", Self.th)
  }

  /// "Theo máy" on a phone in Vietnamese: Thai picked, then Theo máy (in the menu's Thai) gives the phone's Vietnamese
  /// back, at once.
  func testTheoMayFromAnotherLanguageGoesBackToThePhones() {
    let app = launch(.v2)
    app.openTab("Bể của tôi")
    pick(app, "ภาษาไทย", Self.th)
    pick(app, "ตามเครื่อง", Self.vi)
  }

  /// Back to Vietnamese from an app opened in Thai: the words the app looks up as resources in its own locale (`.inApp`),
  /// a preset's name on Đèn and a name field's hint, come back in Vietnamese, whose .lproj has no strings of its own (its
  /// keys are the Vietnamese).
  func testBackToVietnameseFromThaiReachesThePresetsAndAFieldsHint() {
    let app = launch(.v2, phone: "th")
    app.openTab("ไฟ")
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    // Read, not tapped: its words are all the test needs, wherever the card has it.
    let preset = element(app, "preset-new")
    repeatUntil(preset.exists, times: 12) { app.swipeUp() }
    XCTAssertTrue(preset.label.contains("ตู้"), "the preset isn't in Thai to start with: \(preset.label)")
    pick(app, "Tiếng Việt", Self.vi)
    let again = element(app, "preset-new")
    repeatUntil(again.exists, times: 12) { app.swipeUp() }
    XCTAssertTrue(again.label.contains("Bể mới trồng"), "the preset's name isn't in Vietnamese: \(again.label)")
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "not a new phone")
    app.buttons["add-first"].tap()
    let name = app.textFields["name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5), "no tank form")
    XCTAssertEqual(name.placeholderValue, "Ví dụ: Bể 60 phòng khách", "the name field's hint isn't in Vietnamese")
  }

  /// What must not drop: the account signed in, a plug on a tank and its outlets, the light connected (nothing more sent to
  /// it), across Thai and back.
  func testTheAccountThePlugsAndTheLightStayAcrossASwitch() {
    let app = launch(.v2, "-fake-accounts", "on", "-reset-fake-server", "-seed-tuya-keys")
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "not a new phone")
    app.buttons["add-first"].tap()
    let name = app.textFields["name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5), "no tank form")
    name.tap()
    name.typeText("Bể 60")
    app.buttons["save"].tap()
    openTank(app)
    tap(app, "add-plug")
    let plug = app.buttons.matching(identifier: "plug-choice").matching(NSPredicate(format: "label BEGINSWITH %@", "Ổ cắm bể 60")).firstMatch
    XCTAssertTrue(plug.waitForExistence(timeout: 5), "no plug offered")
    plug.tap()
    XCTAssertTrue(app.buttons["save-plug"].waitForExistence(timeout: 5), "no outlet form")
    app.buttons["save-plug"].tap()
    XCTAssertTrue(element(app, "plug-name").waitForExistence(timeout: 5), "the plug isn't on the tank")
    app.leavePage()

    app.openTab("Đèn")
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    XCTAssertTrue(element(app, "notice").waitForExistence(timeout: 10), "no notice after connecting")
    let frames = element(app, "frames")
    XCTAssertTrue(waitFor { frames.exists && !frames.label.isEmpty }, "nothing sent to the light")
    let sent = frames.label

    app.openAccount()
    tap(app, "apple-sign-in")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 10), "not signed in")

    pickInSheet(app, "ภาษาไทย")
    XCTAssertTrue(app.navigationBars[Self.th.sheet].waitForExistence(timeout: 5), "the sheet isn't in Thai")
    XCTAssertTrue(reached(app, "account-status").exists, "signed out by the switch")
    app.closeAccount()
    XCTAssertTrue(app.tabBars.buttons["ไฟ"].isSelected, "Đèn isn't in front after the switch")
    XCTAssertTrue(element(app, "nickname").waitForExistence(timeout: 5), "the light isn't connected after the switch")
    XCTAssertFalse(element(app, "notice").exists, "the notice from before the switch is still there")
    XCTAssertEqual(element(app, "frames").label, sent, "the switch sent the light something")

    app.openTab("ตู้ของฉัน")
    openTank(app)
    XCTAssertTrue(element(app, "plug-name").waitForExistence(timeout: 10), "the plug isn't on the tank after the switch")
    XCTAssertTrue(app.switches["outlet-switch_1"].waitForExistence(timeout: 10), "the plug's outlets weren't read again")
    app.leavePage()

    app.openAccount()
    pickInSheet(app, "Tiếng Việt")
    XCTAssertTrue(app.navigationBars[Self.vi.sheet].waitForExistence(timeout: 5), "the sheet isn't in Vietnamese again")
    XCTAssertTrue(reached(app, "account-status").exists, "signed out by the switch back")
    app.closeAccount()
    app.openTab("Đèn")
    XCTAssertTrue(element(app, "nickname").waitForExistence(timeout: 5), "the light isn't connected after the switch back")
    XCTAssertEqual(element(app, "frames").label, sent, "the switch back sent the light something")
  }

  /// The sheet and a tab's first screen in each language at the largest text, Thai and Malay among them: shots kept with
  /// the run (`language-<code>-sheet`, `language-<code>-tab`).
  func testEachLanguageAtTheLargestText() {
    let app = launch(.v2, "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    app.openTab("Khám phá")
    for (name, code, tab) in [("Bahasa Indonesia", "id", "Jelajahi"), ("ภาษาไทย", "th", "สำรวจ"), ("Bahasa Melayu", "ms", "Teroka"),
                              ("Tiếng Việt", "vi", "Khám phá")] {
      app.openAccount()
      pickInSheet(app, name)
      // The row in view, its new words under it.
      _ = reached(app, "language")
      shot("language-\(code)-sheet")
      app.closeAccount()
      XCTAssertTrue(app.tabBars.buttons[tab].waitForExistence(timeout: 5), "no \(tab) in the tab bar")
      XCTAssertTrue(app.tabBars.buttons[tab].isSelected, "\(tab) isn't in front")
      _ = XCTWaiter.wait(for: [XCTestExpectation(description: "drawn")], timeout: 1)
      shot("language-\(code)-tab")
    }
  }

  // MARK: Helpers

  private func launch(_ look: Look, phone: String = "vi", _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    let locale = ["vi": "vi_VN", "th": "th_TH"][phone] ?? "vi_VN"
    app.launchArguments = ["-AppleLanguages", "(\(phone))", "-AppleLocale", locale, "-fixed-handbook", "-reset-defaults"] + args
    app.launchForFlow(look)
    return app
  }

  /// A language picked in the sheet, opened from the tab in front: the sheet stays open in its words, and once closed the
  /// tab bar is in them with the same tab in front (`tab`, else the one in `words` at the same place as before).
  private func pick(_ app: XCUIApplication, _ name: String, _ words: Words, tab: String? = nil,
                    file: StaticString = #filePath, line: UInt = #line) {
    let before = app.tabBars.buttons.allElementsBoundByIndex.firstIndex { $0.isSelected }
    app.openAccount()
    pickInSheet(app, name)
    XCTAssertTrue(app.buttons["account-done"].exists, "the sheet closed", file: file, line: line)
    XCTAssertTrue(app.navigationBars[words.sheet].waitForExistence(timeout: 5), "the sheet's title isn't \(words.sheet)", file: file, line: line)
    if Self.lookupsFollow {
      let privacy = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", words.privacy)).firstMatch
      XCTAssertTrue(app.scrolledDown(to: privacy).exists, "the sheet's privacy line isn't in the new words", file: file, line: line)
    }
    app.buttons["account-done"].tap()
    XCTAssertTrue(app.buttons["account-done"].waitForNonExistence(timeout: 5), "the sheet didn't close", file: file, line: line)
    for t in words.tabs {
      XCTAssertTrue(app.tabBars.buttons[t].waitForExistence(timeout: 5), "no \(t) in the tab bar", file: file, line: line)
    }
    let front = tab ?? before.map { words.tabs[$0] }
    if let front { XCTAssertTrue(app.tabBars.buttons[front].isSelected, "\(front) isn't in front", file: file, line: line) }
  }

  /// "Ngôn ngữ" set from its menu in the open sheet: the item whose name starts so ("Theo máy" has the phone's language
  /// under it).
  private func pickInSheet(_ app: XCUIApplication, _ name: String) {
    tap(app, "language")
    let item = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(item.waitForExistence(timeout: 5), "no \(name) in the menu")
    item.tap()
  }

  private func fish(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
  }

  private func item(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

  /// Tìm's every-fish shelf (the old look), opened from its home, and the fish named so on it.
  private func openEveryFish(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    let all = app.homeRow("all-fish")
    XCTAssertTrue(all.exists, "no Tất cả loài on Tìm")
    all.tap()
    let fish = item(app, name)
    _ = fish.waitForExistence(timeout: 10)
    return fish
  }

  /// Down the sheet or the screen until it's there, then back up if it isn't.
  private func reached(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    let e = element(app, id)
    if !e.waitForExistence(timeout: 3) { repeatUntil(e.exists, times: 8) { app.swipeUp() } }
    repeatUntil(e.exists, times: 8) { app.swipeDown() }
    return e
  }

  private func tap(_ app: XCUIApplication, _ id: String) {
    let e = reached(app, id)
    repeatUntil(e.isHittable, times: 4) { app.swipeUp() }
    e.tap()
  }

  private func openTank(_ app: XCUIApplication) {
    let tank = app.buttons["tank"].firstMatch
    XCTAssertTrue(tank.waitForExistence(timeout: 5), "no tank")
    tank.tap()
  }

  private func waitFor(_ done: @escaping () -> Bool) -> Bool {
    let until = Date().addingTimeInterval(10)
    while Date() < until {
      if done() { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.25))
    }
    return false
  }

  private func shot(_ name: String) {
    let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    a.name = name
    a.lifetime = .keepAlways
    add(a)
  }
}
