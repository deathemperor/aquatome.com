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

  func testOffByDefaultShowsV1sTabs() {
    let app = launch()
    app.launchForFlow()
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 10), "no Tìm tab")
    XCTAssertTrue(app.tabBars.buttons["Bể của tôi"].exists)
    XCTAssertTrue(app.tabBars.buttons["Đèn"].exists)
    XCTAssertFalse(app.tabBars.buttons["Hôm nay"].exists, "v2 on by default")
  }

  func testTheSwitchTurnsV2OnAndBackKeepingTheTanks() {
    let app = launch("-seed-tanks", "clash")
    app.launch()
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 10), "v1 didn't open")

    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 5), "v2 didn't open")
    XCTAssertTrue(app.tabBars.buttons["Khám phá"].exists)
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "v2 lost the tank")
    XCTAssertTrue(app.buttons["tank"].firstMatch.label.contains("Bể 60"), app.buttons["tank"].firstMatch.label)

    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 5), "v1 didn't come back")
    XCTAssertFalse(app.tabBars.buttons["Hôm nay"].exists, "v2's tabs still there")
    app.openTab("Bể của tôi")
    XCTAssertTrue(app.buttons["tank"].firstMatch.waitForExistence(timeout: 5), "v1 lost the tank")
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

  func testSwitchingBackWithAWholePageOpenLeavesTimTheFishsPage() {
    let app = launch("-newer-part")
    app.launchForFlow()
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 10), "v1 didn't open")
    flip(app)
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
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 5), "v1 didn't come back")
    // The fish's page, one step from Tìm's top.
    let back = app.navigationBars.buttons.element(boundBy: 0)
    XCTAssertTrue(back.waitForExistence(timeout: 5), "Tìm shows no page")
    back.tap()
    XCTAssertTrue(app.navigationBars["Tìm"].waitForExistence(timeout: 5), "the fish's page wasn't one step from Tìm's top")
  }

  func testSwitchingBackWithAPageOpenOnHomNayLeavesItOnTim() {
    let app = launch()
    app.launchForFlow()
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 10), "v1 didn't open")
    flip(app)
    let fish = app.buttons["v2-fish-of-the-day"]
    XCTAssertTrue(fish.waitForExistence(timeout: 10), "no fish of the day on Hôm nay")
    fish.tap()
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 5), "the fish's page didn't open")
    // The sheet's button is on a tab's first screen, not on a page.
    app.openTab("Khám phá")
    flip(app)
    XCTAssertTrue(app.tabBars.buttons["Tìm"].waitForExistence(timeout: 5), "v1 didn't come back")
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
  func testTheSheetsKeptRowOpensItsShelfOnKhamPhaFromHomNay() {
    let app = launch("-newer-part")
    app.launchForFlow()
    XCTAssertTrue(app.descendants(matching: .any)["all-fish"].waitForExistence(timeout: 10), "no handbook")
    let all = app.descendants(matching: .any)["all-guides"]
    repeatUntil(all.exists && all.isHittable, times: 6) { app.swipeUp() }
    all.tap()
    XCTAssertTrue(app.navigationBars["Tất cả hướng dẫn"].waitForExistence(timeout: 5))
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

  /// A long part folds between its pieces, never through a line: its first paragraphs whole, the next one's opening to a
  /// word's end with "… thêm" ending its last line, not laid over its words, and the rest not there to read or touch until
  /// "thêm" opens it in place. A part of one long paragraph shows its opening the same way, and a link in it works.
  func testALongPartFoldsBetweenItsPiecesAndWhatShowsWorks() {
    let app = openNeon("-long-part")
    func text(_ s: String) -> XCUIElement { app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch }
    reveal(app, app.staticTexts["Cho ăn gì?"])
    XCTAssertTrue(text("Thức ăn viên nhỏ").exists, "the part's opening isn't there")
    XCTAssertFalse(text("Đoạn cuối về cho ăn").exists, "a paragraph folded away is still there to read")
    let cut = app.staticTexts.matching(NSPredicate(format: "label ENDSWITH %@", "… thêm")).firstMatch
    XCTAssertTrue(cut.exists, "no text ends in '… thêm': it lies over the words, or stands on a row of its own")
    let more = app.links["thêm"].firstMatch
    reveal(app, more)
    more.tap()
    XCTAssertTrue(text("Đoạn cuối về cho ăn").waitForExistence(timeout: 3), "thêm didn't open the part")
    // The long paragraph: its first lines, and the link in them.
    let mate = app.links["cá ngựa vằn"]
    reveal(app, mate)
    XCTAssertTrue(text("Muốn cho đẻ").label.hasSuffix("… thêm"), "the long paragraph isn't folded")
    mate.tap()
    XCTAssertTrue(app.staticTexts["Cá ngựa vằn"].waitForExistence(timeout: 5), "a link in a folded part's first lines doesn't work")
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
    XCTAssertTrue(app.buttons["save-for-later"].exists, "the title crowds the bookmark into iOS's own ⋯")
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
    // A long part's name in the title: cut short, the bar's buttons still its own.
    title.tap()
    parts.matching(NSPredicate(format: "label BEGINSWITH 'Các dòng và cá lai'")).firstMatch.tap()
    wait(for: [expectation(for: NSPredicate(format: "label CONTAINS 'Các dòng và cá lai'"), evaluatedWith: title)], timeout: 5)
    XCTAssertTrue(app.buttons["save-for-later"].exists, "a long part's name crowds the bookmark into iOS's own ⋯")
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
    repeatUntil(all.isHittable, times: 6) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: y)).press(forDuration: 0.05,
        thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: y)), withVelocity: .fast, thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(all.isHittable, "no last tile to all the photos")
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

  /// The edge swipe goes back from a fish's top, where the back button on the bar is the page's own, not iOS's.
  func testAFishsPageGoesBackByTheEdgeSwipe() {
    let app = launch("-v2", "YES")
    app.launchForFlow()
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
    // Beside its chevron, inside its circle.
    let circle = Pixels(XCUIScreen.main.screenshot()).at(back.frame.minX + 7, back.frame.midY)
    XCTAssertGreaterThan(circle.contrastWithWhite, 3, "the back button's chevron doesn't read: \(circle)")
    // The name in the bar from then on, the colour still under it, in the bar's middle.
    XCTAssertTrue(title.waitForExistence(timeout: 2), "no name in the bar once it has left the page")
    let onColour = title.frame
    XCTAssertEqual(onColour.midX, app.frame.midX, accuracy: 2, "the bar's name isn't in its middle")
    // Between the buttons, not under them.
    XCTAssertGreaterThanOrEqual(onColour.minX, back.frame.maxX, "the bar's name runs under the back button")
    XCTAssertLessThanOrEqual(onColour.maxX, app.buttons["save-for-later"].frame.minX, "the bar's name runs under the save button")
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

  /// The neon's page, signed in as the owner (the stand-in Apple's, `-fake-owner`).
  private func ownersNeon(_ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-v2", "YES",
                           "-fake-accounts", "on", "-reset-fake-server", "-fake-owner", "ui-apple"] + args
    app.launchForFlow()
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

  /// The sheet's switch, tapped, and the sheet closed.
  private func flip(_ app: XCUIApplication) {
    app.openAccount()
    let toggle = app.switches["v2-switch"]
    repeatUntil(toggle.exists && toggle.isHittable, times: 6) { app.swipeUp() }
    XCTAssertTrue(toggle.exists, "no v2 switch in the Tài khoản sheet")
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
