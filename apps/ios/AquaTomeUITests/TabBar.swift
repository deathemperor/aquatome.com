import XCTest

/// iOS 27's soft edge blurs the strip below the floating bar; on 26 the app fades the page out above the bar at every size
/// instead (Design, 20 Nov), as on 27 from AX3.
let softEdgeHolds: Bool = { if #available(iOS 27, *) { true } else { false } }()

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
    edges(in: clearStrip, apart: 2) ?? .max
  }

  /// Between the status bar's clock and its icons, above the title's row.
  private var clearStrip: CGRect { CGRect(x: frame.width * 0.3, y: 22, width: frame.width * 0.4, height: 32) }

  /// Whether a screen's large title can be seen, at rest. It stays in the accessibility tree under anything drawn over it, so
  /// this reads the pixels where it is: a band standing over the title's space left them flat (10 Nov).
  /// `big`: at rest, the title big under the bar's row, not folded into it, as iOS brought a group's page back (17 Nov): a
  /// folded title is drawn too, so its ink alone doesn't tell them apart. The lists' titles are small (`big: false`).
  func largeTitleIsOnScreen(_ title: String, big: Bool = true, file: StaticString = #filePath, line: UInt = #line) {
    let text = navigationBars.staticTexts[title].firstMatch
    XCTAssertTrue(text.waitForExistence(timeout: 5), "no title \(title)", file: file, line: line)
    let seen = edges(in: text.frame, apart: 60) ?? 0
    print("the title's edges, \(title): \(seen)")
    XCTAssertGreaterThan(seen, 200, "\(title): its large title can't be seen", file: file, line: line)
    guard big else { return }
    // Big: 46 points tall at size L, the bar 110 (a folded title is 23, its bar 54).
    XCTAssertGreaterThan(text.frame.height, 30, "\(title): its title is folded into the bar: \(text.frame)", file: file, line: line)
    let bar = navigationBars.containing(NSPredicate(format: "elementType == %d AND label == %@", XCUIElement.ElementType.staticText.rawValue, title)).firstMatch
    XCTAssertGreaterThan(bar.frame.height, 90, "\(title): its bar is folded: \(bar.frame)", file: file, line: line)
  }

  /// Whether the clear strip behind the bar is a dark page's own black. iOS 27's frosted band read 8 of 255 there on the owner's
  /// phone; the app's own band reads 0 (10 Nov).
  func noBandBehindTheBar(_ screen: String, file: StaticString = #filePath, line: UInt = #line) {
    let seen = grey(in: clearStrip)?.px.max().map(Int.init) ?? 255
    print("the brightest behind the bar, \(screen): \(seen)")
    XCTAssertLessThan(seen, 4, "\(screen): a band stands behind the bar", file: file, line: line)
  }

  /// The screen's grey levels in `rect` (in points), row by row: of `screenshot` if given, else of a new one.
  private func grey(in rect: CGRect, of screenshot: XCUIScreenshot? = nil) -> (px: [UInt8], w: Int, h: Int)? {
    guard let shot = (screenshot ?? XCUIScreen.main.screenshot()).image.cgImage else { return nil }
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

  /// How much of `e` is drawn: its frame's pixel pairs `apart` or more grey levels apart (a title's letters), 0 where
  /// something stands over it.
  func ink(_ e: XCUIElement, apart: Int = 60) -> Int { ink(in: e.frame, apart: apart) }
  func ink(in rect: CGRect, apart: Int = 60) -> Int { edges(in: rect, apart: apart) ?? 0 }

  /// Whether `e` is drawn, not only there (Design, 17 Nov: a check passed on Tìm's big title while a band stood over it).
  /// Flat ground reads 0; a faint line reads its edges at a smaller `apart`.
  func inked(_ e: XCUIElement, _ what: String, apart: Int = 60, atLeast: Int = 100, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(e.waitForExistence(timeout: 5), "no \(what)", file: file, line: line)
    let seen = ink(e, apart: apart)
    XCTContext.runActivity(named: "drawn, \(what): \(seen)") { _ in }
    XCTAssertGreaterThan(seen, atLeast, "\(what) isn't drawn: \(seen) edges in \(e.frame)", file: file, line: line)
  }

  /// The darkest to the lightest grey in `rect` (points): a photo's spread, where a flat fill has a few levels.
  func spread(in rect: CGRect) -> Int {
    guard let (px, _, _) = grey(in: rect), let lo = px.min(), let hi = px.max() else { return 0 }
    return Int(hi) - Int(lo)
  }

  /// The grey at `p` (points), from 0 to 255.
  func greyAt(_ p: CGPoint) -> Int {
    guard let (px, _, _) = grey(in: CGRect(x: p.x - 1, y: p.y - 1, width: 2, height: 2)), !px.isEmpty else { return -1 }
    return px.reduce(0) { $0 + Int($1) } / px.count
  }

  /// How many pixels in `rect` (points) are the tint's green, well over their red and over their blue, where the page's
  /// greys, black and white have all three alike.
  func tinted(in rect: CGRect) -> Int {
    guard let shot = XCUIScreen.main.screenshot().image.cgImage else { return 0 }
    let scale = CGFloat(shot.width) / frame.width
    guard let box = shot.cropping(to: CGRect(x: rect.minX * scale, y: rect.minY * scale, width: rect.width * scale,
                                             height: rect.height * scale).integral) else { return 0 }
    let w = box.width, h = box.height
    var px = [UInt8](repeating: 0, count: w * h * 4)
    guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return 0 }
    ctx.draw(box, in: CGRect(x: 0, y: 0, width: w, height: h))
    var n = 0
    for i in stride(from: 0, to: px.count, by: 4) {
      let r = Int(px[i]), g = Int(px[i + 1]), b = Int(px[i + 2])
      if g > r + 25 && g > b { n += 1 }
    }
    return n
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

  /// The tab bar's own place (on iOS 26 its glass, narrower and shorter than its frame): its buttons' frames together.
  var tabBarsOwnPlace: CGRect {
    tabBars.buttons.allElementsBoundByIndex.map { $0.frame }.reduce(CGRect.null) { $0.union($1) }
  }

  /// Whether a button of the page's, a card's size, stands at `p` (points), seen or hidden: not the tab bar's, nor a
  /// navigation bar's.
  func cardAt(_ p: CGPoint) -> Bool {
    guard let snap = try? snapshot() else { return false }
    func walk(_ e: XCUIElementSnapshot) -> Bool {
      if e.elementType == .tabBar || e.elementType == .navigationBar { return false }
      if e.elementType == .button, e.frame.contains(p), e.frame.height < 600 { return true }
      return e.children.contains(where: walk)
    }
    return walk(snap)
  }

  /// Dragged up a little at a time, without a fling, until one of the page's lines of words crosses into the tab bar's
  /// frame (the bar's own names are shorter than a line), then whether it did. Or until a bar of the page's own stands on
  /// ours over its foot, so nothing of the page goes under ours: Đèn's notice (`notice`), which at the largest text on
  /// 26.5's iPhone 17 covers the page's foot, its words stopping above it (20 Nov).
  func wordsReachTheTabBar(_ screen: String, file: StaticString = #filePath, line: UInt = #line) {
    let bar = tabBars.firstMatch.frame
    func covered() -> Bool {
      let n = descendants(matching: .any)["notice"]
      return n.exists && n.frame.maxY > bar.minY - 40 && n.frame.maxY <= bar.minY + 8
    }
    func there() -> Bool {
      guard let snap = try? snapshot() else { return false }
      func walk(_ e: XCUIElementSnapshot) -> Bool {
        if e.elementType == .tabBar { return false }
        let f = e.frame
        if e.elementType == .staticText, e.label.count >= 12, f.minY < bar.maxY - 8, f.maxY > bar.minY + 8 { return true }
        return e.children.contains(where: walk)
      }
      return walk(snap)
    }
    let from = coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
    for _ in 0..<10 where !there() && !covered() {
      from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: -120)), withVelocity: .slow, thenHoldForDuration: 0.4)
    }
    XCTAssertTrue(there() || covered(), "\(screen): no words reached the tab bar", file: file, line: line)
  }

  /// How readable the page's words are under the tab bar, against the same page's just above it. Two shots, the page dragged
  /// up 40 points between them without a fling: the pixels with a sharp edge (40 or more grey levels to the next one across
  /// or down) in one shot where the other is flat there (under 12), under the bar's frame (`under`) and in a band as tall a
  /// little above it, clear of iOS's edge (`above`). A word that reads leaves sharp edges where there were none as it
  /// moves; one blurred by the edge, none. The glass's own names, icons and rim keep theirs in both shots, however its tint
  /// shifts with the page under it: the edges of the shots' difference counted that shift (the glass's lower rim, 1,052 on
  /// a fish's page, 27.2, 20 Nov). `page`: the pixels that changed higher up, so a page that moved under a bar of its own
  /// over its foot (Đèn's notice and write bar) tells apart from one that didn't move. Both shots go with the test's results.
  func wordsUnderTheTabBar(_ screen: String) -> (under: Int, above: Int, page: Int) {
    let bar = tabBars.firstMatch.frame
    let top = max(bar.minY - 48 - bar.height, 0)
    // The shot kept with the results is the one measured.
    func shot(_ name: String) -> (px: [UInt8], w: Int, h: Int)? {
      let s = XCUIScreen.main.screenshot()
      let a = XCTAttachment(screenshot: s)
      a.name = "\(screen), \(name)"
      a.lifetime = .keepAlways
      XCTContext.runActivity(named: a.name ?? name) { $0.add(a) }
      return grey(in: frame, of: s)
    }
    guard let a = shot("before") else { return (.max, 0, 0) }
    let from = coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
    from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: -40)), withVelocity: .slow, thenHoldForDuration: 0.6)
    guard let b = shot("40 points on"), b.w == a.w, b.h == a.h else { return (.max, 0, 0) }
    let moved = zip(a.px, b.px).map { abs(Int($0) - Int($1)) }
    let scale = CGFloat(a.w) / frame.width, w = a.w
    func sharp(_ rows: Range<Int>) -> Int {
      func edge(_ px: [UInt8], _ i: Int, _ x: Int, _ y: Int) -> Int {
        max(x + 1 < w ? abs(Int(px[i]) - Int(px[i + 1])) : 0, y + 1 < rows.upperBound ? abs(Int(px[i]) - Int(px[i + w])) : 0)
      }
      var n = 0
      for y in rows {
        for x in 0..<w {
          let i = y * w + x, ea = edge(a.px, i, x, y), eb = edge(b.px, i, x, y)
          if (ea >= 40 && eb < 12) || (eb >= 40 && ea < 12) { n += 1 }
        }
      }
      return n
    }
    let first = min(Int((top * scale).rounded()), a.h), barRow = min(Int((bar.minY * scale).rounded()), a.h)
    let page = moved[0..<(first * w)].filter { $0 > 30 }.count
    return (sharp(barRow..<a.h), sharp(first..<min(first + Int((bar.height * scale).rounded()), barRow)), page)
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
