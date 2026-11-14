import XCTest

/// A photo the frame rule shows whole is drawn whole, as the screen shows it: in each kind of frame that puts it on its own
/// blur (a group list's card, a search row, a chip), and at a fish page's head. Each photo is a stand-in as long as the
/// kuhli's (`-wide-pictures`, 8:3, its ends red and blue), each fish's box across nearly all of it. Cropped, neither end
/// shows (the owner's reports of 14 Nov: Cá chạch's list cut every fish at both ends, the rule saying whole; three fish
/// pages' heads showed a slice of the fish).
final class WholePhotoFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = true }

  private func launch() -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fixed-pictures",
                           "-wide-pictures"]
    app.launchForFlow()
    return app
  }

  /// Khám phá, a group, its list: the card's photo (4:3, across the card's top).
  func testAGroupListsCardShowsTheWholeFish() {
    let app = launch()
    app.openTab("Khám phá")
    let tile = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá tetra")).firstMatch
    XCTAssertTrue(app.scrolledDown(to: tile).waitForExistence(timeout: 10), "no Cá tetra on Khám phá")
    tile.tap()
    // The list's card, not Khám phá's own Cá neon, still there to the left of the screen under the list. Its frame runs
    // wider than the card where the photo's blur does, so its photo is looked for row by row down the card, across the
    // screen.
    let card = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon"))
    XCTAssertTrue(card.firstMatch.waitForExistence(timeout: 10), "no Cá neon in the group's list")
    let f = settled(card).first { $0.midX > 0 && $0.midX < app.frame.width } ?? .zero
    XCTAssertGreaterThan(f.height, 0, "no Cá neon card on the screen")
    showsBothEnds(app, "the group list's card", ys: Array(stride(from: f.minY + 4, to: f.maxY, by: 6)), from: 0, to: app.frame.width)
  }

  /// Tìm: a group's chip (its photo in a 36-pt circle), then a search's row.
  func testASearchRowAndAChipShowTheWholeFish() {
    let app = launch()
    app.openTab("Tìm kiếm")
    let chip = app.descendants(matching: .any).matching(identifier: "shelf").matching(NSPredicate(format: "label BEGINSWITH %@", "Cá tetra")).firstMatch
    XCTAssertTrue(app.scrolledDown(to: chip).waitForExistence(timeout: 10), "no Cá tetra chip")
    var f = settled(chip)
    showsBothEnds(app, "the chip", ys: [f.midY], from: f.minX, to: f.maxX)

    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10), "no Cá neon row")
    f = settled(row)
    showsBothEnds(app, "the search row", ys: [f.midY], from: f.minX, to: f.maxX)
  }

  /// A fish's page whose photo the taller banner would cut: the whole photo from the bar's foot at the screen's width, both
  /// ends there from its first rows to its last, no fade over its foot (Design's mock of 11 Nov; the owner's reports of 14
  /// Nov, three heads showing a slice of the fish).
  func testAFishPagesHeadShowsTheWholeFishUnderTheBar() {
    let app = launch()
    app.openTab("Tìm kiếm")
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10), "no Cá neon row")
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 10), "no fish page")
    Thread.sleep(forTimeInterval: 2)
    // The stand-in is 8:3: at the screen's width, its rows run from the bar's foot to 3/8 of the width under it.
    let bar = app.navigationBars.firstMatch.frame.maxY, w = app.frame.width
    showsBothEnds(app, "the fish page's head, at its top", ys: [bar + 12], from: 0, to: w)
    showsBothEnds(app, "the fish page's head, at its foot", ys: [bar + w * 3 / 8 - 12], from: 0, to: w)
  }

  /// Its frame once it's still and its photo has come.
  private func settled(_ e: XCUIElement) -> CGRect {
    Thread.sleep(forTimeInterval: 2)
    return e.frame
  }

  /// Their frames once they're still and their photos have come.
  private func settled(_ q: XCUIElementQuery) -> [CGRect] {
    Thread.sleep(forTimeInterval: 2)
    return q.allElementsBoundByIndex.map { $0.frame }
  }

  /// Along one of the lines at `ys`, from `x0` to `x1`: the photo's red end, then its blue end, as the screen shows them.
  private func showsBothEnds(_ app: XCUIApplication, _ what: String, ys: [CGFloat], from x0: CGFloat, to x1: CGFloat,
                             file: StaticString = #filePath, line: UInt = #line) {
    let shot = XCUIScreen.main.screenshot()
    let cg = shot.image.cgImage!
    let s = CGFloat(cg.width) / app.frame.width
    let ctx = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width * 4,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    let p = ctx.data!.assumingMemoryBound(to: UInt8.self)
    let from = Int(max(0, x0 * s)), to = max(from, Int(min(CGFloat(cg.width), x1 * s)))
    // Each line's red and blue, in points from the left.
    let lines = ys.filter { $0 >= 0 && Int($0 * s) < cg.height }.map { y -> (reds: [CGFloat], blues: [CGFloat]) in
      let row = Int(y * s)
      var reds: [CGFloat] = [], blues: [CGFloat] = []
      for x in from..<to {
        let i = (row * cg.width + x) * 4, r = Int(p[i]), g = Int(p[i + 1]), b = Int(p[i + 2])
        if r > 170 && g < 90 && b < 90 { reds.append(CGFloat(x) / s) }
        if b > 170 && r < 90 && g < 120 { blues.append(CGFloat(x) / s) }
      }
      return (reds, blues)
    }
    let whole: (reds: [CGFloat], blues: [CGFloat]) = lines.first { !$0.reds.isEmpty && !$0.blues.isEmpty } ?? lines.first ?? ([], [])
    let (reds, blues) = whole
    let at = ys.count == 1 ? "at \(Int(ys[0]))" : "on any line from \(Int(ys.first ?? 0)) to \(Int(ys.last ?? 0))"
    let a = XCTAttachment(screenshot: shot)
    a.name = "whole-\(what)"
    a.lifetime = .keepAlways
    add(a)
    XCTAssertFalse(reds.isEmpty, "\(what) cuts the fish's left end (no red from \(Int(x0)) to \(Int(x1)) \(at))", file: file, line: line)
    XCTAssertFalse(blues.isEmpty, "\(what) cuts the fish's right end (no blue from \(Int(x0)) to \(Int(x1)) \(at))", file: file, line: line)
    if let r = reds.first, let b = blues.last { XCTAssertLessThan(r, b, "\(what): the ends out of order", file: file, line: line) }
  }
}
