import XCTest

/// A gallery's photo viewer, on the fixed pages with stand-in photos (`-fixed-pictures`, no network): a photo shows its
/// thumbnail at once while the full photo is on its way, the photos either side are fetched and no others, and the
/// viewer is swiped, tapped, zoomed and pulled down as a phone's photo viewer is. And a row's place shows its own photo.
final class PhotoViewerFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Its full photo held back (`-slow-pictures`): the row's thumbnail shows at once, with a spinner, not an empty box.
  func testAPhotoShowsItsThumbnailAtOnceWhileTheFullPhotoComes() {
    let app = launch("-slow-pictures")
    let photo = rowPhoto(app, "Đàn cá neon trong bể")
    photo.tap()
    XCTAssertTrue(app.descendants(matching: .any)["gallery"].waitForExistence(timeout: 5), "no viewer")
    // At once: the thumbnail is in memory from the row (the full photo takes 20 s).
    let shown = app.descendants(matching: .any)["picture-shown"]
    XCTAssertTrue(wait(shown, label: "thumb", timeout: 3), "no thumbnail at once: \(shown.label)")
    XCTAssertTrue(app.descendants(matching: .any)["photo-loading"].exists, "no sign the full photo is coming")
    // Drawn, not a black page: the stand-in's water colours where the photo goes.
    XCTAssertGreaterThan(lightness(XCUIScreen.main.screenshot().image, around: CGPoint(x: 0.5, y: 0.45)), 0.08, "nothing drawn")
  }

  /// Opened from the row's second photo: that photo, not the first.
  func testAPhotoOpensWhereItWasTapped() {
    let app = launch()
    rowPhoto(app, "Cá neon gần cây").tap()
    XCTAssertTrue(counter(app, "2/3").waitForExistence(timeout: 5), "not on the photo tapped")
    // The pager on it too, not only the counter.
    XCTAssertTrue(viewerPhoto(app, "Ảnh 2 trên 3").isHittable, "the second photo isn't the one on screen")
    let shown = app.descendants(matching: .any)["picture-shown"]
    XCTAssertTrue(wait(shown, label: "full", timeout: 15), "the full photo didn't come: \(shown.label)")
  }

  /// Each photo in the row keeps to its own place. A picture wider than its place (only the stand-in is, in this row) was
  /// drawn clipped, but its frame reached 13 pt over the next photo's, for VoiceOver and where XCUITest aims.
  func testARowsPhotosKeepToTheirPlaces() {
    let app = launch()
    let first = rowPhoto(app, "Đàn cá neon trong bể")
    let second = app.buttons["Cá neon gần cây"].firstMatch
    XCTAssertTrue(second.exists, "no second photo")
    XCTAssertLessThanOrEqual(first.frame.maxX, second.frame.minX, "\(first.frame) reaches over \(second.frame)")
  }

  /// Photo 1 of 28 fetches 2 and 3 with it; photo 8, picked in the strip, 6 to 10: nothing further, and none between.
  /// Full photos held back (`-slow-pictures`), the fetches left far behind are stopped on the way.
  func testOnlyThePhotosNearTheOneShownAreFetched() {
    let app = launch("-slow-pictures", "-large-gallery")
    let all = app.buttons["gallery-all"]
    reveal(app, all)
    all.tap()
    let asked = app.descendants(matching: .any)["picture-requests"]
    XCTAssertTrue(wait(asked, label: "1 2 3", timeout: 5), "fetched \(asked.label), not 1 2 3")
    let eighth = app.buttons["Ảnh 8 trên 28"]
    XCTAssertTrue(eighth.waitForExistence(timeout: 3), "no photo 8 in the strip")
    eighth.tap()
    XCTAssertTrue(counter(app, "8/28").waitForExistence(timeout: 5), "not on photo 8")
    XCTAssertTrue(wait(asked, label: "1 2 3 6 7 8 9 10", timeout: 5), "fetched \(asked.label)")
    let stopped = app.descendants(matching: .any)["picture-stopped"]
    XCTAssertTrue(wait(stopped, label: "1 2 3", timeout: 5), "stopped \(stopped.label), not 1 2 3")
    settle(1.5)
    XCTAssertEqual(asked.label, "1 2 3 6 7 8 9 10", "fetched more than the photos near")
    // Swiped on: one more, the next but one, and the one now three behind stopped.
    app.swipeLeft()
    XCTAssertTrue(counter(app, "9/28").waitForExistence(timeout: 5), "didn't swipe to photo 9")
    XCTAssertTrue(wait(asked, label: "1 2 3 6 7 8 9 10 11", timeout: 5), "fetched \(asked.label)")
    XCTAssertTrue(wait(stopped, label: "1 2 3 6", timeout: 5), "stopped \(stopped.label), not 1 2 3 6")
  }

  /// Deep in the gallery, a photo waiting for its full photo shows its thumbnail at the screen's size: not the strip's,
  /// decoded for 40 points and blurred scaled up.
  func testAPhotoPickedInTheStripShowsItsThumbnailSharp() {
    let app = launch("-slow-pictures", "-large-gallery")
    let all = app.buttons["gallery-all"]
    reveal(app, all)
    all.tap()
    let eighth = app.buttons["Ảnh 8 trên 28"]
    XCTAssertTrue(eighth.waitForExistence(timeout: 5), "no photo 8 in the strip")
    eighth.tap()
    XCTAssertTrue(counter(app, "8/28").waitForExistence(timeout: 5), "not on photo 8")
    // Photo 11: in the strip now, and not in the page's row (its first ten), so its thumbnail in memory is the strip's.
    let eleventh = app.buttons["Ảnh 11 trên 28"]
    XCTAssertTrue(eleventh.waitForExistence(timeout: 5), "no photo 11 in the strip")
    settle(1)
    eleventh.tap()
    XCTAssertTrue(counter(app, "11/28").waitForExistence(timeout: 5), "not on photo 11")
    XCTAssertEqual(app.descendants(matching: .any)["picture-shown"].label, "thumb", "not waiting for its full photo")
    // A stand-in thumbnail is 600 pixels across.
    let pixels = app.descendants(matching: .any)["picture-pixels"]
    XCTAssertTrue(wait(pixels, label: "600", timeout: 5), "its thumbnail is shown \(pixels.label) pixels across, not 600")
  }

  /// A full photo that didn't come (no stand-ins: `-fixed-handbook` alone) is fetched again by "Thử lại".
  func testAPhotoThatDidntComeIsTriedAgain() {
    let app = launch(pictures: false)
    rowPhoto(app, "Đàn cá neon trong bể").tap()
    guard let retry = shownRetry(app, timeout: 10) else { return XCTFail("no retry for a photo that didn't come") }
    let tries = app.descendants(matching: .any)["picture-tries"]
    XCTAssertEqual(tries.label, "1")
    retry.tap()
    XCTAssertTrue(wait(tries, label: "2", timeout: 5), "fetched \(tries.label) times, not tried again")
    XCTAssertNotNil(shownRetry(app, timeout: 5), "no retry once it failed again")
  }

  /// Swiped to the next photo and back, its words and counter following.
  func testSwipingPages() {
    let app = openViewer()
    app.swipeLeft()
    XCTAssertTrue(counter(app, "2/3").waitForExistence(timeout: 3), "not on the second photo")
    XCTAssertTrue(app.staticTexts["Cá neon gần cây"].exists, "not the second photo's words")
    app.swipeRight()
    XCTAssertTrue(counter(app, "1/3").waitForExistence(timeout: 3), "not back on the first photo")
    XCTAssertTrue(app.staticTexts["Đàn cá neon trong bể"].exists, "not the first photo's words")
  }

  /// Swiped on the dark fade under the photo, above its words, it pages as on the photo.
  func testSwipingOnTheFadePages() {
    let app = openViewer()
    let words = app.staticTexts["Đàn cá neon trong bể"]
    let y = (words.frame.minY - 24) / app.frame.height
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: y))
      .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: y)), withVelocity: .fast,
             thenHoldForDuration: 0)
    XCTAssertTrue(counter(app, "2/3").waitForExistence(timeout: 3), "a swipe on the fade didn't page")
  }

  /// A tap hides the bar, the words and the counter; another shows them again.
  func testATapHidesAndShowsWhatsAroundThePhoto() throws {
    let app = openViewer()
    try app.performAccessibilityAudit(for: .sufficientElementDescription)
    middle(app).tap()
    XCTAssertTrue(gone(counter(app, "1/3")), "the counter stayed")
    XCTAssertFalse(app.buttons["Đóng"].isHittable, "the bar stayed")
    XCTAssertFalse(app.staticTexts["Đàn cá neon trong bể"].exists, "the words stayed")
    middle(app).tap()
    XCTAssertTrue(counter(app, "1/3").waitForExistence(timeout: 3), "the counter didn't come back")
    XCTAssertTrue(app.buttons["Đóng"].waitForExistence(timeout: 3), "the bar didn't come back")
  }

  /// Pulled down, it closes, back on the page.
  func testSwipingDownCloses() {
    let app = openViewer()
    app.swipeDown(velocity: .fast)
    XCTAssertTrue(gone(app.descendants(matching: .any)["gallery"]), "the viewer stayed open")
    XCTAssertTrue(app.buttons["gallery-all"].isHittable, "not back on the page")
  }

  /// Zoomed (double-tapped or pinched), a swipe moves the photo, not to the next one, even past the photo's edge (three
  /// swipes); zoomed out, it swipes again.
  func testZoomingStopsSwiping() {
    let app = openViewer()
    middle(app).doubleTap()
    settle(0.6)
    swipes(app)
    XCTAssertTrue(counter(app, "1/3").exists, "swiped to another photo while zoomed")
    middle(app).doubleTap()
    settle(0.6)
    app.swipeLeft()
    XCTAssertTrue(counter(app, "2/3").waitForExistence(timeout: 3), "didn't swipe once zoomed out")
    viewerPhoto(app, "Ảnh 2 trên 3").pinch(withScale: 3, velocity: 4)
    settle(0.6)
    swipes(app)
    XCTAssertTrue(counter(app, "2/3").exists, "swiped to another photo while pinched")
  }

  /// A reader's photo keeps its report and block menu in the viewer.
  func testAReadersPhotoKeepsItsMenu() {
    let app = launch("-fake-accounts", "on", "-reset-fake-server")
    rowPhoto(app, "Ảnh của Lan").tap()
    let menu = app.buttons["Tùy chọn cho ảnh của Lan"].firstMatch
    XCTAssertTrue(menu.waitForExistence(timeout: 10), "no options in the photo's viewer: \(app.debugDescription)")
    menu.tap()
    XCTAssertTrue(app.buttons["Báo cáo"].waitForExistence(timeout: 3), "no report in the menu")
    XCTAssertTrue(app.buttons["Chặn người này"].exists, "no block in the menu")
  }

  /// A place in a row given another photo (Minh's, once Lan is blocked from the viewer) shows that one, or a photo's
  /// place when it doesn't come (`-fail-pictures`): never the photo before, under the new one's words.
  func testARowsPlaceNeverShowsThePhotoBefore() {
    let app = launch("-fake-accounts", "on", "-reset-fake-server", "-fail-pictures", "p2-t")
    let lan = rowPhoto(app, "Ảnh của Lan")
    settle(1)
    XCTAssertGreaterThan(colour(lan.screenshot().image), 0.12, "Lan's photo isn't drawn")
    lan.tap()
    let menu = app.buttons["Tùy chọn cho ảnh của Lan"].firstMatch
    XCTAssertTrue(menu.waitForExistence(timeout: 10), "no options in the photo's viewer")
    menu.tap()
    let block = app.buttons["Chặn người này"]
    XCTAssertTrue(block.waitForExistence(timeout: 3), "no block in the menu")
    block.tap()
    let sure = app.buttons["Chặn"]
    XCTAssertTrue(sure.waitForExistence(timeout: 5), "not asked")
    sure.tap()
    XCTAssertTrue(gone(app.descendants(matching: .any)["gallery"]), "the viewer stayed open")
    let minh = app.buttons["Ảnh của Minh"]
    XCTAssertTrue(minh.waitForExistence(timeout: 5), "Minh's photo went too")
    XCTAssertFalse(app.buttons["Ảnh của Lan"].exists, "Lan's photo still shows")
    settle(1)
    XCTAssertLessThan(colour(minh.screenshot().image), 0.05, "Minh's photo didn't come, and its place shows another")
  }

  // MARK: -

  /// Cá neon's page, with stand-in photos (none come without `pictures`).
  private func launch(pictures: Bool = true, _ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"]
      + (pictures ? ["-fixed-pictures"] : []) + more
    app.launchForFlow()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("ca neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no Cá neon")
    row.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the fish isn't drawn by the app")
    return app
  }

  /// The viewer on Cá neon's first photo, its full photo shown.
  private func openViewer() -> XCUIApplication {
    let app = launch()
    rowPhoto(app, "Đàn cá neon trong bể").tap()
    XCTAssertTrue(counter(app, "1/3").waitForExistence(timeout: 5), "no viewer on the first photo")
    let shown = app.descendants(matching: .any)["picture-shown"]
    XCTAssertTrue(wait(shown, label: "full", timeout: 15), "the full photo didn't come: \(shown.label)")
    return app
  }

  /// A photo in a row on the page, whole above the tab bar, with room under it for the gallery's "all photos" button. A
  /// sliver of it above the bar counts as in view, and XCUITest then taps the sliver's corner, which can be the next
  /// photo's (4 pt showed in #481's run: it opened 2/3, and the flows said "no viewer").
  private func rowPhoto(_ app: XCUIApplication, _ words: String) -> XCUIElement {
    let photo = app.buttons[words].firstMatch
    reveal(app, photo)
    let bar = app.tabBars.firstMatch
    if bar.exists, photo.frame.maxY + 60 > bar.frame.minY {
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
      from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: bar.frame.minY - photo.frame.maxY - 60)), withVelocity: .slow,
                 thenHoldForDuration: 0.1)
      XCTAssertLessThanOrEqual(photo.frame.maxY, bar.frame.minY, "\(words) is still under the tab bar")
    }
    return photo
  }

  /// The counter under the photo: "1/3 · its note".
  private func counter(_ app: XCUIApplication, _ at: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", at + " · ")).firstMatch
  }

  /// The retry on the photo shown: those either side didn't come either, and have theirs off the screen.
  private func shownRetry(_ app: XCUIApplication, timeout: TimeInterval) -> XCUIElement? {
    let until = Date().addingTimeInterval(timeout)
    repeat {
      let on = app.buttons.matching(identifier: "photo-retry").allElementsBoundByIndex
        .first { app.frame.contains(CGPoint(x: $0.frame.midX, y: $0.frame.midY)) }
      if let on { return on }
      settle(0.5)
    } while Date() < until
    return nil
  }

  /// A photo in the viewer, by what VoiceOver says of it ("Ảnh 2 trên 3").
  private func viewerPhoto(_ app: XCUIApplication, _ label: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "viewer-photo").matching(NSPredicate(format: "label == %@", label)).firstMatch
  }

  private func middle(_ app: XCUIApplication) -> XCUICoordinate { app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)) }

  /// Three swipes to the left, each let settle: enough to take a zoomed photo to its edge and past it.
  private func swipes(_ app: XCUIApplication) {
    for _ in 0..<3 {
      app.swipeLeft()
      settle(0.6)
    }
  }

  private func wait(_ e: XCUIElement, label: String, timeout: TimeInterval) -> Bool {
    XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label == %@", label), object: e)], timeout: timeout) == .completed
  }

  private func gone(_ e: XCUIElement) -> Bool {
    XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: e)], timeout: 5) == .completed
  }

  private func settle(_ s: TimeInterval) {
    let until = Date().addingTimeInterval(s)
    while Date() < until { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
  }

  /// Scrolls the page down until `e` is on screen.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    for _ in 0..<24 where !(e.exists && e.isHittable) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .fast,
               thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }

  /// How light a small patch of the screen is around `at` (0 to 1 across and down), from 0 (black) to 1 (white).
  private func lightness(_ image: UIImage, around at: CGPoint) -> CGFloat {
    let n = 8
    var px = [UInt8](repeating: 0, count: n * n * 4)
    guard let cg = image.cgImage,
      let patch = cg.cropping(to: CGRect(x: CGFloat(cg.width) * at.x - 40, y: CGFloat(cg.height) * at.y - 40, width: 80, height: 80)),
      let ctx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4, space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return -1 }
    ctx.draw(patch, in: CGRect(x: 0, y: 0, width: n, height: n))
    var sum = 0
    for i in stride(from: 0, to: px.count, by: 4) { sum += Int(px[i]) + Int(px[i + 1]) + Int(px[i + 2]) }
    return CGFloat(sum) / CGFloat(n * n * 3 * 255)
  }

  /// How coloured a picture is on average, from 0 (greys only: a photo's place) to 1.
  private func colour(_ image: UIImage) -> CGFloat {
    let n = 8
    var px = [UInt8](repeating: 0, count: n * n * 4)
    guard let cg = image.cgImage,
      let ctx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4, space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return -1 }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))
    var sum = 0
    for i in stride(from: 0, to: px.count, by: 4) {
      let r = Int(px[i]), g = Int(px[i + 1]), b = Int(px[i + 2])
      sum += max(r, g, b) - min(r, g, b)
    }
    return CGFloat(sum) / CGFloat(n * n * 255)
  }
}
