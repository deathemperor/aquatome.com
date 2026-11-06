import XCTest

/// The handbook tab on a small fixed index (`-fixed-handbook`, HandbookIndex.fixture): searching and browsing (the
/// home's shelves: fish groups, placements, the glossary) work without the network, the same way each run.
final class HandbookFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testFindsAFishTypedWithoutAccents() {
    let app = launch()
    search(app, "ca dia")
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cá neon").exists)
  }

  func testFindsByAnotherName() {
    let app = launch()
    search(app, "neon tetra")
    XCTAssertTrue(item(app, "Cá neon").waitForExistence(timeout: 5))
  }

  func testBrowsesAFishGroupNotEverything() {
    let app = launch()
    // The home leads with ways in, not every page: the discus is a well-known fish, the zebra danio isn't.
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5), "no fish groups")
    // All the way down the home (a lazy list draws only what's on screen), then back to the groups.
    for _ in 0..<6 {
      XCTAssertFalse(item(app, "Cá ngựa vằn").exists, "every fish on the home")
      app.swipeUp()
    }
    XCTAssertFalse(item(app, "Cá ngựa vằn").exists, "every fish on the home")
    repeatUntil(shelf(app, "Cichlid").isHittable, times: 8) { app.swipeDown() }
    // Hittable while still under the top bar, where a tap lands on the status bar and only scrolls: once more, to the top.
    app.swipeDown()
    shelf(app, "Cichlid").tap()
    XCTAssertTrue(app.navigationBars["Cichlid"].waitForExistence(timeout: 5))
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cá neon").exists)
  }

  func testBrowsesEveryFishAndThePlantsByWhereTheyGo() {
    let app = launch()
    let all = app.descendants(matching: .any)["all-fish"]
    XCTAssertTrue(all.waitForExistence(timeout: 5))
    XCTAssertTrue(all.label.hasPrefix("Tất cả loài"), all.label)
    all.tap()
    for name in ["Cá đĩa", "Cá neon", "Cá ngựa vằn"] { XCTAssertTrue(item(app, name).waitForExistence(timeout: 5), name) }
    XCTAssertFalse(item(app, "Rotala đỏ").exists, "a plant among the fish")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    shelf(app, "Hậu cảnh").tap()
    XCTAssertTrue(item(app, "Rotala đỏ").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cá đĩa").exists)
  }

  func testFiltersTheFishToMyTank() {
    // Bể 60 (60 cm long): the neon fits, the discus needs 120 cm, the zebra danio has no figures yet.
    let app = launch("-seed-tanks", "clash")
    let all = app.descendants(matching: .any)["all-fish"]
    XCTAssertTrue(all.waitForExistence(timeout: 5))
    all.tap()
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    app.buttons["filter"].tap()
    let tank = app.buttons.matching(identifier: "my-tank").matching(NSPredicate(format: "label BEGINSWITH 'Bể 60'")).firstMatch
    XCTAssertTrue(tank.waitForExistence(timeout: 5), "the reader's tank not offered")
    tank.tap()
    app.buttons["Xong"].tap()

    XCTAssertTrue(app.staticTexts["1 loài phù hợp · 1 loài chưa đủ dữ liệu để chắc"].waitForExistence(timeout: 5))
    XCTAssertTrue(item(app, "Cá neon").exists)
    XCTAssertFalse(item(app, "Cá đĩa").exists, "a fish too big for the tank")
    XCTAssertTrue(app.staticTexts["Chưa đủ dữ liệu để chắc (1)"].exists)
    XCTAssertTrue(item(app, "Cá ngựa vằn").exists, "a fish with no figures left out")

    app.buttons["Xóa lọc"].tap()
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    XCTAssertFalse(app.staticTexts["Chưa đủ dữ liệu để chắc (1)"].exists)
  }

  func testFiltersThePlantsToTheTanksLight() {
    let app = launch()
    let all = app.descendants(matching: .any)["all-plants"]
    repeatUntil(all.exists && all.isHittable, times: 4) { app.swipeUp() }
    all.tap()
    XCTAssertTrue(item(app, "Rotala đỏ").waitForExistence(timeout: 5))
    app.buttons["filter"].tap()
    // Rotala needs strong light: out under weak light, in under strong.
    pick(app, "Ánh sáng bể", "Yếu")
    app.buttons["Xong"].tap()
    XCTAssertTrue(app.staticTexts["Không có loài nào khớp. Thử nới điều kiện lọc."].waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Rotala đỏ").exists)
    app.buttons["filter"].tap()
    pick(app, "Ánh sáng bể", "Mạnh")
    app.buttons["Xong"].tap()
    XCTAssertTrue(app.staticTexts["1 loài phù hợp"].waitForExistence(timeout: 5))
    XCTAssertTrue(item(app, "Rotala đỏ").exists)
  }

  func testFindsAToolByWhatItsPageSays() {
    let app = launch()
    // "Bể của tôi" by the words of its page's title ("sổ ghi bể cá"), not its name.
    search(app, "so ghi")
    XCTAssertTrue(item(app, "Bể của tôi").waitForExistence(timeout: 5), "the tool not found by its page's words")
  }

  /// A video's length as the site writes it in every language: "29:15", not the phone's time style ("29.15" in
  /// Indonesian).
  func testAVideosLengthReadsAsTheSiteWritesItInIndonesianToo() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(id)", "-AppleLocale", "id_ID", "-reset-defaults", "-fixed-handbook"]
    app.launchForFlow()
    let all = app.descendants(matching: .any)["all-videos"]
    repeatUntil(all.exists && all.isHittable, times: 8) { app.swipeUp() }
    all.tap()
    let video = item(app, "Cách hạn chế rêu hại")
    XCTAssertTrue(video.waitForExistence(timeout: 5))
    XCTAssertEqual(video.value as? String, "29:15")
  }

  func testVideosHaveAShelfOfTheirOwn() {
    let app = launch()
    let all = app.descendants(matching: .any)["all-videos"]
    repeatUntil(all.exists && all.isHittable, times: 8) { app.swipeUp() }
    XCTAssertTrue(item(app, "Rêu hại từ A đến Z").exists, "no video series on the home")
    all.tap()
    XCTAssertTrue(app.navigationBars["Video"].waitForExistence(timeout: 5))
    let video = item(app, "Cách hạn chế rêu hại")
    XCTAssertTrue(video.waitForExistence(timeout: 5))
    XCTAssertEqual(video.value as? String, "29:15", "no length")
    // Not among the written guides, as on the site's guide list.
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let guides = app.descendants(matching: .any)["all-guides"]
    repeatUntil(guides.exists && guides.isHittable, times: 8) { app.swipeDown() }
    guides.tap()
    XCTAssertTrue(item(app, "Nuôi cá neon").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cách hạn chế rêu hại").exists, "a video among the written guides")
  }

  func testSearchesOneKind() {
    let app = launch()
    search(app, "neon")
    XCTAssertTrue(item(app, "Cá neon").waitForExistence(timeout: 5))
    let guides = chip(app, "guide")
    guides.tap()
    XCTAssertTrue(item(app, "Nuôi cá neon trong bể nhỏ").waitForExistence(timeout: 5))
    XCTAssertFalse(item(app, "Cá neon").exists, "a fish among the guides")
    XCTAssertTrue(guides.isSelected, "the kind picked isn't marked")
    XCTAssertFalse(chip(app, "all").isSelected, "“Tất cả” still marked")
    XCTAssertEqual(guides.value as? String, "\(rows(app))", "the guides' count isn't the rows shown")
  }

  // The kinds under the search field were the system's scope bar: seven in one capsule, their names cut short.
  func testTypingShowsTheKindsFoundWithHowMany() {
    let app = launch()
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5))
    XCTAssertFalse(chip(app, "all").exists, "kinds before a search")
    search(app, "ca")
    let all = chip(app, "all")
    XCTAssertTrue(all.waitForExistence(timeout: 5), "no kinds once the reader types")
    XCTAssertEqual(app.descendants(matching: .any)["kinds"].label, "Lọc kết quả")
    XCTAssertTrue(all.isSelected, "not every kind to begin with")
    // Each kind whole, and how many it finds: all of them for “Tất cả”, as many as the rows.
    XCTAssertEqual(all.label, "Tất cả")
    // The tools: "Bể của tôi" (its words say "bể cá") and fish ID ("Đây là cá gì?").
    XCTAssertEqual(all.value as? String, "8")
    XCTAssertEqual(rows(app), 8)
    for (kind, title, count) in [("fish", "Loài cá", 3), ("guide", "Hướng dẫn", 2), ("video", "Video", 2), ("tool", "Công cụ", 2)] {
      let c = chip(app, kind)
      XCTAssertTrue(c.exists, "no \(title)")
      XCTAssertEqual(c.label, title)
      XCTAssertEqual(c.value as? String, "\(count)", title)
      XCTAssertFalse(c.isSelected, title)
    }
    // A kind with nothing found has no chip.
    XCTAssertFalse(chip(app, "plant").exists, "plants, with none found")
    XCTAssertFalse(chip(app, "glossary").exists, "the glossary, with none found")
  }

  // A kind picked keeps its chip when the next letters find none of it: the way back to the others.
  func testAKindPickedStaysWhenTheSearchFindsNoneOfIt() {
    let app = launch()
    search(app, "do")
    chip(app, "plant").tap()
    XCTAssertTrue(item(app, "Rotala đỏ").waitForExistence(timeout: 5))
    app.searchFields.firstMatch.typeText("n")
    let plants = chip(app, "plant")
    XCTAssertTrue(plants.waitForExistence(timeout: 5) && plants.isSelected, "the kind picked went with its last result")
    XCTAssertEqual(plants.value as? String, "0")
    XCTAssertEqual(rows(app), 0)
    XCTAssertEqual(chip(app, "fish").value as? String, "2")
    chip(app, "all").tap()
    XCTAssertTrue(item(app, "Cá đĩa").waitForExistence(timeout: 5))
    XCTAssertEqual(rows(app), 2)
  }

  func testClearingTheSearchHidesTheKindsAndShowsTheHome() {
    let app = launch()
    search(app, "neon")
    chip(app, "guide").tap()
    let field = app.searchFields.firstMatch
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 4))
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5), "not the home")
    XCTAssertFalse(chip(app, "all").exists, "kinds without a search")
    // The next search starts with every kind, not the one picked for the last.
    field.typeText("ca")
    XCTAssertTrue(chip(app, "all").waitForExistence(timeout: 5) && chip(app, "all").isSelected, "still narrowed to the guides")
    XCTAssertEqual(rows(app), 8)
  }

  // "c" counted 2,183 over the 200 rows a search lists, with nothing saying so. Three to a page here (`-search-page`),
  // as 200 are on the site's index.
  func testMoreFoundThanListedSaysSoAndListsMore() {
    let app = launch("-search-page", "3")
    // The keyboard put away, so the button under the rows can be tapped.
    search(app, "ca\n")
    let note = app.staticTexts["more-note"]
    XCTAssertTrue(note.waitForExistence(timeout: 5), "no word under the rows listed")
    XCTAssertEqual(note.label, "Đang hiện 3 trong 8 kết quả. Gõ thêm để thu hẹp.")
    XCTAssertEqual(chip(app, "all").value as? String, "8")
    app.buttons["more"].tap()
    XCTAssertEqual(note.label, "Đang hiện 6 trong 8 kết quả. Gõ thêm để thu hẹp.")
    app.buttons["more"].tap()
    // "Xem thêm kết quả" lists the rest in the tap itself, with no search (MoreResults), as the 6 of 8 above is read
    // straight after its tap. Checked before the rows are counted, which scrolls the list away from the note.
    XCTAssertFalse(note.exists, "still short, with all of it listed")
    XCTAssertEqual(rows(app), 8)
    chip(app, "fish").tap()
    // The fish picked (what would leave a note if it had more than 3), then the note.
    let picked = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isSelected == true"), object: chip(app, "fish"))
    XCTAssertEqual(XCTWaiter().wait(for: [picked], timeout: 5), .completed, "the fish not picked")
    XCTAssertFalse(note.exists, "short of a kind that has only 3")
    XCTAssertEqual(rows(app), 3)
    // Another kind picked lists its best 3 again, not as many as the last one had.
    chip(app, "all").tap()
    XCTAssertTrue(note.waitForExistence(timeout: 5), "all 8 listed again, not the best 3")
    XCTAssertEqual(note.label, "Đang hiện 3 trong 8 kết quả. Gõ thêm để thu hẹp.")
    XCTAssertEqual(rows(app), 3)
  }

  // The note under the rows was the footer's secondary: 3.3:1 on the light look's background.
  func testTheNoteUnderTheRowsReadsClearly() { noteReadsClearly(launch("-search-page", "3")) }
  func testTheNoteUnderTheRowsReadsClearlyInTheDark() { noteReadsClearly(launch("-search-page", "3", "-dark")) }

  private func noteReadsClearly(_ app: XCUIApplication) {
    search(app, "ca\n")
    let note = app.staticTexts["more-note"]
    XCTAssertTrue(note.waitForExistence(timeout: 5), "no word under the rows listed")
    readsClearly(app, note, "the note")
  }

  // With "Cây" picked and "don" typed, it said there were no results, under "Loài cá 2".
  func testAKindWithNoneSaysWhichKindsHaveSome() {
    let app = launch()
    search(app, "do")
    chip(app, "plant").tap()
    app.searchFields.firstMatch.typeText("n")
    XCTAssertTrue(app.staticTexts["Không có kết quả trong “Cây”"].waitForExistence(timeout: 5), "not said which kind has none")
    XCTAssertTrue(app.staticTexts["“don” có kết quả trong Loài cá (2)."].exists, "not said where the results are")
    app.buttons["see-all"].tap()
    XCTAssertTrue(chip(app, "all").isSelected)
    XCTAssertEqual(rows(app), 2)
  }

  // At the largest text that message, laid over the whole list, covered the chips, and with the keyboard up its
  // "Xem tất cả" was under the keyboard, out of reach.
  func testAKindWithNoneLeavesTheChipsAndTheWayBackInReachAtTheLargestText() {
    let app = launch("-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    search(app, "do")
    chip(app, "plant").tap()
    app.searchFields.firstMatch.typeText("n")
    let said = [app.staticTexts["Không có kết quả trong “Cây”"], app.staticTexts["“don” có kết quả trong Loài cá (2)."]]
    XCTAssertTrue(said[0].waitForExistence(timeout: 5) && said[1].exists, "not said which kind has none")
    XCTAssertTrue(app.keyboards.firstMatch.exists, "the keyboard isn't up")
    XCTAssertTrue(chip(app, "plant").isHittable, "the kind picked can't be tapped")
    for kind in ["all", "fish", "plant"] {
      let c = chip(app, kind)
      XCTAssertTrue(c.exists, "no \(kind) chip")
      // A chip on screen (the row scrolls sideways) can be tapped, and nothing said is over it.
      if app.frame.contains(c.frame) { XCTAssertTrue(c.isHittable, "\(kind)'s chip can't be tapped") }
      for text in said { XCTAssertFalse(text.frame.intersects(c.frame), "“\(text.label)” is over \(kind)'s chip") }
    }
    // In reach with the keyboard up: on screen, or once the list is moved up under the chips.
    let all = app.buttons["see-all"], list = app.collectionViews.firstMatch
    var moves = 0
    while !all.isHittable && moves < 3 {
      drag(list, from: 0.55, to: 0.2)
      moves += 1
    }
    XCTContext.runActivity(named: "“Xem tất cả” in reach after \(moves) drags") { _ in }
    XCTAssertTrue(all.isHittable, "“Xem tất cả” out of reach")
    all.tap()
    // Back up to the chips, from below the search field (at this size it reaches a fifth of the way down).
    repeatUntil(chip(app, "all").exists && chip(app, "all").isHittable, times: 3) { drag(list, from: 0.3, to: 0.6) }
    XCTAssertTrue(chip(app, "all").exists && chip(app, "all").isSelected, "not back to every kind")
  }

  // Typing here redrew the tanks tab's guides and fish picker, and searched again for them, letter by letter: they
  // read the index searched through this tab's search, which each letter changes.
  func testTypingHereLeavesWhatTheTanksTabSearchesAlone() {
    let app = launch("-watch-tank-searches", "-search-page", "3")
    let changes = app.staticTexts["tank-search-changes"]
    XCTAssertTrue(changes.waitForExistence(timeout: 5), "not watched")
    // The index coming in is a change: what the tanks tab searches is new.
    let loaded = XCTNSPredicateExpectation(predicate: NSPredicate(format: "label != '0'"), object: changes)
    XCTAssertEqual(XCTWaiter().wait(for: [loaded], timeout: 5), .completed, "the index didn't come in")
    let before = changes.label
    search(app, "ca\n")
    app.buttons["more"].tap()
    chip(app, "fish").tap()
    let field = app.searchFields.firstMatch
    field.tap()
    field.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 2))
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5), "not the home")
    XCTAssertEqual(changes.label, before, "typing, a page more and a kind picked changed what the tanks tab searches")
  }

  // At the largest text the rows run past the screen, and counting only the rows drawn found 2 of 7.
  func testTheCountsMatchTheRowsAtTheLargestText() {
    let app = launch("-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    search(app, "ca")
    XCTAssertTrue(chip(app, "all").waitForExistence(timeout: 5))
    XCTAssertEqual(chip(app, "all").value as? String, "8")
    let seen = screens(app)
    XCTAssertEqual(Self.count(seen), 8, "\(seen)")
  }

  // Counting each name once, a row listed twice counted as one.
  func testARowListedTwiceCountsTwice() {
    XCTAssertEqual(Self.count([["Cá neon", "Cá neon", "Cá đĩa"], ["Cá đĩa", "Cá ngựa vằn"]]), 4)
  }

  // A chip's count off the picked chip read 3.1:1 on its fill in the light look, under the 4.5:1 text needs.
  func testTheKindsCountsReadClearly() { countsReadClearly(launch()) }
  func testTheKindsCountsReadClearlyInTheDark() { countsReadClearly(launch("-dark")) }

  private func countsReadClearly(_ app: XCUIApplication) {
    search(app, "ca")
    XCTAssertTrue(chip(app, "fish").waitForExistence(timeout: 5))
    for kind in ["all", "fish"] { readsClearly(app, chip(app, kind).staticTexts.element(boundBy: 1), "\(kind)'s count") }
  }

  /// `text` reads at least 4.5:1 on what's behind it, once the screen is still: the ratio is in the test's log.
  private func readsClearly(_ app: XCUIApplication, _ text: XCUIElement, _ what: String) {
    let until = Date().addingTimeInterval(1)
    while Date() < until { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
    let ratio = contrast(app, text)
    XCTContext.runActivity(named: String(format: "%@: %.2f:1", what, ratio)) { _ in }
    XCTAssertGreaterThanOrEqual(ratio, 4.5, "\(what) reads \(ratio):1")
  }

  func testTheGlossaryGoesByLetter() {
    let app = launch()
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5))
    // The last section: drawn once it's scrolled to.
    let all = app.descendants(matching: .any)["all-glossary"]
    repeatUntil(all.exists && all.isHittable, times: 6) { app.swipeUp() }
    all.tap()
    XCTAssertTrue(app.navigationBars["Thuật ngữ"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.staticTexts["Đ"].exists, "no letter")
    XCTAssertTrue(item(app, "Đệm pH").exists)
  }

  // What's new, as the site's list has it (HandbookIndex.fixtureLatest): from the home's last rows, each page with the
  // day it was added or updated and its source, newest first (a page the index doesn't have left out, the neon there
  // twice), the rest of the list on the web; a page opens from it.
  func testWhatsNewListsTheSitesLatestPagesAndOpensThem() {
    let app = launch("-whats-new")
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5))
    let all = app.descendants(matching: .any)["all-latest"]
    repeatUntil(all.exists && all.isHittable, times: 6) { app.swipeUp() }
    XCTAssertTrue(all.label.hasSuffix("28/10/2026"), all.label)
    all.tap()
    XCTAssertTrue(app.navigationBars["Mới cập nhật"].waitForExistence(timeout: 5))
    let rows = app.descendants(matching: .any).matching(identifier: "latest")
    XCTAssertTrue(rows.firstMatch.waitForExistence(timeout: 5))
    let expected = [("Cá neon", "28/10/2026 · Cập nhật · Seriously Fish"), ("Nuôi cá neon trong bể nhỏ", "27/10/2026 · Mới · 2Hr Aquarist"),
                    ("Rotala đỏ", "20/10/2026 · Mới · Tropica"), ("Cá neon", "12/10/2026 · Mới · Seriously Fish")]
    XCTAssertEqual(rows.count, expected.count, rows.allElementsBoundByIndex.map { $0.label }.joined(separator: " | "))
    for (i, (name, change)) in expected.enumerated() {
      let label = rows.element(boundBy: i).label
      XCTAssertTrue(label.hasPrefix(name) && label.contains(change), "\(i): \(label)")
    }
    XCTAssertTrue(app.descendants(matching: .any)["latest-web"].exists, "no link to the whole list")
    rows.element(boundBy: 2).tap()
    XCTAssertTrue(app.navigationBars["Rotala đỏ"].waitForExistence(timeout: 5))
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not drawn by the app")
  }

  // A site whose index names no what's new (the other languages'): no row for it on the home.
  func testNoWhatsNewOnTheHomeOfASiteWithoutIt() {
    let app = launch()
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5))
    let contact = app.descendants(matching: .any)["contact"]
    repeatUntil(contact.exists && contact.isHittable, times: 12) { app.swipeUp() }
    XCTAssertTrue(contact.exists, "not at the home's end")
    XCTAssertFalse(app.descendants(matching: .any)["all-latest"].exists)
  }

  // A kind of kit, drawn by the app from the site's blocks: from the home, its types with their shop links, its long list
  // of fish a tap away so what follows it (the questions, the affiliate note) stays in reach.
  func testAKindOfKitIsDrawnByTheAppWithItsLongListATapAway() {
    let app = launch("-equipment")
    XCTAssertTrue(shelf(app, "Cichlid").waitForExistence(timeout: 5))
    let kit = item(app, "Lọc")
    for _ in 0..<8 where !(kit.exists && kit.isHittable) { app.swipeUp() }
    XCTAssertTrue(kit.label.contains("Thiết bị"), kit.label)
    kit.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not drawn by the app")
    XCTAssertFalse(app.descendants(matching: .any)["page"].exists, "the web page")
    XCTAssertTrue(app.staticTexts["Các loại lọc"].exists, "no types")
    XCTAssertTrue(app.staticTexts["Lọc thùng"].exists, "no type")
    let buy = app.links["Mua lọc thùng trên Shopee"]
    for _ in 0..<4 where !buy.exists { app.swipeUp() }
    XCTAssertTrue(buy.exists, "no shop link")
    // Twelve of the forty, then the whole list; what follows it is a few swipes away.
    let all = app.descendants(matching: .any)["pages-all"]
    for _ in 0..<12 where !(all.exists && all.isHittable) { app.swipeUp() }
    XCTAssertTrue(all.isHittable, "no way to the whole list")
    XCTAssertTrue(all.label.contains("40"), all.label)
    XCTAssertTrue(item(app, "Cá thử 12").exists, "fewer than twelve in place")
    XCTAssertFalse(item(app, "Cá thử 13").exists, "more than twelve in place")
    let note = app.staticTexts["Liên kết tiếp thị — trang có thể nhận hoa hồng khi bạn mua qua liên kết."]
    // A question and its answer are one text.
    let question = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Bao lâu rửa lọc một lần?")).firstMatch
    all.tap()
    XCTAssertTrue(app.navigationBars["Loài cá cần lọc"].waitForExistence(timeout: 5))
    let last = item(app, "Cá thử 40")
    for _ in 0..<12 where !(last.exists && last.isHittable) { app.swipeUp(velocity: .fast) }
    XCTAssertTrue(last.isHittable, "not the whole list")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    for _ in 0..<4 where !question.exists { app.swipeUp() }
    XCTAssertTrue(question.exists, "no questions after the list")
    for _ in 0..<6 where !(note.exists && note.isHittable) { app.swipeUp() }
    XCTAssertTrue(note.exists && note.isHittable, "the page's end out of reach")
  }

  func testTheChihirosToolOpensTheLightsTab() {
    let app = launch()
    search(app, "chihiros")
    item(app, "Đèn Chihiros").tap()
    XCTAssertTrue(app.buttons["scan"].waitForExistence(timeout: 5), "the Lights tab")
  }

  func testTheMyTanksToolOpensTheTanksTab() {
    let app = launch()
    search(app, "be cua toi")
    item(app, "Bể của tôi").tap()
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "the tanks tab, not the site's page")
  }

  func testAPageOpensInTheApp() {
    let app = launch()
    item(app, "Cá neon").tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5))
    // The site writes the neon's page as blocks: the app draws it.
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not drawn by the app")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    // The discus has no copy among them: its web page, stood in for, naming its path (no test reaches aquatome.com). A web
    // view's first start can take a while on a slow runner.
    item(app, "Cá đĩa").tap()
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "not the web page")
    XCTAssertTrue(app.webViews.staticTexts["/vi/ca/ca-dia/"].waitForExistence(timeout: 15), "not the stand-in page")
  }

  // Reading down a page, the tab bar shrinks to the open tab's button; a tap on it, or the page back at its top, brings
  // it back. (iOS 26 shrinks it; older iOS keeps the bar as it is.)
  func testTheTabBarShrinksWhileScrollingDownAndComesBack() throws {
    guard #available(iOS 26.0, *) else { throw XCTSkip("the tab bar shrinks from iOS 26") }
    let app = launch()
    let tabs = app.tabBars.buttons
    XCTAssertTrue(tabs["Tìm"].waitForExistence(timeout: 5))
    let all = tabs.count
    XCTAssertGreaterThanOrEqual(all, 3)
    app.swipeUp()
    app.swipeUp()
    XCTAssertTrue(waitFor(tabs, 1), "the tab bar didn't shrink")
    XCTAssertEqual(tabs.firstMatch.label, "Tìm", "the open tab isn't the one left")
    app.swipeDown()
    app.swipeDown()
    app.swipeDown()
    XCTAssertTrue(waitFor(tabs, all), "back at the top, the tab bar didn't come back")
    app.swipeUp()
    app.swipeUp()
    XCTAssertTrue(waitFor(tabs, 1), "the tab bar didn't shrink again")
    app.showTabs()
    XCTAssertTrue(waitFor(tabs, all), "a tap on the shrunk tab bar didn't bring it back")
  }

  private func waitFor(_ tabs: XCUIElementQuery, _ n: Int) -> Bool {
    XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "count == %d", n), object: tabs)], timeout: 5) == .completed
  }

  // MARK: Helpers

  private func launch(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"] + more
    app.launchForFlow()
    return app
  }

  private func search(_ app: XCUIApplication, _ text: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(text)
  }

  /// A way into a shelf on the home (a fish group, a placement, a subject), by its word.
  private func shelf(_ app: XCUIApplication, _ label: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "shelf").matching(NSPredicate(format: "label BEGINSWITH %@", label)).firstMatch
  }

  /// Picks an option of a filter's picker (which reads its label, then the option picked).
  private func pick(_ app: XCUIApplication, _ picker: String, _ option: String) {
    app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", picker)).firstMatch.tap()
    let choice = app.buttons[option]
    XCTAssertTrue(choice.waitForExistence(timeout: 5), "no \(option) under \(picker)")
    choice.tap()
  }

  /// The chip of a kind under the search field (`all` for every kind).
  private func chip(_ app: XCUIApplication, _ kind: String) -> XCUIElement { app.buttons["kind-\(kind)"] }

  /// How many result rows there are: the list's cells holding a page, not the chips' header, told apart by what they read
  /// (a row's button and what it draws both carry its "item"). The list draws only the cells on screen, so it's dragged
  /// a part of a screen at a time, the keyboard put away first, until it stops moving (a row taller than a drag can stay
  /// on screen through one), and back. Each screen is read in one snapshot: a query per cell took seconds each.
  private func rows(_ app: XCUIApplication) -> Int { Self.count(screens(app)) }

  /// How many rows the screens hold: each name as many times as it shows on any one of them, so a row listed twice
  /// counts twice, and a row on two screens once.
  private static func count(_ screens: [[String]]) -> Int {
    var most: [String: Int] = [:]
    for screen in screens {
      for (name, n) in Dictionary(screen.map { ($0, 1) }, uniquingKeysWith: +) { most[name] = max(most[name] ?? 0, n) }
    }
    return most.values.reduce(0, +)
  }

  /// The names of the rows on each screen of the list, top to bottom.
  private func screens(_ app: XCUIApplication) -> [[String]] {
    // A drag with the keyboard up once waited 116 s for the app's animations to end.
    if app.keyboards.firstMatch.exists { app.searchFields.firstMatch.typeText("\n") }
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5), "the keyboard is still up")
    let list = app.collectionViews.firstMatch
    var screens: [[String]] = []
    var last: [String] = []
    var moves = 0
    while moves < 30 {
      // Tests run on the main thread, where the snapshot is read.
      let here: [String] = MainActor.assumeIsolated {
        var found: [String] = []
        func walk(_ e: XCUIElementSnapshot, cell: XCUIElementSnapshot?) {
          if e.identifier == "item", let cell { return found.append("\(e.label)\u{0}\(Int(cell.frame.minY))") }
          for c in e.children { walk(c, cell: e.elementType == .cell ? e : cell) }
        }
        if let snap = try? list.snapshot() { walk(snap, cell: nil) }
        return found
      }
      if here == last { break }
      screens.append(here.map { String($0.prefix { $0 != "\u{0}" }) })
      last = here
      drag(list, from: 0.55, to: 0.2)
      moves += 1
    }
    // Back to the top, where the chips are, from below the search field (at the largest text it reaches 0.22 down).
    for _ in 0..<moves { drag(list, from: 0.3, to: 0.65) }
    return screens
  }

  private func drag(_ list: XCUIElement, from: CGFloat, to: CGFloat) {
    list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: from))
      .press(forDuration: 0.05, thenDragTo: list.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: to)), withVelocity: .fast,
             thenHoldForDuration: 0.2)
  }

  /// How `text` reads on what's behind it, as WCAG measures contrast: its most contrasting pixel against the colour most
  /// of its box is (a chip's fill, for its count).
  private func contrast(_ app: XCUIApplication, _ text: XCUIElement) -> Double {
    guard let shot = XCUIScreen.main.screenshot().image.cgImage else { return 0 }
    let scale = CGFloat(shot.width) / app.frame.width
    let f = text.frame
    guard let box = shot.cropping(to: CGRect(x: f.minX * scale, y: f.minY * scale, width: f.width * scale, height: f.height * scale).integral)
    else { return 0 }
    let w = box.width, h = box.height
    var px = [UInt8](repeating: 0, count: w * h * 4)
    guard let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpace(name: CGColorSpace.sRGB)!,
                              bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return 0 }
    ctx.draw(box, in: CGRect(x: 0, y: 0, width: w, height: h))
    func luminance(_ i: Int) -> Double {
      func channel(_ v: UInt8) -> Double { let c = Double(v) / 255; return c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
      return 0.2126 * channel(px[i]) + 0.7152 * channel(px[i + 1]) + 0.0722 * channel(px[i + 2])
    }
    var often: [Int: Int] = [:]
    for i in stride(from: 0, to: px.count, by: 4) { often[Int(px[i]) << 16 | Int(px[i + 1]) << 8 | Int(px[i + 2]), default: 0] += 1 }
    guard let fill = often.max(by: { $0.value < $1.value })?.key,
      let back = stride(from: 0, to: px.count, by: 4).first(where: { Int(px[$0]) << 16 | Int(px[$0 + 1]) << 8 | Int(px[$0 + 2]) == fill })
    else { return 0 }
    let b = luminance(back)
    var best = 1.0
    for i in stride(from: 0, to: px.count, by: 4) {
      let l = luminance(i)
      best = max(best, (max(l, b) + 0.05) / (min(l, b) + 0.05))
    }
    return best
  }

  /// A result row, by its name (the row reads its name, then its scientific name or kind).
  private func item(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
  }
}
