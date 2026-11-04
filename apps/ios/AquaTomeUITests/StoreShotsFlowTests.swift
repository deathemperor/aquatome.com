import ImageIO
import UniformTypeIdentifiers
import XCTest

/// The App Store's screenshots (apps/ios/store/listing.json): six screens in each of the listing's languages, on the
/// simulator the run is given (an iPhone 17 Pro Max for the 6.9" set, an iPhone 17 for the 6.3", an iPad Pro 13-inch
/// for the 13"). Each is kept with the run as `store-<lang>-<nn>-<screen>`, and apps/ios/scripts/store-shots.py exports
/// them for apps/ios/scripts/asc-listing.mjs. The handbook is aquatome.com's own, read over the network, so the pages are real;
/// the light, the plugs and the accounts are the simulator's stand-ins. The status bar (9:41, full battery and signal)
/// is set on the simulator before the run (.github/workflows/app-store.yml).
///
/// Not one of ios.yml's flows: it reads the live site, and checks only that each screen opened.
final class StoreShotsFlowTests: XCTestCase {
  override func setUp() {
    continueAfterFailure = false
    // An iPad can come up in landscape: the sets are portrait.
    XCUIDevice.shared.orientation = .portrait
  }

  func testVietnameseHandbook() { handbook(.vi) }
  func testVietnameseTank() { tank(.vi) }
  func testVietnameseLight() { light(.vi) }
  func testIndonesianHandbook() { handbook(.id) }
  func testIndonesianTank() { tank(.id) }
  func testIndonesianLight() { light(.id) }
  func testThaiHandbook() { handbook(.th) }
  func testThaiTank() { tank(.th) }
  func testThaiLight() { light(.th) }

  /// What each language's shots type and look for: the app's own words in that language (Localizable.xcstrings) and the
  /// names the site's handbook gives the fish in it.
  private struct Lang {
    let code: String
    let locale: String
    /// The tabs: Tìm, Bể của tôi, Đèn.
    let tabs: [String]
    /// Typed on the Tìm tab, and the row it opens: the neon tetra.
    let search: String
    let fish: String
    let tank: String
    /// The tank's fish: what's typed to find each, its row's name, how many.
    let life: [(query: String, name: String, count: Int)]
    /// The stand-in strip, named as its owner would in Smart Life; its first outlet, named in this language (the strip
    /// names it "Đèn"); and the role its third gets.
    let strip: String
    let lamp: String
    let filter: String
    /// The button that writes a schedule to the light the first time.
    let write: String

    static let vi = Lang(
      code: "vi", locale: "vi_VN", tabs: ["Tìm", "Bể của tôi", "Đèn"], search: "ca neon", fish: "Cá neon xanh",
      tank: "Bể cộng đồng",
      life: [("neon xanh", "Cá neon xanh", 12), ("tam giac", "Cá tam giác", 10), ("chuot dong", "Cá chuột đồng", 6),
             ("red cherry", "Tép red cherry", 10)],
      strip: "Ổ cắm bể 60", lamp: "Đèn", filter: "Lọc", write: "Ghi lịch")
    static let id = Lang(
      code: "id", locale: "id_ID", tabs: ["Cari", "Akuarium saya", "Lampu"], search: "neon", fish: "Neon tetra",
      tank: "Akuarium komunitas",
      life: [("neon tetra", "Neon tetra", 12), ("harlequin", "Rasbora Harlequin", 10),
             ("corydoras aeneus", "Corydoras bronze", 6), ("udang cherry", "Udang Cherry", 10)],
      strip: "Stopkontak akuarium 60", lamp: "Lampu", filter: "Filter", write: "Simpan jadwal")
    // Searched by scientific name: typed in Latin letters.
    static let th = Lang(
      code: "th", locale: "th_TH", tabs: ["ค้นหา", "ตู้ของฉัน", "ไฟ"], search: "neon", fish: "ปลานีออน",
      tank: "ตู้ปลารวม",
      life: [("paracheirodon innesi", "ปลานีออน", 12), ("trigonostigma heteromorpha", "ปลาซิวข้างขวานใหญ่", 10),
             ("corydoras aeneus", "แพะเขียว", 6), ("neocaridina davidi", "กุ้งเชอร์รี่", 10)],
      strip: "ปลั๊กไฟตู้ 60", lamp: "ไฟ", filter: "กรอง", write: "บันทึกตาราง")
  }

  /// 1, 3, 2: the Tìm home, a search typed without accents, and the fish it finds with its facts.
  private func handbook(_ l: Lang) {
    let app = launch(l)
    XCTAssertTrue(element(app, "shelf").waitForExistence(timeout: 30), "the handbook's index didn't load")
    shoot(l, 1, "home", settle: 3)
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    // Searched: the keyboard goes, the results stay.
    field.typeText(l.search + "\n")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", l.fish)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 10), "\(l.fish) not found")
    shoot(l, 3, "search")
    row.tap()
    XCTAssertTrue(element(app, "facts-card").waitForExistence(timeout: 10), "no facts above \(l.fish)")
    // The page drawn by the app, or the site's web page once its words are in.
    let web = app.webViews.firstMatch
    let drawn = NSPredicate { _, _ in self.element(app, "native-page").exists || web.staticTexts.count > 5 }
    XCTAssertEqual(XCTWaiter().wait(for: [expectation(for: drawn, evaluatedWith: nil)], timeout: 30), .completed, "\(l.fish)'s page didn't load")
    shoot(l, 2, "fish", settle: 3)
  }

  /// 4 and 6: a tank in Bể của tôi with four kinds on it and their tank-mates check, then a Smart Life strip on it from
  /// the stand-in Tuya cloud, its filter switched on.
  private func tank(_ l: Lang) {
    let app = launch(l, "-seed-tuya-keys", "-stand-in-strip", l.strip)
    tab(app, l.tabs[1])
    let first = app.buttons["add-first"]
    XCTAssertTrue(first.waitForExistence(timeout: 5), "not a new phone")
    first.tap()
    type(app, "name", l.tank)
    type(app, "l", "90")
    type(app, "w", "45")
    type(app, "h", "45")
    app.buttons["save"].tap()
    let tank = app.buttons["tank"].firstMatch
    XCTAssertTrue(tank.waitForExistence(timeout: 5), "the tank wasn't saved")
    tank.tap()
    for f in l.life { addLife(app, f.query, f.name, f.count) }
    // The check, under the fish.
    XCTAssertTrue(shows(app, element(app, "verdict")), "no tank-mates check")
    shoot(l, 4, "tank")

    scrolled(app, element(app, "add-plug")).tap()
    let strip = app.buttons.matching(identifier: "plug-choice").matching(NSPredicate(format: "label BEGINSWITH %@", l.strip)).firstMatch
    XCTAssertTrue(strip.waitForExistence(timeout: 10), "the stand-in strip isn't offered")
    strip.tap()
    let lamp = app.textFields["label-switch_1"]
    XCTAssertTrue(lamp.waitForExistence(timeout: 5), "no outlet form")
    if lamp.value as? String != l.lamp { lamp.clearAndType(l.lamp) }
    app.buttons["role-switch_3"].tap()
    let filter = app.buttons[l.filter].firstMatch
    XCTAssertTrue(filter.waitForExistence(timeout: 5), "no \(l.filter) to pick")
    filter.tap()
    app.buttons["save-plug"].tap()
    let outlet = app.switches["outlet-switch_3"]
    XCTAssertTrue(shows(app, outlet), "the plug isn't on the tank")
    outlet.tap()
    // On once the strip says so (its note shows while the command is on its way too).
    let on = expectation(for: NSPredicate(format: "value == '1'"), evaluatedWith: outlet)
    XCTAssertEqual(XCTWaiter().wait(for: [on], timeout: 15), .completed, "the filter wasn't switched")
    XCTAssertTrue(shows(app, element(app, "plug-name")))
    shoot(l, 6, "plugs")
  }

  /// 5: Đèn with the simulator's fake light connected and a schedule written to it, at the status bar's 9:41.
  private func light(_ l: Lang) {
    let app = launch(l, "-now", "09:41")
    tab(app, l.tabs[2])
    let scan = app.buttons["scan"]
    XCTAssertTrue(scan.waitForExistence(timeout: 5), "no scan")
    scan.tap()
    let found = app.buttons["light"].firstMatch
    XCTAssertTrue(found.waitForExistence(timeout: 10), "no light found")
    found.tap()
    XCTAssertTrue(element(app, "light-meta").waitForExistence(timeout: 15), "the light didn't connect")
    scrolled(app, element(app, "preset-settled")).tap()
    let write = element(app, "write")
    XCTAssertTrue(write.waitForExistence(timeout: 5))
    write.tap()
    let confirm = app.alerts.buttons[l.write]
    XCTAssertTrue(confirm.waitForExistence(timeout: 5), "no confirmation")
    confirm.tap()
    // Written once the light reported it: listed as the one in use (the button is off while it's being written, too).
    XCTAssertTrue(element(app, "in-use").waitForExistence(timeout: 20), "the schedule wasn't written")
    // The day's timeline near the top, the light above it.
    XCTAssertTrue(shows(app, element(app, "day")), "no timeline")
    // The light drawn whole under the bars at the top (the navigation bar, and an iPad's tabs; an iPad's drawing is
    // tall): as wide as the timeline, 320 × 190, and 6 points above the caption under it.
    let caption = element(app, "tank-now")
    XCTAssertTrue(caption.label.contains("09:41"), "the light's now isn't the status bar's: \(caption.label)")
    let drawing = caption.frame.minY - 6 - element(app, "day").frame.width * 190 / 320
    let window = app.windows.firstMatch.frame
    let bars = [app.navigationBars.firstMatch, app.buttons[l.tabs[2]].firstMatch].filter { $0.exists && $0.frame.midY < window.midY }
    let below = (bars.map { $0.frame.maxY }.max() ?? window.minY) + 8
    if drawing < below {
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: 0.4))
      from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: below - drawing + 10)), withVelocity: .slow,
                 thenHoldForDuration: 0.3)
    }
    shoot(l, 5, "light")
  }

  // MARK: Helpers

  private func launch(_ l: Lang, _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(\(l.code))", "-AppleLocale", l.locale, "-reset-defaults"] + args
    app.launch()
    return app
  }

  /// A tab by its name: in the tab bar on an iPhone, and at the top on an iPad.
  private func tab(_ app: XCUIApplication, _ name: String) {
    app.showTabs()
    let bar = app.tabBars.buttons[name]
    if bar.waitForExistence(timeout: 5) { return bar.tap() }
    let top = app.buttons[name].firstMatch
    XCTAssertTrue(top.waitForExistence(timeout: 5), "no tab \(name)")
    top.tap()
  }

  /// A fish put on the open tank from its "Thêm cá hoặc cây".
  private func addLife(_ app: XCUIApplication, _ query: String, _ name: String, _ count: Int) {
    scrolled(app, app.buttons["add-life"]).tap()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search for the tank's fish")
    field.tap()
    field.typeText(query)
    let row = app.buttons.matching(identifier: "life-item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 20), "\(name) not found for the tank")
    row.tap()
    let number = app.textFields["put-count"]
    XCTAssertTrue(number.waitForExistence(timeout: 5), "no count for \(name)")
    number.clearAndType(String(count))
    app.buttons["put-save"].tap()
    let added = app.descendants(matching: .any).matching(identifier: "life").matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
    XCTAssertTrue(added.waitForExistence(timeout: 5), "\(name) not on the tank")
  }

  private func type(_ app: XCUIApplication, _ id: String, _ text: String) {
    let field = element(app, id)
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no field \(id)")
    field.tap()
    field.typeText(text)
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: id).firstMatch
  }

  /// Dragged a third of the screen at a time, without a fling, until the element is on screen clear of the bars: down
  /// the screen while it's below the middle or not drawn yet (a list draws only rows near the screen), up while it's
  /// above.
  private func scrolled(_ app: XCUIApplication, _ e: XCUIElement) -> XCUIElement {
    _ = e.waitForExistence(timeout: 5)
    let window = app.windows.firstMatch.frame
    let top = window.minY + window.height * 0.15
    let bottom = window.maxY - window.height * 0.2
    for _ in 0..<15 {
      if e.exists, e.isHittable, e.frame.minY > top, e.frame.maxY < bottom { break }
      let down = !e.exists || e.frame.midY > (top + bottom) / 2
      let a = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: down ? 0.65 : 0.35))
      let b = app.coordinate(withNormalizedOffset: CGVector(dx: 0.97, dy: down ? 0.35 : 0.65))
      a.press(forDuration: 0.05, thenDragTo: b, withVelocity: .default, thenHoldForDuration: 0.2)
    }
    return e
  }

  /// Whether the element is on screen once scrolled to.
  private func shows(_ app: XCUIApplication, _ e: XCUIElement) -> Bool {
    let e = scrolled(app, e)
    return e.exists && e.isHittable
  }

  /// The screen as it is once pictures have drawn and scrolling has stopped, kept with the run: a PNG at the screen's
  /// own pixels with no alpha channel, which the App Store refuses.
  private func shoot(_ l: Lang, _ n: Int, _ name: String, settle: TimeInterval = 1.5) {
    // The whole tab bar, even where scrolling down to the part shown shrank it.
    XCUIApplication().showTabs()
    let until = Date().addingTimeInterval(settle)
    while Date() < until { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
    let png = Self.rgbPNG(XCUIScreen.main.screenshot().image)
    // A PNG's colour type is its 26th byte: 2 is RGB; 6, RGB with alpha.
    XCTAssertEqual(png.count > 25 ? png[25] : 0, 2, "the picture isn't written as an RGB PNG with no alpha channel, which the App Store requires")
    let shot = XCTAttachment(data: png, uniformTypeIdentifier: "public.png")
    shot.name = String(format: "store-%@-%02d-%@", l.code, n, name)
    shot.lifetime = .keepAlways
    add(shot)
  }

  /// The picture as a PNG with no alpha channel: drawn into pixels that have none, in its own colour space, and written
  /// by ImageIO, which then writes RGB. (UIGraphicsImageRenderer's PNG keeps an alpha channel even when opaque.)
  private static func rgbPNG(_ image: UIImage) -> Data {
    guard let cg = image.cgImage else { return Data() }
    let space = cg.colorSpace.flatMap { $0.model == .rgb ? $0 : nil } ?? CGColorSpace(name: CGColorSpace.sRGB)!
    guard let ctx = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: 0,
                              space: space, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return Data() }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    let out = NSMutableData()
    guard let flat = ctx.makeImage(),
          let file = CGImageDestinationCreateWithData(out, UTType.png.identifier as CFString, 1, nil) else { return Data() }
    CGImageDestinationAddImage(file, flat, nil)
    return CGImageDestinationFinalize(file) ? out as Data : Data()
  }
}

private extension XCUIElement {
  /// Taps at the end of the text, deletes it all (a few more times than it has letters: the first key can be lost while
  /// the field takes focus), then types.
  func clearAndType(_ text: String) {
    let old = value as? String ?? ""
    coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
    typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: old.count + 3) + text)
  }
}
