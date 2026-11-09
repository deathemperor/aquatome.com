import Handbook
import SwiftUI

/// A species' facts as the site's data card has them (DataCard.astro): temperature, pH, hardness, size, lifespan, the
/// shortest tank and difficulty, the last as the site's badge (Difficulty.astro); a plant's care (difficulty, light, CO₂, growth, where
/// it goes). They come from the handbook's index kept on the phone, so they show offline too, page or no page: the page's
/// own copy doesn't repeat them. On a page the app draws (`inPage`), all of them at once under its name, the sources
/// behind them and the page's credit under the card (NativePage); over a web page, a row across its top.
struct FactsCard: View {
  let facts: HandbookIndex.Facts
  var plant: HandbookIndex.Plant?
  var inPage = false
  /// v2's card (docs/design/v2-fish-page.md): six figures, not its lifespan; in rows of three from the left, one missing
  /// closing up; its labels a size up, the difficulty's word plain, its "2/8" smaller.
  var v2 = false
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    let all = items
    if inPage {
      // As many to a row as fit the reader's text size: three, two, or one at the largest.
      let n = size.isAccessibilitySize ? 1 : size >= .xxLarge ? 2 : 3
      Grid(alignment: .topLeading, horizontalSpacing: 12, verticalSpacing: 16) {
        ForEach(v2 ? Self.plainRows(all.count, n) : Self.rows(all.count, n), id: \.self) { row in
          GridRow {
            ForEach(row, id: \.self) { i in
              Fact(item: all[i], large: true, v2: v2).frame(maxWidth: .infinity, alignment: .leading)
            }
          }
        }
      }
      .padding(16)
      .background(.fill.quaternary, in: .rect(cornerRadius: 12))
      .accessibilityElement(children: .contain)
      .accessibilityIdentifier("facts-card")
    } else {
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 16) {
          ForEach(all.indices, id: \.self) { i in Fact(item: all[i]) }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
      }
      .accessibilityIdentifier("facts-card")
    }
  }

  /// A fact: its label and value; the difficulty also its level (the badge's colour), its "6/8" and what VoiceOver reads.
  struct Item {
    let label: LocalizedStringKey
    let value: String
    var level: HandbookIndex.Facts.Level?
    var outOf: String?
    var spoken: String?
  }

  /// Each fact and its value in the site's order (FIELD_ORDER), numbers as the page's language writes them, as the site
  /// does (format.ts), not as the phone's region would.
  private var items: [Item] {
    let locale = Locale(identifier: handbook.lang)
    var out: [Item] = []
    if let plant {
      // As the plant's page lists them, in the index's words for this language (PLANT_LABELS).
      let word = { (key: String, value: String) in handbook.labels[key, value] ?? value }
      // A plant's difficulty is the site's 1 to 3, in words, with no badge, as its page has it.
      if let d = plant.difficulty { out.append(Item(label: "Độ khó", value: word("difficulty", "\(d)"))) }
      if let l = plant.light { out.append(Item(label: "Ánh sáng", value: word("light", l))) }
      if let c = plant.co2 { out.append(Item(label: "CO₂", value: word("co2", c))) }
      if let g = plant.growth { out.append(Item(label: "Tốc độ mọc", value: word("growth", g))) }
      if !plant.placement.isEmpty { out.append(Item(label: "Vị trí", value: plant.placement.map { word("placement", $0) }.joined(separator: ", "))) }
    }
    if let r = facts.tempC { out.append(Item(label: "Nhiệt độ", value: "\(HandbookIndex.Facts.range(r, locale))°C")) }
    if let r = facts.ph { out.append(Item(label: "pH", value: HandbookIndex.Facts.range(r, locale))) }
    if let r = facts.gh { out.append(Item(label: "Độ cứng (dGH)", value: HandbookIndex.Facts.range(r, locale))) }
    if let v = facts.sizeCm { out.append(Item(label: "Kích thước", value: "\(HandbookIndex.Facts.number(v, locale)) cm")) }
    if !v2, let r = facts.lifeYears { out.append(Item(label: "Tuổi thọ", value: "\(HandbookIndex.Facts.range(r, locale)) \(String(localized: "năm"))")) }
    if let v = facts.tankCm { out.append(Item(label: "Bể tối thiểu", value: "\(HandbookIndex.Facts.number(v, locale)) cm")) }
    if let d = facts.difficulty {
      // The word in its level's colour, "6/8" beside it; read as the site's badge is: "Độ khó 6/8: khó".
      let word = Self.level(d), n = HandbookIndex.Facts.number(d, locale)
      out.append(Item(label: "Độ khó", value: word, level: HandbookIndex.Facts.level(d), outOf: "\(n)/8",
                      spoken: String(localized: "Độ khó \(n)/8: \(word.lowercased())")))
    }
    return out
  }

  /// A fish's temperament and smallest school, as the site shows them under "Nuôi chung" (Companions.astro), not in its
  /// facts: the line under that heading on the page the app draws. Nil when the index has neither.
  static func traits(_ facts: HandbookIndex.Facts) -> AttributedString? {
    var parts: [AttributedString] = []
    func pair(_ label: String, _ value: String) -> AttributedString {
      var l = AttributedString(label + ": ")
      l.font = .subheadline
      l.foregroundColor = .secondary
      var v = AttributedString(value)
      v.font = .subheadline.weight(.semibold)
      return l + v
    }
    if let t = facts.temperament.flatMap(temperament) { parts.append(pair(String(localized: "Tính cách"), t)) }
    if let n = facts.schoolMin { parts.append(pair(String(localized: "Đàn tối thiểu"), String(localized: "\(n) con"))) }
    guard var line = parts.first else { return nil }
    var dot = AttributedString(" · ")
    dot.font = .subheadline
    for p in parts.dropFirst() { line += dot + p }
    return line
  }

  /// The grid's rows, `n` to a row; at three or more to a row, never one fact alone on the last: seven at three go three,
  /// two, two. At two to a row (large text) an odd count can't avoid it.
  static func rows(_ count: Int, _ n: Int) -> [Range<Int>] {
    var rows = stride(from: 0, to: count, by: n).map { $0..<min($0 + n, count) }
    if n > 2, rows.count > 1, rows[rows.count - 1].count == 1 {
      let last = rows.removeLast(), above = rows.removeLast()
      rows += [above.lowerBound..<above.upperBound - 1, above.upperBound - 1..<last.upperBound]
    }
    return rows
  }

  /// `n` to a row, in order, the last row as long as is left.
  static func plainRows(_ count: Int, _ n: Int) -> [Range<Int>] {
    stride(from: 0, to: count, by: n).map { $0..<min($0 + n, count) }
  }

  /// The site's words for each temperament (TEMPERAMENT_LABELS).
  static func temperament(_ t: String) -> String? {
    switch t {
    case "peaceful": String(localized: "Hiền")
    case "semi-aggressive": String(localized: "Hơi dữ")
    case "aggressive": String(localized: "Hung dữ")
    case "predator": String(localized: "Săn mồi")
    default: nil
    }
  }

  static func level(_ d: Double) -> String {
    switch HandbookIndex.Facts.level(d) {
    case .easy: String(localized: "Dễ")
    case .mid: String(localized: "Vừa")
    case .hard: String(localized: "Khó")
    }
  }
}

private struct Fact: View {
  let item: FactsCard.Item
  /// In the page's grid: the value at a size to read at a glance.
  var large = false
  var v2 = false

  var body: some View {
    let fact = VStack(alignment: .leading, spacing: large ? 4 : 2) {
      Text(item.label).font(v2 ? .footnote : .caption).foregroundStyle(.secondary)
      if v2, item.level != nil {
        HStack(alignment: .firstTextBaseline, spacing: 4) {
          Text(verbatim: item.value).font(.title3.weight(.semibold))
          if let outOf = item.outOf { Text(verbatim: outOf).font(.subheadline).foregroundStyle(.secondary).monospacedDigit() }
        }
      } else if let level = item.level {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
          Text(verbatim: item.value)
            .font(large ? .subheadline.weight(.semibold) : .caption.weight(.semibold))
            .foregroundStyle(level.colour)
            .padding(.horizontal, large ? 8 : 6)
            .padding(.vertical, large ? 2 : 1)
            // Square-cornered, as the site draws it.
            .overlay(Rectangle().strokeBorder(level.colour, lineWidth: 1))
          if let outOf = item.outOf {
            Text(verbatim: outOf).font(large ? .subheadline : .caption).foregroundStyle(Color.inkSoft).monospacedDigit()
          }
        }
      } else {
        Text(verbatim: item.value).font(large ? .title3.weight(.semibold) : .subheadline.weight(.semibold)).monospacedDigit()
      }
    }
    Group {
      if let spoken = item.spoken {
        fact.accessibilityElement(children: .ignore).accessibilityLabel(Text(verbatim: spoken))
      } else {
        fact.accessibilityElement(children: .combine)
      }
    }
    .accessibilityIdentifier("fact")
  }
}

extension HandbookIndex.Facts.Level {
  /// The site's colour for each (Difficulty.astro): moss, ink-soft, cardinal, as tokens.css has them in light and dark.
  /// Each is 5:1 or more against the card in both, so the badge's small word reads.
  var colour: Color {
    switch self {
    // The colour itself, not the tint, which a view above could change.
    case .easy: Color("AccentColor")
    case .mid: .inkSoft
    case .hard: .warning
    }
  }
}
