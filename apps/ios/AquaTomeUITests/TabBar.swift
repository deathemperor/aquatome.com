import XCTest

extension XCUIApplication {
  /// A tab by its name; the Tài khoản sheet closed first.
  func openTab(_ name: String, file: StaticString = #filePath, line: UInt = #line) {
    closeAccount()
    let tab = tabBars.buttons[name]
    XCTAssertTrue(tab.waitForExistence(timeout: 5), "no tab \(name)", file: file, line: line)
    tab.tap()
  }

  /// Flung to the end of the screen, until its scrolling page stops moving, then whether every word on it, fixed or not,
  /// ends above the tab bar.
  func endsAboveTheTabBar(_ screen: String, file: StaticString = #filePath, line: UInt = #line) {
    // At the end once two flings in a row leave the page where it was. With one, a kind of kit's page stopped after its
    // second fling (main's run, 21 Nov): 877.7 read after both, under the screen's foot, though its recording shows the
    // page moving between them; the retry flung five times and passed. Where it was: read from the page that scrolls,
    // not the bars (`Reading`): its lowest and its highest words the same, each within half a point of the reading
    // before and of where the run of still readings began (against the first alone, 700 then 700.49 then 699.51 read
    // still, a step of 0.98; Codex, 21 Nov), so repeated words can't read still alone. And the whole screen's lowest
    // words still too, as the check read them before it read the page, so it never stops sooner than that did (a larger
    // scroller than the one a fling moves reads still at once; Fable, 21 Nov). Not still after 30 flings, or no reading
    // of the screen, fails: a check that never saw the page's end proves nothing (Codex and the chief, 21 Nov).
    var from: Reading?, last: Reading?, still = 0, flings = 0
    while still < 2 {
      guard flings < 30 else {
        return XCTFail("\(screen): not still after 30 flings: \(last?.what ?? "no reading of the screen")", file: file, line: line)
      }
      swipeUp()
      flings += 1
      _ = XCTWaiter.wait(for: [XCTestExpectation(description: "still")], timeout: 0.8)
      let now = pageReading()
      if let now, let from, let last, now.isStill(from), now.isStill(last) { still += 1 } else { still = 0; from = now }
      last = now
    }
    let bar = tabBars.firstMatch
    XCTAssertTrue(bar.exists, "\(screen): no tab bar", file: file, line: line)
    // Every word on screen but the tab bar's own, the fixed ones too: none may end under it.
    guard let lowest = lowestWords() else {
      return XCTFail("\(screen): no reading of its words after \(flings) flings", file: file, line: line)
    }
    XCTAssertLessThanOrEqual(lowest.y, bar.frame.minY + 0.5, "\(screen): its last words end under the tab bar after \(flings) flings: \(lowest.what)", file: file, line: line)
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

  /// The bottom of the lowest words on screen, but the tab bar's own: read from one snapshot of the app, not a query a
  /// text (a fish's page has hundreds, and the screen may change between two). Nil for no snapshot or no words.
  private func lowestWords(_ taken: XCUIElementSnapshot? = nil) -> (y: CGFloat, words: String, what: String)? {
    guard let snap = taken ?? (try? snapshot()) else { return nil }
    let screen = snap.frame
    var low: (y: CGFloat, words: String, what: String)?
    func walk(_ e: XCUIElementSnapshot) {
      if e.elementType == .tabBar { return }
      let f = e.frame
      if e.elementType == .staticText, !f.isEmpty, f.minY < screen.maxY, f.maxY > screen.minY, f.maxY > low?.y ?? 0 {
        low = (f.maxY, e.label, "“\(e.label)” at \(f)")
      }
      for c in e.children { walk(c) }
    }
    walk(snap)
    return low
  }

  /// The scrolling page's words at rest after a fling: which are lowest and where they end, which are highest and where
  /// they begin.
  private struct Reading {
    let low: CGFloat, words: String, high: CGFloat, top: String, what: String
    /// The whole screen's lowest words but the tab bar's, from the same snapshot: what the check read before it read the
    /// page (`lowestWords`).
    let screen: CGFloat, screenWords: String
    func isStill(_ o: Reading) -> Bool {
      words == o.words && top == o.top && screenWords == o.screenWords
        && abs(low - o.low) < 0.5 && abs(high - o.high) < 0.5 && abs(screen - o.screen) < 0.5
    }
  }

  /// What stays put while a page scrolls: the bars and what they hold.
  private static let fixed: [XCUIElement.ElementType] = [.tabBar, .navigationBar, .toolbar]

  /// The words of the page that scrolls (the largest scroll view, list or web view on screen, so not a row of chips
  /// across it; the whole app, less its bars, on a screen with none), from one snapshot. Nil for no snapshot or no words.
  private func pageReading() -> Reading? {
    guard let snap = try? snapshot() else { return nil }
    let screen = snap.frame
    var page: XCUIElementSnapshot = snap, area: CGFloat = 0
    func find(_ e: XCUIElementSnapshot) {
      if Self.fixed.contains(e.elementType) { return }
      if [.scrollView, .collectionView, .table, .webView].contains(e.elementType) {
        let f = e.frame.intersection(screen)
        if !f.isNull, f.width * f.height > area { page = e; area = f.width * f.height }
      }
      for c in e.children { find(c) }
    }
    find(snap)
    var low: (y: CGFloat, words: String, what: String)?, high: (y: CGFloat, words: String)?
    func walk(_ e: XCUIElementSnapshot) {
      if Self.fixed.contains(e.elementType) { return }
      let f = e.frame
      if e.elementType == .staticText, !f.isEmpty, f.minY < screen.maxY, f.maxY > screen.minY {
        if f.maxY > low?.y ?? 0 { low = (f.maxY, e.label, "“\(e.label)” at \(f)") }
        if f.minY < high?.y ?? .infinity { high = (f.minY, e.label) }
      }
      for c in e.children { walk(c) }
    }
    walk(page)
    guard let low, let high, let all = lowestWords(snap) else { return nil }
    return Reading(low: low.y, words: low.words, high: high.y, top: high.words, what: low.what, screen: all.y, screenWords: all.words)
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
