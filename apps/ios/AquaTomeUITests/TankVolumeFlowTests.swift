import XCTest

/// The tank volume tool drawn by the app (TankVolumeView), not the site's page: opened from search and from a page's
/// link on the tab in front, the site's numbers for the same sizes (protocols/volume-vectors.json), its refusals, and
/// "Lưu vào Bể của tôi". No network: the fixed handbook, and the heater link's web page is a stand-in naming its path.
final class TankVolumeFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testOpensFromSearchAsTheAppsOwnScreen() {
    let app = launch()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    // By its page's words, typed without accents.
    field.typeText("the tich be")
    let tool = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Bể bao nhiêu lít?'")).firstMatch
    XCTAssertTrue(tool.waitForExistence(timeout: 5), "the tool not found")
    tool.tap()
    XCTAssertTrue(app.navigationBars["Bể bao nhiêu lít?"].waitForExistence(timeout: 5), "the tool's screen didn't open")
    XCTAssertEqual(app.webViews.count, 0, "the web page opened")
    // The page's first state, a 60 × 30 × 36 cm box: what it works out on the first screen, in the site's figures.
    let result = self.result(app)
    XCTAssertTrue(result.waitForExistence(timeout: 5))
    XCTAssertTrue(result.isHittable, "the litres below the first screen")
    keep(app, "box")
    for line in ["64,8 lít (17,1 gallon Mỹ)", "Nước thực tế sau khi trải nền, đặt đá lũa: khoảng 55 lít (55 kg nước).",
                 "Kính trước tối thiểu 5 mm → đặt kính 5 mm, kính nặng khoảng 10 kg."] {
      XCTAssertTrue(result.label.contains(line), result.label)
    }

    // Inches: what's typed converted, the same tank.
    show(app, app.buttons["inch"], up: false)
    app.buttons["inch"].tap()
    XCTAssertEqual(app.textFields["l"].value as? String, "23,6")
    XCTAssertTrue(result.label.hasPrefix("64,8 lít"), result.label)
    app.buttons["cm"].tap()

    // The heater calculator for this box, on the site's page of calculators (not drawn by the app yet).
    let heater = app.links["Cần sưởi bao nhiêu W cho bể này →"]
    show(app, heater)
    heater.tap()
    XCTAssertTrue(app.webViews.staticTexts["/vi/cong-cu/?l=60&w=30&h=36"].waitForExistence(timeout: 15), "not the heater calculator for this box")
  }

  func testAShapesLitresAreTheSites() {
    let app = openTool()
    let result = self.result(app)
    // The vectors' elongated hexagon: 60 × 30, front 30, 40 high → 54 litres. The sizes it shares with the box stay.
    shape(app, "Lục giác")
    XCTAssertEqual(result.label, "Nhập kính trước.")
    field(app, "f").clearAndType("30")
    field(app, "h").clearAndType("40")
    XCTAssertTrue(result.label.hasPrefix("54 lít"), result.label)
    XCTAssertFalse(result.label.contains("Kính trước tối thiểu"), "glass for a tank that isn't a box")

    // A cylinder, 40 across, 50 high, filled to 25 cm: 62.8 litres, 31.4 to the water line.
    shape(app, "Trụ tròn")
    field(app, "d").clearAndType("40")
    field(app, "h").clearAndType("50")
    field(app, "fill").clearAndType("25")
    keep(app, "cylinder")
    for line in ["62,8 lít", "Tới mực nước: 31,4 lít.", "Nước thực tế sau khi trải nền, đặt đá lũa: khoảng 27 lít (27 kg nước)."] {
      XCTAssertTrue(result.label.contains(line), result.label)
    }

    // A ready-made tank from the table: the form set to it, as the site's link sets the page.
    let row = app.links["100 × 50 × 50"]
    show(app, row)
    row.tap()
    XCTAssertTrue(result.waitForExistence(timeout: 5))
    XCTAssertTrue(result.label.hasPrefix("250 lít"), result.label)
    XCTAssertTrue(result.label.contains("Kính trước tối thiểu 8,8 mm → đặt kính 10 mm, kính nặng khoảng 50 kg."), result.label)
  }

  func testRefusesAnImpossibleTankAsTheSiteDoes() {
    let app = openTool()
    let result = self.result(app)
    shape(app, "Lục giác")
    field(app, "f").clearAndType("70")
    XCTAssertEqual(result.label, "Kính trước phải ngắn hơn chiều dài.")
    keep(app, "refused")
    // The result in sight, and so the row under it: a form draws only the rows on screen.
    show(app, result)
    XCTAssertFalse(saveRow(app).exists, "offered to save")
    field(app, "f").clearAndType("30")
    field(app, "fill").clearAndType("50")
    XCTAssertEqual(result.label, "Mực nước phải lớn hơn 0 và không cao hơn bể.")
    // Its height left at the box's 36 cm: 30 × (60 + 30) / 2 × 36 → 48.6 litres, 27 to the water line.
    field(app, "fill").clearAndType("20")
    XCTAssertTrue(result.label.hasPrefix("48,6 lít"), result.label)
    XCTAssertTrue(result.label.contains("Tới mực nước: 27 lít."), result.label)
    show(app, result)
    XCTAssertTrue(saveRow(app).exists, "a tank it works out not offered to save")
  }

  /// Every other pane longer than the side it sits on, refused in the site's words.
  func testEachPaneLongerThanItsSideIsRefusedInTheSitesWords() {
    let app = openTool()
    let result = self.result(app)
    shape(app, "Bát giác")
    field(app, "f").clearAndType("30")
    field(app, "e").clearAndType("40")
    XCTAssertEqual(result.label, "Kính hông phải ngắn hơn chiều rộng.")
    shape(app, "Ngũ giác góc")
    field(app, "a").clearAndType("40")
    field(app, "b").clearAndType("50")
    XCTAssertEqual(result.label, "Cạnh ngắn phải ngắn hơn cạnh áp tường.")
    shape(app, "Chữ L")
    for (key, cm) in [("l1", "60"), ("w1", "30"), ("l2", "50"), ("w2", "70")] { field(app, key).clearAndType(cm) }
    XCTAssertEqual(result.label, "Rộng nhánh 2 phải ngắn hơn dài nhánh 1.")
    field(app, "w2").clearAndType("20")
    field(app, "w1").clearAndType("60")
    XCTAssertEqual(result.label, "Rộng nhánh 1 phải ngắn hơn dài nhánh 2.")
  }

  /// A box keeps its sides on the tank, any other shape its litres, as the site's tools save.
  func testSavesToANewTankThenToItAgain() {
    let app = openTool()
    let name = app.textFields["tank-name"]
    show(app, name)
    name.tap()
    name.typeText("Bể đo")
    let save = app.buttons["save-volume"]
    show(app, save)
    save.tap()
    XCTAssertTrue(read(app, "saved").hasPrefix("Đã lưu vào “Bể đo”."))
    keep(app, "saved")
    openTank(app)
    XCTAssertTrue(app.navigationBars["Bể đo"].waitForExistence(timeout: 5), "not the tank saved")
    XCTAssertEqual(app.staticTexts["facts"].label, "60 × 30 × 36 cm · 64,8 lít")

    // Back to the tool, still open on the Tìm tab: a cylinder onto the same tank, now picked.
    app.openTab("Tìm")
    XCTAssertTrue(app.navigationBars["Bể bao nhiêu lít?"].waitForExistence(timeout: 5))
    shape(app, "Trụ tròn")
    field(app, "d").clearAndType("40")
    field(app, "h").clearAndType("50")
    show(app, save)
    XCTAssertFalse(app.textFields["tank-name"].exists, "a new tank's name asked for the tank picked")
    save.tap()
    XCTAssertTrue(read(app, "saved").hasPrefix("Đã lưu vào “Bể đo”."))
    openTank(app)
    XCTAssertTrue(app.navigationBars["Bể đo"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.staticTexts["facts"].label, "62,8 lít")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.buttons["tank"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.buttons.matching(identifier: "tank").count, 1, "a second tank")
  }

  /// A page's link to the tool opens the app's screen on the tab it's in: here a tank's guide, on the tanks tab.
  func testOpensFromAPagesLinkOnTheTabInFront() {
    let app = launch("-seed-tanks", "life")
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    let guide = app.buttons.matching(identifier: "tank-guide").firstMatch
    for _ in 0..<6 where !(guide.exists && guide.isHittable) { app.swipeUp() }
    guide.tap()
    XCTAssertTrue(app.navigationBars["Nuôi cá neon trong bể nhỏ"].waitForExistence(timeout: 5), "the guide didn't open")
    let tool = app.descendants(matching: .any)["native-page"].buttons.matching(NSPredicate(format: "label BEGINSWITH 'Bể bao nhiêu lít?'")).firstMatch
    show(app, tool)
    tool.tap()
    XCTAssertTrue(app.navigationBars["Bể bao nhiêu lít?"].waitForExistence(timeout: 5), "the tool's screen didn't open")
    XCTAssertTrue(app.tabBars.buttons["Bể của tôi"].isSelected, "not on the tanks tab")
    XCTAssertEqual(app.webViews.count, 0, "the web page opened")
    XCTAssertTrue(result(app).waitForExistence(timeout: 5))
  }

  // MARK: Helpers

  private func launch(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"] + more
    app.launch()
    return app
  }

  /// The tool from the Tìm tab's tools.
  private func openTool() -> XCUIApplication {
    let app = launch()
    let tool = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Bể bao nhiêu lít?'")).firstMatch
    for _ in 0..<10 where !(tool.exists && tool.isHittable) { app.swipeUp() }
    tool.tap()
    XCTAssertTrue(app.navigationBars["Bể bao nhiêu lít?"].waitForExistence(timeout: 5), "the tool's screen didn't open")
    return app
  }

  /// A shape from the row of shapes, dragged along to it.
  private func shape(_ app: XCUIApplication, _ name: String) {
    let row = app.scrollViews["shapes"]
    show(app, row, up: false)
    let b = row.buttons.matching(identifier: "shape").matching(NSPredicate(format: "label == %@", name)).firstMatch
    for _ in 0..<6 where !(b.exists && b.isHittable) {
      let most = row.frame.width / 2 - 20
      drag(app, from: CGPoint(x: row.frame.midX, y: row.frame.midY), by: CGVector(dx: min(max(row.frame.midX - b.frame.midX, -most), most), dy: 0))
    }
    XCTAssertTrue(b.exists && b.isHittable, "no shape \(name)")
    b.tap()
    XCTAssertTrue(b.isSelected, "\(name) not picked")
  }

  /// "Lưu vào Bể của tôi": the first row of the save, there only when the tool offers it.
  private func saveRow(_ app: XCUIApplication) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Lưu vào Bể của tôi'")).firstMatch
  }

  /// What the tool works out, as one text.
  private func result(_ app: XCUIApplication) -> XCUIElement { app.staticTexts["result"].firstMatch }

  /// The saved line's link to the tank.
  private func openTank(_ app: XCUIApplication) {
    let link = app.links["Xem trong Bể của tôi →"]
    show(app, link)
    link.tap()
  }

  /// A text, scrolled to: a form draws only the rows on screen.
  private func read(_ app: XCUIApplication, _ id: String) -> String {
    let e = app.staticTexts[id].firstMatch
    show(app, e)
    return e.label
  }

  /// A size's box, scrolled to, above the keyboard.
  private func field(_ app: XCUIApplication, _ key: String) -> XCUIElement {
    let e = app.textFields[key]
    show(app, e, up: false)
    return e
  }

  /// In view and clear of the bars: a row scrolled under the status bar still reads as hittable, and a drag there moves
  /// nothing (the shapes' row, once typing has scrolled the form up).
  private func shown(_ app: XCUIApplication, _ e: XCUIElement) -> Bool {
    e.exists && e.isHittable && e.frame.minY >= app.frame.minY + 100
  }

  /// `e` scrolled into sight, clear of the bars and the keyboard. Dragged slowly, so the screen stops where it's let go
  /// (a swipe flings past), towards where `e` lies, or `up` (on down the screen) while the form hasn't drawn it.
  private func show(_ app: XCUIApplication, _ e: XCUIElement, up: Bool = true) {
    for _ in 0..<12 where !shown(app, e) {
      let keyboard = app.keyboards.firstMatch
      let top = app.frame.minY + 120, bottom = keyboard.exists ? keyboard.frame.minY : app.frame.maxY - 100
      let middle = (top + bottom) / 2, most = (bottom - top) / 2 - 20
      let by = e.exists ? min(max(middle - e.frame.midY, -most), most) : (up ? -most : most)
      // From the labels' side, clear of the boxes (a drag from a box moves its cursor) and of the edge's swipe back.
      drag(app, from: CGPoint(x: app.frame.minX + 44, y: middle), by: CGVector(dx: 0, dy: by))
    }
    XCTAssertTrue(shown(app, e), "\(e) not found")
  }

  private func drag(_ app: XCUIApplication, from p: CGPoint, by v: CGVector) {
    let start = app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: p.x, dy: p.y))
    start.press(forDuration: 0.05, thenDragTo: start.withOffset(v), withVelocity: .slow, thenHoldForDuration: 0.2)
  }

  /// A screenshot kept with the results, to look at.
  private func keep(_ app: XCUIApplication, _ name: String) {
    let shot = XCTAttachment(screenshot: app.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }
}

private extension XCUIElement {
  /// Its number replaced: picked whole by a double tap, as where a tap leaves the cursor varies, then typed over.
  func clearAndType(_ text: String) {
    tap()
    if let old = value as? String, !old.isEmpty, old != placeholderValue {
      doubleTap()
      typeText(XCUIKeyboardKey.delete.rawValue)
    }
    typeText(text)
    XCTAssertEqual(value as? String, text, "not typed over")
  }
}
