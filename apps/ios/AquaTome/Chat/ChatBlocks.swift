import Handbook
import SwiftUI
import TankCheck

/// An answer's blocks, once its text is whole (docs/design/chat.md): a species' card, a section of a page, a tool, a
/// comparison; each rising a few points and fading in, 60 ms apart (at once under Reduce Motion, or when the turn came
/// whole). Every figure and word in them is the handbook's, never Claude's.
struct ChatBlocks: View {
  let blocks: [Chat.Block]
  /// The page the chat started from: its card shows a thumbnail, not its photo again.
  let about: String?
  /// The handbook covers the question: else the section is only the nearest page.
  var covered = true
  /// Each block appears one after another; false: all at once.
  let staggered: Bool
  /// What the thread scrolls to when a section closes with its heading gone from the screen.
  var turn: UUID?
  var reveal: (String) -> Void = { _ in }
  let open: (String) -> Void
  @State private var shown = 0

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      ForEach(Array(blocks.enumerated()), id: \.offset) { i, b in
        block(b, photosBefore: photos(before: i))
          .opacity(i < shown ? 1 : 0)
          .offset(y: i < shown ? 0 : 6)
      }
    }
    // Once: back from a page the blocks are all there, not arriving again.
    .task {
      guard staggered, shown == 0 else { shown = blocks.count; return }
      for i in blocks.indices {
        withAnimation(.easeOut(duration: 0.25)) { shown = i + 1 }
        try? await Task.sleep(for: .milliseconds(60))
      }
    }
  }

  @ViewBuilder private func block(_ b: Chat.Block, photosBefore: Set<String>) -> some View {
    switch b {
    case .species(let card): SpeciesBlock(card: card, own: card.page.id == about, open: open)
    case .compare(let cards): CompareBlock(cards: cards, open: open)
    case let .section(page, heading, blocks):
      SectionBlock(page: page, heading: heading, parts: Chat.parts(blocks, shown: photosBefore), covered: covered, id: "\(turn?.uuidString ?? "")-\(page.path)-\(heading?.id ?? "")",
                   reveal: reveal, open: open)
    case .tool(let tool): ToolBlock(tool: tool, open: open)
    }
  }

  /// The photos the blocks before `i` show: a section skips one the turn already showed.
  private func photos(before i: Int) -> Set<String> {
    Set(blocks.prefix(i).flatMap { b -> [String] in
      switch b {
      case .species(let c): c.page.img.map { [$0.absoluteString] } ?? []
      case .compare(let cs): cs.compactMap { $0.page.img?.absoluteString }
      case let .section(_, _, blocks): blocks.compactMap { if case let .figure(img, _, _) = $0 { img.src } else { nil } }
      case .tool: []
      }
    })
  }
}

/// A box around a block.
private struct BlockBox<Content: View>: View {
  /// Off inside a button, which reads as one element.
  var contained = true
  @ViewBuilder let content: Content
  var body: some View {
    let box = VStack(alignment: .leading, spacing: 10) { content }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(14)
      .background(.fill.quaternary, in: .rect(cornerRadius: 14))
    if contained { box.accessibilityElement(children: .contain) } else { box }
  }
}

// MARK: A species

/// A fish's, breed's or plant's card: its photo (a thumbnail for the chat's own), its name, the facts card's own items
/// in their order, the traits line as its page has it under "Nuôi chung", and "Xem trang", "Thêm vào bể".
private struct SpeciesBlock: View {
  let card: Chat.Card
  let own: Bool
  let open: (String) -> Void
  @Environment(HandbookModel.self) private var handbook
  @Environment(TanksModel.self) private var tanks
  @Environment(\.dynamicTypeSize) private var size
  @State private var putting = false

  private var item: HandbookIndex.Item? { card.page.path.flatMap { handbook.item(at: $0) } }

  var body: some View {
    BlockBox {
      if !own, let img = card.page.img {
        PageImage(src: img.absoluteString, ratio: 2.1).accessibilityHidden(true)
      }
      HStack(spacing: 10) {
        if own, let img = card.page.img {
          PageImage(src: img.absoluteString, ratio: 1, corner: 8).frame(width: 40, height: 40).accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(card.page.name).font(.headline)
          if let sci = card.page.sci { Text(sci).italic().font(.subheadline).foregroundStyle(.secondary) }
        }
      }
      .accessibilityElement(children: .combine)
      // No figures, no empty box: the Worker sends `facts: {}` for a fish the handbook has none of.
      if let plant = card.plant, plant.any {
        FactsCard(facts: .init(), plant: plant, inPage: true)
      } else if let facts = card.facts, facts.any {
        FactsCard(facts: facts, inPage: true)
      }
      if let facts = card.facts, let traits = FactsCard.traits(facts) { Text(traits) }
      let canPut = item.flatMap { Life($0) } != nil
      // At the largest text, one under the other with a line between.
      Group {
        if size.isAccessibilitySize {
          VStack(alignment: .leading, spacing: 10) {
            openButton
            if card.page.path != nil && canPut { Divider() }
            if canPut { putButton }
          }
        } else {
          HStack(spacing: 20) {
            openButton
            if canPut { putButton }
          }
        }
      }
      .font(.subheadline.weight(.semibold))
    }
    .accessibilityIdentifier("chat-card")
    .sheet(isPresented: $putting) { if let item, let life = Life(item) { NavigationStack { PutOnTank(life: life) } } }
  }

  @ViewBuilder private var openButton: some View {
    if let p = card.page.path {
      Button("Xem trang") { open(p) }.accessibilityIdentifier("chat-card-open")
    }
  }

  private var putButton: some View {
    Button { putting = true } label: { Label("Thêm vào bể", systemImage: "plus") }
      .disabled(!tanks.canEdit)
      .accessibilityIdentifier("chat-card-put")
  }
}

// MARK: A comparison

/// Two to four species side by side: their photos, then the card's rows, a row whose figures differ marked "khác", a
/// figure bold only when it alone differs among three or more; then their traits. At the largest text the photos go
/// and each figure says whose it is, a species to a line.
private struct CompareBlock: View {
  let cards: [Chat.Card]
  let open: (String) -> Void
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size

  /// A row: its label, each species' figure as shown (nil: none), and what it's compared by.
  private struct Row {
    let label: String
    let values: [String?]
    let differs: Chat.Differs
  }

  private var rows: [Row] {
    let locale = Locale(identifier: handbook.lang)
    func row<K: Hashable>(_ label: String, _ shown: (HandbookIndex.Facts) -> String?, by key: (HandbookIndex.Facts) -> K?) -> Row? {
      let facts = cards.map(\.facts)
      let values = facts.map { $0.flatMap(shown) }
      guard values.contains(where: { $0 != nil }) else { return nil }
      return Row(label: label, values: values, differs: Chat.differs(facts.map { $0.flatMap(key) }))
    }
    typealias F = HandbookIndex.Facts
    let range = { (r: F.Range?) in r.map { F.range($0, locale) } }
    let key = { (r: F.Range?) in r.map { "\($0.min)-\($0.max)" } }
    return [
      row(String(localized: "Nhiệt độ"), { range($0.tempC).map { "\($0)°C" } }, by: { key($0.tempC) }),
      row(String(localized: "pH"), { range($0.ph) }, by: { key($0.ph) }),
      row(String(localized: "Độ cứng (dGH)"), { range($0.gh) }, by: { key($0.gh) }),
      row(String(localized: "Kích thước"), { $0.sizeCm.map { "\(F.number($0, locale)) cm" } }, by: { $0.sizeCm }),
      row(String(localized: "Tuổi thọ"), { range($0.lifeYears).map { "\($0) \(String(localized: "năm"))" } }, by: { key($0.lifeYears) }),
      row(String(localized: "Bể tối thiểu"), { $0.tankCm.map { "\(F.number($0, locale)) cm" } }, by: { $0.tankCm }),
      // Difficulty by its number: "Dễ 3/8" and "Dễ 2/8" differ.
      row(String(localized: "Độ khó"), { $0.difficulty.map { "\(FactsCard.level($0)) \(F.number($0, locale))/8" } }, by: { $0.difficulty }),
      // By the word it shows: one this app has no word for is missing, not a difference.
      row(String(localized: "Tính cách"), { $0.temperament.flatMap(FactsCard.temperament) }, by: { $0.temperament.flatMap(FactsCard.temperament) }),
      row(String(localized: "Đàn tối thiểu"), { $0.schoolMin.map { String(localized: "\($0) con") } }, by: { $0.schoolMin }),
    ].compactMap { $0 } + plantRows
  }

  /// A plant's figures, as its page has them, in the index's words for this language.
  private var plantRows: [Row] {
    let plants = cards.map(\.plant)
    let word = { (key: String, value: String) in handbook.labels[key, value] ?? value }
    func row(_ label: String, _ shown: (HandbookIndex.Plant) -> String?) -> Row? {
      let values = plants.map { $0.flatMap(shown) }
      guard values.contains(where: { $0 != nil }) else { return nil }
      return Row(label: label, values: values, differs: Chat.differs(values))
    }
    return [
      row(String(localized: "Độ khó")) { p in p.difficulty.map { word("difficulty", "\($0)") } },
      row(String(localized: "Ánh sáng")) { p in p.light.map { word("light", $0) } },
      row(String(localized: "CO₂")) { p in p.co2.map { word("co2", $0) } },
      row(String(localized: "Tốc độ mọc")) { p in p.growth.map { word("growth", $0) } },
      row(String(localized: "Vị trí")) { p in p.placement.isEmpty ? nil : p.placement.map { word("placement", $0) }.joined(separator: ", ") },
    ].compactMap { $0 }
  }

  var body: some View {
    BlockBox {
      if size.isAccessibilitySize {
        // The photos go; each still opens its page, a species to a line.
        VStack(alignment: .leading, spacing: 8) {
          ForEach(Array(cards.enumerated()), id: \.offset) { _, c in name(c) { Text(c.page.name).font(.subheadline.weight(.semibold)).multilineTextAlignment(.leading) } }
        }
      } else {
        HStack(alignment: .top, spacing: 8) {
          ForEach(Array(cards.enumerated()), id: \.offset) { _, c in
            name(c) {
              VStack(alignment: .leading, spacing: 4) {
                if let img = c.page.img {
                  PageImage(src: img.absoluteString, ratio: 1.3, corner: 8).accessibilityHidden(true)
                } else {
                  Rectangle().fill(.fill.tertiary).aspectRatio(1.3, contentMode: .fit).clipShape(.rect(cornerRadius: 8)).accessibilityHidden(true)
                }
                Text(c.page.name).font(.footnote.weight(.semibold)).multilineTextAlignment(.leading)
              }
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)
          }
        }
      }
      ForEach(Array(rows.enumerated()), id: \.offset) { _, r in row(r) }
    }
    .accessibilityIdentifier("chat-compare")
  }

  @ViewBuilder private func row(_ r: Row) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 6) {
        Text(r.label).font(.footnote).foregroundStyle(.secondary)
        if r.differs.differ { Text("khác").font(.caption.weight(.semibold)).foregroundStyle(.orange) }
      }
      if size.isAccessibilitySize {
        ForEach(Array(cards.enumerated()), id: \.offset) { i, c in
          Text("\(c.page.name): \(figure(r, i))").fontWeight(r.differs.alone == i ? .bold : .regular)
        }
      } else {
        HStack(alignment: .top, spacing: 8) {
          ForEach(Array(cards.indices), id: \.self) { i in
            Text(figure(r, i))
              .font(.subheadline.weight(r.differs.alone == i ? .bold : .regular))
              .foregroundStyle(r.values[i] == nil ? .secondary : .primary)
              .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(spoken(r)))
  }

  /// A species' name opening its page; one with no page, only its name.
  @ViewBuilder private func name<Label: View>(_ c: Chat.Card, @ViewBuilder _ label: () -> Label) -> some View {
    if let p = c.page.path {
      Button { open(p) } label: { label() }.buttonStyle(.plain)
    } else {
      label().accessibilityElement(children: .combine)
    }
  }

  private func figure(_ r: Row, _ i: Int) -> String { r.values[i] ?? "—" }

  /// As VoiceOver reads a row: "Bể tối thiểu, khác: Cá neon xanh 60 cm, Cá neon đen 80 cm", a missing figure "chưa có". The
  /// one figure that alone differs, as bold can't be heard: "Cá neon đen 80 cm, hai loài kia 60 cm".
  private func spoken(_ r: Row) -> String {
    let missing = cards.indices.filter { r.values[$0] == nil }.map { "\(cards[$0].page.name) \(String(localized: "chưa có"))" }
    var each: [String]
    if let odd = r.differs.alone, let same = cards.indices.first(where: { $0 != odd && r.values[$0] != nil }).flatMap({ r.values[$0] }),
       let oddFigure = r.values[odd] {
      let others = cards.indices.filter { $0 != odd && r.values[$0] != nil }.count
      each = ["\(cards[odd].page.name) \(oddFigure)", (others == 2 ? String(localized: "hai loài kia") : String(localized: "ba loài kia")) + " \(same)"]
    } else {
      each = cards.indices.filter { r.values[$0] != nil }.map { "\(cards[$0].page.name) \(r.values[$0]!)" }
    }
    each += missing
    let all = each.joined(separator: ", ")
    return r.differs.differ ? String(localized: "\(r.label), khác: \(all)") : "\(r.label): \(all)"
  }
}

// MARK: A section

/// One section of a page: its kind and heading, then its own blocks, whole ones, five lines with the fifth fading;
/// tapped, open in place up to about fifteen lines, a longer one ending in a fade with "Thu gọn" and what's left;
/// "Đọc tiếp trong “<page>”" opens the page at the heading. One short enough to show whole has nothing to open. What this
/// screen doesn't draw (a carousel, the climate) is never lost in silence: it's counted among what's left.
private struct SectionBlock: View {
  let page: Chat.PageRef
  let heading: (text: String, id: String)?
  let parts: [Chat.Part]
  let covered: Bool
  let id: String
  let reveal: (String) -> Void
  let open: (String) -> Void
  @State private var opened = false
  /// Each part's height as drawn, to stop at whole parts.
  @State private var heights: [Int: CGFloat] = [:]
  @State private var headingInView = true
  @State private var tip: Tip?
  @ScaledMetric private var line: CGFloat = 22
  private let gap: CGFloat = 8
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var drawn: [Chat.Part] { parts.filter(SectionPart.draws) }
  private var undrawn: [Chat.Part] { parts.filter { !SectionPart.draws($0) } }

  /// All of it fits in the closed five lines.
  private var fits: Bool {
    let all = drawn.indices.reduce(CGFloat(0)) { $0 + (heights[$1] ?? line * 6) } + gap * CGFloat(max(0, drawn.count - 1))
    return all <= line * 5
  }

  /// The parts shown open: whole ones, up to about fifteen lines (at least one).
  private var openCount: Int {
    var sum: CGFloat = 0
    for i in drawn.indices {
      sum += heights[i] ?? line
      if sum > line * 15 { return max(1, i) }
    }
    return drawn.count
  }

  var body: some View {
    let drawn = drawn
    let shown = opened ? openCount : drawn.count
    let cut = opened ? shown < drawn.count : !fits
    let rest = opened || fits ? Chat.Rest(drawn.dropFirst(shown) + undrawn) : Chat.Rest()
    BlockBox {
      VStack(alignment: .leading, spacing: 2) {
        Text(covered ? Self.kind(page.kind) : String(localized: "Trang gần nhất")).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        Text(heading?.text ?? page.title).font(.headline)
      }
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isHeader)
      .onScrollVisible(true) { headingInView = $0 }
      if !drawn.isEmpty {
        VStack(alignment: .leading, spacing: gap) {
          ForEach(Array(drawn.prefix(shown).enumerated()), id: \.offset) { i, p in
            SectionPart(part: p).onGeometryChange(for: CGFloat.self) { $0.size.height } action: { heights[i] = $0 }
          }
        }
        // Closed: five lines, the fifth fading; open and cut, its last line.
        .frame(maxHeight: opened ? nil : line * 5, alignment: .top)
        .clipped()
        .mask {
          VStack(spacing: 0) {
            Rectangle()
            if cut { LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: line) }
          }
        }
        .contentShape(.rect)
        .onTapGesture { if !opened && !fits { change(to: true) } }
        .accessibilityAction(named: Text("Mở")) { if !fits { opened = true } }
      }
      if opened || !rest.isEmpty {
        HStack {
          if opened { Button("Thu gọn") { close() } }
          Spacer(minLength: 8)
          if !rest.isEmpty { Text(Self.rest(rest)).font(.footnote).foregroundStyle(.secondary) }
        }
        .font(.subheadline.weight(.semibold))
      }
      Button { open(page.path + (heading.map { "#\($0.id)" } ?? "")) } label: {
        Text("Đọc tiếp trong “\(page.title)”").multilineTextAlignment(.leading)
      }
      .font(.subheadline.weight(.semibold))
      .accessibilityIdentifier("chat-section-open")
    }
    .accessibilityIdentifier("chat-section")
    .id(id)
    // Links in its text, as the page's own: another page opens in the app, this page's `#id` opens it there, a word's tip shows.
    .environment(\.openURL, OpenURLAction { url in
      switch url.scheme {
      case "page-anchor":
        open(page.path + "#" + (String(url.absoluteString.dropFirst("page-anchor:".count)).removingPercentEncoding ?? ""))
        return .handled
      case "page-tip":
        tip = Tip(url)
        return .handled
      case nil:
        open(url.absoluteString)
        return .handled
      default:
        return .systemAction
      }
    })
    .alert(tip?.term ?? "", isPresented: Binding(get: { tip != nil }, set: { if !$0 { tip = nil } }), presenting: tip) { t in
      if let h = t.href { Button("Xem thêm") { open(h) } }
      Button("Đóng", role: .cancel) {}
    } message: { t in
      Text(t.text)
    }
  }

  private func change(to open: Bool) {
    withAnimation(reduceMotion ? nil : .smooth(duration: 0.35)) { opened = open }
  }

  /// Closed; with its heading gone from the screen, back to it.
  private func close() {
    let away = !headingInView
    change(to: false)
    if away { reveal(id) }
  }

  /// The page's kind, over the heading.
  static func kind(_ k: String) -> String {
    switch k {
    case "guide": String(localized: "Hướng dẫn")
    case "fish": String(localized: "Trang loài")
    case "plant": String(localized: "Cây thủy sinh")
    case "glossary": String(localized: "Thuật ngữ")
    case "video": String(localized: "Video")
    default: String(localized: "Thiết bị")
    }
  }

  /// What's left: "còn tiếp: 3 bước, 1 ảnh".
  static func rest(_ r: Chat.Rest) -> String {
    var each: [String] = []
    if r.steps > 0 { each.append(String(localized: "\(r.steps) bước")) }
    if r.items > 0 { each.append(String(localized: "\(r.items) ý")) }
    if r.paragraphs > 0 { each.append(String(localized: "\(r.paragraphs) đoạn")) }
    if r.photos > 0 { each.append(String(localized: "\(r.photos) ảnh")) }
    if r.others > 0 { each.append(String(localized: "\(r.others) phần")) }
    return String(localized: "còn tiếp: \(each.joined(separator: ", "))")
  }
}

/// One part of a section, as its page has it: a paragraph, a list's item with whatever it holds, a photo with its caption
/// and credit, a summary, questions, a table.
private struct SectionPart: View {
  let part: Chat.Part

  /// Whether this screen draws it: the others are counted, and "Đọc tiếp" shows them.
  static func draws(_ p: Chat.Part) -> Bool {
    guard case let .other(b) = p else { return true }
    switch b {
    case .summary, .faq, .table: return true
    default: return false
    }
  }

  var body: some View {
    switch part {
    case .paragraph(let runs):
      Text(styled(runs))
    case let .item(n, blocks):
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(verbatim: n.map { "\($0)." } ?? "•").monospacedDigit()
        VStack(alignment: .leading, spacing: 4) {
          // A list in a list, a photo in a step: all of it. In AnyView, as a view can't hold its own type directly.
          ForEach(Array(Chat.parts(blocks).filter(Self.draws).enumerated()), id: \.offset) { _, p in AnyView(SectionPart(part: p)) }
        }
      }
    case let .figure(img, caption, _):
      VStack(alignment: .leading, spacing: 4) {
        PageImage(src: img.src, ratio: img.h > 0 ? CGFloat(img.w) / CGFloat(img.h) : 1.5, alt: img.alt, corner: 8)
        if !caption.isEmpty { Text(styled(caption)).font(.footnote).foregroundStyle(.secondary) }
        if let credit = credit(img) { Text(credit).font(.caption2).foregroundStyle(.secondary).tint(Color.secondary) }
      }
    case .other(let b):
      switch b {
      case let .summary(title, items, paragraph, _, _):
        VStack(alignment: .leading, spacing: 4) {
          Text(title).font(.subheadline.weight(.semibold))
          if let paragraph { Text(paragraph) } else { Text(items.map { "• " + $0 }.joined(separator: "\n")) }
        }
      case let .faq(title, items):
        VStack(alignment: .leading, spacing: 6) {
          Text(title).font(.subheadline.weight(.semibold))
          ForEach(Array(items.enumerated()), id: \.offset) { _, qa in
            VStack(alignment: .leading, spacing: 2) {
              Text(qa.q).fontWeight(.semibold)
              Text(qa.a)
            }
          }
        }
      case let .table(head, rows):
        TablePart(head: head.map { $0.map { styled($0) } }, rows: rows.map { $0.map { styled($0) } })
      default:
        EmptyView()
      }
    }
  }
}

// MARK: A tool

/// A tool: for tank mates, what was checked (the reader's tank and its fish, the ones added; with no tank, the fish alone)
/// and the check's own rows, never Claude's words; opening the reader's tank at "Nuôi chung", else the tool set to those
/// fish; another tool, its name, opening it. With nowhere to go, the block is the whole answer, not a button.
private struct ToolBlock: View {
  let tool: Chat.Tool
  let open: (String) -> Void
  @Environment(\.openScreen) private var openScreen
  @Environment(\.dynamicTypeSize) private var size
  @Environment(TanksModel.self) private var tanks
  @Environment(HandbookModel.self) private var handbook

  private var check: TankCheck? { tool.check.flatMap { try? JSONDecoder().decode(TankCheck.self, from: $0) } }

  var body: some View {
    if canGo {
      Button(action: go) { box(contained: false) }
        .buttonStyle(.plain)
        .accessibilityIdentifier("chat-tool")
    } else {
      box(contained: true).accessibilityIdentifier("chat-tool")
    }
  }

  private func box(contained: Bool) -> some View {
    BlockBox(contained: contained) {
      HStack(alignment: .top, spacing: 10) {
        Image(systemName: tool.tool == "tank-mates" ? "fish.fill" : "wrench.and.screwdriver.fill")
          .foregroundStyle(.tint).frame(width: 28, height: 28).background(.fill.tertiary, in: .rect(cornerRadius: 7)).accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 6) {
          Text(tool.name).font(.headline)
          if let what = checked { Text(what).font(.subheadline).foregroundStyle(.secondary) }
          if let check { TankCheckRows(check: check) }
          if size.isAccessibilitySize, canGo {
            if let tank = openableTank { Text("Mở \(tank.name)").font(.subheadline.weight(.semibold)).foregroundStyle(.tint) }
            else { Text("Mở công cụ nuôi chung").font(.subheadline.weight(.semibold)).foregroundStyle(.tint) }
          }
        }
        Spacer(minLength: 0)
        if canGo { Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary).accessibilityHidden(true) }
      }
    }
  }

  /// The reader's tank it checked, while they still have it.
  private var openableTank: Chat.CheckedTank? { tool.tank.flatMap { t in tanks.tanks.contains { $0.id == t.id } ? t : nil } }

  private var canGo: Bool { tool.tank != nil || tool.path != nil }

  /// What was checked: "Bể phòng khách, 60 cm: Cá neon xanh × 6, thêm Cá betta × 1"; past two lines' worth, the tank's
  /// other fish as "và 3 loài khác", the added always named. With no tank, the fish the tool is set to.
  private var checked: String? {
    guard tool.tool == "tank-mates" else { return nil }
    func one(_ name: String, _ count: Int?) -> String { count.map { "\(name) × \($0)" } ?? name }
    guard let t = tool.tank else {
      let query = tool.path.flatMap { URLComponents(string: $0)?.query }
      let fish = TankMatesLink(query: query, fish: handbook.shelves.all(.fish)).fish
      return fish.isEmpty ? nil : fish.map { one($0.item.name, $0.count) }.joined(separator: ", ")
    }
    let size = t.dims.map { "\(Int($0[0].rounded())) cm" } ?? t.litres.map { litresText($0) }
    let head = [t.name, size].compactMap { $0 }.joined(separator: ", ")
    let added = t.added.isEmpty ? nil : String(localized: "thêm \(t.added.map { one($0.name, $0.count) }.joined(separator: ", "))")
    let room = 4 - (added == nil ? 0 : 1), hidden = max(0, t.fish.count - room)
    var parts = t.fish.prefix(room).map { one($0.name, $0.count) }
    if hidden > 0 { parts[parts.count - 1] += " " + String(localized: "và \(hidden) loài khác") }
    if let added { parts.append(added) }
    return parts.isEmpty ? head : "\(head): \(parts.joined(separator: ", "))"
  }

  private func go() {
    if let t = openableTank {
      // The check as it was made, the added fish shown and not saved.
      let added = t.added.map { f in f.count.map { "\(f.name) × \($0)" } ?? f.name }.joined(separator: ", ")
      tanks.trial = TankTrial(tank: t.id, added: added.isEmpty ? nil : added, check: check)
      openScreen(.tanks(t.id))
    } else if let p = tool.path {
      open(p)
    } else {
      // Gone from their tanks, with no link to check it by.
      openScreen(.tanks(nil))
    }
  }
}
