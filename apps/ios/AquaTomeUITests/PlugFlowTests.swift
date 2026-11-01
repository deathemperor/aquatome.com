import XCTest

/// "Ổ cắm" on a tank (docs/smart-plugs.md), against the app's stand-in Tuya cloud (`PlugsModel.forSimulator`: a project
/// with made-up keys and strips): one that switches, one that never confirms ("Ổ cắm kệ"), one that drops off the
/// network when switched ("Ổ cắm ban công"), and a sensor. `-seed-tuya-keys` starts with the stand-in's keys entered.
/// No test reaches Tuya, and none needs an AquaTome account.
final class PlugFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testSetsUpTheTuyaKeysChecksThemAndRemovesThem() {
    let app = launch(keys: false)
    XCTAssertTrue(element(app, "plugs-intro").waitForExistence(timeout: 5), "no word on what plugs need")
    XCTAssertFalse(element(app, "add-plug").exists)
    XCTAssertFalse(element(app, "apple-sign-in").exists, "an AquaTome account asked for")
    tap(app, "plug-setup")
    // Wrong keys: said so, not kept.
    type(app, "access-id", "fake-access-id")
    secure(app, "fake-wrong-secret")
    tap(app, "check-keys")
    XCTAssertTrue(result(app, "Tuya không nhận khóa này: kiểm tra Access ID, Access Secret và trung tâm dữ liệu."), "wrong keys not said")
    XCTAssertFalse(element(app, "keys-saved").exists, "wrong keys kept")
    // The stand-in project's keys: the list is read, and they're kept.
    secure(app, "fake-access-secret")
    tap(app, "check-keys")
    XCTAssertTrue(result(app, "Đã kết nối: 3 ổ cắm."), "the check didn't read the list")
    XCTAssertTrue(element(app, "keys-saved").waitForExistence(timeout: 5))
    XCTAssertEqual(element(app, "keys-saved").label, "Đã lưu khóa của một dự án ở Tây Mỹ (Western America).")
    app.buttons["setup-done"].tap()
    XCTAssertTrue(element(app, "add-plug").waitForExistence(timeout: 5), "the tank doesn't offer the plugs")
    // Removed: back to setting up; nothing on the tank is lost.
    tap(app, "plug-setup")
    tap(app, "remove-keys")
    let confirm = app.buttons["confirm-remove-keys"].firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 5))
    confirm.tap()
    XCTAssertTrue(waitGone(element(app, "keys-saved")), "the keys weren't removed")
    app.buttons["setup-done"].tap()
    XCTAssertTrue(element(app, "plugs-intro").waitForExistence(timeout: 5))
    XCTAssertFalse(element(app, "add-plug").exists)
  }

  func testAddsAPlugToATankAndNamesItsOutlets() {
    var app = launch()
    addPlug(app, "Ổ cắm bể 60", save: false)
    // Each outlet labelled with its Smart Life name; the one without stays blank for the reader.
    XCTAssertEqual(app.textFields["label-switch_1"].value as? String, "Đèn")
    XCTAssertEqual(app.textFields["label-switch_2"].value as? String, "CO2")
    pick(app, "role-switch_3", "Lọc")
    app.buttons["save-plug"].tap()
    XCTAssertTrue(title(app, "switch_3").waitForExistence(timeout: 5))
    XCTAssertEqual([title(app, "switch_1").label, title(app, "switch_2").label, title(app, "switch_3").label], ["Đèn", "CO2", "Lọc"])
    XCTAssertEqual(element(app, "plug-name").label, "Ổ cắm bể 60")
    XCTAssertEqual(element(app, "plug-status").label, "Trực tuyến")
    // A label of the reader's own.
    tap(app, "edit-plug")
    let field = app.textFields["label-switch_3"]
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText("Lọc thùng")
    app.buttons["save-plug"].tap()
    XCTAssertTrue(app.staticTexts["Lọc thùng"].waitForExistence(timeout: 5), "the label isn't shown")
    // A strip is on one tank: it isn't offered again.
    tap(app, "add-plug")
    XCTAssertTrue(app.navigationBars["Thêm ổ cắm"].waitForExistence(timeout: 5))
    XCTAssertFalse(choice(app, "Ổ cắm bể 60").exists, "a plug already on a tank offered again")
    app.buttons["Hủy"].firstMatch.tap()
    app.terminate()

    // Kept on the tank across launches; what it reports is read again.
    app = launch(reset: false)
    XCTAssertTrue(app.staticTexts["Lọc thùng"].waitForExistence(timeout: 5), "the plug wasn't kept on the tank")
    XCTAssertTrue(outlet(app, "switch_1").waitForExistence(timeout: 5))
    XCTAssertEqual(outlet(app, "switch_1").value as? String, "1")
  }

  func testSwitchesAnOutletAndShowsWhatThePlugConfirmed() {
    let app = launch()
    addPlug(app, "Ổ cắm bể 60", roles: ["role-switch_3": "Lọc"])
    let filter = outlet(app, "switch_3")
    XCTAssertTrue(filter.waitForExistence(timeout: 5))
    XCTAssertEqual(filter.value as? String, "0")
    // A filter switches on a tap.
    filter.tap()
    XCTAssertTrue(status(app, "switch_3", "Đã xác nhận"), "not confirmed")
    XCTAssertEqual(filter.value as? String, "1")
    XCTAssertTrue(filter.isEnabled)
  }

  func testAHeaterACO2AndAnOutletWithNoRoleAskFirst() {
    let app = launch()
    addPlug(app, "Ổ cắm bể 60", roles: ["role-switch_2": "CO2", "role-switch_3": "Sưởi"])
    let co2 = outlet(app, "switch_2")
    XCTAssertTrue(co2.waitForExistence(timeout: 5))
    co2.tap()
    XCTAssertTrue(app.staticTexts["Bật “CO2”?"].waitForExistence(timeout: 5), "a CO2 outlet switched without asking")
    XCTAssertTrue(app.staticTexts["Ổ này cấp điện cho CO2. Bật nhầm, nhất là ban đêm, có thể làm cá ngạt."].exists)
    dismissDialog(app, "Bật “CO2”?")
    XCTAssertEqual(co2.value as? String, "0")
    XCTAssertFalse(element(app, "outlet-status-switch_2").exists, "something was sent")
    outlet(app, "switch_3").tap()
    XCTAssertTrue(app.staticTexts["Bật “Sưởi”?"].waitForExistence(timeout: 5), "a heater switched without asking")
    dismissDialog(app, "Bật “Sưởi”?")
    XCTAssertEqual(outlet(app, "switch_3").value as? String, "0")
    // Named in Smart Life but not what it powers: asked too, and switched once confirmed.
    let lamp = outlet(app, "switch_1")
    lamp.tap()
    XCTAssertTrue(app.staticTexts["Tắt “Đèn”?"].waitForExistence(timeout: 5), "an outlet with no role switched without asking")
    let confirm = app.buttons["confirm-switch"].firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 5))
    confirm.tap()
    XCTAssertTrue(status(app, "switch_1", "Đã xác nhận"))
    XCTAssertEqual(lamp.value as? String, "0")
  }

  func testAPlugThatDoesNotConfirmIsShownAsItReports() {
    let app = launch()
    addPlug(app, "Ổ cắm kệ", roles: ["role-switch_1": "Lọc"])
    let filter = outlet(app, "switch_1")
    XCTAssertTrue(filter.waitForExistence(timeout: 5))
    filter.tap()
    XCTAssertTrue(status(app, "switch_1", "Chưa xác nhận: ổ cắm chưa báo đã đổi."), "not said unconfirmed")
    XCTAssertEqual(filter.value as? String, "1", "shown as asked, not as the plug reports")
  }

  func testAnOfflinePlugIsRefusedAndShownOffline() {
    let app = launch()
    addPlug(app, "Ổ cắm ban công", roles: ["role-switch_1": "Sủi khí"])
    let air = outlet(app, "switch_1")
    XCTAssertTrue(air.waitForExistence(timeout: 5))
    air.tap()
    XCTAssertTrue(status(app, "switch_1", "Mất kết nối"), "not shown offline")
    XCTAssertEqual(element(app, "plug-status").label, "Mất kết nối")
    XCTAssertEqual(air.value as? String, "1")
    XCTAssertFalse(air.isEnabled, "a switch offered to an offline plug")
    // Read again: still offline.
    app.swipeDown()
    XCTAssertTrue(element(app, "plug-status").waitForExistence(timeout: 5))
    XCTAssertEqual(element(app, "plug-status").label, "Mất kết nối")
    XCTAssertFalse(air.isEnabled)
  }

  func testRemovesThePlugFromTheTank() {
    let app = launch()
    addPlug(app, "Ổ cắm bể 60")
    tap(app, "edit-plug")
    tap(app, "remove-plug")
    let confirm = app.buttons["confirm-remove-plug"].firstMatch
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    confirm.tap()
    XCTAssertTrue(element(app, "add-plug").waitForExistence(timeout: 5))
    XCTAssertFalse(element(app, "plug-name").exists, "still on the tank")
    tap(app, "add-plug")
    XCTAssertTrue(choice(app, "Ổ cắm bể 60").waitForExistence(timeout: 5), "not offered again")
  }

  // MARK: Helpers

  /// A new phone with one tank, on the tank's screen; the stand-in's keys entered, or not.
  private func launch(reset: Bool = true, keys: Bool = true) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"]
      + (reset ? ["-reset-defaults"] : []) + (keys ? ["-seed-tuya-keys"] : [])
    app.launch()
    app.tabBars.buttons["Bể của tôi"].tap()
    if reset {
      XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "not a new phone")
      app.buttons["add-first"].tap()
      let field = app.textFields["name"]
      XCTAssertTrue(field.waitForExistence(timeout: 5), "no tank form")
      field.tap()
      field.typeText("Bể 60")
      app.buttons["save"].tap()
    }
    let tank = app.buttons["tank"].firstMatch
    XCTAssertTrue(tank.waitForExistence(timeout: 5), "no tank")
    tank.tap()
    return app
  }

  /// Puts one of the project's plugs on the tank, maybe with roles, and saves it.
  private func addPlug(_ app: XCUIApplication, _ name: String, roles: [String: String] = [:], save: Bool = true) {
    tap(app, "add-plug")
    let c = choice(app, name)
    XCTAssertTrue(c.waitForExistence(timeout: 5), "\(name) not offered")
    c.tap()
    XCTAssertTrue(app.buttons["save-plug"].waitForExistence(timeout: 5), "no outlet form")
    for (picker, role) in roles { pick(app, picker, role) }
    if save {
      app.buttons["save-plug"].tap()
      XCTAssertTrue(element(app, "plug-name").waitForExistence(timeout: 5), "the plug isn't on the tank")
    }
  }

  private func pick(_ app: XCUIApplication, _ picker: String, _ role: String) {
    let p = app.buttons[picker]
    XCTAssertTrue(p.waitForExistence(timeout: 5), "no \(picker)")
    p.tap()
    let option = app.buttons[role].firstMatch
    XCTAssertTrue(option.waitForExistence(timeout: 5), "no \(role) to pick")
    option.tap()
  }

  private func type(_ app: XCUIApplication, _ id: String, _ text: String) {
    let f = reveal(app, app.textFields[id])
    f.tap()
    f.typeText(text)
  }

  /// Replaces what the secret field holds.
  private func secure(_ app: XCUIApplication, _ text: String) {
    let f = reveal(app, app.secureTextFields["access-secret"])
    f.tap()
    f.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 40) + text)
  }

  private func result(_ app: XCUIApplication, _ text: String) -> Bool {
    let e = app.staticTexts["check-result"]
    let done = expectation(for: NSPredicate { _, _ in e.exists && e.label == text }, evaluatedWith: nil)
    return XCTWaiter().wait(for: [done], timeout: 10) == .completed
  }

  private func waitGone(_ e: XCUIElement) -> Bool {
    let done = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: e)
    return XCTWaiter().wait(for: [done], timeout: 10) == .completed
  }

  private func choice(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.buttons.matching(identifier: "plug-choice").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
  }
  private func outlet(_ app: XCUIApplication, _ code: String) -> XCUIElement { app.switches["outlet-\(code)"] }
  private func title(_ app: XCUIApplication, _ code: String) -> XCUIElement { app.staticTexts["outlet-title-\(code)"] }
  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

  /// Waits for an outlet's note to read `text`.
  private func status(_ app: XCUIApplication, _ code: String, _ text: String) -> Bool {
    let e = app.staticTexts["outlet-status-\(code)"]
    let done = expectation(for: NSPredicate { _, _ in e.exists && e.label == text }, evaluatedWith: nil)
    return XCTWaiter().wait(for: [done], timeout: 15) == .completed
  }

  /// Scrolls the list (or the sheet's form) until the element is on screen, then taps it.
  private func tap(_ app: XCUIApplication, _ id: String) { reveal(app, element(app, id)).tap() }

  /// Scrolls until the element is there and on screen: a list's rows below the fold aren't made until then.
  @discardableResult
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) -> XCUIElement {
    _ = e.waitForExistence(timeout: 3)
    for _ in 0..<8 where !(e.exists && e.isHittable) {
      app.swipeUp()
      _ = e.waitForExistence(timeout: 1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "no \(e)")
    return e
  }

  /// Closes a confirmation dialog without choosing, as a tap beside it does.
  private func dismissDialog(_ app: XCUIApplication, _ title: String) {
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.08)).tap()
    let done = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: app.staticTexts[title])
    XCTAssertEqual(XCTWaiter().wait(for: [done], timeout: 5), .completed, "the dialog didn't close")
  }
}
