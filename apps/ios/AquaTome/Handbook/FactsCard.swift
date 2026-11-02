import Handbook
import SwiftUI

/// A species' facts above its page: size, temperature, pH, hardness, the shortest tank, temperament, difficulty, as the
/// site's pages write them; a plant's care (difficulty, light, CO₂, growth, where it goes). They come from the
/// handbook's index kept on the phone, so they show offline too, page or no page: the page's own copy doesn't repeat them.
struct FactsCard: View {
  let facts: HandbookIndex.Facts
  var plant: HandbookIndex.Plant?
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    // Numbers as the page's language writes them, as the site does (format.ts), not as the phone's region would.
    let locale = Locale(identifier: handbook.lang)
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(alignment: .top, spacing: 16) {
        if let plant {
          // As the plant's page lists them, in the index's words for this language (PLANT_LABELS).
          let word = { (key: String, value: String) in handbook.labels[key, value] ?? value }
          if let d = plant.difficulty { Fact(label: "Độ khó", value: word("difficulty", "\(d)")) }
          if let l = plant.light { Fact(label: "Ánh sáng", value: word("light", l)) }
          if let c = plant.co2 { Fact(label: "CO₂", value: word("co2", c)) }
          if let g = plant.growth { Fact(label: "Tốc độ mọc", value: word("growth", g)) }
          if !plant.placement.isEmpty { Fact(label: "Vị trí", value: plant.placement.map { word("placement", $0) }.joined(separator: ", ")) }
        }
        if let v = facts.sizeCm { Fact(label: "Kích thước", value: "\(HandbookIndex.Facts.number(v, locale)) cm") }
        if let r = facts.tempC { Fact(label: "Nhiệt độ", value: "\(HandbookIndex.Facts.range(r, locale))°C") }
        if let r = facts.ph { Fact(label: "pH", value: HandbookIndex.Facts.range(r, locale)) }
        if let r = facts.gh { Fact(label: "Độ cứng (dGH)", value: HandbookIndex.Facts.range(r, locale)) }
        if let v = facts.tankCm { Fact(label: "Bể tối thiểu", value: "\(HandbookIndex.Facts.number(v, locale)) cm") }
        if let t = facts.temperament.flatMap(Self.temperament) { Fact(label: "Tính cách", value: t) }
        if let d = facts.difficulty { Fact(label: "Độ khó", value: Self.level(d)) }
      }
      .padding(.horizontal)
      .padding(.vertical, 8)
    }
    .accessibilityIdentifier("facts-card")
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

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(label).font(.caption).foregroundStyle(.secondary)
      Text(verbatim: value).font(.subheadline.weight(.semibold)).monospacedDigit()
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("fact")
  }
}
