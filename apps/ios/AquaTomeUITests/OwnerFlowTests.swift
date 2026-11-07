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

  /// The owner asked for a bar's own figures on a phone: a tap on a column, or a finger dragged across, reads that day.
  func testTappingOrDraggingAcrossAChartReadsThatDay() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Nhận diện cá")
    let chart = app.descendants(matching: .any).matching(identifier: "owner-chart")
      .containing(NSPredicate(format: "label == 'Lượt gửi ảnh mỗi ngày, theo kết quả'")).firstMatch
    let columns = chart.descendants(matching: .any)["owner-chart-columns"], day = chart.staticTexts["owner-chart-day"]
    XCTAssertTrue(columns.waitForExistence(timeout: 10), "no chart")
    repeatUntil(columns.isHittable, times: 4) { app.swipeUp(velocity: .slow) }
    XCTAssertTrue(columns.isHittable, "the chart isn't on screen")
    // A finger that starts on the chart and goes up scrolls the page, as anywhere else.
    let top = columns.frame.minY
    columns.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 0.05, thenDragTo: columns.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: -1.5)))
    XCTAssertLessThan(columns.frame.minY, top - 100, "the page didn't scroll from the chart")
    repeatUntil(columns.isHittable, times: 4) { app.swipeDown(velocity: .slow) }
    // Untouched: the last of its 30 days, today, not over yet.
    XCTAssertEqual(day.label, "04/11 (chưa hết ngày) · Có kết quả 11 · Không có kết quả 0 · Chặn trước khi gọi 1")
    let at = { (i: Double) in columns.coordinate(withNormalizedOffset: CGVector(dx: (i + 0.5) / 30, dy: 0.5)) }
    // A tap on the first column: each series' value that day.
    at(0).tap()
    XCTAssertTrue(says(day, "06/10 · Có kết quả 12 · Không có kết quả 0 · Chặn trước khi gọi 2"), day.label)
    // A finger pressed there and dragged to the third: the column under it.
    at(0).press(forDuration: 0.1, thenDragTo: at(2))
    XCTAssertTrue(says(day, "08/10 · Có kết quả 14 · Không có kết quả 0 · Chặn trước khi gọi 1"), day.label)
  }

  /// The overview's cards: a tap on one of a card's small columns, or a finger dragged across them, reads that day and
  /// its count, and doesn't open the section (the card's words do).
  func testTappingACardsSmallColumnsReadsThatDay() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    let spark = app.descendants(matching: .any).matching(identifier: "owner-spark").matching(NSPredicate(format: "label == 'Người đọc'")).firstMatch
    XCTAssertTrue(spark.waitForExistence(timeout: 10), "no columns on the readers' card")
    repeatUntil(spark.isHittable, times: 4) { app.swipeUp(velocity: .slow) }
    XCTAssertTrue(spark.isHittable, "the card isn't on screen")
    let day = app.staticTexts["owner-spark-day"]
    XCTAssertFalse(day.exists, "a day read before any tap")
    // Its 30 columns end yesterday, in the dashboard's zone.
    var cal = Calendar(identifier: .gregorian)
    cal.timeZone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
    let ago = { (n: Int) -> String in
      let c = cal.dateComponents([.day, .month], from: cal.date(byAdding: .day, value: -n, to: cal.startOfDay(for: Date()))!)
      return String(format: "%02d/%02d", c.day!, c.month!)
    }
    let at = { (i: Double) in spark.coordinate(withNormalizedOffset: CGVector(dx: (i + 0.5) / 30, dy: 0.5)) }
    at(29).tap()
    XCTAssertTrue(says(day, ago(1) + " · 22"), day.label)
    XCTAssertTrue(app.buttons["owner-todo"].firstMatch.exists, "the tap opened the card's section")
    at(0).press(forDuration: 0.1, thenDragTo: at(2))
    XCTAssertTrue(says(day, ago(28) + " · 22"), day.label)
  }

  // A review's notes (some 4 KB on the site, a note a line) show two lines until tapped, and the review's line always.
  func testALongCellShowsTwoLinesUntilTapped() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Nội dung")
    // The video guide's three notes, the third with `&` and `<don't>` in it, as written; the review's line said too.
    let notes = app.buttons.matching(NSPredicate(format: "identifier == 'owner-fold' AND label CONTAINS 'Phụ đề tự động' AND label CONTAINS %@",
                                                 "Keep them hedged & <don't> give")).firstMatch
    XCTAssertTrue(notes.waitForExistence(timeout: 10), "no notes cell")
    XCTAssertTrue(notes.label.contains("Đánh giá bài viết từ video, 03/11 · 3 nhận xét"), notes.label)
    XCTAssertEqual(notes.value as? String, "Xem thêm")
    // Down the section to its table, then across it to the notes' column: dragged and held, never flung, so it isn't
    // scrolled past.
    let window = app.windows.firstMatch.frame
    func drag(_ from: CGVector, _ by: CGVector) {
      let start = app.coordinate(withNormalizedOffset: .zero).withOffset(from)
      start.press(forDuration: 0.05, thenDragTo: start.withOffset(by), withVelocity: .fast, thenHoldForDuration: 0.1)
    }
    repeatUntil(notes.isHittable, times: 24) {
      let f = notes.frame
      if f.minY > window.maxY - 200 { drag(CGVector(dx: window.midX, dy: window.height * 0.7), CGVector(dx: 0, dy: -window.height * 0.4)) }
      else if f.minY < window.minY + 160 { drag(CGVector(dx: window.midX, dy: window.height * 0.3), CGVector(dx: 0, dy: window.height * 0.3)) }
      else { drag(CGVector(dx: window.width * 0.85, dy: f.minY + 10), CGVector(dx: -window.width * 0.6, dy: 0)) }
    }
    XCTAssertTrue(notes.isHittable, "the notes cell isn't on screen")
    let folded = notes.frame.height
    // Tapped near its top, which stays put as it opens downwards.
    notes.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
    let opened = expectation(for: NSPredicate(format: "value == 'Thu gọn'"), evaluatedWith: notes)
    wait(for: [opened], timeout: 5)
    XCTAssertGreaterThan(notes.frame.height, folded * 2, "not all of it")
    notes.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
    let closed = expectation(for: NSPredicate(format: "value == 'Xem thêm'"), evaluatedWith: notes)
    wait(for: [closed], timeout: 5)
    XCTAssertEqual(notes.frame.height, folded, accuracy: 1, "not two lines again")
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

  func testTheOwnerTurnsTheDailyReportsEmailOffThenOnAgain() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Báo cáo hằng ngày")
    let said = text(app, "label BEGINSWITH 'Email: đang bật.'")
    XCTAssertTrue(said.waitForExistence(timeout: 10), "the report's delivery isn't said")
    XCTAssertTrue(said.label.contains("Thông báo trên điện thoại: đang bật"), said.label)
    button(app, "Tắt email").tap()
    // Read again: off, and the button turns it back on.
    XCTAssertTrue(text(app, "label BEGINSWITH 'Email: đang tắt.'").waitForExistence(timeout: 10), "not said off")
    button(app, "Bật email").tap()
    XCTAssertTrue(said.waitForExistence(timeout: 10), "not said on again")
    XCTAssertTrue(button(app, "Tắt email").exists)
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

  /// The daily report's notifications on this phone: off at first; turned on (iOS asks, the first time on this
  /// simulator) and allowed, they stay on, the dashboard opened again (the token itself, which the simulator doesn't get,
  /// is the kit's to test: OwnerPushTests); turned off again.
  func testTheReportsNotificationsAreTurnedOnHereOnceIOSAllowsThem() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    var row = app.switches["owner-push"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10), "no notifications row")
    XCTAssertEqual(row.value as? String, "0")
    // The switch itself, at the row's end (the words are the label's).
    row.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
    let ask = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
    if ask.waitForExistence(timeout: 5) { ask.buttons.element(boundBy: ask.buttons.count - 1).tap() }
    XCTAssertTrue(becomes(row, "1"), "not on")
    // What the app keeps, not the switch's own state: the dashboard opened again.
    back(app)
    open(app, "owner-dashboard")
    row = app.switches["owner-push"].firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10), "no notifications row")
    XCTAssertEqual(row.value as? String, "1", "not kept on")
    row.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
    XCTAssertTrue(becomes(row, "0"), "not off")
  }

  /// Whether `e`'s value becomes `value` within 5 s.
  private func becomes(_ e: XCUIElement, _ value: String) -> Bool {
    XCTWaiter.wait(for: [expectation(for: NSPredicate(format: "value == %@", value), evaluatedWith: e)], timeout: 5) == .completed
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

    // Signed out as a sync told the same is; the row stays, saying why it can't open. Under the ways to sign in, out of
    // view until scrolled to: the list makes its rows as they come into view.
    let row = app.descendants(matching: .any)["owner-dashboard"].firstMatch
    repeatUntil(row.exists, times: 6) { app.swipeUp() }
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the row went")
    XCTAssertTrue(row.label.contains("đăng nhập lại"), row.label)
    let message = app.staticTexts["account-message"]
    XCTAssertTrue(message.waitForExistence(timeout: 5))
    XCTAssertEqual(message.label, "Phiên đăng nhập đã hết: đăng nhập lại để đồng bộ.")

    // Signed in again (its button back up the list): the dashboard opens as before.
    repeatUntil(app.descendants(matching: .any)["apple-sign-in"].firstMatch.exists, times: 6) { app.swipeDown() }
    signIn(app)
    let plain = expectation(for: NSPredicate(format: "NOT (label CONTAINS 'đăng nhập lại')"), evaluatedWith: row)
    wait(for: [plain], timeout: 10)
    open(app, "owner-dashboard")
    section(app, "Người đọc")
    XCTAssertTrue(app.descendants(matching: .any)["owner-chart"].firstMatch.waitForExistence(timeout: 10), "the section didn't open")
    XCTAssertFalse(app.staticTexts["owner-message"].exists)
  }

  // MARK: Helpers

  /// A new phone, the stand-in's accounts empty, `owner` its owner's account (`ui-apple`: the stand-in Apple sign-in's), in
  /// the Tài khoản sheet.
  private func launch(owner: String = "ui-apple", _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-fake-accounts", "on", "-reset-defaults",
                           "-reset-fake-server", "-fake-owner", owner] + args
    app.launch()
    app.openAccount()
    return app
  }

  private func signIn(_ app: XCUIApplication) { app.signInWithStandInApple() }
  private func open(_ app: XCUIApplication, _ id: String) { app.scrollToAndTap(id) }
  /// It reads `label` within 5 s.
  private func says(_ e: XCUIElement, _ label: String) -> Bool {
    XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", label), object: e)], timeout: 5) == .completed
  }
  private func section(_ app: XCUIApplication, _ name: String) { app.openOwnersSection(name) }

  /// A text by its words: a part's lines are one text, its first line first.
  private func text(_ app: XCUIApplication, _ predicate: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: predicate)).firstMatch
  }

  /// A button of the section's, by its words, once it's there.
  private func button(_ app: XCUIApplication, _ label: String) -> XCUIElement {
    let b = app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == %@", label)).firstMatch
    XCTAssertTrue(b.waitForExistence(timeout: 10), "no \(label)")
    return b
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
    repeatUntil(e.isHittable, times: 6) { swipeUp() }
    e.tap()
  }

  /// A section, from the overview's list of them, at its end: the list makes its rows only as they scroll into view.
  func openOwnersSection(_ name: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(buttons["owner-area"].firstMatch.waitForExistence(timeout: 10), "the overview didn't load", file: file, line: line)
    let row = buttons.matching(NSPredicate(format: "identifier == 'owner-section' AND label == %@", name)).firstMatch
    repeatUntil(row.exists && row.isHittable, times: 10) { swipeUp() }
    XCTAssertTrue(row.isHittable, "no section \(name)", file: file, line: line)
    row.tap()
  }
}
