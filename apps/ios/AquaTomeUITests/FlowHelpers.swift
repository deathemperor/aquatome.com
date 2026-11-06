import XCTest

extension XCUIApplication {
  /// Launches the app for a flow, with UIKit's animations off (`-no-animations`, AquaTomeApp): XCUITest waits for each
  /// one to end after every tap and swipe. Last, so it never comes between another argument and its value. Not for
  /// PerformanceTests, which measure the app as a reader sees it.
  func launchForFlow() {
    if !launchArguments.contains("-no-animations") { launchArguments.append("-no-animations") }
    launch()
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
