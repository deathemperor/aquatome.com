import UIKit
import XCTest

/// A guide's top in v2, as a fish page's (`headways/spec-guide-top.md`): its photo under the bar and the status bar,
/// iOS's own back, one ⋯ holding save, share and the browser; and the owner's way round a long guide
/// (`navguide/guide-navigator.md`): Mục lục beside the back button, its list of the guide's parts and what follows them.
/// Builds 311 to 338 had the owner's navigator on guides; 339 took it off with the fish page's (#921). These hold it on.
final class GuideTopFlowTests: XCTestCase {
  override func setUp() { continueAfterFailure = false }

  /// Opened from Khám phá, signed out: iOS's back, no bookmark in the bar, one ⋯ with three items, the photo under the bar,
  /// no Mục lục; the guide's name in the bar only once it has gone under it. Before: the bookmark and the ⋯ ("Khác") were
  /// the bar's, over a band, the photo below it.
  func testAGuideFromKhamPhaHasAFishPagesTopSignedOut() {
    let app = launch()
    app.launchForFlow()
    openGuide(app)
    let bar = app.navigationBars.firstMatch
    XCTAssertTrue(bar.buttons.element(boundBy: 0).exists, "no back button")
    XCTAssertLessThan(bar.buttons.element(boundBy: 0).frame.minX, 60, "the back button isn't at the bar's left")
    XCTAssertFalse(bar.buttons["save-for-later"].exists, "a bookmark in the bar")
    XCTAssertFalse(bar.buttons["Khác"].exists, "the old ⋯ in the bar")
    XCTAssertFalse(app.descendants(matching: .any)["page-navigator-title"].exists, "Mục lục for a reader")
    let page = app.descendants(matching: .any)["native-page"].firstMatch
    XCTAssertLessThan(page.frame.minY, bar.frame.maxY - 20, "the page, its photo first, starts under the bar's foot, not at it")
    // What the bar holds for VoiceOver, kept with the run.
    let tree = XCTAttachment(string: bar.debugDescription)
    tree.name = "bar-at-rest"
    tree.lifetime = .keepAlways
    add(tree)
    // No name drawn in the bar at rest: its middle third holds no white lettering over the photo and its shade. (Measured
    // as NativePageFlowTests measures the bar's title: an element there can be in the bar and not drawn.)
    RunLoop.current.run(until: Date().addingTimeInterval(1))
    XCTAssertLessThan(whiteInk(bar), 0.002, "the name drawn in the bar over the page's own")
    let more = bar.buttons["page-more"]
    XCTAssertTrue(more.exists, "no ⋯")
    XCTAssertEqual(more.label, "Thêm")
    more.tap()
    let save = app.buttons["Lưu để đọc sau"], share = app.buttons["Chia sẻ"], web = app.buttons["Mở trong trình duyệt"]
    XCTAssertTrue(save.waitForExistence(timeout: 3), "no save in the ⋯")
    XCTAssertTrue(share.exists && web.exists, "not share and the browser in the ⋯")
    XCTAssertLessThan(save.frame.minY, share.frame.minY, "share before save")
    XCTAssertLessThan(share.frame.minY, web.frame.minY, "the browser before share")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)).tap()
    XCTAssertTrue(save.waitForNonExistence(timeout: 3), "the ⋯ didn't close")
    let name = bar.staticTexts["Nuôi cá neon trong bể nhỏ"]
    repeatUntil(name.exists, times: 4) { app.swipeUp() }
    XCTAssertTrue(name.exists, "no name in the bar once it has gone under it")
  }

  /// Saved from the ⋯: listed in Tìm's saved pages, and the ⋯ says "Bỏ lưu" after.
  func testSavingFromTheMoreMenuListsTheGuideAsSaved() {
    let app = launch()
    app.launchForFlow()
    openGuide(app)
    let more = app.navigationBars.buttons["page-more"]
    more.tap()
    let save = app.buttons["Lưu để đọc sau"]
    XCTAssertTrue(save.waitForExistence(timeout: 3), "no save in the ⋯")
    save.tap()
    XCTAssertTrue(save.waitForNonExistence(timeout: 3), "the ⋯ stayed open")
    more.tap()
    let saved = app.buttons["Bỏ lưu"]
    XCTAssertTrue(saved.waitForExistence(timeout: 3), "the ⋯ doesn't say it's saved")
    app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9)).tap()
    XCTAssertTrue(saved.waitForNonExistence(timeout: 3), "the ⋯ didn't close")
    app.tabBars.buttons["Tìm kiếm"].tap()
    let list = app.descendants(matching: .any)["all-saved"].firstMatch
    XCTAssertTrue(list.waitForExistence(timeout: 5) || app.scrolledDown(to: list).exists, "the guide isn't listed as saved")
    XCTAssertTrue(list.label.contains("1"), list.label)
  }

  /// The owner's Mục lục on a long guide: beside the back button with the ⋯ still the bar's; its list holds the guide's
  /// parts, "Tóm tắt nhanh" first, then under a line what follows them with their counts; a part chosen comes to rest with
  /// its heading under the bar, and the title names it.
  func testTheOwnerGoesToAPartOfALongGuideFromMucLuc() {
    let app = owner("-long-guide")
    openGuide(app)
    let bar = app.navigationBars.firstMatch
    let title = app.descendants(matching: .any)["page-navigator-title"].firstMatch
    XCTAssertTrue(title.waitForExistence(timeout: 5), "no Mục lục for the owner on a long guide")
    XCTAssertEqual(title.label, "Mục lục")
    XCTAssertLessThan(title.frame.minX - bar.buttons.element(boundBy: 0).frame.maxX, 24, "Mục lục isn't beside the back button")
    XCTAssertTrue(bar.buttons["page-more"].exists, "Mục lục crowds the ⋯ into iOS's own")
    title.tap()
    let parts = app.buttons.matching(identifier: "page-navigator-part")
    XCTAssertTrue(parts.firstMatch.waitForExistence(timeout: 5), "no list of parts")
    XCTAssertEqual(parts.firstMatch.label, "Tóm tắt nhanh", "not the summary first")
    XCTAssertGreaterThan(parts.firstMatch.frame.minY, bar.frame.maxY, "the list isn't under the bar")
    let feeding = parts.matching(NSPredicate(format: "label == 'Cho ăn'")).firstMatch
    let sources = parts.matching(NSPredicate(format: "label == 'Nguồn tham khảo, 2'")).firstMatch
    let named = parts.matching(NSPredicate(format: "label == 'Loài và cây trong bài, 3'")).firstMatch
    let talk = parts.matching(NSPredicate(format: "label == 'Thảo luận, 3'")).firstMatch
    XCTAssertTrue(feeding.exists, "no part for feeding among \(parts.count)")
    XCTAssertTrue(sources.exists && named.exists, "not the sources and the pages it names, with their counts")
    XCTAssertTrue(talk.waitForExistence(timeout: 5), "no discussion with its count")
    XCTAssertGreaterThan(sources.frame.minY, feeding.frame.minY, "what follows the parts before them")
    // Room above and below its words (the test at the largest text) leaves a one-line row at size L as it was.
    XCTAssertEqual(feeding.frame.height, 44, accuracy: 1, "a one-line row at size L isn't 44")
    feeding.tap()
    wait(for: [expectation(for: NSPredicate(format: "label == 'Mục lục, đang ở Cho ăn'"), evaluatedWith: title)], timeout: 5)
    let heading = app.scrollViews.staticTexts["Cho ăn"].firstMatch
    wait(for: [expectation(for: NSPredicate(format: "isHittable == true"), evaluatedWith: heading)], timeout: 5)
    XCTAssertGreaterThan(heading.frame.minY, bar.frame.maxY, "the part's heading behind the bar")
    XCTAssertTrue(bar.buttons["page-more"].exists && bar.buttons.element(boundBy: 0).exists, "a part's name crowds the bar's buttons")
  }

  /// At the largest text each of Mục lục's rows has room of its own, 11 points above and below its words: without it,
  /// rows of two lines and more ran together (Design's parity, 14 Nov). The list is the fish page's too.
  func testAtTheLargestTextMucLucsRowsHaveRoomAboveAndBelow() {
    let app = owner("-long-guide", "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    openGuide(app)
    let title = app.descendants(matching: .any)["page-navigator-title"].firstMatch
    XCTAssertTrue(title.waitForExistence(timeout: 5), "no Mục lục for the owner on a long guide")
    title.tap()
    let feeding = app.buttons.matching(identifier: "page-navigator-part").matching(NSPredicate(format: "label == 'Cho ăn'")).firstMatch
    XCTAssertTrue(feeding.waitForExistence(timeout: 5), "no part for feeding")
    // "Cho ăn" is one line at any size: its row is its line and the room above and below it.
    let line = UIFont.preferredFont(forTextStyle: .body,
                                    compatibleWith: UITraitCollection(preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge)).lineHeight
    XCTAssertGreaterThanOrEqual(feeding.frame.height, line + 21, "a row \(feeding.frame.height) high for a line of \(line): no room above and below")
  }

  /// At the largest text the head photo's credit stays at XXL's size, as a fish page's does: grown to the body's, it
  /// outranked the guide's name (Design's parity, 14 Nov).
  func testAtTheLargestTextTheHeadPhotosCreditIsCapped() {
    let app = launch("-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL")
    app.launchForFlow()
    openGuide(app)
    let credit = app.descendants(matching: .any)["native-page"].staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'Ảnh:'")).firstMatch
    XCTAssertTrue(credit.waitForExistence(timeout: 5), "no credit under the head photo")
    let capped = UIFont.preferredFont(forTextStyle: .footnote, compatibleWith: UITraitCollection(preferredContentSizeCategory: .extraExtraLarge)).lineHeight
    XCTAssertLessThanOrEqual(credit.frame.height, capped * 2 + 1, "the credit is \(credit.frame.height) high, past two lines at XXL (\(capped))")
  }

  /// Mục lục's list opened at rest, over the photo, is drawn clean: the photo's shade lay over it, the first row came out
  /// grey and the panel's top darker (Design's parity, 14 Nov). In light, the panel is white under its words.
  func testMucLucsListOpenedAtRestIsntUnderThePhotosShade() {
    let app = owner("-long-guide", "-appearance", "light")
    openGuide(app)
    let title = app.descendants(matching: .any)["page-navigator-title"].firstMatch
    XCTAssertTrue(title.waitForExistence(timeout: 5), "no Mục lục for the owner on a long guide")
    title.tap()
    let first = app.buttons.matching(identifier: "page-navigator-part").firstMatch
    XCTAssertTrue(first.waitForExistence(timeout: 5), "no list of parts")
    // The list's drop and the shade's going, 0.2 s each.
    RunLoop.current.run(until: Date().addingTimeInterval(0.6))
    let white = lightShare(first)
    XCTAssertGreaterThan(white, 0.5, "the first row is greyed: \(white) of it white")
  }

  /// A reader has none on the same long guide: no title in the bar, the name in its middle once scrolled.
  func testAReaderHasNoMucLucOnALongGuide() {
    let app = launch("-long-guide")
    app.launchForFlow()
    openGuide(app)
    app.swipeUp()
    app.swipeUp()
    XCTAssertFalse(app.descendants(matching: .any)["page-navigator-title"].exists, "Mục lục for a reader")
    XCTAssertTrue(app.navigationBars.staticTexts["Nuôi cá neon trong bể nhỏ"].exists, "no name in the bar once scrolled")
  }

  /// From Hôm nay, the owner: the guide's card opens the same top, the back button with Mục lục beside it, the ⋯ and the
  /// post's ✕.
  func testFromHomNayTheOwnersGuideHasBackAndMucLuc() {
    let app = owner("-long-guide", "-plan", "-today", "2026-11-14")
    let card = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Nuôi cá neon trong bể nhỏ")).firstMatch
    repeatUntil(card.exists && card.isHittable, times: 6) { app.swipeUp() }
    card.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 8), "the guide didn't open")
    let bar = app.navigationBars.firstMatch
    let title = app.descendants(matching: .any)["page-navigator-title"].firstMatch
    XCTAssertTrue(title.waitForExistence(timeout: 5), "no Mục lục on Hôm nay's guide")
    XCTAssertTrue(bar.buttons.element(boundBy: 0).exists, "no back button")
    XCTAssertLessThan(title.frame.minX - bar.buttons.element(boundBy: 0).frame.maxX, 24, "Mục lục isn't beside the back button")
    XCTAssertTrue(bar.buttons["page-more"].exists, "no ⋯")
    // Until the post opens pushed with iOS's back drawn as ✕ (the v2 Lab, 16 Nov): its ✕ after the ⋯.
    let close = bar.buttons["v2-close-post"]
    XCTAssertTrue(close.exists, "no ✕ on Hôm nay's post")
    XCTAssertGreaterThan(close.frame.minX, bar.buttons["page-more"].frame.minX, "the ✕ before the ⋯")
  }

  /// iOS's edge swipe goes back from a guide at rest, over its photo, and scrolled; slow and quick.
  func testAnEdgeSwipeGoesBackFromAGuideAtRestAndScrolled() {
    // With animations on: iOS's swipe doesn't go back without them.
    let app = launch()
    app.launch()
    for (scrolled, quick) in [(false, false), (false, true), (true, false), (true, true)] {
      openGuide(app)
      let page = app.descendants(matching: .any)["native-page"].firstMatch
      if scrolled { app.swipeUp() }
      let from = app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: scrolled ? 0.6 : 0.25))
      let to = app.coordinate(withNormalizedOffset: CGVector(dx: 0.93, dy: scrolled ? 0.6 : 0.25))
      from.press(forDuration: 0.05, thenDragTo: to, withVelocity: quick ? XCUIGestureVelocity(app.frame.width / 0.1) : .slow, thenHoldForDuration: 0)
      XCTAssertTrue(page.waitForNonExistence(timeout: 5), "a \(quick ? "quick" : "slow") edge swipe\(scrolled ? ", scrolled," : "") didn't go back")
    }
  }

  /// How much of the bar's middle third (clear of back and the ⋯) is drawn near white, as a name's letters are over the
  /// photo and its shade; the shade over a photo, or over the grey of one not come, stays darker.
  /// How much of an element is drawn near white, all of it.
  private func lightShare(_ element: XCUIElement) -> CGFloat {
    guard let cg = element.screenshot().image.cgImage else { return -1 }
    let w = cg.width, h = cg.height
    var px = [UInt8](repeating: 0, count: w * h * 4)
    let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    ctx?.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    var white = 0
    for i in stride(from: 0, to: px.count, by: 4) where px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235 { white += 1 }
    return w * h > 0 ? CGFloat(white) / CGFloat(w * h) : -1
  }

  private func whiteInk(_ bar: XCUIElement) -> CGFloat {
    guard let cg = bar.screenshot().image.cgImage else { return -1 }
    let w = cg.width, h = cg.height
    var px = [UInt8](repeating: 0, count: w * h * 4)
    let ctx = CGContext(data: &px, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    ctx?.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    var white = 0, all = 0
    for y in 0..<h {
      for x in (w / 3)..<(2 * w / 3) {
        let i = (y * w + x) * 4
        all += 1
        if px[i] > 235, px[i + 1] > 235, px[i + 2] > 235 { white += 1 }
      }
    }
    return all > 0 ? CGFloat(white) / CGFloat(all) : -1
  }

  private func launch(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-v2", "YES"] + more
    return app
  }

  /// Signed in as the owner (the stand-in Apple's, `-fake-owner`), on Hôm nay.
  private func owner(_ more: String...) -> XCUIApplication {
    let app = XCUIApplication()
    app.launchArguments = ["-AppleLanguages", "(vi)", "-AppleLocale", "vi_VN", "-fixed-handbook", "-reset-defaults", "-v2", "YES",
                           "-fake-accounts", "on", "-reset-fake-server", "-fake-owner", "ui-apple"] + more
    app.launchForFlow()
    XCTAssertTrue(app.tabBars.buttons["Hôm nay"].waitForExistence(timeout: 10), "not v2")
    app.openAccount()
    app.scrollToAndTap("apple-sign-in")
    XCTAssertTrue(app.descendants(matching: .any)["owner-dashboard"].waitForExistence(timeout: 20), "not the owner")
    app.closeAccount()
    return app
  }

  /// The neon guide from Khám phá's "Bắt đầu từ đây".
  private func openGuide(_ app: XCUIApplication) {
    app.openTab("Khám phá")
    let card = app.buttons.matching(NSPredicate(format: "label CONTAINS %@", "Nuôi cá neon trong bể nhỏ")).firstMatch
    XCTAssertTrue(card.waitForExistence(timeout: 10) || app.scrolledDown(to: card).exists, "no guide on Khám phá")
    if !card.isHittable { _ = app.scrolledDown(to: card) }
    card.tap()
    XCTAssertTrue(app.descendants(matching: .any)["native-page"].waitForExistence(timeout: 8), "the guide didn't open")
    XCTAssertTrue(app.navigationBars.buttons["page-more"].waitForExistence(timeout: 5), "not the guide's top")
  }
}
