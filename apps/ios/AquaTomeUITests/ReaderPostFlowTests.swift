import XCTest

/// A reader's comment or photo posted to a page from the app as their aquatome.com account, on the stand-in server
/// (no network): signed out, the sign-in comes first. And another reader's, reported or its poster blocked (App Store
/// guideline 1.2), signed in or not.
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
    // Others' to report or block; not the reader's own.
    XCTAssertTrue(readerMenu(app, "Tùy chọn cho bình luận của Lan").exists, "no way to report another's comment")
    XCTAssertFalse(readerMenu(app, "Tùy chọn cho bình luận của Hà").exists, "a way to report the reader's own comment")
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
    app.openTab("Bể của tôi")
    app.openTab("Tìm")
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

  /// A photo sent with consent: received for moderation, the photo sent still shown, and the link that takes it back
  /// shown this once, to keep: a tap on it doesn't open the page that removes the photo (a reader took the link for
  /// their photo).
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
    XCTAssertTrue(app.images["post-sent"].exists, "the photo sent not shown")
    XCTAssertEqual(app.images["post-sent"].label, "Ảnh của Hà")
    XCTAssertEqual(link.elementType, .staticText, "the take-back link is a link to follow")
    link.tap()
    app.buttons["Đóng"].tap()
    // The fish's page, not the page that removes the photo, pushed behind the form.
    XCTAssertTrue(app.buttons["post-photo"].waitForExistence(timeout: 5), "a tap on the link opened a page behind the form")
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

  // MARK: Reporting and blocking

  /// Signed out, a comment reported is sent as the site's page sends it, thanked for, and kept off this phone from then
  /// on, past a relaunch; the others stay.
  func testAReportedCommentIsHiddenFromThenOn() {
    var app = launch()
    openNeon(app)
    act(app, "Tùy chọn cho bình luận của Lan", "Báo cáo")
    XCTAssertTrue(app.staticTexts["Báo cáo bình luận này?"].waitForExistence(timeout: 5), "not asked why")
    app.buttons["Spam hoặc quảng cáo"].tap()
    thanked(app)
    XCTAssertTrue(gone(comment(app, "Lan")), "the reported comment still shows")
    XCTAssertTrue(comment(app, "Minh").exists, "the other comment went too")
    let note = app.descendants(matching: .any)["readers-hidden"]
    XCTAssertTrue(note.waitForExistence(timeout: 5), "not said what's hidden")
    XCTAssertEqual(note.label, "Đang ẩn 1 mục bạn đã chặn hoặc báo cáo.")
    app.terminate()
    app = launch(reset: false)
    openNeon(app)
    reveal(app, comment(app, "Minh"))
    XCTAssertFalse(comment(app, "Lan").exists, "the reported comment is back after a relaunch")
  }

  /// A reader's photo reported from its viewer, with no reason given: the viewer closes on the thanks, the photo gone
  /// from the page. The page's last one too, though its row goes with it; the page then says what it hides.
  func testAReadersPhotoIsReportedFromItsViewer() {
    let app = launch()
    openNeon(app)
    let photo = app.buttons["Ảnh của Lan"]
    reveal(app, photo)
    photo.tap()
    let menu = readerMenu(app, "Tùy chọn cho ảnh của Lan")
    XCTAssertTrue(menu.waitForExistence(timeout: 5), "no options in the photo's viewer")
    menu.tap()
    app.buttons["Báo cáo"].tap()
    XCTAssertTrue(app.staticTexts["Báo cáo ảnh này?"].waitForExistence(timeout: 5), "not asked why")
    app.buttons["Lý do khác"].tap()
    thanked(app)
    XCTAssertTrue(gone(app.descendants(matching: .any)["gallery"]), "the viewer stayed open")
    XCTAssertFalse(app.buttons["Ảnh của Lan"].exists, "the reported photo still shows")
    let last = app.buttons["Ảnh của Minh"]
    XCTAssertTrue(last.exists, "the other photo went too")
    last.tap()
    let menu2 = readerMenu(app, "Tùy chọn cho ảnh của Minh")
    XCTAssertTrue(menu2.waitForExistence(timeout: 5), "no options in the photo's viewer")
    menu2.tap()
    app.buttons["Báo cáo"].tap()
    XCTAssertTrue(app.buttons["Spam hoặc quảng cáo"].waitForExistence(timeout: 5), "not asked why")
    app.buttons["Spam hoặc quảng cáo"].tap()
    // The page's last photo: the thanks still shows in its viewer, and the row goes as it closes.
    thanked(app)
    XCTAssertTrue(gone(app.descendants(matching: .any)["gallery"]), "the viewer stayed open")
    XCTAssertFalse(app.buttons["Ảnh của Minh"].exists, "the reported photo still shows")
    let note = app.descendants(matching: .any)["readers-hidden"]
    reveal(app, note)
    XCTAssertEqual(note.label, "Đang ẩn 2 mục bạn đã chặn hoặc báo cáo.")
    XCTAssertFalse(app.staticTexts["Chưa có ảnh nào. Bạn nuôi Cá neon? Gửi một tấm ảnh cho mọi người cùng xem."].exists, "said there are none")
  }

  /// Blocking who wrote a comment hides everything they posted, their photos too, until they're let back from the page.
  func testABlockedPosterIsHiddenUntilLetBackFromThePage() {
    let app = launch()
    openNeon(app)
    act(app, "Tùy chọn cho bình luận của Lan", "Chặn người này")
    XCTAssertTrue(app.staticTexts["Chặn Lan?"].waitForExistence(timeout: 5), "not asked")
    app.buttons["Chặn"].tap()
    XCTAssertTrue(gone(comment(app, "Lan")), "the blocked poster's comment still shows")
    XCTAssertFalse(app.buttons["Ảnh của Lan"].exists, "the blocked poster's photo still shows")
    XCTAssertTrue(comment(app, "Minh").exists && app.buttons["Ảnh của Minh"].exists, "another's went too")
    let note = app.descendants(matching: .any)["readers-hidden"]
    reveal(app, note)
    XCTAssertEqual(note.label, "Đang ẩn 2 mục bạn đã chặn hoặc báo cáo.")
    app.buttons["blocked-open"].tap()
    let unblock = app.buttons["unblock"]
    XCTAssertTrue(unblock.waitForExistence(timeout: 5), "no one to unblock")
    XCTAssertEqual(unblock.label, "Bỏ chặn Lan")
    unblock.tap()
    app.buttons["Đóng"].tap()
    XCTAssertTrue(comment(app, "Lan").waitForExistence(timeout: 5), "let back, still hidden")
    XCTAssertTrue(app.buttons["Ảnh của Lan"].exists, "let back, their photo still hidden")
  }

  /// The posters blocked are listed on the Tài khoản tab, under the sign-in, each to let back; not in the tanks tab.
  func testABlockedPosterIsListedInTheAccountTab() {
    let app = launch()
    openNeon(app)
    act(app, "Tùy chọn cho bình luận của Minh", "Chặn người này")
    let block = app.buttons["Chặn"]
    XCTAssertTrue(block.waitForExistence(timeout: 5), "not asked")
    block.tap()
    XCTAssertTrue(gone(comment(app, "Minh")), "the blocked poster's comment still shows")
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "not the tanks tab")
    let header = app.descendants(matching: .any)["blocked-header"]
    XCTAssertFalse(header.exists, "the blocked list in the tanks tab")
    app.openTab("Tài khoản")
    for _ in 0..<4 where !header.exists { app.swipeUp() }
    XCTAssertTrue(header.waitForExistence(timeout: 5), "no blocked list on the Tài khoản tab")
    let unblock = app.buttons["unblock"]
    XCTAssertEqual(unblock.label, "Bỏ chặn Minh")
    unblock.tap()
    XCTAssertTrue(gone(header), "the list stayed with no one in it")
    app.openTab("Tìm")
    XCTAssertTrue(comment(app, "Minh").waitForExistence(timeout: 5), "let back, still hidden")
  }

  /// AquaTome's contact page is a tap away on the Tìm home, signed out with accounts off.
  func testTheContactPageIsReachableSignedOut() {
    let app = launch(accounts: "off")
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 5), "no search field")
    let contact = app.descendants(matching: .any)["contact"]
    for _ in 0..<12 where !(contact.exists && contact.isHittable) { app.swipeUp() }
    XCTAssertTrue(contact.exists && contact.isHittable, "no contact link on the home")
    XCTAssertEqual(contact.label, "Liên hệ")
  }

  // MARK: Helpers

  private func launch(accounts: String = "on", reset: Bool = true, _ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN"] + (reset ? ["-reset-defaults"] : [])
      + ["-fixed-handbook", "-fake-accounts", accounts, "-reset-fake-server"] + more
    app.launch()
    return app
  }

  /// A comment on the page by `name`.
  private func comment(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "comment").matching(NSPredicate(format: "label BEGINSWITH %@", "\(name) ")).firstMatch
  }

  /// A "…" by what VoiceOver says of it (each names its poster): a menu in a toolbar may not carry its identifier.
  private func readerMenu(_ app: XCUIApplication, _ label: String) -> XCUIElement { app.buttons[label].firstMatch }

  /// A comment's "…", then one of its choices.
  private func act(_ app: XCUIApplication, _ menu: String, _ choice: String) {
    let button = readerMenu(app, menu)
    reveal(app, button)
    button.tap()
    let item = app.buttons[choice]
    XCTAssertTrue(item.waitForExistence(timeout: 5), "no \(choice) in \(menu)")
    item.tap()
  }

  /// The report received, and the thanks closed.
  private func thanked(_ app: XCUIApplication) {
    let thanks = app.alerts["Đã gửi báo cáo. Cảm ơn bạn."]
    XCTAssertTrue(thanks.waitForExistence(timeout: 5), "the report wasn't received")
    thanks.buttons["Đóng"].tap()
  }

  private func gone(_ e: XCUIElement) -> Bool {
    XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: e)], timeout: 5) == .completed
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
    // Its value follows the tap a moment later, as the switch slides (read at once, it failed on #450's run).
    let on = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == '1'"), object: box)
    XCTAssertEqual(XCTWaiter().wait(for: [on], timeout: 3), .completed, "consent not ticked")
  }

  /// Scrolled into view half a screen at a time, without a fling, so no part is scrolled past: the readers' part sits
  /// mid-page, before the breeds and the sources.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    for _ in 0..<24 where !(e.exists && e.isHittable) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .fast,
               thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
