import XCTest

/// The app opened from a web page, as the site's "Mở trong ứng dụng" opens it (`aquatome://open?url=<a page>`), on the
/// fixed handbook: opening the app, a page it draws, once its index is read; while it runs, a tool's tab, a page it has
/// no screen for as its web page (stood in for: no test reaches aquatome.com), and a bare `aquatome://` back at the home;
/// another site's address changes nothing.
final class AppLinkFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testALinkFromAWebPageOpensThePageItNames() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-no-animations"]
    // Launched by the link (XCUIApplication.open launches the app anew, with its arguments).
    app.open(link("https://aquatome.com/vi/ca/ca-neon/"))
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 10), "the fish's page didn't open")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not the app's own page")

    // The rest while it runs, as a web page hands it a link.
    follow(app, link("https://aquatome.com/vi/cong-cu/den-chihiros/"))
    XCTAssertTrue(app.buttons["scan"].waitForExistence(timeout: 5), "the tool's link didn't open the Lights tab")

    follow(app, link("https://example.com/vi/ca/ca-neon/"))
    XCTAssertFalse(app.buttons["scan"].waitForNonExistence(timeout: 3), "another site's link left the Lights tab")

    // Not in the index: no screen of the app's.
    follow(app, link("https://aquatome.com/vi/gioi-thieu/"))
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "not the web page")
    XCTAssertTrue(app.webViews.staticTexts["/vi/gioi-thieu/"].waitForExistence(timeout: 15), "not the stand-in page")
    XCTAssertTrue(app.tabBars.buttons["Tìm"].isSelected, "the web page isn't on the Tìm tab")

    follow(app, URL(string: "aquatome://")!)
    // Back at the home's top (its search field tucked under the title, as after any page closed).
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForNonExistence(timeout: 5), "the web page stayed")
    XCTAssertTrue(app.navigationBars["Tìm"].exists, "not back at the home")
  }

  /// The site's button: the page's address, percent-encoded, after `url=`.
  private func link(_ page: String) -> URL {
    URL(string: "aquatome://open?url=" + page.addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!
  }

  /// A link opened by the system to the running app, past the system's "Open in AquaTome?" if it asks.
  private func follow(_ app: XCUIApplication, _ url: URL) {
    XCUIDevice.shared.system.open(url)
    let ask = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Open"]
    if ask.waitForExistence(timeout: 2) { ask.tap() }
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 5), "the app isn't in front")
  }
}
