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
    let before = syncs(app)
    tanksTab(app)
    XCTAssertFalse(badged(app), "a dot on the profile button with nothing wrong")
    // Added while signed in: it goes to the account a moment later, by itself.
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
    XCTAssertTrue(reached(app, "sign-out").exists, "signed in with no tanks, the account's buttons are there")
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
    XCTAssertEqual(oneLine(off.label), "Lúc này chưa đăng nhập được tài khoản aquatome.com. Các bể vẫn lưu trên máy này.")
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

  /// "Giao diện": the app light or dark whatever the phone is, at once (the sheet, and the tabs under it), the same after
  /// a relaunch, and as the phone is again on "Theo máy".
  func testTheAppearanceChosenInTheSheetTurnsTheWholeAppAtOnceAndIsKept() {
    var app = launch()
    let phone = app.staticTexts["appearance-sheet"]
    XCTAssertTrue(phone.waitForExistence(timeout: 5), "no sheet")
    let was = phone.label == "drawn dark" ? "dark" : "light"
    let (other, target) = was == "dark" ? ("Sáng", "light") : ("Tối", "dark")
    // Apple's button is white in the dark, black in the light (its colour is set when it's made).
    let apple = element(app, "apple-sign-in")
    XCTAssertTrue(apple.waitForExistence(timeout: 5), "no Apple button")
    XCTAssertEqual(lightness(apple) > 0.5, was == "dark", "the Apple button isn't the phone's appearance's")
    choose(app, other)
    XCTAssertTrue(drawn(app, "appearance-sheet", target), "the sheet isn't \(target)")
    XCTAssertTrue(drawn(app, "appearance-app", target), "the tabs under the sheet aren't \(target)")
    repeatUntil(apple.exists && apple.isHittable, times: 8) { app.swipeDown() }
    XCTAssertEqual(lightness(apple) > 0.5, target == "dark", "the Apple button kept the other appearance's colour")
    app.terminate()
    app = launch(newPhone: false, open: false)
    XCTAssertTrue(drawn(app, "appearance-app", target), "not kept after a relaunch")
    accountTab(app)
    choose(app, "Theo máy")
    XCTAssertTrue(drawn(app, "appearance-sheet", was), "the sheet isn't as the phone is again")
    XCTAssertTrue(drawn(app, "appearance-app", was), "the tabs aren't as the phone is again")
  }

  /// A sync the server can't take offers only the button that helps: "Cập nhật ứng dụng" for an account's store from a
  /// newer app, and none for an account that's full or records it refused, where trying again changes nothing.
  func testASyncTheServerCantTakeOffersOnlyTheButtonThatHelps() {
    var app = launch(resetServer: true)
    add(app, "Bể tép", first: true)
    signIn(app)
    app.terminate()
    for (flag, says, update) in [("-sync-newer-store", "bản ứng dụng mới hơn", true), ("-sync-full", "đủ chỗ", false),
                                 ("-sync-refuses", "không hợp lệ", false)] {
      app = launch(newPhone: false, flag)
      let sync = element(app, "sync-status")
      XCTAssertTrue(sync.waitForExistence(timeout: 10) && waitFor(sync, contains: says), "\(flag): \(sync.label)")
      XCTAssertEqual(element(app, "sync-update").exists, update, "\(flag): Cập nhật ứng dụng")
      if update { XCTAssertEqual(element(app, "sync-update").label, "Cập nhật ứng dụng") }
      XCTAssertFalse(element(app, "sync-retry").exists, "\(flag): Thử lại where it can't help")
      XCTAssertFalse(element(app, "sync-now").exists, "\(flag): Đồng bộ ngay where it can't help")
      app.terminate()
    }
  }

  /// The owner's row counts the overview's to-dos, grey, as a value: as many as the stand-in's overview has, the
  /// Worker's own reply in protocols/owner-dashboard-vectors.json (read here, as the stand-in reads it, so a to-do the
  /// dashboard adds there doesn't fail this).
  func testTheOwnersRowCountsTheOverviewsToDos() throws {
    var repo = URL(fileURLWithPath: #filePath)
    for _ in 0..<4 { repo.deleteLastPathComponent() }
    let vectors = try JSONSerialization.jsonObject(with: Data(contentsOf: repo.appending(path: "protocols/owner-dashboard-vectors.json"))) as? [String: Any]
    let overview = (vectors?["replies"] as? [[String: Any]])?.first { $0["name"] as? String == "dashboard" }?["body"] as? [String: Any]
    let todos = try XCTUnwrap((overview?["needs"] as? [Any])?.count, "no overview in the vectors")
    XCTAssertGreaterThan(todos, 0, "the overview has no to-dos to count")
    let app = launch(resetServer: true, "-fake-owner", "ui-apple")
    signIn(app)
    let row = reached(app, "owner-dashboard")
    XCTAssertTrue(row.exists, "no owner's row")
    XCTAssertTrue(waitFor(row, contains: "\(todos) việc cần làm"), row.label)
  }

  /// A session that ended while no account is kept on the phone (its copy unreadable after an update): plain signed
  /// out, with every way in, no sentence naming none, and no dot.
  func testAnEndedSessionWithNoAccountKeptIsPlainSignedOut() {
    var app = launch(resetServer: true)
    signIn(app)
    app.terminate()
    app = launch(newPhone: false, open: false, "-drop-kept-account", "-end-sessions", "ui-apple")
    XCTAssertFalse(waitForBadge(app), "a dot for a session there's no way to name")
    accountTab(app)
    XCTAssertTrue(element(app, "account-header").waitForExistence(timeout: 10), "not the signed-out card")
    XCTAssertFalse(element(app, "session-ended").exists, "an ended session with no way named")
    XCTAssertTrue(element(app, "apple-sign-in").exists && element(app, "google-sign-in").exists, "not every way in")
  }

  /// Who is signed in answered with a server fault, not no network: a fault, red, with "Thử lại", and a dot.
  func testAServerFaultAskingWhoIsSignedInIsAFaultNotNoNetwork() {
    var app = launch(resetServer: true)
    signIn(app)
    app.terminate()
    app = launch(newPhone: false, open: false, "-session-fails")
    XCTAssertTrue(waitForBadge(app), "no dot for a server fault")
    XCTAssertEqual(profile(app), "đồng bộ lỗi")
    accountTab(app)
    let sync = element(app, "sync-status")
    XCTAssertTrue(sync.waitForExistence(timeout: 10), "no sync row")
    XCTAssertFalse(sync.label.contains("Chưa có mạng"), "a server fault read as no network: \(sync.label)")
    XCTAssertTrue(element(app, "sync-retry").exists, "no Thử lại")
  }

  /// A session that ends while the sheet is open is seen there: no dot after closing it.
  func testASessionThatEndsWithTheSheetOpenLeavesNoDot() {
    var app = launch(resetServer: true)
    signIn(app)
    app.terminate()
    // Who is signed in is answered 15 s after the sheet opens: the session ends in front of the reader.
    app = launch(newPhone: false, "-slow-session", "-end-sessions", "ui-apple")
    XCTAssertTrue(element(app, "session-ended").waitForExistence(timeout: 25), "the session didn't end in the sheet")
    app.buttons["account-done"].tap()
    XCTAssertEqual(profile(app), "", "a dot for an end the reader saw")
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

  /// Signed in, with a store this app can't keep: no "Đồng bộ ngay", and the sheet says why.
  func testSignedInAStoreFromANewerAppSaysWhyItIsntSynced() {
    var app = launch(resetServer: true)
    signIn(app)
    app.terminate()

    app = launch(newPhone: false, "-seed-tanks", "newer")
    XCTAssertTrue(app.staticTexts["account-status"].waitForExistence(timeout: 5), "not signed in")
    XCTAssertTrue(element(app, "account-cant-sync").exists, "no word on why the tanks aren't synced")
    XCTAssertFalse(element(app, "sync-now").exists, "a sync offered for a store this app can't keep")
  }

  /// With no network at launch, the account signed in on this phone shows as it was kept, not as accounts off, with when
  /// it last synced and "Thử lại"; no network is no fault (the changes wait on the phone): no dot on the profile button,
  /// a change made offline included. A phone never signed in is told the server can't be reached.
  func testOfflineTheAccountShowsAsKeptAndNoNetworkIsNoFault() {
    var app = launch(resetServer: true)
    signIn(app)
    app.terminate()

    app = launch(newPhone: false, "-server-offline")
    let status = app.staticTexts["account-status"]
    XCTAssertTrue(status.waitForExistence(timeout: 5), "signed in on this phone, not shown offline")
    XCTAssertTrue(status.label.contains("Apple"), status.label)
    XCTAssertFalse(element(app, "account-off").exists, "offline read as accounts off")
    let sync = element(app, "sync-status")
    XCTAssertTrue(sync.waitForExistence(timeout: 10), "no sync row")
    XCTAssertTrue(sync.label.contains("Chưa có mạng") && sync.label.contains("Đồng bộ lần cuối lúc"), sync.label)
    XCTAssertTrue(element(app, "sync-retry").exists, "no Thử lại offline")
    // At the sheet's end.
    let out = element(app, "sign-out")
    repeatUntil(out.exists, times: 6) { app.swipeUp() }
    XCTAssertTrue(out.exists && element(app, "delete-account").exists, "the account's buttons gone offline")
    // Seen from the tanks tab, where the change is made.
    add(app, "Bể tép", first: true)
    // Its sync runs 1.5 s after the change, and finds no network: no dot, before or after it.
    let until = Date().addingTimeInterval(4)
    while Date() < until {
      XCTAssertEqual(profile(app), "đã đăng nhập", "a dot for no network")
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
    }
    accountTab(app)
    XCTAssertTrue(element(app, "sync-status").label.contains("Chưa có mạng"), element(app, "sync-status").label)
    app.terminate()

    app = launch("-server-offline")
    let unreached = element(app, "account-unreached")
    XCTAssertTrue(unreached.waitForExistence(timeout: 10), "a new phone offline isn't told the server can't be reached")
    XCTAssertEqual(oneLine(unreached.label), "Chưa kết nối được aquatome.com. Các bể vẫn lưu trên máy này.")
    XCTAssertFalse(element(app, "account-off").exists, "offline read as accounts off")
  }

  /// A sync the server fails puts a dot on the profile button from any tab; the sheet says why, with "Thử lại", which
  /// syncs and takes the dot away.
  func testAFailedSyncMarksTheProfileButtonUntilItGoesThrough() {
    var app = launch(resetServer: true)
    signIn(app)
    app.terminate()

    // Busy past the app's own tries (4) at the sync on launch.
    app = launch(newPhone: false, open: false, "-sync-busy", "4")
    XCTAssertTrue(waitForBadge(app), "no dot on the profile button for a sync that failed")
    XCTAssertEqual(profile(app), "đồng bộ lỗi")
    app.openAccount()
    let sync = element(app, "sync-status")
    XCTAssertTrue(sync.waitForExistence(timeout: 5), "no sync row")
    XCTAssertTrue(sync.label.contains("Chưa đồng bộ được"), sync.label)
    XCTAssertFalse(element(app, "sync-now").exists, "Đồng bộ ngay beside a failure")
    tap(app, "sync-retry")
    XCTAssertTrue(waitForSyncs(app, 1), "Thử lại didn't sync")
    XCTAssertTrue(element(app, "sync-status").label.contains("Đã đồng bộ"), element(app, "sync-status").label)
    app.buttons["account-done"].tap()
    XCTAssertEqual(profile(app), "đã đăng nhập", "the dot stayed after the sync went through")
  }

  /// A session ended elsewhere: a dot until the sheet is seen; the way the account signed in is named and offered first
  /// (another would make a second account), the others under "Cách khác".
  func testAnEndedSessionOffersTheWayTheAccountSignedInFirst() {
    var app = launch(resetServer: true)
    signIn(app)
    app.terminate()

    app = launch(newPhone: false, open: false, "-end-sessions", "ui-apple")
    XCTAssertTrue(waitForBadge(app), "no dot for a session that ended")
    XCTAssertEqual(profile(app), "cần đăng nhập lại")
    app.openAccount()
    let ended = element(app, "session-ended")
    XCTAssertTrue(ended.waitForExistence(timeout: 5), "not told the session ended")
    XCTAssertEqual(ended.label, "Phiên đăng nhập đã hết. Lần trước bạn đăng nhập bằng Apple.")
    XCTAssertTrue(element(app, "apple-sign-in").exists, "the account's way to sign in isn't offered")
    XCTAssertFalse(element(app, "google-sign-in").exists, "another way offered before Cách khác")
    tap(app, "sign-in-others")
    XCTAssertTrue(element(app, "google-sign-in").waitForExistence(timeout: 5), "Cách khác offers nothing")
    app.buttons["account-done"].tap()
    XCTAssertFalse(badged(app), "the dot stayed once the sheet was seen")

    signIn(app)
    XCTAssertFalse(element(app, "session-ended").exists, "still told the session ended")
  }

  /// The sheet closed before the server says who is signed in (a slow network): opened again, it's still waiting for the
  /// answer, not saying the server can't be reached.
  func testClosingTheSheetBeforeTheServerAnswersIsNotReadAsNoNetwork() {
    let app = launch(resetServer: true, "-slow-session")
    app.closeAccount()
    app.openAccount()
    XCTAssertFalse(element(app, "account-unreached").waitForExistence(timeout: 3), "a sheet closed early read as no network")
    XCTAssertTrue(element(app, "apple-sign-in").waitForExistence(timeout: 30), "the server's answer never came")
  }

  /// The account is in the profile button's sheet, from every tab: an empty "Bể của tôi" offers a hint that opens it,
  /// and a tank list signed in shows none of the account but where the tanks are kept.
  func testTheAccountIsInTheProfileSheetFromEveryTab() {
    // The old look's tabs: v2's are Hôm nay's and Khám phá's (V2FlowTests).
    let app = launch(resetServer: true, "-v2", "NO")
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
    XCTAssertEqual(oneLine(hint.label), "Đã lưu bể trên aquatome.com hoặc máy khác? Đăng nhập để lấy về")
    XCTAssertFalse(element(app, "apple-sign-in").exists, "the sign-in in the tanks tab")
    XCTAssertFalse(element(app, "account-header").exists, "the account in the tanks tab")
    hint.tap()
    XCTAssertTrue(app.buttons["account-done"].waitForExistence(timeout: 5), "the hint didn't open the Tài khoản sheet")
    XCTAssertTrue(element(app, "apple-sign-in").waitForExistence(timeout: 5), "no sign-in after the hint")

    // Signed out with a tank: kept on this phone, and a way to keep them on aquatome.com too, into the sheet.
    add(app, "Bể tép", first: true)
    let keep = app.buttons["keep-online-hint"]
    XCTAssertTrue(keep.waitForExistence(timeout: 5), "no way to sign in under the tanks")
    keep.tap()
    XCTAssertTrue(element(app, "apple-sign-in").waitForExistence(timeout: 5), "the link didn't open the Tài khoản sheet")
    signIn(app)
    let stored = "Các bể lưu trên máy này và trong tài khoản của bạn trên máy chủ AquaTome (Cloudflare), để các thiết bị đã đăng nhập cùng thấy."
    XCTAssertTrue(app.staticTexts[stored].exists, "the sheet doesn't say the tanks are kept in the account too")
    tanksTab(app)
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "no tank listed")
    for id in ["account-header", "account-status", "sync-now", "passkey-add", "sign-out", "delete-account", "sign-in-hint", "keep-online-hint"] {
      XCTAssertFalse(element(app, id).exists, "\(id) in the tanks tab")
    }
    XCTAssertFalse(app.staticTexts[stored].exists, "the tanks tab says where they're kept, signed in")
  }

  // MARK: Helpers

  /// In the Tài khoản sheet (`open`; else on the first tab). `newPhone`: as a new install (signed out, nothing saved);
  /// otherwise the phone as the last launch left it.
  private func launch(resetServer: Bool = false, newPhone: Bool = true, accounts: String = "on", open: Bool = true, _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-fake-accounts", accounts]
      + (newPhone ? ["-reset-defaults"] : []) + (resetServer ? ["-reset-fake-server"] : []) + args
    app.launchForFlow()
    if open { accountTab(app) }
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

  /// Whether the profile button on screen marks a fault with the account, as it says to VoiceOver (its dot). With the
  /// sheet closed: a button under it may not be there to ask.
  private func badged(_ app: XCUIApplication) -> Bool {
    XCTAssertNotNil(onScreen(app), "no profile button on screen")
    return faulted(app)
  }

  private func faulted(_ app: XCUIApplication) -> Bool { ["đồng bộ lỗi", "cần đăng nhập lại"].contains(profile(app)) }

  /// The profile button the reader can tap: the open tab's, not one under the sheet.
  private func onScreen(_ app: XCUIApplication) -> XCUIElement? {
    app.buttons.matching(identifier: "profile").allElementsBoundByIndex.first { $0.isHittable }
  }

  /// What the profile button on screen says to VoiceOver after "Tài khoản".
  private func profile(_ app: XCUIApplication) -> String { onScreen(app)?.value as? String ?? "" }

  /// Two lines read as one, as they're written.
  private func oneLine(_ s: String) -> String { s.replacingOccurrences(of: "\n", with: " ") }

  /// An element's label has the words, within 10 s.
  private func waitFor(_ e: XCUIElement, contains words: String) -> Bool {
    let until = Date().addingTimeInterval(10)
    while Date() < until {
      if e.exists && e.label.contains(words) { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
    }
    return false
  }

  /// Looked for every half second, for up to 10 s.
  private func waitForBadge(_ app: XCUIApplication) -> Bool {
    let until = Date().addingTimeInterval(10)
    while Date() < until {
      if faulted(app) { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.5))
    }
    return badged(app)
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

  /// The stand-in server has said whether it offers accounts (TanksView): what the tab shows for signing in is settled.
  private func answered(_ app: XCUIApplication) -> Bool { element(app, "account-answered").waitForExistence(timeout: 10) }

  /// Scrolls the list until the element is on screen, then taps it.
  private func tap(_ app: XCUIApplication, _ id: String) {
    let e = reached(app, id)
    XCTAssertTrue(e.exists, "no \(id)")
    // Into the open, toward it: back up the list for a row above what shows (signed out at the sheet's foot, its ways to
    // sign in are at the top), else on down. Not under the sheet's bar: a row scrolled under it reads as hittable, and a
    // tap there lands on the bar.
    let bar = app.navigationBars["Tài khoản"]
    func clear() -> Bool { e.isHittable && (!bar.exists || e.frame.minY >= bar.frame.maxY) }
    repeatUntil(clear(), times: 6) { e.frame.midY < app.frame.midY ? drag(app, from: 0.35, to: 0.75) : app.swipeUp() }
    e.tap()
  }

  /// A finger held, then moved down or up the screen (fractions of its height): a list scrolls by it where a quick swipe
  /// down in a sheet scrolled at its foot moved nothing.
  private func drag(_ app: XCUIApplication, from: CGFloat, to: CGFloat) {
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: from))
      .press(forDuration: 0.2, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: to)))
  }

  /// The element, scrolled to: a list makes its rows only as they come into view (the sheet's last ones, sign out and
  /// delete, a few screens down at large text).
  private func reached(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    let e = element(app, id)
    if !e.waitForExistence(timeout: 3) { repeatUntil(e.exists, times: 8) { app.swipeUp() } }
    return e
  }

  /// How light an element is drawn, on average: 0 black, 1 white.
  private func lightness(_ e: XCUIElement) -> Double {
    guard let image = e.screenshot().image.cgImage else { return -1 }
    let w = 24, h = 6
    var px = [UInt8](repeating: 0, count: w * h * 4)
    guard let c = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return -1 }
    c.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    // A loop of single sums: as one closure of chained sums, CI's compiler gave up type-checking it.
    var sum = 0
    for i in stride(from: 0, to: px.count, by: 4) {
      sum += Int(px[i])
      sum += Int(px[i + 1])
      sum += Int(px[i + 2])
    }
    return Double(sum) / Double(w * h * 3 * 255)
  }

  /// "Giao diện" set from its menu in the sheet.
  private func choose(_ app: XCUIApplication, _ name: String) {
    tap(app, "appearance")
    let item = app.buttons[name].firstMatch
    XCTAssertTrue(item.waitForExistence(timeout: 5), "no \(name) in the menu")
    item.tap()
  }

  /// The app (`appearance-app`) or the sheet (`appearance-sheet`) is drawn light or dark, within 5 s.
  private func drawn(_ app: XCUIApplication, _ id: String, _ scheme: String) -> Bool {
    let probe = app.staticTexts[id]
    let until = Date().addingTimeInterval(5)
    while Date() < until {
      if probe.exists && probe.label == "drawn \(scheme)" { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.25))
    }
    return false
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
