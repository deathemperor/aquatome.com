import XCTest

/// The app opened from a web page, as the site's "Mở trong ứng dụng" opens it (`aquatome://open?url=<a page>`, a
/// Vietnamese page at the site's root, as the site serves it), on the fixed handbook: opening the app, a page it draws,
/// once its index is read (`-index-later`); while it runs, a tool's tab, a page it has no screen for as its web page
/// (stood in for: no test reaches aquatome.com), and a bare `aquatome://` back at the home; another site's address
/// changes nothing.
final class AppLinkFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testALinkFromAWebPageOpensThePageItNames() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-v2", "NO", "-reset-defaults", "-fixed-handbook", "-index-later",
                           "-no-animations"]
    // Launched by the link (XCUIApplication.open launches the app anew, with its arguments), before its index is read.
    app.open(link("https://aquatome.com/ca/ca-neon/"))
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 10), "the fish's page didn't open")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not the app's own page")

    // The rest while it runs, as a web page hands it a link.
    follow(app, link("https://aquatome.com/cong-cu/den-chihiros/"))
    XCTAssertTrue(app.buttons["scan"].waitForExistence(timeout: 5), "the tool's link didn't open the Lights tab")

    follow(app, link("https://example.com/ca/ca-neon/"))
    XCTAssertFalse(app.buttons["scan"].waitForNonExistence(timeout: 3), "another site's link left the Lights tab")

    // Not in the index: no screen of the app's. (Not the site's pages about itself, which open in the browser, #566.)
    follow(app, link("https://aquatome.com/tim-kiem/"))
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "not the web page")
    XCTAssertTrue(app.webViews.staticTexts["/tim-kiem/"].waitForExistence(timeout: 15), "not the stand-in page")
    XCTAssertTrue(app.tabBars.buttons["Tìm"].isSelected, "the web page isn't on the Tìm tab")

    follow(app, URL(string: "aquatome://")!)
    // Back at the home's top (its search field tucked under the title, as after any page closed).
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForNonExistence(timeout: 5), "the web page stayed")
    XCTAssertTrue(app.navigationBars["Tìm"].exists, "not back at the home")
  }

  /// A link that comes while the Tài khoản sheet is open (back from its about pages in the browser): the sheet closes,
  /// and the page opens under it.
  func testALinkWithTheAccountSheetOpenClosesIt() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-v2", "NO", "-reset-defaults", "-fixed-handbook", "-no-animations"]
    app.launch()
    app.openAccount()
    follow(app, link("https://aquatome.com/ca/ca-neon/"))
    XCTAssertTrue(app.buttons["account-done"].waitForNonExistence(timeout: 5), "the sheet stayed over the page")
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 10), "the fish's page didn't open")
  }

  /// The site's button: the page's address, percent-encoded, after `url=`.
  private func link(_ page: String) -> URL {
    URL(string: "aquatome://open?url=" + page.addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!
  }

  /// A link opened by the system to the running app, past the system's question to open it, if it asks (its last button).
  private func follow(_ app: XCUIApplication, _ url: URL) {
    XCUIDevice.shared.system.open(url)
    let ask = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
    if ask.waitForExistence(timeout: 2) { ask.buttons.element(boundBy: ask.buttons.count - 1).tap() }
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 5), "the app isn't in front")
  }
}
