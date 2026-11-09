import Foundation

extension Chat {
  /// One block of the empty screen, in the scroll's content.
  public struct EmptyBlock: Sendable, Equatable {
    public enum Kind: Sendable { case card, title, line, starter }
    public let kind: Kind
    public let top: Double
    public let bottom: Double

    public init(_ kind: Kind, top: Double, height: Double) {
      self.kind = kind
      self.top = top
      bottom = top + height
    }
  }

  /// A starter shows at least this much above the box, or starts wholly under it.
  private static let sliver = 24.0

  /// How far the empty screen scrolls over a box whose top edge is `boxTop` below the bar's edge: the least it must, from
  /// `start`, so the box's edge falls in a gap between blocks. Where no place clears both edges, the design's order of what
  /// gives way (docs/design/chat.md, "With the keyboard up on the empty screen"). `start` where nothing holds.
  public static func place(_ blocks: [EmptyBlock], boxTop: Double, from start: Double = 0) -> Double {
    let places = Set([start] + blocks.flatMap { [$0.top, $0.bottom, $0.bottom - boxTop, $0.top - boxTop, $0.top + sliver - boxTop] })
      .filter { $0 >= start }
      .sorted()
    for rule in Rule.allCases {
      if let place = places.first(where: { o in rule.holds(blocks.map { Seen($0, scrolled: o, box: boxTop) }) }) { return place }
    }
    return start
  }

  /// The place for a box at each of its heights from one line up, its top edge at each: never lower than the line before,
  /// so the same height is always the same place, whichever way the reader typed.
  public static func place(_ blocks: [EmptyBlock], boxTops: [Double], from start: Double = 0) -> Double {
    boxTops.reduce(start) { place(blocks, boxTop: $1, from: $0) }
  }

  private struct Seen {
    let kind: EmptyBlock.Kind
    let top: Double
    let bottom: Double
    let box: Double

    init(_ block: EmptyBlock, scrolled: Double, box: Double) {
      kind = block.kind
      top = block.top - scrolled
      bottom = block.bottom - scrolled
      self.box = box
    }

    var gone: Bool { bottom <= 0 || top >= box }
    var whole: Bool { top >= 0 && bottom <= box }
    var cutByBar: Bool { top < 0 && bottom > 0 }
    var cutByBox: Bool { top < box && bottom > box }
    var sliver: Bool { cutByBox && box - top < Chat.sliver }
  }

  /// What may give way, in the design's order.
  private enum Rule: CaseIterable {
    case gap, laterStartersRunOn, firstStarterRunsOn, titleUnderTheBar, lineGoes, starterUnderTheBar

    func holds(_ seen: [Seen]) -> Bool {
      guard let line = seen.first(where: { $0.kind == .line }), seen.contains(where: { !$0.gone }) else { return false }
      let starters = seen.filter { $0.kind == .starter }
      let card = seen.filter { $0.kind == .card }
      let heads = card + seen.filter { $0.kind == .title }
      let headsClear = heads.allSatisfy { !$0.cutByBar }
      let run = starters.allSatisfy { !$0.cutByBar && !$0.sliver }
      switch self {
      case .gap: return line.whole && seen.allSatisfy { !$0.cutByBar && !$0.cutByBox }
      case .laterStartersRunOn: return line.whole && headsClear && run && starters.first?.whole != false
      case .firstStarterRunsOn: return line.whole && headsClear && run
      case .titleUnderTheBar:
        return line.whole && card.allSatisfy { !$0.cutByBar } && starters.allSatisfy { !$0.cutByBar } && seen.allSatisfy { !$0.cutByBox }
      case .lineGoes: return line.gone && seen.allSatisfy { !$0.cutByBar && !$0.cutByBox }
      case .starterUnderTheBar: return !line.cutByBar && !line.cutByBox && headsClear && starters.allSatisfy { !$0.sliver }
      }
    }
  }
}
