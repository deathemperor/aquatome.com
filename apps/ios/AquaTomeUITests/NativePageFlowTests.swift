import XCTest

/// A guide the app draws itself from the site's blocks (NativePage), from the fixed pages (no network): its parts, its
/// links into the app, a word's tip, the sources its credit points to, and the web page for a part it can't draw.
final class NativePageFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testAGuideIsDrawnByTheAppNotTheWebPage() {
    let app = openGuide()
    XCTAssertTrue(app.staticTexts["Tóm tắt nhanh"].exists, "no summary")
    XCTAssertTrue(app.staticTexts["Bể và nước"].exists, "no heading")
    XCTAssertTrue(app.staticTexts["Chăm sóc · đọc khoảng 4 phút"].exists, "no header line")
    // A list numbered, a table as lines under its columns' names, the answers under their questions, the sources.
    XCTAssertTrue(text(app, "2. Cây thủy sinh và lũa.").exists, "no numbered list")
    XCTAssertTrue(text(app, "Mức: 20–26°C").exists, "no table under its columns' names")
    XCTAssertTrue(text(app, "Nuôi mấy con?\nTừ 6 con trở lên.").exists, "no answer under its question")
    XCTAssertTrue(app.links["Neon tetra care"].exists, "no sources")
    XCTAssertFalse(app.descendants(matching: .any)["page"].exists, "the web page")
  }

  /// Every part VoiceOver lands on says what it is: no picture read as an empty or dimmed button.
  func testEveryPartSaysWhatItIs() throws {
    let app = openGuide()
    try app.performAccessibilityAudit(for: .sufficientElementDescription)
  }

  /// Opened before the index says the app draws guides (`-pages-later`): the web page for this visit, not a spinner
  /// once it says so; opened again, drawn by the app.
  func testAGuideOpenedBeforeTheAppDrawsItsKindStaysOnTheWebPage() {
    let app = launch("-pages-later")
    openRow(app, "nuoi ca neon")
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "not the web page")
    // A web view's first start can take a while on a slow runner.
    XCTAssertTrue(app.webViews.staticTexts["/vi/huong-dan/nuoi-ca-neon/"].waitForExistence(timeout: 15), "not the stand-in page")
    // The index says so a second after the page opens.
    let after = Date().addingTimeInterval(3)
    while Date() < after { RunLoop.current.run(until: Date().addingTimeInterval(0.2)) }
    XCTAssertTrue(app.descendants(matching: .any)["page"].exists, "the web page went away")
    XCTAssertFalse(app.activityIndicators.firstMatch.exists, "a spinner")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    app.descendants(matching: .any).matching(identifier: "item").firstMatch.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "not drawn by the app the next time")
  }

  /// From the tanks tab, a link in a guide pushes its page on the tanks tab, not on the Tìm tab.
  func testALinkFromTheTanksTabOpensOnTheTanksTab() {
    let app = launch("-seed-tanks", "life") // "Bể cá neon": a guide names its neons
    app.tabBars.buttons["Bể của tôi"].tap()
    app.buttons["tank"].firstMatch.tap()
    let guide = app.buttons.matching(identifier: "tank-guide").firstMatch
    for _ in 0..<6 where !(guide.exists && guide.isHittable) { app.swipeUp() }
    guide.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the guide isn't drawn by the app")
    app.links["neon"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the link didn't open the fish")
    XCTAssertTrue(app.tabBars.buttons["Bể của tôi"].isSelected, "not on the tanks tab")
  }

  /// A tool among the pages a guide names opens the app's own screen for it, as in search: not its web page first, left
  /// on the Tìm tab.
  func testAToolItNamesOpensItsTab() {
    let app = openGuide()
    // In the page, not the tab bar's button of the same name.
    let tool = app.descendants(matching: .any)["native-page"].buttons.matching(NSPredicate(format: "label BEGINSWITH 'Bể của tôi'")).firstMatch
    reveal(app, tool)
    tool.tap()
    XCTAssertTrue(app.buttons["add-first"].waitForExistence(timeout: 5), "not the tanks tab")
    app.tabBars.buttons["Tìm"].tap()
    XCTAssertTrue(app.navigationBars["Nuôi cá neon trong bể nhỏ"].waitForExistence(timeout: 5), "the tool's web page was pushed on the Tìm tab")
  }

  func testAPageItNamesOpensInTheAppAndOneTheIndexLacksIsLeftOut() {
    let app = openGuide()
    let fish = app.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    reveal(app, fish)
    XCTAssertEqual(app.buttons.matching(NSPredicate(format: "label CONTAINS 'khong-co'")).count, 0)
    fish.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the fish didn't open")
    XCTAssertTrue(app.descendants(matching: .any)["facts-card"].waitForExistence(timeout: 5), "not the fish's page")
  }

  func testALinkInTheTextOpensItsPageOnTheSameTab() {
    let app = openGuide()
    app.links["neon"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the link didn't open the fish")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Nuôi cá neon trong bể nhỏ"].waitForExistence(timeout: 5), "not back on the guide")
  }

  func testAWordsTipShowsWhatItMeans() {
    let app = openGuide()
    app.links["pH"].firstMatch.tap()
    let alert = app.alerts["Đệm pH"]
    XCTAssertTrue(alert.waitForExistence(timeout: 5), "no tip")
    XCTAssertTrue(alert.staticTexts["Khả năng giữ pH của nước khi có thêm axit."].exists)
    alert.buttons["Xem thêm"].tap()
    XCTAssertTrue(app.navigationBars["Đệm pH"].waitForExistence(timeout: 5), "the word's page didn't open")
  }

  func testTheCreditsSourcesLinkScrollsToTheSources() {
    let app = openGuide()
    let sources = app.staticTexts["Nguồn tham khảo"]
    XCTAssertFalse(sources.exists && sources.isHittable, "already in view: the test proves nothing")
    app.links["2 nguồn"].firstMatch.tap()
    XCTAssertTrue(sources.waitForExistence(timeout: 5))
    let deadline = Date().addingTimeInterval(3)
    while !sources.isHittable && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
    XCTAssertTrue(sources.isHittable, "the sources aren't in view")
  }

  func testAPartItCantDrawOpensTheWebPage() {
    let app = openGuide()
    let web = app.buttons["page-web"]
    reveal(app, web)
    // Two parts in a row it can't draw: one offer of the web page.
    XCTAssertEqual(app.buttons.matching(identifier: "page-web").count, 1)
    web.tap()
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "no web page")
    // A web view's first start can take a while on a slow runner.
    XCTAssertTrue(app.webViews.staticTexts["/vi/huong-dan/nuoi-ca-neon/"].waitForExistence(timeout: 15), "not the stand-in page")
    XCTAssertFalse(app.descendants(matching: .any)["native-page"].exists)
  }

  /// A fish's page as the site writes it for the app, in the order its reader asks: where it's from and its other names
  /// under its name, the summary as one paragraph with the mistakes keepers make, the Vietnamese climate, its tank-mates,
  /// its gallery (each photo credited), its videos, its breeds, then the sources' terms and the sources behind its
  /// figures, last. Each is found further down than the one before (`reveal` only scrolls down). All of it drawn: no part
  /// left to the web.
  func testAFishIsDrawnByTheAppWithEachOfItsParts() {
    let app = launch()
    openItem(app, "ca neon", "Cá neon")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the fish isn't drawn by the app")
    XCTAssertTrue(text(app, "Characidae, Peru").exists, "no family and country")
    XCTAssertTrue(text(app, "Tên khác: Neon tetra").exists, "no other names")
    reveal(app, text(app, "Cá nhỏ, hiền, hợp bể cộng đồng"))
    reveal(app, text(app, "Thả vài con"))
    reveal(app, text(app, "Mùa đông miền Bắc"))
    reveal(app, text(app, "Lớn tới 15 cm, có thể ăn Cá neon"))
    XCTAssertTrue(card(app, "Cá ngựa vằn").exists, "no fish to keep with it")
    XCTAssertTrue(app.links["Ảnh: Tác giả 5 · CC BY 4.0"].exists, "a card's photo without its credit")
    let all = app.buttons["gallery-all"]
    reveal(app, all)
    XCTAssertEqual(all.label, "Ảnh Cá neon, Xem tất cả 3 ảnh", "not read with whose photos they are")
    XCTAssertTrue(app.links["Ảnh: Tác giả 1 · CC BY 2.0"].exists, "a photo in the row without its credit")
    all.tap()
    XCTAssertTrue(app.descendants(matching: .any)["gallery"].waitForExistence(timeout: 5), "no gallery")
    // Its words once: under the photo, not as the photo's label too (the row's button for it, under the sheet, aside).
    let words = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@ AND elementType != %lu", "Đàn cá neon trong bể",
                                                                     XCUIElement.ElementType.button.rawValue))
    XCTAssertTrue(words.firstMatch.waitForExistence(timeout: 3))
    XCTAssertEqual(words.count, 1, "the photo's words read twice")
    // The last photo, not in the row: its credit is the viewer's.
    app.swipeLeft()
    app.swipeLeft()
    XCTAssertTrue(app.staticTexts["3/3 · 3 ảnh từ iNaturalist và Wikimedia Commons, giấy phép mở."].waitForExistence(timeout: 3), "not on the last photo")
    XCTAssertTrue(app.links["Ảnh: Tác giả 3 · CC BY 4.0"].waitForExistence(timeout: 3), "a photo without its credit")
    app.buttons["Đóng"].tap()
    reveal(app, text(app, "Đàn neon trong bể thủy sinh"))
    reveal(app, card(app, "Cá neon vàng"))
    reveal(app, text(app, "với sự cho phép của họ"))
    let sources = app.descendants(matching: .any)["page-more"]
    reveal(app, sources)
    sources.tap()
    XCTAssertTrue(text(app, "Seriously Fish: 20–26°C").waitForExistence(timeout: 2), "the sources behind a figure don't open")
    XCTAssertFalse(app.buttons["page-web"].exists, "a part left to the web")
  }

  /// A fish to keep with it opens its own page in the app.
  func testAFishsTankMateOpensItsPage() {
    let app = launch()
    openItem(app, "ca neon", "Cá neon")
    let mate = card(app, "Cá ngựa vằn")
    reveal(app, mate)
    mate.tap()
    XCTAssertTrue(app.navigationBars["Cá ngựa vằn"].waitForExistence(timeout: 5), "the tank-mate's page didn't open")
  }

  /// A group named in the text ("cá tetra", linked to the site's group page) opens the app's shelf of that group, as the
  /// home's group tiles do: not its web page.
  func testAGroupNamedInTheTextOpensTheAppsShelfOfIt() {
    let app = launch()
    openItem(app, "ca neon", "Cá neon")
    let group = app.links["cá tetra"].firstMatch
    reveal(app, group)
    group.tap()
    XCTAssertTrue(app.navigationBars["Cá tetra"].waitForExistence(timeout: 5), "not the group's shelf")
    XCTAssertTrue(app.descendants(matching: .any)["shelf-pages"].exists, "not the app's shelf")
    XCTAssertTrue(app.descendants(matching: .any)["shelf-pages"].buttons.matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch.exists, "the group's fish not on it")
    XCTAssertFalse(app.descendants(matching: .any)["page"].exists, "the group's web page")
  }

  /// From the tanks tab, the group's shelf opens on the tanks tab too, as a page does.
  func testAGroupFromTheTanksTabOpensOnTheTanksTab() {
    let app = launch("-seed-tanks", "life") // "Bể cá neon": a guide names its neons
    app.tabBars.buttons["Bể của tôi"].tap()
    app.buttons["tank"].firstMatch.tap()
    let guide = app.buttons.matching(identifier: "tank-guide").firstMatch
    for _ in 0..<6 where !(guide.exists && guide.isHittable) { app.swipeUp() }
    guide.tap()
    app.links["neon"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the link didn't open the fish")
    let group = app.links["cá tetra"].firstMatch
    reveal(app, group)
    group.tap()
    XCTAssertTrue(app.navigationBars["Cá tetra"].waitForExistence(timeout: 5), "not the group's shelf")
    XCTAssertTrue(app.tabBars.buttons["Bể của tôi"].isSelected, "not on the tanks tab")
  }

  /// The tank-mates tool, set to this fish by the page's link: its web page in the app, fish and all (not the tool left
  /// empty, nor the browser).
  func testTheTankMatesToolOpensSetToTheFish() {
    let app = launch()
    openItem(app, "ca neon", "Cá neon")
    let tool = app.links["Kiểm tra nuôi chung với loài khác →"].firstMatch
    reveal(app, tool)
    tool.tap()
    XCTAssertTrue(app.descendants(matching: .any)["page"].waitForExistence(timeout: 5), "not the web page in the app")
    XCTAssertTrue(app.webViews.staticTexts["/vi/cong-cu/nuoi-chung/?ca=ca-neon:6"].waitForExistence(timeout: 15), "the tool, not set to the fish")
  }

  /// A breed the index leaves out (the app can't draw it): its web page, in the app, not the browser.
  func testABreedTheAppCantDrawOpensOnTheWebInTheApp() {
    let app = launch()
    openItem(app, "ca neon", "Cá neon")
    let breed = card(app, "Cá neon vàng")
    reveal(app, breed)
    breed.tap()
    XCTAssertTrue(app.webViews.staticTexts["/vi/ca/ca-neon-vang/"].waitForExistence(timeout: 15), "not the breed's web page in the app")
  }

  /// Readers' photos and comments at the end of a fish's page, as the site has them: each photo with its reader's name,
  /// each comment with who, the day as the site writes it, and the site's mark on a good answer. A plant the site has
  /// none for shows neither.
  func testAFishsReadersPhotosAndCommentsShowAndAPlantWithNoneShowsNeither() {
    let app = launch()
    openItem(app, "ca neon", "Cá neon")
    let first = app.descendants(matching: .any).matching(identifier: "comment").element(boundBy: 0)
    reveal(app, first)
    XCTAssertTrue(text(app, "Ảnh bạn đọc").exists, "no readers' photos")
    XCTAssertTrue(app.buttons["Ảnh của Lan"].exists, "a reader's photo without its words")
    XCTAssertEqual(app.buttons["readers-all"].label, "Ảnh bạn đọc, Xem tất cả 2 ảnh", "the readers' photos don't open full size")
    XCTAssertTrue(text(app, "Thảo luận").exists, "no comments")
    XCTAssertEqual(first.label, "Lan  31/10/2026  Trả lời hay\nNuôi đàn 10 con, khỏe sau 2 năm.")
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "comment").element(boundBy: 1).label.hasPrefix("Minh  1/11/2026\n"))
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let field = app.searchFields.firstMatch
    field.buttons.firstMatch.tap() // clears it
    openItem(app, "rotala", "Rotala đỏ")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5))
    for _ in 0..<4 { app.swipeUp() }
    // Its readers' content is read once the page is open: given time to come, none does.
    XCTAssertFalse(text(app, "Thảo luận").waitForExistence(timeout: 3), "comments shown for a plant that has none")
    XCTAssertFalse(text(app, "Ảnh bạn đọc").exists)
  }

  func testAFishPageSaysWhatEachPartIs() throws {
    let app = launch()
    openItem(app, "ca neon", "Cá neon")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5))
    try app.performAccessibilityAudit(for: .sufficientElementDescription)
  }

  func testAPlantAndAGlossaryTermAreDrawnByTheApp() {
    let app = launch()
    openItem(app, "rotala", "Rotala đỏ")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the plant isn't drawn by the app")
    XCTAssertTrue(text(app, "Cần ánh sáng mạnh").exists)
    app.navigationBars.buttons.element(boundBy: 0).tap()
    let field = app.searchFields.firstMatch
    field.buttons.firstMatch.tap() // clears it
    openItem(app, "dem ph", "Đệm pH")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the term isn't drawn by the app")
    XCTAssertTrue(text(app, "Khả năng giữ pH của nước").exists)
  }

  /// A video series as the site writes it for the app: its counts, the playlist and channel it follows, and its guides
  /// as cards, each picture credited; none of it left to the web. A card opens its guide, drawn by the app too.
  func testAVideoSeriesIsDrawnByTheAppAndACardOpensItsGuide() {
    let app = launch()
    openItem(app, "reu hai tu a", "Rêu hại từ A đến Z")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the series isn't drawn by the app")
    XCTAssertTrue(text(app, "1 bài · 29 phút video").exists, "no counts")
    XCTAssertTrue(app.links["ALGAE! Everything you need to know!"].exists, "no playlist")
    XCTAssertTrue(app.links["MJ Aquascaping"].exists, "no channel")
    let guide = card(app, "Cách hạn chế rêu hại")
    reveal(app, guide)
    XCTAssertTrue(app.links["Ảnh: MJ Aquascaping · YouTube"].exists, "a card's picture without its credit")
    XCTAssertFalse(app.buttons["page-web"].exists, "a part left to the web")
    guide.tap()
    XCTAssertTrue(app.navigationBars["Cách hạn chế rêu hại"].waitForExistence(timeout: 5), "the card didn't open its guide")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the guide isn't drawn by the app")
  }

  // MARK: Helpers

  /// A search's row by its name, opened.
  private func openItem(_ app: XCUIApplication, _ query: String, _ name: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no \(name)")
    row.tap()
  }

  private func card(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "card").matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
  }

  private func launch(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook"] + more
    app.launch()
    return app
  }

  private func openRow(_ app: XCUIApplication, _ query: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let row = app.descendants(matching: .any).matching(identifier: "item").firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no guide")
    row.tap()
  }

  private func openGuide() -> XCUIApplication {
    let app = launch()
    openRow(app, "nuoi ca neon")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the guide isn't drawn by the app")
    return app
  }

  private func text(_ app: XCUIApplication, _ s: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).firstMatch
  }

  /// Scrolled into view: the page is longer than the screen.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    // A fish's page opens on its photo and facts: its readers are many screens down.
    for _ in 0..<12 where !(e.exists && e.isHittable) { app.swipeUp() }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
