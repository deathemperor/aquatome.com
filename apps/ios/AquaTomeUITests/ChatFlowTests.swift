import XCTest

/// The chat screen on the stand-in server (FakeChat: the contract's recorded answers, an event every half second): from a
/// fish's page and from fish ID's result, signed in from the screen; the wait, its steps, the fold and the text as the
/// answer streams; each way a question doesn't go (the day used, offline, too long) leaving it in the box; each way an
/// answer fails, asked again under the same bubble; leaving mid-answer and coming back; a conversation that has ended
/// going on in a new one; a new conversation; stopping a question; the list of past conversations, reopening and hiding
/// them. Hidden while the server says chat is off.
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
    XCTAssertTrue(app.staticTexts["Claude, mô hình AI của Anthropic, trả lời chỉ từ cẩm nang AquaTome. Ảnh không được gửi."].exists)
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

  /// Past the conversation's questions: the next goes on in a new one, a divider before it. The new-conversation button
  /// empties the screen at once, asking nothing, and the one left is offered under the starters. The history button lights
  /// with the first answer.
  func testAnEndedConversationGoesOnInANewOneAndANewConversationStartsAtOnce() {
    let app = launch("-chat-turns", "1")
    openChat(app)
    signIn(app)
    XCTAssertFalse(app.buttons["chat-history"].isEnabled, "the history button lit with nothing to list")
    ask(app, "Neon sống bao lâu?")
    XCTAssertTrue(element(app, "chat-answer").waitForExistence(timeout: 15), "no first answer")
    XCTAssertTrue(app.buttons["chat-history"].isEnabled, "the history button dim with a conversation to list")
    ask(app, "Neon ăn gì?")
    XCTAssertTrue(element(app, "chat-new-conversation").waitForExistence(timeout: 5), "no divider")
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "chat-answer").element(boundBy: 1).waitForExistence(timeout: 15),
                  "no answer in the new conversation")
    app.buttons["chat-new"].tap()
    XCTAssertTrue(app.staticTexts["Hỏi gì về cá neon?"].waitForExistence(timeout: 5), "not empty")
    XCTAssertFalse(app.staticTexts["chat-question"].exists)
    XCTAssertFalse(app.buttons["Bắt đầu cuộc mới"].exists, "asked before starting over")
    let earlier = element(app, "chat-earlier")
    XCTAssertTrue(earlier.waitForExistence(timeout: 5), "the conversation just left isn't offered")
    XCTAssertTrue(earlier.label.contains("Vừa rồi"), earlier.label)
    XCTAssertTrue(earlier.label.contains("Neon sống bao lâu?"), earlier.label)
  }

  // MARK: Stopping

  /// Before the text, the send button is a stop. Stopped: the question gone from the screen and back in the box to edit, said
  /// for a few seconds; asked again, it's a new question and it's answered.
  func testStoppingPutsTheQuestionBackInTheBoxAndItCanBeAskedAgain() {
    let app = launch("-chat-slower")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    let stop = app.buttons["chat-stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 5), "no stop while waiting")
    XCTAssertFalse(app.buttons["chat-send"].exists, "send beside the stop")
    stop.tap()
    let note = element(app, "chat-stopped-note")
    XCTAssertTrue(note.waitForExistence(timeout: 5), "not said stopped")
    XCTAssertEqual(note.label, "Đã dừng. Câu này không bị tính.")
    let box = element(app, "chat-box")
    XCTAssertEqual(box.value as? String, "Neon sống bao lâu?")
    XCTAssertTrue(hasFocus(box), "the box isn't ready for editing")
    XCTAssertTrue(app.staticTexts["Hỏi gì về cá neon?"].waitForExistence(timeout: 5), "no empty screen")
    XCTAssertFalse(app.staticTexts["chat-question"].exists, "the question still on the screen")
    XCTAssertTrue(app.buttons["chat-send"].exists, "no send once stopped")
    XCTAssertFalse(app.buttons["chat-new"].isEnabled, "a new conversation offered with nothing in this one")
    XCTAssertTrue(note.waitForNonExistence(timeout: 10), "still said stopped")
    app.buttons["chat-send"].tap()
    XCTAssertTrue(app.staticTexts["chat-question"].waitForExistence(timeout: 5), "not asked again")
    XCTAssertTrue(app.buttons["chat-fold"].waitForExistence(timeout: 40), "asked again, no answer")
  }

  /// Words typed while it waits stay: the stopped question goes, not back over them.
  func testStoppingWithWordsInTheBoxLeavesThem() {
    let app = launch("-chat-slower")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    let stop = app.buttons["chat-stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 5), "no stop while waiting")
    let box = element(app, "chat-box")
    box.tap()
    box.typeText("Còn")
    stop.tap()
    XCTAssertTrue(element(app, "chat-stopped-note").waitForExistence(timeout: 5), "not said stopped")
    XCTAssertEqual(box.value as? String, "Còn")
    XCTAssertFalse(app.staticTexts["chat-question"].exists, "the question still on the screen")
  }

  /// The first question of a new conversation stopped: its divider goes with it, and the next question brings it back, since
  /// Claude still doesn't have the questions above.
  func testStoppingANewConversationsFirstQuestionTakesItsDividerAndTheNextBringsItBack() {
    let app = launch("-chat-slow", "-chat-turns", "1")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    XCTAssertTrue(element(app, "chat-answer").waitForExistence(timeout: 40), "no first answer")
    ask(app, "Neon ăn gì?")
    let divider = element(app, "chat-new-conversation")
    XCTAssertTrue(divider.waitForExistence(timeout: 5), "no divider")
    app.buttons["chat-stop"].tap()
    XCTAssertTrue(element(app, "chat-stopped-note").waitForExistence(timeout: 5), "not said stopped")
    XCTAssertTrue(divider.waitForNonExistence(timeout: 5), "the divider stayed")
    XCTAssertEqual(element(app, "chat-box").value as? String, "Neon ăn gì?")
    XCTAssertTrue(element(app, "chat-answer").exists, "the answer above went too")
    app.buttons["chat-send"].tap()
    XCTAssertTrue(divider.waitForExistence(timeout: 5), "the divider didn't come back")
  }

  /// A stop too late: said while it's on its way, then nothing else changes, and the answer lands. Once the text begins there
  /// is no stop.
  func testAStopTooLateChangesNothingAndTheStopGoesWhenTheTextBegins() {
    let app = launch("-chat-slow", "-chat-cancel-late")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    let stop = app.buttons["chat-stop"]
    XCTAssertTrue(stop.waitForExistence(timeout: 5), "no stop while waiting")
    stop.tap()
    let stopping = app.descendants(matching: .any).matching(NSPredicate(format: "identifier == 'chat-wait' AND label CONTAINS 'Đang dừng'")).firstMatch
    XCTAssertTrue(stopping.waitForExistence(timeout: 3), "not said stopping")
    let fold = app.buttons["chat-fold"]
    XCTAssertTrue(fold.waitForExistence(timeout: 30), "a stop too late cost the answer")
    XCTAssertFalse(stop.exists, "a stop with the text begun")
    XCTAssertTrue(app.buttons["chat-send"].exists, "no send with the text begun")
    XCTAssertTrue(element(app, "chat-answer").waitForExistence(timeout: 20), "no whole answer")
    XCTAssertFalse(element(app, "chat-stopped-note").exists, "said stopped, too late")
    XCTAssertEqual(app.staticTexts.matching(identifier: "chat-question").count, 1)
  }

  // MARK: Past conversations

  /// The list: dim signed out, under its headings, a page at a time, medium growing to full height, a row and those that
  /// carried it on as one. A tap opens it as it was answered, the sheet goes, and the row then says it's open.
  func testTheListGroupsConversationsAndOpensOne() {
    let app = launch("-chat-history", "-chat-list-page", "2")
    openChat(app)
    XCTAssertTrue(app.buttons["chat-history"].waitForExistence(timeout: 5), "no history button")
    XCTAssertFalse(app.buttons["chat-history"].isEnabled, "the history button lit, signed out")
    signIn(app)
    let rows = openList(app)
    for heading in ["Hôm nay", "Hôm qua", "7 ngày qua", "Trước đó"] {
      XCTAssertTrue(app.staticTexts[heading].waitForExistence(timeout: 5), "no \(heading)")
    }
    XCTAssertEqual(rows.count, 4)
    XCTAssertTrue(row(rows, "Thả bao nhiêu con").label.contains("2 câu"), "a conversation and the one that carried it on aren't one row")
    XCTAssertTrue(row(rows, "Nuôi chung").label.contains("Ảnh của bạn: Cá betta"), row(rows, "Nuôi chung").label)
    XCTAssertTrue(row(rows, "Bể neon").label.contains("Cá neon"), row(rows, "Bể neon").label)
    XCTAssertFalse(row(rows, "Bể neon").label.contains("Đang mở"), "open with another on screen")
    row(rows, "Bể neon").tap()
    let question = app.staticTexts["chat-question"]
    XCTAssertTrue(question.waitForExistence(timeout: 10), "the conversation didn't open")
    XCTAssertTrue(question.label.contains("Bể neon của mình rêu tóc"), question.label)
    XCTAssertTrue(app.navigationBars["Cuộc trò chuyện"].waitForNonExistence(timeout: 5), "the sheet stayed")
    XCTAssertTrue(element(app, "chat-answer").waitForExistence(timeout: 5), "not as it was answered")
    let at = element(app, "chat-asked-at")
    XCTAssertTrue(at.waitForExistence(timeout: 5), "no time above it")
    XCTAssertTrue(at.label.hasPrefix("Hôm qua, "), at.label)
    XCTAssertFalse(element(app, "chat-earlier").exists, "offered while it's on screen")
    XCTAssertTrue(row(openList(app), "Bể neon").label.contains("Đang mở"), "doesn't say it's open")
  }

  /// A fish's page whose latest conversation is still open reopens it, and the next question goes on in it: no divider, and
  /// one row with one more question.
  func testAnOpenConversationAboutThisFishReopensAndGoesOnInIt() {
    let app = launch("-chat-history", "-chat-history-open")
    openChat(app)
    signIn(app)
    let question = app.staticTexts["chat-question"]
    XCTAssertTrue(question.waitForExistence(timeout: 10), "not reopened")
    XCTAssertTrue(question.label.contains("Bể neon của mình rêu tóc"), question.label)
    ask(app, "Neon ăn gì?")
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "chat-answer").element(boundBy: 1).waitForExistence(timeout: 20), "no answer")
    XCTAssertFalse(element(app, "chat-new-conversation").exists, "went on in a new one")
    let rows = openList(app)
    XCTAssertEqual(rows.count, 4, "another row")
    XCTAssertTrue(row(rows, "Bể neon").label.contains("2 câu"), row(rows, "Bể neon").label)
  }

  /// One that has ended is offered under the starters. Opened and asked again, it goes on in a new one, a divider above, and
  /// the list keeps one row.
  func testAnEndedConversationOfferedOnAFishsPageGoesOnInItsRow() {
    let app = launch("-chat-history")
    openChat(app)
    signIn(app)
    let earlier = element(app, "chat-earlier")
    XCTAssertTrue(earlier.waitForExistence(timeout: 5), "not offered")
    XCTAssertFalse(app.staticTexts["chat-question"].exists, "an ended conversation reopened by itself")
    XCTAssertTrue(earlier.label.contains("Cuộc trước về cá neon"), earlier.label)
    XCTAssertTrue(earlier.label.contains("Hôm qua"), earlier.label)
    earlier.tap()
    XCTAssertTrue(app.staticTexts["chat-question"].waitForExistence(timeout: 10), "not opened")
    ask(app, "Neon ăn gì?")
    XCTAssertTrue(element(app, "chat-new-conversation").waitForExistence(timeout: 5), "no divider")
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "chat-answer").element(boundBy: 1).waitForExistence(timeout: 20), "no answer")
    let rows = openList(app)
    XCTAssertEqual(rows.count, 4, "another row")
    XCTAssertTrue(row(rows, "Bể neon").label.contains("2 câu"), row(rows, "Bể neon").label)
  }

  /// A swipe says "Ẩn" and asks first, saying nothing is deleted; hidden, the row goes. The conversation on screen has no
  /// swipe. The one offered under the starters goes when it's hidden.
  func testHidingARowAsksFirstAndTheOneOnScreenHasNoSwipe() {
    let app = launch("-chat-history")
    openChat(app)
    signIn(app)
    XCTAssertTrue(element(app, "chat-earlier").waitForExistence(timeout: 5), "not offered")
    let rows = openList(app)
    row(rows, "Bể neon").swipeLeft()
    let hide = app.buttons["Ẩn"]
    XCTAssertTrue(hide.waitForExistence(timeout: 5), "no Ẩn on a swipe")
    hide.tap()
    XCTAssertTrue(app.staticTexts["Ẩn cuộc trò chuyện này?"].waitForExistence(timeout: 5), "not asked first")
    XCTAssertTrue(app.staticTexts["Chỉ ẩn khỏi danh sách của bạn, không bị xóa. Xóa tài khoản sẽ xóa toàn bộ."].exists, "doesn't say nothing is deleted")
    XCTAssertTrue(app.buttons["Hủy"].exists, "no way back")
    XCTAssertFalse(app.buttons["Xóa"].exists, "says delete")
    app.buttons.matching(NSPredicate(format: "label == 'Ẩn'")).allElementsBoundByIndex.last?.tap()
    XCTAssertTrue(row(rows, "Bể neon").waitForNonExistence(timeout: 5), "the row stayed")
    XCTAssertEqual(rows.count, 3)
    // The one being read has no swipe.
    row(rows, "Cá betta nhà mình").tap()
    XCTAssertTrue(app.staticTexts["chat-question"].waitForExistence(timeout: 10), "not opened")
    XCTAssertTrue(app.navigationBars["Cuộc trò chuyện"].waitForNonExistence(timeout: 5), "the sheet stayed")
    let again = openList(app)
    row(again, "Cá betta nhà mình").swipeLeft()
    XCTAssertFalse(app.buttons["Ẩn"].waitForExistence(timeout: 2), "the conversation on screen can be hidden")
    app.buttons["chat-history-close"].tap()
    XCTAssertTrue(app.navigationBars["Cuộc trò chuyện"].waitForNonExistence(timeout: 5), "the sheet stayed")
  }

  /// Hidden on another device: the next question goes on in a new conversation under a divider, a row of its own.
  func testAConversationHiddenOnAnotherDeviceGoesOnInOneOfItsOwn() {
    let app = launch("-chat-hidden-elsewhere")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    XCTAssertTrue(element(app, "chat-answer").waitForExistence(timeout: 15), "no first answer")
    ask(app, "Neon ăn gì?")
    XCTAssertTrue(element(app, "chat-new-conversation").waitForExistence(timeout: 5), "no divider")
    XCTAssertTrue(app.descendants(matching: .any).matching(identifier: "chat-answer").element(boundBy: 1).waitForExistence(timeout: 15), "no answer")
    let rows = openList(app)
    XCTAssertEqual(rows.count, 1, "the hidden conversation is back")
    XCTAssertTrue(rows.firstMatch.label.contains("Neon ăn gì?"), rows.firstMatch.label)
    XCTAssertTrue(rows.firstMatch.label.contains("1 câu"), rows.firstMatch.label)
  }

  /// Fish ID's chat always starts fresh, whatever was asked about that fish before.
  func testFishIDsChatStartsFreshWhateverIsKept() {
    let app = launch("-picked-photo", "-chat-history", "-chat-history-open")
    openFishId(app)
    let apple = element(app, "apple-sign-in")
    XCTAssertTrue(apple.waitForExistence(timeout: 5), "no sign-in")
    apple.tap()
    let send = element(app, "fish-id-send")
    reveal(app, send)
    send.tap()
    let entry = element(app, "chat-entry")
    reveal(app, entry)
    entry.tap()
    XCTAssertTrue(element(app, "chat-about").waitForExistence(timeout: 5), "no chat")
    XCTAssertTrue(app.buttons["chat-history"].waitForExistence(timeout: 5), "no history button")
    let enabled = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == true"), object: app.buttons["chat-history"])
    XCTAssertEqual(XCTWaiter().wait(for: [enabled], timeout: 10), .completed, "the list isn't there to open")
    XCTAssertFalse(app.staticTexts["chat-question"].exists, "reopened a conversation")
    XCTAssertFalse(element(app, "chat-earlier").exists, "offered an earlier conversation")
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

  /// The list opened at full height, its pages all read: the rows.
  private func openList(_ app: XCUIApplication) -> XCUIElementQuery {
    let history = app.buttons["chat-history"]
    let lit = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isEnabled == true"), object: history)
    XCTAssertEqual(XCTWaiter().wait(for: [lit], timeout: 10), .completed, "the history button is dim")
    history.tap()
    let bar = app.navigationBars["Cuộc trò chuyện"]
    XCTAssertTrue(bar.waitForExistence(timeout: 5), "no list")
    let rows = app.buttons.matching(identifier: "chat-row")
    XCTAssertTrue(rows.firstMatch.waitForExistence(timeout: 10), "no rows")
    bar.swipeUp()
    sleep(1)
    return rows
  }

  /// The row whose text holds these words.
  private func row(_ rows: XCUIElementQuery, _ words: String) -> XCUIElement {
    rows.matching(NSPredicate(format: "label CONTAINS %@", words)).firstMatch
  }

  private func hasFocus(_ e: XCUIElement) -> Bool {
    let typing = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hasKeyboardFocus == true"), object: e)
    return XCTWaiter().wait(for: [typing], timeout: 5) == .completed
  }

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
