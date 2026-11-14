import Handbook
import SwiftUI
import UIKit

/// A way round a long page, on v2's fish and plant page, the owner's alone for now: the bar's title names the part being
/// read, and tapped drops the list of the page's photos (their grid) and its parts (each one there, open). Its words
/// aren't in the strings file while it's the owner's alone. Everyone else's page has none of this: no heading measured.
@MainActor @Observable
final class PageNavigator {
  /// A part of the page: a heading's, or its photos', with how many and the first few.
  struct Part: Identifiable, Equatable {
    let id: String
    let name: String
    var count: Int?
    var photos = false
    /// The photos' first thumbnails, for their row in the list.
    var thumbs: [String] = []
    /// After the page's care: its breeds, guides, videos, readers' photos and sources, under their own line in the list.
    var tail = false
    /// A second place on the page that's this part too, which the title names it in.
    var also: String?
  }

  /// A part chosen from the title's list, for the page to go to.
  struct Asked: Equatable {
    let id: String
    let time: TimeInterval
  }

  /// The coordinate space of the page's content: a heading's place in it doesn't change as the page scrolls.
  nonisolated static let space = "page-content"

  private(set) var parts: [Part] = []
  /// The part being read; none above the first.
  private(set) var current: Part?
  /// At least 4 parts and 3 screens: what's shorter keeps its bar as it is.
  private(set) var long = false
  private(set) var asked: Asked?
  /// The list dropped from under the bar.
  var listOpen = false
  /// The bar's foot on the screen: a part is being read once its heading has gone under it.
  @ObservationIgnored var barFoot: CGFloat = 0 { didSet { settleCurrent() } }

  @ObservationIgnored private weak var scroll: UIScrollView?
  @ObservationIgnored private var watch: [NSKeyValueObservation] = []
  @ObservationIgnored private var places: [String: CGFloat] = [:]
  @ObservationIgnored private var live: [Part] = []
  /// A part chosen stays named until the reader scrolls: a heading near the end can't reach the top.
  @ObservationIgnored private var held: Part?

  func load(parts: [Part]) {
    self.parts = parts
    refresh()
  }

  /// A part that draws nothing has no place, and isn't one.
  func placed(_ id: String, _ frame: CGRect) {
    places[id] = frame.height > 0 ? frame.minY : nil
    refresh()
  }

  /// A part chosen from the list: the page goes to it. Its photos open their grid, and the page stays where it is.
  func ask(_ part: Part) {
    listOpen = false
    if !part.photos {
      held = part
      current = part
    }
    asked = Asked(id: part.id, time: CACurrentMediaTime())
  }

  func attach(_ s: UIScrollView) {
    guard scroll !== s else { return }
    detach()
    scroll = s
    watch = [
      s.observe(\.contentOffset) { [weak self] _, _ in MainActor.assumeIsolated { self?.scrolled() } },
      s.observe(\.contentSize) { [weak self] _, _ in MainActor.assumeIsolated { self?.refresh() } },
    ]
    refresh()
  }

  func detach() {
    watch = []
    scroll = nil
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
    settleCurrent()
  }

  private func scrolled() {
    guard let s = scroll else { return }
    if s.isDragging || s.isDecelerating { held = nil }
    settleCurrent()
  }

  private func settleCurrent() {
    guard let s = scroll else { return }
    var c = held
    if c == nil {
      let line = s.contentOffset.y + max(s.adjustedContentInset.top, barFoot) + 24
      var nearest = -CGFloat.infinity
      for p in live {
        for y in [places[p.id], p.also.flatMap { places[$0] }].compactMap({ $0 }) where y <= line && y >= nearest { (nearest, c) = (y, p) }
      }
      if s.contentOffset.y > minY, maxY - s.contentOffset.y < 2, let last = live.last { c = last }
    }
    if c != current { current = c }
  }
}

/// In the page's content: finds the scroll view it's in, for the navigator, and gives it the page's parts.
struct PageNavigatorHook: View {
  let navigator: PageNavigator
  let parts: [PageNavigator.Part]

  var body: some View {
    Probe(navigator: navigator)
      .frame(width: 0, height: 0)
      .onAppear { navigator.load(parts: parts) }
      // Counts that come later (its readers' photos), and parts the index lists once it's in.
      .onChange(of: parts) { navigator.load(parts: $1) }
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

/// The bar's title on a long page, plain beside the back button. At the top, "Mục lục"; once the name has gone, the part
/// being read, on one line (the owner, 11 Nov: the name leaves the bar). Over the photo, white on a dark capsule of its own;
/// on the photo's colour, white. Tapped, the list (PageNavigatorList).
struct PageNavigatorTitle: View {
  let nameInView: Bool
  /// Over the page's photo and its colour.
  let onColour: Bool
  /// Over the photo itself, before the band comes: on its capsule.
  var onPhoto = false
  let navigator: PageNavigator
  /// A guide's: once scrolled, its name small over the part being read, each on one line (the guide navigator's spec, 11
  /// Nov); a fish page's has the part alone.
  var name: String?
  @Environment(\.dynamicTypeSize) private var type
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceTransparency) private var opaque

  var body: some View {
    let part = navigator.current?.name, big = type.isAccessibilitySize
    Button { navigator.listOpen = true } label: {
      HStack(spacing: 4) {
        VStack(alignment: .leading, spacing: 0) {
          if let name, !nameInView, part != nil, !big {
            Text(verbatim: name).font(.system(size: 12)).foregroundStyle(onColour ? Color.white.opacity(0.8) : Color.secondary).lineLimit(1)
          }
          Text(verbatim: nameInView ? "Mục lục" : part ?? "Mục lục")
            .font(.system(size: big ? 22 : 15, weight: .semibold))
            .foregroundStyle(onColour ? Color.white : Color.primary)
            .lineLimit(1)
        }
        // The asset by name: `.accentColor` drew black in the light bar. Past the colour, the tint.
        Image(systemName: "chevron.down").font(.system(size: big ? 14 : 10, weight: .semibold))
          .foregroundStyle(onColour ? Color.white : Color("AccentColor"))
          .environment(\.colorScheme, onColour ? .dark : scheme)
      }
      // On the colour, a soft shadow; on the photo, the capsule, its words' height and 10 points, never under 36.
      .shadow(color: .black.opacity(onColour && !onPhoto ? 0.45 : 0), radius: 3)
      .padding(.horizontal, onPhoto ? PageTop.capsuleSide : 0)
      .padding(.vertical, onPhoto ? PageTop.capsuleAround / 2 : 0)
      .frame(minHeight: onPhoto ? PageTop.capsule : 0)
      .background { if onPhoto { Capsule().fill(.black.opacity(PageTop.ground(reduceTransparency: opaque))) } }
      .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text(verbatim: part.map { "Mục lục, đang ở \($0)" } ?? "Mục lục"))
    .accessibilityIdentifier("page-navigator-title")
  }
}

/// The list of the page's parts, dropped from under the bar over the page dimmed: its photos first, a few of them and how
/// many (their grid); its care, each part there and open; then the rest, with how many each has. The part being read is
/// marked. A tap outside closes it.
struct PageNavigatorList: View {
  let navigator: PageNavigator
  /// Where it hangs from on the screen: the bar's foot. It reaches no further down than the page's foot, over the tab bar.
  let top: CGFloat
  @State private var height: CGFloat = 0
  @State private var room: CGFloat = 600
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    ZStack(alignment: .topLeading) {
      if navigator.listOpen {
        Color.black.opacity(0.4)
          .ignoresSafeArea()
          .onTapGesture { navigator.listOpen = false }
          .accessibilityHidden(true)
          .transition(.opacity)
        panel
          .padding(.leading, 12)
          .padding(.trailing, 40)
          .padding(.top, top)
          .transition(reduceMotion ? .opacity : .opacity.combined(with: .offset(y: -12)))
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    // Measured from the screen's top, as `top` is.
    .ignoresSafeArea(edges: .top)
    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { room = $0 }
    .animation(.easeOut(duration: 0.2), value: navigator.listOpen)
  }

  private var panel: some View {
    let photos = navigator.parts.filter(\.photos), care = navigator.parts.filter { !$0.photos && !$0.tail },
        tail = navigator.parts.filter { !$0.photos && $0.tail }
    return ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          ForEach(photos) { row($0) }
          if !photos.isEmpty, !care.isEmpty { line }
          ForEach(care) { row($0) }
          if !tail.isEmpty, !photos.isEmpty || !care.isEmpty { line }
          ForEach(tail) { row($0) }
        }
        .padding(.vertical, 8)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
      }
      .onAppear { if let id = navigator.current?.id { proxy.scrollTo(id, anchor: .center) } }
    }
    .frame(height: min(height, max(120, room - top - 12)))
    .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 26, style: .continuous))
    .shadow(color: .black.opacity(0.18), radius: 18, y: 6)
    .accessibilityAddTraits(.isModal)
    .accessibilityAction(.escape) { navigator.listOpen = false }
  }

  private var line: some View {
    Divider().padding(.leading, 30).padding(.trailing, 14).padding(.vertical, 4)
  }

  private func row(_ part: PageNavigator.Part) -> some View {
    let on = part == navigator.current
    return Button { navigator.ask(part) } label: {
      HStack(spacing: 10) {
        Text(verbatim: part.name)
          .fontWeight(on ? .semibold : .regular)
          .foregroundStyle(on ? AnyShapeStyle(.tint) : AnyShapeStyle(.primary))
          .multilineTextAlignment(.leading)
        Spacer(minLength: 8)
        if !part.thumbs.isEmpty {
          HStack(spacing: -10) {
            ForEach(part.thumbs.prefix(3), id: \.self) {
              V2Photo(src: $0)
                .frame(width: 26, height: 26)
                .clipShape(.rect(cornerRadius: 6, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 6, style: .continuous).strokeBorder(Color(.tertiarySystemBackground), lineWidth: 1.5) }
            }
          }
          .accessibilityHidden(true)
        }
        if let count = part.count { Text(verbatim: "\(count)").foregroundStyle(.secondary) }
      }
      .font(.body)
      .padding(.leading, 30)
      .padding(.trailing, 16)
      // Room of its own above and below, so wrapped rows don't run together at the larger sizes; one line at size L is 44.
      .padding(.vertical, 11)
      .frame(minHeight: 44)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .id(part.id)
    .accessibilityAddTraits(on ? .isSelected : [])
    .accessibilityIdentifier("page-navigator-part")
  }
}
