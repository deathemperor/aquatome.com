import Handbook
import SwiftUI

/// The folds worked out for one copy of a page, which is what their places in a part's pieces are places in: a newer copy
/// comes with a page of its own. Kept across the app, a part that had got shorter was drawn past its end.
@available(iOS 18, *)
final class FoldMemo {
  fileprivate var worked: [String: V2Section.Fold] = [:]
}

/// A part of the page under its heading on v2's species page, as an app's description in the App Store: a long one shows
/// its opening, then "thêm", which opens the rest in place; a short one shows whole. It never folds through a photo or a
/// table: the pieces that fit in about eight lines of text show whole, then the next text's first lines, the last of them
/// to the column's edge and cut where it ends, its words fading out before "thêm" at that line's end (`FoldedText`), as
/// the App Store's description does. A tap on "thêm" or on the folded part opens it. What's folded away isn't drawn,
/// touched or read until it opens; what shows works as ever, its links too. With VoiceOver on, it doesn't fold:
/// VoiceOver reads on past what the eye sees, and a fold would only stand in its way.
///
/// Where it folds is worked out from its pieces' words and photos before it's drawn, not measured after: drawn whole and
/// then shrunk, a part moved what was laid out under it, so a chip's jump landed past its part. Worked out once for a part
/// at a width and a text size: the page draws again as its bar changes on the way down.
@available(iOS 18, *)
struct V2Section: View {
  /// The part's, for the fold worked out once.
  let key: String
  /// The folds worked out for this copy of the page.
  let memo: FoldMemo
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
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.dynamicTypeSize) private var size
  /// The page's own way with a link in the text, for every link but "thêm".
  @Environment(\.openURL) private var follow

  private static let gap: CGFloat = 14
  /// What shows, folded: its first pieces whole, then a text's first `lines` lines (of its first `chars`, more than they
  /// show, so the last runs to the edge), "thêm" ending the last; or the last whole text, all of it (`lines` nil), "thêm"
  /// ending it; or, where what's next is a photo or a table and the last whole one isn't text, the whole pieces, "thêm"
  /// under them.
  fileprivate enum Fold: Equatable { case none, pieces(Int), cut(Int, chars: Int, lines: Int?) }

  private var fold: Fold {
    guard folds, !open, !voiceOver, !pieces.isEmpty else { return .none }
    let w = width > 0 ? width : 402, at = "\(key) \(w) \(size)"
    if let f = memo.worked[at] { return f }
    let f = fold(in: w - 40)
    memo.worked[at] = f
    return f
  }

  /// About eight lines of the reader's text, folded only when that hides more than a few, and never through a photo, a
  /// table or a line; what shows never ends on a heading, a bold label or a lead-in over nothing.
  private func fold(in column: CGFloat) -> Fold {
    let tall = PieceHeight(width: column, size: size)
    let shown = tall.line * 8
    let heights = pieces.indices.map { tall.of(pieces[$0]) + ($0 > 0 ? Self.gap : 0) }
    guard heights.reduce(0, +) > shown * 1.4 else { return .none }
    var used: CGFloat = 0, n = 0
    while n < pieces.count, used + heights[n] <= shown {
      used += heights[n]
      n += 1
    }
    while n > 1, Self.leadsIn(pieces[n - 1]) {
      n -= 1
      used -= heights[n]
    }
    // The next text's opening, to the eighth line, or two lines of it where one is all that's left: it ends inside a text,
    // its last line to the edge, as the App Store's description does. Never all of it: then its last line ends short.
    if n < pieces.count, let p = Self.prose(pieces[n]) {
      let left = Int((shown - used - (n > 0 ? Self.gap : 0)) / tall.line), lines = tall.fewestLines(p.text, inset: p.inset)
      if left >= 1, lines >= 2 {
        let show = min(max(left, 2), lines - 1)
        // Two lines more than show, as measured a little narrower than drawn: drawn, it runs past the last shown.
        return .cut(n, chars: tall.cut(p.text, lines: show + 2, inset: p.inset), lines: show)
      }
    }
    // No room for a line of the next: the last whole text ends a line early instead, inside it, not a row of its own
    // under a gap; one of a single line, whole, "thêm" after it.
    if n > 0, let p = Self.prose(pieces[n - 1]) {
      let lines = tall.fewestLines(p.text, inset: p.inset)
      return .cut(n - 1, chars: p.text.characters.count, lines: lines >= 2 ? lines - 1 : nil)
    }
    // A label alone over a photo or a table: with it.
    if n == 1, Self.leadsIn(pieces[0]) { return pieces.count > 2 ? .pieces(2) : .none }
    // A first piece taller than all of it (a table, a photo): whole, the rest under "thêm".
    return n == 0 ? (pieces.count > 1 ? .pieces(1) : .none) : .pieces(n)
  }

  /// A heading, a bold label, or a line leading into what follows it ("…, gồm:").
  private static func leadsIn(_ piece: NativePage.Piece) -> Bool {
    guard case let .text(s, _, look) = piece else { return false }
    return [.heading, .subheading].contains(look) || String(s.characters).trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix(":")
  }

  private static func isText(_ piece: NativePage.Piece) -> Bool {
    if case .text = piece { true } else { false }
  }

  /// A text a fold can end in, and how far it's set in from the column's edges: a paragraph, a boxed one, a list's lines.
  private static func prose(_ piece: NativePage.Piece) -> (text: AttributedString, inset: CGFloat)? {
    guard case let .text(s, _, look) = piece, [.body, .boxed, .lead].contains(look), !leadsIn(piece) else { return nil }
    return (s, look == .boxed ? 28 : 0)
  }

  var body: some View {
    let fold = fold
    let whole = switch fold {
    case .none: pieces.count
    case let .pieces(n), let .cut(n, _, _): n
    }
    VStack(alignment: .leading, spacing: 10) {
      if let title {
        Text(verbatim: title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
          .fixedSize(horizontal: false, vertical: true)
      }
      VStack(alignment: .leading, spacing: Self.gap) {
        ForEach(0..<whole, id: \.self) { j in
          // Folded, a tap on its words opens it, as on the App Store's; not on a photo or a table, which have their own.
          if fold != .none, Self.isText(pieces[j]) {
            V2Piece(piece: pieces[j], open: link, full: full).contentShape(.rect).simultaneousGesture(TapGesture().onEnded { unfold() })
          } else {
            V2Piece(piece: pieces[j], open: link, full: full)
          }
        }
        switch fold {
        case let .cut(n, chars, lines):
          if case let .text(s, anchor, look) = pieces[n] {
            let end = s.characters.index(s.startIndex, offsetBy: min(chars, s.characters.count))
            // A boxed text's words as a paragraph's, its box drawn around them: the fade is the words', never the box's.
            FoldedText(piece: .text(AttributedString(s[s.startIndex..<end]), anchor: anchor, look: look == .boxed ? .body : look),
                       lines: lines, boxed: look == .boxed, link: link, full: full, more: unfold)
          }
        case .pieces:
          more.frame(maxWidth: .infinity, alignment: .trailing)
        case .none:
          EmptyView()
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
  }

  /// The part open in place, its height growing over a quarter of a second; at once with Reduce Motion.
  private func unfold() {
    guard !open else { return }
    withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.25)) { open = true }
  }

  /// "thêm" on its own under whole pieces, a photo or a table next.
  private var more: some View {
    Button(action: unfold) { Text("thêm").font(.body) }
      .buttonStyle(.plain)
      .foregroundStyle(Color.accentColor)
      .frame(minHeight: 44)
      .contentShape(.rect)
      .accessibilityIdentifier("v2-more")
  }
}

/// The text a fold ends in, as the App Store's description ends: its first `lines` lines (nil: all of it), the last running
/// to the column's edge and cut wherever it ends, mid-word too, with no "…"; on that line its words fade out over 1.75 em,
/// ending half an em before "thêm", which stands on the line's baseline at the column's right edge in the text's own size
/// and weight. The fade is the words' own, so they fade into whatever is behind them. A tap on it, as on "thêm", opens the
/// part, as the App Store's does; a link in it still goes where it goes. Measured off the owner's capture of the App Store
/// (11 Nov), at the body's size and so in em at any size.
@available(iOS 18, *)
private struct FoldedText: View {
  let piece: NativePage.Piece
  let lines: Int?
  /// A boxed text: its words, and so its fade and "thêm", sit inside the box's 14 points, the box drawn here.
  let boxed: Bool
  let link: (URL) -> Void
  let full: () -> Void
  let more: () -> Void
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    let f = UIFont.preferredFont(forTextStyle: .body, compatibleWith: UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(size)))
    let em = f.pointSize
    let link = ceil((String(localized: "thêm") as NSString).size(withAttributes: [.font: f]).width)
    let line = f.lineHeight
    // Its lines and the 3 points v2 puts between them (`V2Piece`).
    let height = lines.map { CGFloat($0) * line + CGFloat(max($0 - 1, 0)) * 3 }
    V2Piece(piece: piece, open: self.link, full: full)
      .fixedSize(horizontal: false, vertical: true)
      .frame(height: height, alignment: .top)
      .clipped()
      .mask {
        VStack(spacing: 0) {
          Color.black
          HStack(spacing: 0) {
            Color.black
            LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing).frame(width: (em * 1.75).rounded())
            Color.clear.frame(width: (em * 0.5).rounded() + link)
          }
          .frame(height: line)
        }
      }
      .overlay(alignment: .bottomTrailing) {
        // 44 points to tap, the look unchanged: the room is the button's, outside the word's own frame.
        Button(action: more) {
          Text("thêm").font(.body).padding(.vertical, 11).padding(.leading, 12).contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.accentColor)
        .padding(.vertical, -11).padding(.leading, -12)
        .accessibilityIdentifier("v2-more")
      }
      .contentShape(.rect)
      .simultaneousGesture(TapGesture().onEnded { more() })
      .padding(boxed ? 14 : 0)
      .background(boxed ? AnyShapeStyle(.fill.quaternary) : AnyShapeStyle(Color.clear), in: .rect(cornerRadius: 12))
      // Its place in the part, for the checks: the lines shown, not the text cut a line further.
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("v2-folded")
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

  /// The lines a text of the body takes.
  func lines(_ s: AttributedString, inset: CGFloat = 0) -> Int { count(String(s.characters), inset) }

  /// The fewest lines it can take as drawn, measured a little wider than drawn: a fold showing all but its last of these
  /// lines ends inside the text, never on its short last line.
  func fewestLines(_ s: AttributedString, inset: CGFloat = 0) -> Int { count(String(s.characters), inset - 16) }

  /// How much of a text shows in `lines` lines with "thêm" ending the last: all of it, where it fits with " thêm"; else the
  /// most, to a word's end, that fits with "… thêm".
  func cut(_ s: AttributedString, lines: Int, inset: CGFloat = 0) -> Int {
    let chars = Array(s.characters), more = String(localized: "thêm")
    if count(String(chars) + " " + more, inset) <= lines { return chars.count }
    let ends = chars.indices.filter { $0 > 0 && chars[$0].isWhitespace && !chars[$0 - 1].isWhitespace }
    var best = ends.first ?? chars.count, lo = 0, hi = ends.count - 1
    while lo <= hi {
      let mid = (lo + hi) / 2
      if count(String(chars[..<ends[mid]]) + "… " + more, inset) <= lines {
        best = ends[mid]
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return best
  }

  /// Its lines at the body's size, a few points narrower than drawn: links and bold runs set a little wider than the
  /// body's own font measures, and a line short of room would push "thêm" onto one more. Counted as they're laid out, not
  /// from their height: Vietnamese's marks stand taller than the font's line, and a height rounded up counted one too many.
  private func count(_ s: String, _ inset: CGFloat) -> Int {
    let storage = NSTextStorage(string: s, attributes: [.font: font(.body)])
    let layout = NSLayoutManager()
    storage.addLayoutManager(layout)
    let box = NSTextContainer(size: CGSize(width: max(width - inset - 8, 1), height: .greatestFiniteMagnitude))
    box.lineFragmentPadding = 0
    layout.addTextContainer(box)
    var lines = 0, glyph = 0
    while glyph < layout.numberOfGlyphs {
      var line = NSRange()
      layout.lineFragmentRect(forGlyphAt: glyph, effectiveRange: &line)
      lines += 1
      glyph = NSMaxRange(line)
    }
    return max(1, lines)
  }

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
    case let .video(_, _, caption, _):
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

/// A line of a list as NativePage writes one ("• …" or "1. …", four spaces a level in, two spaces for an item's next
/// paragraph), its words apart from its mark.
private struct ListLine: Identifiable {
  let id: Int
  let depth: Int
  let mark: String
  let words: AttributedString

  /// nil for a text that isn't a list.
  static func lines(of s: AttributedString) -> [ListLine]? {
    var out: [ListLine] = [], start = s.startIndex
    while start < s.endIndex {
      let rest = s.characters[start...]
      let end = rest.firstIndex(of: "\n") ?? s.endIndex
      let line = String(s.characters[start..<end])
      let body = line.drop { $0 == " " }
      let spaces = line.count - body.count
      var mark = ""
      if body.hasPrefix("• ") {
        mark = "•"
      } else if let dot = body.firstIndex(of: "."), dot != body.startIndex, body[..<dot].allSatisfy(\.isNumber),
                body[body.index(after: dot)...].hasPrefix(" ") {
        mark = String(body[...dot])
      } else if out.isEmpty || spaces == 0 {
        return nil
      }
      let from = s.characters.index(start, offsetBy: spaces + (mark.isEmpty ? 0 : mark.count + 1))
      out.append(ListLine(id: out.count, depth: spaces / 4, mark: mark, words: AttributedString(s[from..<end])))
      start = end < s.endIndex ? s.characters.index(after: end) : end
    }
    return out.isEmpty ? nil : out
  }
}

/// A list on v2's page: a line that wraps runs on under its own words, not under its mark.
private struct ListLines: View {
  let lines: [ListLine]
  /// A digit's width at the reader's size: the marks' column, as wide as the widest mark.
  @ScaledMetric(relativeTo: .body) private var digit: CGFloat = 10

  var body: some View {
    let column = digit * CGFloat(lines.map(\.mark.count).max() ?? 1)
    VStack(alignment: .leading, spacing: 6) {
      ForEach(lines) { line in
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(verbatim: line.mark).frame(width: column, alignment: .leading).accessibilityHidden(line.mark == "•")
          Text(line.words).frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.leading, CGFloat(line.depth) * 16)
      }
    }
  }
}

/// A piece of the page (NativePage.Piece, as v1's page has it) on v2's species page: its text at the reader's size, its
/// photos and tables in the page's width, its videos played in place, and a part this app can't draw as a link to v1's
/// page at that point, never missing.
@available(iOS 18, *)
struct V2Piece: View {
  let piece: NativePage.Piece
  /// A link of a photo's or a card's.
  let open: (URL) -> Void
  /// v1's page, for a part this one can't draw.
  let full: () -> Void

  var body: some View {
    switch piece {
    case let .text(s, anchor, look):
      Group {
        if let lines = ListLine.lines(of: s) {
          ListLines(lines: lines)
        } else {
          // A heading inside a part (a questions' title) at v2's own size, not v1's serif.
          Text(look == .heading ? plain(s) : s)
            .font(look == .heading ? .title3.weight(.bold) : nil)
        }
      }
        .lineSpacing([.body, .boxed, .lead].contains(look) ? 3 : 0)
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
    case let .video(id, title, caption, head):
      VideoSlot(id: id, title: title, caption: caption, head: head)
    case let .pages(title, paths):
      PagesBlock(title: title, paths: paths, titled: false)
    case let .cards(title, cards, good):
      // Their photos' credits at the page's foot ("Ảnh và giấy phép"): here a row of bare numbers between two lists.
      CardsPart(title: title, cards: cards, good: good, open: open, credits: false, v2: true)
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
    videos = Set(pieces.joined().compactMap { if case let .video(id, _, _, _) = $0 { id } else { nil } })
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
