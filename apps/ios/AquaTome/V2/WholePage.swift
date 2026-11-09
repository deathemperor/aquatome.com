import Handbook
import SwiftUI

/// A part of the page under its heading on v2's species page, as an app's description in the App Store: a long one shows
/// its opening, then "thêm", which opens the rest in place; a short one shows whole. It never folds through a line, a
/// photo or a table: the pieces that fit in about eight lines of text show whole, then the next text's first lines up to
/// the eighth, "thêm" at the end of the last over a fade. What's folded away
/// isn't drawn, touched or read until it opens; what shows works as ever, its links too. With VoiceOver on, it doesn't
/// fold: VoiceOver reads on past what the eye sees, and a fold would only stand in its way.
///
/// Where it folds is worked out from its pieces' words and photos before it's drawn, not measured after: drawn whole and
/// then shrunk, a part moved what was laid out under it, so a chip's jump landed past its part.
@available(iOS 18, *)
struct V2Section: View {
  let title: String?
  let pieces: [NativePage.Piece]
  /// Text folds; a part of figures to compare (its sources) shows whole.
  var folds = true
  @Binding var open: Bool
  /// The page's width.
  let width: CGFloat
  /// A link of a photo's or a card's.
  let link: (URL) -> Void
  /// v1's page, for a part this one can't draw.
  let full: () -> Void
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @Environment(\.dynamicTypeSize) private var size

  private static let gap: CGFloat = 14
  /// What shows, folded: its first pieces whole, then the next one's first lines if it's text, "thêm" at the end of the
  /// last ("cut"); or, if the next isn't text, the whole pieces alone, "thêm" under them.
  private enum Fold: Equatable { case none, pieces(Int), cut(Int, lines: Int) }

  /// About eight lines of the reader's text, folded only when that hides more than a few, and never through a photo, a
  /// table or a line: a text cut short ends on whole lines, and what shows never ends on a heading over nothing.
  private var fold: Fold {
    guard folds, !open, !voiceOver, !pieces.isEmpty else { return .none }
    let tall = PieceHeight(width: (width > 0 ? width : 402) - 40, size: size)
    let shown = tall.line * 8
    let heights = pieces.indices.map { tall.of(pieces[$0]) + ($0 > 0 ? Self.gap : 0) }
    guard heights.reduce(0, +) > shown * 1.4 else { return .none }
    var used: CGFloat = 0, n = 0
    while n < pieces.count, used + heights[n] <= shown {
      used += heights[n]
      n += 1
    }
    while n > 1, case let .text(_, _, look) = pieces[n - 1], [.heading, .subheading].contains(look) {
      n -= 1
      used -= heights[n]
    }
    if case let .text(_, _, look) = pieces[n], [.body, .boxed, .lead].contains(look) {
      let left = Int((shown - used - (n > 0 ? Self.gap : 0)) / tall.line)
      if left >= 2 { return .cut(n, lines: left) }
    }
    // A first piece taller than all of it (a table, a photo): whole, the rest under "thêm".
    return n == 0 ? (pieces.count > 1 ? .pieces(1) : .none) : .pieces(n)
  }

  var body: some View {
    let fold = fold
    let whole = switch fold {
    case .none: pieces.count
    case let .pieces(n), let .cut(n, _): n
    }
    VStack(alignment: .leading, spacing: 10) {
      if let title {
        Text(verbatim: title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
          .fixedSize(horizontal: false, vertical: true)
      }
      VStack(alignment: .leading, spacing: Self.gap) {
        ForEach(0..<whole, id: \.self) { j in
          V2Piece(piece: pieces[j], open: link, full: full)
        }
        switch fold {
        case let .cut(n, lines):
          V2Piece(piece: pieces[n], lines: lines, open: link, full: full)
            .overlay(alignment: .bottomTrailing) { more(faded: true) }
        case .pieces:
          more(faded: false).frame(maxWidth: .infinity, alignment: .trailing)
        case .none:
          EmptyView()
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
  }

  /// "thêm": at the end of a cut text's last line, over a fade a third of the line wide; under whole pieces, on its own.
  private func more(faded: Bool) -> some View {
    Button { withAnimation(.easeInOut(duration: 0.25)) { open = true } } label: {
      Text("thêm").font(.body.weight(.semibold))
        .padding(.leading, faded ? 72 : 0)
        .background {
          if faded {
            LinearGradient(stops: [.init(color: Color(.systemBackground).opacity(0), location: 0), .init(color: Color(.systemBackground), location: 0.6)],
                           startPoint: .leading, endPoint: .trailing)
          }
        }
    }
    .buttonStyle(.plain)
    .foregroundStyle(Color.accentColor)
    .frame(minHeight: 44, alignment: faded ? .bottom : .center)
    .contentShape(.rect)
    .accessibilityIdentifier("v2-more")
  }
}

/// About how tall a piece draws in a column `width` wide at the reader's text size: its text's lines as the system sets
/// them, a photo by its shape, the rest by their rows. Near enough to choose where a part folds; never what's drawn.
private struct PieceHeight {
  let width: CGFloat
  let size: DynamicTypeSize

  private func font(_ style: UIFont.TextStyle) -> UIFont {
    UIFont.preferredFont(forTextStyle: style, compatibleWith: UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(size)))
  }

  /// A line of the body's text, with the space v2 puts between lines.
  var line: CGFloat { font(.body).lineHeight + 3 }

  func text(_ s: AttributedString, _ style: UIFont.TextStyle = .body, inset: CGFloat = 0) -> CGFloat {
    let f = font(style)
    let r = (String(s.characters) as NSString).boundingRect(with: CGSize(width: max(width - inset, 1), height: .greatestFiniteMagnitude),
                                                            options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: [.font: f], context: nil)
    return ceil(r.height / f.lineHeight) * (f.lineHeight + 3)
  }

  func of(_ piece: NativePage.Piece) -> CGFloat {
    switch piece {
    case let .text(s, _, look):
      look == .heading ? text(s, .title3) : look == .boxed ? text(s, inset: 28) + 28 : text(s)
    case let .photo(_, ratio, _, caption, credit, _, _, _):
      width / max(ratio, 0.2) + (caption.characters.isEmpty ? 0 : text(caption, .footnote) + 6) + (credit == nil ? 0 : line)
    case let .video(_, _, caption):
      width * 9 / 16 + text(caption, .subheadline) + line * 2
    case let .table(head, rows):
      CGFloat(rows.count + (head == nil ? 0 : 1)) * (line + 10) + 28
    case let .notes(title, notes, note):
      notes.map { text($0.text, inset: 28) + 8 }.reduce(title == nil ? 0 : line, +) + (note == nil ? 0 : line)
    case let .cards(title, cards, _):
      CGFloat(cards.count) * max(64, line * 2 + 16) + (title == nil ? 0 : line)
    case let .pages(_, paths):
      CGFloat(paths.count) * max(64, line * 2 + 16)
    case let .more(_, s), let .fold(_, _, s):
      line + text(s)
    case .web:
      44
    case .facts, .readers, .gallery:
      0
    }
  }
}

/// A piece of the page (NativePage.Piece, as v1's page has it) on v2's species page: its text at the reader's size, its
/// photos and tables in the page's width, its videos played in place, and a part this app can't draw as a link to v1's
/// page at that point, never missing.
@available(iOS 18, *)
struct V2Piece: View {
  let piece: NativePage.Piece
  /// A text's lines shown, folded (V2Section).
  var lines: Int? = nil
  /// A link of a photo's or a card's.
  let open: (URL) -> Void
  /// v1's page, for a part this one can't draw.
  let full: () -> Void

  var body: some View {
    switch piece {
    case let .text(s, anchor, look):
      // A heading inside a part (a questions' title) at v2's own size, not v1's serif.
      Text(look == .heading ? plain(s) : s)
        .font(look == .heading ? .title3.weight(.bold) : nil)
        .lineSpacing([.body, .boxed, .lead].contains(look) ? 3 : 0)
        .lineLimit(lines)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(look == .boxed ? 14 : 0)
        .background(look == .boxed ? AnyShapeStyle(.fill.quaternary) : AnyShapeStyle(Color.clear), in: .rect(cornerRadius: 12))
        .accessibilityAddTraits([.heading, .subheading].contains(look) ? .isHeader : [])
        .id(anchor ?? "")
    case let .photo(src, ratio, alt, caption, credit, href, play, _):
      VStack(alignment: .leading, spacing: 6) {
        let image = PageImage(src: src, ratio: ratio, alt: alt, corner: 14)
          .overlay { if play { Image(systemName: "play.circle.fill").font(.system(size: 56)).foregroundStyle(.white, .black.opacity(0.5)) } }
        if let href {
          Button { open(href) } label: { image }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: alt ?? String((caption + (credit ?? AttributedString())).characters)))
        } else {
          image
        }
        if !caption.characters.isEmpty { Text(caption).font(.footnote).foregroundStyle(.secondary) }
        if let credit { Text(credit).foregroundStyle(.secondary).tint(Color.secondary) }
      }
    case let .video(id, title, caption):
      VideoSlot(id: id, title: title, caption: caption)
    case let .pages(title, paths):
      PagesBlock(title: title, paths: paths, titled: false)
    case let .cards(title, cards, good):
      // Their photos' credits at the page's foot ("Ảnh và giấy phép"): here a row of bare numbers between two lists.
      CardsPart(title: title, cards: cards, good: good, open: open, credits: false)
    case let .more(title, text):
      DisclosureGroup {
        Text(text).frame(maxWidth: .infinity, alignment: .leading).padding(.top, 6)
      } label: {
        Text(title).font(.headline)
      }
    case let .fold(heading, _, text):
      VStack(alignment: .leading, spacing: 8) {
        Text(plain(heading)).font(.title3.weight(.bold)).accessibilityAddTraits(.isHeader)
        Text(text).lineSpacing(3).frame(maxWidth: .infinity, alignment: .leading)
      }
    case let .notes(title, notes, note):
      VStack(alignment: .leading, spacing: 8) {
        if let title { Text(title).font(.headline).accessibilityAddTraits(.isHeader) }
        ForEach(notes.indices, id: \.self) { j in
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            Image(systemName: notes[j].ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
              .foregroundStyle(notes[j].ok ? Color.green : Color.warning)
              .accessibilityHidden(true)
            Text(notes[j].text).lineSpacing(2).frame(maxWidth: .infinity, alignment: .leading)
          }
        }
        if let note { Text(note).font(.footnote).foregroundStyle(.secondary) }
      }
    case .web:
      Button(action: full) {
        Label("Xem phần này ở trang đầy đủ", systemImage: "doc.text").font(.subheadline.weight(.semibold)).frame(minHeight: 44)
      }
      .accessibilityIdentifier("v2-part-elsewhere")
    case let .table(head, rows):
      TablePart(head: head, rows: rows)
    case .facts, .readers, .gallery:
      // Drawn by the page itself (its facts strip, its readers' part, its photos' row under the name), never in a section
      // (PagePart).
      EmptyView()
    }
  }

  /// A heading's words without v1's serif, for v2's own font.
  private func plain(_ s: AttributedString) -> AttributedString {
    var s = s
    s.font = nil
    return s
  }
}

/// A page's parts (PagePart) for v2's species page, each with its heading and its pieces, worked out once when the page
/// comes, not on each redraw; where its readers' photos and comments go; and the rows of jump chips to its parts a reader
/// comes back for.
struct WholeParts {
  let parts: [PagePart]
  let titles: [String?]
  let pieces: [[NativePage.Piece]]
  /// Each part's place on the page, which a `#id` link and a chip scroll to: its heading's id, or its own.
  let ids: [String]
  /// Its readers' photos and comments: before the literature it cites and its sources, its last parts.
  let readersAt: Int
  /// The videos it shows, which a moment's link plays in place.
  let videos: Set<String>
  /// The parts a reader comes back for, in the page's order, each by its part: chips over a long page.
  let jumps: [(label: String, part: Int)]
  /// The photos of its cards (its breeds), credited at the page's foot.
  let cardPhotos: [PageDoc.Image]

  /// The sections a chip leads to, by their heading's key (`muc-<key>`, the site's sections.ts).
  private static let chips: [(key: String, label: String)] = [
    ("waterConditions", String(localized: "Nước")), ("diet", String(localized: "Cho ăn")), ("reproduction", String(localized: "Sinh sản")),
  ]

  init(_ doc: PageDoc) {
    let parts = PagePart.of(doc)
    self.parts = parts
    var titles: [String?] = [], ids: [String] = [], pieces: [[NativePage.Piece]] = []
    for (i, p) in parts.enumerated() {
      var out: [NativePage.Piece] = []
      for b in p.blocks {
        // A source's note on a figure the data table has otherwise: small, as a note beside the text.
        if case let .paragraph(runs) = doc.blocks[b], !runs.isEmpty, runs.allSatisfy(\.note) {
          out.append(.text(styled(runs, font: .footnote, secondary: true)))
        } else if case let .paragraph(runs) = doc.blocks[b], !runs.isEmpty, runs.allSatisfy(\.bold) {
          // A line all in bold over what follows ("Nguồn ghi gì" over the sources' sentences): a label, not text a fold
          // may end on.
          out.append(.text(styled(runs), look: .subheading))
        } else {
          NativePage.add(doc.blocks[b], to: &out)
        }
      }
      // Its heading over the part, at v2's size, not as a piece in it; what to trust's own heading, the same.
      var title: String?, anchor: String?
      switch out.first {
      case let .text(s, a, .heading)?:
        title = String(s.characters); anchor = a; out.removeFirst()
      case let .more(t, text)?:
        title = t; out[0] = .text(text)
      case let .pages(t, _)?:
        title = t
      default:
        break
      }
      titles.append(title); ids.append(anchor ?? "part-\(i)"); pieces.append(out)
    }
    self.titles = titles
    self.ids = ids
    self.pieces = pieces
    func heading(_ p: PagePart) -> String? {
      if case let .section(h?, _) = p, case let .heading(_, id) = doc.blocks[h] { id } else { nil }
    }
    readersAt = parts.firstIndex {
      switch $0 { case .trust, .refs: true; default: heading($0) == "muc-references" }
    } ?? parts.count
    videos = Set(pieces.joined().compactMap { if case let .video(id, _, _) = $0 { id } else { nil } })
    cardPhotos = parts.flatMap { p -> [PageDoc.Image] in
      guard case let .cards(b) = p, case let .cards(_, items) = doc.blocks[b] else { return [] }
      return items.compactMap(\.img)
    }
    // Its tank-mates, the sections by key, its videos and its sources, those it has, in its order.
    var jumps: [(label: String, part: Int)] = [], sources = false
    for (i, p) in parts.enumerated() {
      switch p {
      case .mates: jumps.append((String(localized: "Nuôi chung"), i))
      case .videos: jumps.append((String(localized: "Video"), i))
      case .trust, .refs:
        if !sources { jumps.append((String(localized: "Nguồn"), i)) }
        sources = true
      default:
        if let key = heading(p)?.dropFirst("muc-".count), let c = Self.chips.first(where: { $0.key == key }) { jumps.append((c.label, i)) }
      }
    }
    // Only over a long page, with a few to go to: a short one is a flick from top to foot.
    self.jumps = jumps.count >= 4 ? jumps : []
  }
}
