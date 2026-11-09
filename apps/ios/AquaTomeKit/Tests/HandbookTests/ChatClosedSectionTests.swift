import CoreGraphics
import Testing
@testable import Handbook

// 21 a line, the last without its 1 of spacing; 8 between parts.
private func closed(_ lines: [Int]) -> CGFloat? {
  Chat.closedHeight(lines.map { CGFloat($0 * 21 - 1) }, line: 21, spacing: 1, gap: 8)
}

@Test func aClosedSectionOfOneLongPartStopsAtItsFifthLine() {
  #expect(closed([10]) == 104)
}

@Test func aClosedSectionThatEndsAPartOnItsFifthLineStopsThere() {
  // 20 + 8 + 41 + 8 + 41
  #expect(closed([1, 2, 2, 2]) == 118)
}

@Test func aClosedSectionCutInsideAPartCountsTheGapsAboveIt() {
  // 20 + 8 + 62 + 8, and one line of the third.
  #expect(closed([1, 3, 3]) == 118)
}

@Test func aClosedSectionThatFitsIsNotCut() {
  #expect(closed([1, 2]) == nil)
  #expect(closed([5]) == nil)
  #expect(closed([2, 3]) == nil)
}

@Test func aClosedSectionOfExactlyFiveLinesRoundedToPixelsIsNotCut() {
  #expect(Chat.closedHeight([101.67], line: 20.9, spacing: 3, gap: 8) == nil)
  #expect(Chat.closedHeight([17.67, 38.67, 39], line: 20.9, spacing: 3, gap: 8) == nil)
}

@Test func aClosedSectionWithAPhotoStopsPartWayDownIt() {
  // 20 + 8, and four lines of the photo.
  #expect(Chat.closedHeight([20, 200], line: 21, spacing: 1, gap: 8) == 111)
}
