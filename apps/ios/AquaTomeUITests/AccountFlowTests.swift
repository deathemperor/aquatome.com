import XCTest

/// Signing in to aquatome.com from "Bể của tôi" and syncing the tanks, against the app's stand-in server
/// (`FakeServer`: `FakeAccounts` kept across launches) and a stand-in for Apple's sheet: the simulator can't run Sign
/// in with Apple, and UI tests never reach the real server. A launch with `-reset-defaults` is a new phone; the
/// stand-in server keeps its accounts until `-reset-fake-server`.
final class AccountFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testANewPhoneSignsInAndGetsTheTanksMadeBeforeAndAfterSigningIn() {
    var app = launch(resetServer: true)
    add(app, "Bể phòng khách", first: true)
    signIn(app)
    XCTAssertTrue(app.staticTexts["account-status"].label.contains("Apple"), app.staticTexts["account-status"].label)
    // Added while signed in: it goes to the account a moment later, by itself.
    let before = syncs(app)
    add(app, "Bể tép")
    XCTAssertTrue(waitForSyncs(app, before + 1), "the change wasn't synced")
    app.terminate()

    app = launch()
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "not a new phone")
    signIn(app)
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "the account's tanks didn't come")
    XCTAssertEqual(Set(app.buttons.matching(identifier: "tank").allElementsBoundByIndex.map { $0.label.components(separatedBy: ",")[0] }), ["Bể phòng khách", "Bể tép"])
    XCTAssertTrue(message(app).contains("Đã thêm 2 bể từ tài khoản."), message(app))
  }

  func testSigningOutKeepsTheTanksAndDeletingTheAccountEmptiesIt() {
    var app = launch(resetServer: true)
    add(app, "Bể tép", first: true)
    signIn(app)
    tap(app, "sign-out")
    XCTAssertTrue(element(app, "apple-sign-in").waitForExistence(timeout: 5), "still signed in")
    XCTAssertTrue(element(app, "account-header").exists, "no account section in the list")
    XCTAssertEqual(message(app), "Đã đăng xuất. Các bể vẫn còn trên máy này.")
    XCTAssertEqual(app.buttons.matching(identifier: "tank").count, 1)

    signIn(app)
    tap(app, "delete-account")
    let confirm = app.buttons["Xóa tài khoản vĩnh viễn"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    confirm.tap()
    XCTAssertTrue(element(app, "apple-sign-in").waitForExistence(timeout: 5), "still signed in")
    XCTAssertEqual(message(app), "Đã xóa tài khoản. Các bể vẫn còn trên máy này.")
    XCTAssertEqual(app.buttons.matching(identifier: "tank").count, 1)
    app.terminate()

    // A new phone signing in with the same Apple ID gets a new, empty account.
    app = launch()
    signIn(app)
    XCTAssertEqual(app.buttons.matching(identifier: "tank").count, 0)
    XCTAssertTrue(element(app, "sign-out").exists, "signed in with no tanks, the account's buttons are there")
  }

  func testWithAccountsOffThereIsNoSignIn() {
    let app = launch(resetServer: true, accounts: "off")
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5))
    add(app, "Bể", first: true)
    XCTAssertFalse(element(app, "apple-sign-in").waitForExistence(timeout: 2), "sign-in offered with accounts off")
    XCTAssertFalse(element(app, "account-header").exists)
  }

  func testAStoreFromANewerAppIsNotOfferedForSync() {
    let app = launch(resetServer: true, "-seed-tanks", "newer")
    XCTAssertTrue(app.staticTexts["Các bể trên máy này được lưu bằng bản ứng dụng mới hơn. Cập nhật AquaTome để xem và sửa."].waitForExistence(timeout: 5))
    XCTAssertFalse(element(app, "apple-sign-in").waitForExistence(timeout: 2), "sign-in offered for a store this app can't keep")
  }

  // MARK: Helpers

  private func launch(resetServer: Bool = false, accounts: String = "on", _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-fake-accounts", accounts]
      + (resetServer ? ["-reset-fake-server"] : []) + args
    app.launch()
    app.tabBars.buttons["Bể của tôi"].tap()
    return app
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

  /// Scrolls the list until the element is on screen, then taps it.
  private func tap(_ app: XCUIApplication, _ id: String) {
    let e = element(app, id)
    XCTAssertTrue(e.waitForExistence(timeout: 5), "no \(id)")
    for _ in 0..<5 where !e.isHittable { app.swipeUp() }
    e.tap()
  }

  /// Signs in, and waits for the sync that follows.
  private func signIn(_ app: XCUIApplication) {
    tap(app, "apple-sign-in")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 5), "not signed in")
    XCTAssertTrue(waitForSyncs(app, 1), "no sync after signing in")
  }

  /// Syncs done since launch (the status line's value in a debug build).
  private func syncs(_ app: XCUIApplication) -> Int { Int(app.staticTexts["account-status"].value as? String ?? "") ?? 0 }

  private func waitForSyncs(_ app: XCUIApplication, _ n: Int) -> Bool {
    let done = expectation(for: NSPredicate { _, _ in self.syncs(app) >= n }, evaluatedWith: nil)
    return XCTWaiter().wait(for: [done], timeout: 10) == .completed
  }

  private func message(_ app: XCUIApplication) -> String {
    let m = app.staticTexts["account-message"]
    return m.waitForExistence(timeout: 5) ? m.label : ""
  }

  private func add(_ app: XCUIApplication, _ name: String, first: Bool = false) {
    tap(app, first ? "add-first" : "add")
    let field = app.textFields["name"]
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no tank form")
    field.tap()
    field.typeText(name)
    app.buttons["save"].tap()
    XCTAssertTrue(app.buttons.matching(identifier: "tank").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch.waitForExistence(timeout: 5), "\(name) not listed")
  }
}
