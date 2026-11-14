import Handbook
import SwiftUI
import UIKit

// The v2 look's shared parts: a handbook photo that tells its colour, the lockup (a page's photo, name, line and its
// action), the facts strip, a shelf's header, and the press of a card.

/// A handbook photo in its frame, and the colour drawn from it once it's decoded (`colour`), for the band, wash or page
/// around it. The index carries a 480 px copy and the page the full one: the full one only for a frame much past 480 px,
/// so a shelf's squares and tiles never fetch it. With where its fish is (`box`), the whole animal stays in the frame, by
/// the site's rule at the size it's drawn (PhotoFrame): the crop centred, or moved onto the fish, or the photo whole on
/// the mat or its own blur. Without one, centred, as before.
struct V2Photo: View {
  let src: String?
  var box: PhotoBox?
  /// What its colour is known by, if not `src`: a fish's page looks it up by the index's photo, which a tank-mate's tile may
  /// show in another size.
  var colourKey: String?
  /// The colour of the card or page around it, for its place when it doesn't come: that colour, not a grey band in it.
  var ground: Color?
  /// A page's head: whole on `ground`, never on its own blur (the frames spec's page head, approved 11 Nov).
  var onGround = false
  var colour: ((Color) -> Void)?
  /// The photo's own shape (its width over its height), once it's there: a page's head takes it where the banner would cut it.
  var shape: ((CGFloat) -> Void)?
  @State private var picture: (src: String, image: UIImage)?
  /// The address that didn't come (offline, not kept).
  @State private var missing: String?
  @State private var pixels = CGSize.zero
  @State private var points = CGSize.zero
  @Environment(\.displayScale) private var scale
  @Environment(\.v2PhotoTries) private var tries
  /// Back in the app: a photo that didn't come asks again, as a page kept under another may have been shown offline.
  @Environment(\.scenePhase) private var phase
  @State private var again = 0

  /// What this address shows: what was decoded here, or what's in memory at any size, the full photo first, so a page
  /// zooming out of a card has it in its first frame.
  private var image: UIImage? {
    if let picture, picture.src == src { return picture.image }
    return src.flatMap { PageImages.cached(V2Photo.full($0)) ?? PageImages.cached($0) }
  }

  var body: some View {
    Rectangle().fill(.fill.tertiary)
      .overlay {
        if let image {
          framed(image).transition(.opacity)
        } else {
          ZStack {
            // No photo yet, none at all, or one that didn't come: in the colour around it, if any, not a grey band in it.
            if let ground { ground }
            // One that didn't come: a photo's place, not an empty box, as v1's pictures show it. Not read: what the photo
            // was of is in the page's or the row's own words. None for no photo at all: a row has its own mark.
            if let src, missing == src {
              Image(systemName: "photo").font(.title2)
                .foregroundStyle(ground == nil ? AnyShapeStyle(.tertiary) : AnyShapeStyle(.white.opacity(0.4)))
                .accessibilityIdentifier("v2-photo-missing").accessibilityHidden(true)
            }
          }
        }
      }
      .clipped()
      .onGeometryChange(for: CGSize.self) { $0.size } action: { points = $0; pixels = CGSize(width: $0.width * scale, height: $0.height * scale) }
      .onChange(of: phase) { if phase == .active, let src, missing == src { again += 1 } }
      .onChange(of: image?.size, initial: true) { _, s in if let shape, let s, s.height > 0 { shape(s.width / s.height) } }
      .task(id: "\(src ?? "")|\(Int(pixels.width))x\(Int(pixels.height))|\(tries)|\(again)") {
        guard let src, pixels.width > 0 else { return }
        let size = PageImages.Size.filling(pixels)
        let full = V2Photo.full(src)
        // Its colour now, not once the full photo has come. Asked before loading: the loader puts what it decodes in memory,
        // where `image` finds it, so after it a first photo would look as if it had been there and pop in.
        let shown = image
        if let colour, let shown { colour(await PhotoColour.of(shown, key: colourKey ?? src)) }
        var loaded: UIImage?
        // A big frame: the full photo (a 480 px copy counts as large enough for any frame to the cache, which never decodes
        // past a picture's own size).
        if full != src, pixels.width > 600 || pixels.height > 600 { loaded = await PageImages.image(full, size) }
        if loaded == nil { loaded = await PageImages.image(src, size) }
        guard !Task.isCancelled else { return }
        guard let loaded else { if shown == nil { missing = src }; return }
        // Faded in as it comes; one in its place already, swapped.
        withAnimation(shown == nil ? .easeOut(duration: 0.2) : nil) { picture = (src, loaded) }
        missing = nil
        if let colour { colour(await PhotoColour.of(loaded, key: colourKey ?? src)) }
      }
  }

  /// The photo as the frame shows it: covering it, its window centred or moved onto the fish by its share of the overflow
  /// (as CSS's object-position); or whole, the strips beside it the mat (the card's colour, else the frame's own fill)
  /// where they're narrow, else the same photo blurred (frames.md, the Design Lead, 13 Nov).
  @ViewBuilder private func framed(_ image: UIImage) -> some View {
    let aspect = image.size.width / max(image.size.height, 1), ratio = points.width / max(points.height, 1)
    switch box == nil || points.width == 0 ? PhotoFrame.cover(x: 0.5, y: 0.5) : PhotoFrame.of(aspect: aspect, box: box, ratio: ratio) {
    case let .cover(x, y):
      let s = max(points.width / max(image.size.width, 1), points.height / max(image.size.height, 1))
      Image(uiImage: image).resizable().scaledToFill()
        .offset(x: (0.5 - x) * (image.size.width * s - points.width), y: (0.5 - y) * (image.size.height * s - points.height))
    case .whole:
      // Each sized to the frame here, not by its own fit or fill: the blur's fill, larger than the frame, laid the whole
      // photo out at its own size, so it showed cut as a centred cover would (the owner's report of 14 Nov, Cá chạch's list).
      let fit = min(points.width / max(image.size.width, 1), points.height / max(image.size.height, 1))
      let fill = max(points.width / max(image.size.width, 1), points.height / max(image.size.height, 1))
      ZStack {
        switch onGround ? .mat : PhotoFrame.ground(aspect: aspect, ratio: ratio) {
        case .mat: if let ground { ground }
        case .blur:
          Image(uiImage: image).resizable().frame(width: image.size.width * fill, height: image.size.height * fill)
            .scaleEffect(PhotoFrame.blurScale)
            .blur(radius: PhotoFrame.blurRadius(height: points.height), opaque: true)
        }
        Image(uiImage: image).resizable().frame(width: image.size.width * fit, height: image.size.height * fit)
      }
      .frame(width: points.width, height: points.height)
      .clipped()
    }
  }

  /// The full-size photo of an index's 480 px copy (`…-480.webp` → `….webp`), as the page's own `lead` is.
  static func full(_ src: String) -> String {
    src.hasSuffix("-480.webp") ? String(src.dropLast("-480.webp".count)) + ".webp" : src
  }
}

/// The colour a photo gives the page around it: its most vivid colour with enough of the picture behind it, deep enough
/// for small white words at 75% on it (4.5:1 at least). Worked out once per photo, off the main thread.
enum PhotoColour {
  @MainActor private static var known: [String: Color] = [:]

  /// Its colour if it's already known, so a page opens in the colour of the card it opened from.
  @MainActor static func cached(_ key: String?) -> Color? { key.flatMap { known[$0] } }

  @MainActor static func of(_ image: UIImage, key: String) async -> Color {
    if let c = known[key] { return c }
    guard let cg = image.cgImage else { return fallback }
    let rgb = await Task.detached(priority: .utility) { pick(cg) }.value
    let c = rgb.map { Color(red: $0.r, green: $0.g, blue: $0.b) } ?? fallback
    known[key] = c
    return c
  }

  /// The app's deep green, for a photo that gives no colour.
  static let fallback = Color(red: fallbackRGB.r, green: fallbackRGB.g, blue: fallbackRGB.b)
  fileprivate static let fallbackRGB = (r: 0.12, g: 0.27, b: 0.21)

  /// The photo at 24 × 24, its pixels in 4-bit buckets; the bucket that's both common and vivid, deepened until white
  /// reads on it.
  nonisolated static func pick(_ cg: CGImage) -> (r: Double, g: Double, b: Double)? {
    let n = 24
    var px = [UInt8](repeating: 0, count: n * n * 4)
    guard let ctx = CGContext(data: &px, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4,
                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    ctx.interpolationQuality = .medium
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))
    var buckets: [Int: (count: Double, r: Double, g: Double, b: Double)] = [:]
    for i in stride(from: 0, to: px.count, by: 4) {
      let r = Double(px[i]) / 255, g = Double(px[i + 1]) / 255, b = Double(px[i + 2]) / 255
      let key = (Int(px[i]) >> 4) << 8 | (Int(px[i + 1]) >> 4) << 4 | Int(px[i + 2]) >> 4
      let o = buckets[key] ?? (0, 0, 0, 0)
      buckets[key] = (o.count + 1, o.r + r, o.g + g, o.b + b)
    }
    let scored = buckets.values.map { v -> (score: Double, r: Double, g: Double, b: Double) in
      let r = v.r / v.count, g = v.g / v.count, b = v.b / v.count
      // Chroma, not saturation: a near-black's saturation reads high from tiny differences, its chroma stays low.
      let mx = max(r, g, b), mn = min(r, g, b), light = (mx + mn) / 2, chroma = mx - mn
      // Near-black and near-white say little about the photo.
      let fair = light < 0.15 || light > 0.9 ? 0.2 : 1
      return (v.count.squareRoot() * (0.1 + 2 * chroma) * fair, r, g, b)
    }
    let ranked = scored.sorted { $0.score > $1.score }
    guard let top = ranked.first else { return nil }
    // A yellow goes olive as it deepens: the photo's next vivid colour first, if it has enough of it.
    let own = isYellow(top) ? ranked.first { !isYellow($0) && hsb($0).s >= 0.45 && hsb($0).v >= 0.3 && $0.score >= 0.3 * top.score } : nil
    var c = calmed(own ?? top)
    // Deepened until white at 75% on it has 4.5:1 whatever the hue (relative luminance at most 0.09).
    func lum(_ x: Double) -> Double { x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4) }
    for _ in 0..<40 where 0.2126 * lum(c.r) + 0.7152 * lum(c.g) + 0.0722 * lum(c.b) > 0.09 {
      c = (c.score, c.r * 0.92, c.g * 0.92, c.b * 0.92)
    }
    return (c.r, c.g, c.b)
  }
}

private typealias Scored = (score: Double, r: Double, g: Double, b: Double)

/// Its hue in degrees, saturation and brightness.
private func hsb(_ c: Scored) -> (h: Double, s: Double, v: Double) {
  var h: CGFloat = 0, s: CGFloat = 0, v: CGFloat = 0
  UIColor(red: c.r, green: c.g, blue: c.b, alpha: 1).getHue(&h, saturation: &s, brightness: &v, alpha: nil)
  return (h * 360, s, v)
}

private func isYellow(_ c: Scored) -> Bool {
  let (h, s, _) = hsb(c)
  return h >= 42 && h < 88 && s >= 0.1
}

/// A colour that holds up over a whole page, deepened. A near-grey's hue means nothing: the app's green. A sand goes to warm
/// brown by degrees from amber, not the khaki it deepens to. A yellow left goes to amber or leaf green, nothing between: every
/// hue between them deepens to olive. A vivid red reads as a warning, with "Tránh" red on the same page: its saturation is
/// capped. Other hues stay as the photo has them.
private func calmed(_ c: Scored) -> Scored {
  var (h, s, v) = hsb(c)
  if s < 0.1 { return (c.score, PhotoColour.fallbackRGB.r, PhotoColour.fallbackRGB.g, PhotoColour.fallbackRGB.b) }
  if h >= 42 && h < 88 {
    if s < 0.35 {
      let by = min((h - 42) / 8, 1)
      h = 42 - 14 * by
      s = max(s, 0.4 * by)
    } else {
      h = h < 46 ? 40 : 88
      s = min(s, 0.85)
    }
  }
  if h < 25 || h >= 340 { s = min(s, 0.72) }
  var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0
  UIColor(hue: h / 360, saturation: s, brightness: v, alpha: 1).getRed(&r, green: &g, blue: &b, alpha: nil)
  return (c.score, r, g, b)
}

/// A scientific name. At the accessibility sizes on one line if it fits, else a word a line, made smaller if it must to fit:
/// a genus too long for one broke into a line that read as another word ("Paracheirod", "on innesi").
struct LatinName: View {
  let text: String
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    if size.isAccessibilitySize {
      // On one line when it fits; else a word a line, all made smaller alike if one must be to fit its line.
      let words = text.split(separator: " ").map(String.init)
      ViewThatFits(in: .horizontal) {
        Text(verbatim: text).lineLimit(1)
        Text(verbatim: words.joined(separator: "\n")).lineLimit(words.count).minimumScaleFactor(0.5)
      }
    } else {
      Text(verbatim: text)
    }
  }
}

/// A page as one line of a shelf or a card: its photo as a rounded square (the page's "icon"), its name, a line, and its
/// button, the same wherever the page shows: "Thêm" onto a tank for a fish or plant, "Đọc" for a guide, else "Xem". The
/// name and photo open the page; the button is its own.
/// "Thêm vào bể"'s sheet, whose "Xem trong Bể của tôi →" opens the tank once the sheet has closed, as v1's page does
/// (PageView): changing the tab under a closing sheet is a race.
private struct PutOnTankSheet: ViewModifier {
  let item: HandbookIndex.Item
  @Binding var putting: Bool
  @Environment(\.openScreen) private var openScreen
  @State private var openAfter: String?

  func body(content: Content) -> some View {
    content.sheet(isPresented: $putting, onDismiss: {
      if let id = openAfter { openAfter = nil; openScreen(.tanks(id)) }
    }) {
      if let life = Life(item) { NavigationStack { PutOnTank(life: life, open: { openAfter = $0; putting = false }) } }
    }
  }
}

extension View {
  func v2PutOnTank(_ item: HandbookIndex.Item, isPresented: Binding<Bool>) -> some View {
    modifier(PutOnTankSheet(item: item, putting: isPresented))
  }
}

struct Lockup: View {
  let item: HandbookIndex.Item
  /// Its first line, the page's name unless the card already says it; that card is the stop VoiceOver reads and opens,
  /// so the row is hidden from it (its "Thêm" isn't).
  var title: String?
  var line: String?
  var onDark = false
  /// Its photo as a rounded square, left out where the card shows it already.
  var icon = true
  /// On a Hôm nay card: its page opens as a post (`Post`).
  var post = false
  /// The photo's height: 3:2, 84 × 56 at size L (a square cut 81% of fish centred, 3:2 27%: the Design Lead's frames,
  /// 13 Nov), up to 132 × 88 over the words at the accessibility sizes.
  @ScaledMetric(relativeTo: .body) var thumb: CGFloat = 56
  @Environment(TanksModel.self) private var tanks
  @Environment(\.dynamicTypeSize) private var size
  @State private var putting = false

  var body: some View {
    // At the accessibility sizes the button goes under the words, and the photo over them: the words get the row's whole
    // width, where beside the photo a long name ran a word to a line.
    let layout = size.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
    let tall = min(thumb, 88), wide = tall * 1.5
    layout {
      link {
        layout {
          if icon {
            // A fish's colour worked out here too, so its page opens in it, not in green first.
            V2Photo(src: item.img, box: item.imgBox, colour: item.kind == .fish ? { _ in } : nil)
              .frame(width: wide, height: tall)
              .clipShape(.rect(cornerRadius: tall * 0.23, style: .continuous))
              .overlay { if item.img == nil { Image(systemName: item.kind.symbol).font(.title3).foregroundStyle(.secondary).accessibilityHidden(true) } }
              .overlay { RoundedRectangle(cornerRadius: tall * 0.23, style: .continuous).strokeBorder(.primary.opacity(0.08), lineWidth: 0.5) }
          }
          VStack(alignment: .leading, spacing: 2) {
            Group {
              if scientific, let title, title == item.sub { LatinName(text: title) } else { Text(verbatim: title ?? item.name) }
            }
            .font(.body.weight(.semibold)).italic(scientific && title != nil && title == item.sub)
            .lineLimit(size.isAccessibilitySize ? nil : 2)
            .foregroundStyle(onDark ? .white : .primary)
            if let line = line ?? Lockup.line(item), line != title {
              Group {
                if size.isAccessibilitySize, scientific, line == item.sub {
                  LatinName(text: line)
                } else if size.isAccessibilitySize {
                  // A line of figures too long for one row goes a figure to a row, so no dot is left at a row's end or start.
                  ViewThatFits(in: .horizontal) {
                    Text(verbatim: line).lineLimit(1)
                    Text(verbatim: line.replacingOccurrences(of: " · ", with: "\n"))
                  }
                } else {
                  Text(verbatim: line).lineLimit(1)
                }
              }
              .font(.subheadline).italic(scientific && line == item.sub)
              .foregroundStyle(onDark ? Color.white.opacity(0.75) : .v2Faint)
            }
          }
          if !size.isAccessibilitySize { Spacer(minLength: 0) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityHidden(title != nil)
      button
    }
    .v2PutOnTank(item, isPresented: $putting)
  }

  @ViewBuilder private var button: some View {
    if Life(item) != nil {
      Button { putting = true } label: { Text("Thêm").capsule(onDark) }
        .buttonStyle(.plain)
        // Not into a store this app must leave alone (newer, unreadable), as v1's page.
        .disabled(!tanks.canEdit)
        .opacity(tanks.canEdit ? 1 : 0.45)
        // Read with the fish's name: a shelf of them isn't "Thêm vào bể" again and again.
        .accessibilityLabel(Text("Thêm \(item.name) vào bể"))
    } else {
      // The same page the row opens: one stop for VoiceOver, the row.
      link { Text(item.kind == .guide ? "Đọc" : "Xem").capsule(onDark) }.buttonStyle(.plain)
        .accessibilityHidden(true)
    }
  }

  /// To its page, or to it as a post.
  @ViewBuilder private func link<Label: View>(@ViewBuilder _ label: () -> Label) -> some View {
    if post { NavigationLink(value: Post(item: item), label: label) } else { NavigationLink(value: item, label: label) }
  }

  /// `sub` is a scientific name, in italics, on these; a video series' is its channel.
  private var scientific: Bool { item.kind == .fish || item.kind == .plant }

  /// The line under a page's name: a fish's scientific name, a plant's, a video series' count, a guide's kind; none for
  /// kit, under its own heading.
  static func line(_ item: HandbookIndex.Item) -> String? {
    if item.kind == .video, let n = item.parts { return String(localized: "\(n) video") }
    return item.subUnderName ?? (item.kind == .equipment ? nil : item.kind.title)
  }
}

private extension Text {
  /// The lockup's capsule: tinted on the page, white on a photo's colour.
  func capsule(_ onDark: Bool) -> some View {
    font(.subheadline.weight(.bold))
      .foregroundStyle(onDark ? Color.white : Color.accentColor)
      .padding(.horizontal, 16)
      .padding(.vertical, 5)
      .frame(minWidth: 72, minHeight: 30)
      .background(Capsule().fill(onDark ? AnyShapeStyle(.white.opacity(0.15)) : AnyShapeStyle(.fill.tertiary)))
      .frame(minHeight: 44)
      .contentShape(.rect)
  }
}

/// A shelf's header: its name and, when there's more than the shelf shows, "Xem tất cả" to the whole list.
struct ShelfHeader<More: Hashable>: View {
  let title: LocalizedStringKey
  var more: More?

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text(title).font(.title2.weight(.bold))
      Spacer()
      if let more {
        NavigationLink(value: more) { Text("Xem tất cả").frame(minHeight: 44).contentShape(.rect) }.font(.body)
      }
    }
    .padding(.horizontal, 20)
  }
}

/// Words on a photo's colour, the photo in the space left in `height` and fading into them: opaque behind the words
/// however long they run (4.5:1 on any photo), and the subject centred in what's left, not hidden by them.
struct WordsOnPhoto<Words: View>: ViewModifier {
  let colour: Color
  let edge: VerticalEdge
  let height: CGFloat
  /// Long enough to dissolve into the photo: on one with a black ground, 56 ended in a hard stripe.
  var fade: CGFloat = 120
  @ViewBuilder let words: Words
  @State private var wordsHeight: CGFloat = 0

  func body(content: Content) -> some View {
    VStack(spacing: 0) {
      if edge == .top { colour.frame(height: wordsHeight) }
      content.overlay(alignment: edge == .top ? .top : .bottom) {
        LinearGradient(colors: [colour, colour.opacity(0)], startPoint: edge == .top ? .top : .bottom,
                       endPoint: edge == .top ? .bottom : .top).frame(height: fade)
      }
      if edge == .bottom { colour.frame(height: wordsHeight) }
    }
    .frame(height: height)
    .overlay(alignment: edge == .top ? .topLeading : .bottomLeading) {
      words.onGeometryChange(for: CGFloat.self) { $0.size.height } action: { wordsHeight = $0 }
    }
  }
}

/// A solid band behind the status bar and the bar, fading into the page below them, while `shown`: iOS's own edges leave a
/// page's words legible through the glass, the hard one too. `ground`, the colour under it: the page's, where that isn't
/// the screen's.
struct ClearUnderTopBar: ViewModifier {
  let shown: Bool
  var ground = Color(.systemBackground)
  /// Growing with the text: a line straddling the band's edge fades, not sliced.
  @ScaledMetric(relativeTo: .body) private var fade: CGFloat = 16

  func body(content: Content) -> some View {
    edgeHidden(content)
      .safeAreaInset(edge: .top, spacing: 0) {
        Color.clear.frame(height: 0)
          .background(ground.opacity(shown ? 1 : 0))
          .overlay(alignment: .top) {
            LinearGradient(colors: [ground, ground.opacity(0)], startPoint: .top, endPoint: .bottom)
              .frame(height: fade).opacity(shown ? 1 : 0).allowsHitTesting(false)
          }
          // Not on `ground`: iOS turns the bar's words at once, and black on the colour for a moment reads badly.
          .animation(.easeInOut(duration: 0.2), value: shown)
      }
  }

  @ViewBuilder private func edgeHidden(_ content: Content) -> some View {
    if #available(iOS 26, *) { content.scrollEdgeEffectHidden(true, for: .top) } else { content }
  }
}

/// `ClearUnderTopBar` for a screen with iOS's large title: the band comes once the title has gone up into the bar, when the
/// page's words are under the bar. Before that it would stand over the title (10 Nov). iOS 17 has no edge to replace.
struct ClearUnderLargeTitle: ViewModifier {
  var ground = Color(.systemBackground)
  @State private var titleGone = false
  @ScaledMetric(relativeTo: .largeTitle) private var titleHeight: CGFloat = 44

  func body(content: Content) -> some View {
    if #available(iOS 18, *) {
      content
        .onScrollGeometryChange(for: Bool.self) { [titleHeight] in $0.contentOffset.y + $0.contentInsets.top > min(titleHeight, V2Fade.largeTitleAtMost) } action: { _, gone in titleGone = gone }
        .modifier(ClearUnderTopBar(shown: titleGone, ground: ground))
    } else {
      content
    }
  }
}

extension ShapeStyle where Self == Color {
  /// A line under a page's name: the text's colour at 60%. The system's secondary measures 3.5:1 on white, under 4.5:1.
  static var v2Faint: Color { .primary.opacity(0.6) }
}

extension View {
  /// A shelf's far edge: its sliver of the next card stays a hint, its words too faint to read cut through.
  @available(iOS 18, *)
  func v2ShelfEdge() -> some View { modifier(ShelfEdge()) }
}

@available(iOS 18, *)
private struct ShelfEdge: ViewModifier {
  /// The shelf's last card, whole at its end.
  @State private var atEnd = false

  func body(content: Content) -> some View {
    content
      .onScrollGeometryChange(for: Bool.self) { $0.visibleRect.maxX >= $0.contentSize.width - 1 } action: { _, end in
        withAnimation(.easeOut(duration: 0.15)) { atEnd = end }
      }
      .mask {
        HStack(spacing: 0) {
          Color.black
          // From the gap before the sliver (`shelfCard`'s 36 points), so the sliver starts faint.
          LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black.opacity(0.4), location: 0.25), .init(color: .clear, location: 1)],
                         startPoint: .leading, endPoint: .trailing)
            .overlay { Color.black.opacity(atEnd ? 1 : 0) }
            .frame(width: 48)
        }
      }
  }
}

extension ToolbarContent {
  /// A bar item with iOS 26's glass around it or not, where it stays either way: the bar doesn't move when it changes.
  @ToolbarContentBuilder func v2Glass(_ on: Bool) -> some ToolbarContent {
    if #available(iOS 26, *) { sharedBackgroundVisibility(on ? .visible : .hidden) } else { self }
  }
}

/// How wide a card is on a shelf of `across` whole cards, then a sliver of the next, fading out (`v2ShelfEdge`). `w` is the
/// shelf's width less its 20-point margins.
func shelfCard(_ w: CGFloat, across: CGFloat, spacing: CGFloat) -> CGFloat {
  (w + 20 - 36 - across * spacing) / across
}

/// A card pressed: it gives a little under the finger, as the App Store's do; with Reduce Motion it dims a little instead
/// of moving.
struct CardPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View { Pressed(configuration: configuration) }

  private struct Pressed: View {
    let configuration: Configuration
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
      configuration.label
        .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
        .opacity(configuration.isPressed && reduceMotion ? 0.8 : 1)
        .animation(reduceMotion ? .easeInOut(duration: 0.1) : .spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
  }
}

extension View {
  /// A card's shape: rounded, with a soft shadow, and in the dark a hairline.
  func v2Card(_ radius: CGFloat = 22) -> some View { modifier(CardShape(radius: radius)) }
}

private struct CardShape: ViewModifier {
  let radius: CGFloat
  @Environment(\.colorScheme) private var scheme

  func body(content: Content) -> some View {
    content
      .clipShape(.rect(cornerRadius: radius, style: .continuous))
      // A black photo on the black page would lose the card's edge, and no shadow shows there.
      .overlay { if scheme == .dark { RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(.white.opacity(0.08), lineWidth: 0.5) } }
      .shadow(color: .black.opacity(0.14), radius: 16, y: 8)
  }
}
