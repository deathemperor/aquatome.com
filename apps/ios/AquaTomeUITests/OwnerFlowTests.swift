import XCTest

/// The owner's dashboard, against the stand-in server serving protocols/owner-dashboard-vectors.json
/// (`-fake-owner <account>`): the row only for the owner's account; the overview's parts, its tiles scrolling to them and
/// its charts read by touch; sections drawn by the app, with their period menu, folded tables and long ones read 50 rows
/// at a time; Comments shown, hidden and shown again; the buttons' requests and the section read again after each; the
/// daily report's delivery from the bell; the server's own message for a refusal, a session that ends while the
/// dashboard is open, and the server's storage down for a moment.
final class OwnerFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  func testTheOverviewShowsItsPartsAndATileGoesToItsPart() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    XCTAssertTrue(app.navigationBars["Dashboard"].waitForExistence(timeout: 10), "not the dashboard")
    for key in ["needs", "answers", "shipped", "cost"] { XCTAssertTrue(app.buttons["owner-tile-" + key].exists, "no \(key) tile") }
    XCTAssertTrue(app.buttons["owner-tile-needs"].label.hasPrefix("Needs you, 10"), app.buttons["owner-tile-needs"].label)
    XCTAssertTrue(app.staticTexts["Wednesday 4 Nov · figures as of 16:00"].exists, "when the figures were read")
    XCTAssertEqual(app.buttons.matching(identifier: "owner-need").count, 5, "a line each of what needs the owner")
    // Each line its title and the line under it, as the site draws them; the count is the tile's, not the heading's.
    let key = app.buttons.matching(identifier: "owner-need").firstMatch
    XCTAssertTrue(key.label.hasPrefix("Fish ID and chat are down, Every key resting, the first until Wed 4 Nov, 16:30."), key.label)
    XCTAssertFalse(app.staticTexts["Needs you · 5"].exists, "a count beside the heading")

    // The cost tile scrolls to the costs, far down; the keys' line opens their section at its heading.
    app.buttons["owner-tile-cost"].tap()
    let keys = app.buttons["owner-keys"]
    XCTAssertTrue(becomesHittable(keys), "the cost tile didn't go to the costs")
    XCTAssertTrue(keys.label.hasPrefix("Anthropic keys, 2 of 2 resting"), keys.label)
    keys.tap()
    let heading = app.staticTexts["Anthropic keys"]
    XCTAssertTrue(heading.waitForExistence(timeout: 10), "the section didn't open")
    XCTAssertTrue(becomesHittable(heading), "not at its heading")
    back(app)

    // Every page, grouped, each with its figure.
    let comments = page(app, "Comments")
    XCTAssertTrue(comments.label.hasPrefix("Comments, 5 held, waiting for you"), comments.label)
    XCTAssertEqual(app.buttons.matching(identifier: "owner-page").count, 15, "every page")
  }

  /// v2, the app's look (the owner, 8 Nov): the dashboard opens from its profile button, as from v1's.
  func testTheDashboardOpensInV2() {
    let app = launch("-v2", "YES")
    signIn(app)
    open(app, "owner-dashboard")
    XCTAssertTrue(app.navigationBars["Dashboard"].waitForExistence(timeout: 10), "not the dashboard")
    for key in ["needs", "answers", "shipped", "cost"] { XCTAssertTrue(app.buttons["owner-tile-" + key].exists, "no \(key) tile") }
    app.buttons["owner-tile-cost"].tap()
    XCTAssertTrue(becomesHittable(app.buttons["owner-keys"]), "the cost tile didn't go to the costs")
  }

  /// The report button floats over every screen of the owner's: the overview's last row ends above it.
  func testTheOverviewsLastRowEndsAboveTheReportButton() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    XCTAssertTrue(app.buttons["owner-tile-needs"].waitForExistence(timeout: 10), "the overview didn't load")
    let button = app.buttons["owner-report"]
    XCTAssertTrue(button.waitForExistence(timeout: 10), "no report button")
    for _ in 0..<12 { app.swipeUp() }
    let last = app.buttons.matching(identifier: "owner-page").allElementsBoundByIndex.last
    XCTAssertNotNil(last, "no pages")
    XCTAssertLessThanOrEqual(last!.frame.maxY, button.frame.minY, "the last row ends under the report button")
  }

  func testNothingNeedingTheOwnerSaysSoInOneLine() {
    let app = launch("-owner-overview", "dashboard: nothing needs you")
    signIn(app)
    open(app, "owner-dashboard")
    XCTAssertTrue(app.buttons["owner-tile-needs"].waitForExistence(timeout: 10), "the overview didn't load")
    XCTAssertTrue(app.buttons["owner-tile-needs"].label.hasPrefix("Needs you, All clear"), app.buttons["owner-tile-needs"].label)
    XCTAssertTrue(app.descendants(matching: .any)["owner-needs-empty"].exists, "not said in one line")
    XCTAssertFalse(app.buttons["owner-need"].exists)
    // Under it, the owner's last action, which opens the section it was in.
    let last = app.buttons["owner-last-action"]
    XCTAssertTrue(last.exists, "no last action")
    XCTAssertEqual(last.label, "You hid a comment on Ikan neon (Indonesian), Wed 4 Nov, 8:00")
    last.tap()
    XCTAssertTrue(app.segmentedControls["owner-comment-filter"].waitForExistence(timeout: 10), "its section didn't open")
  }

  /// The owner asked for a bar's own figures on a phone: a tap on a column, or a finger dragged across, reads that day,
  /// in a label over it.
  func testTappingOrDraggingAcrossAChartReadsThatDay() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Calls and keys")
    let chart = app.descendants(matching: .any).matching(identifier: "owner-chart")
      .containing(NSPredicate(format: "label == 'Calls by day'")).firstMatch
    let columns = chart.descendants(matching: .any)["owner-chart-columns"], day = chart.descendants(matching: .any)["owner-chart-day"]
    XCTAssertTrue(columns.waitForExistence(timeout: 10), "no chart")
    // All of it on screen, not just its top: a finger at its middle must be on the screen.
    let screen = app.windows.firstMatch.frame
    let shown = { columns.isHittable && columns.frame.maxY < screen.maxY - 60 }
    repeatUntil(shown(), times: 6) { app.swipeUp(velocity: .slow) }
    XCTAssertTrue(shown(), "the chart isn't on screen")
    // A finger that starts on the chart and goes up scrolls the page, as anywhere else.
    let top = columns.frame.minY
    columns.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.6)).press(forDuration: 0.05, thenDragTo: columns.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: -1.2)))
    XCTAssertLessThan(columns.frame.minY, top - 100, "the page didn't scroll from the chart")
    // Back where it was, by as much as it went, with a finger below the chart held at the end so the page doesn't coast:
    // a chart scrolled up but still "on screen" can have its columns under the navigation bar, where a tap misses them.
    let below = app.windows.firstMatch.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.45))
    below.press(forDuration: 0.05, thenDragTo: below.withOffset(CGVector(dx: 0, dy: top - columns.frame.minY)), withVelocity: .slow, thenHoldForDuration: 0.3)
    XCTAssertTrue(shown() && abs(columns.frame.minY - top) < 40, "the chart isn't back where it was: \(columns.frame.minY) for \(top)")
    // Untouched: today, the third of its week's seven, not over yet.
    XCTAssertTrue(reads(day, "17 named", "Wed 4 Nov, so far"), day.label)
    let at = { (i: Double) in columns.coordinate(withNormalizedOffset: CGVector(dx: (i + 0.5) / 7, dy: 0.8)) }
    // A tap on the first column: its day and figures.
    at(0).tap()
    XCTAssertTrue(reads(day, "24 named", "Mon 2 Nov"), day.label)
    // A finger pressed there and dragged to the second: the column under it.
    at(0).press(forDuration: 0.1, thenDragTo: at(1))
    XCTAssertTrue(reads(day, "16 named", "Tue 3 Nov"), day.label)
  }

  /// The overview's chart and its tile's small columns: a tap reads that day, and a tap on the tile's columns neither
  /// scrolls to its part nor opens anything.
  func testTheOverviewsChartAndATilesColumnsReadTheirDay() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    let bars = app.descendants(matching: .any)["owner-bars"].firstMatch
    XCTAssertTrue(bars.waitForExistence(timeout: 10), "no columns on the found-an-answer tile")
    XCTAssertFalse(app.staticTexts["owner-bars-day"].exists, "a day read before any tap")
    bars.coordinate(withNormalizedOffset: CGVector(dx: 1.5 / 7, dy: 0.7)).tap()
    let read = app.staticTexts["owner-bars-day"]
    XCTAssertTrue(read.waitForExistence(timeout: 5), "the tap read nothing")
    XCTAssertEqual(read.label, "4 found an answer · Tue 3 Nov · 8 readers · 1 shop click")
    XCTAssertTrue(app.buttons["owner-tile-needs"].isHittable, "the tap scrolled away")

    let columns = app.descendants(matching: .any).matching(identifier: "owner-chart-columns").firstMatch
    let day = app.descendants(matching: .any)["owner-chart-day"].firstMatch
    let screen = app.windows.firstMatch.frame
    let shown = { columns.isHittable && columns.frame.maxY < screen.maxY - 60 }
    repeatUntil(shown(), times: 6) { app.swipeUp(velocity: .slow) }
    XCTAssertTrue(shown(), "the chart isn't on screen")
    // Untouched: today, Wednesday, so far.
    XCTAssertTrue(reads(day, "5 found an answer", "Wed 4 Nov, so far"), day.label)
    columns.coordinate(withNormalizedOffset: CGVector(dx: 0.5 / 7, dy: 0.8)).tap()
    XCTAssertTrue(reads(day, "3 found an answer", "Mon 2 Nov · 6 readers · 0 shop clicks"), day.label)
  }

  /// A review's notes (some 4 KB on the site, a note a line) show two lines until tapped, and the review's line always.
  func testALongCellShowsTwoLinesUntilTapped() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Content and engine")
    // The video guide's three notes, the third with `&` and `<don't>` in it, as written; the review's line said too.
    let notes = app.buttons.matching(NSPredicate(format: "identifier == 'owner-fold' AND label CONTAINS 'Phụ đề tự động' AND label CONTAINS %@",
                                                 "Keep them hedged & <don't> give")).firstMatch
    XCTAssertTrue(notes.waitForExistence(timeout: 10), "no notes cell")
    XCTAssertTrue(notes.label.contains("Review of the video guide, 3 Nov · 3 notes"), notes.label)
    XCTAssertEqual(notes.value as? String, "More")
    // Down the section to its table, then across it to the notes' column: dragged and held, never flung, so it isn't
    // scrolled past.
    let window = app.windows.firstMatch.frame
    func drag(_ from: CGVector, _ by: CGVector) {
      let start = app.coordinate(withNormalizedOffset: .zero).withOffset(from)
      start.press(forDuration: 0.05, thenDragTo: start.withOffset(by), withVelocity: .fast, thenHoldForDuration: 0.1)
    }
    repeatUntil(notes.isHittable, times: 24) {
      let f = notes.frame
      if f.minY > window.maxY - 200 { drag(CGVector(dx: window.midX, dy: window.height * 0.7), CGVector(dx: 0, dy: -window.height * 0.4)) }
      else if f.minY < window.minY + 160 { drag(CGVector(dx: window.midX, dy: window.height * 0.3), CGVector(dx: 0, dy: window.height * 0.3)) }
      else { drag(CGVector(dx: window.width * 0.85, dy: f.minY + 10), CGVector(dx: -window.width * 0.6, dy: 0)) }
    }
    XCTAssertTrue(notes.isHittable, "the notes cell isn't on screen")
    let folded = notes.frame.height
    // Tapped near its top, which stays put as it opens downwards.
    notes.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
    let opened = expectation(for: NSPredicate(format: "value == 'Less'"), evaluatedWith: notes)
    wait(for: [opened], timeout: 5)
    XCTAssertGreaterThan(notes.frame.height, folded * 2, "not all of it")
    notes.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.1)).tap()
    let closed = expectation(for: NSPredicate(format: "value == 'More'"), evaluatedWith: notes)
    wait(for: [closed], timeout: 5)
    XCTAssertEqual(notes.frame.height, folded, accuracy: 1, "not two lines again")
  }

  /// Fish ID for another period, from the bar's menu: every figure of the page is for it.
  func testThePeriodMenuReadsTheSectionForThatPeriod() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Calls and keys")
    let menu = app.buttons["owner-period"]
    XCTAssertTrue(menu.waitForExistence(timeout: 10), "no period menu")
    XCTAssertEqual(menu.value as? String, "This week")
    XCTAssertTrue(figure(app, "Claude calls, 58").exists, figure(app, "Claude calls").label)
    menu.tap()
    app.buttons["30 days"].tap()
    XCTAssertTrue(figure(app, "Claude calls, 570").waitForExistence(timeout: 10), "not read for 30 days")
    XCTAssertEqual(menu.value as? String, "30 days")
  }

  /// A folded table opens its rows on a page of its own; a long one shows its first 50 rows and reads the rest on asking.
  func testAFoldedTableOpensItsRowsAndALongOneReadsTheRest() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Calls and keys")
    XCTAssertTrue(folded(app, "Since 7:00, in detail").waitForExistence(timeout: 10), "no folded table")
    app.scrollToAndTap("owner-folded")
    XCTAssertTrue(app.navigationBars["Since 7:00, in detail"].waitForExistence(timeout: 10), "its page didn't open")
    XCTAssertTrue(app.descendants(matching: .any)["owner-table"].waitForExistence(timeout: 10), "its rows weren't read")
    XCTAssertTrue(app.staticTexts["Fell back to one call"].exists, "not its rows")
    back(app)

    // Every request this week: 50, then the other 9.
    let requests = folded(app, "Every request")
    repeatUntil(requests.exists && requests.isHittable, times: 10) { app.swipeUp(velocity: .slow) }
    requests.tap()
    XCTAssertTrue(app.navigationBars["Every request"].waitForExistence(timeout: 10), "its page didn't open")
    let more = app.buttons["owner-more"]
    XCTAssertTrue(more.waitForExistence(timeout: 10), "no more to read")
    repeatUntil(more.isHittable, times: 30) { app.swipeUp() }
    XCTAssertEqual(more.label, "Show 9 more of 59")
    XCTAssertFalse(app.staticTexts["Mon 2 Nov, 0:30"].exists, "the last row before it was read")
    more.tap()
    let last = app.staticTexts["Mon 2 Nov, 0:30"]
    XCTAssertTrue(last.waitForExistence(timeout: 10), "the rest weren't read")
    XCTAssertFalse(more.exists, "more to read after the last page")
  }

  /// Comments: held ones first, shown or hidden by the owner, a hidden one shown again; each filter with its count.
  func testCommentsAreShownHiddenAndShownAgain() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Comments")
    let filter = app.segmentedControls["owner-comment-filter"]
    XCTAssertTrue(filter.waitForExistence(timeout: 10), "no filter")
    XCTAssertTrue(filter.buttons["Held · 5"].isSelected, "not the held ones first")
    let held = comment(app, "banhmi_fish")
    XCTAssertTrue(held.exists)
    XCTAssertTrue(held.descendants(matching: .any)["owner-comment-reason"].label.contains("Held when posted: it has “zalo:”, a blocked term"))
    XCTAssertEqual(app.descendants(matching: .any).matching(identifier: "owner-comment").count, 3)
    XCTAssertFalse(app.staticTexts["Held"].exists, "a Held badge under the Held filter")
    // The other two held, 50 at a time, said as how many are left.
    let more = app.buttons["owner-more"]
    repeatUntil(more.exists && more.isHittable, times: 6) { app.swipeUp() }
    XCTAssertEqual(more.label, "Show 2 more of 5")
    more.tap()
    XCTAssertTrue(comment(app, "Reader 00").waitForExistence(timeout: 10), "the rest weren't read")
    XCTAssertTrue(comment(app, "Reader 00").staticTexts["a page no longer on the site"].exists)

    // Shown: it leaves the held ones, and the counts follow.
    repeatUntil(filter.isHittable, times: 6) { app.swipeDown() }
    held.buttons["Show"].tap()
    XCTAssertTrue(filter.buttons["Held · 4"].waitForExistence(timeout: 10), "the held count didn't follow")
    XCTAssertTrue(filter.buttons["Shown · 21"].exists)
    XCTAssertFalse(comment(app, "banhmi_fish").exists, "still held")
    filter.buttons["Shown · 21"].tap()
    let shown = comment(app, "banhmi_fish")
    XCTAssertTrue(shown.waitForExistence(timeout: 10), "not among the shown")
    XCTAssertTrue(shown.descendants(matching: .any)["owner-comment-reason"].label.contains("Shown by the owner"))

    // Hidden, then shown again.
    shown.buttons["Hide"].tap()
    XCTAssertTrue(filter.buttons["Hidden · 3"].waitForExistence(timeout: 10), "the hidden count didn't follow")
    filter.buttons["Hidden · 3"].tap()
    let hidden = comment(app, "banhmi_fish")
    XCTAssertTrue(hidden.waitForExistence(timeout: 10), "not among the hidden")
    // The one hidden more than 30 days ago can't be shown again: no button.
    XCTAssertFalse(comment(app, "Bình").buttons["owner-action"].exists)
    hidden.buttons["Show again"].tap()
    XCTAssertTrue(filter.buttons["Hidden · 2"].waitForExistence(timeout: 10))
    XCTAssertFalse(comment(app, "banhmi_fish").exists)
  }

  func testRemovingAReadersPhotoAsksFirst() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Reader photos")
    // Lan's photo: its Approve goes with it.
    let approve = app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == 'Approve'")).firstMatch
    let remove = app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == 'Remove'")).firstMatch
    XCTAssertTrue(remove.waitForExistence(timeout: 10), "no photo to remove")
    XCTAssertTrue(approve.exists)
    remove.tap()
    // Asked first, and nothing gone before the answer.
    XCTAssertTrue(app.staticTexts["This can't be undone."].waitForExistence(timeout: 5), "removed without asking")
    XCTAssertTrue(approve.exists, "removed before the answer")
    app.buttons.matching(NSPredicate(format: "label == 'Remove' AND identifier != 'owner-action'")).firstMatch.tap()
    let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: approve)
    wait(for: [gone], timeout: 10)
  }

  func testTheOwnerApprovesAReadersPhoto() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Reader photos")
    let approve = app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == 'Approve'")).firstMatch
    XCTAssertTrue(approve.waitForExistence(timeout: 10), "no photo waiting")
    // Lan's photo, the one waiting to be approved.
    let approved = text(app, "label BEGINSWITH 'Lan' AND label CONTAINS 'Approved · goes up at the next pass'")
    XCTAssertFalse(approved.exists)
    approve.tap()
    // Read again: the photo approved is marked so, and has nothing more to approve.
    XCTAssertTrue(approved.waitForExistence(timeout: 10), "not marked approved")
    XCTAssertFalse(approve.exists, "still waiting to be approved")
  }

  func testHidesAPageThenBringsItBack() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Hidden pages")
    hide(app, "/ca/ca-y/", note: "sai loài")
    let page = text(app, "label BEGINSWITH '/ca/ca-y/'")
    XCTAssertTrue(page.waitForExistence(timeout: 10), "not listed as hidden")
    XCTAssertTrue(page.label.contains("sai loài"), page.label)
    // The newest first: its "Show again".
    let again = app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == 'Show again'")).firstMatch
    XCTAssertEqual(app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == 'Show again'")).count, 3)
    again.tap()
    let gone = expectation(for: NSPredicate(format: "exists == false"), evaluatedWith: page)
    wait(for: [gone], timeout: 10)
    XCTAssertTrue(text(app, "label BEGINSWITH '/ca/ca-x/'").exists, "the others stay hidden")
  }

  func testARefusedButtonShowsTheServersMessage() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Hidden pages")
    hide(app, "/")
    let said = app.staticTexts["owner-message"]
    XCTAssertTrue(said.waitForExistence(timeout: 10), "nothing said")
    // The Worker's own words, as the contract's vector has them ("hide the home page"): English since its version 2.
    XCTAssertEqual(said.label, "Only one page of the site can be hidden, and not the home page.")
  }

  /// The bell: the daily report's email turned off, kept off when the bell is opened again, then on again.
  func testTheOwnerTurnsTheDailyReportsEmailOffThenOnAgain() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    var email = delivery(app)["owner-email"]
    XCTAssertTrue(becomes(email, "1"), "email isn't said on")
    email.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
    XCTAssertTrue(becomes(email, "0"), "not off")
    app.buttons["Done"].tap()
    email = delivery(app)["owner-email"]
    XCTAssertTrue(becomes(email, "0"), "not kept off")
    email.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
    XCTAssertTrue(becomes(email, "1"), "not on again")
  }

  func testStorageDownSaysSoAndTriesAgain() {
    let app = launch("-owner-storage-down")
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Readers")
    let said = app.staticTexts["owner-message"]
    XCTAssertTrue(said.waitForExistence(timeout: 10), "nothing said")
    // As the contract's vector "storage down" has it: English since its version 2.
    XCTAssertEqual(said.label, "Couldn't do that just now: the server couldn't read or write its storage. Try again later.")
    app.buttons["owner-again"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["owner-chart"].firstMatch.waitForExistence(timeout: 10), "the section didn't come")
    XCTAssertFalse(said.exists)
  }

  /// The daily report's notifications on this phone, from the bell: off at first (the site sends none to phones);
  /// turned on (iOS asks, the first time on this simulator) and allowed, they're on here and at the site, and stay on
  /// when the bell is opened again (the token itself, which the simulator doesn't get, is the kit's to test:
  /// OwnerPushTests); turned off again.
  func testTheReportsNotificationsAreTurnedOnHereOnceIOSAllowsThem() {
    let app = launch()
    signIn(app)
    open(app, "owner-dashboard")
    var row = delivery(app)["owner-push"]
    XCTAssertTrue(row.waitForExistence(timeout: 10), "no notifications row")
    XCTAssertEqual(row.value as? String, "0")
    // The switch itself, at the row's end (the words are the label's).
    row.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
    let ask = XCUIApplication(bundleIdentifier: "com.apple.springboard").alerts.firstMatch
    if ask.waitForExistence(timeout: 5) { ask.buttons.element(boundBy: ask.buttons.count - 1).tap() }
    XCTAssertTrue(becomes(row, "1"), "not on")
    // What the app and the site keep, not the switch's own state: the bell opened again.
    app.buttons["Done"].tap()
    row = delivery(app)["owner-push"]
    XCTAssertTrue(becomes(row, "1"), "not kept on")
    row.coordinate(withNormalizedOffset: CGVector(dx: 0.92, dy: 0.5)).tap()
    XCTAssertTrue(becomes(row, "0"), "not off")
  }

  func testAnotherAccountSeesNoDashboard() {
    // The stand-in's owner is another account: this one's overview answers 404.
    let app = launch(owner: "someone-else")
    signIn(app)
    // The dashboard asked about this account and was told it isn't the owner's: then no row.
    let told = expectation(for: NSPredicate(format: "value == 'not owner'"), evaluatedWith: app.buttons["sync-now"])
    wait(for: [told], timeout: 10)
    XCTAssertFalse(app.descendants(matching: .any)["owner-dashboard"].exists, "a dashboard row for an account that isn't the owner's")
  }

  func testASessionEndingWhileTheDashboardIsOpenAsksToSignInAgainAndKeepsTheRow() {
    let app = launch("-owner-session-ends")
    signIn(app)
    open(app, "owner-dashboard")
    section(app, "Readers")
    let said = app.staticTexts["owner-message"]
    XCTAssertTrue(said.waitForExistence(timeout: 10), "nothing said")
    XCTAssertEqual(said.label, "Your session has ended: sign in again to see the dashboard.")
    back(app)
    back(app)

    // Signed out as a sync told the same is; the row stays, saying why it can't open. Under the ways to sign in, out of
    // view until scrolled to: the list makes its rows as they come into view.
    let row = app.descendants(matching: .any)["owner-dashboard"].firstMatch
    repeatUntil(row.exists, times: 6) { app.swipeUp() }
    XCTAssertTrue(row.waitForExistence(timeout: 5), "the row went")
    XCTAssertTrue(row.label.contains("đăng nhập lại"), row.label)
    let ended = app.staticTexts["session-ended"]
    XCTAssertTrue(ended.waitForExistence(timeout: 5))
    XCTAssertEqual(ended.label, "Phiên đăng nhập đã hết. Lần trước bạn đăng nhập bằng Apple.")

    // Signed in again (its button back up the list): the dashboard opens as before.
    repeatUntil(app.descendants(matching: .any)["apple-sign-in"].firstMatch.exists, times: 6) { app.swipeDown() }
    signIn(app)
    let plain = expectation(for: NSPredicate(format: "NOT (label CONTAINS 'đăng nhập lại')"), evaluatedWith: row)
    wait(for: [plain], timeout: 10)
    open(app, "owner-dashboard")
    section(app, "Readers")
    XCTAssertTrue(app.descendants(matching: .any)["owner-chart"].firstMatch.waitForExistence(timeout: 10), "the section didn't open")
    XCTAssertFalse(app.staticTexts["owner-message"].exists)
  }

  // MARK: Helpers

  /// A new phone, the stand-in's accounts empty, `owner` its owner's account (`ui-apple`: the stand-in Apple sign-in's), in
  /// the Tài khoản sheet.
  private func launch(owner: String = "ui-apple", _ args: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-v2", "YES", "-fake-accounts", "on", "-reset-defaults",
                           "-reset-fake-server", "-fake-owner", owner] + args
    app.launch()
    app.openAccount()
    return app
  }

  // ——— The owner's report ———

  /// The sheet: the keyboard up for the dictation key, what was on the screen attached, and a send that closes it.
  func testTheOwnerReportsWhatsOnTheScreenFromTheButton() {
    let app = launch()
    signIn(app)
    let button = app.buttons["owner-report"]
    XCTAssertTrue(button.waitForExistence(timeout: 10), "no report button for the owner")
    button.tap()
    let words = app.textViews["owner-report-words"].exists ? app.textViews["owner-report-words"] : app.textFields["owner-report-words"]
    XCTAssertTrue(words.waitForExistence(timeout: 10), "no sheet")
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "the keyboard should come up by itself")
    XCTAssertTrue(app.images["owner-report-image"].exists, "what was on the screen isn't attached")
    words.typeText("Ảnh bị lệch")
    app.buttons["owner-report-send"].tap()
    // The sheet goes by itself only once it's sent, and the button comes back.
    XCTAssertTrue(app.buttons["owner-report-send"].waitForNonExistence(timeout: 20), "not sent: the sheet stayed")
    XCTAssertTrue(button.waitForExistence(timeout: 10), "the button didn't come back")
  }

  /// v2, the owner's default: the report names v2's tab, the page on it and its item, and its picture is what the screen
  /// shows. A page left for another tab is no longer named.
  func testTheReportNamesV2sScreenAndThePageOnIt() {
    let app = launch(owner: "ui-apple", "-v2", "YES")
    signIn(app)
    app.closeAccount()
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].isSelected, "v2 didn't open on Hôm nay")
    let home = XCUIScreen.main.screenshot().image
    let today = report(app)
    XCTAssertTrue(today.hasPrefix("v2 today · "), today)

    app.buttons["v2-fish-of-the-day"].tap()
    XCTAssertTrue(app.descendants(matching: .any)["v2-species"].waitForExistence(timeout: 10), "the fish's page didn't open")
    _ = XCTWaiter.wait(for: [XCTestExpectation(description: "settled")], timeout: 2)
    let screen = XCUIScreen.main.screenshot().image
    let fish = report(app) { picture in
      // Near the screen it was taken from, and nearer it than Hôm nay's: a check that any picture would pass can't.
      let (near, other, spread) = (Self.difference(picture, screen), Self.difference(picture, home), Self.spread(picture))
      print("owner report picture: \(near) from the screen, \(other) from Hôm nay's, spread \(spread)")
      XCTAssertLessThan(near, 0.08, "the picture isn't what the screen showed: \(near)")
      XCTAssertLessThan(near * 2, other, "the picture is as near another screen as its own: \(near) against \(other)")
      XCTAssertGreaterThan(spread, 0.05, "the picture is one flat colour")
    }
    XCTAssertTrue(fish.hasPrefix("v2 today / species "), fish)
    XCTAssertTrue(fish.contains("/ca/"), fish)

    app.openTab("Bể của tôi")
    let tanks = report(app)
    XCTAssertTrue(tanks.hasPrefix("v2 tanks · "), tanks)
    XCTAssertFalse(tanks.contains("/ca/"), "the fish's page, left on Hôm nay, still named: \(tanks)")
  }

  /// The chat, pushed over a fish's page on Hôm nay: the report names the chat, which conversation and which answer was on
  /// the screen, and back on the fish's page names that again. Before, the chat was reported as the tab under it.
  func testTheReportNamesTheChatOverHomNayItsConversationAndItsAnswer() {
    let app = launch(owner: "ui-apple", "-v2", "YES")
    signIn(app)
    app.closeAccount()
    let any = app.descendants(matching: .any)
    app.buttons["v2-fish-of-the-day"].tap()
    XCTAssertTrue(any["v2-species"].waitForExistence(timeout: 10), "the fish's page didn't open")
    let entry = any["chat-entry"].firstMatch
    repeatUntil(entry.exists && entry.isHittable, times: 8) { app.swipeUp() }
    entry.tap()
    XCTAssertTrue(any["chat"].waitForExistence(timeout: 10), "no chat")
    let chip = app.buttons.matching(identifier: "chat-chip").firstMatch
    XCTAssertTrue(chip.waitForExistence(timeout: 15), "no starters")
    chip.tap()
    XCTAssertTrue(any["chat-answer"].firstMatch.waitForExistence(timeout: 20), "no answer")
    XCTAssertTrue(chip.waitForExistence(timeout: 20), "the answer didn't finish")

    let chat = report(app)
    XCTAssertTrue(chat.hasPrefix("v2 today / chat "), chat)
    XCTAssertNotNil(chat.range(of: " · [0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} · câu 1 · ", options: .regularExpression), chat)

    app.navigationBars.buttons.element(boundBy: 0).tap()
    XCTAssertTrue(any["v2-species"].waitForExistence(timeout: 10), "not back on the fish's page")
    let fish = report(app)
    XCTAssertTrue(fish.hasPrefix("v2 today / species "), fish)
    XCTAssertFalse(fish.contains("câu"), "the chat's answer named on the fish's page: \(fish)")
  }

  /// A fish found on Tìm kiếm: the tab, the page and its slug, not Tìm kiếm alone.
  func testTheReportNamesAFishPageOverTimKiemWithItsSlug() {
    let app = launch(owner: "ui-apple", "-v2", "YES")
    signIn(app)
    app.closeAccount()
    let tabs = app.tabBars.buttons
    tabs.element(boundBy: tabs.count - 1).tap()
    XCTAssertTrue(report(app).hasPrefix("v2 search · "), "Tìm kiếm itself")
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("Ca neon")
    let row = app.descendants(matching: .any).matching(identifier: "item").firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "nothing found")
    row.tap()
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 10), "the keyboard stayed over the button")
    let fish = report(app)
    XCTAssertNotNil(fish.range(of: "^v2 search / (species|fish page) ([a-z0-9-]+) · (/vi)?/ca/\\2/ · ", options: .regularExpression), fish)
  }

  /// A screen opened inside a sheet: the owner's dashboard in the Tài khoản sheet was reported as the account.
  func testTheReportNamesTheDashboardInsideTheAccountSheet() {
    let app = launch(owner: "ui-apple", "-v2", "YES")
    signIn(app)
    XCTAssertTrue(report(app).hasPrefix("v2 today / account · "), "the account sheet itself")
    open(app, "owner-dashboard")
    XCTAssertTrue(app.navigationBars["Dashboard"].waitForExistence(timeout: 10), "not the dashboard")
    let dashboard = report(app)
    XCTAssertTrue(dashboard.hasPrefix("v2 today / account / dashboard home · "), dashboard)
  }

  /// The report's sheet from the button: what it says it sends with the words, after `look` at its picture; then closed.
  private func report(_ app: XCUIApplication, look: ((UIImage) -> Void)? = nil, line: UInt = #line) -> String {
    let button = app.buttons["owner-report"]
    XCTAssertTrue(button.waitForExistence(timeout: 10), "no report button", line: line)
    button.tap()
    let sent = app.staticTexts["owner-report-where"]
    XCTAssertTrue(sent.waitForExistence(timeout: 10), "no sheet", line: line)
    let image = app.images["owner-report-image"]
    XCTAssertTrue(image.exists, "no picture attached", line: line)
    look?(image.screenshot().image)
    let said = sent.label
    app.buttons["owner-report-close"].tap()
    XCTAssertTrue(sent.waitForNonExistence(timeout: 10), "the sheet didn't close", line: line)
    return said
  }

  /// Two pictures as a small grid of greys, 0 to 1: how far apart, on average.
  private static func difference(_ a: UIImage, _ b: UIImage) -> Double {
    let (x, y) = (greys(a), greys(b))
    return zip(x, y).map { abs($0 - $1) }.reduce(0, +) / Double(x.count)
  }

  /// How far a picture's greys stray from their mean: near 0 for one colour.
  private static func spread(_ a: UIImage) -> Double {
    let g = greys(a)
    let mean = g.reduce(0, +) / Double(g.count)
    return (g.map { ($0 - mean) * ($0 - mean) }.reduce(0, +) / Double(g.count)).squareRoot()
  }

  private static func greys(_ image: UIImage, columns: Int = 9, rows: Int = 19) -> [Double] {
    var bytes = [UInt8](repeating: 0, count: columns * rows)
    bytes.withUnsafeMutableBytes { buffer in
      guard let cg = image.cgImage,
            let context = CGContext(data: buffer.baseAddress, width: columns, height: rows, bitsPerComponent: 8, bytesPerRow: columns,
                                    space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return }
      context.interpolationQuality = .medium
      context.draw(cg, in: CGRect(x: 0, y: 0, width: columns, height: rows))
    }
    return bytes.map { Double($0) / 255 }
  }

  /// A normal iPhone screenshot offers a report, without getting in the way: nothing opens until it's tapped.
  func testAScreenshotOffersAReport() {
    let app = launch(owner: "ui-apple", "-owner-screenshot-after", "6")
    signIn(app)
    let button = app.buttons["owner-report"]
    XCTAssertTrue(button.waitForExistence(timeout: 10), "no report button")
    let offered = XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == 'ảnh vừa chụp'"), object: button)
    XCTAssertEqual(XCTWaiter.wait(for: [offered], timeout: 20), .completed, "no offer after the screenshot")
    XCTAssertFalse(app.buttons["owner-report-send"].exists, "a screenshot alone shouldn't open the sheet")
    button.tap()
    XCTAssertTrue(app.buttons["owner-report-send"].waitForExistence(timeout: 10), "no sheet")
    XCTAssertTrue(app.images["owner-report-image"].exists, "the screenshot isn't attached")
    app.buttons["owner-report-close"].tap()
    XCTAssertTrue(button.waitForExistence(timeout: 10), "the button didn't come back")
  }

  /// Another account never sees it: the site would refuse it anyway.
  func testAnotherAccountHasNoReportButton() {
    let app = launch(owner: "someone-else")
    signIn(app)
    XCTAssertFalse(app.buttons["owner-report"].waitForExistence(timeout: 5), "a report button for another account")
  }

  func testSigningOutTakesTheReportButtonAway() {
    let app = launch()
    signIn(app)
    XCTAssertTrue(app.buttons["owner-report"].waitForExistence(timeout: 10), "no report button")
    // At the sheet's foot: the list makes the row only once it scrolls into view, and not under the sheet's bar.
    let out = app.descendants(matching: .any)["sign-out"].firstMatch
    let bar = app.navigationBars["Tài khoản"]
    repeatUntil(out.exists && out.isHittable && (!bar.exists || out.frame.minY >= bar.frame.maxY), times: 10) { app.swipeUp() }
    XCTAssertTrue(out.isHittable, "no sign-out")
    out.tap()
    XCTAssertTrue(app.buttons["owner-report"].waitForNonExistence(timeout: 10), "the report button stayed after signing out")
  }

  private func signIn(_ app: XCUIApplication) { app.signInWithStandInApple() }
  private func open(_ app: XCUIApplication, _ id: String) { app.scrollToAndTap(id) }
  private func section(_ app: XCUIApplication, _ name: String) { app.openOwnersSection(name) }
  /// A page of "Every page", by its name, scrolled to.
  private func page(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    let row = app.buttons.matching(NSPredicate(format: "identifier == 'owner-page' AND label BEGINSWITH %@", name + ",")).firstMatch
    repeatUntil(row.exists && row.isHittable, times: 12) { app.swipeUp() }
    XCTAssertTrue(row.isHittable, "no page \(name)")
    return row
  }
  /// A section's figure, by what it counts.
  private func figure(_ app: XCUIApplication, _ label: String) -> XCUIElement {
    app.descendants(matching: .any).matching(NSPredicate(format: "identifier == 'owner-figure' AND label BEGINSWITH %@", label + ",")).firstMatch
  }
  /// A folded table's row, by its name.
  private func folded(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.buttons.matching(NSPredicate(format: "identifier == 'owner-folded' AND label BEGINSWITH %@", name)).firstMatch
  }
  /// A comment, by the name its reader gave.
  private func comment(_ app: XCUIApplication, _ name: String) -> XCUIElement {
    app.descendants(matching: .any).matching(identifier: "owner-comment").containing(NSPredicate(format: "label BEGINSWITH %@", name + " · ")).firstMatch
  }
  /// The bell's sheet, opened: its switches.
  private func delivery(_ app: XCUIApplication) -> XCUIElementQuery {
    app.buttons["owner-bell"].tap()
    XCTAssertTrue(app.navigationBars["Daily report"].waitForExistence(timeout: 5), "the bell's sheet didn't open")
    return app.switches
  }
  /// Whether `e`'s value becomes `value` within 10 s (the sheet reads the server's first).
  private func becomes(_ e: XCUIElement, _ value: String) -> Bool {
    XCTWaiter.wait(for: [expectation(for: NSPredicate(format: "value == %@", value), evaluatedWith: e)], timeout: 10) == .completed
  }
  /// Whether `e` can be tapped within 5 s (scrolled to).
  private func becomesHittable(_ e: XCUIElement) -> Bool {
    XCTWaiter.wait(for: [expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: e)], timeout: 5) == .completed
  }
  /// A chart's label reads `title` then `detail` within 5 s.
  private func reads(_ e: XCUIElement, _ title: String, _ detail: String) -> Bool {
    XCTWaiter().wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "label BEGINSWITH %@ AND label CONTAINS %@", title, detail), object: e)], timeout: 5) == .completed
  }

  /// A text by its words: a part's lines are one text, its first line first.
  private func text(_ app: XCUIApplication, _ predicate: String) -> XCUIElement {
    app.staticTexts.matching(NSPredicate(format: predicate)).firstMatch
  }

  /// A button of the section's, by its words, once it's there.
  private func button(_ app: XCUIApplication, _ label: String) -> XCUIElement {
    let b = app.buttons.matching(NSPredicate(format: "identifier == 'owner-action' AND label == %@", label)).firstMatch
    XCTAssertTrue(b.waitForExistence(timeout: 10), "no \(label)")
    return b
  }

  private func back(_ app: XCUIApplication) {
    app.navigationBars.buttons.element(boundBy: 0).tap()
  }

  /// The section's form to hide a page: the page, and why.
  private func hide(_ app: XCUIApplication, _ path: String, note: String? = nil) {
    let field = app.textFields["owner-field-path"]
    XCTAssertTrue(field.waitForExistence(timeout: 10), "no form to hide a page")
    field.tap()
    field.typeText(path)
    if let note {
      app.textFields["owner-field-note"].tap()
      app.textFields["owner-field-note"].typeText(note)
    }
    app.buttons["owner-submit"].tap()
  }
}

/// The owner's dashboard on the stand-in server, for these flows and the page shots.
extension XCUIApplication {
  static let standInOwner = ["-fake-accounts", "on", "-reset-fake-server", "-fake-owner", "ui-apple"]

  /// Signs in with the stand-in Apple sheet, and waits for the sync that follows.
  func signInWithStandInApple(file: StaticString = #filePath, line: UInt = #line) {
    scrollToAndTap("apple-sign-in", file: file, line: line)
    let status = staticTexts["account-status"]
    // At the largest text the button is screens under the sheet's top, where the status is, and a list doesn't keep what's
    // that far off screen: once the button has gone (signed in), back up to it.
    if !status.waitForExistence(timeout: 3), descendants(matching: .any)["apple-sign-in"].firstMatch.waitForNonExistence(timeout: 10) {
      repeatUntil(status.exists, times: 12) { swipeDown() }
    }
    XCTAssertTrue(status.waitForExistence(timeout: 10), "not signed in", file: file, line: line)
    let synced = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in Int(status.value as? String ?? "") ?? 0 >= 1 }, object: nil)
    XCTAssertEqual(XCTWaiter.wait(for: [synced], timeout: 10), .completed, "no sync", file: file, line: line)
  }

  /// Scrolls until the element is on screen, then taps it.
  func scrollToAndTap(_ id: String, file: StaticString = #filePath, line: UInt = #line) {
    let e = descendants(matching: .any)[id].firstMatch
    // A row screens down a list isn't there until it's scrolled near (the largest text).
    if !e.waitForExistence(timeout: 10) { repeatUntil(e.exists, times: 8) { swipeUp() } }
    XCTAssertTrue(e.exists, "no \(id)", file: file, line: line)
    repeatUntil(e.isHittable, times: 6) { swipeUp() }
    e.tap()
  }

  /// A section, from the overview's "Every page", at its end, by its name there.
  func openOwnersSection(_ name: String, file: StaticString = #filePath, line: UInt = #line) {
    XCTAssertTrue(buttons["owner-tile-needs"].waitForExistence(timeout: 10), "the overview didn't load", file: file, line: line)
    let row = buttons.matching(NSPredicate(format: "identifier == 'owner-page' AND label BEGINSWITH %@", name + ",")).firstMatch
    // Slowly, and back if it's gone by: a fling can carry the row past the screen, and at the largest text "Every page" is
    // many screens down.
    repeatUntil(row.exists && row.isHittable, times: 40) {
      if row.exists, row.frame.maxY < frame.height * 0.2 { swipeDown(velocity: .slow) } else { swipeUp(velocity: .slow) }
    }
    XCTAssertTrue(row.isHittable, "no section \(name)", file: file, line: line)
    row.tap()
  }
}
