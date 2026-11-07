import Handbook
import SwiftUI
import TankCheck
import Tanks

/// "Nuôi chung": the tank's fish checked as the site's tank-mates tool checks them (TankCheck, the site's own code), the
/// tank's size for the stocking: whether they go together, who may eat whom, whether the tank is big enough. A fish the
/// handbook doesn't have goes in with no figures, so the check says what it couldn't count instead of leaving it out;
/// plants never are, as in the tool. Fish put on the tank without a page are named as not checked (`unchecked`), unless
/// a page has their scientific name: then they are checked as that page's fish. Worked out when the fish, the size or
/// the index change, not on every redraw.
struct TankCheckSection: View {
  let tank: Tank
  /// The chat's check of this tank, shown in place of its own while the reader looks at it.
  var trial: TankTrial?
  @Environment(HandbookModel.self) private var handbook
  @State private var memo = Memo()

  var body: some View {
    // Worked out while drawing (an empty section never appears in the list, so it can't wait for onAppear), and kept
    // until what it reads changes.
    let key = Key(tank: tank, pages: handbook.count, status: handbook.status, lang: handbook.lang)
    if memo.key != key { memo.key = key; memo.check = make() }
    return Group {
      if let trial, let check = trial.check {
        Section("Nuôi chung") {
          if let added = trial.added { Text("Thêm \(added), chưa lưu vào bể.").font(.subheadline).accessibilityIdentifier("trial-added").id(TankTrial.addedRow) }
          TankCheckRows(check: check)
        }
      } else if let check = memo.check, check.verdict != nil || check.stocking != nil || check.minTank != nil || check.unsized != nil || check.unchecked != nil {
        Section("Nuôi chung") { TankCheckRows(check: check) }
      }
    }
  }

  /// What the check reads: the tank's fish and size, and the index (until it's here, nothing is checked).
  private struct Key: Equatable { let tank: Tank; let pages: Int; let status: HandbookModel.Status; let lang: String }
  /// The last check and what it was made from. Not observed: filling it in doesn't redraw anything.
  private final class Memo { var key: Key?; var check: TankCheck? }

  private func make() -> TankCheck? {
    guard handbook.count > 0 else { return nil }
    var fish = tank.species.map { s in row(handbook.page(s.id), id: s.id, count: s.count) }
    var unlisted: [String] = []
    for e in tank.unlisted where !e.isPlant {
      if let page = handbook.page(for: e) {
        fish.append(row(page, id: page.contentId ?? page.id, count: e.count))
      } else { unlisted.append(e.name) }
    }
    guard !fish.isEmpty || !unlisted.isEmpty else { return nil }
    let size = TankCheck.Size(dims: tank.dims.map { .init(l: $0.l, w: $0.w, h: $0.h) }, litres: tank.litres)
    // The site's check makes the rows of one page, or of a species and its breeds, one fish (TankCheck.Fish).
    return Checkers.of(handbook.lang).check(fish, size: size, unlisted: unlisted)
  }

  /// A row of the tank as the check counts it: by its page, or a breed that is a form of a species (`of`) as that species,
  /// with its figures; a species the handbook lacks leaves the breed a fish of its own.
  private func row(_ page: HandbookIndex.Item?, id: String, count: Int?) -> TankCheck.Fish {
    if let page, let of = page.of, let species = handbook.page(of) {
      return .init(name: page.name, facts: species.facts, count: count, key: of, species: species.name)
    }
    return .init(name: page?.name ?? id, facts: page?.facts ?? .init(), count: count, key: id)
  }
}

/// A check the chat ran on a tank, on the way to that tank's page: the fish it would add, shown and never saved.
struct TankTrial {
  /// The tank's id.
  let tank: String
  /// The fish added, as named: "Cá betta × 1".
  let added: String?
  let check: TankCheck?
  /// Where the tank's page opens: the first row of "Nuôi chung".
  static let addedRow = "trial-added", verdictRow = "tank-verdict"
}

/// The tool's marks for its four answers.
/// A check's rows, as a tank's "Nuôi chung" draws them and the chat's tank-mates block does: the verdict with its mark,
/// the warnings, how full the tank is and its notes, then what wasn't counted or checked. A row each in a list.
struct TankCheckRows: View {
  let check: TankCheck

  var body: some View {
    if let v = check.verdict {
      Label { Text(v.text) } icon: { Mark(level: v.level) }
        .accessibilityElement(children: .combine).accessibilityIdentifier("verdict").id(TankTrial.verdictRow)
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
    if let u = check.unchecked { Text(u).font(.subheadline).accessibilityIdentifier("unchecked") }
  }
}

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
