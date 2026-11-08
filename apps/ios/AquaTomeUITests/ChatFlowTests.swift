import XCTest

/// The chat screen on the stand-in server (FakeChat: the contract's recorded answers, an event every half second): from a
/// fish's page and from fish ID's result, signed in from the screen; the wait, its steps, the fold and the text as the
/// answer streams; each way a question doesn't go (the day used, offline, too long) leaving it in the box; each way an
/// answer fails, asked again under the same bubble; leaving mid-answer and coming back; a conversation that has ended
/// going on in a new one; starting over. Hidden while the server says chat is off.
final class ChatFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// From a fish's page: signed in on the screen, a starter asked; the wait and its steps, then the steps folded into the
  /// pages read, the text, and the next questions.
  func testAFishsPageAsksAndTheAnswerComesInAfterItsSteps() {
    // An event every 3 s: the wait and its steps stay long enough to be seen.
    let app = launch("-chat-slow")
    openChat(app)
    XCTAssertTrue(element(app, "chat-about").label.contains("Về: Cá neon"), element(app, "chat-about").label)
    XCTAssertTrue(app.staticTexts["Hỏi gì về cá neon?"].exists, "no empty screen's question")
    signIn(app)
    let starter = app.buttons.matching(identifier: "chat-chip").firstMatch
    XCTAssertTrue(starter.waitForExistence(timeout: 5), "no starters after signing in")
    let asked = starter.label
    starter.tap()
    XCTAssertTrue(app.staticTexts["chat-question"].waitForExistence(timeout: 5), "no question's bubble")
    XCTAssertEqual(app.staticTexts["chat-question"].label, "Bạn hỏi: \(asked)")
    XCTAssertTrue(element(app, "chat-wait").waitForExistence(timeout: 5), "no wait")
    XCTAssertTrue(app.staticTexts["Thường dưới nửa phút."].exists, "no wait's line under the box")
    XCTAssertTrue(element(app, "chat-step").waitForExistence(timeout: 5), "no step while waiting")
    // The text starts: the steps fold into the pages read; the wait goes.
    let fold = app.buttons["chat-fold"]
    XCTAssertTrue(fold.waitForExistence(timeout: 20), "the steps didn't fold")
    XCTAssertTrue(fold.label.contains("Đã đọc 2 trang trong cẩm nang"), fold.label)
    XCTAssertFalse(element(app, "chat-wait").exists, "still waiting with the text in")
    let answer = element(app, "chat-answer")
    XCTAssertTrue(answer.waitForExistence(timeout: 20), "no whole answer")
    XCTAssertTrue(answer.staticTexts.firstMatch.label.hasPrefix("Cá neon xanh dễ nuôi"), answer.staticTexts.firstMatch.label)
    XCTAssertTrue(app.buttons.matching(identifier: "chat-chip").firstMatch.waitForExistence(timeout: 5), "no next questions")
    // The fold opened lists the steps again, a page read opening that page.
    fold.tap()
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label == 'Đã đọc Cá neon xanh'")).firstMatch.waitForExistence(timeout: 5),
                  "the fold doesn't list the pages read")
    XCTAssertEqual(app.staticTexts.matching(identifier: "chat-question").count, 1)
  }

  /// Off on the server: no way into the chat from a fish's page.
  func testWhileChatIsOffNoEntryShows() {
    let app = launch("-chat-off")
    open(app, "Ca neon")
    XCTAssertTrue(element(app, "native-page").waitForExistence(timeout: 10), "no page")
    reveal(app, app.buttons["put-on-tank"])
    XCTAssertFalse(element(app, "chat-entry").exists, "the chat's entry on a page while it's off")
  }

  /// Fish ID's result hands its guesses over (never the photo), worded as fish ID words them.
  func testFishIdsResultAsksWithItsGuesses() {
    let app = launch("-picked-photo")
    openFishId(app)
    let apple = element(app, "apple-sign-in")
    XCTAssertTrue(apple.waitForExistence(timeout: 5), "no sign-in")
    apple.tap()
    let send = element(app, "fish-id-send")
    reveal(app, send)
    send.tap()
    let entry = element(app, "chat-entry")
    reveal(app, entry)
    XCTAssertTrue(entry.label.contains("Hỏi về con cá này"), entry.label)
    entry.tap()
    let about = element(app, "chat-about")
    XCTAssertTrue(about.waitForExistence(timeout: 5), "no chat")
    XCTAssertTrue(about.label.contains("Về: ảnh của bạn"), about.label)
    XCTAssertTrue(about.label.contains("Gần như chắc chắn Cá neon, có thể Green neon tetra"), about.label)
    XCTAssertTrue(app.staticTexts["Claude, mô hình AI của Anthropic, trả lời dựa trên cẩm nang AquaTome. Phần nào cẩm nang chưa có thì Claude dùng kiến thức chung về nuôi cá. Ảnh của bạn không gửi kèm câu hỏi."].exists)
    XCTAssertTrue(app.buttons["Làm sao phân biệt với green neon tetra?"].exists, "no starter telling the guesses apart")
  }

  /// The reader's day used: the question stays in the box, unsent, with when to ask again; "Tìm trong cẩm nang" looks it
  /// up in Tìm.
  func testWithTheDayUsedTheQuestionStaysInTheBox() {
    let app = launch("-chat-rate")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    let card = element(app, "chat-stopped")
    XCTAssertTrue(card.waitForExistence(timeout: 5), "no day-used card")
    XCTAssertTrue(card.staticTexts["Hết 30 câu hỏi hôm nay"].exists, "not the day used")
    XCTAssertFalse(app.staticTexts["chat-question"].exists, "the question went")
    XCTAssertEqual(element(app, "chat-box").value as? String, "Neon sống bao lâu?")
    element(app, "chat-search").tap()
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "not Tìm")
    XCTAssertEqual(field.value as? String, "Neon sống bao lâu?")
  }

  /// A failed answer that counts: said so, and asked again under the same bubble, never a second one.
  func testAFailedAnswerIsAskedAgainUnderTheSameBubble() {
    let app = launch("-chat-failed", "-chat-slow")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    let failed = element(app, "chat-failed")
    XCTAssertTrue(failed.waitForExistence(timeout: 20), "no failed card")
    XCTAssertTrue(failed.staticTexts["Không có câu trả lời"].exists)
    XCTAssertTrue(failed.staticTexts["Câu này vẫn được tính vào 30 câu hôm nay."].exists)
    let again = app.buttons["chat-again"]
    XCTAssertEqual(again.label, "Hỏi lại · tính thêm 1 câu")
    again.tap()
    XCTAssertTrue(element(app, "chat-wait").waitForExistence(timeout: 5), "not asked again")
    XCTAssertTrue(failed.waitForExistence(timeout: 20), "no failed card the second time")
    XCTAssertEqual(app.staticTexts.matching(identifier: "chat-question").count, 1, "the question posted twice")
  }

  /// Claude unreachable: not counted, "Thử lại".
  func testClaudeUnreachableIsntCounted() {
    let app = launch("-chat-unavailable")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    let failed = element(app, "chat-failed")
    XCTAssertTrue(failed.waitForExistence(timeout: 10), "no card")
    XCTAssertTrue(failed.staticTexts["Chưa liên lạc được Claude. Câu này không bị tính."].exists)
    XCTAssertEqual(app.buttons["chat-again"].label, "Thử lại")
  }

  /// Left mid-answer: back in front, the question is asked again with its key, and its answer comes whole, once.
  func testLeftMidAnswerTheAnswerComesBackOnReturn() {
    let app = launch("-chat-slow")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    XCTAssertTrue(element(app, "chat-wait").waitForExistence(timeout: 5), "no wait")
    XCUIDevice.shared.press(.home)
    sleep(2)
    app.activate()
    XCTAssertTrue(element(app, "chat-answer").waitForExistence(timeout: 10), "no answer on return")
    XCTAssertEqual(app.staticTexts.matching(identifier: "chat-question").count, 1)
  }

  /// Back past the conversation's 24 hours: the answer can't be had; "Hỏi lại" asks it in a new conversation.
  func testAnAnswerLostPast24HoursIsAskedAgain() {
    let app = launch("-chat-slow", "-chat-lost")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    XCTAssertTrue(element(app, "chat-wait").waitForExistence(timeout: 5), "no wait")
    XCUIDevice.shared.press(.home)
    sleep(2)
    app.activate()
    let lost = element(app, "chat-lost")
    XCTAssertTrue(lost.waitForExistence(timeout: 10), "no lost card")
    app.buttons["chat-again"].tap()
    XCTAssertTrue(app.buttons["chat-fold"].waitForExistence(timeout: 40), "not asked again")
    XCTAssertEqual(app.staticTexts.matching(identifier: "chat-question").count, 1)
  }

  /// Past the conversation's questions: the next goes on in a new one, a divider before it; "Bắt đầu cuộc mới" empties
  /// the screen after asking.
  func testAnEndedConversationGoesOnInANewOneAndStartingOverEmptiesIt() {
    let app = launch("-chat-turns", "1")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    XCTAssertTrue(element(app, "chat-answer").waitForExistence(timeout: 15), "no first answer")
    ask(app, "Neon ăn gì?")
    XCTAssertTrue(element(app, "chat-new-conversation").waitForExistence(timeout: 5), "no divider")
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "chat-answer").element(boundBy: 1).waitForExistence(timeout: 15),
                  "no answer in the new conversation")
    app.buttons["chat-new"].tap()
    let start = app.buttons["Bắt đầu cuộc mới"]
    XCTAssertTrue(start.waitForExistence(timeout: 5), "no question before starting over")
    start.tap()
    XCTAssertTrue(app.staticTexts["Hỏi gì về cá neon?"].waitForExistence(timeout: 5), "not empty")
    XCTAssertFalse(app.staticTexts["chat-question"].exists)
  }

  /// No network: said over the box, send off, a starter tapped goes into the box.
  func testOfflineAStarterGoesIntoTheBox() {
    let app = launch("-chat-path-offline")
    openChat(app)
    signIn(app)
    XCTAssertTrue(element(app, "chat-offline").waitForExistence(timeout: 5), "not said offline")
    let starter = app.buttons.matching(identifier: "chat-chip").firstMatch
    let words = starter.label
    starter.tap()
    XCTAssertEqual(element(app, "chat-box").value as? String, words)
    XCTAssertFalse(app.buttons["chat-send"].isEnabled, "send on offline")
    XCTAssertFalse(app.staticTexts["chat-question"].exists)
  }

  /// A long question: counted from 450 characters; past 500, said too long, send off.
  func testPast500CharactersSendIsOff() {
    let app = launch()
    openChat(app)
    signIn(app)
    let box = element(app, "chat-box")
    box.tap()
    box.typeText(String(repeating: "a", count: 501))
    XCTAssertEqual(element(app, "chat-length").label, "501/500")
    XCTAssertTrue(app.staticTexts["Câu hỏi dài quá: rút gọn để gửi."].exists)
    XCTAssertFalse(app.buttons["chat-send"].isEnabled)
  }

  // MARK: Helpers

  private func launch(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fake-accounts", "on",
                           "-reset-fake-server"] + more
    app.launchForFlow()
    return app
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

  /// The neon's page, its chat's entry under its facts.
  private func openChat(_ app: XCUIApplication) {
    open(app, "Ca neon")
    let entry = element(app, "chat-entry")
    reveal(app, entry)
    XCTAssertTrue(entry.label.contains("Hỏi về cá neon"), entry.label)
    entry.tap()
    XCTAssertTrue(element(app, "chat").waitForExistence(timeout: 5), "no chat screen")
  }

  private func open(_ app: XCUIApplication, _ query: String) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText(query)
    let row = app.descendants(matching: .any).matching(identifier: "item").firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "nothing found for \(query)")
    row.tap()
  }

  private func openFishId(_ app: XCUIApplication) {
    let field = app.searchFields.firstMatch
    XCTAssertTrue(field.waitForExistence(timeout: 5), "no search field")
    field.tap()
    field.typeText("nhan dien")
    let row = app.descendants(matching: .any).matching(identifier: "item").matching(NSPredicate(format: "label BEGINSWITH 'Đây là cá gì?'")).firstMatch
    XCTAssertTrue(row.waitForExistence(timeout: 5), "no fish-ID tool")
    row.tap()
  }

  /// From the screen's own sign-in card.
  private func signIn(_ app: XCUIApplication) {
    let apple = element(app, "apple-sign-in")
    XCTAssertTrue(apple.waitForExistence(timeout: 5), "no sign-in on the chat")
    apple.tap()
    XCTAssertTrue(app.buttons.matching(identifier: "chat-chip").firstMatch.waitForExistence(timeout: 10), "still signed out")
  }

  private func ask(_ app: XCUIApplication, _ q: String) {
    let box = element(app, "chat-box")
    XCTAssertTrue(box.waitForExistence(timeout: 5), "no box")
    box.tap()
    box.typeText(q)
    app.buttons["chat-send"].tap()
  }

  private func reveal(_ app: XCUIApplication, _ e: XCUIElement) {
    repeatUntil(e.exists && e.isHittable, times: 12) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.4)), withVelocity: .fast, thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
