import XCTest

/// Screenshots of the handbook's pages, from top to bottom, for a pull request's before and after (docs/governance.md):
/// kept with the run (`shot-…`), and put in the `ios-page-shots` artifact by apps/ios/scripts/shots.py. A fish, a plant,
/// a guide, a video series and a kind of kit, in light, the fish and the kit in dark too, the fish's top at a large text
/// size, and a guide's video playing in its page (the stand-in player); the fish-ID screen with its guesses, light and
/// dark; photos as stand-ins (`-fixed-pictures`). Also the Tài khoản sheet with the ways to sign in, in light and in
/// dark, on a new phone. And a search's results under the kinds it finds, light and dark, at the default and the
/// largest text size, with more found than listed, and with a kind picked that it finds none of, at both sizes; the app's
/// icon picker; the lights tab's card for the fake light, its clock lost, warning of its outlet's timer on the stand-in
/// Tuya cloud; Tìm's tools, light, dark and at the largest text; what's new, its row on the home then its list, and kit's
/// section on the home then a long list's whole list, light and dark; a gallery's photo grid, light, dark and at the largest text; Bể của tôi, empty and with a tank; and the owner's dashboard on the stand-in server, its
/// overview (light, dark, at the largest text, and with nothing to do), its bell's sheet, a section with charts and tables
/// and Comments (each light, dark and at the largest text), and the daily report's settings; the tab bar over what scrolls
/// under it, a fish's long text and Tìm's photos, light and dark, on the site's own pages; and v2's Hôm nay, its fish of the
/// day's page and Khám phá, light, dark and at the largest text, and in Malay. The lights tab top to
/// bottom (its Week Aqua row last), and the Week Aqua screen with the simulator's group connected (`-fake-weekaqua`).
/// Each checks only that its screen opened:
/// what it shows, the other flows check.
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
  func testTheLightsTab() {
    let app = launch(dark: false, size: nil)
    app.openTab("Đèn")
    XCTAssertTrue(app.descendants(matching: .any)["weekaqua"].waitForExistence(timeout: 5), "no Week Aqua row on the lights tab")
    capture(app, "lights-light", dark: false, from: 0.6, x: 0.97)
  }
  func testTheWeekAquaScreen() { shootWeekAqua("weekaqua-light") }
  func testTheWeekAquaScreenInTheDark() { shootWeekAqua("weekaqua-dark", dark: true) }
  /// The Week Aqua screen with the simulator's group connected (`-fake-weekaqua`), top to bottom.
  private func shootWeekAqua(_ name: String, dark: Bool = false) {
    let app = launch(dark: dark, size: nil, ["-fake-weekaqua"])
    app.openTab("Đèn")
    let entry = app.descendants(matching: .any)["weekaqua"]
    XCTAssertTrue(entry.waitForExistence(timeout: 5), "no Week Aqua row on the lights tab")
    // The row is last, above the write bar once the tab is scrolled to its end.
    for _ in 0..<8 { app.swipeUp() }
    entry.tap()
    let scan = app.buttons["wa-scan"]
    XCTAssertTrue(scan.waitForExistence(timeout: 5), "the Week Aqua screen didn't open")
    scan.tap()
    let lights = app.buttons.matching(identifier: "wa-light")
    XCTAssertTrue(lights.element(boundBy: 2).waitForExistence(timeout: 5), "the three 5746 lights weren't found")
    for i in 0..<3 { lights.element(boundBy: i).tap() }
    app.buttons["wa-connect"].tap()
    XCTAssertTrue(app.staticTexts["wa-title"].waitForExistence(timeout: 10), "the group didn't connect")
    for _ in 0..<4 { app.swipeDown() }
    capture(app, name, dark: dark, from: 0.6, x: 0.97)
  }

  func testTheAppIcons() { shootIcons("icons-light") }
  func testTheAppIconsInTheDark() { shootIcons("icons-dark", dark: true) }
  func testALightsCardWarningOfItsOutletsTimer() { shootLightCard("light-outlet") }
  func testTheOwnersDashboard() { shootOwner("owner-light", section: nil) }
  func testTheOwnersDashboardInTheDark() { shootOwner("owner-dark", section: nil, dark: true) }
  func testTheOwnersDashboardInTheLargestText() { shootOwner("owner-largest", section: nil, size: largest) }
  /// The needs rows at the largest text, from the Needs you tile, which scrolls to them.
  func testTheOwnersNeedsInTheLargestText() { shootOwner("owner-needs-largest", section: nil, size: largest, tile: "needs", screens: 3) }
  func testTheOwnersDashboardWithNothingToDo() { shootOwner("owner-all-clear", section: nil, more: ["-owner-overview", "dashboard: nothing needs you"]) }
  func testTheDailyReportsDelivery() { shootOwner("owner-bell-light", section: nil, bell: true) }
  func testAnOwnersSection() { shootOwner("owner-section-light", section: "Calls and keys") }
  func testAnOwnersSectionInTheDark() { shootOwner("owner-section-dark", section: "Calls and keys", dark: true) }
  func testAnOwnersSectionInTheLargestText() { shootOwner("owner-section-largest", section: "Calls and keys", size: largest) }
  func testTheOwnersComments() { shootOwner("owner-comments-light", section: "Comments", shows: "owner-comment-filter") }
  func testTheOwnersCommentsInTheDark() { shootOwner("owner-comments-dark", section: "Comments", shows: "owner-comment-filter", dark: true) }
  func testTheOwnersCommentsInTheLargestText() { shootOwner("owner-comments-largest", section: "Comments", shows: "owner-comment-filter", size: largest) }
  func testTheDailyReportsSettings() { shootOwner("owner-report-light", section: "Daily reports", shows: "owner-action") }
  func testSigningIn() { shootSignIn("sign-in-light") }
  func testSigningInInTheDark() { shootSignIn("sign-in-dark", dark: true) }
  func testSigningInInTheLargestText() { shootSignIn("sign-in-largest-light", size: largest) }
  func testTheAccountSignedIn() { shootAccount("account-light") }
  func testTheAccountSignedInInTheDark() { shootAccount("account-dark", dark: true) }
  func testTheAccountSignedInInTheLargestText() { shootAccount("account-largest-light", size: largest) }
  func testFishId() { shootFishId("fish-id-light") }
  func testFishIdInTheDark() { shootFishId("fish-id-dark", dark: true) }
  func testAKindOfKit() { shoot("kit-light", "loc", "Lọc", more: ["-equipment"]) }
  func testAKindOfKitInTheDark() { shoot("kit-dark", "loc", "Lọc", dark: true, more: ["-equipment"]) }
  func testTheToolsOnTim() { shootTools("tools-light") }
  func testTheToolsOnTimInTheDark() { shootTools("tools-dark", dark: true) }
  func testTheToolsOnTimInTheLargestText() { shootTools("tools-largest-light", size: largest, screens: 2) }
  func testTheHome() { shootHome("tim-light") }
  func testTheHomeOnANewPhone() { shootHome("tim-new-light", read: false) }
  func testTheHomeInTheDark() { shootHome("tim-dark", dark: true) }
  func testTheHomeInTheLargestText() { shootHome("tim-largest-light", size: largest) }
  func testKitOnTheHomeAndALongList() { shootKit("kit-home-light") }
  func testKitOnTheHomeAndALongListInTheDark() { shootKit("kit-home-dark", dark: true) }
  func testWhatsNew() { shootWhatsNew("whats-new-light") }
  func testWhatsNewInTheDark() { shootWhatsNew("whats-new-dark", dark: true) }
  func testTheTabBarOverText() { shootTabBar("tab-bar-text-light", overText: true) }
  func testTheTabBarOverTextInTheDark() { shootTabBar("tab-bar-text-dark", overText: true, dark: true) }
  func testTheTabBarOverPhotos() { shootTabBar("tab-bar-photos-light", overText: false) }
  func testTheTabBarOverPhotosInTheDark() { shootTabBar("tab-bar-photos-dark", overText: false, dark: true) }
  func testV2() { shootV2("v2-light") }
  func testV2InTheDark() { shootV2("v2-dark", dark: true) }
  func testV2InTheLargestText() { shootV2("v2-largest-light", size: largest) }
  func testV2InMalayInTheDarkAtTheLargestText() { shootV2("v2-ms-largest-dark", dark: true, size: largest, lang: ("ms", "ms_MY", "Teroka")) }

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

  /// Bể của tôi empty (signed out: the hint that opens the Tài khoản sheet), then with a tank: the list, to its end.
  func testTheTanksList() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fake-accounts", "on",
                           "-reset-fake-server"]
    app.launchForFlow(.old)
    app.openTab("Bể của tôi")
    let first = app.buttons["add-first"]
    XCTAssertTrue(first.waitForExistence(timeout: 5), "no tanks tab")
    XCTAssertTrue(app.buttons["sign-in-hint"].waitForExistence(timeout: 10), "no hint to sign in on the empty tab")
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

  /// The Tài khoản sheet on a new phone, signed out, with each way to sign in the stand-in server offers, screen by
  /// screen to its end (the app's settings, the site's pages about itself).
  private func shootSignIn(_ name: String, dark: Bool = false, size: String? = nil) {
    let app = launch(dark: dark, size: size, ["-fake-accounts", "on", "-reset-fake-server"])
    app.openAccount()
    XCTAssertTrue(app.descendants(matching: .any)["apple-sign-in"].waitForExistence(timeout: 5), "no sign-in")
    capture(app, name, dark: dark, large: size != nil, screens: size == nil ? 6 : 10)
  }

  /// The Tài khoản sheet signed in, as the owner (the dashboard's row too), screen by screen to its end (signing out,
  /// deleting the account, the version).
  private func shootAccount(_ name: String, dark: Bool = false, size: String? = nil) {
    let app = launch(dark: dark, size: size, XCUIApplication.standInOwner)
    app.openAccount()
    // Signed in, back at the sheet's top: at the largest text the button is a few screens down.
    app.scrollToAndTap("apple-sign-in")
    let top = app.staticTexts["account-status"], owner = app.descendants(matching: .any)["owner-dashboard"].firstMatch
    repeatUntil(top.exists && top.isHittable, times: 12) { app.swipeDown() }
    XCTAssertTrue(top.waitForExistence(timeout: 10), "not signed in")
    // At the largest text the dashboard's row is screens under the account's: down to it, and back up.
    repeatUntil(owner.exists, times: 6) { app.swipeUp() }
    XCTAssertTrue(owner.waitForExistence(timeout: 10), "not the owner's account")
    // Back to the sheet's top, its first line under the bar (and the avatar, above it at the largest text): short slow
    // drags, held before letting go, so none flings or pulls the sheet away.
    let first = app.staticTexts["Đã đăng nhập"], bar = app.navigationBars.firstMatch
    let middle = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4))
    let clear: CGFloat = size == nil ? 0 : 70
    repeatUntil(first.exists && first.frame.minY > bar.frame.maxY + clear, times: 20) {
      middle.press(forDuration: 0.1, thenDragTo: middle.withOffset(CGVector(dx: 0, dy: 160)), withVelocity: .slow, thenHoldForDuration: 0.2)
    }
    XCTAssertGreaterThan(first.frame.minY, bar.frame.maxY + clear, "not at the sheet's top")
    capture(app, name, dark: dark, large: size != nil, screens: size == nil ? 6 : 12)
  }

  /// The tab bar with what scrolls under it, screen by screen: a fish's long text, or Tìm's photos. The site's own pages and
  /// photos, read from the network: the stand-ins are a dim gradient, which hides what a bright photo does to the bar.
  private func shootTabBar(_ name: String, overText: Bool, dark: Bool = false) {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults"] + (dark ? ["-dark"] : [])
    app.launchForFlow(.old)
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 30), "no home")
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "item").firstMatch.waitForExistence(timeout: 30), "the handbook didn't come")
    if overText {
      field.tap()
      field.typeText("ca neon")
      let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
      XCTAssertTrue(row.waitForExistence(timeout: 30), "no Cá neon")
      row.tap()
      XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 30), "not drawn by the app")
    }
    // Time for the photos to come.
    let until = Date().addingTimeInterval(5)
    while Date() < until { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
    capture(app, name, dark: dark, large: true, screens: 6)
  }

  /// What's new (`-whats-new`): its row at the end of the Tìm home, then the list it opens.
  private func shootWhatsNew(_ name: String, dark: Bool = false) {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fixed-pictures", "-whats-new"] + (dark ? ["-dark"] : [])
    app.launchForFlow(.old)
    let row = app.descendants(matching: .any)["all-latest"]
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 5), "no home")
    repeatUntil(row.exists && row.isHittable, times: 8) { app.swipeUp() }
    XCTAssertTrue(row.exists, "no row for what's new")
    for n in 1...2 {
      if n == 2 {
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["latest"].firstMatch.waitForExistence(timeout: 5), "the list didn't open")
      }
      settle()
      let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      a.name = String(format: "shot-%@-%02d", name, n)
      a.lifetime = .keepAlways
      add(a)
    }
  }

  /// v2 (V2Root), the app's look: Hôm nay's first screen, its fish of the day's page, Hôm nay's next screen, and Khám
  /// phá's first. `lang`: the app's language, its locale and its name for Khám phá (the fixed handbook's pages stay
  /// Vietnamese).
  private func shootV2(_ name: String, dark: Bool = false, size: String? = nil,
                       lang: (code: String, locale: String, khamPha: String) = ("vi", "vi_VN", "Khám phá")) {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(\(lang.code))", "-AppleLocale", lang.locale, "-reset-defaults", "-fixed-handbook",
                           "-fixed-pictures"] + (dark ? ["-dark"] : []) + (size.map { ["-UIPreferredContentSizeCategoryName", $0] } ?? [])
    app.launchForFlow(.v2)
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    var n = 0
    func shot() {
      n += 1
      settle()
      let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      a.name = String(format: "shot-%@-%02d", name, n)
      a.lifetime = .keepAlways
      add(a)
    }
    shot()
    fish.tap()
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    shot()
    app.buttons["v2-back"].tap()
    XCTAssertTrue(fish.waitForExistence(timeout: 5), "not back on Hôm nay")
    app.swipeUp()
    shot()
    app.openTab(lang.khamPha)
    XCTAssertTrue(app.navigationBars[lang.khamPha].waitForExistence(timeout: 5), "no Khám phá")
    shot()
  }

  /// Tìm's first screen: its tools, fish ID's card leading them, then their tiles (at the largest text, the next screen
  /// too).
  private func shootTools(_ name: String, dark: Bool = false, size: String? = nil, screens: Int = 1) {
    let app = launch(dark: dark, size: size)
    XCTAssertTrue(app.buttons["tool-fish-id"].waitForExistence(timeout: 5), "no tools")
    XCTAssertTrue(app.buttons.matching(identifier: "tool-tile").firstMatch.waitForExistence(timeout: 5), "no tiles")
    for n in 1...screens {
      if n > 1 { app.swipeUp() }
      settle()
      let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      a.name = String(format: "shot-%@-%02d", name, n)
      a.lifetime = .keepAlways
      add(a)
    }
  }

  /// Tìm before a search, top to bottom, with every shelf (nine video series, a kind of kit, what's new): after a page is
  /// read and saved ("Đọc tiếp"), or on a new phone (`read` false).
  private func shootHome(_ name: String, dark: Bool = false, size: String? = nil, read: Bool = true) {
    let app = launch(dark: dark, size: size, ["-equipment", "-whats-new", "-series", "9"])
    XCTAssertTrue(app.buttons["tool-fish-id"].waitForExistence(timeout: 5), "no home")
    if read {
      let field = app.searchFields.firstMatch
      field.tap()
      field.typeText("nuoi ca neon")
      let guide = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Nuôi cá neon'")).firstMatch
      XCTAssertTrue(guide.waitForExistence(timeout: 5), "the guide not found")
      guide.tap()
      let save = app.buttons["save-for-later"]
      XCTAssertTrue(save.waitForExistence(timeout: 5), "the guide didn't open")
      save.tap()
      app.navigationBars.buttons.element(boundBy: 0).tap()
      let close = app.buttons.matching(NSPredicate(format: "label IN {'Đóng', 'Hủy'}")).firstMatch
      XCTAssertTrue(close.waitForExistence(timeout: 5), "no way out of the search")
      close.tap()
      // Under the tools (at the largest text, screens down), then back to the top for the shots.
      let saved = app.descendants(matching: .any)["all-saved"].firstMatch
      XCTAssertTrue(saved.waitForExistence(timeout: 2) || app.scrolledDown(to: saved).exists, "nothing read and saved")
      let top = app.buttons["tool-fish-id"]
      repeatUntil(top.exists && top.isHittable, times: 8) { app.swipeDown() }
      app.swipeDown()
    }
    capture(app, name, dark: dark, large: size != nil, screens: size == nil ? 6 : 16)
  }

  /// The home's section for kit, then a long list's whole list: screens a kind of kit's own shots don't reach.
  private func shootKit(_ name: String, dark: Bool = false) {
    let app = launch(dark: dark, size: nil, ["-equipment"])
    let row = app.buttons.matching(identifier: "kit").matching(NSPredicate(format: "label BEGINSWITH %@", "Lọc")).firstMatch
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 5), "no home")
    repeatUntil(row.exists && row.isHittable, times: 8) { app.swipeUp() }
    XCTAssertTrue(row.exists, "no kit on the home")
    for n in 1...2 {
      if n == 2 {
        row.tap()
        XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not drawn by the app")
        let all = app.descendants(matching: .any)["pages-all"]
        repeatUntil(all.exists && all.isHittable, times: 12) { app.swipeUp() }
        all.tap()
        XCTAssertTrue(app.navigationBars["Loài cá cần lọc"].waitForExistence(timeout: 5), "the list didn't open")
      }
      settle()
      let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
      a.name = String(format: "shot-%@-%02d", name, n)
      a.lifetime = .keepAlways
      add(a)
    }
  }

  /// The app's icon picker (`-app-icons` opens it until its Tài khoản row is in): its top, and a screen further down.
  private func shootIcons(_ name: String, dark: Bool = false) {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-app-icons"] + (dark ? ["-dark"] : [])
    app.launchForFlow(.old)
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

  func testAVideoPlaying() {
    shoot("video-playing", "han che reu", "Cách hạn chế rêu hại") { app in
      app.buttons["Phát video: Hạn chế rêu hại"].tap()
      XCTAssertTrue(app.webViews.staticTexts["play"].waitForExistence(timeout: 15), "no player")
    }
  }

  /// The page found by `query`, each screen of it, scrolled most of a screen at a time without a fling, to its end;
  /// `then`, what's done on it first.
  private func shoot(_ name: String, _ query: String, _ row: String, dark: Bool = false, large: Bool = false, screens: Int = 12, more: [String] = [],
                     then: (XCUIApplication) -> Void = { _ in }) {
    let app = launch(dark: dark, size: large ? "UICTContentSizeCategoryAccessibilityL" : nil, more)
    open(app, query, row)
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "\(row) isn't drawn by the app")
    then(app)
    capture(app, name, dark: dark, large: large, screens: screens)
  }

  /// The fish-ID screen, signed in on the stand-in server, with the stand-in's guesses for a photo as if picked.
  private func shootFishId(_ name: String, dark: Bool = false) {
    let app = launch(dark: dark, size: nil, ["-fake-accounts", "on", "-reset-fake-server", "-picked-photo"])
    open(app, "nhan dien", "Đây là cá gì?")
    let sign = app.descendants(matching: .any)["apple-sign-in"].firstMatch
    XCTAssertTrue(sign.waitForExistence(timeout: 5), "no sign-in")
    sign.tap()
    let send = app.descendants(matching: .any)["fish-id-send"].firstMatch
    XCTAssertTrue(send.waitForExistence(timeout: 10), "no tool")
    repeatUntil(send.isHittable, times: 6) { app.swipeUp() }
    send.tap()
    XCTAssertTrue(app.descendants(matching: .any)["fish-id-guess"].firstMatch.waitForExistence(timeout: 10), "no guesses")
    // From the top: the screen scrolls to the guesses when they come.
    for _ in 0..<4 { app.swipeDown() }
    capture(app, name, dark: dark, large: false, screens: 8)
  }

  /// The handbook's row for `row`, found by `query`, opened.
  private func open(_ app: XCUIApplication, _ query: String, _ row: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let item = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", row)).firstMatch
    XCTAssertTrue(item.waitForExistence(timeout: 5), "no \(row)")
    item.tap()
  }

  /// The owner's dashboard, signed in as its owner on the stand-in server: the overview, or one of its sections.
  /// `shows`: what the section has once it's loaded.
  private func shootOwner(_ name: String, section: String?, shows: String = "owner-chart", dark: Bool = false, size: String? = nil,
                          more: [String] = [], bell: Bool = false, tile: String? = nil, screens: Int? = nil) {
    let app = launch(dark: dark, size: size, XCUIApplication.standInOwner + more)
    app.openAccount()
    app.signInWithStandInApple()
    app.scrollToAndTap("owner-dashboard")
    XCTAssertTrue(app.buttons["owner-tile-needs"].firstMatch.waitForExistence(timeout: 10), "the overview didn't load")
    if let section {
      app.openOwnersSection(section)
      XCTAssertTrue(app.descendants(matching: .any)[shows].firstMatch.waitForExistence(timeout: 10), "\(section) didn't load")
    }
    if let tile { app.buttons["owner-tile-" + tile].tap() }
    if bell {
      app.buttons["owner-bell"].tap()
      XCTAssertTrue(app.switches["owner-email"].waitForExistence(timeout: 10), "the bell's sheet didn't open")
    }
    // The sheet: its one screen, no end to find.
    capture(app, name, dark: dark, large: size != nil || bell, screens: screens ?? (bell ? 1 : size != nil ? 30 : 16))
  }

  /// Each screen from where it is, scrolled most of a screen at a time without a fling (from `from` of the height, above a
  /// bar pinned to the bottom; at `x` of the width, the right edge to stay clear of sliders), to its end.
  private func capture(_ app: XCUIApplication, _ name: String, dark: Bool, large: Bool = false, screens: Int = 12,
                       from: CGFloat = 0.8, x: CGFloat = 0.5) {
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
      let start = app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: from))
      start.press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: x, dy: from - 0.55)), withVelocity: .slow,
                  thenHoldForDuration: 0.2)
    }
    // A whole screen (not the large text's top screens) ends before the shots run out: else its end wasn't seen, and the
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

  private func launch(dark: Bool, size: String? = nil, _ more: [String] = []) -> XCUIApplication {
    let app = XCUIApplication()
    // Dark by the app's own switch: the runner's appearance setting (XCUIDevice) left the shots light.
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fixed-pictures"]
      + (dark ? ["-dark"] : [])
      + (size.map { ["-UIPreferredContentSizeCategoryName", $0] } ?? []) + more
    app.launchForFlow(.old)
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

  // The photo grid, top, further down and the readers' part (`-hundreds-gallery`: 300 of a gallery's shapes).
  func testThePhotoGrid() { shootGrid("grid-light") }
  func testThePhotoGridInTheDark() { shootGrid("grid-dark", dark: true) }
  func testThePhotoGridInTheLargestText() { shootGrid("grid-largest-light", size: largest) }

  private func shootGrid(_ name: String, dark: Bool = false, size: String? = nil) {
    let app = launch(dark: dark, size: size, ["-hundreds-gallery"])
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("ca neon")
    let item = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    XCTAssertTrue(item.waitForExistence(timeout: 5), "no Cá neon")
    item.tap()
    let lead = app.buttons["lead-photo-grid"]
    XCTAssertTrue(lead.waitForExistence(timeout: 5), "no way into the grid")
    settle()
    snap("\(name)-lead")
    lead.tap()
    XCTAssertTrue(app.buttons["grid-photo-1"].waitForExistence(timeout: 5), "no grid")
    settle()
    snap("\(name)-01")
    app.swipeUp()
    settle()
    snap("\(name)-02")
    app.swipeDown(velocity: .fast)
    app.swipeDown(velocity: .fast)
    let link = app.links["Xem 2 ảnh bạn đọc gửi ↓"].firstMatch
    XCTAssertTrue(link.waitForExistence(timeout: 5), "no link to the readers' photos")
    link.tap()
    settle()
    snap("\(name)-03")
  }

  private func snap(_ name: String) {
    let a = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    a.name = "shot-" + name
    a.lifetime = .keepAlways
    add(a)
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
    app.launchForFlow(.old)
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
    repeatUntil(photo.exists && photo.isHittable, times: 24) {
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
