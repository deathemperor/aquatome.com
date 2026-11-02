import XCTest

/// Screenshots of the handbook's pages, from top to bottom, for a pull request's before and after (docs/governance.md):
/// kept with the run (`shot-…`), and put in the `ios-page-shots` artifact by apps/ios/scripts/shots.py. A fish, a plant
/// and a guide, in light and in dark, and the fish's top at a large text size; photos as stand-ins (`-fixed-pictures`).
/// Each checks only that its page opened: what a page shows, the other flows check.
final class PageShotsFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }
  // The runner's simulator, as the next test expects it.
  override func tearDown() { XCUIDevice.shared.appearance = .light }

  func testAFish() { shoot("fish-light", "ca neon", "Cá neon") }
  func testAFishInTheDark() { shoot("fish-dark", "ca neon", "Cá neon", dark: true) }
  func testAFishInLargeText() { shoot("fish-large", "ca neon", "Cá neon", large: true, screens: 3) }
  func testAPlant() { shoot("plant-light", "rotala", "Rotala đỏ") }
  func testAGuide() { shoot("guide-light", "nuoi ca neon", "Nuôi cá neon trong bể nhỏ") }

  /// The page found by `query`, each screen of it, scrolled most of a screen at a time without a fling, to its end.
  private func shoot(_ name: String, _ query: String, _ row: String, dark: Bool = false, large: Bool = false, screens: Int = 12) {
    XCUIDevice.shared.appearance = dark ? .dark : .light
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fixed-pictures"]
      + (large ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityL"] : [])
    app.launch()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let item = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", row)).firstMatch
    XCTAssertTrue(item.waitForExistence(timeout: 5), "no \(row)")
    item.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "\(row) isn't drawn by the app")
    var last: Data?
    for n in 1...screens {
      settle()
      let shot = XCUIScreen.main.screenshot()
      // The end of the page: scrolling moved nothing.
      if shot.pngRepresentation == last { break }
      last = shot.pngRepresentation
      let a = XCTAttachment(screenshot: shot)
      a.name = String(format: "shot-%@-%02d", name, n)
      a.lifetime = .keepAlways
      add(a)
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
      from.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)), withVelocity: .slow,
                 thenHoldForDuration: 0.2)
    }
  }

  /// Photos drawn and the scroll at rest.
  private func settle() {
    let until = Date().addingTimeInterval(0.8)
    while Date() < until { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
  }
}
