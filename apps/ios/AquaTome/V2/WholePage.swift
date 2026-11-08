import Handbook
import SwiftUI

/// A part of the page under its heading on v2's species page, as an app's description in the App Store: a long one shows
/// its first lines, then "thêm", which opens it in place; a short one shows whole.
@available(iOS 18, *)
struct V2Section<Content: View>: View {
  let title: String?
  /// The heading's id, which a `#id` link scrolls to.
  var anchor: String?
  /// Text folds; a row of videos or cards shows whole, each its own size.
  var folds = true
  @ViewBuilder let content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      if let title {
        Text(verbatim: title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
          .fixedSize(horizontal: false, vertical: true)
      }
      if folds { V2Fold { content } } else { content }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
    .id(anchor ?? title ?? "")
  }
}

/// What's longer than a screenful of reading shown to its first lines, fading out over a "thêm" that opens it in place;
/// shorter, whole. With VoiceOver on, whole: it reads on past what the eye sees, and a fold would only stand in its way.
@available(iOS 18, *)
struct V2Fold<Content: View>: View {
  @ViewBuilder let content: Content
  /// About eight lines of the reader's text.
  @ScaledMetric(relativeTo: .body) private var shown: CGFloat = 190
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @State private var open = false
  @State private var height: CGFloat = 0

  /// Folded only when that hides more than a few lines: not a fold over the last two.
  private var folded: Bool { !open && !voiceOver && height > shown * 1.4 }

  var body: some View {
    content
      .fixedSize(horizontal: false, vertical: true)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
      .frame(maxHeight: folded ? shown : nil, alignment: .top)
      .clipped()
      .mask {
        LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: folded ? 0.72 : 1),
                               .init(color: .black.opacity(folded ? 0 : 1), location: 1)], startPoint: .top, endPoint: .bottom)
      }
      // What's under the fold isn't there to touch either.
      .allowsHitTesting(!folded)
      .overlay(alignment: .bottomTrailing) {
        if folded {
          Button { withAnimation(.easeInOut(duration: 0.25)) { open = true } } label: {
            Text("thêm").font(.body.weight(.semibold)).padding(.leading, 28).frame(minHeight: 44)
              .background(LinearGradient(stops: [.init(color: Color(.systemBackground).opacity(0), location: 0), .init(color: Color(.systemBackground), location: 0.45)],
                                         startPoint: .leading, endPoint: .trailing))
          }
          .buttonStyle(.plain)
          .foregroundStyle(Color.accentColor)
          .accessibilityIdentifier("v2-more")
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
      // A heading inside a part (a questions' title) at v2's own size, not v1's serif.
      Text(look == .heading ? plain(s) : s)
        .font(look == .heading ? .title3.weight(.bold) : nil)
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
    case let .video(id, title, caption):
      VideoSlot(id: id, title: title, caption: caption)
    case let .pages(title, paths):
      PagesBlock(title: title, paths: paths, titled: false)
    case let .cards(title, cards, good):
      CardsPart(title: title, cards: cards, good: good, open: open)
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

/// A page's parts (PagePart) for v2's species page, each with its heading, the anchor a `#id` link scrolls to and its
/// pieces: worked out once when the page comes, not on each redraw.
struct WholeParts {
  let parts: [PagePart]
  let titles: [String?]
  let anchors: [String?]
  let pieces: [[NativePage.Piece]]
  /// The videos it shows, which a moment's link plays in place.
  let videos: Set<String>

  init(_ doc: PageDoc) {
    parts = PagePart.of(doc)
    var titles: [String?] = [], anchors: [String?] = [], pieces: [[NativePage.Piece]] = []
    for p in parts {
      var out: [NativePage.Piece] = []
      for b in p.blocks { NativePage.add(doc.blocks[b], to: &out) }
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
      titles.append(title); anchors.append(anchor); pieces.append(out)
    }
    self.titles = titles
    self.anchors = anchors
    self.pieces = pieces
    videos = Set(pieces.joined().compactMap { if case let .video(id, _, _) = $0 { id } else { nil } })
  }
}
