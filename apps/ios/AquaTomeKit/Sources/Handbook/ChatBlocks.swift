import Foundation

extension Chat {
  /// One row of a comparison, its figure for each species (nil: none): whether they differ, and the one that alone does.
  public struct Differs: Sendable, Equatable {
    /// "khác": the figures the species have aren't all the same. A missing one is never a difference.
    public let differ: Bool
    /// Bold: among three or more figures, the one that alone differs while the others share one (60, 60, 80); none when
    /// all differ, two and two do, or only two species have figures.
    public let alone: Int?
  }

  /// How a row's figures compare. `values` are compared as given (difficulty by its number, not its word).
  public static func differs<V: Hashable>(_ values: [V?]) -> Differs {
    let present = values.compactMap { $0 }
    let counts = Dictionary(present.map { ($0, 1) }, uniquingKeysWith: +)
    guard counts.count > 1 else { return Differs(differ: false, alone: nil) }
    guard present.count >= 3, counts.count == 2, let odd = counts.first(where: { $0.value == 1 })?.key,
          counts.values.contains(where: { $0 >= 2 }) else { return Differs(differ: true, alone: nil) }
    return Differs(differ: true, alone: values.firstIndex { $0 == odd })
  }

  /// A section's blocks as the screen shows them, whole: a paragraph, a list's item (a step when the list is
  /// numbered), a photo; anything else whole as it is.
  public enum Part: Sendable {
    case paragraph([PageDoc.Run])
    /// A list's item: its number when the list is numbered (from 1), and its blocks.
    case item(n: Int?, [PageDoc.Block])
    case figure(PageDoc.Image, caption: [PageDoc.Run], href: String?)
    case other(PageDoc.Block)
  }

  /// A section's parts, in order. A photo the turn already showed (`shown`, by its source) is left out.
  public static func parts(_ blocks: [PageDoc.Block], shown: Set<String> = []) -> [Part] {
    blocks.flatMap { b -> [Part] in
      switch b {
      case .paragraph(let runs): [.paragraph(runs)]
      case let .list(ordered, items): items.enumerated().map { .item(n: ordered ? $0.offset + 1 : nil, $0.element) }
      case let .figure(img, caption, href): shown.contains(img.src) ? [] : [.figure(img, caption: caption, href: href)]
      case .heading, .web: []
      default: [.other(b)]
      }
    }
  }

  /// What's left of a section past what shows ("còn tiếp: 3 bước, 1 ảnh"): its steps, list items, paragraphs, photos
  /// and other parts, each counted.
  public struct Rest: Sendable, Equatable {
    public var steps = 0, items = 0, paragraphs = 0, photos = 0, others = 0
    public var isEmpty: Bool { steps + items + paragraphs + photos + others == 0 }
    public init() {}

    public init(_ parts: some Sequence<Part>) {
      for p in parts {
        switch p {
        case .paragraph: paragraphs += 1
        case .item(let n, _): if n != nil { steps += 1 } else { items += 1 }
        case .figure: photos += 1
        case .other: others += 1
        }
      }
    }
  }
}
