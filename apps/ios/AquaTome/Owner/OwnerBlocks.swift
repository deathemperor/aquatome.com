import AccountSync
import Handbook
import SwiftUI

/// What drawing a block needs from the screen it's on, and the drawing: one switch over the block's kind, each part a
/// plain view (AnyView) and as much of it as can be one Text, no generic helpers: every reader downloads this code, and
/// only the owner runs it.
@MainActor
struct OwnerDraw {
  let working: Bool
  let run: @MainActor (Owner.Action) -> Void
  /// A form's request: whether the server took it.
  let send: @MainActor (Owner.Action) async -> Bool
  /// Reads the section from another address (a switch's).
  let open: @MainActor (String) -> Void
  /// A site page the app has as its own (pushed), from a link.
  let item: @MainActor (String) -> HandbookIndex.Item?
  let site: @MainActor (String) -> URL?

  /// `id`: what the UI tests find its links (or tiles) by.
  func block(_ b: Owner.Block, id: String) -> AnyView {
    switch b {
    case .heading(let text, let level, let anchor):
      let t = Text(verbatim: text).font(level <= 2 ? .title3.bold() : .headline).accessibilityHeading(level <= 2 ? .h2 : .h3)
        .padding(.top, level <= 2 ? 10 : 2)
      // Where a link opens the section at it.
      return anchor.map { AnyView(t.id($0)) } ?? AnyView(t)
    case .note(let text, let tone):
      return AnyView(Text(verbatim: text).font(.callout).foregroundStyle(tone == .plain ? Color.secondary : tone.color)
        .accessibilityLabel(Text(verbatim: said(text, tone.said))))
    case .figures(let items):
      return grid(items.map { tile($0, id) })
    case .chart(let c):
      return AnyView(OwnerChart(chart: c))
    case .table(let t):
      return table(t)
    case .cards(let cards, let empty, let hidden):
      let views = cards.isEmpty ? [AnyView(Text(verbatim: empty ?? "").foregroundStyle(.secondary))] : cards.map(card)
      // Photos two to a row, made as they scroll into view: a section may keep a hundred.
      guard hidden else {
        return AnyView(LazyVGrid(columns: [GridItem(.flexible(), spacing: 12, alignment: .top), GridItem(.flexible(), alignment: .top)], alignment: .leading,
                                 spacing: 12) { ForEach(views.indices, id: \.self) { views[$0] } })
      }
      return AnyView(VStack(alignment: .leading, spacing: 14) { ForEach(views.indices, id: \.self) { views[$0] } })
    case .actions(let a):
      return buttons(a)
    case .form(let f):
      return AnyView(OwnerForm(form: f, working: working, send: send))
    case .toggle(let label, let on, let href):
      return AnyView(Toggle(isOn: Binding(get: { on }, set: { _ in open(href) })) { Text(verbatim: label) }
        .disabled(working)
        .accessibilityIdentifier("owner-switch"))
    case .link(let l):
      var t = Text(verbatim: l.title).foregroundStyle(l.tone == .plain ? Color.primary : l.tone.color)
      if let s = l.text { t = t + Text(verbatim: "\n" + s).font(.subheadline).foregroundStyle(.secondary) }
      if let label = l.label, !label.isEmpty { t = t + Text(verbatim: "\n" + label).font(.subheadline.weight(.semibold)).foregroundStyle(Color.accentColor) }
      return go(l.to, AnyView(HStack {
        t.accessibilityLabel(Text(verbatim: said(l.title, l.text, l.label, l.tone.said)))
        Spacer(minLength: 0)
        if l.to != nil { Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary).accessibilityHidden(true) }
      }
      .padding(.vertical, 4)
      .contentShape(.rect)), id)
    }
  }

  /// What VoiceOver says for a part: its words, the tone too (it can't see the colour).
  private func said(_ parts: String?...) -> String { parts.compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ") }

  /// Two to a row, all made at once (a screen of them, at most).
  private func grid(_ views: [AnyView]) -> AnyView {
    AnyView(Grid(alignment: .topLeading, horizontalSpacing: 12, verticalSpacing: 12) {
      ForEach(Array(stride(from: 0, to: views.count, by: 2)), id: \.self) { i in
        GridRow {
          views[i]
          if i + 1 < views.count { views[i + 1] } else { Color.clear }
        }
      }
    })
  }

  /// A KPI tile, or an area's card: its figure, the change, what it counts, a meter or its last 30 days.
  private func tile(_ f: Owner.Figure, _ id: String) -> AnyView {
    var t = Text(verbatim: f.label).font(.footnote).foregroundStyle(.secondary)
    if f.warn { t = t + Text(verbatim: " ⚠︎").foregroundStyle(Color.warning) }
    t = t + Text(verbatim: "\n" + f.value).font(.title2.bold())
    if let d = f.delta { t = t + Text(verbatim: "  " + d.text).font(.caption.weight(.semibold)).foregroundStyle(d.tone.color) }
    if let s = f.sub { t = t + Text(verbatim: "\n" + s).font(.caption).foregroundStyle(.secondary) }
    let d = f.delta
    let words = said(f.label, f.warn ? Owner.Tone.bad.said : nil, f.value, d?.text, d?.tone.said, d.flatMap { $0.vs.isEmpty ? nil : String(localized: "so với \($0.vs)") }, f.sub)
    let spark = f.spark
    return go(f.to, AnyView(VStack(alignment: .leading, spacing: 6) {
      t.accessibilityLabel(Text(verbatim: words))
      if let m = f.meter { ProgressView(value: m).accessibilityHidden(true) }
      if !spark.isEmpty {
        // The last 7 days (the figure's) strong, the 7 before (the chip's comparison) paler, the rest faint.
        Canvas { ctx, size in
          let top = spark.compactMap { $0 }.max() ?? 0, w = size.width / CGFloat(spark.count)
          for (i, v) in spark.enumerated() {
            guard let v, top > 0 else { continue }
            let h = max(1, size.height * CGFloat(v / top)), age = spark.count - 1 - i
            let shade = age < 7 ? Color.accentColor : age < 14 ? Color.accentColor.opacity(0.42) : Color.secondary.opacity(0.3)
            ctx.fill(Path(CGRect(x: CGFloat(i) * w + 0.5, y: size.height - h, width: max(1, w - 1), height: h)), with: .color(shade))
          }
        }
        .frame(height: 22)
        .accessibilityHidden(true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(12)
    .background(.fill.quaternary, in: .rect(cornerRadius: 12))
    .contentShape(.rect)), id)
  }

  /// A table, scrolled sideways when its columns don't fit; a folded one opens by its label.
  private func table(_ t: Owner.Table) -> AnyView {
    if t.rows.isEmpty { return AnyView(Text(verbatim: t.empty ?? "").foregroundStyle(.secondary)) }
    let grid = AnyView(ScrollView(.horizontal) {
      Grid(alignment: .topLeading, horizontalSpacing: 16, verticalSpacing: 8) {
        GridRow {
          ForEach(t.columns.indices, id: \.self) { Text(verbatim: t.columns[$0]).font(.footnote.weight(.semibold)).foregroundStyle(.secondary) }
        }
        ForEach(t.rows.indices, id: \.self) { r in
          Divider().gridCellUnsizedAxes(.horizontal)
          GridRow { ForEach(t.rows[r].indices, id: \.self) { cell(t.rows[r][$0]) } }
        }
      }
      .font(.callout)
      .padding(12)
    }
    .background(.fill.quaternary, in: .rect(cornerRadius: 12))
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("owner-table"))
    guard let folded = t.folded else { return grid }
    return AnyView(DisclosureGroup { grid } label: { Text(verbatim: folded) })
  }

  /// A cell: its text (a link's in the tint), its second line smaller.
  private func cell(_ c: Owner.Link) -> AnyView {
    var t = Text(verbatim: c.title).foregroundStyle(c.to != nil ? Color.accentColor : c.tone.color)
    if let s = c.text { t = t + Text(verbatim: "\n" + s).font(.caption).foregroundStyle(.secondary) }
    return go(c.to, AnyView(Capped(width: 240) { t.accessibilityLabel(Text(verbatim: said(c.title, c.text, c.tone.said))) }), "")
  }

  /// A photo or a hidden page, with its buttons.
  private func card(_ c: Owner.Card) -> AnyView {
    let t = c.lines.reduce(Text(verbatim: c.title).font(.subheadline.weight(.semibold))) { $0 + Text(verbatim: "\n" + $1).font(.caption).foregroundStyle(.secondary) }
    return AnyView(VStack(alignment: .leading, spacing: 6) {
      if let src = c.src { OwnerImage(src: src) }
      t
      buttons(c.actions)
    })
  }

  /// A part's buttons, in a row, or one under another when they don't fit across.
  private func buttons(_ actions: [Owner.Action]) -> AnyView {
    let each = ForEach(actions.indices, id: \.self) { i in
      let a = actions[i]
      Button(role: a.asks ? .destructive : nil) { run(a) } label: { Text(verbatim: a.label) }
        .buttonStyle(.bordered)
        .tint(a.tone == .plain ? nil : a.tone.color)
        .disabled(working)
        .accessibilityIdentifier("owner-action")
    }
    return AnyView(ViewThatFits(in: .horizontal) {
      HStack { each }
      VStack(alignment: .leading) { each }
    })
  }

  /// Where a part goes: a section, pushed (at a heading); a page of the site, as the app opens one (or in the browser); an address, in
  /// the browser.
  private func go(_ to: Owner.Destination?, _ v: AnyView, _ id: String) -> AnyView {
    var out = v
    switch to {
    case .section(let key, let anchor)?: out = AnyView(NavigationLink(value: OwnerRoute(key: key, anchor: anchor)) { v }.buttonStyle(.plain))
    case .url(let s)?: if let u = URL(string: s) { out = AnyView(Link(destination: u) { v }.buttonStyle(.plain)) }
    case .page(let p)?:
      if let i = item(p) { out = AnyView(NavigationLink(value: i) { v }.buttonStyle(.plain)) }
      else if let u = site(p) { out = AnyView(Link(destination: u) { v }.buttonStyle(.plain)) }
    case nil: break
    }
    return id.isEmpty ? out : AnyView(out.accessibilityIdentifier(id))
  }
}

/// A form's fields, each under its label, and its button: sent as a button's request is; emptied once the server took
/// it, kept to fix when it didn't.
/// At most `width` across, wrapped to its whole height. `frame(maxWidth:)` passes a sideways scroll view's unlimited
/// width on as it is, so a table's grid measured each cell as one line and cut it there.
private struct Capped: Layout {
  let width: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    subviews.first?.sizeThatFits(ProposedViewSize(width: min(proposal.width ?? width, width), height: nil)) ?? .zero
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(width: bounds.width, height: nil))
  }
}

struct OwnerForm: View {
  let form: Owner.Form
  let working: Bool
  let send: @MainActor (Owner.Action) async -> Bool
  @State private var values: [String: String] = [:]
  @FocusState private var typing: Bool

  var body: some View {
    let action = form.action(values)
    VStack(alignment: .leading, spacing: 8) {
      ForEach(form.fields.indices, id: \.self) { i in
        let f = form.fields[i]
        Text(verbatim: f.label).font(.footnote).foregroundStyle(.secondary).accessibilityHidden(true)
        TextField(text: Binding(get: { values[f.name] ?? "" }, set: { values[f.name] = $0 }), prompt: f.placeholder.map { Text(verbatim: $0) },
                  axis: f.multiline ? .vertical : .horizontal) { Text(verbatim: f.label) }
          .textInputAutocapitalization(.never).autocorrectionDisabled()
          .focused($typing)
          .accessibilityIdentifier("owner-field-" + f.name)
      }
      Button {
        guard let action else { return }
        typing = false
        Task { if await send(action) { values = [:] } }
      } label: { Text(verbatim: form.submit) }
      .buttonStyle(.borderedProminent)
      .disabled(working || action == nil)
      .accessibilityIdentifier("owner-submit")
    }
    .textFieldStyle(.roundedBorder)
    .padding(.bottom, 8)
  }
}

/// A photo: a private one from the site with the account's session, a public one without, kept in memory only.
struct OwnerImage: View {
  let src: String
  @Environment(AccountModel.self) private var account
  @State private var image: UIImage?
  @State private var missing = false

  var body: some View {
    Rectangle().fill(.fill.tertiary)
      .aspectRatio(1, contentMode: .fit)
      .overlay {
        if let image { Image(uiImage: image).resizable().scaledToFill() }
        else if missing { Image(systemName: "photo").font(.title2).foregroundStyle(.tertiary) }
      }
      .clipShape(.rect(cornerRadius: 10))
      .accessibilityHidden(true)
      .task(id: src) {
        // Another photo in this place: not the last one's picture meanwhile.
        image = nil
        missing = false
        image = await account.owner.picture(src)
        missing = image == nil
      }
  }
}

/// Columns over days, as the site's charts: the series stacked from the baseline in their order (a negative value below
/// it), `whole` pale behind them, today lighter while it isn't over, a day not recorded a gap. Drawn with paths: the axis
/// gives its lowest and highest number, the title the unit, a line under it the series' colours.
struct OwnerChart: View {
  let chart: Owner.Chart

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Text(verbatim: chart.unit == "usd" ? chart.title + " ($)" : chart.title).font(.subheadline.weight(.semibold))
      if chart.isEmpty {
        Text(verbatim: chart.empty ?? "").foregroundStyle(.secondary)
      } else {
        let (low, high) = range
        HStack(alignment: .top, spacing: 6) {
          VStack(alignment: .trailing) {
            Text(verbatim: Owner.number(high, unit: chart.unit))
            Spacer()
            Text(verbatim: Owner.number(low, unit: chart.unit))
          }
          .font(.caption2).foregroundStyle(.secondary).monospacedDigit()
          Canvas { ctx, size in draw(ctx, size, low, high) }
            .accessibilityLabel(Text(verbatim: chart.title))
            .accessibilityValue(Text(verbatim: readout))
        }
        .frame(height: 150)
        HStack {
          Text(verbatim: chart.days.first.map(Owner.dayLabel) ?? "")
          Spacer()
          Text(verbatim: chart.days.last.map(Owner.dayLabel) ?? "")
        }
        .font(.caption2).foregroundStyle(.secondary)
        if chart.series.count > 1 || chart.whole != nil {
          // The colours' squares aren't words: VoiceOver gets the names.
          key.font(.caption).accessibilityLabel(Text(verbatim: (chart.series + [chart.whole].compactMap { $0 }).map(\.label).joined(separator: ", ")))
        }
        if let m = chart.missing, chart.series.contains(where: { $0.values.contains(nil) }) {
          Text(verbatim: "— " + m).font(.caption).foregroundStyle(.secondary)
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("owner-chart")
  }

  /// The lowest and highest the columns reach, 0 between them.
  private var range: (Double, Double) {
    var low = 0.0, high = 0.0
    for i in chart.days.indices {
      let v = chart.series.compactMap { $0.values[safe: i] ?? nil }
      low = min(low, v.filter { $0 < 0 }.reduce(0, +))
      high = max(high, v.filter { $0 > 0 }.reduce(0, +), (chart.whole?.values[safe: i] ?? nil) ?? 0)
    }
    return (low, high > low ? high : low + 1)
  }

  private func draw(_ ctx: GraphicsContext, _ size: CGSize, _ low: Double, _ high: Double) {
    let n = chart.days.count, step = size.width / CGFloat(max(n, 1)), y = { (v: Double) in size.height * CGFloat((high - v) / (high - low)) }
    func bar(_ i: Int, _ from: Double, _ to: Double, _ color: Color) {
      let top = y(max(from, to)), rect = CGRect(x: CGFloat(i) * step + step * 0.15, y: top, width: step * 0.7, height: max(1, y(min(from, to)) - top))
      ctx.fill(Path(rect), with: .color(color.opacity(chart.partialLast && i == n - 1 ? 0.45 : 1)))
    }
    for i in 0..<n {
      if let w = chart.whole?.values[safe: i] ?? nil { bar(i, 0, w, Self.whole) }
      var up = 0.0, down = 0.0
      for (s, series) in chart.series.enumerated() {
        guard let v = series.values[safe: i] ?? nil, v != 0 else { continue }
        if v > 0 { bar(i, up, up + v, color(s)); up += v } else { bar(i, down, down + v, color(s)); down += v }
      }
    }
    ctx.fill(Path(CGRect(x: 0, y: y(0), width: size.width, height: 0.5)), with: .color(.secondary))
  }

  /// The series' colours, in a line.
  private var key: Text {
    var t = Text(verbatim: "")
    for s in chart.series.indices { t = t + Text(verbatim: "■ ").foregroundStyle(color(s)) + Text(verbatim: chart.series[s].label + "   ") }
    if let w = chart.whole { t = t + Text(verbatim: "■ ").foregroundStyle(Self.whole) + Text(verbatim: w.label) }
    return t.foregroundStyle(.secondary)
  }

  /// For VoiceOver: the days it covers, then each series' latest value and its lowest and highest ("—": not recorded).
  private var readout: String {
    guard let first = chart.days.first, let last = chart.days.last else { return "" }
    let n = { (v: Double?) in v.map { Owner.number($0, unit: chart.unit) } ?? "—" }
    return ([String(localized: "\(Owner.dayLabel(first)) đến \(Owner.dayLabel(last))")] + (chart.series + [chart.whole].compactMap { $0 }).map { s in
      let v = s.values.compactMap { $0 }
      return String(localized: "\(s.label): mới nhất \(n(s.values.last ?? nil)), thấp nhất \(n(v.min())), cao nhất \(n(v.max()))")
    }).joined(separator: ". ")
  }

  /// The site's series colours (moss, water, rust), as its admin pages draw them in each mode; `bad` the status colour,
  /// `mute` context only.
  private func color(_ s: Int) -> Color {
    switch chart.series[s].tone ?? ["s1", "s2", "s3"][min(s, 2)] {
    case "s2": Self.water
    case "s3", "bad": Self.rust
    case "mute": Self.mute
    default: Self.moss
    }
  }

  static let moss = Color(light: 0x0c6944, dark: 0x36a980)
  static let water = Color(light: 0x2d76a3, dark: 0x359bd9)
  static let rust = Color(light: 0xa6552d, dark: 0xcb7a5b)
  static let mute = Color(light: 0xa19c8e, dark: 0x5d7a75)
  static let whole = Color(light: 0xd9e2d5, dark: 0x244a45)
}

private extension Color {
  init(light: UInt32, dark: UInt32) {
    func rgb(_ c: UInt32) -> UIColor { UIColor(red: CGFloat(c >> 16 & 0xff) / 255, green: CGFloat(c >> 8 & 0xff) / 255, blue: CGFloat(c & 0xff) / 255, alpha: 1) }
    self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? rgb(dark) : rgb(light) })
  }
}

private extension Array {
  /// A chart's value on a day it may have none for (a series shorter than its days).
  subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
