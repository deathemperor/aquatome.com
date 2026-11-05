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
