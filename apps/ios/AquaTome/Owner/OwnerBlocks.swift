import AccountSync
import Handbook
import SwiftUI

/// What drawing a block needs from the screen it's on, and the drawing: one switch over the block's kind, each part a
/// plain view (AnyView) on the grouped background, in a card where it's a list, a chart or a table. No generic helpers:
/// every reader downloads this code, and only the owner runs it.
@MainActor
struct OwnerDraw {
  /// The section's key and the period it was read for: a table's further rows are read with them.
  let key: String
  let period: String?
  let working: Bool
  let run: @MainActor (Owner.Action) -> Void
  /// A form's request: whether the server took it.
  let send: @MainActor (Owner.Action) async -> Bool
  /// Reads the section from another address (a switch's, a comments filter's).
  let open: @MainActor (String) -> Void
  /// A site page the app has as its own (pushed), from a link.
  let item: @MainActor (String) -> HandbookIndex.Item?
  let site: @MainActor (String) -> URL?

  func block(_ b: Owner.Block) -> AnyView {
    switch b {
    case .heading(let text, let level, let anchor):
      let t = Text(verbatim: text).font(level <= 2 ? .headline : .subheadline.weight(.semibold)).foregroundStyle(.secondary)
        .accessibilityAddTraits(.isHeader).accessibilityHeading(level <= 2 ? .h2 : .h3)
        .padding(.top, level <= 2 ? 12 : 4).padding(.horizontal, 4)
      // Where a link opens the section at it.
      return anchor.map { AnyView(t.id($0)) } ?? AnyView(t)
    case .note(let text, let tone):
      return AnyView(Text(verbatim: text).font(.footnote).foregroundStyle(tone == .plain || tone == .muted ? Color.secondary : tone.color)
        .padding(.horizontal, 4)
        .accessibilityLabel(Text(verbatim: Self.said(text, tone.said))))
    case .figures(let items):
      return AnyView(OwnerFigures(items: items).ownerCard())
    case .chart(let c):
      return AnyView(OwnerChart(chart: c).ownerCard())
    case .table(let t):
      guard let id = t.id, let folded = t.folded else {
        return AnyView(OwnerTable(columns: t.columns, rows: t.rows, empty: t.empty, id: t.id, count: t.count, next: t.next, draw: self))
      }
      // Folded: a row naming it, its figure on the right, opening its rows on a page of their own.
      let route = OwnerTableRoute(key: key, id: id, title: folded, columns: t.columns, count: t.count, period: period)
      return AnyView(NavigationLink(value: route) {
        OwnerRow(title: folded, figure: t.figure ?? t.count.map(String.init), tone: .plain, chevron: true)
      }
      .buttonStyle(.plain)
      .ownerCard(padded: false)
      .accessibilityIdentifier("owner-folded"))
    case .cards(let cards, let empty, let hidden):
      let views = cards.isEmpty ? [AnyView(Text(verbatim: empty ?? "").foregroundStyle(.secondary))] : cards.map(card)
      // Photos two to a row, made as they scroll into view: a section may keep a hundred.
      guard hidden else {
        return AnyView(LazyVGrid(columns: [GridItem(.flexible(), spacing: 12, alignment: .top), GridItem(.flexible(), alignment: .top)], alignment: .leading,
                                 spacing: 12) { ForEach(views.indices, id: \.self) { views[$0] } }.ownerCard())
      }
      return AnyView(VStack(alignment: .leading, spacing: 14) { ForEach(views.indices, id: \.self) { views[$0] } }.frame(maxWidth: .infinity, alignment: .leading).ownerCard())
    case .actions(let a):
      return buttons(a)
    case .form(let f):
      return AnyView(OwnerForm(form: f, working: working, send: send).ownerCard())
    case .toggle(let label, let on, let href):
      return AnyView(Toggle(isOn: Binding(get: { on }, set: { _ in open(href) })) { Text(verbatim: label) }
        .disabled(working)
        .ownerCard()
        .accessibilityIdentifier("owner-switch"))
    case .comments(let c):
      return AnyView(OwnerComments(comments: c, draw: self))
    }
  }

  /// What VoiceOver says for a part: its words, the tone too (it can't see the colour).
  static func said(_ parts: String?...) -> String { parts.compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: ", ") }

  /// A cell: its text (a link's in the tint), its second line smaller. A long one (a review's notes run to some 4 KB, a
  /// note a line) shows two lines until tapped, as the web's does.
  func cell(_ c: Owner.Link) -> AnyView {
    if c.to == nil, c.title.count > 60 || c.title.contains("\n") { return AnyView(Capped(width: 240) { OwnerFold(cell: c, said: Self.said(c.title, c.text, c.tone.said)) }) }
    var t = Text(verbatim: c.title).foregroundStyle(c.to != nil ? Color.accentColor : c.tone.color)
    if let s = c.text { t = t + Text(verbatim: "\n" + s).font(.caption).foregroundStyle(.secondary) }
    return go(c.to, AnyView(Capped(width: 240) { t.accessibilityLabel(Text(verbatim: Self.said(c.title, c.text, c.tone.said))) }), "")
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
  func buttons(_ actions: [Owner.Action]) -> AnyView {
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

  /// Where a part goes: a section, pushed (at a heading); a page of the site, as the app opens one (or in the browser);
  /// an address, in the browser.
  func go(_ to: Owner.Destination?, _ v: AnyView, _ id: String) -> AnyView {
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

/// A row of a list: its title (and second line) on the left, its figure on the right in its tone, a chevron when it
/// opens something.
struct OwnerRow: View {
  let title: String
  var text: String? = nil
  let figure: String?
  let tone: Owner.Tone
  var chevron = false

  var body: some View {
    let words = Text(verbatim: title) + (text.map { Text(verbatim: "\n" + $0).font(.subheadline).foregroundStyle(.secondary) } ?? Text(verbatim: ""))
    let right = figure.map { Text(verbatim: $0).foregroundStyle(tone == .plain ? Color.secondary : tone.color).monospacedDigit() }
    ViewThatFits(in: .horizontal) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        words.frame(maxWidth: .infinity, alignment: .leading)
        right
        if chevron { Self.chevron }
      }
      // At the largest text, the figure under the title.
      HStack(spacing: 8) {
        VStack(alignment: .leading, spacing: 2) { words; right }.frame(maxWidth: .infinity, alignment: .leading)
        if chevron { Self.chevron }
      }
    }
    .padding(.horizontal, 16).padding(.vertical, 11)
    .contentShape(.rect)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: OwnerDraw.said(title, text, figure, tone.said)))
  }

  static let chevron: some View = Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary).accessibilityHidden(true)
}

/// Up to three figures to a row, each its value over what it counts and its change; one to a row at the largest text.
struct OwnerFigures: View {
  let items: [Owner.Figure]
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    let across = size.isAccessibilitySize ? 1 : min(3, max(items.count, 1))
    Grid(alignment: .topLeading, horizontalSpacing: 14, verticalSpacing: 14) {
      ForEach(Array(stride(from: 0, to: items.count, by: across)), id: \.self) { i in
        GridRow {
          ForEach(i..<min(i + across, items.count), id: \.self) { figure(items[$0]) }
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func figure(_ f: Owner.Figure) -> some View {
    var t = Text(verbatim: f.value).font(.title2.bold()).monospacedDigit() + Text(verbatim: "\n" + f.label).font(.footnote).foregroundStyle(.secondary)
    if let d = f.delta { t = t + Text(verbatim: " " + d.text).font(.footnote).foregroundStyle(d.tone == .plain ? Color.secondary : d.tone.color) }
    if let s = f.sub { t = t + Text(verbatim: "\n" + s).font(.caption).foregroundStyle(.secondary) }
    return VStack(alignment: .leading, spacing: 6) {
      t
      if let m = f.meter { ProgressView(value: m).tint(OwnerChart.green).accessibilityHidden(true) }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(verbatim: OwnerDraw.said(f.label, f.value, f.delta?.text, f.delta?.tone.said, f.sub)))
    .accessibilityIdentifier("owner-figure")
  }
}

extension View {
  /// On a card of the grouped background, as an inset list's rows are.
  func ownerCard(padded: Bool = true) -> some View {
    padding(padded ? 16 : 0)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color(uiColor: .secondarySystemGroupedBackground), in: .rect(cornerRadius: 14))
  }
}

/// A long cell: two lines of its text, all of it once tapped ("More" only when there's more), the line under it
/// always. Said whole, its tone too, as a cell is; a button only when there's more to show.
struct OwnerFold: View {
  let cell: Owner.Link
  /// What VoiceOver says: the text, the line under it and the tone (it can't see the colour).
  let said: String
  @State private var open = false
  /// The text's height in two lines, and all of it, at the cell's width: measured apart from what's shown, so folding
  /// it again doesn't take "More" away for a moment.
  @State private var two: CGFloat = 0
  @State private var full: CGFloat = 0

  var body: some View {
    let text = Text(verbatim: cell.title).foregroundStyle(cell.tone.color)
    let more = full > two + 1
    let shown = VStack(alignment: .leading, spacing: 2) {
      text.lineLimit(open ? nil : 2)
        .background {
          ZStack {
            text.lineLimit(2).fixedSize(horizontal: false, vertical: true).hidden()
              .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { two = $0 }
            text.lineLimit(nil).fixedSize(horizontal: false, vertical: true).hidden()
              .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { full = $0 }
          }
        }
      if more { Text(verbatim: open ? "Less" : "More").font(.caption.weight(.semibold)).foregroundStyle(Color.accentColor) }
      if let s = cell.text { Text(verbatim: s).font(.caption).foregroundStyle(.secondary) }
    }
    .multilineTextAlignment(.leading)
    Group {
      if more {
        Button { open.toggle() } label: { shown }.buttonStyle(.plain).accessibilityValue(Text(verbatim: open ? "Less" : "More"))
      } else {
        shown.accessibilityElement(children: .ignore)
      }
    }
    .accessibilityLabel(Text(verbatim: said))
    .accessibilityIdentifier("owner-fold")
  }
}

/// At most `width` across, wrapped to its whole height. `frame(maxWidth:)` passes a sideways scroll view's unlimited
/// width on as it is, so a table's grid measured each cell as one line and cut it there.
struct Capped: Layout {
  let width: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    subviews.first?.sizeThatFits(ProposedViewSize(width: min(proposal.width ?? width, width), height: nil)) ?? .zero
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    subviews.first?.place(at: bounds.origin, proposal: ProposedViewSize(width: bounds.width, height: nil))
  }
}

/// A form's fields, each under its label, and its button: sent as a button's request is; emptied once the server took
/// it, kept to fix when it didn't.
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
