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
  /// Each block appears one after another; false: all at once.
  let staggered: Bool
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
    .task {
      guard staggered else { shown = blocks.count; return }
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
    case let .section(page, heading, blocks): SectionBlock(page: page, heading: heading, parts: Chat.parts(blocks, shown: photosBefore), open: open)
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
  @ViewBuilder let content: Content
  var body: some View {
    VStack(alignment: .leading, spacing: 10) { content }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(14)
      .background(.fill.quaternary, in: .rect(cornerRadius: 14))
      .accessibilityElement(children: .contain)
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
        AsyncImage(url: img) { $0.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.15) }
          .frame(maxWidth: .infinity).frame(height: 160).clipShape(.rect(cornerRadius: 10))
          .accessibilityHidden(true)
      }
      HStack(spacing: 10) {
        if own, let img = card.page.img {
          AsyncImage(url: img) { $0.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.15) }
            .frame(width: 40, height: 40).clipShape(.rect(cornerRadius: 8)).accessibilityHidden(true)
        }
        VStack(alignment: .leading, spacing: 2) {
          Text(card.page.name).font(.headline)
          if let sci = card.page.sci { Text(sci).italic().font(.subheadline).foregroundStyle(.secondary) }
        }
      }
      .accessibilityElement(children: .combine)
      FactsCard(facts: card.facts ?? .init(), plant: card.plant, inPage: true)
      if let facts = card.facts, let traits = FactsCard.traits(facts) { Text(traits) }
      // At the largest text, one under the other with a line between.
      let buttons = Group {
        if card.page.path != nil {
          Button("Xem trang") { if let p = card.page.path { open(p) } }.accessibilityIdentifier("chat-card-open")
        }
        if let item, Life(item) != nil {
          Button { putting = true } label: { Label("Thêm vào bể", systemImage: "plus") }
            .disabled(!tanks.canEdit)
            .accessibilityIdentifier("chat-card-put")
        }
      }
      .font(.subheadline.weight(.semibold))
      if size.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 10) { buttons; }
      } else {
        HStack(spacing: 20) { buttons }
      }
    }
    .accessibilityIdentifier("chat-card")
    .sheet(isPresented: $putting) { if let item, let life = Life(item) { NavigationStack { PutOnTank(life: life) } } }
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
      row(String(localized: "Tính cách"), { $0.temperament.flatMap(FactsCard.temperament) }, by: { $0.temperament }),
      row(String(localized: "Đàn tối thiểu"), { $0.schoolMin.map { String(localized: "\($0) con") } }, by: { $0.schoolMin }),
    ].compactMap { $0 }
  }

  var body: some View {
    BlockBox {
      if !size.isAccessibilitySize {
        HStack(alignment: .top, spacing: 8) {
          ForEach(Array(cards.enumerated()), id: \.offset) { _, c in
            Button { if let p = c.page.path { open(p) } } label: {
              VStack(alignment: .leading, spacing: 4) {
                AsyncImage(url: c.page.img) { $0.resizable().scaledToFill() } placeholder: { Color.secondary.opacity(0.15) }
                  .frame(height: 64).frame(maxWidth: .infinity).clipShape(.rect(cornerRadius: 8)).accessibilityHidden(true)
                Text(c.page.name).font(.footnote.weight(.semibold)).multilineTextAlignment(.leading)
              }
            }
            .buttonStyle(.plain)
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

  private func figure(_ r: Row, _ i: Int) -> String { r.values[i] ?? "—" }

  /// As VoiceOver reads a row: "Bể tối thiểu, khác: Cá neon xanh 60 cm, Cá neon đen 80 cm", a missing figure "chưa có".
  private func spoken(_ r: Row) -> String {
    let each = cards.indices.map { "\(cards[$0].page.name) \(r.values[$0] ?? String(localized: "chưa có"))" }.joined(separator: ", ")
    return r.differs.differ ? String(localized: "\(r.label), khác: \(each)") : "\(r.label): \(each)"
  }
}

// MARK: A section

/// One section of a page: its kind and heading, then its own blocks, whole ones, five lines with the fifth fading;
/// tapped, open in place up to about fifteen lines, a longer one ending in a fade with "Thu gọn" and what's left;
/// "Đọc tiếp trong “<page>”" opens the page at the heading.
private struct SectionBlock: View {
  let page: Chat.PageRef
  let heading: (text: String, id: String)?
  let parts: [Chat.Part]
  let open: (String) -> Void
  @State private var opened = false
  /// Each part's height as drawn, to stop at whole parts.
  @State private var heights: [Int: CGFloat] = [:]
  @ScaledMetric private var line: CGFloat = 22

  /// The parts shown open: whole ones, up to about fifteen lines (at least one).
  private var openCount: Int {
    var sum: CGFloat = 0
    for i in parts.indices {
      sum += heights[i] ?? line
      if sum > line * 15 { return max(1, i) }
    }
    return parts.count
  }

  var body: some View {
    BlockBox {
      VStack(alignment: .leading, spacing: 2) {
        Text(Self.kind(page.kind)).font(.caption.weight(.semibold)).foregroundStyle(.secondary)
        Text(heading?.text ?? page.title).font(.headline)
      }
      .accessibilityElement(children: .combine)
      .accessibilityAddTraits(.isHeader)
      let shown = opened ? openCount : parts.count
      VStack(alignment: .leading, spacing: 8) {
        ForEach(Array(parts.prefix(shown).enumerated()), id: \.offset) { i, p in
          part(p).onGeometryChange(for: CGFloat.self) { $0.size.height } action: { heights[i] = $0 }
        }
      }
      // Closed: five lines, the fifth fading.
      .frame(maxHeight: opened ? nil : line * 5, alignment: .top)
      .clipped()
      .mask {
        if opened && shown >= parts.count {
          Rectangle()
        } else {
          LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.8), .init(color: .clear, location: 1)],
                         startPoint: .top, endPoint: .bottom)
        }
      }
      .contentShape(.rect)
      .onTapGesture { withAnimation(.smooth(duration: 0.35)) { opened = true } }
      .accessibilityAction(named: Text("Mở")) { opened = true }
      if opened && shown < parts.count {
        HStack {
          Button("Thu gọn") { withAnimation(.smooth(duration: 0.35)) { opened = false } }
          Spacer(minLength: 8)
          Text(Self.rest(Chat.Rest(parts.dropFirst(shown)))).font(.footnote).foregroundStyle(.secondary)
        }
        .font(.subheadline.weight(.semibold))
      } else if opened {
        Button("Thu gọn") { withAnimation(.smooth(duration: 0.35)) { opened = false } }.font(.subheadline.weight(.semibold))
      }
      Button { open(page.path + (heading.map { "#\($0.id)" } ?? "")) } label: {
        Text("Đọc tiếp trong “\(page.title)”").multilineTextAlignment(.leading)
      }
      .font(.subheadline.weight(.semibold))
      .accessibilityIdentifier("chat-section-open")
    }
    .accessibilityIdentifier("chat-section")
  }

  @ViewBuilder private func part(_ p: Chat.Part) -> some View {
    switch p {
    case .paragraph(let runs):
      Text(styled(runs))
    case let .item(n, blocks):
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Text(verbatim: n.map { "\($0)." } ?? "•").monospacedDigit()
        VStack(alignment: .leading, spacing: 4) {
          ForEach(Array(blocks.enumerated()), id: \.offset) { _, b in
            if case .paragraph(let runs) = b { Text(styled(runs)) }
          }
        }
      }
    case let .figure(img, caption, _):
      VStack(alignment: .leading, spacing: 4) {
        AsyncImage(url: URL(string: img.src)) { $0.resizable().scaledToFit() } placeholder: { Color.secondary.opacity(0.15).frame(height: 120) }
          .clipShape(.rect(cornerRadius: 8))
          .accessibilityLabel(Text(img.alt ?? ""))
        if !caption.isEmpty { Text(styled(caption)).font(.footnote).foregroundStyle(.secondary) }
      }
    case .other:
      EmptyView()
    }
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

// MARK: A tool

/// A tool: for tank mates, what was checked (the reader's tank and its fish, the ones added) and the check's own rows,
/// never Claude's words; opening the reader's tank, else the tool set to those fish; another tool, its name, opening it.
private struct ToolBlock: View {
  let tool: Chat.Tool
  let open: (String) -> Void
  @Environment(\.openScreen) private var openScreen
  @Environment(\.dynamicTypeSize) private var size

  private var check: TankCheck? { tool.check.flatMap { try? JSONDecoder().decode(TankCheck.self, from: $0) } }

  var body: some View {
    Button(action: go) {
      BlockBox {
        HStack(alignment: .top, spacing: 10) {
          Image(systemName: tool.tool == "tank-mates" ? "fish.fill" : "wrench.and.screwdriver.fill")
            .foregroundStyle(.tint).frame(width: 28, height: 28).background(.fill.tertiary, in: .rect(cornerRadius: 7)).accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 6) {
            Text(tool.name).font(.headline)
            if let what = checked { Text(what).font(.subheadline).foregroundStyle(.secondary) }
            if let check { TankCheckRows(check: check) }
            if size.isAccessibilitySize, canGo {
              if let tank = tool.tank { Text("Mở \(tank.name)").font(.subheadline.weight(.semibold)).foregroundStyle(.tint) }
              else { Text("Mở công cụ nuôi chung").font(.subheadline.weight(.semibold)).foregroundStyle(.tint) }
            }
          }
          Spacer(minLength: 0)
          if canGo { Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary).accessibilityHidden(true) }
        }
      }
    }
    .buttonStyle(.plain)
    .disabled(!canGo)
    .accessibilityIdentifier("chat-tool")
  }

  private var canGo: Bool { tool.tank != nil || tool.path != nil }

  /// What was checked: "Bể phòng khách, 60 cm: Cá neon xanh × 6, thêm Cá betta × 1"; past two lines' worth, "và 3 loài
  /// khác".
  private var checked: String? {
    guard tool.tool == "tank-mates", let t = tool.tank else { return nil }
    func one(_ f: Chat.CheckedTank.Fish) -> String { f.count.map { "\(f.name) × \($0)" } ?? f.name }
    let size = t.dims.map { "\(Int($0[0].rounded())) cm" } ?? t.litres.map { "\(Int($0.rounded())) l" }
    let head = [t.name, size].compactMap { $0 }.joined(separator: ", ")
    var parts = t.fish.map(one)
    if !t.added.isEmpty { parts.append(String(localized: "thêm \(t.added.map(one).joined(separator: ", "))")) }
    let shownMax = 4
    let list = parts.count > shownMax
      ? parts.prefix(shownMax).joined(separator: ", ") + " " + String(localized: "và \(parts.count - shownMax) loài khác")
      : parts.joined(separator: ", ")
    return list.isEmpty ? head : "\(head): \(list)"
  }

  private func go() {
    if let t = tool.tank { openScreen(.tanks(t.id)) } else if let p = tool.path { open(p) }
  }
}
