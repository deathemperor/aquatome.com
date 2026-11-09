import XCTest

/// A gallery's photo grid (docs/design/photo-grid.md), on the fixed pages with stand-in photos (`-fixed-pictures`, no
/// network): its ways in, the count as its title, rows that keep each photo's shape, the viewer at the photo tapped and
/// back to where it closed, the readers' own part, what the top bar says, and only the screens near being fetched. The
/// `-hundreds-gallery` flag gives Cá neon 300 photos of the shapes below.
final class PhotoGridFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  private let shapes: [CGFloat] = [1200.0 / 800, 1200.0 / 900, 800.0 / 1000, 1, 1600.0 / 900, 900.0 / 1200, 3]

  /// The page's "Xem tất cả" opens the grid, not the viewer: its count first, then the page's name, where the photos are
  /// from, and a link to the readers' photos. The tab bar stays.
  func testThePagesButtonOpensTheGridWithItsCountFirst() {
    let app = launch()
    let all = app.buttons["gallery-all"]
    reveal(app, all)
    all.tap()
    XCTAssertTrue(app.staticTexts["3 ảnh"].waitForExistence(timeout: 5), "no count as the title")
    XCTAssertFalse(app.descendants(matching: .any)["gallery"].exists, "opened the viewer, not the grid")
    let line = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon, từ iNaturalist và Wikimedia Commons, giấy phép mở.")).firstMatch
    XCTAssertTrue(line.exists, "not the page's name, then the note less its count")
    XCTAssertGreaterThan(line.frame.minY, app.staticTexts["3 ảnh"].frame.maxY - 1, "the line above the title")
    XCTAssertTrue(readersLink(app).waitForExistence(timeout: 5), "no link to the readers' photos")
    XCTAssertTrue(app.tabBars.firstMatch.exists, "the tab bar went")
    XCTAssertEqual(app.buttons["grid-photo-1"].label, "Đàn cá neon trong bể, Ảnh 1 trên 3", "not named by its words and its place")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(all.waitForExistence(timeout: 5), "not back on the page")
  }

  /// The page's own photo carries how many it has, and the whole of it opens them all.
  func testTheLeadPhotoCarriesTheCountAndOpensTheGrid() {
    let app = launch("-hundreds-gallery")
    let lead = app.buttons["lead-photo-grid"]
    XCTAssertTrue(lead.waitForExistence(timeout: 5), "the lead photo isn't a way in")
    XCTAssertTrue(lead.label.hasSuffix("Xem tất cả 300 ảnh"), lead.label)
    // Its far corner, not only where the count is.
    lead.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.1)).tap()
    XCTAssertTrue(app.staticTexts["300 ảnh"].waitForExistence(timeout: 5), "no grid")
  }

  /// A page with no gallery: its lead photo is only a photo, and its readers' "Xem tất cả" opens the viewer, as today.
  func testAPageWithNoGalleryHasNoGrid() {
    let app = launch("-no-gallery")
    XCTAssertFalse(app.buttons["lead-photo-grid"].exists, "a way into a grid of nothing")
    let all = app.buttons["readers-all"]
    reveal(app, all)
    all.tap()
    XCTAssertTrue(app.descendants(matching: .any)["gallery"].waitForExistence(timeout: 5), "no viewer")
    XCTAssertTrue(app.staticTexts["1/2"].waitForExistence(timeout: 5), "not on the readers' first photo")
  }

  /// Edge to edge, 2 points between photos, each photo's shape kept, no row taller than 128 points at 402: with its
  /// pictures come, and just the same with none (each size is the data's, before a photo loads).
  func testRowsFillTheScreenAndKeepEachPhotosShape() {
    let app = launch("-hundreds-gallery")
    openGrid(app)
    let come = rows(app)
    XCTAssertGreaterThan(come.count, 3, "too few rows on the screen")
    app.terminate()
    let none = launch("-hundreds-gallery", "-fail-pictures", "g/many")
    openGrid(none)
    XCTAssertEqual(rows(none), come, "a row moved without its pictures")
  }

  /// At the largest text the words grow and wrap, inside the screen, and the rows stay as they are.
  func testAtTheLargestTextTheWordsGrowAndTheRowsStay() {
    let app = launch("-hundreds-gallery")
    openGrid(app)
    let normal = rows(app)
    let titleHeight = app.staticTexts["300 ảnh"].frame.height
    app.terminate()
    let large = launch("-hundreds-gallery", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    openGrid(large)
    XCTAssertGreaterThan(large.staticTexts["300 ảnh"].frame.height, titleHeight, "the title didn't grow")
    let line = large.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Cá neon, '")).firstMatch
    XCTAssertLessThanOrEqual(line.frame.maxX, large.frame.maxX, "the line runs off the screen")
    let first = rows(large, through: 3).first ?? [], before = normal.first ?? []
    XCTAssertEqual(first.count, before.count, "the first row changed with the text")
    for (a, b) in zip(first, before) {
      XCTAssertEqual(a.width, b.width, accuracy: 0.4, "a photo's width changed with the text")
      XCTAssertEqual(a.height, b.height, accuracy: 0.4, "a photo's height changed with the text")
    }
  }

  /// A thumbnail that doesn't come stays a plain cell: not a symbol among hundreds.
  func testAFailedThumbnailStaysAPlainCell() {
    let app = launch("-hundreds-gallery", "-fail-pictures", "g/many")
    openGrid(app)
    let cell = app.buttons["grid-photo-1"]
    settle(1)
    XCTAssertLessThan(spread(cell.screenshot().image), 6, "the cell isn't plain")
  }

  /// A tap opens the viewer at that photo, and closing it comes back to the grid.
  func testATapOpensTheViewerAtThatPhoto() {
    let app = launch()
    openGrid(app)
    app.buttons["grid-photo-2"].tap()
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH '2/3 · '")).firstMatch.waitForExistence(timeout: 5), "not on the photo tapped")
    app.buttons["Đóng"].tap()
    XCTAssertTrue(gone(app.descendants(matching: .any)["gallery"]), "the viewer stayed open")
    XCTAssertTrue(app.buttons["grid-photo-2"].isHittable, "not back on the grid")
  }

  /// Closed on a photo that's off the screen, the grid scrolls it into view.
  func testClosingOnAPhotoOffTheScreenScrollsItIntoView() {
    let app = launch("-hundreds-gallery")
    openGrid(app)
    app.swipeUp()
    settle(1)
    let bar = app.navigationBars.firstMatch
    // The first photo whole under the bar, well into the list: those before it are off the screen.
    let cells = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'grid-photo-'")).allElementsBoundByIndex
    guard let first = cells.first(where: { $0.frame.minY >= bar.frame.maxY }), let place = Int(first.identifier.dropFirst("grid-photo-".count)) else {
      return XCTFail("no photo under the bar")
    }
    XCTAssertGreaterThan(place, 12, "not scrolled far enough")
    let back = place - 8
    XCTAssertFalse(onScreen(app, app.buttons["grid-photo-\(back)"]), "photo \(back) was on the screen already")
    first.tap()
    XCTAssertTrue(counter(app, place).waitForExistence(timeout: 5), "not on photo \(place)")
    for k in 1...8 {
      app.swipeRight()
      XCTAssertTrue(counter(app, place - k).waitForExistence(timeout: 5), "didn't swipe back to photo \(place - k)")
    }
    app.buttons["Đóng"].tap()
    XCTAssertTrue(gone(app.descendants(matching: .any)["gallery"]), "the viewer stayed open")
    XCTAssertTrue(soon(onScreen(app, app.buttons["grid-photo-\(back)"])), "photo \(back) isn't in view")
  }

  /// Closed on a photo far down, on a row never yet drawn, the grid goes there and the row is where it belongs.
  func testClosingOnAPhotoFarDownGoesToItsRow() {
    let app = launch("-hundreds-gallery")
    openGrid(app)
    app.buttons["grid-photo-4"].tap()
    XCTAssertTrue(counter(app, 4).waitForExistence(timeout: 5), "not on photo 4")
    // Along the viewer's strip, which shows a few either side.
    for k in stride(from: 8, through: 40, by: 4) {
      let next = app.buttons["Ảnh \(k) trên 300"]
      XCTAssertTrue(next.waitForExistence(timeout: 5), "no photo \(k) in the strip")
      next.tap()
      XCTAssertTrue(counter(app, k).waitForExistence(timeout: 5), "not on photo \(k)")
    }
    app.buttons["Đóng"].tap()
    XCTAssertTrue(gone(app.descendants(matching: .any)["gallery"]), "the viewer stayed open")
    XCTAssertTrue(soon(onScreen(app, app.buttons["grid-photo-40"])), "photo 40 isn't in view")
    // Its row has its neighbours, 2 points away: not drawn by a guess at where it goes.
    let photo = app.buttons["grid-photo-40"].frame, next = app.buttons["grid-photo-41"].frame
    if abs(photo.minY - next.minY) < 1 {
      XCTAssertEqual(next.minX - photo.maxX, 2, accuracy: 0.7, "not 2 points beside its neighbour")
    } else {
      XCTAssertEqual(next.minY - photo.maxY, 2, accuracy: 0.7, "not 2 points above the next row")
    }
  }

  /// Closed on a photo still on the screen, nothing moves.
  func testClosingOnAPhotoOnTheScreenMovesNothing() {
    let app = launch("-hundreds-gallery")
    openGrid(app)
    let title = app.staticTexts["300 ảnh"].frame
    app.buttons["grid-photo-4"].tap()
    XCTAssertTrue(counter(app, 4).waitForExistence(timeout: 5), "not on photo 4")
    app.swipeLeft()
    XCTAssertTrue(counter(app, 5).waitForExistence(timeout: 5), "didn't swipe to photo 5")
    app.buttons["Đóng"].tap()
    XCTAssertTrue(gone(app.descendants(matching: .any)["gallery"]), "the viewer stayed open")
    XCTAssertEqual(app.staticTexts["300 ảnh"].frame, title, "the grid moved")
  }

  /// Nothing in the top bar under the title; the count once it has scrolled away; "Ảnh bạn đọc" once their part is in the
  /// upper half of the screen, and the count again above it.
  func testTheTopBarSaysWhereTheReaderIs() {
    let app = launch("-hundreds-gallery")
    openGrid(app)
    let count = app.navigationBars.staticTexts["300 ảnh"], theirs = app.navigationBars.staticTexts["Ảnh bạn đọc"]
    XCTAssertFalse(count.exists, "the count in the bar over the title")
    // Dragged just past the title: the count then, not some way on.
    let title = app.staticTexts["300 ảnh"].firstMatch, bar = app.navigationBars.firstMatch
    let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
    from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: bar.frame.maxY - title.frame.maxY - 24)), withVelocity: .slow, thenHoldForDuration: 0.3)
    XCTAssertTrue(count.waitForExistence(timeout: 3), "no count in the bar with the title just gone")
    app.swipeDown(velocity: .fast)
    XCTAssertTrue(soon(!count.exists), "the count stayed in the bar over the title")
    let link = readersLink(app)
    XCTAssertTrue(link.waitForExistence(timeout: 5), "no link to the readers' photos")
    link.tap()
    XCTAssertTrue(theirs.waitForExistence(timeout: 5), "the bar doesn't say the readers' part")
    XCTAssertFalse(count.exists, "the count still in the bar")
    // Right under the last of 300 photos, none drawn on the way: not by a guess at their heights.
    let last = app.buttons["grid-photo-300"], heading = app.descendants(matching: .any)["grid-readers-heading"]
    XCTAssertTrue(soon(last.exists), "the last photo isn't above the readers' part")
    XCTAssertEqual(heading.frame.minY - last.frame.maxY, 28, accuracy: 3, "the rows didn't land where their heights say")
    app.swipeDown(velocity: .fast)
    XCTAssertTrue(count.waitForExistence(timeout: 5), "the bar doesn't say the count again")
    XCTAssertFalse(theirs.exists, "the readers' part still in the bar")
  }

  /// Their own part, outside the count, its own counter and report menu in the viewer; a reader who can post, the button.
  func testTheReadersPartIsItsOwn() {
    let app = launch(accounts: "on")
    openGrid(app)
    XCTAssertTrue(readersLink(app).waitForExistence(timeout: 5), "no link")
    XCTAssertTrue(app.staticTexts["3 ảnh"].exists, "their photos counted in the title")
    XCTAssertTrue(app.staticTexts["2 ảnh bạn đọc gửi, ngoài 3 ảnh ở trên."].exists, "no line under their heading")
    let post = app.buttons["grid-post-photo"]
    reveal(app, post)
    XCTAssertEqual(post.label, "Gửi ảnh của bạn")
    XCTAssertEqual(app.buttons["grid-reader-2"].label, "Ảnh của Minh, Ảnh 2 trên 2")
    app.buttons["grid-reader-2"].tap()
    XCTAssertTrue(app.staticTexts["2/2"].waitForExistence(timeout: 5), "not on their own count")
    let menu = app.buttons["Tùy chọn cho ảnh của Minh"].firstMatch
    XCTAssertTrue(menu.waitForExistence(timeout: 5), "no report menu")
    // Reported: gone from the rows, and from the counts, when the viewer closes.
    menu.tap()
    app.buttons["Báo cáo"].tap()
    XCTAssertTrue(app.buttons["Lý do khác"].waitForExistence(timeout: 5), "not asked why")
    app.buttons["Lý do khác"].tap()
    let thanks = app.alerts["Đã gửi báo cáo. Cảm ơn bạn."]
    XCTAssertTrue(thanks.waitForExistence(timeout: 5), "the report wasn't received")
    thanks.buttons["Đóng"].tap()
    XCTAssertTrue(gone(app.descendants(matching: .any)["gallery"]), "the viewer stayed open")
    XCTAssertTrue(app.staticTexts["1 ảnh bạn đọc gửi, ngoài 3 ảnh ở trên."].waitForExistence(timeout: 5), "still counted")
    XCTAssertFalse(app.buttons["grid-reader-2"].exists, "the reported photo still shows")
  }

  /// With accounts off there's nothing to post with: their photos and no button.
  func testNoPostingWithoutAccounts() {
    let app = launch()
    openGrid(app)
    let photo = app.buttons["grid-reader-1"]
    reveal(app, photo)
    XCTAssertFalse(app.buttons["grid-post-photo"].exists, "a button for what can't be done")
  }

  /// Their "Xem tất cả" on the page opens this screen at their part.
  func testTheirButtonOnThePageOpensTheGridAtTheirPart() {
    let app = launch("-hundreds-gallery")
    let all = app.buttons["readers-all"]
    reveal(app, all)
    all.tap()
    let photo = app.buttons["grid-reader-1"]
    XCTAssertTrue(soon(photo.exists && photo.isHittable), "not at their part")
    XCTAssertTrue(soon(app.navigationBars.staticTexts["Ảnh bạn đọc"].exists), "the bar doesn't say the readers' part")
  }

  /// Hundreds of photos: the first screen and the next couple load, nothing further, and more as the reader scrolls.
  func testOnlyTheScreensNearAreFetched() {
    let app = launch("-hundreds-gallery", "-grid-log")
    openGrid(app)
    let asked = app.descendants(matching: .any)["grid-requests"]
    XCTAssertTrue(soon((places(asked).max() ?? 0) >= 45), "the next screens didn't load ahead: \(asked.label)")
    settle(1.5)
    let first = places(asked).max() ?? 0
    XCTAssertLessThan(first, 120, "fetched too far ahead: \(asked.label)")
    app.swipeUp()
    app.swipeUp()
    XCTAssertTrue(soon((places(asked).max() ?? 0) > first), "nothing more fetched further down: \(asked.label)")
    XCTAssertFalse(places(asked).contains(300), "fetched the last photo: \(asked.label)")
  }

  /// A cell that reaches the screen waits for the fetch already on its way ahead of it, and doesn't fetch its photo again.
  func testACellThatReachesTheScreenSharesTheFetchAheadOfIt() {
    let app = launch("-hundreds-gallery", "-grid-log", "-slow-thumbs")
    openGrid(app)
    let asked = app.descendants(matching: .any)["grid-requests"]
    XCTAssertTrue(soon(places(asked).contains(15)), "photo 15 not asked for: \(asked.label)")
    settle(1)
    // The furthest asked for is ahead of the screen, and held on its way (`-slow-thumbs`).
    guard let ahead = places(asked).max() else { return XCTFail("nothing asked for") }
    let cell = app.buttons["grid-photo-\(ahead)"]
    repeatUntil(onScreen(app, cell), times: 6) { app.swipeUp(velocity: .slow) }
    XCTAssertTrue(onScreen(app, cell), "photo \(ahead) never reached the screen")
    settle(1)
    // Past the page's row of ten, which the page asked for first.
    let repeats = places(app.descendants(matching: .any)["grid-repeats"]).filter { $0 > 10 }
    XCTAssertEqual(repeats, [], "fetched again though on their way")
  }

  /// A cell scrolled away stops loading: photo 15 (on the first screen, not in the page's row of ten).
  func testACellScrolledAwayStopsLoading() {
    let app = launch("-hundreds-gallery", "-grid-log", "-slow-thumbs")
    openGrid(app)
    let asked = app.descendants(matching: .any)["grid-requests"], stopped = app.descendants(matching: .any)["grid-stopped"]
    XCTAssertTrue(soon(places(asked).contains(15)), "photo 15 not asked for: \(asked.label)")
    XCTAssertFalse(places(stopped).contains(15), "photo 15 stopped before it left")
    for _ in 0..<3 { app.swipeUp(velocity: .fast) }
    XCTAssertTrue(soon(places(stopped).contains(15)), "photo 15 kept loading: \(stopped.label)")
  }

  // MARK: - Helpers

  /// Cá neon, its page open, on the old look: v2's page has no way into the grid yet.
  private func launch(accounts: String? = nil, _ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fixed-pictures"]
      + (accounts.map { ["-reset-fake-server", "-fake-accounts", $0] } ?? []) + more
    app.launchForFlow(.old)
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

  /// The grid, from the page's lead photo.
  private func openGrid(_ app: XCUIApplication) {
    let lead = app.buttons["lead-photo-grid"]
    XCTAssertTrue(lead.waitForExistence(timeout: 5), "no way into the grid")
    lead.tap()
    XCTAssertTrue(app.buttons["grid-photo-1"].waitForExistence(timeout: 5), "no grid")
  }

  /// The rows on the screen at the top of the grid (`-hundreds-gallery`), checked as they're read: each a row of frames.
  /// Once the readers' photos are read, which adds a link to the words above.
  private func rows(_ app: XCUIApplication, through: Int = 14) -> [[CGRect]] {
    XCTAssertTrue(readersLink(app).waitForExistence(timeout: 5), "no link to the readers' photos")
    let width = app.frame.width
    var rows: [[CGRect]] = []
    for place in 1...through {
      let cell = app.buttons["grid-photo-\(place)"]
      XCTAssertTrue(cell.waitForExistence(timeout: 5), "no photo \(place)")
      let frame = cell.frame
      // Each photo's shape, as near as whole pixels can draw it.
      XCTAssertEqual(frame.width / frame.height, shapes[(place - 1) % shapes.count], accuracy: 0.05, "photo \(place) isn't its shape")
      XCTAssertLessThanOrEqual(frame.height, 128 * width / 402 + 0.5, "photo \(place)'s row is too tall")
      if let last = rows.last?.last, abs(last.minY - frame.minY) < 1 {
        XCTAssertEqual(frame.minX - last.maxX, 2, accuracy: 0.7, "not 2 points beside photo \(place)")
        rows[rows.count - 1].append(frame)
      } else {
        if let last = rows.last?.last {
          XCTAssertEqual(frame.minY - last.maxY, 2, accuracy: 0.7, "not 2 points above photo \(place)'s row")
          XCTAssertEqual(last.maxX, width, accuracy: 0.7, "the row before photo \(place) doesn't reach the edge")
        }
        XCTAssertEqual(frame.minX, 0, accuracy: 0.5, "photo \(place)'s row doesn't start at the edge")
        rows.append([frame])
      }
    }
    return rows
  }

  /// The link in the words under the title, there once the readers' photos are read.
  private func readersLink(_ app: XCUIApplication) -> XCUIElement { app.links["Xem 2 ảnh bạn đọc gửi ↓"].firstMatch }

  private func onScreen(_ app: XCUIApplication, _ e: XCUIElement) -> Bool {
    guard e.exists else { return false }
    let top = app.navigationBars.firstMatch.frame.maxY, bottom = app.tabBars.firstMatch.exists ? app.tabBars.firstMatch.frame.minY : app.frame.maxY
    return e.frame.minY >= top - 1 && e.frame.maxY <= bottom + 1
  }

  /// The counter under the photo: "18/300 · its note".
  private func counter(_ app: XCUIApplication, _ place: Int) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "\(place)/300 · ")).firstMatch
  }

  private func places(_ e: XCUIElement) -> [Int] { e.exists ? e.label.split(separator: " ").compactMap { Int($0) } : [] }

  private func soon(_ done: @autoclosure () -> Bool, timeout: TimeInterval = 8) -> Bool {
    let until = Date().addingTimeInterval(timeout)
    repeat {
      if done() { return true }
      settle(0.25)
    } while Date() < until
    return false
  }

  private func gone(_ e: XCUIElement) -> Bool {
    XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "exists == false"), object: e)], timeout: 5) == .completed
  }

  private func settle(_ s: TimeInterval) {
    let until = Date().addingTimeInterval(s)
    while Date() < until { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
  }

  /// Scrolls down until `e` is on screen.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    repeatUntil(e.exists && e.isHittable, times: 24) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .fast,
               thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }

  /// How far apart a picture's colours are, 0 to 255: near 0 for one plain fill.
  private func spread(_ image: UIImage) -> Int {
    let n = 16
    var px = [UInt8](repeating: 0, count: n * n * 4)
    guard let cg = image.cgImage,
      let ctx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4, space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return 255 }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))
    var low = 255, high = 0
    for i in stride(from: 0, to: px.count, by: 4) {
      let v = Int(px[i]) + Int(px[i + 1]) + Int(px[i + 2])
      low = min(low, v / 3)
      high = max(high, v / 3)
    }
    return high - low
  }
}
