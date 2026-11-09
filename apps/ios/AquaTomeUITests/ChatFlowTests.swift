import UIKit
import XCTest

/// The chat screen on the stand-in server (FakeChat: the contract's recorded answers, an event every half second): from a
/// fish's page and from fish ID's result, signed in from the screen; the wait, its steps, the fold and the text as the
/// answer streams; each way a question doesn't go (the day used, offline, too long) leaving it in the box; each way an
/// answer fails, asked again under the same bubble; leaving mid-answer and coming back; a conversation that has ended
/// going on in a new one; starting over; the blocks under an answer. Hidden while the server says chat is off.
final class ChatFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// From a fish's page: signed in on the screen, a starter asked; the wait and its steps, then the steps folded into the
  /// pages read, the text, and the next questions.
  func testAFishsPageAsksAndTheAnswerComesInAfterItsSteps() {
    // An event every 3 s: the wait and its steps stay long enough to be seen.
    let app = launch("-chat-slow")
    openChat(app)
    XCTAssertTrue(element(app, "chat-about").label.contains("Về: Cá neon"), element(app, "chat-about").label)
    XCTAssertTrue(element(app, "chat-about").label.contains("Paracheirodon innesi"), "no Latin name: \(element(app, "chat-about").label)")
    XCTAssertFalse(app.tabBars.firstMatch.isHittable, "the tab bar on the chat")
    XCTAssertTrue(app.staticTexts["Hỏi gì về cá neon?"].exists, "no empty screen's question")
    // No answer on this phone yet: who answers, in full.
    XCTAssertTrue(app.staticTexts["Claude (AI của Anthropic) trả lời theo cẩm nang AquaTome, chỗ nào cẩm nang chưa nói đến thì dùng kiến thức chung về nuôi cá."].exists, "not the whole line about who answers")
    signIn(app)
    let starter = app.buttons.matching(identifier: "chat-chip").firstMatch
    XCTAssertTrue(starter.waitForExistence(timeout: 5), "no starters after signing in")
    // One to a row, down the left.
    let starters = app.buttons.matching(identifier: "chat-chip")
    XCTAssertEqual(starters.count, 3)
    XCTAssertEqual(starters.element(boundBy: 0).frame.minX, starters.element(boundBy: 1).frame.minX, accuracy: 1, "the starters not down the left")
    XCTAssertGreaterThan(starters.element(boundBy: 1).frame.minY, starters.element(boundBy: 0).frame.maxY, "two starters on a row")
    let asked = starter.label
    starter.tap()
    XCTAssertTrue(app.staticTexts["chat-question"].waitForExistence(timeout: 5), "no question's bubble")
    XCTAssertEqual(app.staticTexts["chat-question"].label, "Bạn hỏi: \(asked)")
    XCTAssertTrue(element(app, "chat-wait").waitForExistence(timeout: 5), "no wait")
    XCTAssertTrue(app.staticTexts["Thường mất chưa tới nửa phút."].exists, "no wait's line under the box")
    XCTAssertTrue(element(app, "chat-step").waitForExistence(timeout: 5), "no step while waiting")
    // The text starts: the steps fold into the pages read; the wait goes.
    let fold = app.buttons["chat-fold"]
    XCTAssertTrue(fold.waitForExistence(timeout: 20), "the steps didn't fold")
    XCTAssertTrue(fold.label.contains("Đã đọc 2 trang trong cẩm nang"), fold.label)
    XCTAssertFalse(element(app, "chat-wait").exists, "still waiting with the text in")
    // No piece for 0.3 s before done: the spinner, with no words, under the last line; gone once the answer is whole.
    XCTAssertTrue(element(app, "chat-pause").waitForExistence(timeout: 5), "no spinner while nothing comes")
    let answer = element(app, "chat-answer")
    XCTAssertTrue(answer.waitForExistence(timeout: 20), "no whole answer")
    XCTAssertFalse(element(app, "chat-pause").exists, "the spinner stayed under the whole answer")
    XCTAssertTrue(answer.staticTexts.firstMatch.label.hasPrefix("Cá neon xanh dễ nuôi"), answer.staticTexts.firstMatch.label)
    XCTAssertTrue(app.buttons.matching(identifier: "chat-chip").firstMatch.waitForExistence(timeout: 5), "no next questions")
    // The fold opened lists the steps again, a page read opening that page.
    fold.tap()
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label == 'Đã đọc Cá neon xanh'")).firstMatch.waitForExistence(timeout: 5),
                  "the fold doesn't list the pages read")
    XCTAssertEqual(app.staticTexts.matching(identifier: "chat-question").count, 1)
  }

  /// The largest text, the keyboard up for a draft while waiting: as the first words come, the question goes back under
  /// the bar, as with the keyboard down, and the draft stays in the box.
  func testAtTheLargestTextTheFirstWordsPinTheQuestionWithTheKeyboardUp() {
    let app = launch("-chat-slow", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    XCTAssertTrue(element(app, "chat-wait").waitForExistence(timeout: 10), "no wait")
    let box = element(app, "chat-box")
    box.tap()
    box.typeText("Còn tép")
    XCTAssertTrue(app.buttons["chat-fold"].waitForExistence(timeout: 30), "the text didn't start")
    let bar = app.navigationBars.firstMatch, bubble = app.staticTexts["chat-question"]
    let pinned = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in abs(bubble.frame.minY - bar.frame.maxY) < 44 }, object: nil)
    XCTAssertEqual(XCTWaiter().wait(for: [pinned], timeout: 3), .completed,
                   "the question isn't under the bar: its top at \(bubble.frame.minY), the bar's end at \(bar.frame.maxY)")
    XCTAssertEqual(box.value as? String, "Còn tép", "the draft left the box")
  }

  /// A long question shows its first six lines in the bubble, and "Xem thêm" under it opens it whole.
  func testALongQuestionShowsSixLinesAndXemThemOpensItWhole() {
    let app = launch()
    openChat(app)
    signIn(app)
    ask(app, String(repeating: "Bể neon của mình bị rêu tóc mọc kín, ", count: 10))
    let bubble = app.staticTexts["chat-question"], more = app.buttons["chat-more"]
    XCTAssertTrue(more.waitForExistence(timeout: 5), "no Xem thêm under a long question")
    let cut = bubble.frame.height
    more.tap()
    XCTAssertTrue(more.waitForNonExistence(timeout: 5), "Xem thêm stayed")
    XCTAssertGreaterThan(bubble.frame.height, cut * 1.5, "not opened whole")
    // Opened, it stays open as the thread goes on: the next question doesn't make its turn a new view.
    XCTAssertTrue(app.buttons.matching(identifier: "chat-chip").firstMatch.waitForExistence(timeout: 15), "no answer")
    ask(app, "Neon ăn gì?")
    XCTAssertTrue(soon(app.staticTexts.matching(identifier: "chat-question").count == 2), "the next question not asked")
    XCTAssertGreaterThan(app.staticTexts.matching(identifier: "chat-question").element(boundBy: 0).frame.height, cut * 1.5,
                         "closed again by the next question")
    XCTAssertFalse(more.exists, "Xem thêm back under the question opened whole")
  }

  /// Long-pressed, the reader's question offers "Sao chép", which copies it as asked, and "Sửa và hỏi lại", which puts it
  /// back in the box above the words there, keyboard up; nothing is edited in place.
  func testALongPressedQuestionIsCopiedOrPutBackInTheBox() {
    let app = launch()
    openChat(app)
    signIn(app)
    let q = "Neon sống bao lâu?"
    ask(app, q)
    XCTAssertTrue(app.buttons.matching(identifier: "chat-chip").firstMatch.waitForExistence(timeout: 15), "no whole answer")
    let bubble = app.staticTexts["chat-question"], box = element(app, "chat-box")
    bubble.press(forDuration: 1)
    XCTAssertTrue(app.buttons["Sửa và hỏi lại"].waitForExistence(timeout: 5), "no Sửa và hỏi lại")
    app.buttons["Sao chép"].tap()
    // Pasted into the empty box from its own menu: what was copied.
    box.press(forDuration: 1.2)
    let paste = app.menuItems["Dán"]
    XCTAssertTrue(paste.waitForExistence(timeout: 5), "no Dán in the box's menu")
    paste.tap()
    XCTAssertTrue(soon(box.value as? String == q), "not copied as asked: \(box.value ?? "")")
    // A drag down on the conversation, into the keyboard, lowers it (a flick doesn't reach it).
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.3))
      .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.97)), withVelocity: .slow, thenHoldForDuration: 0.1)
    XCTAssertTrue(app.keyboards.firstMatch.waitForNonExistence(timeout: 5), "the keyboard stayed")
    bubble.press(forDuration: 1)
    let edit = app.buttons["Sửa và hỏi lại"]
    XCTAssertTrue(edit.waitForExistence(timeout: 5), "no Sửa và hỏi lại")
    edit.tap()
    XCTAssertTrue(soon(box.value as? String == q + "\n" + q), "not above the words in the box: \(box.value ?? "")")
    XCTAssertTrue(app.keyboards.firstMatch.waitForExistence(timeout: 5), "the keyboard didn't rise")
    XCTAssertEqual(app.staticTexts.matching(identifier: "chat-question").count, 1, "edited in place, or asked again")
    XCTAssertTrue(element(app, "chat-answer").exists, "the answer above went")
  }

  /// Typing on the empty screen: at the first letter the starters fade, and they come back when the box is empty; the
  /// line about who answers stays.
  func testTypingOnTheEmptyScreenTheStartersFade() {
    let app = launch()
    openChat(app)
    signIn(app)
    let box = element(app, "chat-box"), starter = app.buttons.matching(identifier: "chat-chip").firstMatch
    box.tap()
    box.typeText("N")
    XCTAssertTrue(starter.waitForNonExistence(timeout: 5), "the starters stayed with a letter typed")
    XCTAssertTrue(app.staticTexts["Claude (AI của Anthropic) trả lời theo cẩm nang AquaTome, chỗ nào cẩm nang chưa nói đến thì dùng kiến thức chung về nuôi cá."].exists, "the line about who answers went")
    box.typeText(XCUIKeyboardKey.delete.rawValue)
    XCTAssertTrue(starter.waitForExistence(timeout: 5), "the starters didn't come back with the box empty")
  }

  /// Up in earlier turns, the newest question below the box: a small round ↓ brings the end back. Never while the newest
  /// question or its answer is on screen.
  func testUpInEarlierTurnsARoundArrowBringsTheEndBack() {
    let app = launch()
    openChat(app)
    signIn(app)
    // A long first question, opened whole: the turns above the newest are taller than the screen.
    ask(app, String(repeating: "Bể neon của mình bị rêu tóc mọc kín, ", count: 10))
    XCTAssertTrue(app.buttons.matching(identifier: "chat-chip").firstMatch.waitForExistence(timeout: 15), "no first answer")
    let more = app.buttons["chat-more"]
    reveal(app, more)
    more.tap()
    // Two turns above the newest: one, even opened, sat above the box with the view at the top.
    ask(app, "Neon ăn gì?")
    let answers = app.descendants(matching: .any).matching(identifier: "chat-answer")
    XCTAssertTrue(answers.element(boundBy: 1).waitForExistence(timeout: 15), "no second answer")
    XCTAssertTrue(soon(app.buttons.matching(identifier: "chat-chip").firstMatch.exists, timeout: 15), "the second answer not whole")
    ask(app, "Neon sống bao lâu?")
    let second = answers.element(boundBy: 2)
    XCTAssertTrue(second.waitForExistence(timeout: 15), "no third answer")
    let toEnd = app.buttons["chat-to-end"]
    XCTAssertFalse(toEnd.exists, "a ↓ with the newest question on screen")
    repeatUntil(toEnd.exists, times: 4) { element(app, "chat").swipeDown() }
    let questions = app.staticTexts.matching(identifier: "chat-question")
    XCTAssertTrue(toEnd.exists, "no ↓ up in the earlier turns: the newest question at \(questions.element(boundBy: 2).frame), the box at "
                  + "\(element(app, "chat-box").frame), the first question \(questions.element(boundBy: 0).frame.height) high")
    XCTAssertEqual(toEnd.label, "Xuống cuối cuộc trò chuyện")
    toEnd.tap()
    XCTAssertTrue(toEnd.waitForNonExistence(timeout: 5), "the ↓ stayed at the end")
    XCTAssertTrue(soon(second.isHittable), "not back at the end")
  }

  /// Off on the server: no way into the chat from a fish's page.
  func testWhileChatIsOffNoEntryShows() {
    let app = launch("-chat-off")
    open(app, "Ca neon")
    XCTAssertTrue(element(app, "native-page").waitForExistence(timeout: 10), "no page")
    reveal(app, app.buttons["put-on-tank"])
    XCTAssertFalse(element(app, "chat-entry").exists, "the chat's entry on a page while it's off")
  }

  /// On for the owner alone: GET says so only to the owner's session. The app asks as the account, and again as the
  /// reader signs in, so a page's entry shows once they have (signed in from the Tài khoản sheet, no relaunch).
  func testOnForTheOwnerAloneTheEntryShowsOnceSignedIn() {
    let app = launch("-chat-owner-only")
    open(app, "Ca neon")
    XCTAssertTrue(element(app, "native-page").waitForExistence(timeout: 10), "no page")
    reveal(app, app.buttons["put-on-tank"])
    XCTAssertFalse(element(app, "chat-entry").exists, "the chat's entry signed out")
    app.navigationBars.buttons.element(boundBy: 0).tap()
    // Out of the search, where the bar shows the profile button again.
    for word in ["Đóng", "Hủy"] where app.buttons[word].firstMatch.waitForExistence(timeout: 2) { app.buttons[word].firstMatch.tap() }
    app.openAccount()
    let apple = element(app, "apple-sign-in")
    reveal(app, apple)
    apple.tap()
    XCTAssertTrue(apple.waitForNonExistence(timeout: 10), "still signed out")
    app.closeAccount()
    open(app, "Ca neon")
    let entry = element(app, "chat-entry")
    reveal(app, entry)
    XCTAssertTrue(entry.exists, "no entry once signed in")
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
    // By its label: XCUITest refuses an identifier query this long.
    let line = "Claude (AI của Anthropic) trả lời theo cẩm nang AquaTome, chỗ nào cẩm nang chưa nói đến thì dùng kiến thức chung về nuôi cá. AquaTome không gửi ảnh của bạn kèm câu hỏi."
    XCTAssertTrue(app.staticTexts.matching(NSPredicate(format: "label == %@", line)).firstMatch.exists, "not the line about who answers, with the photo")
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
    XCTAssertTrue(failed.staticTexts["Không nhận được câu trả lời"].exists)
    XCTAssertTrue(failed.staticTexts["Câu này vẫn bị tính vào 30 câu hôm nay."].exists)
    let again = app.buttons["chat-again"]
    XCTAssertEqual(again.label, "Hỏi lại · tính thêm 1 câu")
    again.tap()
    XCTAssertTrue(element(app, "chat-wait").waitForExistence(timeout: 5), "not asked again")
    XCTAssertTrue(failed.waitForExistence(timeout: 20), "no failed card the second time")
    XCTAssertEqual(app.staticTexts.matching(identifier: "chat-question").count, 1, "the question posted twice")
  }

  /// An answer cut off after its text began: what was read stays, a card under it says it isn't counted, and "Hỏi lại"
  /// asks again under the same bubble, the text gone and the wait back.
  func testAnAnswerCutOffAfterItsTextBeganKeepsItAndIsntCounted() {
    let app = launch("-chat-cut-off")
    openChat(app)
    signIn(app)
    ask(app, "Neon sống bao lâu?")
    let card = element(app, "chat-cut-off")
    XCTAssertTrue(card.waitForExistence(timeout: 20), "no cut-off card")
    XCTAssertTrue(card.staticTexts["Câu trả lời bị ngắt giữa chừng"].exists)
    XCTAssertTrue(card.staticTexts["Câu hỏi này không bị tính."].exists)
    XCTAssertTrue(element(app, "chat-answer").exists, "what was read went")
    // The app closed and opened again, still signed in: the text and its card as they were, not a counted failure.
    app.terminate()
    app.launchArguments.removeAll { $0 == "-reset-defaults" || $0 == "-reset-fake-server" }
    app.launchForFlow()
    openChat(app)
    XCTAssertTrue(card.waitForExistence(timeout: 10), "back as a counted failure")
    XCTAssertTrue(card.staticTexts["Câu hỏi này không bị tính."].exists, "back as counted")
    XCTAssertTrue(element(app, "chat-answer").exists, "what was read went with the app")
    let again = app.buttons["chat-again"]
    XCTAssertEqual(again.label, "Hỏi lại")
    again.tap()
    XCTAssertTrue(element(app, "chat-wait").waitForExistence(timeout: 5), "not asked again")
    XCTAssertFalse(element(app, "chat-answer").exists, "the cut-off text stayed while asking again")
    XCTAssertTrue(card.waitForExistence(timeout: 20), "no card the second time")
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
    XCTAssertTrue(failed.staticTexts["Chưa kết nối được với Claude. Câu này không bị tính."].exists)
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
    // This phone has had an answer: only that Claude, an AI, answers from the handbook.
    XCTAssertTrue(app.staticTexts["Claude\u{00A0}(AI) trả lời theo cẩm nang AquaTome."].exists, "not the short line after an answer")
    XCTAssertFalse(app.staticTexts["Claude (AI của Anthropic) trả lời theo cẩm nang AquaTome, chỗ nào cẩm nang chưa nói đến thì dùng kiến thức chung về nuôi cá."].exists, "still the whole line after an answer")
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
    XCTAssertTrue(app.staticTexts["Câu hỏi đã quá 500 ký tự. Rút gọn rồi gửi nhé."].exists)
    XCTAssertFalse(app.buttons["chat-send"].isEnabled)
  }

  /// Counted in characters as the reader sees them, as the box and the Worker count: 300 fish (600 UTF-16 units) under
  /// a limit of 500 go when sent.
  func testAQuestionUnderTheLimitAsTheReaderCountsItGoes() {
    let app = launch()
    openChat(app)
    signIn(app)
    UIPasteboard.general.string = String(repeating: "🐟", count: 300)
    let box = element(app, "chat-box")
    box.press(forDuration: 1.2)
    let paste = app.menuItems["Dán"]
    XCTAssertTrue(paste.waitForExistence(timeout: 5), "no Dán in the box's menu")
    paste.tap()
    let send = app.buttons["chat-send"]
    XCTAssertTrue(soon(send.isEnabled), "send off under the limit")
    send.tap()
    XCTAssertTrue(app.staticTexts["chat-question"].waitForExistence(timeout: 5), "sent, and nothing went")
  }

  /// A Worker that takes less than its status said: the question it refused as too long back in the box, which says its
  /// limit (grouped as Vietnamese writes a number) with send off.
  func testAQuestionTheWorkerFindsTooLongGoesBackInTheBoxWithItsLimit() {
    let app = launch("-chat-max", "1500", "-chat-refuses-over", "1000")
    openChat(app)
    signIn(app)
    let box = element(app, "chat-box")
    box.tap()
    let words = String(repeating: "a", count: 1001)
    box.typeText(words)
    XCTAssertFalse(app.staticTexts["Câu hỏi đã quá 1.500 ký tự. Rút gọn rồi gửi nhé."].exists, "said too long at the status's limit")
    app.buttons["chat-send"].tap()
    XCTAssertTrue(app.staticTexts["Câu hỏi đã quá 1.000 ký tự. Rút gọn rồi gửi nhé."].waitForExistence(timeout: 5),
                  "the Worker's limit not said")
    XCTAssertEqual(box.value as? String, words, "the question didn't come back to the box")
    XCTAssertFalse(app.staticTexts["chat-question"].exists, "the refused question stayed as a bubble")
    XCTAssertFalse(app.buttons["chat-send"].isEnabled)
  }

  // MARK: The wait's first line

  /// The first line leads the wait's box, above its step, "Đang soạn câu trả lời…" last; as the text comes it folds with the
  /// steps, and their row opened lists it first.
  func testTheFirstLineLeadsTheWaitAndFoldsWithTheSteps() {
    let app = launch("-chat-opening", "-chat-slow")
    openChat(app)
    signIn(app)
    ask(app, "Nuôi cá neon theo đàn thế nào?")
    let line = element(app, "chat-opening")
    XCTAssertTrue(line.waitForExistence(timeout: 10), "no first line while it waits")
    XCTAssertEqual(line.label, "Mình đang tra cẩm nang về cách nuôi cá neon xanh theo đàn cho bạn.")
    let step = element(app, "chat-step"), wait = element(app, "chat-wait")
    XCTAssertTrue(step.waitForExistence(timeout: 10), "no step")
    XCTAssertLessThan(line.frame.minY, step.frame.minY, "the line not above the step")
    XCTAssertLessThan(step.frame.minY, wait.frame.minY, "the wait not last")
    let fold = app.buttons["chat-fold"]
    XCTAssertTrue(fold.waitForExistence(timeout: 20), "the steps didn't fold")
    XCTAssertTrue(line.waitForNonExistence(timeout: 5), "the line stayed with the text in")
    XCTAssertTrue(app.buttons.matching(identifier: "chat-chip").firstMatch.waitForExistence(timeout: 20), "no whole answer")
    fold.tap()
    XCTAssertTrue(line.waitForExistence(timeout: 5), "the opened row doesn't list the line")
    let read = app.buttons.matching(NSPredicate(format: "label == 'Đã đọc Cá neon xanh'")).firstMatch
    XCTAssertTrue(read.exists, "the opened row doesn't list the step")
    XCTAssertLessThan(line.frame.minY, read.frame.minY, "the line not first in the opened row")
  }

  /// An answer that turned out off topic: `done` without the line takes it away; the opened row doesn't list it.
  func testDoneWithoutTheFirstLineTakesItAway() {
    let app = launch("-chat-opening-dropped")
    openChat(app)
    signIn(app)
    ask(app, "Nuôi cá neon theo đàn thế nào?")
    XCTAssertTrue(element(app, "chat-opening").waitForExistence(timeout: 10), "no first line while it waits")
    XCTAssertTrue(app.buttons.matching(identifier: "chat-chip").firstMatch.waitForExistence(timeout: 20), "no whole answer")
    app.buttons["chat-fold"].tap()
    XCTAssertTrue(app.buttons.matching(NSPredicate(format: "label == 'Đã đọc Cá neon xanh'")).firstMatch.waitForExistence(timeout: 5), "not opened")
    XCTAssertFalse(element(app, "chat-opening").exists, "the line kept though done took it back")
  }

  /// A break after the first line, before any text: the cut-off card, not counted.
  func testABreakAfterTheFirstLineIsCutOffAndIsntCounted() {
    let app = launch("-chat-opening-cut")
    openChat(app)
    signIn(app)
    ask(app, "Nuôi cá neon theo đàn thế nào?")
    let card = element(app, "chat-cut-off")
    XCTAssertTrue(card.waitForExistence(timeout: 20), "no cut-off card")
    XCTAssertTrue(card.staticTexts["Câu hỏi này không bị tính."].exists, "counted")
    XCTAssertFalse(element(app, "chat-answer").exists, "an answer with no text")
    XCTAssertTrue(app.buttons["chat-fold"].exists, "the box didn't fold into its row")
  }

  // MARK: The blocks

  /// A species' card: "Xem trang" opens its page, "Thêm vào bể" puts it on a tank. The chat's own fish has a thumbnail where
  /// another has its whole photo.
  func testASpeciesCardOpensItsPageAndPutsItOnATank() {
    let app = launch("-chat-blocks", "-seed-tanks", "litres")
    answerWithEveryBlock(app)
    let cards = app.descendants(matching: .any).matching(identifier: "chat-card")
    XCTAssertTrue(cards.firstMatch.waitForExistence(timeout: 5), "no card")
    // Top to bottom: `reveal` only scrolls down.
    let open = app.buttons.matching(identifier: "chat-card-open").element(boundBy: 0)
    reveal(app, open)
    open.tap()
    let page = element(app, "native-page")
    XCTAssertTrue(page.waitForExistence(timeout: 10), "no page")
    XCTAssertTrue(page.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch.exists, "not the card's page")
    app.navigationBars.buttons.firstMatch.tap()
    let put = app.buttons.matching(identifier: "chat-card-put").element(boundBy: 1)
    reveal(app, put)
    XCTAssertGreaterThan(cards.element(boundBy: 1).frame.height - cards.element(boundBy: 0).frame.height, 100, "the page's own fish has its whole photo again")
    put.tap()
    XCTAssertTrue(app.navigationBars["Cá đĩa"].waitForExistence(timeout: 5), "not putting the card's fish")
    XCTAssertTrue(app.buttons["put-save"].exists, "can't save")
  }

  /// A card long-pressed: "Mở" opens its page, "Chia sẻ" shares it; a section's too.
  func testALongPressedCardOpensOrSharesItsPage() {
    let app = launch("-chat-blocks")
    answerWithEveryBlock(app)
    let card = app.descendants(matching: .any).matching(identifier: "chat-card").firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 5), "no card")
    reveal(app, card)
    card.press(forDuration: 1)
    XCTAssertTrue(app.buttons["Chia sẻ"].waitForExistence(timeout: 5), "no Chia sẻ")
    app.buttons["Mở"].tap()
    let page = element(app, "native-page")
    XCTAssertTrue(page.waitForExistence(timeout: 10), "no page")
    XCTAssertTrue(page.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch.exists, "not the card's page")
    app.navigationBars.buttons.firstMatch.tap()
    let section = app.descendants(matching: .any).matching(identifier: "chat-section").firstMatch
    reveal(app, section)
    section.press(forDuration: 1)
    XCTAssertTrue(app.buttons["Mở"].waitForExistence(timeout: 5), "no Mở on a section")
    XCTAssertTrue(app.buttons["Chia sẻ"].exists, "no Chia sẻ on a section")
  }

  /// A comparison: a row whose figures differ says so, the one that alone differs named over "the others", a missing figure
  /// said to be missing and never a difference; a fish's name opens its page, one with no page is only its name.
  func testAComparisonMarksTheRowsThatDifferAndOpensAPage() {
    let app = launch("-chat-blocks")
    answerWithEveryBlock(app)
    let compare = element(app, "chat-compare")
    XCTAssertTrue(compare.waitForExistence(timeout: 5), "no comparison")
    let differs = compare.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Bể tối thiểu, khác:'")).firstMatch
    reveal(app, differs)
    XCTAssertTrue(differs.label.contains("Cá đĩa 120 cm"), differs.label)
    XCTAssertTrue(differs.label.contains("hai loài kia 60 cm"), differs.label)
    XCTAssertTrue(differs.label.contains("Cá lạ chưa có"), differs.label)
    XCTAssertTrue(compare.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Nhiệt độ:'")).firstMatch.exists,
                  "the same figures said to differ, or a missing one counted")
    XCTAssertFalse(compare.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Cá lạ'")).firstMatch.exists, "a button to no page")
    let name = compare.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Cá neon'")).firstMatch
    reveal(app, name)
    name.tap()
    XCTAssertTrue(element(app, "native-page").waitForExistence(timeout: 10), "the name didn't open its page")
  }

  /// A section: tapped, it opens in place, with what's left and "Thu gọn"; "Đọc tiếp" opens the page at its heading.
  func testASectionOpensInPlaceAndItsLinkOpensThePageAtItsHeading() {
    let app = launch("-chat-blocks")
    answerWithEveryBlock(app)
    let link = app.buttons.matching(identifier: "chat-section-open").element(boundBy: 0)
    XCTAssertTrue(link.waitForExistence(timeout: 5), "no section")
    reveal(app, link)
    XCTAssertTrue(link.label.contains("Đọc tiếp trong “Nuôi cá neon trong bể nhỏ”"), link.label)
    XCTAssertFalse(app.buttons["Thu gọn"].exists, "open already")
    element(app, "chat-section").coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
    let close = app.buttons["Thu gọn"]
    XCTAssertTrue(close.waitForExistence(timeout: 5), "didn't open")
    let left = app.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'còn tiếp:'")).firstMatch
    XCTAssertTrue(left.waitForExistence(timeout: 5), "doesn't say what's left")
    XCTAssertTrue(left.label.contains("bước") && left.label.contains("1 đoạn"), left.label)
    reveal(app, close)
    close.tap()
    XCTAssertTrue(close.waitForNonExistence(timeout: 5), "didn't close")
    reveal(app, link)
    link.tap()
    let page = element(app, "native-page")
    XCTAssertTrue(page.waitForExistence(timeout: 10), "no page")
    let heading = page.descendants(matching: .any).matching(NSPredicate(format: "label == 'Cho ăn'")).firstMatch
    let there = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isHittable == true"), object: heading)
    XCTAssertEqual(XCTWaiter().wait(for: [there], timeout: 5), .completed, "not at the heading")
    XCTAssertLessThan(heading.frame.minY, app.frame.height * 0.35, "the page didn't open at the heading")
  }

  /// A short section has nothing to open; it draws a summary, its links work, and what it can't draw is counted. A tool whose
  /// tank the reader no longer has, and no link, opens their tanks.
  func testAShortSectionHasNothingToOpenAndAToolsTankCanBeGone() {
    let app = launch("-chat-blocks")
    answerWithEveryBlock(app)
    let open = app.buttons.matching(identifier: "chat-section-open").element(boundBy: 1)
    XCTAssertTrue(open.waitForExistence(timeout: 5), "no second section")
    reveal(app, open)
    XCTAssertTrue(app.staticTexts["Tóm tắt nhanh"].exists, "a summary lost")
    XCTAssertTrue(app.staticTexts["còn tiếp: 1 phần"].exists, "what it can't draw isn't counted")
    let linked = app.links["Cá neon sống theo đàn"]
    XCTAssertTrue(linked.exists, "no link in its text")
    app.descendants(matching: .any).matching(identifier: "chat-section").element(boundBy: 1).coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.05)).tap()
    XCTAssertFalse(app.buttons["Thu gọn"].waitForExistence(timeout: 2), "nothing to open, and yet it opened")
    linked.tap()
    XCTAssertTrue(element(app, "native-page").waitForExistence(timeout: 10), "the link in its text did nothing")
    app.navigationBars.buttons.firstMatch.tap()
    let gone = app.buttons.matching(identifier: "chat-tool").element(boundBy: 1)
    reveal(app, gone)
    gone.tap()
    XCTAssertTrue(app.navigationBars["Bể của tôi"].waitForExistence(timeout: 5), "didn't open the reader's tanks")
  }

  /// Not in the handbook: said under the answer, and its section labelled the nearest page.
  func testWhatTheHandbookDoesntCoverLabelsItsSectionTheNearestPage() {
    let app = launch("-chat-uncovered")
    openChat(app)
    signIn(app)
    ask(app, "Nuôi cá neon với rùa được không?")
    XCTAssertTrue(element(app, "chat-answer").waitForExistence(timeout: 30), "no whole answer")
    XCTAssertTrue(app.staticTexts["Đã ghi lại câu hỏi để cẩm nang viết thêm."].waitForExistence(timeout: 5), "not said")
    let section = element(app, "chat-section")
    XCTAssertTrue(section.waitForExistence(timeout: 5), "no section")
    XCTAssertTrue(section.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Trang gần nhất'")).firstMatch.exists, "not labelled the nearest page")
  }

  /// The tank-mates tool: from a link, the fish it's set to, opening the app's tool; checked against a tank, what was checked
  /// and the check's own words, opening that tank at "Nuôi chung" with the added fish shown and not saved.
  func testAToolCardOpensTheToolSetToItsFishOrTheTankItChecked() {
    let app = launch("-chat-blocks", "-seed-tanks", "litres")
    answerWithEveryBlock(app)
    let tools = app.buttons.matching(identifier: "chat-tool")
    XCTAssertTrue(tools.firstMatch.waitForExistence(timeout: 5), "no tool")
    reveal(app, tools.element(boundBy: 0))
    XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Cá neon × 6'")).firstMatch.exists, "doesn't name the fish alone")
    tools.element(boundBy: 0).tap()
    XCTAssertTrue(app.navigationBars["Kiểm tra nuôi chung"].waitForExistence(timeout: 5), "not the app's tool")
    XCTAssertEqual(element(app, "mate-count").value as? String, "6", "not set to the link's fish")
    app.navigationBars.buttons.firstMatch.tap()
    let tank = tools.element(boundBy: 1)
    reveal(app, tank)
    XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Bể cũ, 100 cm: Cá neon × 6, Ốc lạ, thêm Cá betta × 1'")).firstMatch.exists,
                  "doesn't say what was checked")
    XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Không nên nuôi chung: Cá betta (cá xiêm) hung dữ.'")).firstMatch.exists,
                  "not the check's own words")
    tank.tap()
    XCTAssertTrue(app.navigationBars["Bể cũ"].waitForExistence(timeout: 5), "didn't open the tank it checked")
    let added = element(app, "trial-added")
    XCTAssertTrue(added.waitForExistence(timeout: 5), "the added fish aren't shown")
    XCTAssertEqual(added.label, "Thêm Cá betta × 1, chưa lưu vào bể.")
    let verdict = element(app, "verdict")
    let there = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isHittable == true"), object: verdict)
    XCTAssertEqual(XCTWaiter().wait(for: [there], timeout: 5), .completed, "not at \"Nuôi chung\"")
    XCTAssertTrue(verdict.label.contains("Không nên nuôi chung"), "not the check the answer read: \(verdict.label)")
  }

  /// At the largest text: a card's two buttons stack, a comparison keeps its names a line each, a section closed far down comes
  /// back to its heading, and a tool says where it goes.
  func testAtTheLargestTextTheBlocksRearrange() {
    let app = launch("-chat-blocks", "-seed-tanks", "litres", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    answerWithEveryBlock(app)
    let open = app.buttons.matching(identifier: "chat-card-open").element(boundBy: 0)
    reveal(app, open, times: 40)
    let put = app.buttons.matching(identifier: "chat-card-put").element(boundBy: 0)
    reveal(app, put, times: 10)
    XCTAssertGreaterThanOrEqual(put.frame.minY, open.frame.maxY, "a card's buttons aren't one under the other")
    let compare = element(app, "chat-compare")
    let differs = compare.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'Bể tối thiểu, khác:'")).firstMatch
    reveal(app, differs, times: 40)
    XCTAssertTrue(differs.label.contains("Cá đĩa 120 cm"), differs.label)
    let neon = compare.buttons.matching(NSPredicate(format: "label == 'Cá neon'")).firstMatch, discus = compare.buttons.matching(NSPredicate(format: "label == 'Cá đĩa'")).firstMatch
    XCTAssertGreaterThanOrEqual(discus.frame.minY, neon.frame.maxY, "the names aren't a species to a line")
    let heading = app.descendants(matching: .any).matching(identifier: "chat-section").firstMatch.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Cho ăn'")).firstMatch
    reveal(app, heading, times: 40)
    element(app, "chat-section").coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.4)).tap()
    let close = app.buttons["Thu gọn"]
    XCTAssertTrue(close.waitForExistence(timeout: 5), "didn't open")
    reveal(app, close, times: 20)
    close.tap()
    let back = XCTNSPredicateExpectation(predicate: NSPredicate(format: "isHittable == true"), object: heading)
    XCTAssertEqual(XCTWaiter().wait(for: [back], timeout: 5), .completed, "closed, and its heading stayed off the screen")
    let tools = app.buttons.matching(identifier: "chat-tool")
    reveal(app, tools.element(boundBy: 0), times: 40)
    XCTAssertTrue(app.descendants(matching: .any).matching(NSPredicate(format: "label CONTAINS 'Mở công cụ nuôi chung'")).firstMatch.exists, "the tool doesn't say where it goes")
  }

  // MARK: Helpers

  /// The neon's chat, signed in, its question answered with one of each kind of block.
  private func answerWithEveryBlock(_ app: XCUIApplication) {
    openChat(app)
    signIn(app)
    ask(app, "Neon và cá đĩa khác nhau thế nào?")
    XCTAssertTrue(element(app, "chat-answer").waitForExistence(timeout: 30), "no whole answer")
  }

  private func launch(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-reset-defaults", "-fixed-handbook", "-fake-accounts", "on",
                           "-reset-fake-server"] + more
    app.launchForFlow()
    return app
  }

  private func element(_ app: XCUIApplication, _ id: String) -> XCUIElement { app.descendants(matching: .any)[id].firstMatch }

  /// True once `done` holds, within `timeout` seconds.
  private func soon(_ done: @autoclosure () -> Bool, timeout: TimeInterval = 5) -> Bool {
    let end = Date().addingTimeInterval(timeout)
    while Date() < end {
      if done() { return true }
      RunLoop.current.run(until: Date().addingTimeInterval(0.2))
    }
    return done()
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

  private func reveal(_ app: XCUIApplication, _ e: XCUIElement, times: Int = 12) {
    repeatUntil(e.exists && e.isHittable, times: times) {
      app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.7))
        .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.4)), withVelocity: .fast, thenHoldForDuration: 0.1)
    }
    XCTAssertTrue(e.exists && e.isHittable, "\(e) not found")
  }
}
