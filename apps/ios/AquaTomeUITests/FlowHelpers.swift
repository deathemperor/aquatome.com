import XCTest

/// The look a flow runs on (V2Switch): v2, the app's own, or the old one, which a reader can still switch on. Named on
/// every launch, so a look switched by hand in one flow never carries into the next on the same simulator.
enum Look: String {
  case v2 = "YES", old = "NO"
}

extension XCUIApplication {
  /// Launches the app for a flow on `look`, unless its arguments name one already (`-v2`); nil for a flow that flips
  /// the Tài khoản sheet's switch, which a look named at launch would hold. With UIKit's animations off
  /// (`-no-animations`, AquaTomeApp): XCUITest waits for each one to end after every tap and swipe. Last, so it never
  /// comes between another argument and its value. Not for PerformanceTests, which measure the app as a reader sees it.
  func launchForFlow(_ look: Look? = .v2) {
    if let look, !launchArguments.contains("-v2") { launchArguments += ["-v2", look.rawValue] }
    if !launchArguments.contains("-no-animations") { launchArguments.append("-no-animations") }
    launch()
  }

  /// iOS's own back button (`BackButton`, iOS's name for it). A fish's page has iOS's, not one of its own: iOS's swipe
  /// from the left edge goes with it (the owner, 12 Nov).
  var pageBack: XCUIElement { navigationBars.buttons["BackButton"].firstMatch }

  /// Off a page: iOS's back button, or a Hôm nay post's ✕ (a page a Hôm nay card opens has no back button).
  func leavePage() {
    if pageBack.exists { pageBack.tap() } else { buttons["v2-close-post"].firstMatch.tap() }
  }

  /// Tìm's home has the handbook: its first shelf's chips, on the first screen under the tools.
  func handbookShown(timeout: TimeInterval = 5) -> Bool {
    descendants(matching: .any)["shelf"].firstMatch.waitForExistence(timeout: timeout)
  }

  /// A row of Tìm's home past the first screen ("all-fish": Tất cả loài), scrolled to.
  func homeRow(_ id: String) -> XCUIElement { scrolledDown(to: descendants(matching: .any)[id].firstMatch) }

  /// An element down a list, scrolled to half a screen at a time: a list draws its rows only as they come on screen, and
  /// a fling would carry them past.
  func scrolledDown(to e: XCUIElement) -> XCUIElement {
    let from = coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
    repeatUntil(e.exists && e.isHittable, times: 10) {
      from.press(forDuration: 0.05, thenDragTo: coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)), withVelocity: .slow,
                 thenHoldForDuration: 0.1)
    }
    return e
  }
}

/// `step` until `done`, at most `times` times. `done` is asked before each step and not again once it holds: a
/// `for … where !done` loop asks it every time round, each a query of the app, long after the element was found.
func repeatUntil(_ done: @autoclosure () -> Bool, times: Int, _ step: () -> Void) {
  for _ in 0..<times {
    if done() { return }
    step()
  }
}
