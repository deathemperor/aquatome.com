import XCTest

/// The fish-ID tool as the app's own screen, on the stand-in server (no network): opened from the handbook's tool, a
/// photo sent whole or with one fish boxed, as the reader's account; the guesses as the site shows them, each page
/// opening in the app; signed out, the sign-in first; the account's day and the site's day used up, accounts off and no
/// network, each said in the site's words; a long wait said as it goes, the photo kept as it was while it's identified;
/// back from a guess's page, the guesses and the box as they were. The photo is picked as the library's picker picks one
/// (`-picked-photo`). The stand-in's first guess names the photo it got (its width × height), so a flow tells a box from
/// the whole photo.
final class FishIdFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// The tool opens the app's screen, not the site's page; a photo picked is shown, sent whole (1600 × 1200 shrunk to the
  /// site's 1024 × 768), and its guesses read as the site's: how sure, the name, why, and a page or that there's none.
  func testAPhotoPickedIsSentAndItsGuessesShowAsTheSitesDo() {
    let app = launch("-picked-photo")
    openTool(app)
    signIn(app)
    let photo = element(app, "fish-id-photo")
    XCTAssertTrue(photo.waitForExistence(timeout: 5), "the photo picked isn't shown")
    XCTAssertEqual(photo.label, "Ảnh bạn chọn")
    send(app)
    let guesses = app.descendants(matching: .any).matching(identifier: "fish-id-guess")
    let first = guesses.element(boundBy: 0)
    XCTAssertTrue(first.waitForExistence(timeout: 10), "no guesses")
    for part in ["Gần như chắc chắn", "Cá neon", "Paracheirodon innesi", "Ảnh nhận được: 1024×768."] {
      XCTAssertTrue(first.label.contains(part), "\(part) not in \(first.label)")
    }
    let second = guesses.element(boundBy: 1)
    reveal(app, second)
    XCTAssertTrue(second.label.hasPrefix("Có thể, Green neon tetra"), second.label)
    XCTAssertTrue(app.staticTexts["Chưa có trong cẩm nang."].exists, "a guess the handbook has no page for isn't said so")
  }

  /// The privacy policy opens the site's page in the browser, as the site's pages about itself do (PageRoute), and the
  /// screen stays as it was: no screen pushed in the app, which that page would leave blank.
  func testThePrivacyPolicyOpensInTheBrowserAndTheScreenStays() {
    let app = launch()
    openTool(app)
    let policy = app.buttons["Chính sách bảo mật"]
    repeatUntil(policy.exists && policy.isHittable, times: 6) { app.swipeUp() }
    policy.tap()
    let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    XCTAssertTrue(safari.wait(for: .runningForeground, timeout: 15), "not the browser")
    app.activate()
    XCTAssertTrue(app.navigationBars["Đây là cá gì?"].waitForExistence(timeout: 5), "a screen pushed over the tool")
    XCTAssertFalse(app.descendants(matching: .any)["page"].exists, "a web screen in the app")
  }

  /// A fish boxed on the photo: only that part goes, cut from the photo at full size: about half of its 1600 × 1200 each
  /// way, not the whole photo shrunk (1024 × 768), nor a part of that (about 512 wide).
  func testAFishBoxedSendsOnlyThatPart() {
    let app = launch("-picked-photo")
    openTool(app)
    signIn(app)
    tap(app, "fish-id-box")
    XCTAssertEqual(element(app, "fish-id-box-said").label, "Kéo một khung quanh con cá trên ảnh.")
    let photo = element(app, "fish-id-photo")
    reveal(app, photo)
    photo.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.25))
      .press(forDuration: 0.2, thenDragTo: photo.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.75)))
    let said = element(app, "fish-id-box-said")
    XCTAssertTrue(said.waitForLabel("Sẽ gửi phần trong khung. Kéo lại để khoanh chỗ khác.", timeout: 5), "not boxed: \(said.label)")
    send(app)
    let first = app.descendants(matching: .any).matching(identifier: "fish-id-guess").element(boundBy: 0)
    XCTAssertTrue(first.waitForExistence(timeout: 10), "no guesses")
    let got = first.label.firstMatch(of: /Ảnh nhận được: (\d+)×(\d+)/)
    let (w, h) = (got.flatMap { Int($0.1) } ?? 0, got.flatMap { Int($0.2) } ?? 0)
    // About, not exactly: the photo's frame as the test sees it is its row's, a few points larger than the photo.
    XCTAssertTrue((640...960).contains(w) && (480...720).contains(h), "not the part boxed: \(first.label)")
  }

  /// "Xem hồ sơ" opens the guess's page as the app draws it; back, the guesses are still there, and a guess the
  /// handbook has no page for lists its genus's pages, which open in the app too.
  func testAGuessAndItsGenusOpenTheirPagesInTheApp() {
    let app = launch("-picked-photo")
    openTool(app)
    signIn(app)
    send(app)
    let open = element(app, "fish-id-open")
    XCTAssertTrue(open.waitForExistence(timeout: 10), "no page to open")
    XCTAssertEqual(open.label, "Xem hồ sơ Cá neon")
    reveal(app, open)
    open.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the page didn't open")
    XCTAssertTrue(element(app, "native-page").waitForExistence(timeout: 5), "not drawn by the app")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let genus = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "1 loài Paracheirodon có trong cẩm nang")).firstMatch
    reveal(app, genus)
    genus.tap()
    let page = element(app, "fish-id-genus-page")
    XCTAssertTrue(page.waitForExistence(timeout: 5), "the genus's pages aren't listed")
    XCTAssertTrue(page.label.hasPrefix("Cá neon"), page.label)
    reveal(app, page)
    page.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the genus's page didn't open")
  }

  /// Signed out, the screen says why it needs the account and offers the sign-in; signed in, the tool takes its place
  /// with the photo picked before.
  func testSignedOutTheScreenOffersTheSignInThenCarriesOn() {
    let app = launch("-picked-photo")
    openTool(app)
    XCTAssertTrue(element(app, "fish-id-sign-in").waitForExistence(timeout: 5), "not asked to sign in")
    XCTAssertEqual(element(app, "fish-id-sign-in").label, "Đăng nhập tài khoản aquatome.com để nhận diện cá qua ảnh.")
    XCTAssertFalse(element(app, "fish-id-send").exists, "the tool offered signed out")
    element(app, "apple-sign-in").tap()
    XCTAssertTrue(element(app, "fish-id-send").waitForExistence(timeout: 10), "the sign-in didn't lead to the tool")
    XCTAssertTrue(element(app, "fish-id-photo").exists, "the photo picked before is gone")
  }

  /// The account's 10 for the day used: the site's words, with its number.
  func testTheAccountsDayUsedUpIsSaid() {
    let app = launch("-picked-photo", "-fish-id-used", "10")
    openTool(app)
    signIn(app)
    send(app)
    XCTAssertTrue(element(app, "fish-id-said").waitForLabel("Bạn đã dùng hết 10 lượt nhận diện hôm nay. Quay lại ngày mai nhé.", timeout: 10),
                  element(app, "fish-id-said").label)
    XCTAssertFalse(element(app, "fish-id-guess").exists)
  }

  /// The site's own day used up, for everyone: the site's words.
  func testTheSitesDayUsedUpIsSaid() {
    let app = launch("-picked-photo", "-fish-id-busy")
    openTool(app)
    signIn(app)
    send(app)
    XCTAssertTrue(element(app, "fish-id-said").waitForLabel("Hôm nay công cụ đã hết lượt cho mọi người. Quay lại ngày mai nhé.", timeout: 10),
                  element(app, "fish-id-said").label)
  }

  /// Accounts off on the site: said so, with no sign-in and no tool.
  func testWithAccountsOffTheScreenSaysSo() {
    let app = launch("-picked-photo", accounts: "off")
    openTool(app)
    XCTAssertTrue(element(app, "fish-id-said").waitForLabel("Tài khoản aquatome.com đang tạm tắt, nên ứng dụng chưa nhận diện được ảnh lúc này.", timeout: 5),
                  element(app, "fish-id-said").label)
    XCTAssertFalse(element(app, "apple-sign-in").exists)
    XCTAssertFalse(element(app, "fish-id-send").exists)
  }

  /// No network: said so, with a way to try again.
  func testWithNoNetworkTheScreenSaysSo() {
    let app = launch("-server-offline")
    openTool(app)
    XCTAssertTrue(element(app, "fish-id-said").waitForLabel("Không có mạng: thử lại khi có mạng.", timeout: 5), element(app, "fish-id-said").label)
    XCTAssertTrue(app.buttons["Thử lại"].exists)
    XCTAssertFalse(element(app, "fish-id-send").exists)
  }

  /// A run the Worker takes long over: past the first seconds the screen says it may take a minute, and with no answer
  /// in the request's time, the site's words for a run that failed, not "no network". Meanwhile the photo can't be
  /// changed (the library, the box), so the answer comes in under the photo it's for.
  func testWhileWaitingThePhotoStaysAndALongWaitIsSaid() {
    let app = launch("-picked-photo", "-fish-id-slow")
    openTool(app)
    signIn(app)
    send(app)
    // At once, in the button's place: a spinner and what it's doing (the words change at 10 s).
    XCTAssertTrue(element(app, "fish-id-said").waitForLabel("Đang nhận diện… thường mất vài giây.", timeout: 5), element(app, "fish-id-said").saying)
    // Back to the top, where the photo's controls are.
    for _ in 0..<3 { app.swipeDown() }
    let library = element(app, "fish-id-library"), box = element(app, "fish-id-box")
    XCTAssertTrue(library.waitForExistence(timeout: 5), "the photo's controls aren't shown")
    XCTAssertFalse(library.isEnabled, "another photo can be picked while one is identified")
    // Nothing greyed out that reads as broken: no box to change, and in the button's place a spinner and what it's doing.
    XCTAssertFalse(box.exists, "the photo can be boxed while it's identified")
    XCTAssertFalse(element(app, "fish-id-send").exists, "a greyed-out button while it's identified")
    let said = element(app, "fish-id-said")
    reveal(app, said)
    // The stand-in holds the request 40 s: the line changes at 10.
    XCTAssertTrue(said.waitForLabel("Vẫn đang nhận diện… có thể mất đến một phút.", timeout: 30), said.saying)
    XCTAssertTrue(said.waitForLabel("Chưa nhận diện được lúc này. Thử lại sau ít phút nhé.", timeout: 45), said.saying)
    XCTAssertTrue(element(app, "fish-id-send").isEnabled, "can't send again")
    XCTAssertTrue(box.exists && box.isEnabled, "the box stays off")
    reveal(app, library, up: true)
    XCTAssertTrue(library.isEnabled, "the library stays off")
  }

  /// While it identifies, the end of the screen (the tips' last line) still comes up above the tab bar.
  func testWhileItIdentifiesTheScreensEndIsAboveTheTabBar() {
    let app = launch("-picked-photo", "-fish-id-slow")
    openTool(app)
    signIn(app)
    let bar = app.tabBars.firstMatch
    XCTAssertTrue(bar.waitForExistence(timeout: 5), "no tab bar")
    send(app)
    XCTAssertTrue(element(app, "fish-id-said").waitForExistence(timeout: 5), "not identifying")
    app.endsAboveTheTabBar("fish ID while it identifies")
    let last = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Công cụ chỉ đoán từ ảnh'")).firstMatch
    XCTAssertTrue(last.exists && last.frame.maxY <= bar.frame.minY + 0.5, "the tips' last line isn't above the bar: \(last.frame) \(bar.frame)")
  }

  /// Back from a guess's page, the guesses and the box are as they were: the photo isn't read again, which would take
  /// them away and cost another identification to get them back.
  func testBackFromAGuesssPageTheGuessesAndTheBoxStay() {
    let app = launch("-picked-photo")
    openTool(app)
    signIn(app)
    tap(app, "fish-id-box")
    let photo = element(app, "fish-id-photo")
    reveal(app, photo)
    photo.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.25))
      .press(forDuration: 0.2, thenDragTo: photo.coordinate(withNormalizedOffset: CGVector(dx: 0.75, dy: 0.75)))
    let boxed = "Sẽ gửi phần trong khung. Kéo lại để khoanh chỗ khác."
    XCTAssertTrue(element(app, "fish-id-box-said").waitForLabel(boxed, timeout: 5), "not boxed")
    send(app)
    let first = app.descendants(matching: .any).matching(identifier: "fish-id-guess").element(boundBy: 0)
    XCTAssertTrue(first.waitForExistence(timeout: 10), "no guesses")
    let guess = first.label
    let open = element(app, "fish-id-open")
    reveal(app, open)
    open.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the page didn't open")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(element(app, "fish-id").waitForExistence(timeout: 5), "not back on the fish-ID screen")
    XCTAssertTrue(first.waitForExistence(timeout: 5), "back from the page, the guesses are gone")
    XCTAssertEqual(first.label, guess)
    let said = element(app, "fish-id-box-said")
    reveal(app, said, up: true)
    XCTAssertEqual(said.label, boxed, "back from the page, the box is gone")
  }

  /// A session the Worker refuses while the account still holds it: the screen says it didn't work, not nothing.
  func testARefusedSessionWhileStillSignedInIsSaid() {
    let app = launch("-picked-photo", "-fish-id-session-refused")
    openTool(app)
    signIn(app)
    send(app)
    XCTAssertTrue(element(app, "fish-id-said").waitForLabel("Chưa nhận diện được lúc này. Thử lại sau ít phút nhé.", timeout: 10),
                  element(app, "fish-id-said").saying)
    XCTAssertTrue(element(app, "fish-id-send").exists, "the tool went")
  }

  // MARK: Helpers

  private func launch(_ more: String..., accounts: String = "on") -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fake-accounts", accounts,
                           "-reset-fake-server"] + more
    app.launchForFlow()
    return app
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

  /// The handbook's fish-ID tool, found by its page's words: the app's own screen opens.
  private func openTool(_ app: XCUIApplication) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("nhan dien")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Đây là cá gì?'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no fish-ID tool")
    row.tap()
    XCTAssertTrue(element(app, "fish-id").waitForExistence(timeout: 5), "not the app's fish-ID screen")
    XCTAssertFalse(element(app, "page").exists, "the site's page opened")
  }

  private func signIn(_ app: XCUIApplication) {
    let apple = element(app, "apple-sign-in")
    XCTAssertTrue(apple.waitForExistence(timeout: 5), "no sign-in")
    apple.tap()
    XCTAssertTrue(element(app, "fish-id-send").waitForExistence(timeout: 10), "the sign-in didn't lead to the tool")
  }

  private func tap(_ app: XCUIApplication, _ id: String) {
    let e = element(app, id)
    reveal(app, e)
    e.tap()
  }

  /// "Nhận diện", once the photo is ready to go.
  private func send(_ app: XCUIApplication) {
    let send = element(app, "fish-id-send")
    reveal(app, send)
    XCTAssertTrue(send.waitForEnabled(timeout: 5), "nothing to send")
    send.tap()
  }

  /// Scrolled into view a little at a time (down the screen, or `up` it), without a fling, by the screen's edge: while
  /// boxing, a drag on the photo draws a box.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement, up: Bool = false) {
    let (from, to) = up ? (0.4, 0.7) : (0.7, 0.4)
    repeatUntil(e.exists && e.isHittable, times: 12) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: from))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: to)), withVelocity: .fast,
               thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}

private extension XCUIElement {
  func waitForLabel(_ label: String, timeout: TimeInterval) -> Bool {
    XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", label), object: self)], timeout: timeout) == .completed
  }
  /// Its words, or that nothing is said.
  var saying: String { exists ? label : "nothing said" }
  func waitForEnabled(timeout: TimeInterval) -> Bool {
    XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == true"), object: self)], timeout: timeout) == .completed
  }
}
