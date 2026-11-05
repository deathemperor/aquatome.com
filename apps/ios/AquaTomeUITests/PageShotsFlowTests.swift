import XCTest

/// Screenshots of the handbook's pages, from top to bottom, for a pull request's before and after (docs/governance.md):
/// kept with the run (`shot-…`), and put in the `ios-page-shots` artifact by apps/ios/scripts/shots.py. A fish, a plant,
/// a guide and a video series, in light, the fish in dark too, and the fish's top at a large text size; photos as
/// stand-ins (`-fixed-pictures`). And a search's results under the kinds it finds, light and dark, at the default and the
/// largest text size, with more found than listed, and with a kind picked that it finds none of, at both sizes; the
/// app's icon picker; and the lights tab's card for the fake light, its clock lost, warning of its outlet's timer on
/// the stand-in Tuya cloud. Each checks only that its screen opened: what it shows, the other flows check.
final class PageShotsFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAFish() { shoot("fish-light", "ca neon", "Cá neon") }
  func testAFishInTheDark() { shoot("fish-dark", "ca neon", "Cá neon", dark: true) }
  func testAFishInLargeText() { shoot("fish-large", "ca neon", "Cá neon", large: true, screens: 3) }
  func testAPlant() { shoot("plant-light", "rotala", "Rotala đỏ") }
  func testAGuide() { shoot("guide-light", "nuoi ca neon", "Nuôi cá neon trong bể nhỏ") }
  func testAVideoSeries() { shoot("series-light", "reu hai tu a", "Rêu hại từ A đến Z") }
  func testASearch() { shootSearch("search-light") }
  func testASearchInTheDark() { shootSearch("search-dark", dark: true) }
  func testASearchInTheLargestText() { shootSearch("search-largest-light", size: largest) }
  func testASearchInTheLargestTextInTheDark() { shootSearch("search-largest-dark", dark: true, size: largest) }
  func testTheAppIcons() { shootIcons("icons-light") }
  func testTheAppIconsInTheDark() { shootIcons("icons-dark", dark: true) }
  func testALightsCardWarningOfItsOutletsTimer() { shootLightCard("light-outlet") }

  // Three to a page (`-search-page`), so "Xem thêm kết quả" shows on the first screen, as it does under 200 rows.
  func testASearchFindingMoreThanItLists() { shootSearch("search-more-light", more: ["-search-page", "3"]) }
  func testAKindASearchFindsNoneOf() { shootSearch("search-none-of-kind-light", typing: "do", then: noneOfPlants) }
  func testAKindASearchFindsNoneOfInTheLargestText() {
    shootSearch("search-none-of-kind-largest-light", size: largest, typing: "do", then: noneOfPlants)
  }

  /// "Cây" picked, then a letter more that finds no plant: there once it says so, with its way back to every kind.
  private func noneOfPlants(_ app: XCUIApplication) -> XCUIElement {
    app.buttons["kind-plant"].tap()
    app.searchFields.firstMatch.typeText("n\n")
    return app.buttons["see-all"]
  }

  private let largest = "UICTContentSizeCategoryAccessibilityXXXL"

  /// The app's icon picker (`-app-icons` opens it until its Tài khoản row is in): its top, and a screen further down.
  private func shootIcons(_ name: String, dark: Bool = false) {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-app-icons"] + (dark ? ["-dark"] : [])
    app.launch()
    XCTAssertTrue(app.buttons["app-icon-default"].waitForExistence(timeout: 10), "the picker didn't open")
    for n in 1...2 {
      settle()
      let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      a.name = String(format: "shot-%@-%02d", name, n)
      a.lifetime = .keepAlways
      add(a)
      app.swipeUp(velocity: .slow)
    }
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
  /// `then`, after typing, gives what shows once the screen is there: a result row unless it says otherwise.
  private func shootSearch(_ name: String, dark: Bool = false, size: String? = nil, more: [String] = [], typing query: String = "ca\n",
                           then: ((XCUIApplication) -> XCUIElement)? = nil) {
    let app = launch(dark: dark, size: size, more)
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let there = then?(app) ?? app.descendants(matching: .any)["item"].firstMatch
    XCTAssertTrue(there.waitForExistence(timeout: 5), "\(name): not there")
    settle()
    let shot = XCUIScreen.main.screenshot()
    XCTAssertEqual(lightness(shot.image) < 0.5, dark, "\(name) isn't \(dark ? "dark" : "light"): \(lightness(shot.image))")
    let a = XCTAttachment(screenshot: shot)
    a.name = "shot-\(name)-01"
    a.lifetime = .keepAlways
    add(a)
  }

  /// The fake light connected on the Đèn tab, its clock lost in a cut, on a tank with the stand-in strip whose outlet
  /// "Đèn" Smart Life turns off every night: the outlet picked and its warning shown. One screen.
  private func shootLightCard(_ name: String) {
    let app = launch(dark: false, size: nil, ["-seed-tanks", "plug", "-seed-tuya-keys", "-stand-in-timer", "enabled", "-fake-clock-unset"])
    app.openTab("Đèn")
    app.buttons["scan"].tap()
    let light = app.buttons["light"].firstMatch
    XCTAssertTrue(light.waitForExistence(timeout: 5), "no light found")
    light.tap()
    let pick = app.descendants(matching: .any)["pick-outlet"].firstMatch
    XCTAssertTrue(pick.waitForExistence(timeout: 10), "no outlet to pick")
    pick.tap()
    let item = app.buttons["Đèn · Ổ cắm bể 60 (gợi ý)"].firstMatch
    XCTAssertTrue(item.waitForExistence(timeout: 5), "the outlet isn't offered")
    item.tap()
    XCTAssertTrue(app.descendants(matching: .any)["outlet-warning"].waitForExistence(timeout: 10), "no warning")
    settle()
    let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    a.name = "shot-\(name)-01"
    a.lifetime = .keepAlways
    add(a)
  }

  private func launch(dark: Bool, size: String?, _ more: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    // Dark by the app's own switch: the runner's appearance setting (XCUIDevice) left the shots light.
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fixed-pictures"]
      + (dark ? ["-dark"] : [])
      + (size.map { ["-UIPreferredContentSizeCategoryName", $0] } ?? []) + more
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

  // The photo viewer over the fish's gallery, black whatever the phone's appearance: so its light, dark and large-text
  // shots differ in the page they open over and in the words' size.
  func testTheGalleryViewer() { shootViewer("viewer-light") }
  func testTheGalleryViewerInTheDark() { shootViewer("viewer-dark", dark: true) }
  func testTheGalleryViewerInLargeText() { shootViewer("viewer-large", large: true) }

  /// The viewer on Cá neon's first photo, its full photo come: as it opens, then with its bar and words hidden by a tap.
  private func shootViewer(_ name: String, dark: Bool = false, large: Bool = false) {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fixed-pictures"]
      + (dark ? ["-dark"] : [])
      + (large ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityL"] : [])
    app.launch()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("ca neon")
    let item = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    XCTAssertTrue(item.waitForExistence(timeout: 5), "no Cá neon")
    item.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "Cá neon isn't drawn by the app")
    // The page under it in the appearance asked for.
    let page = lightness(XCUIScreen.main.screenshot().image)
    XCTAssertEqual(page < 0.5, dark, "\(name)'s page isn't \(dark ? "dark" : "light"): \(page)")
    let photo = app.buttons["Đàn cá neon trong bể"].firstMatch
    for _ in 0..<24 where !(photo.exists && photo.isHittable) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .fast,
               thenHoldForDuration: 0.1)
    }
    photo.tap()
    let shown = app.descendants(matching: .any)["picture-shown"]
    XCTAssertTrue(shown.waitForExistence(timeout: 5), "no viewer")
    XCTAssertTrue(XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == 'full'"), object: shown)], timeout: 5)
      == .completed, "the full photo didn't come")
    for (n, tap) in [(1, false), (2, true)] {
      if tap { app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)).tap() }
      settle()
      let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      a.name = String(format: "shot-%@-%02d", name, n)
      a.lifetime = .keepAlways
      add(a)
    }
  }
}
