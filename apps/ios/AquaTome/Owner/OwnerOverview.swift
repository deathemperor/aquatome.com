import AccountSync
import SwiftUI

/// The overview, as the site lead's reply has it: when the figures were read, four tiles (each scrolls to its part),
/// what needs the owner, readers who found an answer, what shipped, the costs, the last three days, and every page,
/// grouped. Its own words in English, as the dashboard's are.
struct OwnerOverview: View {
  let dashboard: Owner.Dashboard
  let draw: OwnerDraw
  /// Scrolls the screen to a part: "needs", "answers", "shipped", "cost".
  let scroll: (String) -> Void
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    let d = dashboard
    VStack(alignment: .leading, spacing: 10) {
      if let at = d.asOf { Text(verbatim: Self.read(at, tz: d.tz)).font(.subheadline).foregroundStyle(.secondary).padding(.horizontal, 4) }
      tiles(d.tiles)
      // Its count is the tile's (the Design Lead, 8 Nov).
      header(d.tiles.first { $0.key == "needs" }?.label ?? "Needs you").id("needs")
      needs(d)
      if let a = d.answers { answers(a) }
      if let s = d.shipped { shipped(s) }
      if let c = d.costs { costs(c) }
      if let log = d.log, !log.days.isEmpty {
        header(log.title)
        list(log.days.indices.map { i in
          let day = log.days[i]
          return draw.go(day.to, AnyView(OwnerRow(title: day.title, text: day.text, figure: day.figure, tone: day.tone, chevron: day.to != nil)), "owner-day")
        })
      }
      if !d.pages.isEmpty {
        header("Every page")
        VStack(alignment: .leading, spacing: 0) {
          ForEach(d.pages.indices, id: \.self) { g in
            Text(verbatim: d.pages[g].name.uppercased()).font(.footnote).foregroundStyle(.secondary)
              .padding(.horizontal, 16).padding(.top, g == 0 ? 12 : 18).padding(.bottom, 2)
              .accessibilityAddTraits(.isHeader)
            ForEach(d.pages[g].pages.indices, id: \.self) { i in
              let p = d.pages[g].pages[i]
              if i > 0 { Divider().padding(.leading, 16) }
              draw.go(p.to, AnyView(OwnerRow(title: p.title, figure: p.figure, tone: p.tone, chevron: true)), "owner-page")
            }
          }
        }
        .padding(.bottom, 4)
        .ownerCard(padded: false)
      }
    }
  }

  /// When the figures were read, in the dashboard's zone: "Saturday 7 Nov · figures as of 9:41".
  static func read(_ at: Date, tz: String) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_GB")
    f.timeZone = TimeZone(identifier: tz) ?? .current
    f.dateFormat = "EEEE d MMM"
    let day = f.string(from: at)
    f.dateFormat = "H:mm"
    return day + " · figures as of " + f.string(from: at)
  }

  // MARK: The tiles

  /// Two to a row; one to a row, with no small columns, at the largest text.
  @ViewBuilder private func tiles(_ tiles: [Owner.Tile]) -> some View {
    if size.isAccessibilitySize {
      VStack(spacing: 10) { ForEach(tiles.indices, id: \.self) { tile(tiles[$0]) } }
    } else {
      Grid(horizontalSpacing: 10, verticalSpacing: 10) {
        ForEach(Array(stride(from: 0, to: tiles.count, by: 2)), id: \.self) { i in
          GridRow {
            tile(tiles[i])
            if i + 1 < tiles.count { tile(tiles[i + 1]) } else { Color.clear }
          }
        }
      }
    }
  }

  /// Its label, its figure, then its small columns, its change or what it counts. The words scroll to its part; the small
  /// columns sit outside that button, so a tap on one reads it instead.
  private func tile(_ t: Owner.Tile) -> some View {
    let big = size.isAccessibilitySize
    var head = Text(verbatim: "")
    if t.key == "needs", t.tone != .plain { head = head + Text(Image(systemName: t.tone == .good ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")).foregroundStyle(t.tone.color) + Text(verbatim: " ") }
    head = head + Text(verbatim: t.label).foregroundStyle(.secondary)
    let value = Text(verbatim: t.value).font(big ? .largeTitle.bold() : .title.bold()).monospacedDigit()
    let words = OwnerDraw.said(t.label, t.value, t.delta?.text, t.delta?.tone.said, t.sub, t.key == "needs" ? t.tone.said : nil)
    return VStack(alignment: .leading, spacing: 6) {
      Button { scroll(t.key) } label: {
        HStack(alignment: .top) {
          VStack(alignment: .leading, spacing: 6) { head.font(.subheadline); value }
          Spacer(minLength: 4)
          OwnerRow.chevron
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text(verbatim: words))
      .accessibilityIdentifier("owner-tile-" + t.key)
      if let b = t.bars, !big { OwnerBars(label: t.label, bars: b) }
      Group {
        if let d = t.delta {
          Text(verbatim: d.text).foregroundStyle(d.tone == .plain || d.tone == .muted ? Color.secondary : d.tone.color)
        } else if let s = t.sub {
          Text(verbatim: s).foregroundStyle(.secondary)
        }
      }
      .font(.footnote)
      .accessibilityHidden(true)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .ownerCard()
  }

  // MARK: The parts

  private func header(_ s: String) -> some View {
    Text(verbatim: s).font(.headline).foregroundStyle(.secondary).padding(.top, 12).padding(.horizontal, 4).accessibilityAddTraits(.isHeader)
  }

  /// Rows on one card, a line between each two.
  private func list(_ rows: [AnyView]) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      ForEach(rows.indices, id: \.self) { i in
        if i > 0 { Divider().padding(.leading, 16) }
        rows[i]
      }
    }
    .ownerCard(padded: false)
  }

  /// Its icon by kind, level with its title on one line (up to three at the largest text), the line under it (the pages,
  /// or the source) and the readers' photos waiting as thumbnails, as the site draws them (the Design Lead, 9 Nov).
  /// Nothing: one line that says so, and the owner's last action under it, opening the section it was in.
  @ViewBuilder private func needs(_ d: Owner.Dashboard) -> some View {
    if d.needs.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Label { Text(verbatim: d.needsEmpty) } icon: { Image(systemName: "checkmark.circle.fill").foregroundStyle(.green) }
          .ownerCard()
          .accessibilityIdentifier("owner-needs-empty")
        if let a = d.lastAction {
          draw.go(a.to, AnyView((Text(verbatim: a.title).foregroundStyle(a.to == nil ? Color.secondary : OwnerChart.green)
                                 + Text(verbatim: a.figure.map { " · " + $0 } ?? "").foregroundStyle(.secondary))
            .font(.subheadline)
            .padding(.horizontal, 4)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(verbatim: OwnerDraw.said(a.title, a.figure)))), "owner-last-action")
        }
      }
    } else {
      list(d.needs.map { n in
        draw.go(n.to, AnyView(HStack(spacing: 12) {
          HStack(alignment: .firstTextBaseline, spacing: 12) {
            Image(systemName: Self.icon(n.kind)).font(.title3).foregroundStyle(n.tone.color).frame(width: 28).accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: n.text).lineLimit(size.isAccessibilitySize ? 3 : 1)
              if let sub = n.sub { Text(verbatim: sub).font(.subheadline).foregroundStyle(.secondary) }
              if !size.isAccessibilitySize, !n.photos.isEmpty {
                HStack(spacing: 4) { ForEach(n.photos.prefix(2).indices, id: \.self) { OwnerImage(src: n.photos[$0]).frame(width: 36, height: 36) } }
                  .padding(.top, 4)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
          if n.to != nil { OwnerRow.chevron }
        }
        .padding(.horizontal, 16).padding(.vertical, 11)
        .contentShape(.rect)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: OwnerDraw.said(n.text, n.sub, n.tone.said)))), "owner-need")
      })
    }
  }

  static func icon(_ kind: String) -> String {
    switch kind {
    case "comments": "bubble.left.fill"
    case "photos": "person.2.fill"
    case "key": "key.fill"
    case "spend": "dollarsign.circle.fill"
    case "moderation": "checkmark.shield.fill"
    case "failed": "xmark.octagon.fill"
    default: "exclamationmark.triangle.fill"
    }
  }

  /// This week's figure against the same point last week, the week by day, and readers, sessions and shop clicks.
  private func answers(_ a: Owner.Answers) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      header(a.title).id("answers")
      VStack(alignment: .leading, spacing: 12) {
        if let f = a.figure {
          VStack(alignment: .leading, spacing: 2) {
            (Text(verbatim: f.value).font(.largeTitle.bold()).monospacedDigit() + Text(verbatim: f.sub.map { "  " + $0 } ?? "").foregroundStyle(.secondary))
            if let d = f.delta { Text(verbatim: d.text).font(.footnote).foregroundStyle(d.tone == .plain || d.tone == .muted ? Color.secondary : d.tone.color) }
          }
          .accessibilityElement(children: .combine)
        }
        if let c = a.chart { OwnerChart(chart: c, titled: false) }
        if !a.figures.isEmpty { OwnerFigures(items: a.figures) }
      }
      .ownerCard()
      if let n = a.note { Text(verbatim: n).font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 4) }
    }
  }

  /// The changelog's lines of the last 24 hours, each tagged with where it shipped, then the whole changelog.
  private func shipped(_ s: Owner.Shipped) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      header(s.title).id("shipped")
      list((s.lines.isEmpty ? [AnyView(Text(verbatim: s.empty ?? "").foregroundStyle(.secondary).padding(16))] : s.lines.map { l in
        AnyView(HStack(alignment: .firstTextBaseline, spacing: 10) {
          Text(verbatim: l.label).font(.caption.weight(.semibold)).foregroundStyle(Self.tag(l.area))
            .padding(.horizontal, 6).padding(.vertical, 2).background(Self.tag(l.area).opacity(0.14), in: .rect(cornerRadius: 5))
          Text(verbatim: l.text).frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.horizontal, 16).padding(.vertical, 11)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("owner-shipped"))
      }) + (s.more.map { m in [draw.go(m.to, AnyView(OwnerRow(title: m.title, figure: nil, tone: .plain, chevron: true)), "owner-changelog")] } ?? []))
      if let n = s.note { Text(verbatim: n).font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 4) }
    }
  }

  /// Where a change shipped, by colour: never orange or red, which mean waiting on the owner and a fault.
  static func tag(_ area: String) -> Color {
    switch area {
    case "site": .teal
    case "app": .blue
    default: .gray
    }
  }

  /// What the server counts, the keys' state (opening them), then what it doesn't count.
  private func costs(_ c: Owner.Costs) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      header(c.title).id("cost")
      list(c.lines.map { AnyView(OwnerRow(title: $0.label, text: $0.sub, figure: $0.value, tone: .plain)) }
        + (c.keys.map { k in [draw.go(k.to, AnyView(OwnerRow(title: k.title, figure: k.figure, tone: k.tone, chevron: k.to != nil)), "owner-keys")] } ?? [])
        + c.fixed.map { AnyView(OwnerRow(title: $0, figure: nil, tone: .plain)) })
      if let n = c.note { Text(verbatim: n).font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 4) }
    }
  }
}
