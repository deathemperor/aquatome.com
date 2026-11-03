import Handbook
import SwiftUI

/// A species' facts: size, temperature, pH, hardness, the shortest tank, temperament, difficulty, as the site's pages
/// write them; a plant's care (difficulty, light, CO₂, growth, where it goes). They come from the handbook's index kept
/// on the phone, so they show offline too, page or no page: the page's own copy doesn't repeat them. On a page the app
/// draws (`inPage`), all of them at once under its name; over a web page, a row across its top.
struct FactsCard: View {
  let facts: HandbookIndex.Facts
  var plant: HandbookIndex.Plant?
  var inPage = false
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    let all = items
    if inPage {
      // As many to a row as fit the reader's text size: three, two, or one at the largest.
      let n = size.isAccessibilitySize ? 1 : size >= .xxLarge ? 2 : 3
      Grid(alignment: .topLeading, horizontalSpacing: 12, verticalSpacing: 16) {
        ForEach(Self.rows(all.count, n), id: \.self) { row in
          GridRow {
            ForEach(row, id: \.self) { i in
              Fact(label: all[i].label, value: all[i].value, large: true).frame(maxWidth: .infinity, alignment: .leading)
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
          ForEach(all.indices, id: \.self) { i in Fact(label: all[i].label, value: all[i].value) }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
      }
      .accessibilityIdentifier("facts-card")
    }
  }

  /// Each fact and its value in the site's order, numbers as the page's language writes them, as the site does
  /// (format.ts), not as the phone's region would.
  private var items: [(label: LocalizedStringKey, value: String)] {
    let locale = Locale(identifier: handbook.lang)
    var out: [(label: LocalizedStringKey, value: String)] = []
    if let plant {
      // As the plant's page lists them, in the index's words for this language (PLANT_LABELS).
      let word = { (key: String, value: String) in handbook.labels[key, value] ?? value }
      if let d = plant.difficulty { out.append(("Độ khó", word("difficulty", "\(d)"))) }
      if let l = plant.light { out.append(("Ánh sáng", word("light", l))) }
      if let c = plant.co2 { out.append(("CO₂", word("co2", c))) }
      if let g = plant.growth { out.append(("Tốc độ mọc", word("growth", g))) }
      if !plant.placement.isEmpty { out.append(("Vị trí", plant.placement.map { word("placement", $0) }.joined(separator: ", "))) }
    }
    if let v = facts.sizeCm { out.append(("Kích thước", "\(HandbookIndex.Facts.number(v, locale)) cm")) }
    if let r = facts.tempC { out.append(("Nhiệt độ", "\(HandbookIndex.Facts.range(r, locale))°C")) }
    if let r = facts.ph { out.append(("pH", HandbookIndex.Facts.range(r, locale))) }
    if let r = facts.gh { out.append(("Độ cứng (dGH)", HandbookIndex.Facts.range(r, locale))) }
    if let v = facts.tankCm { out.append(("Bể tối thiểu", "\(HandbookIndex.Facts.number(v, locale)) cm")) }
    if let t = facts.temperament.flatMap(Self.temperament) { out.append(("Tính cách", t)) }
    if let d = facts.difficulty { out.append(("Độ khó", Self.level(d))) }
    return out
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
  let label: LocalizedStringKey
  let value: String
  /// In the page's grid: the value at a size to read at a glance.
  var large = false

  var body: some View {
    VStack(alignment: .leading, spacing: large ? 4 : 2) {
      Text(label).font(.caption).foregroundStyle(.secondary)
      Text(verbatim: value).font(large ? .title3.weight(.semibold) : .subheadline.weight(.semibold)).monospacedDigit()
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("fact")
  }
}
