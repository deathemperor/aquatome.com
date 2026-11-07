import XCTest

extension XCUIApplication {
  /// Scrolling down a page shrinks the tab bar to the open tab's button alone (iOS 26); a tap on it brings the others
  /// back without leaving the page. Not while something covers it (a dialog): a tap there would close that instead.
  func showTabs() {
    let shrunk = tabBars.buttons
    if shrunk.count == 1, shrunk.firstMatch.isHittable { shrunk.firstMatch.tap() }
  }

  /// A tab by its name, whether or not a page scrolled down shrank the tab bar; the Tài khoản sheet closed first.
  func openTab(_ name: String, file: StaticString = #filePath, line: UInt = #line) {
    closeAccount()
    showTabs()
    let tab = tabBars.buttons[name]
    XCTAssertTrue(tab.waitForExistence(timeout: 5), "no tab \(name)", file: file, line: line)
    tab.tap()
  }

  /// The Tài khoản sheet, from the open tab's profile button (top right of its first screen), unless it's open already.
  func openAccount(file: StaticString = #filePath, line: UInt = #line) {
    let done = buttons["account-done"]
    if done.exists { return }
    let profile = buttons.matching(identifier: "profile").firstMatch
    XCTAssertTrue(profile.waitForExistence(timeout: 5), "no profile button", file: file, line: line)
    profile.tap()
    XCTAssertTrue(done.waitForExistence(timeout: 5), "the Tài khoản sheet didn't open", file: file, line: line)
  }

  /// The Tài khoản sheet closed, if it's open: back to the tab under it.
  func closeAccount() {
    let done = buttons["account-done"]
    guard done.exists else { return }
    done.tap()
    _ = done.waitForNonExistence(timeout: 5)
  }
}
