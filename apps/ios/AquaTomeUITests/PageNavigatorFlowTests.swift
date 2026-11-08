import XCTest

/// The owner's trial of a way round a long page (PageNavigator), on the fixed handbook's fish, in v1's look (`-v2 NO`,
/// whichever is the default; in v2 a fish opens v2's own page, and the trial is on the pages v1 draws): nothing of it for anyone
/// else; for the owner, chosen in the ⋯ menu, the title's list of parts, and the rail's tab, which catches an ordinary
/// drag (80 points a second, what the first version never caught) and leaves a quick swipe to scroll the page.
final class PageNavigatorFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAReaderHasNoTrialEvenWithTheSettingOn() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-v2", "NO", "-reset-defaults", "-fixed-handbook",
                           "-page-navigator-trial", "rail", "-page-rail-stays"]
    app.launchForFlow()
    openFish(app)
    app.swipeUp()
    XCTAssertFalse(title(app).exists, "a title for a reader")
    XCTAssertFalse(rail(app).exists, "a rail for a reader")
    app.buttons["page-actions"].tap()
    XCTAssertTrue(app.buttons["Mở trong trình duyệt"].waitForExistence(timeout: 5), "no menu")
    XCTAssertFalse(app.buttons["Chỉ tiêu đề"].exists, "the trial in a reader's menu")
  }

  func testTheOwnerChoosesATrialAndGoesToAPartFromTheTitle() {
    let app = owner()
    openFish(app)
    XCTAssertFalse(title(app).exists, "a title before the trial is chosen")
    choose(app, "Chỉ tiêu đề")
    XCTAssertTrue(title(app).waitForExistence(timeout: 5), "no title")
    XCTAssertTrue(title(app).label.contains("Mục lục"), title(app).label)
    title(app).tap()
    let parts = app.buttons.matching(identifier: "page-navigator-part")
    XCTAssertTrue(parts.firstMatch.waitForExistence(timeout: 5), "no list of parts")
    XCTAssertEqual(parts.firstMatch.label, "Ảnh, 3", "not the photos first, with how many")
    let part = parts.matching(NSPredicate(format: "label == 'Cho ăn gì?'")).firstMatch
    XCTAssertTrue(part.exists, "no part \(parts.count)")
    part.tap()
    let named = NSPredicate(format: "label CONTAINS 'Cho ăn gì?'")
    wait(for: [expectation(for: named, evaluatedWith: title(app))], timeout: 5)
    wait(for: [expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: app.staticTexts["Cho ăn gì?"].firstMatch)], timeout: 5)
    XCTAssertFalse(rail(app).exists, "a rail on the title alone")
  }

  func testTheTabCatchesAnOrdinaryDragAndAQuickSwipeScrollsThenOffScrollsAsBefore() {
    let app = owner("-page-navigator-trial", "rail", "-page-rail-stays")
    openFish(app)
    XCTAssertTrue(title(app).waitForExistence(timeout: 5), "no title")
    app.swipeUp()
    XCTAssertTrue(rail(app).waitForExistence(timeout: 5), "no rail")
    XCTAssertEqual(rail(app).value as? String, "0")

    // A touch that moves at once, at 80 points a second: caught, and the page goes part by part.
    let before = title(app).label
    drag(app, speed: XCUIGestureVelocity(80))
    wait(for: [expectation(for: NSPredicate(format: "value == '1'"), evaluatedWith: rail(app))], timeout: 5)
    XCTAssertNotEqual(title(app).label, before, "the page didn't move to another part")

    // A quick swipe that starts on the tab: not caught, the page scrolls.
    let held = title(app).label
    drag(app, up: true, speed: .fast)
    XCTAssertEqual(rail(app).value as? String, "1", "a swipe caught as a hold")
    XCTAssertNotEqual(title(app).label, held, "the swipe didn't scroll the page")

    // Elsewhere on the page, a touch scrolls straight away, and goes on doing so with the trial off.
    let scrolled = title(app).label
    app.swipeDown()
    app.swipeDown()
    XCTAssertNotEqual(title(app).label, scrolled, "the page doesn't scroll off the tab")
    choose(app, "Như hiện tại")
    // The rail goes at once; on a busy machine the page's long accessibility tree takes a few seconds to say so.
    wait(for: [expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: rail(app))], timeout: 15)
    // The scientific name, under the page's title only: the fish's name is also the bar's title once the page scrolls.
    let name = app.staticTexts["Paracheirodon innesi"].firstMatch
    repeatUntil(name.isHittable, times: 6) { app.swipeDown() }
    XCTAssertTrue(name.isHittable, "the page doesn't scroll back to its top once the trial is off")
    repeatUntil(!name.isHittable, times: 4) { app.swipeUp() }
    XCTAssertFalse(name.isHittable, "the page doesn't scroll once the trial is off")
  }

  /// For the design review: each state in the light, in the dark and at the largest text.
  func testShots() {
    for (look, more) in [("light", []), ("dark", ["-dark"]),
                         ("large", ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])] {
      var app = owner(more + ["-page-navigator-trial", "rail", "-page-rail-stays"])
      openFish(app)
      XCTAssertTrue(title(app).waitForExistence(timeout: 5), "no title")
      shot("top-\(look)")
      title(app).tap()
      XCTAssertTrue(app.buttons.matching(identifier: "page-navigator-part").firstMatch.waitForExistence(timeout: 5), "no list")
      shot("list-\(look)")
      app.buttons.matching(identifier: "page-navigator-part").element(boundBy: 3).tap()
      sleep(1)
      shot("moving-\(look)")
      app.terminate()
      app = owner(more + ["-page-navigator-trial", "rail", "-page-rail-stays", "-page-rail-held"])
      openFish(app)
      XCTAssertTrue(rail(app).waitForExistence(timeout: 5), "no rail")
      sleep(2)
      shot("held-\(look)")
      // Grabbed with a heading just under the bar, the bubble names the part the title names.
      let bubble = app.descendants(matching: .any)["page-rail-bubble"].firstMatch
      XCTAssertTrue(bubble.waitForExistence(timeout: 5), "no bubble")
      XCTAssertTrue(title(app).label.contains(bubble.label), "the bubble says \(bubble.label), the title \(title(app).label)")
      app.terminate()
    }
  }

  private func shot(_ name: String) {
    let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    a.name = "shot-navigator-\(name)"
    a.lifetime = .keepAlways
    add(a)
  }

  private func title(_ app: XCUIApplication) -> XCUIElement { app.descendants(matching: .any)["page-navigator-title"].firstMatch }
  private func rail(_ app: XCUIApplication) -> XCUIElement { app.descendants(matching: .any)["page-rail"].firstMatch }

  /// 120 points from the middle of the tab.
  private func drag(_ app: XCUIApplication, up: Bool = false, speed: XCUIGestureVelocity) {
    let f = rail(app).frame
    let origin = app.coordinate(withNormalizedOffset: .zero)
    let from = origin.withOffset(CGVector(dx: f.midX, dy: f.midY))
    let to = origin.withOffset(CGVector(dx: f.midX, dy: f.midY + (up ? -160 : 120)))
    from.press(forDuration: 0.01, thenDragTo: to, withVelocity: speed, thenHoldForDuration: 0.1)
  }

  private func choose(_ app: XCUIApplication, _ state: String) {
    app.buttons["page-actions"].tap()
    let row = app.buttons[state]
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no \(state) in the menu")
    row.tap()
  }

  private func openFish(_ app: XCUIApplication) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 10), "no search field")
    field.tap()
    field.typeText("ca neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no fish")
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 10), "the fish isn't drawn by the app")
  }

  /// Signed in as the owner, on Tìm.
  private func owner(_ more: String...) -> XCUIApplication { owner(more) }
  private func owner(_ more: [String]) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-v2", "NO", "-fixed-handbook", "-fake-accounts", "on", "-reset-defaults",
                           "-reset-fake-server", "-fake-owner", "ui-apple"] + more
    app.launchForFlow()
    app.openAccount()
    // The owner's row is what these need; at the largest text the sheet's status line is below the fold and not drawn.
    app.scrollToAndTap("apple-sign-in")
    XCTAssertTrue(app.descendants(matching: .any)["owner-dashboard"].waitForExistence(timeout: 20), "not the owner")
    app.closeAccount()
    return app
  }
}
