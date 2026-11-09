import Foundation

/// v2's page for a fish, plant or breed (SpeciesPage) as parts, in the order it shows them, each holding the blocks it
/// draws by their place in the page: every block in one part, so nothing is left only on v1's page. Its photos lead, as
/// the row under the name; then the answer, a line before it (a breed's parents), whether it gets through a northern
/// winter, its tank-mates and the section on them (`muc-behaviour`) under them; then the page's own sections, in its
/// order; then its breeds, the guides that mention it, its videos, the literature it cites (`muc-references`), the
/// sources behind its figures and its sources. In a section, a source's note on a figure the data table has otherwise
/// (`Run.note`) comes last, beside the rest, not as its opening line. A part this app can't read (`.web`) stays where it
/// is in its section, which offers v1's page there.
public enum PagePart: Equatable, Sendable {
  /// The page's galleries: their photos, the row under the name.
  case photos([Int])
  case summary(Int)
  case climate(Int)
  case mates(Int)
  /// The tank-mates tool's link, a paragraph of that link alone before the text: where the page lists no tank-mates.
  case toolLink(Int)
  /// A heading and what's under it, up to the next; no heading for what comes before the first.
  case section(heading: Int?, blocks: [Int])
  /// Its breeds, or other pages drawn as cards.
  case cards(Int)
  /// Other pages by their paths: the guides that mention it.
  case pages(Int)
  case videos(Int)
  /// What each of its figures rests on.
  case trust(Int)
  case refs(Int)

  /// The blocks it draws, by their place in the page.
  public var blocks: [Int] {
    switch self {
    case let .photos(i): i
    case let .section(h, b): (h.map { [$0] } ?? []) + b
    case let .summary(i), let .climate(i), let .mates(i), let .toolLink(i), let .cards(i), let .pages(i), let .videos(i), let .trust(i), let .refs(i): [i]
    }
  }

  public static func of(_ doc: PageDoc) -> [PagePart] {
    let b = doc.blocks
    func all(_ match: (PageDoc.Block) -> Bool) -> [Int] { b.indices.filter { match(b[$0]) } }
    let firstHeading = b.firstIndex { if case .heading = $0 { true } else { false } } ?? b.count
    let lead = b.firstIndex { if case .summary = $0 { true } else if case .heading = $0 { true } else { false } } ?? b.count
    // The tool's link alone, as v1's page reads it: not a breed's line naming its parents, which has more to it.
    let tool = all { if case let .paragraph(runs) = $0 { runs.count == 1 && runs[0].href != nil } else { false } }.filter { $0 < lead }
    // Drawn in their own places, not in the text's flow.
    let own = { (i: Int) -> Bool in
      switch b[i] {
      case .gallery, .summary, .climate, .mates, .cards, .pages, .videos, .trust, .refs: true
      default: tool.contains(i)
      }
    }
    var out: [PagePart] = []
    let photos = all { if case .gallery = $0 { true } else { false } }
    if !photos.isEmpty { out.append(.photos(photos)) }
    out += all { if case .summary = $0 { true } else { false } }.map(PagePart.summary)
    let before = (0..<firstHeading).filter { !own($0) }
    if !before.isEmpty { out.append(.section(heading: nil, blocks: before)) }
    out += all { if case .climate = $0 { true } else { false } }.map(PagePart.climate)
    let mates = all { if case .mates = $0 { true } else { false } }.map(PagePart.mates) + tool.map(PagePart.toolLink)
    out += mates
    var sections: [PagePart] = [], behaviour: [PagePart] = [], references: [PagePart] = []
    var at = firstHeading
    while at < b.count {
      let heading = at
      at += 1
      var under: [Int] = []
      while at < b.count {
        if case .heading = b[at] { break }
        if !own(at) { under.append(at) }
        at += 1
      }
      // Its source notes last.
      let note = { (i: Int) -> Bool in if case let .paragraph(runs) = b[i] { !runs.isEmpty && runs.allSatisfy(\.note) } else { false } }
      let part = PagePart.section(heading: heading, blocks: under.filter { !note($0) } + under.filter(note))
      switch b[heading] {
      case .heading(_, "muc-behaviour") where !mates.isEmpty: behaviour.append(part)
      case .heading(_, "muc-references"): references.append(part)
      default: sections.append(part)
      }
    }
    out += behaviour + sections
    out += all { if case .cards = $0 { true } else { false } }.map(PagePart.cards)
    out += all { if case .pages = $0 { true } else { false } }.map(PagePart.pages)
    out += all { if case .videos = $0 { true } else { false } }.map(PagePart.videos)
    out += references
    out += all { if case .trust = $0 { true } else { false } }.map(PagePart.trust)
    out += all { if case .refs = $0 { true } else { false } }.map(PagePart.refs)
    return out
  }
}
