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
}

/// `step` until `done`, at most `times` times. `done` is asked before each step and not again once it holds: a
/// `for … where !done` loop asks it every time round, each a query of the app, long after the element was found.
func repeatUntil(_ done: @autoclosure () -> Bool, times: Int, _ step: () -> Void) {
  for _ in 0..<times {
    if done() { return }
    step()
  }
}
