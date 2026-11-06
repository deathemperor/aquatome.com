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

  func testEmailSignInOpensTheSameAccountOnANewPhone() {
    var app = launch(resetServer: true)
    add(app, "Bể tép", first: true)
    emailSignIn(app, "reader@example.com", wrongFirst: true)
    XCTAssertTrue(app.staticTexts["account-status"].label.contains("email"), app.staticTexts["account-status"].label)
    app.terminate()

    // A new phone, the same address however it is typed: the same account, with its tank.
    app = launch()
    emailSignIn(app, " Reader@Example.com")
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "the account's tanks didn't come")
    XCTAssertEqual(app.buttons.matching(identifier: "tank").allElementsBoundByIndex.map { $0.label.components(separatedBy: ",")[0] }, ["Bể tép"])
  }

  func testAPasskeyAddedOnTheWebsiteOpensItsAccount() {
    // A passkey no account has: refused, with what to do instead.
    var app = launch(resetServer: true)
    tap(app, "passkey-sign-in")
    XCTAssertEqual(message(app), "Passkey này không mở được tài khoản nào: đăng nhập cách khác.")
    XCTAssertFalse(app.staticTexts["account-status"].exists, "signed in with a passkey no account has")
    app.terminate()

    // Added with "Thêm passkey" on aquatome.com to an account that signs in with Apple: it opens that account.
    app = launch(resetServer: true, "-seed-passkey")
    tap(app, "passkey-sign-in")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 5), "not signed in")
    XCTAssertTrue(app.staticTexts["account-status"].label.contains("passkey"), app.staticTexts["account-status"].label)
    XCTAssertTrue(waitForSyncs(app, 1), "no sync after signing in")
  }

  func testAPasskeyAddedInTheAppOpensItsAccountAndLaterSigningInAgainComesFirst() {
    // Signed in a moment ago: the passkey is made and added straight away, and it signs in on its own.
    var app = launch(resetServer: true)
    signIn(app)
    tap(app, "passkey-add")
    XCTAssertTrue(says(app, "Đã thêm passkey. Lần sau bấm “Đăng nhập bằng passkey” rồi mở khóa bằng Face ID, vân tay hoặc mã PIN của máy."), message(app))
    XCTAssertTrue(app.staticTexts["account-status"].label.contains("passkey"), app.staticTexts["account-status"].label)
    tap(app, "sign-out")
    tap(app, "passkey-sign-in")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 5), "the passkey didn't sign in")
    app.terminate()

    // The same phone later (a session from before the relaunch counts as signed in long ago): signing in again comes
    // first, then the add carries on, and finds the phone has this account's passkey already.
    app = launch(newPhone: false)
    tap(app, "passkey-add")
    XCTAssertTrue(element(app, "sign-in-again").waitForExistence(timeout: 5), "not asked to sign in again")
    tap(app, "apple-sign-in")
    XCTAssertTrue(says(app, "Máy này đã có passkey của tài khoản này."), message(app))
    XCTAssertFalse(element(app, "sign-in-again").exists, "still asked to sign in again")
  }

  func testWhatTheAddSaysAfterSigningInAgainByEmailStays() {
    // The stand-in's one passkey belongs to the Apple account; this phone signs in by email, to another.
    var app = launch(resetServer: true, "-seed-passkey")
    emailSignIn(app, "reader@example.com")
    app.terminate()

    // Later: signing in again by email, then the add is refused, and says so (the sync after signing in doesn't clear it).
    app = launch(newPhone: false)
    tap(app, "passkey-add")
    XCTAssertTrue(element(app, "sign-in-again").waitForExistence(timeout: 5), "not asked to sign in again")
    emailSignIn(app, "reader@example.com")
    XCTAssertTrue(says(app, "Cách đăng nhập này đã thuộc một tài khoản khác."), message(app))
    XCTAssertFalse(element(app, "sign-in-again").exists, "still asked to sign in again")
  }

  func testGoogleSignsIn() {
    // Google's page and token endpoint are the stand-in's (`FakeGoogle`): the URL, the state, the PKCE verifier and the
    // ID token are the app's own.
    let app = launch(resetServer: true)
    tap(app, "google-sign-in")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 5), "not signed in")
    XCTAssertTrue(app.staticTexts["account-status"].label.contains("Google"), app.staticTexts["account-status"].label)
    XCTAssertTrue(waitForSyncs(app, 1), "no sync after signing in")
  }

  func testClosingGooglesPageLeavesTheReaderSignedOutWithNothingSaid() {
    let app = launch(resetServer: true, "-fake-google", "cancel")
    tap(app, "google-sign-in")
    XCTAssertFalse(app.staticTexts["account-status"].waitForExistence(timeout: 2), "signed in")
    XCTAssertFalse(app.staticTexts["account-message"].exists, app.staticTexts["account-message"].label)
    XCTAssertTrue(element(app, "google-sign-in").isEnabled, "the button stays off")
  }

  func testWithAccountsOffThereIsNoSignIn() {
    let app = launch(resetServer: true, accounts: "off")
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5))
    add(app, "Bể", first: true)
    XCTAssertTrue(answered(app), "the server never said whether it has accounts")
    XCTAssertFalse(element(app, "apple-sign-in").exists, "sign-in offered with accounts off")
    XCTAssertFalse(element(app, "account-header").exists)
  }

  func testAStoreFromANewerAppIsNotOfferedForSync() {
    let app = launch(resetServer: true, "-seed-tanks", "newer")
    XCTAssertTrue(app.staticTexts["Các bể trên máy này được lưu bằng bản ứng dụng mới hơn. Cập nhật AquaTome để xem và sửa."].waitForExistence(timeout: 5))
    XCTAssertTrue(answered(app), "the server never said whether it has accounts")
    XCTAssertFalse(element(app, "apple-sign-in").exists, "sign-in offered for a store this app can't keep")
  }

  // MARK: Helpers

  /// `newPhone`: as a new install (signed out, nothing saved); otherwise the phone as the last launch left it.
  private func launch(resetServer: Bool = false, newPhone: Bool = true, accounts: String = "on", _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-fake-accounts", accounts]
      + (newPhone ? ["-reset-defaults"] : []) + (resetServer ? ["-reset-fake-server"] : []) + args
    app.launchForFlow()
    app.openTab("Bể của tôi")
    return app
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

  /// The stand-in server has said whether it offers accounts (TanksView): what the tab shows for signing in is settled.
  private func answered(_ app: XCUIApplication) -> Bool { element(app, "account-answered").waitForExistence(timeout: 10) }

  /// Scrolls the list until the element is on screen, then taps it.
  private func tap(_ app: XCUIApplication, _ id: String) {
    let e = element(app, id)
    XCTAssertTrue(e.waitForExistence(timeout: 5), "no \(id)")
    repeatUntil(e.isHittable, times: 5) { app.swipeUp() }
    e.tap()
  }

  /// Signs in, and waits for the sync that follows.
  private func signIn(_ app: XCUIApplication) {
    tap(app, "apple-sign-in")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 5), "not signed in")
    XCTAssertTrue(waitForSyncs(app, 1), "no sync after signing in")
  }

  /// Signs in with a code sent to `address` (the stand-in's code), and waits for the sync that follows. `wrongFirst`: a
  /// wrong code first, which is refused and leaves the code field there.
  private func emailSignIn(_ app: XCUIApplication, _ address: String, wrongFirst: Bool = false) {
    tap(app, "email-sign-in")
    let field = app.textFields["email-address"]
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no email sheet")
    field.tap()
    field.typeText(address)
    let send = app.buttons["send-code"]
    XCTAssertTrue(send.waitForExistence(timeout: 5))
    XCTAssertTrue(waitFor(send, "isEnabled == true"), "no token from the check")
    send.tap()
    let code = app.textFields["email-code"]
    XCTAssertTrue(code.waitForExistence(timeout: 5), "the code wasn't sent")
    if wrongFirst {
      code.typeText("000000")
      app.buttons["verify-code"].tap()
      let said = app.staticTexts["email-message"]
      XCTAssertTrue(said.waitForExistence(timeout: 5) && said.label.hasPrefix("Mã không đúng"), said.label)
      code.tap()
      code.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 6))
    }
    code.typeText("123456")
    app.buttons["verify-code"].tap()
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 5), "not signed in")
    XCTAssertTrue(waitForSyncs(app, 1), "no sync after signing in")
  }

  private func waitFor(_ e: XCUIElement, _ predicate: String) -> Bool {
    XCTWaiter().wait(for: [expectation(for: NSPredicate(format: predicate), evaluatedWith: e)], timeout: 5) == .completed
  }

  /// Syncs done since launch (the status line's value in a debug build).
  private func syncs(_ app: XCUIApplication) -> Int { Int(app.staticTexts["account-status"].value as? String ?? "") ?? 0 }

  private func waitForSyncs(_ app: XCUIApplication, _ n: Int) -> Bool {
    let done = expectation(for: NSPredicate { _, _ in self.syncs(app) >= n }, evaluatedWith: nil)
    return XCTWaiter().wait(for: [done], timeout: 10) == .completed
  }

  /// Waits for the account's message to read `text`.
  /// The account's message reads `text`: waited for up to 15 s, as a busy CI runner can take past 5 to say it.
  private func says(_ app: XCUIApplication, _ text: String) -> Bool {
    let said = expectation(for: NSPredicate(format: "label == %@", text), evaluatedWith: app.staticTexts["account-message"].firstMatch)
    return XCTWaiter().wait(for: [said], timeout: 15) == .completed
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
