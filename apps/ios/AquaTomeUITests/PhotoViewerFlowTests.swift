import XCTest

/// A gallery's photo viewer, on the fixed pages with stand-in photos (`-fixed-pictures`, no network): a photo shows its
/// thumbnail at once while the full photo is on its way, the photos either side are fetched and no others, and the
/// viewer is swiped, tapped, zoomed and pulled down as a phone's photo viewer is.
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
    let shown = app.descendants(matching: .any)["picture-shown"]
    XCTAssertTrue(wait(shown, label: "full", timeout: 15), "the full photo didn't come: \(shown.label)")
  }

  /// Photo 1 of 28 fetches 2 and 3 with it; photo 8, picked in the strip, 6 to 10: nothing further, and none between.
  func testOnlyThePhotosNearTheOneShownAreFetched() {
    let app = launch("-large-gallery")
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
    settle(1.5)
    XCTAssertEqual(asked.label, "1 2 3 6 7 8 9 10", "fetched more than the photos near")
    // Swiped on: one more, the next but one.
    app.swipeLeft()
    XCTAssertTrue(counter(app, "9/28").waitForExistence(timeout: 5), "didn't swipe to photo 9")
    XCTAssertTrue(wait(asked, label: "1 2 3 6 7 8 9 10 11", timeout: 5), "fetched \(asked.label)")
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

  /// Zoomed (double-tapped or pinched), a swipe moves the photo, not to the next one; zoomed out, it swipes again.
  func testZoomingStopsSwiping() {
    let app = openViewer()
    middle(app).doubleTap()
    settle(0.6)
    app.swipeLeft()
    settle(0.6)
    XCTAssertTrue(counter(app, "1/3").exists, "swiped to another photo while zoomed")
    middle(app).doubleTap()
    settle(0.6)
    app.swipeLeft()
    XCTAssertTrue(counter(app, "2/3").waitForExistence(timeout: 3), "didn't swipe once zoomed out")
    app.descendants(matching: .any).matching(identifier: "viewer-photo").matching(NSPredicate(format: "label == %@", "Ảnh 2 trên 3")).firstMatch
      .pinch(withScale: 3, velocity: 4)
    settle(0.6)
    app.swipeLeft()
    settle(0.6)
    XCTAssertTrue(counter(app, "2/3").exists, "swiped to another photo while pinched")
  }

  /// A reader's photo keeps its report and block menu in the viewer.
  func testAReadersPhotoKeepsItsMenu() {
    let app = launch("-fake-accounts", "on", "-reset-fake-server")
    let photo = app.buttons["Ảnh của Lan"]
    reveal(app, photo)
    photo.tap()
    let menu = app.buttons["Tùy chọn cho ảnh của Lan"].firstMatch
    XCTAssertTrue(menu.waitForExistence(timeout: 10), "no options in the photo's viewer: \(app.debugDescription)")
    menu.tap()
    XCTAssertTrue(app.buttons["Báo cáo"].waitForExistence(timeout: 3), "no report in the menu")
    XCTAssertTrue(app.buttons["Chặn người này"].exists, "no block in the menu")
  }

  // MARK: -

  /// Cá neon's page, with stand-in photos.
  private func launch(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fixed-pictures"] + more
    app.launch()
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
    XCTAssertTrue(counter(app, "1/3").waitForExistence(timeout: 5), "no viewer")
    let shown = app.descendants(matching: .any)["picture-shown"]
    XCTAssertTrue(wait(shown, label: "full", timeout: 15), "the full photo didn't come: \(shown.label)")
    return app
  }

  /// A photo in the gallery's row on the page, in view.
  private func rowPhoto(_ app: XCUIApplication, _ words: String) -> XCUIElement {
    let photo = app.buttons[words].firstMatch
    reveal(app, photo)
    return photo
  }

  /// The counter under the photo: "1/3 · its note".
  private func counter(_ app: XCUIApplication, _ at: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", at + " · ")).firstMatch
  }

  private func middle(_ app: XCUIApplication) -> XCUICoordinate { app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45)) }

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
}
