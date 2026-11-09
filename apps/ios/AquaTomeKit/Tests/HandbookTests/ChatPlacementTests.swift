import Foundation
import Testing
@testable import Handbook

/// Where the empty screen rests over the box (docs/design/chat.md, "With the keyboard up on the empty screen").
struct ChatPlacementTests {
  private func blocks(_ list: (Chat.EmptyBlock.Kind, Double, Double)...) -> [Chat.EmptyBlock] {
    list.map { Chat.EmptyBlock($0.0, top: $0.1, height: $0.2 - $0.1) }
  }

  /// A phone at the usual size: the card, the title, the line about who answers, three starters.
  private let phone: [Chat.EmptyBlock] = [
    .init(.card, top: 12, height: 62), .init(.title, top: 100, height: 30), .init(.line, top: 138, height: 60),
    .init(.starter, top: 210, height: 48), .init(.starter, top: 266, height: 48), .init(.starter, top: 322, height: 48),
  ]

  @Test func withRoomItStays() {
    #expect(Chat.place(phone, boxTop: 600) == 0)
  }

  /// A starter cut by the box: the least move that also leaves the card whole or gone is the card's height, not the 20
  /// points that would clear the starter and cut the card.
  @Test func theCardGoesWholeUnderTheBarRatherThanHalf() {
    #expect(Chat.place(phone, boxTop: 350) == 74)
  }

  @Test func theBoxsEdgeFallsInAGap() {
    // The third starter wholly under the box, the second just clear of it.
    #expect(Chat.place(phone, boxTop: 322) == 0)
    let tall = blocks((.title, 0, 130), (.line, 138, 468), (.starter, 480, 640), (.starter, 650, 810))
    #expect(Chat.place(tall, boxTop: 350) == 130, "the title under the bar, the line whole, the starters under the box")
  }

  @Test func noPlaceIsBehindWhereItIs() {
    #expect(Chat.place(phone, boxTop: 600, from: 80) == 80)
    #expect(Chat.place(phone, boxTop: 600, from: 40) == 74, "not left with the card half under the bar")
    #expect(Chat.place(phone, boxTop: 350, from: 80) == 80)
  }

  /// Too tall for the box's edge to fall in a gap: the first starter whole, the next running on under the box.
  @Test func aLaterStarterRunsOnUnderTheBox() {
    let b = blocks((.title, 0, 40), (.line, 48, 100), (.starter, 110, 200), (.starter, 210, 600))
    #expect(Chat.place(b, boxTop: 400) == 0)
  }

  @Test func thenTheFirstStarterRunsOn() {
    let b = blocks((.title, 0, 40), (.line, 48, 100), (.starter, 110, 600))
    #expect(Chat.place(b, boxTop: 300) == 0)
  }

  /// Ten points of a starter above the box is a sliver: up until the title has gone whole and the starter shows enough.
  @Test func neverASliver() {
    let b = blocks((.title, 0, 40), (.line, 48, 100), (.starter, 290, 900))
    #expect(Chat.place(b, boxTop: 300) == 40)
  }

  @Test func thenTheTitleUnderTheBarsEdge() {
    let b = blocks((.title, 0, 100), (.line, 100, 140), (.starter, 150, 170), (.starter, 185, 1000))
    #expect(Chat.place(b, boxTop: 105) == 35)
  }

  /// The line taller than the room above the box: whole under the bar, never a slice.
  @Test func theLineGoesWhole() {
    let b = blocks((.title, 0, 100), (.line, 110, 510), (.starter, 520, 600))
    #expect(Chat.place(b, boxTop: 350) == 510)
  }

  @Test func lastAStarterUnderTheBarsEdge() {
    let b = blocks((.line, 0, 400), (.starter, 410, 2000))
    #expect(Chat.place(b, boxTop: 350) == 400)
  }

  /// Found line by line: a taller box never sits lower than the line before, and the same height is the same place.
  @Test func lineByLineNeverLower() {
    let oneLine = Chat.place(phone, boxTops: [350])
    let twoLines = Chat.place(phone, boxTops: [350, 320])
    #expect(twoLines >= oneLine)
    #expect(Chat.place(phone, boxTops: [350, 320]) == twoLines)
    #expect(Chat.place(phone, boxTops: [350], from: 10) == Chat.place(phone, boxTop: 350, from: 10))
  }
}
