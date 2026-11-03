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
    // A list numbered, the answers under their questions, the sources.
    XCTAssertTrue(text(app, "2. Cây thủy sinh và lũa.").exists, "no numbered list")
    XCTAssertTrue(text(app, "Nuôi mấy con?\nTừ 6 con trở lên.").exists, "no answer under its question")
    XCTAssertTrue(app.links["Neon tetra care"].exists, "no sources")
    XCTAssertFalse(app.descendants(matching: .any)["page"].exists, "the web page")
  }

  /// A table as the site's: a short one as a grid, its columns side by side under their names; one whose columns don't
  /// fit side by side, each cell under its column's name. No column's name left out, the first one's too.
  func testATableKeepsEachCellUnderItsColumnsName() {
    let app = openGuide()
    let tables = app.descendants(matching: .any).matching(identifier: "page-table")
    XCTAssertEqual(tables.count, 2, "not drawn as tables")
    let short = tables.element(boundBy: 0), long = tables.element(boundBy: 1)
    // The parameters: a grid, "Nhiệt độ" beside its "20–26°C", under "Thông số" and "Mức".
    for name in ["Thông số", "Mức", "Nhiệt độ", "20–26°C"] { XCTAssertTrue(short.staticTexts[name].exists, "no \(name)") }
    let label = short.staticTexts["Nhiệt độ"].frame, value = short.staticTexts["20–26°C"].frame
    XCTAssertEqual(label.midY, value.midY, accuracy: 2, "the row's cells not side by side")
    XCTAssertEqual(short.staticTexts["Thông số"].frame.minX, label.minX, accuracy: 2, "a cell not under its column's name")
    // Pros and cons, too long side by side: each under its name, the first column's ("Ưu điểm") too.
    let pros = long.staticTexts["Ưu điểm"], cons = long.staticTexts["Nhược điểm"]
    XCTAssertTrue(pros.exists && cons.exists, "a column without its name")
    XCTAssertLessThan(pros.frame.maxY, cons.frame.minY, "the long table drawn as a grid, its columns off the screen")
    let consText = long.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "• Nước nóng lên")).firstMatch
    XCTAssertTrue(consText.exists, "no cons")
    XCTAssertLessThanOrEqual(cons.frame.maxY, consText.frame.minY + 1, "the cons not under their name")
    XCTAssertEqual(cons.frame.minX, consText.frame.minX, accuracy: 2, "the cons not under their name")
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
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    let guide = app.buttons.matching(identifier: "tank-guide").firstMatch
    for _ in 0..<6 where !(guide.exists && guide.isHittable) { app.swipeUp() }
    guide.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the guide isn't drawn by the app")
    let neon = app.links["neon"].firstMatch
    reveal(app, neon)
    neon.tap()
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
    app.openTab("Tìm")
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
    // Below the guide's photo and name.
    let neon = app.links["neon"].firstMatch
    reveal(app, neon)
    neon.tap()
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "the link didn't open the fish")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Nuôi cá neon trong bể nhỏ"].waitForExistence(timeout: 5), "not back on the guide")
  }

  func testAWordsTipShowsWhatItMeans() {
    let app = openGuide()
    let word = app.links["pH"].firstMatch
    reveal(app, word)
    word.tap()
    let alert = app.alerts["Đệm pH"]
    XCTAssertTrue(alert.waitForExistence(timeout: 5), "no tip")
    XCTAssertTrue(alert.staticTexts["Khả năng giữ pH của nước khi có thêm axit."].exists)
    alert.buttons["Xem thêm"].tap()
    XCTAssertTrue(app.navigationBars["Đệm pH"].waitForExistence(timeout: 5), "the word's page didn't open")
  }

  /// A source's mark as the site's: small and raised after the words it backs ("hơi chua.¹"), not a number as large as
  /// the text and on its line ("chua.1"); tapped, it still names its source.
  func testASourcesMarkSitsSmallAfterTheWordsItBacks() {
    let app = launch()
    openRow(app, "ca neon")
    XCTAssertTrue(app.navigationBars["Cá neon"].waitForExistence(timeout: 5), "not the fish")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the fish isn't drawn by the app")
    // Its paragraph, one line: "Nước mềm, hơi chua." and the mark. Seen as drawn, in its pixels: a link's frame may be
    // its line's, whatever its size.
    let line = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH %@", "Nước mềm, hơi chua")).firstMatch
    reveal(app, line)
    let (raised, height) = lastMark(line)
    XCTAssertGreaterThan(raised, 3, "the mark sits on the line, run into the full stop")
    XCTAssertLessThan(height, 0.7, "the mark as tall as the text's letters")
    let mark = app.links["1"].firstMatch
    reveal(app, mark)
    mark.tap()
    XCTAssertTrue(app.alerts["Seriously Fish"].waitForExistence(timeout: 5), "the mark doesn't name its source")
  }

  /// The page's name under its photo, so not in the bar as well: the bar names the page once that has scrolled away. Seen
  /// in the bar's pixels: the bar keeps its title for VoiceOver's lookups even while it shows none.
  func testTheBarNamesThePageOnceItsNameScrollsAway() {
    let app = launch()
    openRow(app, "ca neon")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the fish isn't drawn by the app")
    let bar = app.navigationBars["Cá neon"]
    XCTAssertTrue(bar.waitForExistence(timeout: 5), "not the fish")
    RunLoop.current.run(until: Date().addingTimeInterval(1))
    XCTAssertLessThan(titleInk(bar), 0.002, "named twice: in the bar and under the photo")
    app.swipeUp()
    app.swipeUp()
    RunLoop.current.run(until: Date().addingTimeInterval(1))
    XCTAssertGreaterThan(titleInk(bar), 0.01, "the bar doesn't name the page once its name has scrolled away")
  }

  /// How much of the bar's middle third (clear of the back button and the buttons on its right) is drawn dark, as a
  /// title's letters are on a light bar; the page blurred under the glass stays light grey.
  private func titleInk(_ bar: XCUIElement) -> CGFloat {
    let shot = bar.screenshot().image
    guard let cg = shot.cgImage else { return -1 }
    let w = cg.width, h = cg.height
    var px = [UInt8](repeating: 0, count: w * h * 4)
    let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    ctx?.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    var dark = 0, all = 0
    for y in 0..<h {
      for x in (w / 3)..<(w * 2 / 3) {
        let i = (y * w + x) * 4
        all += 1
        if Int(px[i]) + Int(px[i + 1]) + Int(px[i + 2]) < 240 { dark += 1 }
      }
    }
    return CGFloat(dark) / CGFloat(max(all, 1))
  }

  /// Sharing and the browser, used less than the page's own buttons, in one menu in the bar.
  func testSharingAndTheBrowserAreInOneMenu() {
    let app = launch()
    openRow(app, "ca neon")
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 5), "the fish isn't drawn by the app")
    XCTAssertFalse(app.navigationBars.descendants(matching: .any)["Mở trong trình duyệt"].exists, "the browser still in the bar on its own")
    app.buttons["page-actions"].tap()
    XCTAssertTrue(app.buttons["Mở trong trình duyệt"].waitForExistence(timeout: 5), "no browser in the menu")
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
    app.openTab("Bể của tôi")
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

  /// Readers' photos and comments on a fish's page, after its videos, as the site has them: each photo with its reader's name,
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
    // One line, as the site's page and doc write it: the counts, then what it follows.
    XCTAssertTrue(text(app, "1 bài · 29 phút video · theo playlist").exists, "no counts, or not on the playlist's line")
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

  /// Under a series' cards, their pictures' credits as the site's credits list has them, one row per author and licence:
  /// three videos' pictures by one author (each with its own page) on one line saying how many, then a number for each
  /// linking its page, read as whose picture it is; the other author's picture, among them, on a line of its own linking
  /// its page.
  func testCardsPicturesByOneAuthorAreCreditedOnceWithALinkForEach() {
    let app = launch()
    openItem(app, "reu hai tu a", "Rêu hại từ A đến Z")
    // How many times the credits' words say `s`, in one text or in several.
    func times(_ s: String) -> Int {
      app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", s)).allElementsBoundByIndex.reduce(0) { $0 + $1.label.components(separatedBy: s).count - 1 }
    }
    reveal(app, text(app, "Ảnh: MJ Aquascaping"))
    XCTAssertEqual(times("Ảnh: Tác giả 8 · YouTube"), 1, "one author's pictures credited more than once")
    XCTAssertTrue(app.staticTexts["Ảnh: Tác giả 8 · YouTube · 3 ảnh"].exists, "not saying how many pictures")
    XCTAssertEqual(times("Ảnh: MJ Aquascaping · YouTube"), 1, "the other author's picture not credited once")
    XCTAssertTrue(app.links["Ảnh: MJ Aquascaping · YouTube"].exists, "a picture alone on its line not linking its page")
    for n in 1...3 {
      XCTAssertTrue(app.links["Ảnh: Tác giả 8, ảnh \(n)"].exists, "no link to picture \(n)'s page")
    }
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

  /// The last thing drawn on a line of text (a mark): how far the bottom of its ink sits above that of the ink before it
  /// (a full stop, on the line), in points, and its ink's height as a share of the tallest letter's.
  private func lastMark(_ e: XCUIElement) -> (raised: CGFloat, height: CGFloat) {
    let shot = e.screenshot().image
    guard let cg = shot.cgImage else { return (0, 1) }
    let w = cg.width, h = cg.height
    var px = [UInt8](repeating: 0, count: w * h * 4)
    let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    ctx?.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    func lum(_ x: Int, _ y: Int) -> Int { let i = (y * w + x) * 4; return Int(px[i]) + Int(px[i + 1]) + Int(px[i + 2]) }
    let paper = lum(0, 0)
    // Each column's inked rows, top to bottom (rows count down the image), grouped into runs of inked columns.
    var groups: [(top: Int, bottom: Int)] = []
    var open = false
    for x in 0..<w {
      var top = -1, bottom = -1
      for y in 0..<h where abs(lum(x, y) - paper) > 150 {
        if top < 0 { top = y }
        bottom = y
      }
      if top < 0 { open = false; continue }
      if open, let g = groups.last { groups[groups.count - 1] = (min(g.top, top), max(g.bottom, bottom)) } else { groups.append((top, bottom)) }
      open = true
    }
    guard groups.count >= 2, let mark = groups.last else { return (0, 1) }
    let stop = groups[groups.count - 2]
    let tallest = groups.dropLast().map { $0.bottom - $0.top }.max() ?? 1
    return (CGFloat(stop.bottom - mark.bottom) / shot.scale, CGFloat(mark.bottom - mark.top) / CGFloat(max(tallest, 1)))
  }

  /// Scrolled into view half a screen at a time, without a fling, so no part is scrolled past; only down, so parts found
  /// one after another are in that order on the page.
  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    for _ in 0..<24 where !(e.exists && e.isHittable) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3)), withVelocity: .fast,
               thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
