import XCTest

extension XCUIApplication {
  /// A tab by its name; the Tài khoản sheet closed first.
  func openTab(_ name: String, file: StaticString = #filePath, line: UInt = #line) {
    closeAccount()
    let tab = tabBars.buttons[name]
    XCTAssertTrue(tab.waitForExistence(timeout: 5), "no tab \(name)", file: file, line: line)
    tab.tap()
  }

  /// Flung to the end of the screen, until its lowest words stop moving, then whether they end above the tab bar.
  func endsAboveTheTabBar(_ screen: String, file: StaticString = #filePath, line: UInt = #line) {
    var low = -1.0
    for _ in 0..<30 {
      swipeUp()
      _ = XCTWaiter.wait(for: [XCTestExpectation(description: "still")], timeout: 0.8)
      let now = lowestWords()
      if abs(now - low) < 0.5 { break }
      low = now
    }
    let bar = tabBars.firstMatch
    XCTAssertTrue(bar.exists, "\(screen): no tab bar", file: file, line: line)
    XCTAssertLessThanOrEqual(lowestWords(), bar.frame.minY + 0.5, "\(screen): its last words end under the tab bar", file: file, line: line)
  }

  /// Whether what scrolls under the title stays out of sight behind it, the clock and the title.
  func titleReadsCleanly(_ screen: String, file: StaticString = #filePath, line: UInt = #line) {
    let seen = behindTheTitle()
    print("behind the title, \(screen): \(seen)")
    XCTAssertLessThan(seen, 0.05, "\(screen): what scrolls under the title shows behind it", file: file, line: line)
  }

  /// The spread of brightness, 0 to 1, in the clear band between the status bar's clock and its icons, above the title's
  /// row. On iOS's soft edge, CI's shots with words behind read 0.06 to 0.39 here (a guide 0.06, a fish 0.10, Tìm's tools
  /// at the largest text 0.39), and those with nothing behind read 0.
  private func behindTheTitle() -> CGFloat {
    guard let shot = XCUIScreen.main.screenshot().image.cgImage else { return 1 }
    let scale = CGFloat(shot.width) / frame.width
    let band = CGRect(x: frame.width * 0.3 * scale, y: 22 * scale, width: frame.width * 0.4 * scale, height: 32 * scale).integral
    guard let box = shot.cropping(to: band) else { return 1 }
    var px = [UInt8](repeating: 0, count: box.width * box.height)
    guard let ctx = CGContext(data: &px, width: box.width, height: box.height, bitsPerComponent: 8, bytesPerRow: box.width,
                              space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return 1 }
    ctx.draw(box, in: CGRect(x: 0, y: 0, width: box.width, height: box.height))
    return CGFloat((px.max() ?? 255) - (px.min() ?? 0)) / 255
  }

  /// The bottom of the lowest words on screen, but the tab bar's own: read from one snapshot of the app, not a query a
  /// text (a fish's page has hundreds, and the screen may change between two).
  private func lowestWords() -> CGFloat {
    guard let snap = try? snapshot() else { return 0 }
    let screen = snap.frame
    var low: CGFloat = 0
    func walk(_ e: XCUIElementSnapshot) {
      if e.elementType == .tabBar { return }
      let f = e.frame
      if e.elementType == .staticText, !f.isEmpty, f.minY < screen.maxY, f.maxY > screen.minY { low = max(low, f.maxY) }
      for c in e.children { walk(c) }
    }
    walk(snap)
    return low
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
