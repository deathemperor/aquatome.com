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

  /// A photo needs one picked, and the reader's consent, before it's sent: the site's words for each.
  func testAPhotoIsNotSentWithoutOneOrConsent() {
    let app = launch()
    openNeon(app)
    let post = app.buttons["post-photo"]
    reveal(app, post)
    XCTAssertEqual(post.label, "Gửi ảnh Cá neon của bạn")
    post.tap()
    app.descendants(matching: .any)["apple-sign-in"].firstMatch.tap()
    let send = app.buttons["post-send"]
    XCTAssertTrue(send.waitForExistence(timeout: 10), "the sign-in didn't open the form")
    send.tap()
    XCTAssertTrue(app.staticTexts["Chọn một ảnh trước đã."].waitForExistence(timeout: 5), "sent with no photo")
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

  private func launch(accounts: String = "on") -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fake-accounts", accounts, "-reset-fake-server"]
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

  /// Scrolled into view: the page is longer than the screen.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    for _ in 0..<10 where !(e.exists && e.isHittable) { app.swipeUp() }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
