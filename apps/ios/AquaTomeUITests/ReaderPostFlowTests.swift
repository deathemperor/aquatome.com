import XCTest

/// A reader's comment or photo posted to a page from the app as their aquatome.com account, on the stand-in server
/// (no network): signed out, the sign-in comes first.
final class ReaderPostFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Signed out, posting asks for the sign-in; signed in, a comment shows on the page at once, under the name given.
  func testACommentIsPostedAsTheAccountAndShowsOnThePage() {
    let app = launch()
    openNeon(app)
    let post = app.buttons["post-comment"]
    reveal(app, post)
    post.tap()
    XCTAssertTrue(app.staticTexts["Đăng nhập tài khoản aquatome.com để bình luận và gửi ảnh."].waitForExistence(timeout: 5), "not asked to sign in")
    app.descendants(matching: .any)["apple-sign-in"].firstMatch.tap()
    let name = app.textFields["post-name"]
    XCTAssertTrue(name.waitForExistence(timeout: 10), "the sign-in didn't open the form")
    name.tap()
    name.typeText("Hà")
    let body = app.textFields["post-body"]
    body.tap()
    body.typeText("Đàn 12 con khỏe.")
    app.buttons["post-send"].tap()
    XCTAssertTrue(app.staticTexts["Đã đăng bình luận."].waitForExistence(timeout: 5), "the comment wasn't posted")
    app.buttons["Đóng"].tap()
    let mine = app.descendants(matching: .any).matching(identifier: "comment").matching(NSPredicate(format: "label BEGINSWITH %@ AND label ENDSWITH %@", "Hà  ", "\nĐàn 12 con khỏe.")).firstMatch
    XCTAssertTrue(mine.waitForExistence(timeout: 5), "the comment isn't on the page: \(app.descendants(matching: .any).matching(identifier: "comment").allElementsBoundByIndex.map { $0.label })")
  }

  /// After posting, a page read again within the site's minute of caching still shows the reader's comment.
  func testTheReadersCommentStaysWhenThePageIsReadAgain() {
    let app = launch()
    openNeon(app)
    signInToPost(app, "post-comment")
    let name = app.textFields["post-name"]
    name.tap()
    name.typeText("Hà")
    let body = app.textFields["post-body"]
    body.tap()
    body.typeText("Đàn 12 con khỏe.")
    app.buttons["post-send"].tap()
    XCTAssertTrue(app.staticTexts["Đã đăng bình luận."].waitForExistence(timeout: 5), "the comment wasn't posted")
    app.buttons["Đóng"].tap()
    // Away to another tab and back: the page reads its comments again, as the site had them before.
    app.tabBars.buttons["Bể của tôi"].tap()
    app.tabBars.buttons["Tìm"].tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "not back on the page")
    let comments = app.descendants(matching: .any).matching(identifier: "comment")
    let mine = comments.matching(NSPredicate(format: "label ENDSWITH %@", "\nĐàn 12 con khỏe.")).firstMatch
    reveal(app, mine)
    XCTAssertEqual(comments.count, 3, "the fixture's two and the reader's, once: \(comments.allElementsBoundByIndex.map { $0.label })")
  }

  /// A photo needs a name, the reader's consent, and one picked, before it's sent: the site's words for each, in its
  /// form's order.
  func testAPhotoIsNotSentWithoutANameConsentOrOne() {
    let app = launch()
    openNeon(app)
    let post = app.buttons["post-photo"]
    reveal(app, post)
    XCTAssertEqual(post.label, "Gửi ảnh Cá neon của bạn")
    signInToPost(app, "post-photo")
    let send = app.buttons["post-send"]
    send.tap()
    XCTAssertTrue(app.staticTexts["Tên chỉ gồm chữ, 1–40 ký tự, không chứa đường link."].waitForExistence(timeout: 5), "sent with no name")
    let name = app.textFields["post-name"]
    name.tap()
    name.typeText("Hà")
    send.tap()
    XCTAssertTrue(app.staticTexts["Vui lòng xác nhận ảnh do bạn chụp."].waitForExistence(timeout: 5), "sent without consent")
    consent(app)
    send.tap()
    XCTAssertTrue(app.staticTexts["Chọn một ảnh trước đã."].waitForExistence(timeout: 5), "sent with no photo")
  }

  /// A photo sent with consent: received for moderation, and the link that takes it back shown this once.
  func testAPhotoSentWithConsentShowsItsTakeBackLinkOnce() {
    let app = launch("-picked-photo")
    openNeon(app)
    signInToPost(app, "post-photo")
    let name = app.textFields["post-name"]
    name.tap()
    name.typeText("Hà")
    consent(app)
    app.buttons["post-send"].tap()
    XCTAssertTrue(app.staticTexts["Đã nhận ảnh, cảm ơn bạn! Ảnh sẽ hiện ở đây sau khi được duyệt, thường trong vòng một ngày."].waitForExistence(timeout: 5), "not received")
    let link = app.descendants(matching: .any)["post-delete"]
    XCTAssertTrue(link.waitForExistence(timeout: 3), "no link to take the photo back")
    XCTAssertTrue(link.label.hasPrefix("https://aquatome.com/_p/xoa/?id="), link.label)
    app.buttons["Đóng"].tap()
    app.buttons["post-photo"].tap()
    XCTAssertTrue(app.buttons["post-send"].waitForExistence(timeout: 5))
    XCTAssertFalse(app.descendants(matching: .any)["post-delete"].exists, "the link shown again")
  }

  /// With accounts off on the site, a page offers no posting.
  func testNoPostingWithAccountsOff() {
    let app = launch(accounts: "off")
    openNeon(app)
    let first = app.descendants(matching: .any).matching(identifier: "comment").element(boundBy: 0)
    reveal(app, first)
    XCTAssertFalse(app.buttons["post-comment"].exists, "posting offered with accounts off")
    XCTAssertFalse(app.buttons["post-photo"].exists)
  }

  // MARK: Helpers

  private func launch(accounts: String = "on", _ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fake-accounts", accounts, "-reset-fake-server"] + more
    app.launch()
    return app
  }

  private func openNeon(_ app: XCUIApplication) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("ca neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no Cá neon")
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the fish isn't drawn by the app")
  }

  /// The page's post button, then the sign-in it asks for first: the form, signed in.
  private func signInToPost(_ app: XCUIApplication, _ button: String) {
    let post = app.buttons[button]
    reveal(app, post)
    post.tap()
    XCTAssertTrue(app.staticTexts["Đăng nhập tài khoản aquatome.com để bình luận và gửi ảnh."].waitForExistence(timeout: 5), "not asked to sign in")
    app.descendants(matching: .any)["apple-sign-in"].firstMatch.tap()
    XCTAssertTrue(app.buttons["post-send"].waitForExistence(timeout: 10), "the sign-in didn't open the form")
  }

  /// The consent box ticked: its switch, not its words.
  private func consent(_ app: XCUIApplication) {
    let box = app.switches["post-consent"]
    for _ in 0..<4 where !box.isHittable { app.swipeUp() }
    box.switches.firstMatch.exists ? box.switches.firstMatch.tap() : box.coordinate(withNormalizedOffset: CGVector(dx: 0.95, dy: 0.5)).tap()
    XCTAssertEqual(box.value as? String, "1", "consent not ticked")
  }

  /// Scrolled into view: the page is longer than the screen.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    for _ in 0..<10 where !(e.exists && e.isHittable) { app.swipeUp() }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
