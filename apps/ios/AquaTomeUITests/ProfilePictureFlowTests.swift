import XCTest

/// The account's picture (ProfilePictures): chosen from the Tài khoản sheet's "Ảnh đại diện" row, shown on the profile
/// button, cleared with "Bỏ ảnh", dropped on signing out, kept by the account; the set the app offers is
/// `protocols/profile-pictures.json`'s, and each fish has its name in another language than Vietnamese too. Against the
/// app's stand-in server (FakeServer).
final class ProfilePictureFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAChosenFishIsOnTheProfileButtonAndBoAnhTakesItOff() {
    let app = launch()
    signIn(app)
    XCTAssertFalse(redOnButton(app), "red on the button before any fish")
    XCTAssertEqual(row(app).value as? String, "", "a fish named before one's chosen")
    choose(app, "halfmoon-betta")
    XCTAssertFalse((row(app).value as? String ?? "").isEmpty, "the row doesn't name the fish chosen")
    app.closeAccount()
    // The halfmoon betta is red on black.
    XCTAssertTrue(redOnButton(app), "the fish chosen isn't on the profile button")

    app.openAccount()
    row(app).tap()
    let none = app.buttons["profile-picture-none"]
    XCTAssertTrue(none.waitForExistence(timeout: 5), "no Bỏ ảnh with a fish chosen")
    none.tap()
    XCTAssertTrue(none.waitForNonExistence(timeout: 5), "Bỏ ảnh still there with none chosen")
    back(app)
    XCTAssertEqual(row(app).value as? String, "", "a fish still named after Bỏ ảnh")
    app.closeAccount()
    XCTAssertFalse(redOnButton(app), "the fish still on the button after Bỏ ảnh")
  }

  func testSigningOutDropsTheFish() {
    let app = launch()
    signIn(app)
    choose(app, "halfmoon-betta")
    tapScrolling(app, "sign-out")
    XCTAssertTrue(signedOut(app), "still signed in")
    XCTAssertFalse(element(app, "account-picture").exists, "the picture's row signed out")
    app.closeAccount()
    XCTAssertFalse(redOnButton(app), "the fish on the button signed out")
  }

  /// The account keeps its fish: signed out and in again, the phone having dropped it, it comes back from the account,
  /// as on the reader's other phones; "Bỏ ảnh" takes it off the account too.
  func testTheAccountKeepsItsFishAndBoAnhTakesItOffThere() {
    let app = launch()
    signIn(app)
    choose(app, "halfmoon-betta")
    signOutAndIn(app)
    XCTAssertFalse((row(app).value as? String ?? "").isEmpty, "the account's fish didn't come back")
    app.closeAccount()
    XCTAssertTrue(redOnButton(app), "the account's fish isn't on the profile button")

    app.openAccount()
    row(app).tap()
    let none = app.buttons["profile-picture-none"]
    XCTAssertTrue(none.waitForExistence(timeout: 5), "no Bỏ ảnh with the account's fish")
    none.tap()
    back(app)
    signOutAndIn(app)
    XCTAssertEqual(row(app).value as? String, "", "the account kept the fish after Bỏ ảnh")
  }

  func testTheSetIsTheProtocolsAndNamedInIndonesian() throws {
    let app = launch("-AppleLanguages", "(id)", "-AppleLocale", "id_ID")
    signIn(app)
    row(app).tap()
    var repo = URL(fileURLWithPath: #filePath)
    for _ in 0..<4 { repo.deleteLastPathComponent() }
    let set = try JSONDecoder().decode(PictureSet.self, from: Data(contentsOf: repo.appending(path: "protocols/profile-pictures.json")))
    XCTAssertFalse(set.pictures.isEmpty)
    for p in set.pictures {
      let cell = app.buttons["profile-picture-\(p.id)"]
      repeatUntil(cell.exists && cell.isHittable, times: 8) { app.swipeUp() }
      XCTAssertTrue(cell.exists, "\(p.id) isn't offered")
      XCTAssertFalse(cell.label.trimmingCharacters(in: .whitespaces).isEmpty, "\(p.id) has no name in Indonesian")
    }
    XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'profile-picture-' AND identifier != 'profile-picture-none'")).count,
                   set.pictures.count, "the app offers others than the set's")
  }

  private struct PictureSet: Decodable {
    struct Picture: Decodable { let id: String }
    let pictures: [Picture]
  }

  private func launch(_ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    let lang = args.isEmpty ? ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN"] : []
    app.launchArguments = lang + ["-fixed-handbook", "-fake-accounts", "on", "-reset-defaults", "-reset-fake-server"] + args
    app.launchForFlow()
    return app
  }

  /// Signed in with the stand-in for Apple's sheet, the Tài khoản sheet open.
  private func signIn(_ app: XCUIApplication) {
    app.openAccount()
    tapScrolling(app, "apple-sign-in")
    XCTAssertTrue(row(app).waitForExistence(timeout: 10), "no picture row once signed in")
  }

  private func row(_ app: XCUIApplication) -> XCUIElement { app.buttons["account-picture"] }

  /// Signed out from the sheet, then in again to the same account (the stand-in Apple's).
  private func signOutAndIn(_ app: XCUIApplication) {
    tapScrolling(app, "sign-out")
    XCTAssertTrue(signedOut(app), "still signed in")
    tapScrolling(app, "apple-sign-in")
    XCTAssertTrue(row(app).waitForExistence(timeout: 10), "no picture row signed in again")
  }

  /// The fish chosen in the set, then back on the sheet.
  private func choose(_ app: XCUIApplication, _ id: String) {
    row(app).tap()
    let cell = app.buttons["profile-picture-\(id)"]
    XCTAssertTrue(cell.waitForExistence(timeout: 5), "no \(id) in the set")
    cell.tap()
    XCTAssertTrue(cell.isSelected, "\(id) not marked chosen")
    back(app)
  }

  private func back(_ app: XCUIApplication) {
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.buttons["account-done"].waitForExistence(timeout: 5), "not back on the sheet")
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

  /// Signed out: the sign-in at the sheet's top, scrolled back to from its foot, where "Đăng xuất" was. A sheet this long
  /// doesn't keep its top drawn while at its foot.
  private func signedOut(_ app: XCUIApplication) -> Bool {
    guard element(app, "sign-out").waitForNonExistence(timeout: 5) else { return false }
    let e = element(app, "apple-sign-in")
    repeatUntil(e.exists, times: 4) { app.swipeDown() }
    return e.exists
  }

  /// Scrolls the sheet until the element can be tapped, then taps it.
  private func tapScrolling(_ app: XCUIApplication, _ id: String) {
    let e = element(app, id)
    if !e.waitForExistence(timeout: 3) { repeatUntil(e.exists, times: 8) { app.swipeUp() } }
    repeatUntil(e.isHittable, times: 6) { app.swipeUp() }
    XCTAssertTrue(e.exists, "no \(id)")
    e.tap()
  }

  /// Whether the profile button is mostly a red picture: the halfmoon betta, not the person symbol in the bar's colour.
  private func redOnButton(_ app: XCUIApplication) -> Bool {
    let button = app.buttons.matching(identifier: "profile").firstMatch
    XCTAssertTrue(button.waitForExistence(timeout: 5), "no profile button")
    guard let image = button.screenshot().image.cgImage else { return false }
    let w = 24, h = 24
    var px = [UInt8](repeating: 0, count: w * h * 4)
    guard let c = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
    c.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    let red = stride(from: 0, to: px.count, by: 4).filter { i in
      let r = Int(px[i]), g = Int(px[i + 1]), b = Int(px[i + 2])
      return r > 110 && r > g * 2 && r > b * 2
    }.count
    return red * 8 > w * h
  }
}
