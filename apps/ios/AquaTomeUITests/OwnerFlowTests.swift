import XCTest

/// The owner's dashboard, against the stand-in server serving protocols/owner-dashboard-vectors.json
/// (`-fake-owner <account>`): the row only for the owner's account, the overview and sections drawn by the app, the
/// buttons' requests and the section read again after each, the server's own message for a refusal, a session that ends
/// while the dashboard is open, and the server's storage down for a moment.
final class OwnerFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testTheOwnerOpensASectionWithAChartAndATableAndApprovesAReadersPhoto() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    XCTAssertEqual(app.buttons.matching(identifier: "owner-todo").count, 2, "the overview's to-dos")
    XCTAssertTrue(app.buttons["owner-todo"].firstMatch.label.contains("1 key Anthropic đang nghỉ"), app.buttons["owner-todo"].firstMatch.label)
    XCTAssertEqual(app.buttons.matching(identifier: "owner-area").count, 10, "an area card each")
    XCTAssertEqual(app.buttons.matching(identifier: "owner-log").count, 16, "a line each of \"Mấy ngày qua\"")

    // A to-do opens its section at the heading it names, far down it.
    app.buttons["owner-todo"].firstMatch.tap()
    let heading = app.staticTexts["Key Anthropic"]
    XCTAssertTrue(heading.waitForExistence(timeout: 10), "the section didn't open")
    let shown = expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: heading)
    wait(for: [shown], timeout: 5)
    back(app)

    section(app, "Nhận diện cá")
    XCTAssertTrue(app.descendants(matching: .any)["owner-chart"].firstMatch.waitForExistence(timeout: 10), "no chart")
    XCTAssertTrue(app.staticTexts["Lượt gửi ảnh mỗi ngày, theo kết quả"].exists)
    XCTAssertTrue(app.descendants(matching: .any)["owner-table"].firstMatch.exists, "no table")
    XCTAssertTrue(text(app, "label BEGINSWITH 'Hôm nay' AND label CONTAINS 'chưa hết ngày'").exists, "a cell and its second line")
    back(app)

    section(app, "Ảnh bạn đọc")
    let approve = app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == 'Duyệt'")).firstMatch
    XCTAssertTrue(approve.waitForExistence(timeout: 10), "no photo waiting")
    // Lan's photo, the one waiting to be approved.
    let approved = text(app, "label BEGINSWITH 'Lan' AND label CONTAINS 'Đã duyệt · đăng trong lượt duyệt tới'")
    XCTAssertFalse(approved.exists)
    approve.tap()
    // Read again: the photo approved is marked so, and has nothing more to approve.
    XCTAssertTrue(approved.waitForExistence(timeout: 10), "not marked approved")
    XCTAssertFalse(approve.exists, "still waiting to be approved")
  }

  func testRemovingAReadersPhotoAsksFirst() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Ảnh bạn đọc")
    // Lan's photo: its Duyệt goes with it.
    let approve = app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == 'Duyệt'")).firstMatch
    let remove = app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == 'Gỡ'")).firstMatch
    XCTAssertTrue(remove.waitForExistence(timeout: 10), "no photo to remove")
    XCTAssertTrue(approve.exists)
    remove.tap()
    // Asked first, and nothing gone before the answer.
    XCTAssertTrue(app.staticTexts["Không hoàn tác được."].waitForExistence(timeout: 5), "removed without asking")
    XCTAssertTrue(approve.exists, "removed before the answer")
    app.buttons.matching(NSPredicate(format: "label == 'Gỡ' AND identifier != 'owner-action'")).firstMatch.tap()
    let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: approve)
    wait(for: [gone], timeout: 10)
  }

  func testHidesAPageThenBringsItBack() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Ẩn trang")
    hide(app, "/ca/ca-y/", note: "sai loài")
    let page = text(app, "label BEGINSWITH '/ca/ca-y/'")
    XCTAssertTrue(page.waitForExistence(timeout: 10), "not listed as hidden")
    XCTAssertTrue(page.label.contains("sai loài"), page.label)
    // The newest first: its "Hiện lại".
    let again = app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == 'Hiện lại'")).firstMatch
    XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == 'Hiện lại'")).count, 3)
    again.tap()
    let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: page)
    wait(for: [gone], timeout: 10)
    XCTAssertTrue(text(app, "label BEGINSWITH '/ca/ca-x/'").exists, "the others stay hidden")
  }

  func testARefusedButtonShowsTheServersMessage() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Ẩn trang")
    hide(app, "/")
    let said = app.staticTexts["owner-message"]
    XCTAssertTrue(said.waitForExistence(timeout: 10), "nothing said")
    XCTAssertEqual(said.label, "Chỉ ẩn được một trang của trang web (không phải trang chủ).")
  }

  func testStorageDownSaysSoAndTriesAgain() {
    let app = launch("-owner-storage-down")
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Người đọc")
    let said = app.staticTexts["owner-message"]
    XCTAssertTrue(said.waitForExistence(timeout: 10), "nothing said")
    XCTAssertEqual(said.label, "Không làm được lúc này: máy chủ không đọc hay ghi được. Thử lại sau.")
    app.buttons["owner-again"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["owner-chart"].firstMatch.waitForExistence(timeout: 10), "the section didn't come")
    XCTAssertFalse(said.exists)
  }

  func testAnotherAccountSeesNoDashboard() {
    // The stand-in's owner is another account: this one's overview answers 404.
    let app = launch(owner: "someone-else")
    signIn(app)
    // The dashboard asked about this account and was told it isn't the owner's: then no row.
    let told = expectation(for: NSPredicate(format: "value == 'not owner'"), evaluatedWith: app.buttons["sync-now"])
    wait(for: [told], timeout: 10)
    XCTAssertFalse(app.descendants(matching: .any)["owner-dashboard"].exists, "a dashboard row for an account that isn't the owner's")
  }

  func testASessionEndingWhileTheDashboardIsOpenAsksToSignInAgainAndKeepsTheRow() {
    let app = launch("-owner-session-ends")
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Người đọc")
    let said = app.staticTexts["owner-message"]
    XCTAssertTrue(said.waitForExistence(timeout: 10), "nothing said")
    XCTAssertEqual(said.label, "Phiên đăng nhập đã hết: đăng nhập lại để xem bảng điều khiển.")
    back(app)
    back(app)

    // Signed out as a sync told the same is; the row stays, saying why it can't open.
    let row = app.descendants(matching: .any)["owner-dashboard"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the row went")
    XCTAssertTrue(row.label.contains("đăng nhập lại"), row.label)
    let message = app.staticTexts["account-message"]
    XCTAssertTrue(message.waitForExistence(timeout: 5))
    XCTAssertEqual(message.label, "Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ.")

    // Signed in again: the dashboard opens as before.
    signIn(app)
    let plain = expectation(for: NSPredicate(format: "NOT (label CONTAINS 'đăng nhập lại')"), evaluatedWith: row)
    wait(for: [plain], timeout: 10)
    open(app, "owner-dashboard")
    section(app, "Người đọc")
    XCTAssertTrue(app.descendants(matching: .any)["owner-chart"].firstMatch.waitForExistence(timeout: 10), "the section didn't open")
    XCTAssertFalse(app.staticTexts["owner-message"].exists)
  }

  // MARK: Helpers

  /// A new phone, the stand-in's accounts empty, `owner` its owner's account (`ui-apple`: the stand-in Apple sign-in's).
  private func launch(owner: String = "ui-apple", _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-fake-accounts", "on", "-reset-defaults",
                           "-reset-fake-server", "-fake-owner", owner] + args
    app.launch()
    app.openTab("Bể của tôi")
    return app
  }

  private func signIn(_ app: XCUIApplication) { app.signInWithStandInApple() }
  private func open(_ app: XCUIApplication, _ id: String) { app.scrollToAndTap(id) }
  private func section(_ app: XCUIApplication, _ name: String) { app.openOwnersSection(name) }

  /// A text by its words: a part's lines are one text, its first line first.
  private func text(_ app: XCUIApplication, _ predicate: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: predicate)).firstMatch
  }

  private func back(_ app: XCUIApplication) {
    app.navigationBars.buttons.element(boundBy: 0).tap()
  }

  /// The section's form to hide a page: the page, and why.
  private func hide(_ app: XCUIApplication, _ path: String, note: String? = nil) {
    let field = app.textFields["owner-field-path"]
    XCTAssertTrue(field.waitForExistence(timeout: 10), "no form to hide a page")
    field.tap()
    field.typeText(path)
    if let note {
      app.textFields["owner-field-note"].tap()
      app.textFields["owner-field-note"].typeText(note)
    }
    app.buttons["owner-submit"].tap()
  }
}

/// The owner's dashboard on the stand-in server, for these flows and the page shots.
extension XCUIApplication {
  static let standInOwner = ["-fake-accounts", "on", "-reset-fake-server", "-fake-owner", "ui-apple"]

  /// Signs in with the stand-in Apple sheet, and waits for the sync that follows.
  func signInWithStandInApple(file: StaticString = #filePath, line: UInt = #line) {
    scrollToAndTap("apple-sign-in", file: file, line: line)
    let status = staticTexts["account-status"]
    XCTAssertTrue(status.waitForExistence(timeout: 10), "not signed in", file: file, line: line)
    let synced = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in Int(status.value as? String ?? "") ?? 0 >= 1 }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [synced], timeout: 10), .completed, "no sync", file: file, line: line)
  }

  /// Scrolls until the element is on screen, then taps it.
  func scrollToAndTap(_ id: String, file: StaticString = #filePath, line: UInt = #line) {
    let e = descendants(matching: .any)[id].firstMatch
    XCTAssertTrue(e.waitForExistence(timeout: 10), "no \(id)", file: file, line: line)
    for _ in 0..<6 where !e.isHittable { swipeUp() }
    e.tap()
  }

  /// A section, from the overview's list of them, at its end: the list makes its rows only as they scroll into view.
  func openOwnersSection(_ name: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(buttons["owner-area"].firstMatch.waitForExistence(timeout: 10), "the overview didn't load", file: file, line: line)
    let row = buttons.matching(NSPredicate(format: "identifier == 'owner-section' AND label == %@", name)).firstMatch
    for _ in 0..<10 where !(row.exists && row.isHittable) { swipeUp() }
    XCTAssertTrue(row.isHittable, "no section \(name)", file: file, line: line)
    row.tap()
  }
}
