import Handbook
import SwiftUI
import UIKit

// The v2 look's shared parts: a handbook photo that tells its colour, the lockup (a page's photo, name, line and its
// action), the facts strip, a shelf's header, and the press of a card.

/// A handbook photo filling its frame, and the colour drawn from it once it's decoded (`colour`), for the band, wash or
/// page around it. The index carries a 480 px copy and the page the full one: the full one only for a frame much past
/// 480 px, so a shelf's squares and tiles never fetch it.
struct V2Photo: View {
  let src: String?
  var colour: ((Color) -> Void)?
  @State private var picture: (src: String, image: UIImage)?
  @State private var pixels = CGSize.zero
  @Environment(\.displayScale) private var scale

  var body: some View {
    Rectangle().fill(.fill.tertiary)
      .overlay {
        if let picture, picture.src == src {
          Image(uiImage: picture.image).resizable().scaledToFill().transition(.opacity)
        }
      }
      .clipped()
      .onGeometryChange(for: CGSize.self) { $0.size } action: { pixels = CGSize(width: $0.width * scale, height: $0.height * scale) }
      .task(id: "\(src ?? "")|\(Int(pixels.width))x\(Int(pixels.height))") {
        guard let src, pixels.width > 0 else { return }
        let size = PageImages.Size.filling(pixels)
        let full = V2Photo.full(src)
        var image: UIImage?
        // A big frame: the full photo, the small copy shown meanwhile if it's in memory (a 480 px copy counts as large
        // enough for any frame to the cache, which never decodes past a picture's own size).
        if full != src, pixels.width > 600 || pixels.height > 600 {
          if picture?.src != src, let quick = PageImages.cached(src) {
            picture = (src, quick)
            // Its colour now, not once the full photo has come.
            if let colour { colour(await PhotoColour.of(quick, key: src)) }
          }
          image = await PageImages.image(full, size)
        }
        if image == nil { image = await PageImages.image(src, size) }
        guard let image, !Task.isCancelled else { return }
        withAnimation(.easeOut(duration: 0.2)) { picture = (src, image) }
        if let colour { colour(await PhotoColour.of(image, key: src)) }
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
  static let fallback = Color(red: 0.12, green: 0.27, blue: 0.21)

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
    guard var c = scored.max(by: { $0.score < $1.score }) else { return nil }
    // Deepened, its hue kept, until white at 75% on it has 4.5:1 whatever the hue (relative luminance at most 0.09).
    func lum(_ x: Double) -> Double { x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4) }
    for _ in 0..<40 where 0.2126 * lum(c.r) + 0.7152 * lum(c.g) + 0.0722 * lum(c.b) > 0.09 {
      c = (c.score, c.r * 0.92, c.g * 0.92, c.b * 0.92)
    }
    return (c.r, c.g, c.b)
  }
}

/// A page as one line of a shelf or a card: its photo as a rounded square (the page's "icon"), its name, a line, and its
/// button, the same wherever the page shows: "Thêm" onto a tank for a fish or plant, "Đọc" for a guide, else "Xem". The
/// name and photo open the page; the button is its own.
struct Lockup: View {
  let item: HandbookIndex.Item
  /// Its first line, the page's name unless the card already says it; that card is the stop VoiceOver reads and opens,
  /// so the row is hidden from it (its "Thêm" isn't).
  var title: String?
  var line: String?
  var onDark = false
  /// Its photo as a rounded square, left out where the card shows it already.
  var icon = true
  @ScaledMetric(relativeTo: .body) var thumb: CGFloat = 60
  @Environment(TanksModel.self) private var tanks
  @Environment(\.dynamicTypeSize) private var size
  @State private var putting = false

  var body: some View {
    // At the accessibility sizes the button goes under the words, which get the row's whole width.
    let layout = size.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
    let side = min(thumb, 88)
    layout {
      NavigationLink(value: item) {
        // Its photo level with the name when the words run to many lines.
        HStack(alignment: size.isAccessibilitySize ? .top : .center, spacing: 12) {
          if icon {
            // A fish's colour worked out here too, so its page opens in it, not in green first.
            V2Photo(src: item.img, colour: item.kind == .fish ? { _ in } : nil)
              .frame(width: side, height: side)
              .clipShape(.rect(cornerRadius: side * 0.23, style: .continuous))
              .overlay { if item.img == nil { Image(systemName: item.kind.symbol).font(.title3).foregroundStyle(.secondary) } }
              .overlay { RoundedRectangle(cornerRadius: side * 0.23, style: .continuous).strokeBorder(.primary.opacity(0.08), lineWidth: 0.5) }
          }
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: title ?? item.name).font(.body.weight(.semibold)).italic(scientific && title != nil && title == item.sub)
              .lineLimit(size.isAccessibilitySize ? nil : 2)
              .foregroundStyle(onDark ? .white : .primary)
            if let line = line ?? Lockup.line(item), line != title {
              Text(verbatim: line).font(.subheadline).italic(scientific && line == item.sub).lineLimit(size.isAccessibilitySize ? nil : 1)
                // Darker than the system's secondary, 3.5:1 on white: a fish's figures are what a row is read for.
                .foregroundStyle(onDark ? Color.white.opacity(0.75) : Color.primary.opacity(0.6))
            }
          }
          Spacer(minLength: 0)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityHidden(title != nil)
      button
    }
    .sheet(isPresented: $putting) { if let life = Life(item) { NavigationStack { PutOnTank(life: life) } } }
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
      NavigationLink(value: item) { Text(item.kind == .guide ? "Đọc" : "Xem").capsule(onDark) }.buttonStyle(.plain)
        .accessibilityHidden(true)
    }
  }

  /// `sub` is a scientific name, in italics, on these; a video series' is its channel.
  private var scientific: Bool { item.kind == .fish || item.kind == .plant }

  /// The line under a page's name: a fish's scientific name, a plant's, a video series' count, a guide's kind; none for
  /// kit, under its own heading.
  static func line(_ item: HandbookIndex.Item) -> String? {
    if item.kind == .video, let n = item.parts { return String(localized: "\(n) video") }
    return item.sub ?? (item.kind == .equipment ? nil : item.kind.title)
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

/// A fish's figures across the page, a column each (its name, the figure, a word under it), as an app's page has its
/// ratings, age and size: the temperature and pH drawn on their scales.
struct FactsStrip: View {
  let facts: HandbookIndex.Facts
  var onDark = false
  /// Left out where the page's "Nuôi chung" says it.
  var temperament = true
  @Environment(HandbookModel.self) private var handbook
  /// A column's narrowest, growing with the text: "BỂ TỐI THIỂU" whole at the larger sizes.
  @ScaledMetric(relativeTo: .caption2) private var column: CGFloat = 84
  @Environment(\.dynamicTypeSize) private var size

  struct Column: Identifiable {
    let id: Int
    let label: LocalizedStringKey
    let value: String
    var caption: String?
    /// Where the range sits on its scale, 0…1.
    var bar: ClosedRange<Double>?
    /// In capitals, as the strip's names are; pH keeps its own.
    var upper = true
  }

  var body: some View {
    if size.isAccessibilitySize {
      list
    } else if columns.count <= 4 {
      // A few share the width, not half of it empty, unless the text has grown past that.
      ViewThatFits(in: .horizontal) { row; strip }
    } else {
      strip
    }
  }

  /// At the accessibility sizes, one figure a line down the page: across, a column takes the screen and cuts the next
  /// figure short, "150 cm" reading "15".
  private var list: some View {
    VStack(alignment: .leading, spacing: 12) {
      ForEach(columns) { c in
        VStack(alignment: .leading, spacing: 2) {
          Text(c.label).font(.caption2.weight(.semibold)).textCase(c.upper ? .uppercase : nil)
            .foregroundStyle(onDark ? .white.opacity(0.75) : .secondary)
          Text(verbatim: c.caption.map { "\(c.value) (\($0))" } ?? c.value).font(.title3.weight(.bold))
            .foregroundStyle(onDark ? .white : .primary)
        }
        .accessibilityElement(children: .combine)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
  }

  private var row: some View {
    HStack(alignment: .top, spacing: 0) {
      ForEach(columns) { c in divided(c, columns.count == 1 ? AnyView(figure(c).padding(.leading, 8)) : AnyView(figure(c).frame(minWidth: column, maxWidth: .infinity))) }
      // One alone starts where the words above it do, not floating in the middle.
      if columns.count == 1 { Spacer(minLength: 0) }
    }
    .padding(.horizontal, 12)
  }

  private var strip: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(alignment: .top, spacing: 0) {
        ForEach(columns) { c in
          // Four whole on a phone, then only the next one's rule: there's more to see, and no figure cut in two.
          divided(c, figure(c).containerRelativeFrame(.horizontal) { w, _ in max(w / 4, column) })
        }
      }
      .padding(.leading, 12)
    }
    .contentMargins(.trailing, 28, for: .scrollContent)
    .mask {
      HStack(spacing: 0) {
        Color.black
        LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing).frame(width: 28)
      }
    }
  }

  private func figure(_ c: Column) -> some View {
    VStack(spacing: 5) {
      Text(c.label).font(.caption2.weight(.semibold)).textCase(c.upper ? .uppercase : nil).lineLimit(2)
        .multilineTextAlignment(.center)
        .foregroundStyle(onDark ? .white.opacity(0.75) : .secondary)
      Text(verbatim: c.value).font(.title3.weight(.bold)).lineLimit(1).minimumScaleFactor(0.8)
        .foregroundStyle(onDark ? .white : .primary)
      if let bar = c.bar {
        Capsule().fill(onDark ? .white.opacity(0.22) : Color.primary.opacity(0.1))
          .frame(width: 64, height: 4)
          .overlay(alignment: .leading) {
            Capsule().fill(onDark ? .white : Color.accentColor)
              .frame(width: max(6, 64 * (bar.upperBound - bar.lowerBound)), height: 4)
              .offset(x: 64 * bar.lowerBound)
          }
          .padding(.top, 2)
      } else if let caption = c.caption {
        Text(verbatim: caption).font(.caption).lineLimit(1).foregroundStyle(onDark ? .white.opacity(0.75) : .secondary)
      }
    }
  }

  private func divided(_ c: Column, _ view: some View) -> some View {
    view
      .padding(.vertical, 4)
      .overlay(alignment: .leading) {
        if c.id > 0 { Rectangle().fill(onDark ? .white.opacity(0.2) : Color.primary.opacity(0.12)).frame(width: 0.5).padding(.vertical, 8) }
      }
      .accessibilityElement(children: .combine)
  }

  private var columns: [Column] {
    let locale = Locale(identifier: handbook.lang)
    var out: [Column] = []
    func add(_ label: LocalizedStringKey, _ value: String, caption: String? = nil, bar: ClosedRange<Double>? = nil, upper: Bool = true) {
      out.append(Column(id: out.count, label: label, value: value, caption: caption, bar: bar, upper: upper))
    }
    func scale(_ r: HandbookIndex.Facts.Range, _ lo: Double, _ hi: Double) -> ClosedRange<Double> {
      let a = min(max((r.min - lo) / (hi - lo), 0), 1), b = min(max((r.max - lo) / (hi - lo), 0), 1)
      return min(a, b)...max(a, b)
    }
    // What a beginner asks first in view: how warm, how big a tank, how big it grows, how hard; then the rest.
    if let r = facts.tempC { add("Nhiệt độ", "\(HandbookIndex.Facts.range(r, locale)) °C", bar: scale(r, 10, 35)) }
    if let v = facts.tankCm { add("Bể tối thiểu", "\(HandbookIndex.Facts.number(v, locale)) cm") }
    if let v = facts.sizeCm { add("Kích thước", "\(HandbookIndex.Facts.number(v, locale)) cm") }
    if let d = facts.difficulty { add("Độ khó", FactsCard.level(d), caption: "\(HandbookIndex.Facts.number(d, locale))/8") }
    if let r = facts.ph { add("pH", HandbookIndex.Facts.range(r, locale), bar: scale(r, 4, 9), upper: false) }
    if let r = facts.gh { add("Độ cứng (dGH)", HandbookIndex.Facts.range(r, locale), upper: false) }
    if let r = facts.lifeYears { add("Tuổi thọ", "\(HandbookIndex.Facts.range(r, locale)) \(String(localized: "năm"))") }
    if temperament, let t = facts.temperament.flatMap(FactsCard.temperament) { add("Tính cách", t) }
    return out
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
  var fade: CGFloat = 56
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
/// page's words legible through the glass, the hard one too.
struct ClearUnderTopBar: ViewModifier {
  let shown: Bool

  func body(content: Content) -> some View {
    let ground = Color(.systemBackground)
    edgeHidden(content)
      .safeAreaInset(edge: .top, spacing: 0) {
        Color.clear.frame(height: 0)
          .background(ground.opacity(shown ? 1 : 0))
          .overlay(alignment: .top) {
            LinearGradient(colors: [ground, ground.opacity(0)], startPoint: .top, endPoint: .bottom)
              .frame(height: 12).opacity(shown ? 1 : 0).allowsHitTesting(false)
          }
          .animation(.easeInOut(duration: 0.2), value: shown)
      }
  }

  @ViewBuilder private func edgeHidden(_ content: Content) -> some View {
    if #available(iOS 26, *) { content.scrollEdgeEffectHidden(true, for: .top) } else { content }
  }
}

/// How wide a card is on a shelf of `across` whole cards, then a sliver of the next: never so much of it that its words are
/// cut through. `w` is the shelf's width less its 20-point margins.
func shelfCard(_ w: CGFloat, across: CGFloat, spacing: CGFloat) -> CGFloat {
  (w + 20 - 36 - across * spacing) / across
}

/// A card pressed: it gives a little under the finger, as the App Store's do.
struct CardPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .scaleEffect(configuration.isPressed ? 0.97 : 1)
      .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
  }
}

extension View {
  /// A card's shape: rounded, with a soft shadow.
  func v2Card(_ radius: CGFloat = 22) -> some View {
    clipShape(.rect(cornerRadius: radius, style: .continuous))
      .shadow(color: .black.opacity(0.14), radius: 16, y: 8)
  }
}
