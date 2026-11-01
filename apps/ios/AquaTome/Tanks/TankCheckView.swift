import Handbook
import SwiftUI
import TankCheck
import Tanks

/// "Nuôi chung": the tank's fish checked as the site's tank-mates tool checks them (TankCheck, the site's own code), the
/// tank's size for the stocking: whether they go together, who may eat whom, whether the tank is big enough. A fish the
/// handbook doesn't have goes in with no figures, so the check says what it couldn't count instead of leaving it out;
/// plants never are, as in the tool. Worked out when the fish, the size or the index change, not on every redraw.
struct TankCheckSection: View {
  let tank: Tank
  @Environment(HandbookModel.self) private var handbook
  @State private var memo = Memo()

  var body: some View {
    // Worked out while drawing (an empty section never appears in the list, so it can't wait for onAppear), and kept
    // until what it reads changes.
    let key = Key(tank: tank, pages: handbook.count, status: handbook.status, lang: handbook.lang)
    if memo.key != key { memo.key = key; memo.check = make() }
    return Group {
      if let check = memo.check, check.verdict != nil || check.stocking != nil || check.minTank != nil || check.unsized != nil {
        Section("Nuôi chung") {
          if let v = check.verdict {
            Label { Text(v.text) } icon: { Mark(level: v.level) }
              .accessibilityElement(children: .combine).accessibilityIdentifier("verdict")
          }
          ForEach(Array(check.warnings.enumerated()), id: \.offset) { Text($0.element).font(.subheadline) }
          if let s = check.stocking {
            Label(s.text, systemImage: "gauge.with.dots.needle.67percent")
              .foregroundStyle(s.level == "over" ? Color.warning : .primary)
              .accessibilityElement(children: .combine).accessibilityIdentifier("stocking")
            ForEach(Array(s.notes.enumerated()), id: \.offset) { Text($0.element).font(.subheadline) }
          }
          if let u = check.unsized { Text(u).font(.subheadline) }
          if let m = check.minTank { Text(m).font(.subheadline) }
        }
      }
    }
  }

  /// What the check reads: the tank's fish and size, and the index (until it's here, nothing is checked).
  private struct Key: Equatable { let tank: Tank; let pages: Int; let status: HandbookModel.Status; let lang: String }
  /// The last check and what it was made from. Not observed: filling it in doesn't redraw anything.
  private final class Memo { var key: Key?; var check: TankCheck? }

  private func make() -> TankCheck? {
    guard handbook.count > 0, !tank.species.isEmpty else { return nil }
    let fish = tank.species.map { s in
      let page = handbook.page(s.id)
      return TankCheck.Fish(name: page?.name ?? s.id, facts: page?.facts ?? .init(), count: s.count)
    }
    return Checkers.of(handbook.lang).check(fish, size: .init(dims: tank.dims.map { .init(l: $0.l, w: $0.w, h: $0.h) }, litres: tank.litres))
  }
}

/// The tool's marks for its four answers.
private struct Mark: View {
  let level: String
  var body: some View {
    switch level {
    case "no": Image(systemName: "xmark.octagon.fill").foregroundStyle(Color.warning)
    case "care": Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.orange)
    case "yes": Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
    default: Image(systemName: "questionmark.circle").foregroundStyle(.secondary)
    }
  }
}

/// One checker per language, made when a tank first needs it (it loads the site's script once).
@MainActor
private enum Checkers {
  private static var made: [String: TankChecker] = [:]
  static func of(_ lang: String) -> TankChecker {
    if let c = made[lang] { return c }
    let c = TankChecker(lang: lang)
    made[lang] = c
    return c
  }
}
