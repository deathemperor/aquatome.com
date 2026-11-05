import XCTest

/// The app's icons (AppIconPicker, opened here by `-app-icons` until the Tài khoản tab has its row): every icon listed is
/// in the app and draws from its own image, and one can be chosen, then the default again.
final class AppIconFlowTests: XCTestCase {
  func testEveryIconIsInTheAppAndOneCanBeChosen() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-app-icons"]
    app.launchForFlow()
    let standard = app.buttons["app-icon-default"]
    XCTAssertTrue(standard.waitForExistence(timeout: 10), "the picker didn't open")
    // Listed but not in the app, in the app but not listed, or no preview to draw (AppIconChoice.problems).
    let problems = app.staticTexts["app-icons-problems"]
    XCTAssertFalse(problems.exists, problems.exists ? problems.label : "")

    // A retried run may find the icon it chose last time.
    if !standard.isSelected { choose(standard, in: app) }
    let fish = app.buttons["app-icon-bubs-aqua"]
    XCTAssertFalse(fish.isSelected)
    choose(fish, in: app)
    XCTAssertFalse(standard.isSelected, "two icons ticked")
    choose(standard, in: app)
    XCTAssertFalse(fish.isSelected, "two icons ticked")
  }

  /// A tap on the icon, iOS's own alert confirming it, and the icon ticked.
  private func choose(_ icon: XCUIElement, in app: XCUIApplication) {
    icon.tap()
    let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
    let ours = app.alerts.firstMatch, system = springboard.alerts.firstMatch
    let shown = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in ours.exists || system.exists }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [shown], timeout: 10), .completed, "iOS didn't confirm the change")
    (ours.exists ? ours : system).buttons.firstMatch.tap()
    let ticked = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isSelected == true"), object: icon)
    XCTAssertEqual(XCTWaiter.wait(for: [ticked], timeout: 5), .completed, "\(icon.identifier) not ticked once chosen")
  }
}
