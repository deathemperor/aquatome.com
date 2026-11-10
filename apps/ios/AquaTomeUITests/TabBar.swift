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
    let seen = sharpBehindTheTitle()
    print("behind the title, \(screen): \(seen)")
    XCTAssertLessThan(seen, 50, "\(screen): words that scroll under the title show behind it", file: file, line: line)
  }

  /// How many side-by-side or stacked pixel pairs, in the clear band between the status bar's clock and its icons above the
  /// title's row, are 2 or more grey levels apart: the edges of words. iOS's hard edge leaves at most a faint blur there; CI's
  /// 154 page shots with it read 0 to 5 (8 Nov). Its soft edge leaves words: those with words behind read 134 (a guide) to
  /// 18,421 (Tìm's tools at the largest text). A blurred shape, a card or a photo, has no such edges either way.
  private func sharpBehindTheTitle() -> Int {
    edges(in: CGRect(x: frame.width * 0.3, y: 22, width: frame.width * 0.4, height: 32), apart: 2) ?? .max
  }

  /// Whether a screen's large title can be seen, at rest. It stays in the accessibility tree under anything drawn over it, so
  /// this reads the pixels where it is: a band standing over the title's space left them flat (10 Nov).
  func largeTitleIsOnScreen(_ title: String, file: StaticString = #filePath, line: UInt = #line) {
    let text = navigationBars.staticTexts[title].firstMatch
    XCTAssertTrue(text.waitForExistence(timeout: 5), "no title \(title)", file: file, line: line)
    let seen = edges(in: text.frame, apart: 60) ?? 0
    print("the title's edges, \(title): \(seen)")
    XCTAssertGreaterThan(seen, 200, "\(title): its large title can't be seen", file: file, line: line)
  }

  /// Whether the strip behind the bar, from the top of the screen down to `bottom`, is a dark page's own black. iOS 27's frosted
  /// band read 8 of 255 there on the owner's phone, with a line of 32 at its foot; the app's own band reads 0 (10 Nov).
  func noBandBehindTheBar(above bottom: CGFloat, _ screen: String, file: StaticString = #filePath, line: UInt = #line) {
    let seen = grey(in: CGRect(x: frame.width * 0.3, y: 0, width: 2, height: bottom))?.px.max().map(Int.init) ?? 255
    print("the brightest behind the bar, \(screen): \(seen)")
    XCTAssertLessThan(seen, 4, "\(screen): a band stands behind the bar", file: file, line: line)
  }

  /// The screen's grey levels in `rect` (in points), row by row.
  private func grey(in rect: CGRect) -> (px: [UInt8], w: Int, h: Int)? {
    guard let shot = XCUIScreen.main.screenshot().image.cgImage else { return nil }
    let scale = CGFloat(shot.width) / frame.width
    let band = CGRect(x: rect.minX * scale, y: rect.minY * scale, width: rect.width * scale, height: rect.height * scale).integral
    guard let box = shot.cropping(to: band) else { return nil }
    let w = box.width, h = box.height
    var px = [UInt8](repeating: 0, count: w * h)
    guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w,
                              space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return nil }
    ctx.draw(box, in: CGRect(x: 0, y: 0, width: w, height: h))
    return (px, w, h)
  }

  /// How many side-by-side or stacked pixel pairs in `rect` (in points) are `apart` or more grey levels apart.
  private func edges(in rect: CGRect, apart: Int) -> Int? {
    guard let (px, w, h) = grey(in: rect) else { return nil }
    var sharp = 0
    for y in 0..<h {
      for x in 0..<w {
        let v = Int(px[y * w + x])
        if x + 1 < w, abs(v - Int(px[y * w + x + 1])) >= apart { sharp += 1 }
        if y + 1 < h, abs(v - Int(px[(y + 1) * w + x])) >= apart { sharp += 1 }
      }
    }
    return sharp
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
