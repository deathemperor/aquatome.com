import XCTest

/// A tank's fish and plants changed in the app (TankLife.swift): put on a tank from a page of the handbook or from the
/// tank, a fish's number changed, either taken off; kept across launches. The handbook is the fixed one (no network).
final class TankLifeFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testPutsAFishFromItsPageOnATankStartingAtItsSchoolSize() {
    let app = launch("-seed-tanks", "litres") // one tank, "Bể cũ", no fish
    openPage(app, "Cá neon")
    // On the page the app draws, under the fish's name, not in the bar.
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].buttons["put-on-tank"].exists, "not on the page")
    XCTAssertFalse(app.navigationBars.buttons["put-on-tank"].exists, "in the bar as well")
    app.buttons["put-on-tank"].tap()
    let count = app.textFields["put-count"]
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    XCTAssertEqual(count.value as? String, "6", "not the school size, as the site's tool starts it")
    count.clearAndType("12")
    app.buttons["put-save"].tap()
    XCTAssertTrue(app.staticTexts["put-saved"].waitForExistence(timeout: 5), "no word of the save")
    XCTAssertEqual(app.staticTexts["put-saved"].label, "Đã lưu vào “Bể cũ”.")
    app.buttons["put-open"].tap()
    XCTAssertTrue(app.navigationBars["Bể cũ"].waitForExistence(timeout: 5), "the tank didn't open")
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 12"), life(app, "Cá neon").label)
  }

  func testAFishAlreadyOnTheTankGetsTheNewNumber() {
    let app = launch("-seed-tanks", "life") // "Bể cá neon": 12 neons, a fish the handbook lacks, a rotala
    openPage(app, "Cá neon")
    app.buttons["put-on-tank"].tap()
    let count = app.textFields["put-count"]
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    XCTAssertEqual(count.value as? String, "12", "not the number already on the tank")
    count.clearAndType("20")
    app.buttons["put-save"].tap()
    app.buttons["put-open"].tap()
    XCTAssertTrue(app.navigationBars["Bể cá neon"].waitForExistence(timeout: 5))
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 20"), life(app, "Cá neon").label)
    XCTAssertEqual(app.buttons.matching(identifier: "life").matching(NSPredicate(format: "label CONTAINS 'Cá neon'")).count, 1, "listed twice")
  }

  func testPutsAPlantOnANewTank() {
    let app = launch()
    openPage(app, "Rotala đỏ")
    app.buttons["put-on-tank"].tap()
    XCTAssertTrue(app.textFields["put-name"].waitForExistence(timeout: 5), "no new tank offered")
    XCTAssertFalse(app.textFields["put-count"].exists, "a plant isn't counted")
    app.textFields["put-name"].tap()
    app.textFields["put-name"].typeText("Bể cây")
    app.buttons["put-save"].tap()
    XCTAssertTrue(app.buttons["put-open"].waitForExistence(timeout: 5))
    app.buttons["put-open"].tap()
    XCTAssertTrue(app.navigationBars["Bể cây"].waitForExistence(timeout: 5), "the new tank didn't open")
    XCTAssertTrue(life(app, "Rotala đỏ").exists)
  }

  /// The owner's new tank opened blank, only its name showing (7 Nov): from a fish's page with the phone's animations on,
  /// as a reader has them, the sheet closing as the tab changed and the tank was pushed.
  func testAFishPutOnANewTankFromItsPageIsSeenOnTheTankItOpens() {
    let app = launchAnimated()
    openPage(app, "Cá neon")
    app.buttons["put-on-tank"].tap()
    let name = app.textFields["put-name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5), "no new tank offered")
    name.tap()
    name.typeText("Blackwater")
    app.buttons["put-save"].tap()
    XCTAssertTrue(app.buttons["put-open"].waitForExistence(timeout: 5), "no way to the tank")
    app.buttons["put-open"].tap()
    XCTAssertTrue(app.navigationBars["Blackwater"].waitForExistence(timeout: 5), "the tank didn't open")
    let neon = life(app, "Cá neon")
    XCTAssertTrue(neon.waitForExistence(timeout: 5), "the fish isn't on the tank")
    shoot("put-open")
    XCTAssertTrue(neon.isHittable, "the fish is there but not shown")
    XCTAssertTrue(app.buttons["edit"].isHittable, "the tank's Sửa isn't shown")
  }

  /// The same tank, reached as a reader also would: the sheet closed, then the tank from the Bể của tôi tab.
  func testAFishPutOnANewTankFromItsPageIsSeenOnItFromTheTanksTab() {
    let app = launchAnimated()
    openPage(app, "Cá neon")
    app.buttons["put-on-tank"].tap()
    let name = app.textFields["put-name"]
    XCTAssertTrue(name.waitForExistence(timeout: 5), "no new tank offered")
    name.tap()
    name.typeText("Blackwater")
    app.buttons["put-save"].tap()
    XCTAssertTrue(app.buttons["put-open"].waitForExistence(timeout: 5), "not saved")
    app.buttons["Xong"].tap()
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Blackwater"].waitForExistence(timeout: 5), "the tank didn't open")
    let neon = life(app, "Cá neon")
    XCTAssertTrue(neon.waitForExistence(timeout: 5), "the fish isn't on the tank")
    shoot("tanks-tab")
    XCTAssertTrue(neon.isHittable, "the fish is there but not shown")
    XCTAssertTrue(app.buttons["edit"].isHittable, "the tank's Sửa isn't shown")
  }

  /// The owner's phone, as near as a flow gets to it: signed in to the owner's account (a sync follows the put), Tuya
  /// keys and a tank with a plug (the plugs' section on every tank), and the site's whole handbook, not the fixed one.
  func testOnTheOwnersSetupAFishPutOnANewTankFromItsPageIsSeenOnTheTankItOpens() {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fake-accounts", "on",
                           "-reset-fake-server", "-fake-owner", "ui-apple", "-seed-tanks", "plug", "-seed-tuya-keys"]
    app.launch()
    app.openAccount()
    app.signInWithStandInApple()
    app.closeAccount()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 10), "no search field")
    field.tap()
    field.typeText("ca neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 30), "no Cá neon in the site's handbook")
    row.tap()
    let put = app.buttons["put-on-tank"]
    XCTAssertTrue(put.waitForExistence(timeout: 15), "no way to put it on a tank")
    put.tap()
    let name = app.textFields["put-name"]
    if !name.waitForExistence(timeout: 3) {
      app.buttons["put-tank"].tap()
      let new = app.buttons["Bể mới"].firstMatch
      XCTAssertTrue(new.waitForExistence(timeout: 5), "no Bể mới among the tanks")
      new.tap()
    }
    XCTAssertTrue(name.waitForExistence(timeout: 5), "no new tank offered")
    name.tap()
    name.typeText("Blackwater")
    app.buttons["put-save"].tap()
    XCTAssertTrue(app.buttons["put-open"].waitForExistence(timeout: 5), "no way to the tank")
    app.buttons["put-open"].tap()
    XCTAssertTrue(app.navigationBars["Blackwater"].waitForExistence(timeout: 5), "the tank didn't open")
    let neon = life(app, "Cá neon")
    XCTAssertTrue(neon.waitForExistence(timeout: 10), "the fish isn't on the tank")
    shoot("owner")
    XCTAssertTrue(neon.isHittable, "the fish is there but not shown")
    XCTAssertTrue(app.buttons["edit"].isHittable, "the tank's Sửa isn't shown")
    // Below the guides, in a list that builds its rows as they come on screen.
    let plugs = app.descendants(matching: .any)["plugs-header"].firstMatch
    for _ in 0..<6 where !plugs.exists { app.swipeUp() }
    XCTAssertTrue(plugs.waitForExistence(timeout: 5), "no plugs on the tank")
  }

  /// The owner's way to the blank tank (7 Nov): a fish's page opened from a tank on Bể của tôi, a new tank made in the put
  /// sheet (it opens on the tank already there; "Bể mới" picked from its list), then "Xem trong Bể của tôi →", which
  /// replaces the stack the sheet's page is on once the sheet has closed.
  func testANewTankMadeFromAPageOpenedOnATankIsSeenOnTheTankItOpens() {
    let app = launchAnimated("-seed-tanks", "life") // "Bể cá neon": 12 neons
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    let row = life(app, "Cá neon")
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the tank didn't open")
    row.tap()
    putOnANewTank(app, "Blackwater")
    seesTheNeons(app, on: "Blackwater", shot: "from-a-tank")
  }

  /// The same in dark, as the owner's phone was.
  func testANewTankMadeFromAPageInTheDarkIsSeenOnTheTankItOpens() {
    let app = launchAnimated("-seed-tanks", "life", "-dark")
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    let row = life(app, "Cá neon")
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the tank didn't open")
    row.tap()
    putOnANewTank(app, "Blackwater")
    seesTheNeons(app, on: "Blackwater", shot: "from-a-tank-dark")
  }

  /// The same new tank, the fish's page from Tìm while Bể của tôi has a tank open: that stack replaced while it isn't shown.
  func testANewTankMadeFromAPageWhileAnotherTankIsOpenIsSeenOnTheTankItOpens() {
    let app = launchAnimated("-seed-tanks", "life")
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(app.navigationBars["Bể cá neon"].waitForExistence(timeout: 5), "the tank didn't open")
    app.openTab("Tìm")
    openPage(app, "Cá neon")
    putOnANewTank(app, "Blackwater")
    seesTheNeons(app, on: "Blackwater", shot: "another-tank-open")
  }

  /// A link to a tank opened while on the Tìm tab, its tanks tab never opened: the tab changes and the tank is pushed
  /// at once, with no sheet closing.
  func testALinkToATankOpensItShownFromAnotherTab() {
    let app = launchAnimated("-seed-tanks", "litres") // one tank, "Bể cũ"
    XCTAssertTrue(app.searchFields.firstMatch.waitForExistence(timeout: 5), "not on the Tìm tab")
    let page = "https://aquatome.com/vi/cong-cu/be-cua-toi/#be-00000000-0000-4000-8000-000000000001"
    app.open(URL(string: "aquatome://open?url=" + page.addingPercentEncoding(withAllowedCharacters: .alphanumerics)!)!)
    XCTAssertTrue(app.navigationBars["Bể cũ"].waitForExistence(timeout: 5), "the tank didn't open")
    let add = app.buttons["add-life"]
    XCTAssertTrue(add.waitForExistence(timeout: 5), "the tank's list isn't there")
    shoot("link")
    XCTAssertTrue(add.isHittable, "the tank's list is there but not shown")
    XCTAssertTrue(app.buttons["edit"].isHittable, "the tank's Sửa isn't shown")
  }

  func testAddsAFishFromTheTankChangesItsNumberAndTakesItOffKeptAfterARelaunch() {
    var app = launch("-seed-tanks", "life")
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    app.buttons["add-life"].tap()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText("ngua van")
    let row = app.buttons.matching(identifier: "life-item").matching(NSPredicate(format: "label BEGINSWITH 'Cá ngựa vằn'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "not found in the handbook")
    XCTAssertEqual(app.buttons.matching(identifier: "life-item").count, 1, "more than the fish typed")
    row.tap()
    let count = app.textFields["put-count"]
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    XCTAssertFalse(app.buttons["put-tank"].exists, "the tank is already chosen")
    count.clearAndType("8")
    app.buttons["put-save"].tap()
    let danio = life(app, "Cá ngựa vằn")
    XCTAssertTrue(danio.waitForExistence(timeout: 5), "not on the tank")
    XCTAssertTrue(danio.label.contains("× 8"), danio.label)

    danio.swipeLeft()
    app.buttons["Số con"].tap()
    XCTAssertTrue(app.textFields["put-count"].waitForExistence(timeout: 5))
    XCTAssertEqual(app.textFields["put-count"].value as? String, "8")
    app.textFields["put-count"].clearAndType("10")
    app.buttons["put-save"].tap()
    XCTAssertTrue(life(app, "Cá ngựa vằn").label.contains("× 10"), life(app, "Cá ngựa vằn").label)

    // The tank's screen has grown (the check above, the guides below): the plant may be under the tab bar.
    let rotala = life(app, "Rotala đỏ")
    repeatUntil(rotala.exists && rotala.isHittable, times: 4) { app.swipeUp() }
    rotala.swipeLeft()
    app.buttons["Xóa"].tap()
    XCTAssertTrue(life(app, "Rotala đỏ").waitForNonExistence(timeout: 5), "the plant is still on the tank")

    app.terminate()
    app = launch(reset: false)
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(life(app, "Cá ngựa vằn").waitForExistence(timeout: 5), "the fish wasn't kept")
    XCTAssertTrue(life(app, "Cá ngựa vằn").label.contains("× 10"))
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 12"), "another fish changed")
    XCTAssertFalse(life(app, "Rotala đỏ").exists, "the plant came back")
  }

  func testChangesTheNumberOfTheFirstFishOnATankLongerThanTheScreen() {
    let app = launch("-seed-tanks", "many") // 20 kinds: the add row is far below
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    let neon = life(app, "Cá neon")
    XCTAssertTrue(neon.waitForExistence(timeout: 5))
    let add = app.buttons["add-life"]
    XCTAssertFalse(add.exists && add.isHittable, "the add row is on screen: the tank isn't long enough to test this")
    neon.swipeLeft()
    app.buttons["Số con"].tap()
    XCTAssertTrue(app.textFields["put-count"].waitForExistence(timeout: 5), "no sheet for a fish far above the add row")
    app.textFields["put-count"].clearAndType("9")
    app.buttons["put-save"].tap()
    XCTAssertTrue(life(app, "Cá neon").label.contains("× 9"), life(app, "Cá neon").label)
  }

  func testListsTheGuidesThatNameTheTanksFishAndOpensThem() {
    let app = launch("-seed-tanks", "life") // neons: one guide names them, and one video guide
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(life(app, "Cá neon").waitForExistence(timeout: 5))
    // Under the fish, the plants and the tank-mates check: it may start under the tab bar.
    let guide = app.buttons.matching(identifier: "tank-guide").firstMatch
    repeatUntil(guide.exists && guide.isHittable, times: 4) { app.swipeUp() }
    XCTAssertTrue(guide.waitForExistence(timeout: 5), "no related guide")
    XCTAssertEqual(app.buttons.matching(identifier: "tank-guide").count, 1)
    XCTAssertTrue(guide.label.contains("Nuôi cá neon trong bể nhỏ"), guide.label)
    // The video guide apart, as a species page on the site lists them.
    let video = app.buttons.matching(identifier: "tank-video").firstMatch
    repeatUntil(video.exists && video.isHittable, times: 2) { app.swipeUp() }
    XCTAssertTrue(video.exists && video.label.contains("Cách hạn chế rêu hại"), "no video guide apart")
    XCTAssertTrue(app.staticTexts["Có trong video hướng dẫn"].exists)
    guide.tap()
    XCTAssertTrue(app.navigationBars["Nuôi cá neon trong bể nhỏ"].waitForExistence(timeout: 5), "its page didn't open")
  }

  // MARK: What the handbook has no page for (docs/my-tanks-sync.md, "Entries without a page")

  func testAddsAFishWithoutAPageByNameSendsItOnceAndKeepsItAfterARelaunch() {
    var app = launch("-seed-tanks", "life")
    openTank(app)
    // Typed as a scientific name: nothing in the handbook has it, and the field to add it takes it as one too.
    let new = searchLife(app, "Rhinogobius duospilus")
    XCTAssertEqual(new.label, "Thêm “Rhinogobius duospilus” (chưa có trong cẩm nang)")
    XCTAssertEqual(app.buttons.matching(identifier: "life-item").count, 0, "a page offered for a name the handbook lacks")
    new.tap()
    let name = app.textFields["new-name"], sci = app.textFields["new-sci"]
    XCTAssertTrue(name.waitForExistence(timeout: 5), "no form to add it")
    XCTAssertEqual(name.value as? String, "Rhinogobius duospilus")
    XCTAssertEqual(sci.value as? String, "Rhinogobius duospilus", "the scientific name typed isn't taken as one")
    XCTAssertTrue(app.segmentedControls["new-kind"].buttons["Cá, tép hoặc ốc"].isSelected, "not a fish to begin with")
    // A segmented picker doesn't show its own label, so VoiceOver read the two choices without saying what they choose.
    XCTAssertTrue(app.staticTexts["Đây là"].exists, "nothing says what the fish-or-plant choice is")
    name.clearAndType("Ca bong mat tre")
    app.textFields["new-count"].tap()
    app.textFields["new-count"].typeText("3")
    app.buttons["new-save"].tap()

    let fish = life(app, "Ca bong mat tre")
    XCTAssertTrue(fish.waitForExistence(timeout: 5), "not on the tank")
    // What VoiceOver reads: its name, its scientific name, how many, and that it has no page.
    XCTAssertTrue(fish.label.contains("Rhinogobius duospilus") && fish.label.contains("× 3") && fish.label.contains("chưa có trang"), fish.label)
    let sent = #"{"kind":"fish","name":"Ca bong mat tre","sci":"Rhinogobius duospilus"}"#
    XCTAssertTrue(waitForWanted(app, sent), "not sent as wanted, or not as the server takes it: \(wanted(app))")
    // Not checked with the fish the handbook has figures for: said so.
    let unchecked = app.staticTexts["unchecked"]
    repeatUntil(unchecked.exists && unchecked.isHittable, times: 4) { app.swipeUp() }
    let line = "Chưa kiểm tra Ca bong mat tre: cẩm nang chưa có trang nên chưa có số liệu để so."
    let said = expectation(for: NSPredicate(format: "label == %@", line), evaluatedWith: unchecked)
    XCTAssertEqual(XCTWaiter.wait(for: [said], timeout: 5), .completed, "said instead: \(unchecked.label)")

    // Its number changed: not sent again.
    repeatUntil(fish.exists && fish.isHittable, times: 4) { app.swipeDown() }
    swipeOpen(app, fish, "Số con")
    app.buttons["Số con"].tap()
    let count = app.textFields["put-count"]
    XCTAssertTrue(count.waitForExistence(timeout: 5))
    XCTAssertEqual(count.value as? String, "3")
    count.clearAndType("5")
    app.buttons["put-save"].tap()
    XCTAssertTrue(life(app, "Ca bong mat tre").label.contains("× 5"), life(app, "Ca bong mat tre").label)
    XCTAssertFalse(waitForWanted(app, sent + "\n" + sent, timeout: 2), "sent again for a number changed")
    XCTAssertEqual(wanted(app), sent)

    app.terminate()
    app = launch(reset: false)
    openTank(app)
    XCTAssertTrue(life(app, "Ca bong mat tre").waitForExistence(timeout: 5), "not kept")
    XCTAssertTrue(life(app, "Ca bong mat tre").label.contains("× 5"))
    XCTAssertEqual(wanted(app), "", "sent again after a relaunch")
  }

  func testAPlantWithoutAPageGoesWithThePlantsUncountedAndComesOff() {
    let app = launch("-seed-tanks", "life")
    openTank(app)
    searchLife(app, "reu suoi").tap() // not read as a scientific name: no capital
    XCTAssertTrue(app.textFields["new-name"].waitForExistence(timeout: 5))
    let sci = app.textFields["new-sci"]
    XCTAssertEqual(sci.value as? String, sci.placeholderValue, "a common name taken as a scientific one") // empty: its prompt
    app.segmentedControls["new-kind"].buttons["Cây"].tap()
    XCTAssertFalse(app.textFields["new-count"].exists, "a plant isn't counted")
    app.buttons["new-save"].tap()

    let plant = life(app, "reu suoi")
    XCTAssertTrue(plant.waitForExistence(timeout: 5), "not on the tank")
    repeatUntil(plant.exists && plant.isHittable, times: 4) { app.swipeUp() }
    XCTAssertTrue(plant.exists && plant.label.contains("chưa có trang"), "not with the tank's plants: \(plant.label)")
    // Among the plants: after the tank's rotala, in the same section.
    XCTAssertGreaterThan(plant.frame.minY, life(app, "Rotala đỏ").frame.minY)
    XCTAssertTrue(waitForWanted(app, #"{"kind":"plant","name":"reu suoi"}"#), "not sent as wanted: \(wanted(app))")
    swipeOpen(app, plant, "Xóa")
    XCTAssertFalse(app.buttons["Số con"].exists, "a plant isn't counted")
    app.buttons["Xóa"].tap()
    XCTAssertTrue(life(app, "reu suoi").waitForNonExistence(timeout: 5), "still on the tank")
  }

  func testAnEntryWithAPagesScientificNameShowsAsThatPageAndIsntWanted() {
    let app = launch("-seed-tanks", "life")
    openTank(app)
    searchLife(app, "ca soc").tap()
    let sci = app.textFields["new-sci"]
    XCTAssertTrue(sci.waitForExistence(timeout: 5))
    sci.tap()
    sci.typeText("danio  Rerio")
    app.textFields["new-count"].tap()
    app.textFields["new-count"].typeText("4")
    app.buttons["new-save"].tap()

    // Shown as the handbook's page with that name (Danio rerio), with the entry's number, opening the page.
    let danio = life(app, "Cá ngựa vằn")
    XCTAssertTrue(danio.waitForExistence(timeout: 5), "not shown as its page")
    XCTAssertTrue(danio.label.contains("× 4") && !danio.label.contains("chưa có trang"), danio.label)
    XCTAssertFalse(life(app, "ca soc").exists, "shown by the name typed")
    XCTAssertFalse(waitForWanted(app, "{", timeout: 2), "the handbook has its page, yet it was sent: \(wanted(app))")
    danio.tap()
    XCTAssertTrue(app.navigationBars["Cá ngựa vằn"].waitForExistence(timeout: 5), "its page didn't open")
    // One the handbook hasn't, put on after: it alone is sent (sent in order, the first would be there by now).
    app.navigationBars.buttons.firstMatch.tap()
    searchLife(app, "ca la").tap()
    XCTAssertTrue(app.buttons["new-save"].waitForExistence(timeout: 5))
    app.buttons["new-save"].tap()
    let only = #"{"kind":"fish","name":"ca la"}"#
    XCTAssertTrue(waitForWanted(app, only), "the one with no page wasn't sent: \(wanted(app))")
    XCTAssertEqual(wanted(app), only, "the one with a page was sent too")
  }

  func testNothingIsPutIntoAStoreTheAppMustLeaveAlone() {
    let app = launch("-seed-tanks", "newer")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5))
    row.tap()
    let put = app.buttons["put-on-tank"]
    XCTAssertTrue(put.waitForExistence(timeout: 5))
    XCTAssertFalse(put.isEnabled, "it could be written over")
  }

  // MARK: Helpers

  /// With UIKit's animations on, as on a reader's phone: every other flow turns them off (launchForFlow).
  private func launchAnimated(_ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults"] + args
    app.launch()
    return app
  }

  /// The screen as it is, kept with the run's results.
  private func shoot(_ name: String) {
    let shot = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
    shot.name = name
    shot.lifetime = .keepAlways
    add(shot)
  }

  private func launch(reset: Bool = true, _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook"] + (reset ? ["-reset-defaults"] : []) + args
    app.launchForFlow()
    return app
  }

  /// From a fish's page: "Bể mới" picked in the put sheet (it opens on the first tank), named, saved, then the tank opened.
  private func putOnANewTank(_ app: XCUIApplication, _ name: String) {
    let put = app.buttons["put-on-tank"]
    XCTAssertTrue(put.waitForExistence(timeout: 10), "no way to put it on a tank")
    put.tap()
    let picker = app.buttons["put-tank"]
    XCTAssertTrue(picker.waitForExistence(timeout: 5), "no tanks to pick from")
    picker.tap()
    let new = app.buttons["Bể mới"].firstMatch
    XCTAssertTrue(new.waitForExistence(timeout: 5), "no Bể mới among the tanks")
    new.tap()
    let field = app.textFields["put-name"]
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no new tank offered")
    field.tap()
    field.typeText(name)
    app.buttons["put-save"].tap()
    XCTAssertTrue(app.buttons["put-open"].waitForExistence(timeout: 5), "no way to the tank")
    app.buttons["put-open"].tap()
  }

  /// The tank open, its neons and its Sửa on screen, not only there for VoiceOver.
  private func seesTheNeons(_ app: XCUIApplication, on tank: String, shot: String) {
    XCTAssertTrue(app.navigationBars[tank].waitForExistence(timeout: 5), "the tank didn't open")
    let neon = life(app, "Cá neon")
    XCTAssertTrue(neon.waitForExistence(timeout: 5), "the fish isn't on the tank")
    shoot(shot)
    XCTAssertTrue(neon.isHittable, "the fish is there but not shown")
    XCTAssertTrue(app.buttons["edit"].isHittable, "the tank's Sửa isn't shown")
  }

  /// A page from the Tìm tab, searched by its name (a row below the fold isn't there to find), typed without accents: the
  /// simulator's keyboard sometimes drops them, and the search folds them anyway.
  private func openPage(_ app: XCUIApplication, _ name: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(name.replacingOccurrences(of: "đ", with: "d").folding(options: .diacriticInsensitive, locale: nil))
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH %@", name)).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no \(name) in the handbook")
    row.tap()
    XCTAssertTrue(app.buttons["put-on-tank"].waitForExistence(timeout: 5), "no way to put \(name) on a tank")
  }

  /// A fish or plant row on the tank, by its name.
  private func life(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "life").matching(NSPredicate(format: "label CONTAINS %@", name)).firstMatch
  }

  private func openTank(_ app: XCUIApplication) {
    app.openTab("Bể của tôi")
    app.buttons["tank"].firstMatch.tap()
    XCTAssertTrue(app.buttons["add-life"].waitForExistence(timeout: 5), "the tank didn't open")
  }

  /// The tank's "Thêm cá hoặc cây", searched for `text`: its last row, which adds what was typed without a page.
  @discardableResult
  private func searchLife(_ app: XCUIApplication, _ text: String) -> XCUIElement {
    app.buttons["add-life"].tap()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5))
    field.tap()
    field.typeText(text)
    let new = app.buttons["life-new"]
    XCTAssertTrue(new.waitForExistence(timeout: 5), "no row to add “\(text)” without a page")
    return new
  }

  /// What the stand-in server took as wanted (POST /api/v1/wanted) since launch, a body a line: a debug build's value
  /// on the tank's "Thêm cá hoặc cây".
  private func wanted(_ app: XCUIApplication) -> String { app.buttons["add-life"].value as? String ?? "" }

  private func waitForWanted(_ app: XCUIApplication, _ text: String, timeout: TimeInterval = 5) -> Bool {
    let has = NSPredicate(format: "value CONTAINS %@", text)
    return XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: has, object: app.buttons["add-life"])], timeout: timeout) == .completed
  }

  /// Swipes a row open until `action` shows. A swipe that lands while the list is still moving only stops it: swiped
  /// once more.
  private func swipeOpen(_ app: XCUIApplication, _ row: XCUIElement, _ action: String, file: StaticString = #filePath, line: UInt = #line) {
    row.swipeLeft()
    if !app.buttons[action].waitForExistence(timeout: 3) { row.swipeLeft() }
    XCTAssertTrue(app.buttons[action].waitForExistence(timeout: 3), "no \(action) on the row", file: file, line: line)
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
