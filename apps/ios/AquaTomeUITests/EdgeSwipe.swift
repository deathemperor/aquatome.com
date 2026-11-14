import XCTest

enum SwipedPage: CaseIterable { case fishFromKhamPha, guideFromKhamPha, homNayPost }

/// XCUITest's slow pace; Design's pan (`agent-device gesture pan 1 <y> 320 0 450`: 320 pt in 0.45 s, from 1 pt in); a
/// thumb's flick, across in a tenth of a second.
enum SwipePace: String, CaseIterable { case slow, design, fast }

extension XCTestCase {
  /// The page opened from its card; what shows while it's open.
  func openForSwipe(_ page: SwipedPage, _ app: XCUIApplication) -> XCUIElement {
    let card: XCUIElement, shown: XCUIElement
    func titled(_ words: String) -> XCUIElement { app.buttons.matching(NSPredicate(format: "label CONTAINS %@", words)).firstMatch }
    switch page {
    case .fishFromKhamPha:
      app.openTab("Khám phá")
      card = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
      shown = app.descendants(matching: .any)["v2-species"]
    case .guideFromKhamPha:
      app.openTab("Khám phá")
      card = titled("Nuôi cá neon trong bể nhỏ")
      shown = app.descendants(matching: .any)["native-page"]
    case .homNayPost:
      app.openTab("Hôm nay")
      card = titled("Đàn neon đầu tiên")
      shown = app.descendants(matching: .any)["native-page"]
    }
    XCTAssertTrue(card.waitForExistence(timeout: 10), "no card for \(page)")
    repeatUntil(card.isHittable, times: 8) { app.swipeUp() }
    card.tap()
    XCTAssertTrue(shown.waitForExistence(timeout: 8), "\(page) didn't open")
    return shown
  }

  /// From the screen's very edge across, `dy` down, moving at once as a finger does. Never a hold first: iOS 26's swipe
  /// back takes a finger that rests before it moves differently, and a held start hid a broken edge (12 Nov).
  func edgeSwipe(_ app: XCUIApplication, _ pace: SwipePace, at dy: CGFloat = 0.6, fast: TimeInterval = 0.1) {
    let o = app.coordinate(withNormalizedOffset: .zero), w = app.frame.width, y = app.frame.height * dy
    let (x, across, v): (CGFloat, CGFloat, XCUIGestureVelocity) = switch pace {
    case .slow: (2, w * 0.91, .slow)
    case .design: (1, 320, XCUIGestureVelocity(320 / 0.45))
    case .fast: (2, w * 0.91, XCUIGestureVelocity(w * 0.91 / fast))
    }
    o.withOffset(CGVector(dx: x, dy: y)).press(forDuration: 0, thenDragTo: o.withOffset(CGVector(dx: x + across, dy: y)), withVelocity: v, thenHoldForDuration: 0)
  }

  func edgeSwipe(_ app: XCUIApplication, fast: Bool, at dy: CGFloat = 0.6) { edgeSwipe(app, fast ? .fast : .slow, at: dy) }

  /// From the left edge at each height (20%, 50% and 80% down the screen), on the page as it opens and once scrolled, at
  /// each pace: the ones that didn't go back, as "scrolled 80% fast". `open` opens the page and says what shows while it's
  /// open.
  func edgeMisses(_ app: XCUIApplication, each: Int, at heights: [CGFloat] = [0.2, 0.5, 0.8], fast: TimeInterval = 0.1,
                  open: () -> XCUIElement) -> (tried: Int, missed: [String]) {
    var tried = 0, missed: [String] = []
    for scrolled in [false, true] {
      for dy in heights {
        for pace in SwipePace.allCases.flatMap({ Array(repeating: $0, count: each) }) {
          let shown = open()
          if scrolled {
            app.swipeUp()
            // Settled: a touch on a page still gliding stops it first, a swipe's start taken.
            Thread.sleep(forTimeInterval: 1)
          }
          edgeSwipe(app, pace, at: offRows(app, dy), fast: fast)
          tried += 1
          if !shown.waitForNonExistence(timeout: 5) {
            missed.append("\(scrolled ? "scrolled" : "as opened") \(Int(dy * 100))% \(pace)")
            app.leavePage()
            _ = shown.waitForNonExistence(timeout: 5)
          }
        }
      }
    }
    return (tried, missed)
  }

  /// A height down the screen, moved just past a row that scrolls sideways if it lands on one: in this build such a row
  /// takes a swipe from the very edge, as iOS has it (the chief of staff's fallback, 13 Nov; `testFromTheLeftEdgeOverASidewaysRowThePageGoesBack`).
  func offRows(_ app: XCUIApplication, _ dy: CGFloat) -> CGFloat {
    let h = app.frame.height, y = h * dy
    guard let row = app.scrollViews.allElementsBoundByIndex.first(where: {
      $0.frame.height < h * 0.5 && $0.frame.width > app.frame.width * 0.8 && $0.frame.minY - 8 <= y && y <= $0.frame.maxY + 8
    }) else { return dy }
    let below = row.frame.maxY + 16
    return (below < h * 0.95 ? below : row.frame.minY - 16) / h
  }

  /// iOS's own swipe from the left edge takes a page back from anywhere down the edge, every time: on the page as it opens
  /// and scrolled, slow, at Design's pace and fast, each moving at once as a finger does. Design's parity on 12 Nov: a fish
  /// page went back from over its photo only; 700 pt down it stayed, 0 of 5. The app had turned iOS 26's swipe from the
  /// middle off, and that broke the edge's for a finger that moves at once; these checks then held the finger 0.05 s
  /// first, which hid it. One height a test, to keep each under CI's ten minutes; `TEST_RUNNER_EDGE_EACH` sets how many
  /// of each pace at each place (2; 10 for a PR's count).
  func edgeSwipesGoBack(_ page: SwipedPage, at dy: CGFloat) {
    let each = Int(ProcessInfo.processInfo.environment["EDGE_EACH"] ?? "") ?? 2
    // With animations on: iOS's swipe doesn't go back without them. The neon's long part: its chips, as a real page has.
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults",
                           "-v2", "YES", "-plan", "-today", "2026-11-13", "-long-part"]
    app.launch()
    // A Hôm nay post is iOS's zoom, whose swipe from the edge closes it only at an unhurried speed: across the screen in
    // 250 or 300 ms, 6 of 6; in 100 to 200 ms, 0 of 18 (27.2, 13 Nov). Its fast swipe is 300 ms until the post is a pushed
    // page (the chief of staff, 13 Nov: the zoom stays in this build, the next pushes the post).
    let (tried, missed) = edgeMisses(app, each: each, at: [dy], fast: page == .homNayPost ? 0.3 : 0.1) { openForSwipe(page, app) }
    print("EDGE \(page) \(Int(dy * 100))%: \(tried - missed.count)/\(tried) went back; missed \(Dictionary(grouping: missed) { $0 }.mapValues(\.count))")
    XCTAssertEqual(missed, [], "edge swipes on \(page) that didn't go back, of \(each) of each pace")
  }
}
