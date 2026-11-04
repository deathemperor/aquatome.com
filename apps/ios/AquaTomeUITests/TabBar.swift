import XCTest

extension XCUIApplication {
  /// Scrolling down a page shrinks the tab bar to the open tab's button alone (iOS 26); a tap on it brings the others
  /// back without leaving the page. Not while something covers it (a dialog): a tap there would close that instead.
  func showTabs() {
    let shrunk = tabBars.buttons
    if shrunk.count == 1, shrunk.firstMatch.isHittable { shrunk.firstMatch.tap() }
  }

  /// A tab by its name, whether or not a page scrolled down shrank the tab bar.
  func openTab(_ name: String, file: StaticString = #filePath, line: UInt = #line) {
    showTabs()
    let tab = tabBars.buttons[name]
    XCTAssertTrue(tab.waitForExistence(timeout: 5), "no tab \(name)", file: file, line: line)
    tab.tap()
  }
}
