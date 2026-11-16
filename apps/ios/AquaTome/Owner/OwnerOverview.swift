import AccountSync
import SwiftUI

/// The overview's first screen, as Design's board has it (board2, 14 Nov; the cards' parts, 15 Nov): when the figures were
/// read, then five cards, each one tap into its page: Needs you, New pages, Readers and Shipped side by side, the cost;
/// then every page, grouped. Drawn from the overview's reply as it is: what the board shows and the server doesn't send
/// yet (countries, pages held, the day's spend against its cap) isn't drawn. Its own words in English, as the
/// dashboard's are.
struct OwnerOverview: View {
  let dashboard: Owner.Dashboard
  let draw: OwnerDraw
  @Environment(\.dynamicTypeSize) private var size

  /// The rows of what needs the owner the card shows; the rest are on its page.
  static let needsShown = 3

  var body: some View {
    let d = dashboard
    VStack(alignment: .leading, spacing: 10) {
      if let at = d.asOf { Text(verbatim: Self.read(at, tz: d.tz)).font(.subheadline).foregroundStyle(.secondary).padding(.horizontal, 4) }
      needsCard(d)
      if let p = d.publishing { pagesCard(p, d) }
      if size.isAccessibilitySize {
        readersCard(d)
        shippedCard(d)
      } else {
        Grid(horizontalSpacing: 10) { GridRow { readersCard(d); shippedCard(d) } }
      }
      costCard(d)
      if !d.pages.isEmpty {
        Text(verbatim: "Everything else".uppercased()).font(.footnote).foregroundStyle(.secondary)
          .padding(.horizontal, 16).padding(.top, 8)
          .accessibilityAddTraits(.isHeader)
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

  // MARK: The cards

  /// A card: its name and a chevron, then what it shows; the whole card one tap into its page (`needs`: the needs' own),
  /// said as one.
  private func card<Content: View>(_ name: Text, _ id: String, said: String, to: Owner.Destination?, needs: Bool = false,
                                   @ViewBuilder _ content: () -> Content) -> AnyView {
    let v = VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .firstTextBaseline) {
        name.font(.subheadline.weight(.semibold))
        Spacer(minLength: 4)
        if to != nil || needs { OwnerRow.chevron }
      }
      content()
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .ownerCard()
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: said))
    guard needs else { return draw.go(to, AnyView(v), id) }
    return AnyView(NavigationLink(value: OwnerRoute(key: "", anchor: OwnerNeeds.anchor)) { v }.buttonStyle(.plain).accessibilityIdentifier(id))
  }

  private func figure(_ value: String) -> Text { Text(verbatim: value).font(.title.bold()).monospacedDigit() }

  /// A change, in its tone (plain or muted: secondary).
  private func change(_ c: Owner.Chip) -> Text {
    Text(verbatim: c.text).foregroundStyle(c.tone == .plain || c.tone == .muted ? Color.secondary : c.tone.color)
  }

  /// What needs the owner, most pressing first, each a dot in its tone over its line; the rest counted. Nothing: the
  /// all-clear line, and the owner's last action under it. Opens every one of them on a page of its own.
  private func needsCard(_ d: Owner.Dashboard) -> AnyView {
    let tile = d.tiles.first { $0.key == "needs" }
    let label = tile?.label ?? "Needs you", tone = d.needs.isEmpty ? Owner.Tone.good : tile?.tone ?? .plain
    // The board's name is in the text's colour, its triangle too; all clear, a green tick.
    var name = Text(verbatim: "")
    if tone == .good { name = Text(Image(systemName: "checkmark.circle.fill")).foregroundStyle(Owner.Tone.good.color) + Text(verbatim: " ") }
    else if tone != .plain { name = Text(Image(systemName: "exclamationmark.triangle.fill")) + Text(verbatim: " ") }
    name = name + Text(verbatim: label)
    if !d.needs.isEmpty { name = name + Text(verbatim: " · \(d.needs.count)").foregroundStyle(.secondary) }
    let shown = d.needs.prefix(Self.needsShown), more = d.needs.count - shown.count
    let said = OwnerDraw.said(label, d.needs.isEmpty ? d.needsEmpty : String(d.needs.count), tone.said)
      + shown.map { ", " + OwnerDraw.said($0.text, $0.sub, $0.tone.said) }.joined() + (more > 0 ? ", \(more) more" : "")
    return card(name, "owner-card-needs", said: said, to: nil, needs: true) {
      if d.needs.isEmpty {
        Text(verbatim: d.needsEmpty).font(.subheadline)
        if let a = d.lastAction { Text(verbatim: a.title + (a.figure.map { " · " + $0 } ?? "")).font(.footnote).foregroundStyle(.secondary) }
      } else {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(Array(shown.enumerated()), id: \.offset) { i, n in
            if i > 0 { Divider() }
            HStack(alignment: .firstTextBaseline, spacing: 10) {
              Image(systemName: "circle.fill").font(.system(size: 8)).foregroundStyle(n.tone.color).frame(width: 12)
              VStack(alignment: .leading, spacing: 1) {
                Text(verbatim: n.text).font(.subheadline.weight(.semibold)).lineLimit(size.isAccessibilitySize ? 3 : 1)
                if let sub = n.sub { Text(verbatim: sub).font(.footnote).foregroundStyle(.secondary).lineLimit(size.isAccessibilitySize ? nil : 1) }
              }
            }
            .padding(.vertical, 6)
          }
          if more > 0 { Text(verbatim: "\(more) more").font(.footnote).foregroundStyle(.secondary).padding(.leading, 22).padding(.top, 2) }
        }
      }
    }
  }

  /// New pages by kind: the four kinds' totals added up, what today has added so far, then a line a kind: its name, its
  /// last seven days as small bars, its total and today's.
  private func pagesCard(_ p: Owner.Publishing, _ d: Owner.Dashboard) -> AnyView {
    let totals = p.kinds.map { Self.count($0.total) }
    let total: Int? = totals.contains(nil) ? nil : totals.compactMap { $0 }.reduce(0, +)
    let todays = p.kinds.compactMap(Self.today)
    let today: Int? = todays.isEmpty ? nil : todays.reduce(0, +)
    let window = p.kinds.compactMap(\.bars).first.map(Self.week)
    let said = OwnerDraw.said(p.title, total.map { "\(Self.written($0)) pages" }, today.map { "\(Self.signed($0)) today" })
      + p.kinds.map { k in ", " + OwnerDraw.said(k.label, k.total, Self.today(k).map { "\(Self.signed($0)) today" }) }.joined()
    return card(Text(verbatim: p.title), "owner-card-pages", said: said, to: section("noi-dung", d)) {
      HStack(alignment: .firstTextBaseline) {
        if let total { figure(Self.written(total)) + Text(verbatim: " pages").font(.subheadline.weight(.semibold)).foregroundStyle(.secondary) }
        Spacer(minLength: 4)
        if let today { (Text(verbatim: Self.signed(today)).foregroundStyle(today > 0 ? Owner.Tone.good.color : .secondary) + Text(verbatim: " today").foregroundStyle(.secondary)).font(.footnote) }
      }
      if size.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(p.kinds.indices, id: \.self) { i in
            let k = p.kinds[i]
            VStack(alignment: .leading, spacing: 4) {
              HStack(alignment: .firstTextBaseline) { kindName(k); Spacer(); kindTotal(k); kindToday(k) }
              kindBars(k)
            }
          }
          if let window { days(window) }
        }
        .padding(.top, 4)
      } else {
        Grid(alignment: .bottomLeading, horizontalSpacing: 8, verticalSpacing: 6) {
          ForEach(p.kinds.indices, id: \.self) { i in
            let k = p.kinds[i]
            GridRow {
              kindName(k)
              kindBars(k)
              kindTotal(k).gridColumnAlignment(.trailing)
              kindToday(k).gridColumnAlignment(.trailing)
            }
          }
          if let window {
            GridRow {
              Color.clear.gridCellUnsizedAxes([.horizontal, .vertical])
              days(window)
            }
          }
        }
        .padding(.top, 4)
      }
    }
  }

  private func kindName(_ k: Owner.PublishingKind) -> some View {
    Text(verbatim: k.label).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
  }

  private func kindBars(_ k: Owner.PublishingKind) -> some View {
    let r: Range<Int> = k.bars.map(Self.week) ?? 0..<0
    var open: Int?
    if let t = k.bars?.today, r.contains(t) { open = t - r.lowerBound }
    return OwnerSmallBars(values: k.bars.map { Array($0.values[r]) } ?? [], open: open)
      .frame(maxWidth: .infinity)
  }

  private func kindTotal(_ k: Owner.PublishingKind) -> some View {
    Text(verbatim: k.total).font(.subheadline.weight(.semibold)).monospacedDigit()
  }

  private func kindToday(_ k: Owner.PublishingKind) -> some View {
    let t = Self.today(k)
    return Text(verbatim: t.map(Self.signed) ?? "").font(.footnote).monospacedDigit()
      .foregroundStyle((t ?? 0) > 0 ? Owner.Tone.good.color : .secondary)
      .frame(minWidth: 28, alignment: .trailing)
  }

  /// The week's first day and its last, under the bars.
  private func days(_ r: Range<Int>) -> some View {
    let all = dashboard.publishing?.kinds.compactMap(\.bars).first?.days ?? []
    return HStack {
      Text(verbatim: all.indices.contains(r.lowerBound) ? Self.day(all[r.lowerBound]) : "")
      Spacer()
      Text(verbatim: all.indices.contains(r.upperBound - 1) ? Self.day(all[r.upperBound - 1]) : "")
    }
    .font(.caption2).foregroundStyle(.secondary)
    .accessibilityHidden(true)
  }

  /// Readers this week against the same point last week; without them, why not.
  private func readersCard(_ d: Owner.Dashboard) -> AnyView {
    let f = d.answers?.figures.first { $0.label == "Readers" }, tile = d.tiles.first { $0.key == "answers" }
    let name = f?.label ?? "Readers", value = f?.value ?? tile?.value ?? "—"
    let said = OwnerDraw.said(name, value, f?.delta?.text ?? (f == nil ? tile?.sub : nil), f?.delta?.tone.said ?? tile?.tone.said)
    return card(Text(verbatim: name), "owner-card-readers", said: said, to: section("doc-gia", d)) {
      figure(value)
      Group {
        if let f {
          if let delta = f.delta { change(delta) }
          if let s = f.sub { Text(verbatim: s).foregroundStyle(.secondary) }
        } else if let tile, let s = tile.sub {
          Text(verbatim: s).foregroundStyle(tile.tone == .plain || tile.tone == .muted ? Color.secondary : tile.tone.color)
        }
      }
      .font(.footnote)
    }
  }

  /// Changes shipped in the last 24 hours, by where, and the newest in its words.
  private func shippedCard(_ d: Owner.Dashboard) -> AnyView {
    let tile = d.tiles.first { $0.key == "shipped" }, newest = d.shipped?.lines.first?.text
    let name = tile?.label ?? d.shipped?.title ?? "Shipped"
    return card(Text(verbatim: name), "owner-card-shipped", said: OwnerDraw.said(name, tile?.value, tile?.sub, newest), to: d.shipped?.more?.to) {
      if let v = tile?.value { figure(v) }
      if let s = tile?.sub { Text(verbatim: s).font(.footnote).foregroundStyle(.secondary) }
      if let newest {
        Text(verbatim: newest).font(.footnote).lineLimit(size.isAccessibilitySize ? nil : 2).padding(.top, 2)
      }
    }
  }

  /// What the server counts of the cost, on one row: its figure and what it's made of. Opens the keys' page.
  private func costCard(_ d: Owner.Dashboard) -> AnyView {
    let tile = d.tiles.first { $0.key == "cost" }
    var to: Owner.Destination?
    if case .section(let k, _)? = d.costs?.keys?.to { to = .section(k, anchor: nil) }
    guard let tile else { return AnyView(EmptyView()) }
    let said = OwnerDraw.said(tile.label, tile.value, tile.sub)
    let row = HStack(alignment: .firstTextBaseline, spacing: 10) {
      Text(verbatim: tile.label).font(.subheadline.weight(.semibold))
      Text(verbatim: tile.value).font(.subheadline.weight(.semibold)).monospacedDigit()
      if let s = tile.sub { Text(verbatim: s).font(.footnote).foregroundStyle(.secondary) }
      Spacer(minLength: 4)
      if to != nil { OwnerRow.chevron }
    }
    let v = ViewThatFits(in: .horizontal) {
      row
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: tile.label).font(.subheadline.weight(.semibold))
          (Text(verbatim: tile.value).font(.subheadline.weight(.semibold)).monospacedDigit()
            + Text(verbatim: tile.sub.map { "  " + $0 } ?? "").font(.footnote).foregroundStyle(.secondary))
        }
        Spacer(minLength: 4)
        if to != nil { OwnerRow.chevron }
      }
    }
    .ownerCard()
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: said))
    return draw.go(to, AnyView(v), "owner-card-cost")
  }

  /// A section the overview lists, by its key.
  private func section(_ key: String, _ d: Owner.Dashboard) -> Owner.Destination? {
    d.sections.contains { if case .section(key, _)? = $0.to { true } else { false } } ? .section(key, anchor: nil) : nil
  }

  // MARK: Figures

  /// The last seven days of a kind's bars, up to today (or the last).
  static func week(_ b: Owner.Bars) -> Range<Int> {
    let end = (b.today ?? b.values.count - 1) + 1
    return max(0, end - 7)..<end
  }

  /// What a kind has added today so far; nil when today isn't among its bars, or wasn't counted.
  static func today(_ k: Owner.PublishingKind) -> Int? {
    k.bars.flatMap { b in b.today.flatMap { b.values[$0] } }.map { Int($0) }
  }

  /// A count the server wrote as a tile's value ("2,503"); nil for anything else.
  static func count(_ s: String) -> Int? {
    let digits = s.replacingOccurrences(of: ",", with: "")
    return !digits.isEmpty && digits.allSatisfy(\.isASCII) ? Int(digits) : nil
  }

  static func written(_ n: Int) -> String { n.formatted(.number.locale(Locale(identifier: "en_US"))) }
  static func signed(_ n: Int) -> String { n > 0 ? "+" + written(n) : written(n) }

  /// A bar's day, "2026-11-08", as "Sun 8".
  static func day(_ s: String) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_GB")
    f.timeZone = TimeZone(identifier: "UTC")
    f.dateFormat = "yyyy-MM-dd"
    guard let d = f.date(from: s) else { return "" }
    f.dateFormat = "EEE d"
    return f.string(from: d)
  }
}

/// Every thing that needs the owner, on a page of its own (from the Needs card): its icon by kind, level with its title
/// on one line (up to three at the largest text), the line under it (the pages, or the source) and the readers' photos
/// waiting as thumbnails, as the site draws them (the Design Lead, 9 Nov), each opening where it's dealt with.
/// Nothing: one line that says so, and the owner's last action under it, opening the section it was in.
struct OwnerNeeds: View {
  let dashboard: Owner.Dashboard
  let draw: OwnerDraw
  @Environment(\.dynamicTypeSize) private var size

  /// Its route's anchor on the overview's key.
  static let anchor = "needs"

  var body: some View {
    let d = dashboard
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
      VStack(alignment: .leading, spacing: 0) {
        ForEach(d.needs.indices, id: \.self) { i in
          let n = d.needs[i]
          if i > 0 { Divider().padding(.leading, 16) }
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
        }
      }
      .ownerCard(padded: false)
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
}
