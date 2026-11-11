import XCTest

/// The app's v2 (V2Root) behind the Tài khoản sheet's switch: off by default, v1's three tabs; turned on, v2's tabs, and
/// turned off again, v1's, with the same tanks, and Tìm with the page Khám phá or Hôm nay had open (v2's whole-page
/// screen, which v1 has none for, cut); a link to a tank opens it in v2, and the app's home from outside is Hôm nay's top. The
/// switch's own flow runs with UIKit's animations on (a plain `launch()`): the switch swaps the whole tab bar under the
/// open sheet.
final class V2FlowTests: XCTestCase {
  private func launch(_ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults"] + args
    return app
  }

  /// The app's look on a new phone, and on a phone from before that never touched the switch: v2's tabs.
  func testV2IsTheLookByDefault() {
    let app = launch()
    app.launchForFlow(nil)
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 10), "v2 isn't the look by default")
    XCTAssertTrue(app.tabBars.buttons["Khám phá"].exists)
    XCTAssertTrue(app.tabBars.buttons["Bể của tôi"].exists)
    XCTAssertTrue(app.tabBars.buttons["Đèn"].exists)
    XCTAssertFalse(app.tabBars.buttons["Tìm"].exists, "the old look's Tìm tab by default")
  }

  func testTheSwitchGoesToTheOldLookAndBackKeepingTheTanks() {
    let app = launch("-seed-tanks", "clash")
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 10), "v2 didn't open")

    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 5), "the old look didn't open")
    XCTAssertFalse(app.tabBars.buttons["Hôm nay"].exists, "v2's tabs still there")
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "the old look lost the tank")
    XCTAssertTrue(app.buttons["tank"].firstMatch.label.contains("Bể 60"), app.buttons["tank"].firstMatch.label)

    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 5), "v2 didn't come back")
    XCTAssertTrue(app.tabBars.buttons["Khám phá"].exists)
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "v2 lost the tank")
  }

  /// The old look switched on by hand stays, across a relaunch: a default doesn't take it back.
  func testTheOldLookSwitchedOnStaysAfterARelaunch() {
    var app = launch()
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 10), "v2 didn't open")
    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 5), "the old look didn't open")
    app.terminate()

    app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"]
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 10), "the old look, switched on by hand, didn't stay")
    XCTAssertFalse(app.tabBars.buttons["Hôm nay"].exists, "v2 came back over the reader's choice")
  }

  func testATankCardOpensTheTankInV2() {
    let app = launch("-seed-tanks", "clash", "-v2", "YES")
    app.launchForFlow()
    let card = app.buttons["v2-tank-card"]
    repeatUntil(card.exists && card.isHittable, times: 8) { app.swipeUp() }
    XCTAssertTrue(card.exists, "no tank card on Hôm nay")
    card.tap()
    XCTAssertTrue(app.navigationBars["Bể 60"].waitForExistence(timeout: 5), "the tank didn't open")
    XCTAssertTrue(app.tabBars.buttons["Bể của tôi"].isSelected, "the tank opened on another tab")
  }

  /// The chat opens from v2's fish page: "Hỏi về cá …", directly under "Thêm vào bể", goes to a screen v2's own stack knows.
  /// (Without the destination there, the tap does nothing.)
  func testTheChatOpensFromAFishsPageInV2() {
    let app = launch("-fake-accounts", "on", "-reset-fake-server")
    app.launchForFlow()
    app.openTab("Khám phá")
    let fish = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
    XCTAssertTrue(fish.waitForExistence(timeout: 5), "no Cá neon on Khám phá")
    fish.tap()
    let add = app.buttons["v2-add"], entry = app.descendants(matching: .any)["chat-entry"].firstMatch
    XCTAssertTrue(add.waitForExistence(timeout: 5), "no Thêm vào bể on the page")
    XCTAssertTrue(entry.waitForExistence(timeout: 5), "no Hỏi về on the fish's page")
    XCTAssertTrue(entry.label.contains("Hỏi về cá neon"), entry.label)
    XCTAssertGreaterThan(entry.frame.minY, add.frame.maxY, "Hỏi về isn't under Thêm vào bể")
    XCTAssertLessThan(entry.frame.minY - add.frame.maxY, 24, "Hỏi về isn't directly under Thêm vào bể")
    repeatUntil(entry.isHittable, times: 6) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.5)), withVelocity: .fast, thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(entry.isHittable, "Hỏi về can't be tapped")
    entry.tap()
    XCTAssertTrue(app.descendants(matching: .any)["chat"].firstMatch.waitForExistence(timeout: 5), "the entry opened nothing")
  }

  func testSwitchingBackWithAWholePageOpenLeavesTimTheFishsPage() {
    let app = launch("-newer-part")
    app.launchForFlow(nil)
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 10), "v2 didn't open")
    app.openTab("Khám phá")
    let fish = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
    XCTAssertTrue(fish.waitForExistence(timeout: 5), "no Cá neon on Khám phá")
    fish.tap()
    let full = app.buttons["v2-part-elsewhere"]
    repeatUntil(full.exists && full.isHittable, times: 8) { app.swipeUp() }
    XCTAssertTrue(full.isHittable, "no Xem phần này ở trang đầy đủ on the fish's page")
    full.tap()
    app.openTab("Hôm nay")
    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 5), "the old look didn't open")
    // The fish's page, one step from Tìm's top.
    let back = app.navigationBars.buttons.element(boundBy: 0)
    XCTAssertTrue(back.waitForExistence(timeout: 5), "Tìm shows no page")
    back.tap()
    XCTAssertTrue(app.navigationBars["Tìm"].waitForExistence(timeout: 5), "the fish's page wasn't one step from Tìm's top")
  }

  func testSwitchingBackWithAPageOpenOnHomNayLeavesItOnTim() {
    let app = launch()
    app.launchForFlow(nil)
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    fish.tap()
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    // The sheet's button is on a tab's first screen, not on a page.
    app.openTab("Khám phá")
    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 5), "the old look didn't open")
    let back = app.navigationBars.buttons.element(boundBy: 0)
    XCTAssertTrue(back.waitForExistence(timeout: 5), "Tìm shows no page")
    back.tap()
    XCTAssertTrue(app.navigationBars["Tìm"].waitForExistence(timeout: 5), "the fish's page wasn't one step from Tìm's top")
  }

  func testTheHomeFromOutsideIsHomNaysTop() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    fish.tap()
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    follow(app, URL(string: "aquatome://")!)
    XCTAssertTrue(fish.waitForExistence(timeout: 5), "the home link left the fish's page open")
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].isSelected, "the home link opened another tab")
  }

  /// The editors' day (`-plan`): their fish, their guide and their story in their words, not Hôm nay's own picks (Cá neon,
  /// and the neon guide under its own title), and the story opens its page.
  func testHomNayShowsTheEditorsDay() {
    let app = launch("-v2", "YES", "-plan", "-today", "2026-11-13")
    app.launchForFlow()
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    XCTAssertTrue(fish.label.contains("Cá ngựa vằn"), "not the editors' fish: \(fish.label)")
    let guide = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Cách hạn chế rêu hại")).firstMatch
    repeatUntil(guide.exists && guide.isHittable, times: 4) { app.swipeUp() }
    XCTAssertTrue(guide.exists, "not the editors' guide")
    let story = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Đàn neon đầu tiên")).firstMatch
    repeatUntil(story.exists && story.isHittable, times: 4) { app.swipeUp() }
    XCTAssertTrue(story.exists, "no story in the editors' words")
    XCTAssertTrue(story.label.contains("Cho người mới") && story.label.contains("Sáu con trở lên"), story.label)
    XCTAssertFalse(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Nuôi cá neon trong bể nhỏ")).firstMatch.exists,
                   "the story's page on a card under its own title too")
    story.tap()
    XCTAssertTrue(app.staticTexts["Nuôi cá neon trong bể nhỏ"].waitForExistence(timeout: 5), "the story's page didn't open")
  }

  /// A day the editors planned without a fish has no fish card: not one of Hôm nay's own picks in its place.
  func testADayPlannedWithoutAFishShowsNone() {
    let app = launch("-v2", "YES", "-plan", "-today", "2026-11-14")
    app.launchForFlow()
    let guide = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Nuôi cá neon trong bể nhỏ")).firstMatch
    XCTAssertTrue(guide.waitForExistence(timeout: 10), "not the editors' guide")
    XCTAssertFalse(app.buttons["v2-fish-of-the-day"].exists, "a fish on a day planned without one")
  }

  /// A guide opens on its photo and name however long its page takes to be read, not on an empty screen with a spinner: the
  /// card zoomed into that, black in dark mode (the owner's report on build 339).
  func testAGuideOpensOnItsPhotoAndNameWhileItsPageIsRead() {
    let app = launch("-v2", "YES", "-plan", "-today", "2026-11-14", "-slow-pages")
    app.launchForFlow()
    let card = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Nuôi cá neon trong bể nhỏ")).firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 10), "not the editors' guide")
    card.tap()
    // The page's own, under the bar: the bar's title alone says nothing of what's on the screen.
    XCTAssertTrue(app.descendants(matching: .any)["page-head"].waitForExistence(timeout: 2), "an empty screen while the page is read")
    XCTAssertFalse(app.staticTexts["Bể và nước"].exists, "the page came too soon to show what it opens on")
    XCTAssertTrue(app.staticTexts["Bể và nước"].waitForExistence(timeout: 8), "the page didn't come")
  }

  /// A date the editors haven't planned has Hôm nay's own picks: for a reader with no fish yet, Cá neon.
  func testADayNotPlannedHasHomNaysOwnPicks() {
    let app = launch("-v2", "YES", "-plan", "-today", "2026-11-15")
    app.launchForFlow()
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on a day not planned")
    XCTAssertTrue(fish.label.contains("Cá neon"), fish.label)
  }

  /// On a phone whose calendar counts the Buddhist era (a Thai phone's own: 2569), the editors' day is still found by
  /// the date they wrote.
  func testHomNayFindsTheEditorsDayOnAThaiCalendar() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "th_TH@calendar=buddhist", "-fixed-handbook", "-reset-defaults",
                           "-v2", "YES", "-plan", "-today", "2026-11-13"]
    app.launchForFlow()
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    XCTAssertTrue(fish.label.contains("Cá ngựa vằn"), "not the editors' fish: \(fish.label)")
  }

  /// At the largest text, a guide's or a story's card with a photo grows to hold its words: none cut to one line over an
  /// empty band between it and the next card ("Cách hạn…", council round 2). The cards stand the page's 28 pt apart.
  func testAGuidesCardWithAPhotoHoldsItsWordsAtTheLargestText() {
    let app = launch("-v2", "YES", "-plan", "-today", "2026-11-13", "-fixed-pictures",
                     "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    app.launchForFlow()
    func card(_ words: String) -> XCUIElement { app.buttons.matching(NSPredicate(format: "label CONTAINS %@", words)).firstMatch }
    let guide = card("Cách hạn chế rêu hại"), story = card("Đàn neon đầu tiên"), tank = app.buttons["v2-first-tank"]
    XCTAssertTrue(guide.waitForExistence(timeout: 10) && story.exists && tank.exists, "not the editors' day")
    for (a, b, what) in [(guide, story, "the guide"), (story, tank, "the story")] {
      let gap = b.frame.minY - a.frame.maxY
      XCTAssertLessThan(gap, 40, "an empty band of \(Int(gap)) pt under \(what)'s card")
    }
  }

  /// A guide's or story's card whose photo doesn't come (offline, nothing kept) waits on its own ground, rust or plum,
  /// not the tank card's green: one card twice.
  func testAPlannedCardWhosePhotoDoesntComeKeepsItsOwnGround() {
    // No `-fixed-pictures`: with the fixed index, no photo comes.
    let app = launch("-v2", "YES", "-plan", "-today", "2026-11-13")
    app.launchForFlow()
    for words in ["Cách hạn chế rêu hại", "Đàn neon đầu tiên"] {
      let card = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", words)).firstMatch
      XCTAssertTrue(card.waitForExistence(timeout: 10), "no card for \(words)")
      bring(app, card, to: 200)
      let f = card.frame, ground = Pixels(XCUIScreen.main.screenshot()).at(f.midX, f.maxY - 8)
      XCTAssertGreaterThan(ground.r - ground.g, 30, "\(words)'s card on the tank card's green: \(ground)")
    }
  }

  /// At the largest text a card's round mark (a guide's book, a story's quote, a video's play) holds its symbol inside its
  /// circle, and grows no bigger than at the largest size before the accessibility ones: not a play triangle out past its
  /// circle, not a quarter of the screen of decoration. It leads each card the same way, over its eyebrow.
  func testACardsMarkHoldsItsSymbolAndStaysSmallAtTheLargestText() {
    let app = launch("-v2", "YES", "-plan", "-today", "2026-11-14", "-fixed-pictures",
                     "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    app.launchForFlow()
    for words in ["Nuôi cá neon trong bể nhỏ", "Ít rêu hơn khi bể đủ cây", "Rêu hại từ A đến Z"] {
      let card = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", words)).firstMatch
      XCTAssertTrue(card.waitForExistence(timeout: 10), "no card for \(words)")
      bring(app, card, to: 230)
      let f = card.frame
      guard let mark = Pixels(XCUIScreen.main.screenshot()).mark(in: CGRect(x: f.minX + 14, y: f.minY + 10, width: 150, height: min(f.height - 20, 500)),
                                                              groundX: f.minX + 8) else {
        XCTFail("no mark found on \(words)'s card")
        continue
      }
      XCTAssertLessThanOrEqual(mark.circle.width, 72, "\(words)'s mark \(Int(mark.circle.width)) pt across")
      // First on each card, then its eyebrow: under a wrapped eyebrow it hung below a word left on its own line.
      XCTAssertLessThan(mark.circle.minY - f.minY, 32, "\(words)'s mark isn't the first thing on its card")
      XCTAssertTrue(mark.circle.insetBy(dx: -1, dy: -1).contains(mark.symbol), "\(words)'s symbol \(mark.symbol) out past its circle \(mark.circle)")
    }
  }

  func testALinkFromOutsideOpensItsPageOnKhamPha() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    XCTAssertTrue(app.staticTexts["Cá neon"].waitForExistence(timeout: 5), "not the fish the link names")
    XCTAssertTrue(app.tabBars.buttons["Khám phá"].isSelected, "the link opened on another tab")
  }

  /// The row replaces Khám phá's path with one of the same length, from another tab that shares v1's: still it shows.
  /// The guide is kept on the old look's Tìm, then v2 is switched back on.
  func testTheSheetsKeptRowOpensItsShelfOnKhamPhaFromHomNay() {
    let app = launch("-newer-part")
    app.launchForFlow(nil)
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 10), "v2 didn't open")
    flip(app)
    XCTAssertTrue(app.handbookShown(timeout: 10), "no handbook")
    // A topic's guides: the fixed index's one written guide is the shelf's pick, so the shelf has no whole list.
    let topic = app.buttons.matching(NSPredicate(format: "identifier == 'shelf' AND label BEGINSWITH %@", "Chăm sóc")).firstMatch
    app.scrolledDown(to: topic).tap()
    XCTAssertTrue(app.navigationBars["Chăm sóc"].waitForExistence(timeout: 5), "not the topic's guides")
    app.buttons["keep-offline"].tap()
    XCTAssertTrue(app.buttons["Đã tải về đọc offline"].waitForExistence(timeout: 10), "not kept")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 5), "v2 didn't open")
    app.openTab("Khám phá")
    let neon = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
    XCTAssertTrue(neon.waitForExistence(timeout: 5), "no Cá neon on Khám phá")
    neon.tap()
    XCTAssertTrue(app.buttons["v2-back"].waitForExistence(timeout: 5), "the fish's page didn't open")
    // Two screens deep there: the row's one is a shorter path, not a longer one.
    let whole = app.buttons["v2-part-elsewhere"]
    repeatUntil(whole.exists && whole.isHittable, times: 8) { app.swipeUp() }
    whole.tap()
    XCTAssertFalse(app.buttons["v2-part-elsewhere"].waitForExistence(timeout: 2), "the whole page didn't open")
    app.openTab("Hôm nay")
    app.openAccount()
    let row = app.buttons["kept-row"]
    repeatUntil(row.exists && row.isHittable, times: 6) { app.swipeUp() }
    XCTAssertTrue(row.exists, "the sheet doesn't list the kept pages")
    row.tap()
    XCTAssertTrue(app.navigationBars["Đã tải để đọc offline"].waitForExistence(timeout: 5), "their shelf didn't show")
    XCTAssertTrue(app.tabBars.buttons["Khám phá"].isSelected, "stayed on another tab")
  }

  func testAFishsPageCreditsItsPhotosAndItsTankMatesOpen() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    // Its lead photo's too, past the photo's one stop for VoiceOver.
    XCTAssertTrue(app.links["John Roe"].waitForExistence(timeout: 5), "the lead photo without its credit")
    let gallery = app.links["Ảnh: Tác giả 1 · CC BY 2.0"]
    repeatUntil(gallery.exists, times: 6) { app.swipeUp() }
    XCTAssertTrue(gallery.exists, "a photo in the gallery without its credit")
    // The tank-mates' are one tap away, at the page's end.
    let credits = app.buttons["Ảnh và giấy phép"]
    repeatUntil(credits.isHittable, times: 8) { app.swipeUp() }
    XCTAssertTrue(credits.isHittable, "the tank-mates' photos' credits aren't at the page's end")
    XCTAssertFalse(app.links["Jane Doe"].exists, "the tank-mates' credits in the way")
    credits.tap()
    XCTAssertTrue(app.links["Jane Doe"].waitForExistence(timeout: 3), "a tank-mate's photo without its credit")
    let mate = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá ngựa vằn")).firstMatch
    XCTAssertTrue(mate.exists, "no tank-mate")
    // Back up to its row, above the credits.
    repeatUntil(mate.isHittable, times: 8) { app.swipeDown() }
    mate.tap()
    XCTAssertTrue(app.staticTexts["Cá ngựa vằn"].waitForExistence(timeout: 5), "the tank-mate's page didn't open")
    XCTAssertTrue(app.tabBars.buttons["Khám phá"].isSelected, "the tank-mate opened on another tab")
  }

  /// No page v2 opens sends the reader to v1's whole page, however it's reached: Hôm nay's fish, guide and story, Khám
  /// phá, a tank-mate's row on another page and a search. A fish from each is v2's page. (Only a part v2 can't draw offers
  /// v1's page, at that part: "Xem phần này ở trang đầy đủ".)
  func testNoPageOffersTheWholePageWhereverItsOpenedFrom() {
    let app = launch("-v2", "YES", "-plan", "-today", "2026-11-13")
    app.launchForFlow()
    let species = app.descendants(matching: .any)["v2-species"]
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    fish.tap()
    readWhole(app, "Hôm nay's fish", opened: species)
    goBack(app)
    for (card, title) in [("Cách hạn chế rêu hại", "Cách hạn chế rêu hại"), ("Đàn neon đầu tiên", "Nuôi cá neon trong bể nhỏ")] {
      let c = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", card)).firstMatch
      repeatUntil(c.exists && c.isHittable, times: 6) { app.swipeUp() }
      c.tap()
      readWhole(app, "Hôm nay's \(card)", opened: app.staticTexts[title])
      goBack(app)
    }
    app.openTab("Khám phá")
    let neon = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
    XCTAssertTrue(neon.waitForExistence(timeout: 5), "no Cá neon on Khám phá")
    neon.tap()
    readWhole(app, "Khám phá's Cá neon", opened: species)
    let mate = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá ngựa vằn")).firstMatch
    repeatUntil(mate.exists && mate.isHittable, times: 12) { app.swipeDown() }
    mate.tap()
    readWhole(app, "a tank-mate's page", opened: app.staticTexts["Cá ngựa vằn"])
    XCTAssertTrue(species.exists, "a tank-mate's page isn't v2's")
    app.tabBars.buttons.element(boundBy: app.tabBars.buttons.count - 1).tap()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("ca neon")
    let found = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    XCTAssertTrue(found.waitForExistence(timeout: 5), "no Cá neon found")
    found.tap()
    readWhole(app, "a search's Cá neon", opened: species)
  }

  /// v2's fish page carries the whole page, in its order, with no row sending the reader to v1's page for the rest: its
  /// sections, its breeds, the guides that mention it, its videos, its readers' comments and its sources.
  func testAFishsPageCarriesTheWholePage() {
    let app = openNeon()
    for part in ["Tóm tắt nhanh", "Nuôi ở Việt Nam", "Nuôi chung", "Thông tin nhanh", "Nước cần thế nào?", "Cho ăn gì?", "Sinh sản ra sao?",
                 "Các dòng và cá lai từ Cá neon", "Bài viết nhắc đến loài này", "Video"] {
      reveal(app, app.staticTexts[part])
    }
    reveal(app, app.descendants(matching: .any).matching(identifier: "comment").firstMatch)
    reveal(app, app.staticTexts["Nguồn và độ tin cậy"])
    reveal(app, app.staticTexts["Nguồn"])
    XCTAssertFalse(app.buttons["v2-full-page"].exists, "a row to the whole page")
    XCTAssertFalse(app.buttons["v2-part-elsewhere"].exists, "a part left to v1's page")
  }

  /// A long part folds between its pieces: its first paragraphs whole, then the next one's first lines with "thêm" at the
  /// end of the last, and the rest not there to read or touch until "thêm" opens it in place. A part of one long paragraph
  /// shows its opening the same way, and a link in it works.
  func testALongPartFoldsBetweenItsPiecesAndWhatShowsWorks() {
    let app = openNeon("-long-part")
    func text(_ s: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch }
    reveal(app, app.staticTexts["Cho ăn gì?"])
    XCTAssertTrue(text("Thức ăn viên nhỏ").exists, "the part's opening isn't there")
    XCTAssertFalse(text("Đoạn cuối về cho ăn").exists, "a paragraph folded away is still there to read")
    let folded = folds(app).firstMatch
    reveal(app, folded)
    guard let more = moreOnItsLastLine(app, folded) else { return XCTFail("no thêm at the end of the folded text's last line") }
    more.tap()
    XCTAssertTrue(text("Đoạn cuối về cho ăn").waitForExistence(timeout: 3), "thêm didn't open the part")
    // The long paragraph: its first lines, and the link in them.
    let mate = app.links["cá ngựa vằn"]
    reveal(app, mate)
    let breeding = folds(app).allElementsBoundByIndex
      .first { $0.staticTexts.firstMatch.label.contains("Muốn cho đẻ") }
    XCTAssertNotNil(breeding.flatMap { moreOnItsLastLine(app, $0) }, "the long paragraph isn't folded")
    mate.tap()
    XCTAssertTrue(app.staticTexts["Cá ngựa vằn"].waitForExistence(timeout: 5), "a link in a folded part's first lines doesn't work")
  }

  /// The navigator's title on the brightest photo: its word and chevron stand on its own dark capsule at 3:1 at least, the
  /// chevron in white, not the tint. And it has the room a section's name needs: cut with room to spare, it read "Nuôi chung với co…".
  func testTheNavigatorsTitleReadsOnAWhitePhotoAndHasRoomForASectionsName() {
    let app = ownersNeon("-long-part", "-fixed-pictures", "-white-pictures")
    let title = app.descendants(matching: .any)["page-navigator-title"].firstMatch
    XCTAssertTrue(title.waitForExistence(timeout: 5), "no title")
    XCTAssertTrue(app.buttons["page-more"].exists, "the title crowds the ⋯ into iOS's own")
    Thread.sleep(forTimeInterval: 1)
    func linear(_ c: Int) -> Double { let v = Double(c) / 255; return v <= 0.03928 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4) }
    func tinted(_ c: (Int, Int, Int)) -> Bool { max(c.0, c.1, c.2) - min(c.0, c.1, c.2) > 40 }
    let box = title.frame
    guard let top = pixels(app) else { return XCTFail("no pixels") }
    // The capsule's ground before the word, over the white photo; the lightest of it is the worst case.
    var lightest = 0.0
    for y in stride(from: box.midY - 6, to: box.midY + 6, by: 1) {
      let c = top(box.minX + 5, y)
      lightest = max(lightest, 0.2126 * linear(c.0) + 0.7152 * linear(c.1) + 0.0722 * linear(c.2))
    }
    let contrast = 1.05 / (lightest + 0.05)
    XCTAssertGreaterThanOrEqual(contrast, 3, "the title's white on the brightest photo is \(contrast):1")
    // The chevron's in white on the photo: nothing tinted in the title.
    let onPhoto = stride(from: box.minY, to: box.maxY, by: 1).contains { y in
      stride(from: box.minX, to: box.minX + 90, by: 0.5).contains { tinted(top($0, y)) }
    }
    XCTAssertFalse(onPhoto, "the chevron is tinted on the photo")
    // A section's name, whole: the chevron after all its words, in the room before the bookmark.
    title.tap()
    let row = app.buttons.matching(NSPredicate(format: "label == %@", "Nuôi chung với con gì?")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no row for the section")
    row.tap()
    let there = expectation(for: NSPredicate(format: "label CONTAINS %@", "Nuôi chung với con gì?"), evaluatedWith: title)
    XCTAssertEqual(XCTWaiter.wait(for: [there], timeout: 5), .completed, "the title doesn't name the section")
    Thread.sleep(forTimeInterval: 1)
    guard let read = pixels(app) else { return XCTFail("no pixels") }
    let needed = ("Nuôi chung với con gì?" as NSString).size(withAttributes: [.font: UIFont.systemFont(ofSize: 15, weight: .semibold)]).width
    let end = title.frame
    let chevron = stride(from: end.minX + 200, to: end.minX, by: -0.5).first { x in
      stride(from: end.minY, to: end.maxY, by: 1).contains { tinted(read(x, $0)) }
    }
    XCTAssertGreaterThanOrEqual((chevron ?? 0) - end.minX, ceil(needed) + 4 + 6, "the section's name is cut with room to spare")
    XCTAssertTrue(app.buttons["page-more"].exists, "a section's name crowds the ⋯ into iOS's own")
    XCTAssertLessThanOrEqual(title.frame.maxX, app.buttons["page-more"].frame.minX, "the title runs under the ⋯")
  }

  /// The screen's colour at a point of the app's, each read from one screenshot.
  private func pixels(_ app: XCUIApplication) -> ((CGFloat, CGFloat) -> (Int, Int, Int))? {
    guard let cg = XCUIScreen.main.screenshot().image.cgImage,
          let ctx = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: cg.width * 4,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue),
          let bytes = ctx.data?.assumingMemoryBound(to: UInt8.self) else { return nil }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    let scale = CGFloat(cg.width) / app.frame.width
    return { x, y in
      withExtendedLifetime(ctx) {
        let p = (Int(y * scale) * cg.width + Int(x * scale)) * 4
        return (Int(bytes[p]), Int(bytes[p + 1]), Int(bytes[p + 2]))
      }
    }
  }

  /// A page that got shorter since its copy on the phone: opened twice in one run, the kept copy then the site's. The folds
  /// worked out for the first were places in its parts' pieces, and on the second the app crashed past the end of them.
  func testAPageThatGotShorterOpensAgainInTheSameRun() {
    func opened(_ more: String...) -> XCUIApplication {
      let app = XCUIApplication()
      app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-v2", "YES", "-keep-pages"] + more
      app.launchForFlow()
      XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
      return app
    }
    let neon = URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!
    func open(_ app: XCUIApplication) {
      follow(app, neon)
      XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
      Thread.sleep(forTimeInterval: 1)
    }
    let long = opened("-long-part")
    open(long)
    long.terminate()
    let app = opened()
    open(app)
    app.buttons["v2-back"].tap()
    open(app)
    XCTAssertEqual(app.state, .runningForeground, "the app crashed on the page's newer copy")
    reveal(app, app.staticTexts["Cho ăn gì?"])
  }

  /// A fold never stops on a line leading into what it hides ("…, gồm:"): the text before it ends in "thêm", and the line
  /// and its list come when it opens.
  func testAFoldDoesntStopOnALineLeadingIntoWhatItHides() {
    let app = openNeon("-long-part")
    func text(_ s: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch }
    reveal(app, app.staticTexts["Cần thiết bị gì?"])
    let before = folds(app).allElementsBoundByIndex.first { $0.staticTexts.firstMatch.label.contains("Bể nhỏ cho cá neon") }
    XCTAssertNotNil(before.flatMap { moreOnItsLastLine(app, $0) }, "the text before the lead-in doesn't end in thêm")
    XCTAssertFalse(text("gồm:").exists, "the fold stopped on a line leading into what it hides")
    openFold(app, of: text("Bể nhỏ cho cá neon"))
    XCTAssertTrue(text("gồm:").waitForExistence(timeout: 3), "thêm didn't open the part")
  }

  /// A fold ends as the App Store's description ends (the owner, 10 Nov: "the more on appstore looks very nicer than us"),
  /// dark and light: its last line runs to the column's edge and is cut there, no "…"; its words fade out over 1.75 em
  /// before "thêm", which stands on that line at the column's right edge, 20 points in.
  func testAFoldEndsAsTheAppStoresDescription() {
    for dark in [false, true] {
      let app = dark ? openNeon("-long-part", "-dark") : openNeon("-long-part")
      reveal(app, app.staticTexts["Cho ăn gì?"])
      let folded = folds(app).firstMatch
      reveal(app, folded)
      let look = dark ? "dark" : "light"
      XCTAssertFalse(folded.staticTexts.firstMatch.label.contains("…"), "a fold ends in '…', \(look)")
      guard let more = moreOnItsLastLine(app, folded) else { XCTFail("no thêm at the end of the last line, \(look)"); continue }
      // The words, at the body's 17 points (size L): "thêm" starts 12 points inside its button, which is 44 tall.
      let em: CGFloat = 17, word = more.frame.minX + 12
      let line = CGRect(x: 0, y: folded.frame.maxY - 22, width: app.frame.width, height: 22)
      guard let shot = XCUIScreen.main.screenshot().image.cgImage else { XCTFail("no screenshot"); continue }
      let start = ink(shot, app, CGRect(x: 20, y: line.minY, width: em * 1.75, height: line.height))
      let end = ink(shot, app, CGRect(x: word - em * 1.75, y: line.minY, width: em * 1.75, height: line.height))
      XCTAssertGreaterThan(start, 0.01, "no words at the last line's start, \(look)")
      XCTAssertLessThan(end, start * 0.3, "the words don't fade out before thêm, \(look): \(end) against \(start)")
      // The line runs on to where the fade starts (1.75 em and half an em before the word), not ending short of it.
      let edge = ink(shot, app, CGRect(x: word - em * 4.25, y: line.minY, width: em * 2, height: line.height))
      XCTAssertGreaterThan(edge, start * 0.3, "the last line stops short of the fade, \(look): \(edge) against \(start)")
      if !dark {
        // A tap on its words, away from "thêm", opens it, as the App Store's does.
        let before = folds(app).count
        folded.coordinate(withNormalizedOffset: CGVector(dx: 0.25, dy: 0.3)).tap()
        XCTAssertLessThan(folds(app).count, before, "a tap on the folded words didn't open the part")
      }
      app.terminate()
    }
  }

  /// The viewer counts the photos its note counts: opened from the photos under the top, where the top photo is the first
  /// of the gallery's, its "2/3" is the gallery's (the owner, 10 Nov: "1/8", then "9 ảnh").
  func testTheViewerCountsTheGalleryItsNoteCounts() {
    let app = openNeon("-lead-in-gallery")
    let row = app.descendants(matching: .any)["v2-photos-row"].firstMatch
    reveal(app, row)
    row.buttons.firstMatch.tap()
    app.showViewerWords()
    let counter = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "2/3 · 3 ảnh")).firstMatch
    XCTAssertTrue(counter.waitForExistence(timeout: 5),
                  "the viewer doesn't count the gallery: \(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", " ảnh")).firstMatch.label)")
  }

  /// A list's lines stand apart, a long one wrapping under its own words: as one text, it ran on under its bullet.
  func testAListsLinesWrapUnderTheirOwnWords() {
    let app = openNeon("-long-part")
    func text(_ s: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch }
    reveal(app, app.staticTexts["Cần thiết bị gì?"])
    openFold(app, of: text("Bể nhỏ cho cá neon"))
    let line = text("Sưởi có điều nhiệt")
    XCTAssertTrue(line.waitForExistence(timeout: 3), "the list didn't open")
    reveal(app, line)
    XCTAssertEqual(line.label, "Sưởi có điều nhiệt nếu phòng xuống dưới 22°C vào mùa lạnh.", "the list's lines are one text")
    XCTAssertGreaterThan(line.frame.minX, text("gồm:").frame.minX + 8, "a list's line isn't set in from its mark")
  }

  /// The sources' figures, compared, show whole: folded, the figure they disagree on was the one cut. A chip to a part a
  /// reader comes back for scrolls there, its heading just under the bar.
  func testTheSourcesShowWholeAndAChipGoesToItsPart() {
    let app = openNeon()
    let chips = app.descendants(matching: .any)["v2-jumps"]
    reveal(app, chips)
    chips.buttons["Sinh sản"].tap()
    let breeding = app.staticTexts["Sinh sản ra sao?"]
    XCTAssertTrue(breeding.waitForExistence(timeout: 5) && breeding.isHittable, "the chip didn't go to its part")
    // Under the bar, not behind it: at the screen's top, as a jump put it, the bar hid the heading.
    XCTAssertGreaterThan(breeding.frame.minY, app.buttons["v2-back"].frame.maxY, "the part's heading behind the bar")
    reveal(app, app.staticTexts["Nguồn và độ tin cậy"])
    XCTAssertFalse(app.buttons["v2-more"].exists || app.links["thêm"].exists, "the sources' figures are folded")
  }

  /// The way round a long page (PageNavigator), the owner's alone for now: a reader's bar is as it was, no title in it.
  func testAReaderHasNoNavigatorOnV2sPage() {
    let app = openNeon("-long-part")
    app.swipeUp()
    XCTAssertFalse(app.descendants(matching: .any)["page-navigator-title"].exists, "a title for a reader")
  }

  /// The owner's bar names the page's parts, with no choosing it first: "Mục lục" beside the back button, its list dropped
  /// from under the bar and closed by a tap outside it, and a folded part chosen from it landed on, under the bar and open.
  func testTheOwnerGoesToAPartFromTheNavigatorsListOnV2sPage() {
    let app = ownersNeon("-long-part")
    let title = app.descendants(matching: .any)["page-navigator-title"].firstMatch
    XCTAssertTrue(title.waitForExistence(timeout: 5), "no title for the owner")
    XCTAssertEqual(title.label, "Mục lục")
    XCTAssertGreaterThan(title.frame.width, 100, "the title cut to nothing in the bar")
    XCTAssertLessThan(title.frame.minX - app.buttons["v2-back"].frame.maxX, 24, "the title isn't beside the back button")
    XCTAssertFalse(app.buttons["page-actions"].exists, "a ⋯ to choose it")
    XCTAssertTrue(app.buttons["page-more"].exists, "the title crowds the ⋯ into iOS's own")
    XCTAssertFalse(app.descendants(matching: .any)["v2-jumps"].exists, "the chips for whoever has the navigator")
    let parts = app.buttons.matching(identifier: "page-navigator-part")
    title.tap()
    XCTAssertTrue(parts.firstMatch.waitForExistence(timeout: 5), "no list of parts")
    XCTAssertGreaterThan(parts.firstMatch.frame.minY, app.buttons["v2-back"].frame.maxY, "the list isn't under the bar")
    // Outside it: the page dimmed at the screen's right, 40 points wide.
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.98, dy: 0.5)).tap()
    wait(for: [expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: parts.firstMatch)], timeout: 5)
    title.tap()
    let part = parts.matching(NSPredicate(format: "label == 'Cho ăn gì?'")).firstMatch
    XCTAssertTrue(part.waitForExistence(timeout: 5), "no part for feeding among \(parts.count)")
    part.tap()
    wait(for: [expectation(for: NSPredicate(format: "label == 'Mục lục, đang ở Cho ăn gì?'"), evaluatedWith: title)], timeout: 5)
    // The page's heading, not the bar's title naming it.
    let heading = app.scrollViews.staticTexts["Cho ăn gì?"].firstMatch
    wait(for: [expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: heading)], timeout: 5)
    XCTAssertGreaterThan(heading.frame.minY, app.buttons["v2-back"].frame.maxY, "the part's heading behind the bar")
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS 'Đoạn cuối về cho ăn'")).firstMatch.exists,
                  "the part chosen is still folded")
    // The tank-mates are one row, named for the section on them: it comes to rest at the section, their rows follow its
    // text, and the title names it over both.
    title.tap()
    let mates = parts.matching(NSPredicate(format: "label BEGINSWITH 'Nuôi chung'"))
    XCTAssertTrue(mates.firstMatch.waitForExistence(timeout: 5), "no row for the tank-mates")
    XCTAssertEqual(mates.count, 1, "the tank-mates on more than one row")
    XCTAssertEqual(mates.firstMatch.label, "Nuôi chung với con gì?")
    mates.firstMatch.tap()
    let named = NSPredicate(format: "label == 'Mục lục, đang ở Nuôi chung với con gì?'")
    wait(for: [expectation(for: named, evaluatedWith: title)], timeout: 5)
    let section = app.scrollViews.staticTexts["Nuôi chung với con gì?"].firstMatch
    wait(for: [expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: section)], timeout: 5)
    XCTAssertGreaterThan(section.frame.minY, app.buttons["v2-back"].frame.maxY, "the section's heading behind the bar")
    let rows = app.scrollViews.staticTexts["Nuôi chung"].firstMatch
    XCTAssertTrue(rows.waitForExistence(timeout: 5), "no tank-mates under the section")
    XCTAssertGreaterThan(rows.frame.minY, section.frame.maxY, "the tank-mates aren't after the section's text")
    bring(app, rows, to: 100)
    wait(for: [expectation(for: named, evaluatedWith: title)], timeout: 5)
    // A long part's name in the title: cut short, the bar's buttons still its own.
    title.tap()
    parts.matching(NSPredicate(format: "label BEGINSWITH 'Các dòng và cá lai'")).firstMatch.tap()
    wait(for: [expectation(for: NSPredicate(format: "label CONTAINS 'Các dòng và cá lai'"), evaluatedWith: title)], timeout: 5)
    XCTAssertTrue(app.buttons["page-more"].exists, "a long part's name crowds the ⋯ into iOS's own")
    XCTAssertTrue(app.buttons["v2-back"].exists, "a long part's name crowds the back button into iOS's own ⋯")
  }

  /// The bar holds back, Mục lục and one ⋯, at the top and scrolled (the owner, 11 Nov: "2B", and "Save and share: go with
  /// your recommendation"): no save or share button of its own, and once scrolled, Mục lục on one line, the part being
  /// read, the fish's name gone from over it. The ⋯ holds save, then share; a save from it lists the page under Tìm's
  /// saved pages, and it says "Bỏ lưu" after. Before: both were the bar's buttons.
  func testTheBarHoldsBackMucLucAndOneMoreAtTheTopAndScrolled() {
    let app = ownersNeon(animated: true, "-long-part")
    let title = app.descendants(matching: .any)["page-navigator-title"].firstMatch
    XCTAssertTrue(title.waitForExistence(timeout: 5), "no title for the owner")
    XCTAssertTrue(app.buttons["v2-back"].exists && app.buttons["page-more"].exists, "not back and ⋯ at the top")
    XCTAssertFalse(app.buttons["save-for-later"].exists, "a save button outside the ⋯ at the top")
    XCTAssertFalse(app.buttons["Chia sẻ"].exists, "a share button outside the ⋯ at the top")
    title.tap()
    let part = app.buttons.matching(identifier: "page-navigator-part").matching(NSPredicate(format: "label == 'Cho ăn gì?'")).firstMatch
    XCTAssertTrue(part.waitForExistence(timeout: 5), "no part for feeding")
    part.tap()
    wait(for: [expectation(for: NSPredicate(format: "label BEGINSWITH 'Mục lục, đang ở'"), evaluatedWith: title)], timeout: 5)
    let more = app.buttons["page-more"]
    XCTAssertTrue(app.buttons["v2-back"].exists, "no back button")
    XCTAssertTrue(more.exists, "no ⋯")
    XCTAssertFalse(app.buttons["save-for-later"].exists, "a save button outside the ⋯")
    XCTAssertFalse(app.buttons["Chia sẻ"].exists, "a share button outside the ⋯")
    XCTAssertLessThanOrEqual(title.frame.maxX, more.frame.minX, "the title runs under the ⋯")
    // One line of words in the title, not the name over the part: its ink no taller than a line of 15 points.
    Thread.sleep(forTimeInterval: 0.5)
    guard let shot = pixels(app) else { return XCTFail("no pixels") }
    let f = title.frame, ground = shot(f.maxX - 4, f.midY)
    func far(_ a: (Int, Int, Int), _ b: (Int, Int, Int)) -> Bool { abs(a.0 - b.0) + abs(a.1 - b.1) + abs(a.2 - b.2) > 150 }
    let inked = stride(from: f.minY, to: f.maxY, by: 1).filter { y in stride(from: f.minX, to: f.minX + 120, by: 1).contains { far(shot($0, y), ground) } }
    XCTAssertLessThan((inked.max() ?? 0) - (inked.min() ?? 0), 22, "the title is more than one line: the name over the part")
    // The ⋯: save, then share.
    more.tap()
    let save = app.buttons["Lưu để đọc sau"], share = app.buttons["Chia sẻ"]
    XCTAssertTrue(save.waitForExistence(timeout: 3), "no save in the ⋯")
    XCTAssertTrue(share.exists, "no share in the ⋯")
    XCTAssertLessThan(save.frame.minY, share.frame.minY, "share before save in the ⋯")
    save.tap()
    XCTAssertTrue(save.waitForNonExistence(timeout: 3), "the ⋯ stayed open")
    more.tap()
    let saved = app.buttons["Bỏ lưu"]
    XCTAssertTrue(saved.waitForExistence(timeout: 3), "the ⋯ doesn't say it's saved")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)).tap()
    XCTAssertTrue(saved.waitForNonExistence(timeout: 3), "the ⋯ didn't close")
    app.tabBars.buttons["Tìm kiếm"].tap()
    let list = app.descendants(matching: .any)["all-saved"].firstMatch
    XCTAssertTrue(list.waitForExistence(timeout: 5) || app.scrolledDown(to: list).exists, "the page isn't listed as saved")
    XCTAssertTrue(list.label.contains("1"), list.label)
  }

  /// The owner's trial of the tab bar as the App Store's (TabBarGlass, the owner, 11 Nov: "Try bottom bar glass effect like
  /// Appstore's"): Khám phá's shelves run on under the bar, so the strip beside the home indicator shows the page, not one
  /// flat ground; the bar's own tap is still the bar's; and the switch in Tài khoản brings the fade back at once.
  func testForTheOwnerThePageShowsUnderTheTabBarAndItsSwitchBringsTheFadeBack() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-v2", "YES",
                           "-fake-accounts", "on", "-reset-fake-server", "-fake-owner", "ui-apple"]
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 10), "no Hôm nay")
    app.openAccount()
    app.scrollToAndTap("apple-sign-in")
    XCTAssertTrue(app.descendants(matching: .any)["owner-dashboard"].waitForExistence(timeout: 20), "not the owner")
    app.closeAccount()
    app.tabBars.buttons["Khám phá"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["v2-browse"].waitForExistence(timeout: 5), "no Khám phá")
    // Shelves of photos at the foot: the familiar fish's.
    let fish = app.staticTexts["Loài quen thuộc"]
    repeatUntil(fish.exists && fish.frame.minY < app.frame.height * 0.55, times: 8) { app.swipeUp(velocity: .slow) }
    Thread.sleep(forTimeInterval: 1)
    // Under the bar, beside the home indicator: the page's own colours, or one ground.
    func spread() -> Double {
      let shot = Pixels(XCUIScreen.main.screenshot()), y = app.frame.maxY - 6
      let line = stride(from: 24.0, to: 110.0, by: 2.0).map { shot.at($0, y) }
      return line.map { $0.distance(to: line[0]) }.max() ?? 0
    }
    XCTAssertGreaterThan(spread(), 30, "nothing of the page under the tab bar")
    app.tabBars.buttons["Hôm nay"].tap()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 5), "the bar's tap didn't open Hôm nay")
    // Off in Tài khoản: the fade again, one ground under the bar.
    app.openAccount()
    let toggle = app.switches["tab-bar-glass-switch"]
    XCTAssertTrue(app.scrolledDown(to: toggle).exists, "no switch for the trial")
    toggle.switches.firstMatch.exists ? toggle.switches.firstMatch.tap() : toggle.tap()
    app.closeAccount()
    app.tabBars.buttons["Khám phá"].tap()
    Thread.sleep(forTimeInterval: 1)
    XCTAssertLessThan(spread(), 12, "the page still under the tab bar with the trial off")
  }

  /// A page's photos all open as their grid (PhotoGrid) three ways: the banner, "N ảnh" in its corner, tapped anywhere;
  /// the carousel's last tile; and the title list's "Ảnh" with its count, which leaves the page where it was.
  func testAPagesPhotosOpenTheirGridFromTheBannerTheRowAndTheTitle() {
    let app = ownersNeon("-long-part", "-large-gallery", "-fixed-pictures")
    let grid = app.staticTexts["28 ảnh"], back = { app.navigationBars.buttons.element(boundBy: 0).tap() }
    let banner = app.buttons["v2-lead-photo-grid"]
    XCTAssertTrue(banner.waitForExistence(timeout: 5), "the banner isn't a way in")
    XCTAssertTrue(banner.label.hasSuffix("Xem tất cả 28 ảnh"), banner.label)
    // Its far corner, not only where the count is.
    banner.coordinate(withNormalizedOffset: CGVector(dx: 0.1, dy: 0.4)).tap()
    XCTAssertTrue(grid.waitForExistence(timeout: 5), "the banner didn't open the grid")
    XCTAssertTrue(app.buttons["grid-photo-1"].exists, "no photos in the grid")
    back()
    // The carousel's last tile, after the photos the page's row shows and not every photo. Up the screen first: at its
    // foot a drag lands on the tab bar.
    let first = app.buttons["Đàn cá neon trong bể"], all = app.buttons["v2-gallery-all"]
    reveal(app, first)
    bring(app, first, to: 300)
    let y = first.frame.midY / app.frame.height
    // By its place: a tile built off the screen has no point to tap, and asking whether it's hittable fails the test.
    func inView() -> Bool { all.exists && app.frame.contains(CGPoint(x: all.frame.midX, y: all.frame.midY)) }
    repeatUntil(inView(), times: 6) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: y)).press(forDuration: 0.05,
        thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: y)), withVelocity: .fast, thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(inView(), "no last tile to all the photos")
    XCTAssertFalse(app.buttons["Cá neon bơi"].exists, "a photo the row doesn't show, on the carousel")
    all.tap()
    XCTAssertTrue(grid.waitForExistence(timeout: 5), "the last tile didn't open the grid")
    back()
    // The title's list: "Ảnh" first, with how many, to the grid.
    let title = app.descendants(matching: .any)["page-navigator-title"].firstMatch
    title.tap()
    let photos = app.buttons.matching(identifier: "page-navigator-part").firstMatch
    XCTAssertTrue(photos.waitForExistence(timeout: 5), "no list")
    XCTAssertTrue(photos.label.hasPrefix("Ảnh") && photos.label.contains("28"), "not the photos first, with their count: \(photos.label)")
    let before = all.frame.minY
    photos.tap()
    XCTAssertTrue(grid.waitForExistence(timeout: 5), "the list's Ảnh didn't open the grid")
    back()
    XCTAssertEqual(all.frame.minY, before, accuracy: 2, "the page moved for its photos")
  }

  /// A plant's page has its care in its card as a fish's has its figures: how hard, its light, its CO₂, how fast it grows.
  func testAPlantsPageHasItsCareInItsCard() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-v2", "YES"]
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/cay/rotala-do/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the plant's page isn't v2's")
    for label in ["Ánh sáng", "Tốc độ mọc"] {
      XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label CONTAINS[c] %@", label)).firstMatch.exists, "no \(label) in the plant's card")
    }
  }

  /// A part this build can't draw (a newer site's) offers v1's page there, never missing; v1's page opens from it.
  func testAPartV2CantDrawOffersTheWholePageThere() {
    let app = openNeon("-newer-part")
    let feeding = app.staticTexts["Cho ăn gì?"], elsewhere = app.buttons["v2-part-elsewhere"]
    reveal(app, feeding)
    reveal(app, elsewhere)
    XCTAssertGreaterThan(elsewhere.frame.minY, feeding.frame.minY, "the offer isn't in its part")
    XCTAssertLessThan(elsewhere.frame.minY, app.staticTexts["Sinh sản ra sao?"].frame.minY, "the offer isn't in its part")
    elsewhere.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "v1's page didn't open")
    // At that part, not at its top, sixteen screens from it on a long page.
    let web = app.buttons["page-web"]
    XCTAssertTrue(web.waitForExistence(timeout: 5), "v1's page offers the part nowhere")
    let at = expectation(for: NSPredicate(format: "hittable == true"), evaluatedWith: web)
    XCTAssertEqual(XCTWaiter.wait(for: [at], timeout: 3), .completed, "v1's page didn't open at the part")
  }

  /// "Thêm vào bể" on v2's page: the fish put on the tank, and "Xem trong Bể của tôi →" opening that tank on its tab.
  func testAFishPutOnATankFromItsPageOpensTheTank() {
    let app = launch("-seed-tanks", "litres") // one tank, "Bể cũ", no fish
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    let add = app.buttons["v2-add"]
    XCTAssertTrue(add.waitForExistence(timeout: 5), "no Thêm vào bể on the page")
    add.tap()
    let count = app.textFields["put-count"]
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    XCTAssertEqual(count.value as? String, "6", "not the school size")
    count.clearAndType("12")
    app.buttons["put-save"].tap()
    XCTAssertTrue(app.staticTexts["put-saved"].waitForExistence(timeout: 5), "no word of the save")
    XCTAssertEqual(app.staticTexts["put-saved"].label, "Đã lưu vào “Bể cũ”.")
    app.buttons["put-open"].tap()
    XCTAssertTrue(app.navigationBars["Bể cũ"].waitForExistence(timeout: 5), "Xem trong Bể của tôi didn't open the tank")
    XCTAssertTrue(app.tabBars.buttons["Bể của tôi"].isSelected, "the tank opened off its tab")
    let neons = app.descendants(matching: .any).matching(identifier: "life").matching(NSPredicate(format: "label CONTAINS %@", "Cá neon")).firstMatch
    XCTAssertTrue(neons.label.contains("× 12"), neons.label)
  }

  func testAFishsPageReportsHowFarItIsRead() {
    let app = launch("-site-telemetry", "-v2", "YES")
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    // To its foot: the whole page is a long one.
    for _ in 0..<10 { app.swipeUp() }
    // Sent when the app goes to the background.
    XCUIDevice.shared.press(.home)
    let states = [XCUIApplication.State.runningBackground, .runningBackgroundSuspended].map { NSNumber(value: $0.rawValue) }
    let gone = expectation(for: NSPredicate(format: "state IN %@", states), evaluatedWith: app)
    XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 5), .completed, "the app didn't go to the background")
    app.activate()
    let received = app.descendants(matching: .any)["telemetry-received"].firstMatch
    let sent = expectation(for: NSPredicate(format: "label CONTAINS %@", #""depth":90,"path":"/vi/ca/ca-neon/","t":"scroll""#), evaluatedWith: received)
    XCTAssertEqual(XCTWaiter.wait(for: [sent], timeout: 10), .completed, "not sent: \(received.label)")
  }

  /// With only its photo and name there (its text hasn't come), a page fits the screen: that isn't read to the end.
  func testAFishsPageOpenedAndLeftUnreadReportsNoDepthPastTheScreen() {
    let app = launch("-site-telemetry", "-pages-later", "-v2", "YES")
    app.launchForFlow()
    let card = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(card.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    card.tap()
    XCTAssertTrue(app.buttons["v2-retry"].waitForExistence(timeout: 5), "its text came")
    XCUIDevice.shared.press(.home)
    let states = [XCUIApplication.State.runningBackground, .runningBackgroundSuspended].map { NSNumber(value: $0.rawValue) }
    let gone = expectation(for: NSPredicate(format: "state IN %@", states), evaluatedWith: app)
    XCTAssertEqual(XCTWaiter.wait(for: [gone], timeout: 5), .completed, "the app didn't go to the background")
    app.activate()
    let received = app.descendants(matching: .any)["telemetry-received"].firstMatch
    // Nothing sent is fine: the page wasn't read.
    if received.waitForExistence(timeout: 5) {
      XCTAssertFalse(received.label.contains(#""depth":"#), "read to the end before a word was read: \(received.label)")
    }
  }

  /// A fish's page that didn't come says so, with the handbook online too, and "Thử lại" reads it. Opened from Hôm nay: a
  /// link brings Khám phá in front, which reads the whole index first, so its page would come.
  func testAFishsPageThatDidntComeSaysSoAndTriesAgain() {
    let app = launch("-pages-later", "-v2", "YES")
    app.launchForFlow()
    let card = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(card.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    card.tap()
    let again = app.buttons["v2-retry"]
    XCTAssertTrue(again.waitForExistence(timeout: 5), "nothing says the page didn't come")
    // Trying again reads the index, which says the pages (`-pages-later`).
    again.tap()
    XCTAssertTrue(again.waitForNonExistence(timeout: 5), "trying again didn't read it")
    // Not only the spinner in its place.
    Thread.sleep(forTimeInterval: 1)
    XCTAssertFalse(again.exists, "trying again didn't read it")
  }

  /// The search tab shows its screen, not the tab that was in front.
  func testTheSearchTabReplacesTheTabInFront() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    app.openTab("Đèn")
    XCTAssertTrue(app.navigationBars["Đèn Chihiros"].waitForExistence(timeout: 5), "no Đèn")
    app.tabBars.buttons.element(boundBy: app.tabBars.buttons.count - 1).tap()
    XCTAssertTrue(app.descendants(matching: .any)["all-fish"].waitForExistence(timeout: 5), "the search tab didn't show its screen")
    XCTAssertFalse(app.navigationBars["Đèn Chihiros"].exists, "Đèn stayed in front")
  }

  /// The owner's report (10 Nov, iOS 27.2, dark): "Search page but search is hidden". The field waited behind a pull, and a grey
  /// band with a line stood over the title. At rest, with no pull: the field is there to tap, and the bar is on the page's black.
  func testTheSearchTabShowsItsFieldWithNoBandAtRest() {
    let app = launch("-v2", "YES", "-dark")
    app.launchForFlow()
    app.openTab("Tìm kiếm")
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "the search tab's field isn't there without a pull")
    XCTAssertTrue(field.isHittable, "the search tab's field can't be tapped without a pull")
    app.noBandBehindTheBar("the search tab, dark")
  }

  func testTheTabBarStaysWholeWhileScrolling() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    func whole(_ screen: String) {
      for tab in ["Hôm nay", "Khám phá", "Bể của tôi", "Đèn"] {
        XCTAssertTrue(app.tabBars.buttons[tab].isHittable, "\(tab) went from the tab bar on \(screen)")
      }
    }
    app.swipeUp()
    app.swipeUp()
    whole("Hôm nay")
    repeatUntil(fish.isHittable, times: 4) { app.swipeDown() }
    fish.tap()
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    app.swipeUp()
    whole("a fish's page")
  }

  /// Under the bar, left of the home indicator, the page's own colour as at the screen's edge: no card, photo or words
  /// showing there, or through the glass above it.
  func testNothingShowsUnderTheTabBar() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    let foot = app.tabBars.buttons["Hôm nay"].frame.maxY + 10
    let shot = XCUIScreen.main.screenshot().image
    let scale = shot.scale
    let cg = shot.cgImage!
    let bitmap = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                           bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    bitmap.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
    let bytes = bitmap.data!.assumingMemoryBound(to: UInt8.self)
    func pixel(_ x: CGFloat) -> [Int] {
      let at = Int(foot * scale) * bitmap.bytesPerRow + Int(x * scale) * 4
      return (0..<3).map { Int(bytes[at + $0]) }
    }
    let page = pixel(4)
    for x in stride(from: CGFloat(24), to: 120, by: 8) {
      let off = zip(pixel(x), page).map { abs($0 - $1) }.max()!
      XCTAssertLessThan(off, 40, "something under the tab bar at x \(x): \(pixel(x)) on a page of \(page)")
    }
  }

  /// A rightward swipe that starts anywhere on a page goes back, as in iOS's own apps: from its middle and from its right
  /// third, on a fish's page (whose back button is the page's own) and a guide.
  func testASwipeFromAnywhereOnThePageGoesBack() {
    // With animations on: iOS's swipe doesn't go back without them.
    let app = launch("-v2", "YES")
    app.launch()
    let swipes = { (card: XCUIElement, shown: XCUIElement, what: String) in
      for (from, place) in [(0.5, "middle"), (0.654, "right third")] {
        XCTAssertTrue(card.waitForExistence(timeout: 10), "no way into \(what)")
        card.tap()
        XCTAssertTrue(shown.waitForExistence(timeout: 8), "\(what) didn't open")
        // High on the page, clear of what scrolls sideways.
        self.flick(app, from: from, at: 0.25)
        XCTAssertTrue(shown.waitForNonExistence(timeout: 5), "a swipe from the \(place) didn't go back from \(what)")
      }
    }
    swipes(app.buttons["v2-fish-of-the-day"], app.buttons["v2-back"], "a fish's page")
    swipes(app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Nuôi cá neon trong bể nhỏ")).firstMatch,
           app.descendants(matching: .any)["native-page"], "a guide")
  }

  /// The right third and the middle, 12 flicks each at three heights, the flick and the heights counted against Settings on
  /// iOS 27.2: a swipe back there is as sure as in iOS's own apps, not most of the time.
  func testAFlickFromTheMiddleOrRightThirdGoesBackEveryTime() {
    let app = launch("-v2", "YES")
    app.launch()
    for (from, place) in [(0.5, "middle"), (0.654, "right third")] {
      for dy in Array(repeating: [0.56, 0.32, 0.76], count: 4).flatMap({ $0 }) {
        let back = openFish(app)
        flick(app, from: from, at: dy)
        XCTAssertTrue(back.waitForNonExistence(timeout: 5), "a flick from the \(place), \(dy) down the page, didn't go back")
      }
    }
  }

  /// A fast flick from the very edge goes back as it does from any screen: at a fish's top over its photo and below it, and
  /// scrolled, where it can start on the strip of photos. iOS's zoom starts nothing for it (`PageSwipes`).
  func testAFastFlickFromTheVeryEdgeGoesBack() {
    let app = launch("-v2", "YES")
    app.launch()
    for (scrolled, dy) in Array(repeating: [(false, 0.2), (false, 0.6), (true, 0.5)], count: 2).flatMap({ $0 }) {
      let back = openFish(app)
      if scrolled { app.swipeUp() }
      flick(app, from: 0.01, to: 0.93, at: dy)
      XCTAssertTrue(back.waitForNonExistence(timeout: 5), "a fast flick from the edge, \(dy) down the page\(scrolled ? ", scrolled" : ""), didn't go back")
    }
  }

  /// A guard, never broken: a slow drag from the edge is the commonest way back, and iOS's own, at a fish's top and scrolled.
  func testASlowDragFromTheEdgeGoesBack() {
    let app = launch("-v2", "YES")
    app.launch()
    for scrolled in [false, true] {
      let back = openFish(app)
      if scrolled { app.swipeUp() }
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.6))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.6)), withVelocity: .slow, thenHoldForDuration: 0)
      XCTAssertTrue(back.waitForNonExistence(timeout: 5), "a slow drag from the edge\(scrolled ? ", scrolled" : "") didn't go back")
    }
  }

  /// A swipe let go of leaves nothing behind: the page still goes back from the edge and from the middle.
  func testASwipeLetGoOfLeavesTheOthersGoingBack() {
    let app = launch("-v2", "YES")
    app.launch()
    for (from, to, place) in [(0.01, 0.93, "edge"), (0.5, 0.99, "middle")] {
      let back = openFish(app)
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.7, dy: 0.6))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.82, dy: 0.6)), withVelocity: .slow, thenHoldForDuration: 0.2)
      XCTAssertFalse(back.waitForNonExistence(timeout: 2), "a short drag let go of went back")
      flick(app, from: from, to: to, at: 0.6)
      XCTAssertTrue(back.waitForNonExistence(timeout: 5), "after a swipe let go of, one from the \(place) didn't go back")
    }
  }

  /// A thumb's flick across the page, a tenth of a second from start to end, as the swipes counted against Settings on
  /// iOS 27.2. XCUITest's own pace is a slow drag, which iOS's zoom takes from anywhere: the fault a flick shows, it hides.
  private func flick(_ app: XCUIApplication, from: CGFloat, to: CGFloat = 0.99, at dy: CGFloat) {
    let across = (to - from) * app.frame.width
    app.coordinate(withNormalizedOffset: CGVector(dx: from, dy: dy))
      .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: to, dy: dy)), withVelocity: XCUIGestureVelocity(across / 0.1), thenHoldForDuration: 0)
  }

  /// Hôm nay's fish opened; its back button, there until the page has gone.
  private func openFish(_ app: XCUIApplication) -> XCUIElement {
    let card = app.buttons["v2-fish-of-the-day"], back = app.buttons["v2-back"]
    XCTAssertTrue(card.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    card.tap()
    XCTAssertTrue(back.waitForExistence(timeout: 8), "the fish's page didn't open")
    return back
  }

  /// A guard, never broken: a swipe that starts on what scrolls sideways is its own, as in the App Store: the page stays.
  func testASwipeOnAStripDoesntGoBack() {
    // With animations on, or no swipe would go back from anywhere.
    let app = launch("-v2", "YES", "-long-part")
    app.launch()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    let back = app.buttons["v2-back"]
    XCTAssertTrue(back.waitForExistence(timeout: 8), "the fish's page didn't open")
    for id in ["v2-jumps", "v2-photos-row"] {
      let strip = app.descendants(matching: .any)[id].firstMatch
      repeatUntil(strip.exists && strip.isHittable, times: 8) { app.swipeUp() }
      XCTAssertTrue(strip.isHittable, "no \(id) on the fish's page")
      strip.swipeRight()
      XCTAssertFalse(back.waitForNonExistence(timeout: 2), "a swipe on \(id) went back")
    }
  }

  /// The edge swipe goes back from a fish's top, where the back button on the bar is the page's own, not iOS's.
  func testAFishsPageGoesBackByTheEdgeSwipe() {
    // With animations on: iOS's swipe doesn't go back without them.
    let app = launch("-v2", "YES")
    app.launch()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    let back = app.buttons["v2-back"], lead = app.links["John Roe"]
    XCTAssertTrue(lead.waitForExistence(timeout: 5), "the neon's page didn't come")
    // A thumb going up the page from its edge, drifting in: the page scrolls, and stays.
    let top = lead.frame.minY
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.75))
      .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.25)), withVelocity: .default, thenHoldForDuration: 0)
    XCTAssertFalse(back.waitForNonExistence(timeout: 2), "a drag up the page from its edge went back")
    XCTAssertLessThan(lead.frame.minY, top - 100, "a drag up the page from its edge didn't scroll it")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.005, dy: 0.5))
      .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.5)), withVelocity: .default, thenHoldForDuration: 0)
    XCTAssertTrue(back.waitForNonExistence(timeout: 5), "the edge swipe didn't go back")
  }

  /// A photo that doesn't come (offline and not kept; none comes under test): a photo's place, not an empty box. None where
  /// there's no photo at all: the fixture's index has none, so none on Hôm nay. (The place is hidden from VoiceOver, which
  /// the tests can't see: they still find it.)
  func testAPhotoThatDoesntComeShowsItsPlace() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    XCTAssertFalse(app.images["v2-photo-missing"].exists, "a photo's place on Hôm nay, where nothing has a photo")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.links["John Roe"].waitForExistence(timeout: 5), "the neon's page didn't come")
    // The lead photo, one stop for VoiceOver with what it's of.
    let lead = app.images.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
    XCTAssertTrue(lead.exists, "no lead photo on the neon's page")
    Thread.sleep(forTimeInterval: 1)
    // A mark at its middle, on the box's grey.
    let f = lead.frame, shot = Pixels(XCUIScreen.main.screenshot()), box = shot.at(f.midX - 60, f.midY)
    let mark = stride(from: f.midX - 16, through: f.midX + 16, by: 1).flatMap { x in
      stride(from: f.midY - 16, through: f.midY + 16, by: 1).map { shot.at(x, $0).distance(to: box) }
    }.max()!
    XCTAssertGreaterThan(mark, 25, "an empty box where the neon's photo didn't come")
  }

  /// The same fish's page opened over itself (a link to it from outside, the page open): its colour stays under the tab bar,
  /// not cleared by the one under it going.
  func testAFishsPageOpenedOverItselfKeepsItsColourUnderTheTabBar() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    let neon = URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!
    follow(app, neon)
    XCTAssertTrue(app.links["John Roe"].waitForExistence(timeout: 5), "the neon's page didn't come")
    Thread.sleep(forTimeInterval: 1)
    let foot = { Pixels(XCUIScreen.main.screenshot()).at(6, app.frame.maxY - 6) }
    let colour = foot()
    XCTAssertGreaterThan(colour.distance(to: Pixels.RGB(r: 255, g: 255, b: 255)), 60, "the neon's page isn't on its colour under the tab bar: \(colour)")
    follow(app, neon)
    // Its zoom in, and the page under it gone from view.
    Thread.sleep(forTimeInterval: 2)
    XCTAssertTrue(app.links["John Roe"].exists, "the neon's page didn't come again")
    let after = foot()
    XCTAssertLessThan(colour.distance(to: after), 40, "the neon's colour gone from under the tab bar: \(colour) before, \(after) after")
  }

  /// Back from a fish's page to the fish's page under it: that page's colour under the tab bar again, not white.
  func testBackToAFishsPageKeepsItsColourUnderTheTabBar() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    func open(_ path: String) {
      follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com\(path)".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    }
    open("/ca/ca-neon/")
    XCTAssertTrue(app.links["John Roe"].waitForExistence(timeout: 5), "the neon's page didn't come")
    Thread.sleep(forTimeInterval: 1)
    let foot = { Pixels(XCUIScreen.main.screenshot()).at(6, app.frame.maxY - 6) }
    let colour = foot()
    XCTAssertGreaterThan(colour.distance(to: Pixels.RGB(r: 255, g: 255, b: 255)), 60, "the neon's page isn't on its colour under the tab bar: \(colour)")
    // Another fish's page over it: the discus's.
    open("/ca/ca-dia/")
    XCTAssertTrue(app.links["John Roe"].waitForNonExistence(timeout: 5), "the discus's page didn't open over the neon's")
    app.buttons["v2-back"].tap()
    XCTAssertTrue(app.links["John Roe"].waitForExistence(timeout: 5), "not back on the neon's page")
    Thread.sleep(forTimeInterval: 1)
    let after = foot()
    XCTAssertLessThan(colour.distance(to: after), 40, "the neon's colour gone from under the tab bar: \(colour) before, \(after) after")
  }

  /// Every figure in view, the card's six (not its lifespan, as the mock's card), none off its edge, and the page's colour
  /// on under the tab bar with no white between.
  func testAFishsPageShowsEveryFigureOnItsColourUnderTheTabBar() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.links["John Roe"].waitForExistence(timeout: 5), "its text didn't come")
    let figure = app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "Độ khó")).firstMatch
    repeatUntil(figure.exists, times: 2) { app.swipeUp() }
    XCTAssertTrue(figure.exists, "no last figure")
    XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "fact").count, 6, "not the card's six figures")
    XCTAssertFalse(app.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", "Tuổi thọ")).firstMatch.exists,
                   "its lifespan on the card")
    XCTAssertTrue(app.frame.contains(figure.frame), "a figure off the screen: \(figure.frame)")
    Thread.sleep(forTimeInterval: 0.5)
    let shot = Pixels(XCUIScreen.main.screenshot())
    let colour = shot.at(6, app.frame.midY), foot = shot.at(6, app.frame.maxY - 6)
    XCTAssertLessThan(colour.distance(to: foot), 40, "white under the tab bar: \(colour) above, \(foot) under it")
  }

  /// What's on the bar reads, on the page's colour and after it, and the name, once it has left the page, stays in the bar's
  /// middle as the colour goes. On the colour iOS 26's glass goes pale under white symbols, so it's the page's own round
  /// buttons there; after it iOS can keep the dark scheme, white on the white band.
  func testAFishsPageBarReadsOnItsColourAndAfterIt() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.links["John Roe"].waitForExistence(timeout: 5), "its text didn't come")
    let title = app.staticTexts["v2-bar-name"]
    func up() {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)), withVelocity: .slow, thenHoldForDuration: 0.3)
    }
    let back = app.buttons["v2-back"]
    XCTAssertTrue(back.exists, "iOS's glass on the page's colour")
    // The page's name under the bar, the bar still on the colour.
    let name = app.scrollViews.staticTexts["Cá neon"].firstMatch
    repeatUntil(name.frame.maxY < back.frame.maxY, times: 6) { up() }
    XCTAssertLessThan(name.frame.maxY, back.frame.maxY, "the name didn't go under the bar")
    // Beside its chevron, on the colour: no circle there (the owner, 11 Nov: "2B").
    let circle = Pixels(XCUIScreen.main.screenshot()).at(back.frame.minX + 7, back.frame.midY)
    XCTAssertGreaterThan(circle.contrastWithWhite, 3, "the back button's chevron doesn't read: \(circle)")
    // The name in the bar from then on, the colour still under it, in the bar's middle.
    XCTAssertTrue(title.waitForExistence(timeout: 2), "no name in the bar once it has left the page")
    let onColour = title.frame
    XCTAssertEqual(onColour.midX, app.frame.midX, accuracy: 2, "the bar's name isn't in its middle")
    // Between the buttons, not under them.
    XCTAssertGreaterThanOrEqual(onColour.minX, back.frame.maxX, "the bar's name runs under the back button")
    XCTAssertLessThanOrEqual(onColour.maxX, app.buttons["page-more"].frame.minX, "the bar's name runs under the ⋯")
    func reads(_ what: String) {
      let shot = Pixels(XCUIScreen.main.screenshot()), f = title.frame, ground = shot.at(f.minX - 6, f.midY)
      let strongest = stride(from: f.minX, to: f.maxX, by: 1).flatMap { x in stride(from: f.minY, to: f.maxY, by: 1).map { shot.at(x, $0).distance(to: ground) } }.max()!
      XCTAssertGreaterThan(strongest, 120, "the bar's name doesn't read \(what)")
    }
    reads("on the colour")
    // Past the colour: the name where it was, as the glass comes.
    func bar() -> Pixels.RGB { Pixels(XCUIScreen.main.screenshot()).at(onColour.minX - 6, onColour.midY) }
    repeatUntil(bar().contrastWithWhite < 1.1, times: 6) { up() }
    XCTAssertLessThan(bar().contrastWithWhite, 1.1, "the page's colour never went")
    XCTAssertEqual(title.frame.midX, onColour.midX, accuracy: 1, "the bar's name moved as the colour went")
    reads("after the colour")
  }

  /// Hôm nay's bar keeps its own words, the clock's too, while a dark card passes under its band: iOS picked white for them
  /// from the card, white on the white band.
  func testHomNaysBarReadsWhileACardPassesUnderIt() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    let bar = app.navigationBars["Hôm nay"]
    func step() {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.62)), withVelocity: .slow, thenHoldForDuration: 0.3)
    }
    repeatUntil(fish.frame.minY < bar.frame.maxY - 30, times: 10) { step() }
    XCTAssertLessThan(fish.frame.minY, bar.frame.maxY - 30, "the card never went under the bar")
    XCTAssertGreaterThan(fish.frame.maxY, bar.frame.maxY + 40, "the card went past the bar")
    let title = bar.staticTexts["Hôm nay"]
    XCTAssertTrue(title.waitForExistence(timeout: 2), "no title in the bar once the large one has gone")
    let shot = Pixels(XCUIScreen.main.screenshot()), ground = shot.at(4, title.frame.midY)
    func strongest(_ f: CGRect) -> Double {
      stride(from: f.minX, to: f.maxX, by: 1).flatMap { x in stride(from: f.minY, to: f.maxY, by: 1).map { shot.at(x, $0).distance(to: ground) } }.max()!
    }
    XCTAssertGreaterThan(strongest(title.frame), 120, "the bar's title doesn't read on its band")
    // The clock, left of the island.
    XCTAssertGreaterThan(strongest(CGRect(x: 20, y: 8, width: 90, height: 34)), 120, "the clock doesn't read on the band")
  }

  /// A page's end stops above the fade over the tab bar: the last of Khám phá isn't dimmed for good.
  func testAPagesEndClearsTheFadeOverTheTabBar() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    app.openTab("Khám phá")
    let last = app.buttons["Thuật ngữ"]
    XCTAssertTrue(app.descendants(matching: .any)["v2-browse"].waitForExistence(timeout: 5), "no Khám phá")
    for _ in 0..<12 { app.swipeUp(velocity: .fast) }
    XCTAssertTrue(last.exists, "no last tile")
    let bar = app.tabBars.buttons["Khám phá"].frame.minY
    XCTAssertLessThanOrEqual(last.frame.maxY, bar - 30, "the page ends in the fade")
  }

  /// What's faded out under the bar can't be tapped: a tap under it, with a card behind, opens nothing.
  func testATapUnderTheTabBarOpensNothing() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    let foot = app.tabBars.buttons["Hôm nay"].frame.maxY + 10
    app.coordinate(withNormalizedOffset: .zero).withOffset(CGVector(dx: 100, dy: foot)).tap()
    // Hôm nay still there, its fish's card in view, and no page pushed over it.
    XCTAssertFalse(fish.waitForNonExistence(timeout: 2), "a tap under the bar opened what's behind it")
    XCTAssertTrue(fish.isHittable, "a tap under the bar opened what's behind it")
  }

  /// A group's tile says what its number counts ("474 loài"), not a bare number; so does its row at the largest text.
  func testAGroupsTileSaysWhatItCounts() {
    for size in [[], ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]] {
      let app = XCUIApplication()
      app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-v2", "YES"] + size
      app.launchForFlow()
      app.openTab("Khám phá")
      let tile = app.buttons.matching(NSPredicate(format: "label MATCHES %@", ".*[0-9]+ loài")).firstMatch
      repeatUntil(tile.exists, times: 6) { app.swipeUp() }
      XCTAssertTrue(tile.exists, "no group's tile with what it counts \(size)")
      app.terminate()
    }
  }

  func testAPageReadIsOnOneShelfOfKhamPha() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    app.openTab("Khám phá")
    let neon = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon"))
    XCTAssertTrue(neon.firstMatch.waitForExistence(timeout: 5), "no Cá neon on Khám phá")
    neon.firstMatch.tap()
    XCTAssertTrue(app.buttons["v2-back"].waitForExistence(timeout: 5), "the fish's page didn't open")
    app.buttons["v2-back"].tap()
    XCTAssertTrue(neon.firstMatch.waitForExistence(timeout: 5), "not back on Khám phá")
    XCTAssertEqual(neon.count, 1, "Cá neon is on two shelves")
  }

  func testAPageJustReadTakesItsPlaceOnKhamPhaOnlyNextTime() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
    app.openTab("Khám phá")
    let neon = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "Cá neon")).firstMatch
    XCTAssertTrue(neon.waitForExistence(timeout: 5), "no Cá neon on Khám phá")
    XCTAssertFalse(app.staticTexts["Đọc gần đây"].exists, "something read already")
    neon.tap()
    XCTAssertTrue(app.buttons["v2-back"].waitForExistence(timeout: 5), "the fish's page didn't open")
    app.buttons["v2-back"].tap()
    XCTAssertTrue(neon.waitForExistence(timeout: 5), "not back on Khám phá")
    // The shelves stay as they were, for the page's zoom back to where it was tapped.
    XCTAssertFalse(app.staticTexts["Đọc gần đây"].exists, "the shelves moved on coming back")
    app.openTab("Hôm nay")
    app.openTab("Khám phá")
    XCTAssertTrue(app.staticTexts["Đọc gần đây"].waitForExistence(timeout: 5), "it never took its place")
  }

  /// A page just opened (`opened` comes), read down to its end: nowhere a row to v1's whole page.
  private func readWhole(_ app: XCUIApplication, _ page: String, opened: XCUIElement) {
    XCTAssertTrue(opened.waitForExistence(timeout: 5), "\(page) didn't open as it should")
    let row = app.descendants(matching: .any)
      .matching(NSPredicate(format: "identifier == 'v2-full-page' OR label CONTAINS[c] 'xem trang đầy đủ'")).firstMatch
    for _ in 0..<8 {
      XCTAssertFalse(row.exists, "a row to the whole page on \(page)")
      app.swipeUp(velocity: .fast)
    }
    XCTAssertFalse(row.exists, "a row to the whole page at the end of \(page)")
  }

  /// Back a page: v2's own button on its page, iOS's on another.
  /// "thêm" at the end of this text: the page has one in each folded part.
  private func openFold(_ app: XCUIApplication, of paragraph: XCUIElement) {
    reveal(app, paragraph)
    let more = folds(app).allElementsBoundByIndex.first { $0.staticTexts.firstMatch.label == paragraph.label }.flatMap { moreOnItsLastLine(app, $0) }
    guard let more else { return XCTFail("no thêm in \(paragraph.label)") }
    reveal(app, more)
    more.tap()
  }

  /// The texts folds end in, as the eye sees them: the lines shown, not the text cut a line further.
  private func folds(_ app: XCUIApplication) -> XCUIElementQuery {
    app.descendants(matching: .any).matching(identifier: "v2-folded")
  }

  /// The fold's "thêm", where the App Store has its "more": its right edge on the column's, 20 points in, and its middle on
  /// the last line shown.
  private func moreOnItsLastLine(_ app: XCUIApplication, _ folded: XCUIElement) -> XCUIElement? {
    let more = folded.buttons["v2-more"]
    guard more.exists else { return nil }
    let edge = abs(more.frame.maxX - (app.frame.width - 20)) <= 1
    let onLast = more.frame.midY <= folded.frame.maxY && more.frame.midY >= folded.frame.maxY - 26
    return edge && onLast ? more : nil
  }

  /// How much a box of the screen differs from its own ground, on average: its words' ink, 0 for none.
  private func ink(_ shot: CGImage, _ app: XCUIApplication, _ box: CGRect) -> Double {
    let scale = CGFloat(shot.width) / app.frame.width
    guard let crop = shot.cropping(to: CGRect(x: box.minX * scale, y: box.minY * scale, width: box.width * scale, height: box.height * scale).integral)
    else { return 0 }
    let w = crop.width, h = crop.height
    var px = [UInt8](repeating: 0, count: w * h * 4)
    guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return 0 }
    ctx.draw(crop, in: CGRect(x: 0, y: 0, width: w, height: h))
    func gray(_ i: Int) -> Double { (0.2126 * Double(px[i]) + 0.7152 * Double(px[i + 1]) + 0.0722 * Double(px[i + 2])) / 255 }
    var often: [Int: Int] = [:]
    for i in stride(from: 0, to: px.count, by: 4) { often[Int(gray(i) * 255), default: 0] += 1 }
    guard let ground = often.max(by: { $0.value < $1.value })?.key else { return 0 }
    var sum = 0.0
    for i in stride(from: 0, to: px.count, by: 4) { sum += abs(gray(i) - Double(ground) / 255) }
    return sum / Double(w * h)
  }

  private func goBack(_ app: XCUIApplication) {
    let own = app.buttons["v2-back"]
    if own.exists { own.tap() } else { app.navigationBars.buttons.element(boundBy: 0).tap() }
  }

  /// The neon's page on v2, opened from a link.
  private func openNeon(_ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-v2", "YES"] + args
    app.launchForFlow()
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    return app
  }

  /// Scrolled into view half a screen at a time, without a fling, so no part is scrolled past; only down, so parts found
  /// one after another are in that order on the page.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    repeatUntil(e.exists && e.isHittable, times: 30) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .fast,
               thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }

  /// The neon's page, signed in as the owner (the stand-in Apple's, `-fake-owner`); `animated`, as a reader sees it.
  private func ownersNeon(animated: Bool = false, _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-v2", "YES",
                           "-fake-accounts", "on", "-reset-fake-server", "-fake-owner", "ui-apple"] + args
    if animated { app.launch() } else { app.launchForFlow() }
    XCTAssertTrue(app.buttons["v2-fish-of-the-day"].waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    app.openAccount()
    app.scrollToAndTap("apple-sign-in")
    XCTAssertTrue(app.descendants(matching: .any)["owner-dashboard"].waitForExistence(timeout: 20), "not the owner")
    app.closeAccount()
    follow(app, URL(string: "aquatome://open?url=" + "https://aquatome.com/ca/ca-neon/".addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    return app
  }

  /// Dragged, without a fling, until its top is `y` points down the screen.
  private func bring(_ app: XCUIApplication, _ e: XCUIElement, to y: CGFloat) {
    for _ in 0..<12 {
      let dy = e.frame.minY - y
      if abs(dy) < 24 { return }
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6))
      from.press(forDuration: 0.05, thenDragTo: from.withOffset(CGVector(dx: 0, dy: -max(-300, min(300, dy)))), withVelocity: .slow,
                 thenHoldForDuration: 0.3)
    }
  }

  /// A link opened by the system to the running app (`XCUIApplication.open` launches it anew), past the system's question.
  private func follow(_ app: XCUIApplication, _ url: URL) {
    XCUIDevice.shared.system.open(url)
    let ask = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
    if ask.waitForExistence(timeout: 2) { ask.buttons.element(boundBy: ask.buttons.count - 1).tap() }
    XCTAssertTrue(app.wait(for: .runningForeground, timeout: 5), "the app isn't in front")
  }

  /// The sheet's switch to the old look, tapped, and the sheet closed.
  private func flip(_ app: XCUIApplication) {
    app.openAccount()
    let toggle = app.switches["old-look-switch"]
    repeatUntil(toggle.exists && toggle.isHittable, times: 6) { app.swipeUp() }
    XCTAssertTrue(toggle.exists, "no switch to the old look in the Tài khoản sheet")
    // A switch's own control, at its trailing end: a tap on the row's middle doesn't flip it.
    toggle.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: 0.5)).tap()
    app.closeAccount()
  }
}

/// A screenshot's colours, by the screen's points.
private struct Pixels {
  struct RGB: CustomStringConvertible {
    let r, g, b: Double
    func distance(to o: RGB) -> Double { max(abs(r - o.r), abs(g - o.g), abs(b - o.b)) }
    var contrastWithWhite: Double {
      func lin(_ c: Double) -> Double { let x = c / 255; return x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4) }
      return 1.05 / (0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) + 0.05)
    }
    var description: String { "(\(Int(r)), \(Int(g)), \(Int(b)))" }
  }

  private let bitmap: CGContext
  private let scale: CGFloat

  init(_ shot: XCUIScreenshot) {
    let cg = shot.image.cgImage!
    scale = shot.image.scale
    bitmap = CGContext(data: nil, width: cg.width, height: cg.height, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                       bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    bitmap.draw(cg, in: CGRect(x: 0, y: 0, width: cg.width, height: cg.height))
  }

  func at(_ x: CGFloat, _ y: CGFloat) -> RGB { pixel(Int(x * scale), Int(y * scale)) }

  private func pixel(_ x: Int, _ y: Int) -> RGB {
    let bytes = bitmap.data!.assumingMemoryBound(to: UInt8.self), o = y * bitmap.bytesPerRow + x * 4
    return RGB(r: Double(bytes[o]), g: Double(bytes[o + 1]), b: Double(bytes[o + 2]))
  }

  /// A card's round mark in `area`, in points: its circle, white at 18 % on the card's ground (read at `groundX`, left of
  /// it, on each line), the largest solid run of that tone; and its symbol, the white joined to what's white inside the
  /// circle, all of it, so a symbol out past its circle shows as one.
  func mark(in area: CGRect, groundX: CGFloat) -> (circle: CGRect, symbol: CGRect)? {
    let s = scale, x0 = max(Int(area.minX * s), 0), x1 = min(Int(area.maxX * s), bitmap.width - 1)
    let y0 = max(Int(area.minY * s), 0), y1 = min(Int(area.maxY * s), bitmap.height - 1), gx = Int(groundX * s)
    guard x1 > x0 + 4, y1 > y0 + 4 else { return nil }
    let w = x1 - x0 + 1, h = y1 - y0 + 1
    var tone = [Bool](repeating: false, count: w * h)
    for y in 0..<h {
      let g = pixel(gx, y + y0), c = RGB(r: g.r * 0.82 + 255 * 0.18, g: g.g * 0.82 + 255 * 0.18, b: g.b * 0.82 + 255 * 0.18)
      for x in 0..<w where pixel(x + x0, y + y0).distance(to: c) < 18 { tone[y * w + x] = true }
    }
    // Solid: the tone on a pixel and the eight round it, not a letter's soft edge.
    var solid = [Bool](repeating: false, count: w * h)
    for y in 1..<(h - 1) {
      for x in 1..<(w - 1) { solid[y * w + x] = (-1...1).allSatisfy { dy in (-1...1).allSatisfy { dx in tone[(y + dy) * w + x + dx] } } }
    }
    typealias Box = (minX: Int, minY: Int, maxX: Int, maxY: Int)
    func run(from start: [Int], _ inside: (Int) -> Bool, _ seen: inout [Bool]) -> (n: Int, box: Box) {
      var stack = start, n = 0, box: Box = (.max, .max, .min, .min)
      for i in start { seen[i] = true }
      while let j = stack.popLast() {
        n += 1
        let x = j % w, y = j / w
        box = (min(box.minX, x), min(box.minY, y), max(box.maxX, x), max(box.maxY, y))
        for (nx, ny) in [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)] where nx >= 0 && ny >= 0 && nx < w && ny < h {
          let k = ny * w + nx
          if !seen[k] && inside(k) { seen[k] = true; stack.append(k) }
        }
      }
      return (n, box)
    }
    var seen = [Bool](repeating: false, count: w * h), circle: (n: Int, box: Box)?
    for i in solid.indices where solid[i] && !seen[i] {
      let r = run(from: [i], { solid[$0] }, &seen)
      if r.n > (circle?.n ?? 0) { circle = r }
    }
    guard let c = circle?.box else { return nil }
    func white(_ k: Int) -> Bool { let p = pixel(k % w + x0, k / w + y0); return min(p.r, p.g, p.b) > 225 }
    let inner = (c.minY...c.maxY).flatMap { y in (c.minX...c.maxX).map { y * w + $0 } }.filter(white)
    guard !inner.isEmpty else { return nil }
    var seenWhite = [Bool](repeating: false, count: w * h)
    let symbol = run(from: inner, white, &seenWhite).box
    func points(_ b: Box) -> CGRect {
      CGRect(x: CGFloat(b.minX + x0) / s, y: CGFloat(b.minY + y0) / s, width: CGFloat(b.maxX - b.minX + 1) / s, height: CGFloat(b.maxY - b.minY + 1) / s)
    }
    return (points(c), points(symbol))
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
