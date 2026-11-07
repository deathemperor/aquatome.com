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

  /// Flung to the end of the screen, until its lowest words stop moving, then whether they end above the tab bar: above
  /// its top at its full height (`fullBarTop`, read before any scroll) and above it as it is now, shrunk or not.
  func endsAboveTheTabBar(_ fullBarTop: CGFloat, _ screen: String, file: StaticString = #filePath, line: UInt = #line) {
    var low = -1.0
    for _ in 0..<30 {
      swipeUp()
      _ = XCTWaiter.wait(for: [XCTestExpectation(description: "still")], timeout: 0.8)
      let now = lowestWords()
      if abs(now - low) < 0.5 { break }
      low = now
    }
    let bar = tabBars.firstMatch
    XCTAssertLessThanOrEqual(lowestWords(), fullBarTop + 0.5, "\(screen): its last words end under the tab bar's top", file: file, line: line)
    if bar.exists { XCTAssertLessThanOrEqual(lowestWords(), bar.frame.minY + 0.5, "\(screen): its last words end under the shrunk bar", file: file, line: line) }
  }

  /// The bottom of the lowest words on screen, but the tab bar's own.
  private func lowestWords() -> CGFloat {
    let screen = windows.firstMatch.frame
    let bar = Set(tabBars.firstMatch.descendants(matching: .any).allElementsBoundByIndex.map { "\($0.frame)" })
    return staticTexts.allElementsBoundByIndex.map(\.frame)
      .filter { !$0.isEmpty && $0.minY < screen.maxY && $0.maxY > screen.minY && !bar.contains("\($0)") }
      .map(\.maxY).max() ?? 0
  }
}
