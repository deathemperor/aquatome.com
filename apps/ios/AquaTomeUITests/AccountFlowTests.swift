import XCTest

/// Signing in to aquatome.com in the Tài khoản sheet (the profile button, top right of each tab) and syncing "Bể của tôi", against the app's stand-in server
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
    XCTAssertFalse(badged(app), "a dot on the profile button with nothing wrong")
    // Added while signed in: it goes to the account a moment later, by itself.
    let before = syncs(app)
    add(app, "Bể tép")
    accountTab(app)
    XCTAssertTrue(waitForSyncs(app, before + 1), "the change wasn't synced")
    app.terminate()

    app = launch()
    tanksTab(app)
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "not a new phone")
    signIn(app)
    XCTAssertTrue(message(app).contains("Đã thêm 2 bể từ tài khoản."), message(app))
    tanksTab(app)
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "the account's tanks didn't come")
    XCTAssertEqual(Set(app.buttons.matching(identifier: "tank").allElementsBoundByIndex.map { $0.label.components(separatedBy: ",")[0] }), ["Bể phòng khách", "Bể tép"])
  }

  func testSigningOutKeepsTheTanksAndDeletingTheAccountEmptiesIt() {
    var app = launch(resetServer: true)
    add(app, "Bể tép", first: true)
    signIn(app)
    tap(app, "sign-out")
    XCTAssertTrue(element(app, "apple-sign-in").waitForExistence(timeout: 5), "still signed in")
    XCTAssertTrue(element(app, "account-header").exists, "no account section on the Tài khoản sheet")
    XCTAssertEqual(message(app), "Đã đăng xuất. Các bể vẫn còn trên máy này.")
    XCTAssertEqual(tankCount(app), 1)

    signIn(app)
    tap(app, "delete-account")
    let confirm = app.buttons["Xóa tài khoản vĩnh viễn"]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    confirm.tap()
    XCTAssertTrue(element(app, "apple-sign-in").waitForExistence(timeout: 5), "still signed in")
    XCTAssertEqual(message(app), "Đã xóa tài khoản. Các bể vẫn còn trên máy này.")
    XCTAssertEqual(tankCount(app), 1)
    app.terminate()

    // A new phone signing in with the same Apple ID gets a new, empty account.
    app = launch()
    signIn(app)
    XCTAssertTrue(element(app, "sign-out").exists, "signed in with no tanks, the account's buttons are there")
    // Signed in with no tanks: the tanks tab's empty state, with a first tank to add.
    tanksTab(app)
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "no empty state signed in")
    XCTAssertEqual(app.buttons.matching(identifier: "tank").count, 0)
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
    tanksTab(app)
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
    XCTAssertFalse(element(app, "passkey-had").exists, "said to have a passkey before adding one")
    XCTAssertTrue(element(app, "passkey-add").waitForExistence(timeout: 5), "no passkey offered")
    XCTAssertEqual(element(app, "passkey-add").label, "Thêm passkey")
    tap(app, "passkey-add")
    XCTAssertTrue(says(app, "Đã thêm passkey. Lần sau bấm “Đăng nhập bằng passkey” rồi mở khóa bằng Face ID, vân tay hoặc mã PIN của máy."), message(app))
    XCTAssertTrue(app.staticTexts["account-status"].label.contains("passkey"), app.staticTexts["account-status"].label)
    // The account has one now, which another phone or computer may not have: said so, and one for this phone offered.
    hasPasskey(app)
    tap(app, "sign-out")
    tap(app, "passkey-sign-in")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 5), "the passkey didn't sign in")
    app.terminate()

    // The same phone later (a session from before the relaunch counts as signed in long ago): signing in again comes
    // first, then the add carries on, and finds the phone has this account's passkey already.
    app = launch(newPhone: false)
    hasPasskey(app)
    tap(app, "passkey-add")
    XCTAssertTrue(element(app, "sign-in-again").waitForExistence(timeout: 5), "not asked to sign in again")
    tap(app, "apple-sign-in")
    XCTAssertTrue(says(app, "Máy này đã có passkey của tài khoản này."), message(app))
    XCTAssertFalse(element(app, "sign-in-again").exists, "still asked to sign in again")
  }

  func testWhatTheAddSaysAfterSigningInAgainByEmailStays() {
    // The stand-in's one passkey belongs to the Apple account; this phone signs in by email, to another, which has none
    // (so it's offered one).
    var app = launch(resetServer: true, "-seed-passkey")
    emailSignIn(app, "reader@example.com")
    app.terminate()

    // Later (a session from before the relaunch counts as signed in long ago): signing in again comes first, by email,
    // then the add is refused, and says so (the sync after signing in doesn't clear it).
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
    // The Tài khoản sheet says so, rather than showing nothing.
    let off = element(app, "account-off")
    XCTAssertTrue(off.waitForExistence(timeout: 5), "the Tài khoản sheet is blank with accounts off")
    XCTAssertEqual(off.label, "Lúc này chưa đăng nhập được tài khoản aquatome.com. Các bể vẫn lưu trên máy này.")
    XCTAssertFalse(element(app, "apple-sign-in").exists, "sign-in offered with accounts off")
    XCTAssertFalse(element(app, "account-header").exists)
    tanksTab(app)
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5))
    XCTAssertFalse(element(app, "sign-in-hint").exists, "a hint to sign in with accounts off")
    add(app, "Bể", first: true)
    XCTAssertTrue(answered(app), "the server never said whether it has accounts")
    XCTAssertFalse(element(app, "apple-sign-in").exists, "sign-in offered with accounts off")
    XCTAssertFalse(element(app, "account-header").exists)
  }

  func testAStoreFromANewerAppIsNotOfferedForSync() {
    let app = launch(resetServer: true, "-seed-tanks", "newer")
    // The Tài khoản sheet says why there's no sign-in.
    XCTAssertTrue(element(app, "account-cant-sync").waitForExistence(timeout: 5), "the Tài khoản sheet doesn't say why")
    XCTAssertFalse(element(app, "apple-sign-in").exists, "sign-in offered for a store this app can't keep")
    tanksTab(app)
    XCTAssertTrue(app.staticTexts["Các bể trên máy này được lưu bằng bản ứng dụng mới hơn. Cập nhật AquaTome để xem và sửa."].waitForExistence(timeout: 5))
    XCTAssertTrue(answered(app), "the server never said whether it has accounts")
    XCTAssertFalse(element(app, "apple-sign-in").exists, "sign-in offered for a store this app can't keep")
  }

  /// Signed in, with a store this app can't keep: "Đồng bộ ngay" can't run, and the tab says why.
  func testSignedInAStoreFromANewerAppSaysWhyItIsntSynced() {
    var app = launch(resetServer: true)
    signIn(app)
    app.terminate()

    app = launch(newPhone: false, "-seed-tanks", "newer")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 5), "not signed in")
    XCTAssertFalse(element(app, "sync-now").isEnabled, "a sync offered for a store this app can't keep")
    XCTAssertTrue(element(app, "account-cant-sync").exists, "no word on why the tanks aren't synced")
  }

  /// With no network at launch, the account signed in on this phone shows as it was kept, not as accounts off; a change
  /// that can't reach it puts a dot on the profile button; a phone never signed in is told the server can't be reached.
  func testOfflineTheAccountShowsAsKeptAndAProblemMarksTheProfileButton() {
    var app = launch(resetServer: true)
    signIn(app)
    app.terminate()

    app = launch(newPhone: false, "-server-offline")
    let status = app.staticTexts["account-status"]
    XCTAssertTrue(status.waitForExistence(timeout: 5), "signed in on this phone, not shown offline")
    XCTAssertTrue(status.label.contains("Apple"), status.label)
    XCTAssertTrue(element(app, "sign-out").exists && element(app, "delete-account").exists, "the account's buttons gone offline")
    XCTAssertFalse(element(app, "account-off").exists, "offline read as accounts off")
    XCTAssertFalse(badged(app), "a dot before anything went wrong")
    // Seen from the tanks tab, where the change is made.
    add(app, "Bể tép", first: true)
    XCTAssertTrue(waitForBadge(app), "no dot on the profile button for a sync that failed")
    accountTab(app)
    XCTAssertTrue(says(app, "Chưa đồng bộ được: không có mạng. Các thay đổi vẫn lưu trên máy này."), message(app))
    app.terminate()

    app = launch("-server-offline")
    let unreached = element(app, "account-unreached")
    XCTAssertTrue(unreached.waitForExistence(timeout: 10), "a new phone offline isn't told the server can't be reached")
    XCTAssertEqual(unreached.label, "Chưa kết nối được aquatome.com. Các bể vẫn lưu trên máy này.")
    XCTAssertFalse(element(app, "account-off").exists, "offline read as accounts off")
  }

  /// The account is in the profile button's sheet, from every tab: an empty "Bể của tôi" offers a hint that opens it,
  /// and a tank list signed in shows none of the account but where the tanks are kept.
  func testTheAccountIsInTheProfileSheetFromEveryTab() {
    let app = launch(resetServer: true)
    XCTAssertTrue(element(app, "apple-sign-in").waitForExistence(timeout: 5), "no sign-in in the Tài khoản sheet")
    XCTAssertTrue(element(app, "account-header").exists, "no account section in the Tài khoản sheet")
    // Each tab's first screen has the button, and it opens the same sheet.
    for tab in ["Tìm", "Bể của tôi", "Đèn"] {
      app.openTab(tab)
      app.openAccount()
      XCTAssertTrue(element(app, "account-header").waitForExistence(timeout: 5), "no account from \(tab)")
    }
    // The app's settings and the site's pages about itself, in the same sheet; its icon picker one tap away.
    for id in ["app-icon-row", "telemetry-switch", "about", "about-contact", "about-privacy"] {
      let e = element(app, id)
      repeatUntil(e.exists && e.isHittable, times: 6) { app.swipeUp() }
      XCTAssertTrue(e.exists, "no \(id) in the Tài khoản sheet")
    }
    XCTAssertFalse(element(app, "owner-dashboard").exists, "a dashboard row signed out")
    element(app, "app-icon-row").tap()
    XCTAssertTrue(app.navigationBars["Biểu tượng ứng dụng"].waitForExistence(timeout: 5), "the row didn't open the icon picker")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.buttons["account-done"].tap()
    XCTAssertTrue(app.buttons["account-done"].waitForNonExistence(timeout: 5), "Xong didn't close the sheet")

    tanksTab(app)
    let hint = app.buttons["sign-in-hint"]
    XCTAssertTrue(hint.waitForExistence(timeout: 5), "no hint to sign in on a new phone")
    XCTAssertEqual(hint.label, "Đã lưu bể trên aquatome.com hoặc máy khác? Đăng nhập để lấy về.")
    XCTAssertFalse(element(app, "apple-sign-in").exists, "the sign-in in the tanks tab")
    XCTAssertFalse(element(app, "account-header").exists, "the account in the tanks tab")
    hint.tap()
    XCTAssertTrue(app.buttons["account-done"].waitForExistence(timeout: 5), "the hint didn't open the Tài khoản sheet")
    XCTAssertTrue(element(app, "apple-sign-in").waitForExistence(timeout: 5), "no sign-in after the hint")

    add(app, "Bể tép", first: true)
    signIn(app)
    tanksTab(app)
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "no tank listed")
    for id in ["account-header", "account-status", "sync-now", "passkey-add", "sign-out", "delete-account", "sign-in-hint"] {
      XCTAssertFalse(element(app, id).exists, "\(id) in the tanks tab")
    }
    XCTAssertTrue(app.staticTexts["Các bể lưu trên máy này và trong tài khoản của bạn trên máy chủ AquaTome (Cloudflare), để các thiết bị đã đăng nhập cùng thấy."].exists,
                  "the list doesn't say the tanks are kept in the account too")
  }

  // MARK: Helpers

  /// In the Tài khoản sheet. `newPhone`: as a new install (signed out, nothing saved); otherwise the phone as the last
  /// launch left it.
  private func launch(resetServer: Bool = false, newPhone: Bool = true, accounts: String = "on", _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-fake-accounts", accounts]
      + (newPhone ? ["-reset-defaults"] : []) + (resetServer ? ["-reset-fake-server"] : []) + args
    app.launchForFlow()
    accountTab(app)
    return app
  }

  private func accountTab(_ app: XCUIApplication) { app.openAccount() }
  private func tanksTab(_ app: XCUIApplication) { app.openTab("Bể của tôi") }

  /// The tanks listed, on the tanks tab (at least one).
  private func tankCount(_ app: XCUIApplication) -> Int {
    tanksTab(app)
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "no tank listed")
    return app.buttons.matching(identifier: "tank").count
  }

  /// Signed in to an account with a passkey: a line saying it has one, and one for this phone still offered (the
  /// account's may have been made on another phone or computer).
  private func hasPasskey(_ app: XCUIApplication) {
    let had = element(app, "passkey-had")
    XCTAssertTrue(had.waitForExistence(timeout: 5), "not told the account has a passkey")
    XCTAssertEqual(had.label, "Tài khoản đã có passkey: đăng nhập bằng Face ID, vân tay hoặc mã PIN của máy.")
    let add = element(app, "passkey-add")
    XCTAssertTrue(add.exists, "no passkey offered for this phone")
    XCTAssertEqual(add.label, "Thêm passkey cho máy này")
  }

  /// Whether the profile button marks a problem with the account, as it says to VoiceOver (its dot).
  private func badged(_ app: XCUIApplication) -> Bool {
    app.buttons.matching(identifier: "profile").allElementsBoundByIndex.contains { $0.value as? String == "Có vấn đề cần xem" }
  }

  /// Looked for every half second, for up to 10 s.
  private func waitForBadge(_ app: XCUIApplication) -> Bool {
    let until = Date().addingTimeInterval(10)
    while Date() < until {
      if badged(app) { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
    }
    return badged(app)
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

  /// Signs in from the Tài khoản sheet, and waits for the sync that follows.
  private func signIn(_ app: XCUIApplication) {
    accountTab(app)
    tap(app, "apple-sign-in")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 5), "not signed in")
    XCTAssertTrue(waitForSyncs(app, 1), "no sync after signing in")
  }

  /// Signs in from the Tài khoản sheet with a code sent to `address` (the stand-in's code), and waits for the sync that
  /// follows. `wrongFirst`: a wrong code first, which is refused and leaves the code field there.
  private func emailSignIn(_ app: XCUIApplication, _ address: String, wrongFirst: Bool = false) {
    accountTab(app)
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

  /// Adds a tank on the tanks tab.
  private func add(_ app: XCUIApplication, _ name: String, first: Bool = false) {
    tanksTab(app)
    tap(app, first ? "add-first" : "add")
    let field = app.textFields["name"]
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no tank form")
    field.tap()
    field.typeText(name)
    app.buttons["save"].tap()
    XCTAssertTrue(app.buttons.matching(identifier: "tank").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch.waitForExistence(timeout: 5), "\(name) not listed")
  }
}
