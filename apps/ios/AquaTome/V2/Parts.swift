import Handbook
import SwiftUI
import UIKit

// The v2 look's shared parts: a handbook photo that tells its colour, the lockup (a page's photo, name, line and its
// action), the facts strip, a shelf's header, and the press of a card.

/// A handbook photo filling its frame, and the colour drawn from it once it's decoded (`colour`), for the band, wash or
/// page around it. The index carries a 480 px copy and the page the full one: the full one only for a frame wider or
/// taller than 480 px, so a shelf's small squares never fetch it.
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
        if full != src, pixels.width > 480 || pixels.height > 480 {
          if picture?.src != src, let quick = PageImages.cached(src) { picture = (src, quick) }
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
/// for white words on it (4.5:1 at least). Worked out once per photo, off the main thread.
enum PhotoColour {
  @MainActor private static var known: [String: Color] = [:]

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
    // Deepened, its hue kept, until white words on it have 4.5:1 (relative luminance at most 0.183).
    func lum(_ x: Double) -> Double { x <= 0.04045 ? x / 12.92 : pow((x + 0.055) / 1.055, 2.4) }
    for _ in 0..<40 where 0.2126 * lum(c.r) + 0.7152 * lum(c.g) + 0.0722 * lum(c.b) > 0.16 {
      c = (c.score, c.r * 0.92, c.g * 0.92, c.b * 0.92)
    }
    return (c.r, c.g, c.b)
  }
}

/// What a lockup's button does: puts the fish or plant on a tank, or opens the page.
enum LockupAction { case add, read, view, none }

/// A page as one line of a shelf or a card: its photo as a rounded square (the page's "icon"), its name, a line, and its
/// action. The name and photo open the page; the button is its own.
struct Lockup: View {
  let item: HandbookIndex.Item
  /// Its first line, the page's name unless the card already says it.
  var title: String?
  var line: String?
  var action = LockupAction.add
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
        HStack(spacing: 12) {
          if icon {
            V2Photo(src: item.img)
              .frame(width: side, height: side)
              .clipShape(.rect(cornerRadius: side * 0.23, style: .continuous))
              .overlay { RoundedRectangle(cornerRadius: side * 0.23, style: .continuous).strokeBorder(.primary.opacity(0.08), lineWidth: 0.5) }
          }
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: title ?? item.name).font(.body.weight(.semibold)).lineLimit(size.isAccessibilitySize ? 4 : 2)
              .foregroundStyle(onDark ? .white : .primary)
            if let line = line ?? Lockup.line(item) {
              Text(verbatim: line).font(.subheadline).lineLimit(size.isAccessibilitySize ? 2 : 1)
                .foregroundStyle(onDark ? .white.opacity(0.75) : .secondary)
            }
          }
          Spacer(minLength: 0)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      button
    }
    .sheet(isPresented: $putting) { if let life = Life(item) { NavigationStack { PutOnTank(life: life) } } }
  }

  @ViewBuilder private var button: some View {
    switch action {
    case .add where Life(item) != nil:
      Button { putting = true } label: { Text("Thêm").capsule(onDark) }
        .buttonStyle(.plain)
        // Not into a store this app must leave alone (newer, unreadable), as v1's page.
        .disabled(!tanks.canEdit)
        // Read with the fish's name: a shelf of them isn't "Thêm vào bể" again and again.
        .accessibilityLabel(Text("Thêm \(item.name) vào bể"))
    case .read, .view, .add:
      // The same page the row opens: one stop for VoiceOver, the row.
      NavigationLink(value: item) { Text(action == .read ? "Đọc" : "Xem").capsule(onDark) }.buttonStyle(.plain)
        .accessibilityHidden(true)
    case .none:
      EmptyView()
    }
  }

  /// The line under a page's name: a fish's scientific name, a plant's, a guide's kind.
  static func line(_ item: HandbookIndex.Item) -> String? {
    item.sub ?? item.kind.title
  }
}

private extension Text {
  /// The lockup's capsule: tinted on the page, white on a photo's colour.
  func capsule(_ onDark: Bool) -> some View {
    font(.subheadline.weight(.bold))
      .foregroundStyle(onDark ? Color.white : Color.accentColor)
      .padding(.horizontal, 16)
      .frame(minWidth: 72, minHeight: 30)
      .background(Capsule().fill(onDark ? AnyShapeStyle(.white.opacity(0.22)) : AnyShapeStyle(.fill.tertiary)))
      .frame(minHeight: 44)
      .contentShape(.rect)
  }
}

/// A fish's figures across the page, a column each (its name, the figure, a word under it), as an app's page has its
/// ratings, age and size: the temperature and pH drawn on their scales.
struct FactsStrip: View {
  let facts: HandbookIndex.Facts
  var onDark = false
  @Environment(HandbookModel.self) private var handbook
  /// A column's width, growing with the text: "BỂ TỐI THIỂU" whole at the larger sizes.
  @ScaledMetric(relativeTo: .caption2) private var column: CGFloat = 118

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
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(alignment: .top, spacing: 0) {
        ForEach(columns) { c in
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
              Text(verbatim: caption).font(.caption).lineLimit(1).foregroundStyle(onDark ? .white.opacity(0.7) : .secondary)
            }
          }
          .frame(width: column)
          .padding(.vertical, 4)
          .overlay(alignment: .leading) {
            if c.id > 0 { Rectangle().fill(onDark ? .white.opacity(0.2) : Color.primary.opacity(0.12)).frame(width: 0.5).padding(.vertical, 8) }
          }
          .accessibilityElement(children: .combine)
        }
      }
      .padding(.horizontal, 12)
    }
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
    if let t = facts.temperament.flatMap(FactsCard.temperament) { add("Tính cách", t) }
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
