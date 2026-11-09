import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// The owner's trial of a way round a long page, on their account alone, for them to judge on the phone: the bar's title
/// names the part being read and lists them all, and in the second state a green tab on the page's edge moves through
/// them. Chosen in the page's ⋯ menu (`Trial`). Its words are the trial's, not in the strings file; everyone else's page
/// has none of this: no gesture on its scroll view, no heading measured. A trial, so it goes or stays by the owner's call
/// (docs/design has the spec once they've chosen).
@MainActor @Observable
final class PageNavigator {
  enum Trial: String, CaseIterable, Identifiable {
    case today, title, rail
    static let key = "page-navigator-trial"
    var id: String { rawValue }
    var name: String {
      switch self {
      case .today: "Như hiện tại"
      case .title: "Chỉ tiêu đề"
      case .rail: "Tiêu đề + thanh kéo"
      }
    }
  }

  /// A part of the page: a heading's, or its photos', with how many.
  struct Part: Identifiable, Equatable {
    let id: String
    let name: String
    var count: Int?
    var photos = false
    var label: String { count.map { "\(name) · \($0)" } ?? name }
  }

  struct Bubble: Equatable {
    let before: String?
    let at: String
    let after: String?
  }

  /// A part chosen from the title's list, for the page to scroll to.
  struct Asked: Equatable {
    let id: String
    let time: TimeInterval
  }

  /// The coordinate space of the page's content: a heading's place in it doesn't change as the page scrolls.
  nonisolated static let space = "page-content"

  private(set) var parts: [Part] = []
  /// The part being read; none above the first.
  private(set) var current: Part?
  /// At least 4 parts and 3 screens: what's shorter stays as it is.
  private(set) var long = false
  private(set) var asked: Asked?
  var railOn = false { didSet { syncHold() } }

  private(set) var shown = false
  private(set) var pressed = false
  private(set) var grabbed = false
  private(set) var fast = false
  /// The middle of the tab in its lane, and the middle of the part-name beside it.
  private(set) var tabY: CGFloat = 48
  private(set) var marks: [(y: CGFloat, photos: Bool)] = []
  private(set) var bubble: Bubble?
  /// How many times a touch has been caught: the flows' way to tell a catch from a scroll.
  private(set) var catches = 0
  /// Where the tab runs, on the screen.
  var lane: CGRect = .zero { didSet { if !grabbed, lane.height != oldValue.height { tabY = yNow } } }

  @ObservationIgnored private weak var scroll: UIScrollView?
  @ObservationIgnored private var watch: [NSKeyValueObservation] = []
  @ObservationIgnored private var hold: RailHold?
  @ObservationIgnored private var places: [String: CGFloat] = [:]
  @ObservationIgnored private var live: [Part] = []
  /// A part chosen stays named until the reader scrolls: a heading near the end can't reach the top.
  @ObservationIgnored private var held: Part?
  @ObservationIgnored private var hider: Task<Void, Never>?
  @ObservationIgnored private var attachedAt: TimeInterval = 0
  @ObservationIgnored private var lastMove: TimeInterval = 0
  @ObservationIgnored private var lastFast: TimeInterval = 0
  @ObservationIgnored private var lastSeen: TimeInterval = 0
  @ObservationIgnored private var lastY: CGFloat = 0
  @ObservationIgnored private var speed: CGFloat = 0
  @ObservationIgnored private var gap: CGFloat = 0
  @ObservationIgnored private var stops: [(part: Part?, start: CGFloat)] = []
  @ObservationIgnored private var ys: [CGFloat] = []
  @ObservationIgnored private var at = 0
  @ObservationIgnored private var selection: UISelectionFeedbackGenerator?
  @ObservationIgnored private var impact: UIImpactFeedbackGenerator?

  /// For the flows' stills: the rail stays, or stays held.
  private static let stays = ProcessInfo.processInfo.arguments.contains("-page-rail-stays")
  private static let heldStill = ProcessInfo.processInfo.arguments.contains("-page-rail-held")

  // MARK: The page

  static func part(_ piece: NativePage.Piece, at i: Int) -> Part? {
    switch piece {
    case let .text(s, anchor, .heading): Part(id: anchor ?? "piece-\(i)", name: String(s.characters))
    case let .fold(s, anchor, _): Part(id: anchor ?? "piece-\(i)", name: String(s.characters))
    case let .gallery(_, _, photos, _): Part(id: "piece-\(i)", name: "Ảnh", count: photos.count, photos: true)
    case let .pages(title, _): Part(id: "piece-\(i)", name: title)
    default: nil
    }
  }

  func load(_ pieces: [NativePage.Piece]) {
    load(parts: pieces.enumerated().compactMap { Self.part($1, at: $0) })
  }

  /// A page that lists its own parts (v2's species page: its photos, then each titled part).
  func load(parts: [Part]) {
    self.parts = parts
    refresh()
  }

  /// A part that draws nothing (pages the index doesn't list) has no place, and isn't one.
  func placed(_ id: String, _ frame: CGRect) {
    places[id] = frame.height > 0 ? frame.minY : nil
    refresh()
  }

  /// A part chosen from the list: the page scrolls to it (NativePage, as a `#id` link does).
  func ask(_ part: Part) {
    held = part
    current = part
    asked = Asked(id: part.id, time: CACurrentMediaTime())
  }

  func attach(_ s: UIScrollView) {
    guard scroll !== s else { return }
    detach()
    scroll = s
    attachedAt = CACurrentMediaTime()
    lastY = s.contentOffset.y
    watch = [
      s.observe(\.contentOffset) { [weak self] _, _ in MainActor.assumeIsolated { self?.scrolled() } },
      s.observe(\.contentSize) { [weak self] _, _ in MainActor.assumeIsolated { self?.refresh() } },
    ]
    syncHold()
    refresh()
    if Self.stays { keepShown() }
    if Self.heldStill {
      Task { [weak self] in
        try? await Task.sleep(for: .seconds(1))
        self?.showHeldStill()
      }
    }
  }

  func detach() {
    watch = []
    if let hold { hold.view?.removeGestureRecognizer(hold) }
    hold = nil
    hider?.cancel()
    hider = nil
    scroll = nil
    shown = false
  }

  private func syncHold() {
    guard let scroll else { return }
    if railOn, hold == nil {
      let h = RailHold.make()
      h.inside = { [weak self] in self?.onTab($0) ?? false }
      h.pressed = { [weak self] in self?.press($0) }
      h.changed = { [weak self] in self?.holdChanged($0) }
      scroll.addGestureRecognizer(h)
      selection = UISelectionFeedbackGenerator()
      impact = UIImpactFeedbackGenerator(style: .medium)
      // The page's own scroll takes any drag that moves before the hold ends, unless it waits for the hold: off the tab
      // the hold fails at once, so nothing waits there; on it, a finger that moves past the limit still scrolls.
      scroll.panGestureRecognizer.require(toFail: h)
      hold = h
    } else if !railOn, let h = hold {
      scroll.removeGestureRecognizer(h)
      hold = nil
      shown = false
    }
  }

  private var minY: CGFloat { scroll.map { -$0.adjustedContentInset.top } ?? 0 }
  private var maxY: CGFloat {
    guard let s = scroll else { return 0 }
    return max(minY, s.contentSize.height + s.adjustedContentInset.bottom - s.bounds.height)
  }

  private func refresh() {
    live = parts.filter { places[$0.id] != nil }
    if let s = scroll {
      let isLong = live.count >= 4 && s.contentSize.height >= 3 * s.bounds.height
      if isLong != long { long = isLong }
    }
    if !grabbed { tabY = yNow }
    settleCurrent()
  }

  private func settleCurrent() {
    guard let s = scroll else { return }
    var c = held
    if c == nil {
      let line = s.contentOffset.y + s.adjustedContentInset.top + 24
      for p in live where (places[p.id] ?? .infinity) <= line { c = p }
      if s.contentOffset.y > minY, maxY - s.contentOffset.y < 2, let last = live.last { c = last }
    }
    if c != current { current = c }
  }

  // MARK: The page moving

  private func scrolled() {
    guard let s = scroll else { return }
    if s.isDragging || s.isDecelerating, !grabbed { held = nil }
    settleCurrent()
    guard railOn, long, !grabbed else { return }
    tabY = yNow
    let now = CACurrentMediaTime(), y = s.contentOffset.y, dy = abs(y - lastY), dt = now - lastSeen
    lastY = y
    lastSeen = now
    // Not the page settling as it opens.
    guard now - attachedAt > 0.3, dy > 0.5 else { return }
    keepShown()
    speed = dt > 0 && dt < 0.2 ? speed * 0.6 + dy / dt * 0.4 : 0
    if speed > 1600 {
      fast = true
      lastFast = now
    }
  }

  private let top: CGFloat = 48
  private var bottom: CGFloat { max(top, lane.height - 48) }
  private func clamp(_ y: CGFloat) -> CGFloat { min(bottom, max(top, y)) }
  /// While the page moves, the tab is a scroll bar: it says where the page is.
  private var yNow: CGFloat {
    guard let s = scroll, maxY > minY else { return top }
    return top + (bottom - top) * min(1, max(0, (s.contentOffset.y - minY) / (maxY - minY)))
  }

  private func keepShown() {
    lastMove = CACurrentMediaTime()
    if !shown { shown = true }
    guard hider == nil, !Self.stays else { return }
    hider = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(200))
        guard let self else { return }
        let now = CACurrentMediaTime()
        if self.pressed || self.grabbed { self.lastMove = now }
        if self.fast, now - self.lastFast > 0.5 { self.fast = false }
        if now - self.lastMove > 3 {
          self.shown = false
          self.fast = false
          self.hider = nil
          return
        }
      }
    }
  }

  // MARK: The tab held

  /// 64 × 96 round the tab, while it shows.
  private func onTab(_ touch: UITouch) -> Bool {
    guard railOn, long, shown else { return false }
    let p = touch.location(in: nil)
    return p.x >= lane.maxX - 64 && abs(p.y - (lane.minY + tabY)) <= 48
  }

  private func press(_ down: Bool) {
    if pressed != down { pressed = down }
    if down {
      impact?.prepare()
      selection?.prepare()
      keepShown()
    }
  }

  private func holdChanged(_ h: RailHold) {
    let y = h.location(in: nil).y - lane.minY
    switch h.state {
    case .began: grab(y)
    case .changed: move(y)
    case .ended, .cancelled, .failed: release()
    default: break
    }
  }

  /// The stops are counted from where the finger landed, so the hold itself moves nothing.
  private func grab(_ y: CGFloat) {
    guard let s = scroll else { return }
    grabbed = true
    fast = false
    catches += 1
    impact?.impactOccurred()
    gap = tabY - y
    var all: [(part: Part?, start: CGFloat)] = [(part: nil, start: minY)]
    for p in live { all.append((part: p, start: min(maxY, (places[p.id] ?? 0) + minY - 4))) }
    // Headings that can't reach the top all land at the page's end: one stop there.
    stops = all.enumerated().filter { k, x in k == all.count - 1 || x.start < all[k + 1].start - 1 }.map(\.element)
    at = 0
    for (k, x) in stops.enumerated() where x.start <= s.contentOffset.y + 0.5 { at = k }
    // The bubble starts on the title's part: a heading just under the bar already names the page there.
    settleCurrent()
    if let current, let k = stops.firstIndex(where: { $0.part == current }) { at = k }
    if let held, let k = stops.firstIndex(where: { $0.part == held }) { at = k }
    let above = at > 0 ? max(18, (y - top) / CGFloat(at)) : 0
    let below = stops.count - 1 - at > 0 ? max(18, (bottom - y) / CGFloat(stops.count - 1 - at)) : 0
    ys = stops.indices.map { $0 <= at ? y - CGFloat(at - $0) * above : y + CGFloat($0 - at) * below }
    marks = []
    for (k, v) in ys.enumerated() where v >= 0 && v <= lane.height { marks.append((y: v, photos: stops[k].part?.photos == true)) }
    tabY = clamp(y + gap)
    say()
  }

  /// Eight points past the middle before a stop counts, so a resting thumb doesn't shake the page.
  private func move(_ y: CGFloat) {
    var k = at
    while k > 0, y < (ys[k - 1] + ys[k]) / 2 - 8 { k -= 1 }
    while k < stops.count - 1, y > (ys[k] + ys[k + 1]) / 2 + 8 { k += 1 }
    if k != at {
      at = k
      held = stops[k].part
      scroll?.contentOffset.y = stops[k].start
      selection?.selectionChanged()
      settleCurrent()
      say()
    }
    tabY = clamp(y + gap)
  }

  private func say() {
    let name: (Int) -> String? = { k in
      self.stops.indices.contains(k) ? self.stops[k].part?.label ?? "Đầu trang" : nil
    }
    bubble = Bubble(before: name(at - 1), at: name(at) ?? "", after: name(at + 1))
  }

  private func release() {
    grabbed = false
    marks = []
    bubble = nil
    lastY = scroll?.contentOffset.y ?? 0
    withAnimation(.easeOut(duration: 0.2)) { tabY = yNow }
    keepShown()
  }

  private func showHeldStill() {
    scroll?.contentOffset.y = min(maxY, 0.35 * (maxY - minY) + minY)
    keepShown()
    grab(tabY)
  }
}

/// The hold on the tab: 0.1 s within 10 points. A finger that moves further within that time is a scroll that started on
/// the tab, and the page takes it. Off the tab it fails at once, so the page's scroll (which waits for it) isn't held
/// back anywhere else.
private final class RailHold: UILongPressGestureRecognizer {
  var inside: (UITouch) -> Bool = { _ in false }
  var pressed: (Bool) -> Void = { _ in }
  var changed: (RailHold) -> Void = { _ in }

  static func make() -> RailHold {
    let h = RailHold(target: nil, action: nil)
    h.minimumPressDuration = 0.1
    h.allowableMovement = 10
    h.addTarget(h, action: #selector(fire))
    return h
  }

  @objc private func fire() { changed(self) }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    guard let touch = touches.first, inside(touch) else {
      state = .failed
      return
    }
    super.touchesBegan(touches, with: event)
    pressed(true)
  }

  override func reset() {
    super.reset()
    pressed(false)
  }
}

/// In the page's content: finds the scroll view it's in, for the navigator, and gives it the page's parts.
struct PageNavigatorHook: View {
  let navigator: PageNavigator
  var pieces: [NativePage.Piece] = []
  /// A page's own parts, in place of those its pieces give (`load(parts:)`).
  var parts: [PageNavigator.Part]?

  var body: some View {
    Probe(navigator: navigator)
      .frame(width: 0, height: 0)
      .onAppear { if let parts { navigator.load(parts: parts) } else { navigator.load(pieces) } }
  }

  private struct Probe: UIViewRepresentable {
    let navigator: PageNavigator
    func makeUIView(context: Context) -> ProbeView { ProbeView(navigator) }
    func updateUIView(_ view: ProbeView, context: Context) {}
    static func dismantleUIView(_ view: ProbeView, coordinator: ()) { view.navigator.detach() }
  }

  private final class ProbeView: UIView {
    let navigator: PageNavigator

    init(_ navigator: PageNavigator) {
      self.navigator = navigator
      super.init(frame: .zero)
      isUserInteractionEnabled = false
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("not from a nib") }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      guard window != nil else { return }
      var v = superview
      while let c = v {
        if let s = c as? UIScrollView {
          navigator.attach(s)
          return
        }
        v = c.superview
      }
    }
  }
}

/// A part's place in the page's content. In the content, so it doesn't change as the page scrolls.
struct PagePlace: View {
  let navigator: PageNavigator
  let id: String

  var body: some View {
    Color.clear
      .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(PageNavigator.space)) } action: { navigator.placed(id, $0) }
  }
}

/// The bar's title: "Mục lục" at the page's top; once the name has scrolled away, the name over the part being read.
/// Tapped, the page's parts.
struct PageNavigatorTitle: View {
  let name: String
  let nameInView: Bool
  let navigator: PageNavigator
  @State private var open = false
  @Environment(\.dynamicTypeSize) private var type

  var body: some View {
    let word = navigator.current?.name ?? "Mục lục"
    Button { open = true } label: {
      VStack(alignment: .leading, spacing: 0) {
        if !nameInView, !type.isAccessibilitySize {
          Text(verbatim: name).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
        }
        HStack(spacing: 4) {
          Text(verbatim: word)
            .font(.system(size: type.isAccessibilitySize ? 22 : 15, weight: .semibold))
            .foregroundStyle(.primary)
            .lineLimit(1)
            .minimumScaleFactor(0.9)
          Image(systemName: "chevron.down").font(.system(size: 10, weight: .semibold)).foregroundStyle(.tint)
        }
      }
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityLabel(Text(verbatim: "\(nameInView ? "" : name + ", ")\(word). Mục lục"))
    .accessibilityIdentifier("page-navigator-title")
    .popover(isPresented: $open) {
      PartList(navigator: navigator) { open = false }
    }
  }
}

/// The page's parts: its photos first, with how many; the one being read marked.
private struct PartList: View {
  let navigator: PageNavigator
  let done: () -> Void
  @State private var height: CGFloat = 0
  @Environment(\.dynamicTypeSize) private var type

  var body: some View {
    let photos = navigator.parts.filter(\.photos), rest = navigator.parts.filter { !$0.photos }
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(photos) { row($0) }
          if !photos.isEmpty { Divider().padding(.leading, 14) }
          ForEach(rest) { row($0) }
        }
        .padding(.vertical, 6)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
      }
      .onAppear { if let id = navigator.current?.id { proxy.scrollTo(id, anchor: .center) } }
    }
    .frame(width: type.isAccessibilitySize ? 372 : 320, height: min(height, 560))
    .presentationCompactAdaptation(.popover)
  }

  private func row(_ part: PageNavigator.Part) -> some View {
    let on = part == navigator.current
    return Button {
      done()
      navigator.ask(part)
    } label: {
      HStack(spacing: 10) {
        Circle().fill(on ? AnyShapeStyle(.tint) : AnyShapeStyle(Color.clear)).frame(width: 6, height: 6)
        Text(verbatim: part.name).fontWeight(on ? .semibold : .regular).foregroundStyle(on ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary))
          .multilineTextAlignment(.leading)
        Spacer(minLength: 8)
        if let count = part.count { Text(verbatim: "\(count)").foregroundStyle(.secondary) }
      }
      .font(.callout)
      .padding(.vertical, 10)
      .padding(.leading, 14)
      .padding(.trailing, 16)
      .frame(minHeight: 42)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .id(part.id)
    .accessibilityAddTraits(on ? .isSelected : [])
    .accessibilityIdentifier("page-navigator-part")
  }
}

/// The rail over the page: drawn here, its touches read on the scroll view (`RailHold`), so that a swipe starting on the
/// tab still scrolls. Hidden from VoiceOver, whose route is the title's list and the headings.
struct PageRail: View {
  let navigator: PageNavigator
  @State private var bubbleHeight: CGFloat = 60
  @Environment(\.dynamicTypeSize) private var type
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    GeometryReader { geo in
      let big = navigator.pressed || navigator.grabbed
      let wide: CGFloat = type.isAccessibilitySize ? (big ? 38 : 32) : (big ? 32 : 26)
      let tall: CGFloat = type.isAccessibilitySize ? (big ? 84 : 72) : (big ? 76 : 60)
      ZStack(alignment: .topLeading) {
        ForEach(navigator.marks.indices, id: \.self) { k in
          let mark = navigator.marks[k]
          Group {
            if mark.photos {
              Image(systemName: "photo.on.rectangle").font(.system(size: 12, weight: .medium)).foregroundStyle(.secondary)
            } else {
              Capsule().fill(.secondary).frame(width: 12, height: 3)
            }
          }
          .position(x: geo.size.width - 10, y: mark.y)
        }
        tab(wide: wide, tall: tall)
          .position(x: geo.size.width - 2 - wide / 2, y: navigator.tabY)
        if let bubble = navigator.bubble {
          bubbleView(bubble)
            .frame(maxWidth: geo.size.width - 72, alignment: .trailing)
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { bubbleHeight = $0 }
            .position(x: geo.size.width - 56 - (geo.size.width - 72) / 2, y: bubbleY(in: geo.size.height))
        }
        if navigator.fast, let word = navigator.current?.label {
          Text(verbatim: word)
            .font(.subheadline.weight(.semibold))
            .lineLimit(2)
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(.regularMaterial, in: .capsule)
            .frame(width: geo.size.width - 36, alignment: .trailing)
            .position(x: (geo.size.width - 36) / 2, y: navigator.tabY)
        }
      }
      .onChange(of: geo.frame(in: .global), initial: true) { _, frame in navigator.lane = frame }
    }
    .padding(.bottom, 12)
    .opacity(navigator.shown && navigator.long ? 1 : 0)
    .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: navigator.shown)
    .allowsHitTesting(false)
  }

  private func tab(wide: CGFloat, tall: CGFloat) -> some View {
    Capsule()
      .fill(Color.accentColor)
      .overlay(Capsule().stroke(scheme == .dark ? Color.black.opacity(0.85) : Color.white.opacity(0.9), lineWidth: 1.5))
      .overlay {
        Image(systemName: "chevron.up.chevron.down")
          .font(.system(size: 13, weight: .bold))
          .foregroundStyle(scheme == .dark ? Color(red: 0, green: 0x24 / 255, blue: 0x1B / 255) : .white)
      }
      .frame(width: wide, height: tall)
      .shadow(color: .black.opacity(0.34), radius: 6, y: 3)
      .animation(reduceMotion ? nil : .spring(duration: 0.18), value: wide)
      .accessibilityElement()
      .accessibilityLabel(Text(verbatim: "Thanh kéo"))
      .accessibilityValue(Text(verbatim: "\(navigator.catches)"))
      .accessibilityIdentifier("page-rail")
      .accessibilityHidden(voiceOver)
  }

  private func bubbleView(_ b: PageNavigator.Bubble) -> some View {
    VStack(alignment: .trailing, spacing: 0) {
      if let before = b.before { Text(verbatim: before).font(.footnote).foregroundStyle(.secondary) }
      Text(verbatim: b.at).font(.headline).foregroundStyle(.tint)
      if let after = b.after { Text(verbatim: after).font(.footnote).foregroundStyle(.secondary) }
    }
    .multilineTextAlignment(.trailing)
    .padding(.horizontal, 16)
    .padding(.top, 8)
    .padding(.bottom, 9)
    .background(.regularMaterial, in: .rect(cornerRadius: 20))
    .shadow(color: .black.opacity(0.18), radius: 14, y: 6)
    // As the tab: VoiceOver has the title's list instead; the flows read which part it names.
    .accessibilityElement()
    .accessibilityLabel(Text(verbatim: b.at))
    .accessibilityIdentifier("page-rail-bubble")
    .accessibilityHidden(voiceOver)
  }

  /// Above the finger, where it can be read; below it when there's no room.
  private func bubbleY(in height: CGFloat) -> CGFloat {
    let above = navigator.tabY - bubbleHeight - 30
    let top = max(-8, min(height - bubbleHeight, above >= -8 ? above : navigator.tabY + 30))
    return top + bubbleHeight / 2
  }
}

/// The trial's choice, in the page's ⋯ menu.
struct PageNavigatorChoice: View {
  @Binding var trial: String

  var body: some View {
    Picker(selection: $trial) {
      ForEach(PageNavigator.Trial.allCases) { Text(verbatim: $0.name).tag($0.rawValue) }
    } label: {
      Text(verbatim: "Thử: lối đi trong trang")
    }
    .pickerStyle(.inline)
  }
}
