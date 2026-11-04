import XCTest

/// Screenshots of the handbook's pages, from top to bottom, for a pull request's before and after (docs/governance.md):
/// kept with the run (`shot-…`), and put in the `ios-page-shots` artifact by apps/ios/scripts/shots.py. A fish, a plant
/// and a guide, in light and in dark, and the fish's top at a large text size; photos as stand-ins (`-fixed-pictures`);
/// and Bể của tôi, empty and with a tank. And a search's results under the kinds it finds, light and dark, at the default
/// and the largest text size. Each checks only that its screen opened: what it shows, the other flows check.
final class PageShotsFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAFish() { shoot("fish-light", "ca neon", "Cá neon") }
  func testAFishInTheDark() { shoot("fish-dark", "ca neon", "Cá neon", dark: true) }
  func testAFishInLargeText() { shoot("fish-large", "ca neon", "Cá neon", large: true, screens: 3) }
  func testAPlant() { shoot("plant-light", "rotala", "Rotala đỏ") }
  func testAGuide() { shoot("guide-light", "nuoi ca neon", "Nuôi cá neon trong bể nhỏ") }
  func testASearch() { shootSearch("search-light") }
  func testASearchInTheDark() { shootSearch("search-dark", dark: true) }
  func testASearchInTheLargestText() { shootSearch("search-largest-light", size: largest) }
  func testASearchInTheLargestTextInTheDark() { shootSearch("search-largest-dark", dark: true, size: largest) }

  private let largest = "UICTContentSizeCategoryAccessibilityXXXL"

  /// Bể của tôi empty (signed out: the sign-in, "Gửi thống kê ẩn danh"), then with a tank: the list, to its end (the
  /// account, the blocked, "Gửi thống kê ẩn danh").
  func testTheTanksList() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"]
    app.launch()
    app.openTab("Bể của tôi")
    let first = app.buttons["add-first"]
    XCTAssertTrue(first.waitForExistence(timeout: 5), "no tanks tab")
    // Empty first: no tanks, signed out.
    settle()
    let empty = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    empty.name = "shot-tanks-empty-light-01"
    empty.lifetime = .keepAlways
    add(empty)
    first.tap()
    let field = app.textFields["name"]
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no tank form")
    field.tap()
    field.typeText("Bể 60")
    app.buttons["save"].tap()
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "the tank isn't listed")
    app.swipeUp()
    settle()
    let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    a.name = "shot-tanks-light-01"
    a.lifetime = .keepAlways
    add(a)
  }

  /// The page found by `query`, each screen of it, scrolled most of a screen at a time without a fling, to its end.
  private func shoot(_ name: String, _ query: String, _ row: String, dark: Bool = false, large: Bool = false, screens: Int = 12) {
    let app = launch(dark: dark, size: large ? "UICTContentSizeCategoryAccessibilityL" : nil)
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let item = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", row)).firstMatch
    XCTAssertTrue(item.waitForExistence(timeout: 5), "no \(row)")
    item.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "\(row) isn't drawn by the app")
    var seen: [[UInt8]] = []
    var ended = false
    for n in 1...screens {
      settle()
      let shot = XCUIScreen.main.screenshot()
      // The end of the page: a screen already kept (scrolling there moves nothing, or bounces between two). Told by how
      // the page looks below the bars (the status bar's clock moves on, the glass bar's tint shifts): not by its bytes.
      let look = look(shot.image)
      if seen.contains(where: { same($0, look) }) { ended = true; break }
      seen.append(look)
      // Shot in the appearance asked for: a dark run that came out light (as the runner's own setting left it) fails.
      if n == 1 { XCTAssertEqual(lightness(shot.image) < 0.5, dark, "\(name) isn't \(dark ? "dark" : "light"): \(lightness(shot.image))") }
      let a = XCTAttachment(screenshot: shot)
      a.name = String(format: "shot-%@-%02d", name, n)
      a.lifetime = .keepAlways
      add(a)
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
      from.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)), withVelocity: .slow,
                 thenHoldForDuration: 0.2)
    }
    // A whole page (not the large text's top screens) ends before the shots run out: else its end wasn't seen, and the
    // shots repeat it to the last.
    if !large { XCTAssertTrue(ended, "\(name): no end found in \(screens) screens") }
  }

  /// The results of a search that finds most kinds, under its chips, the keyboard put away: one screen.
  private func shootSearch(_ name: String, dark: Bool = false, size: String? = nil) {
    let app = launch(dark: dark, size: size)
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("ca\n")
    XCTAssertTrue(app.descendants(matching: .any)["item"].firstMatch.waitForExistence(timeout: 5), "no results")
    settle()
    let shot = XCUIScreen.main.screenshot()
    XCTAssertEqual(lightness(shot.image) < 0.5, dark, "\(name) isn't \(dark ? "dark" : "light"): \(lightness(shot.image))")
    let a = XCTAttachment(screenshot: shot)
    a.name = "shot-\(name)-01"
    a.lifetime = .keepAlways
    add(a)
  }

  private func launch(dark: Bool, size: String?) -> XCUIApplication {
    let app = XCUIApplication()
    // Dark by the app's own switch: the runner's appearance setting (XCUIDevice) left the shots light.
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fixed-pictures"]
      + (dark ? ["-dark"] : [])
      + (size.map { ["-UIPreferredContentSizeCategoryName", $0] } ?? [])
    app.launch()
    return app
  }

  /// A screen as a small grey picture, below the status bar and the navigation bar.
  private func look(_ image: UIImage) -> [UInt8] {
    let w = 24, h = 48
    var px = [UInt8](repeating: 0, count: w * h)
    guard let cg = image.cgImage, let below = cg.cropping(to: CGRect(x: 0, y: cg.height / 7, width: cg.width, height: cg.height - cg.height / 7)),
      let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w, space: CGColorSpaceCreateDeviceGray(),
                          bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return px }
    ctx.interpolationQuality = .high
    ctx.draw(below, in: CGRect(x: 0, y: 0, width: w, height: h))
    return px
  }

  /// Two looks of the same place: within 5 of 255 a pixel on average. In CI's shots a page at rest at its end differed
  /// by under 0.5; a page scrolled on, by 13 or more.
  private func same(_ a: [UInt8], _ b: [UInt8]) -> Bool {
    var d = 0
    for i in a.indices { d += abs(Int(a[i]) - Int(b[i])) }
    return d < a.count * 5
  }

  /// How light a screen is on average, from 0 (black) to 1 (white).
  private func lightness(_ image: UIImage) -> CGFloat {
    let n = 16
    var px = [UInt8](repeating: 0, count: n * n * 4)
    guard let cg = image.cgImage, let ctx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4,
      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return -1 }
    ctx.interpolationQuality = .high
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))
    // A plain loop: the closure form took CI's compiler past its time to type-check it.
    var sum = 0
    for i in stride(from: 0, to: px.count, by: 4) {
      let r = Int(px[i]), g = Int(px[i + 1]), b = Int(px[i + 2])
      sum += r + g + b
    }
    return CGFloat(sum) / CGFloat(n * n * 3 * 255)
  }

  /// Photos drawn and the scroll at rest.
  private func settle() {
    let until = Date().addingTimeInterval(0.8)
    while Date() < until { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
  }
}
