import Handbook
import SwiftUI
import UIKit

/// Every photo of a gallery, full screen on black, one at a time, each with its words, who took it, its licence and its
/// own page. Swiped between, or picked in the strip under it; pinched or double-tapped to zoom (no swiping while zoomed);
/// tapped to hide the bars and words; pulled down to close. A photo shows its thumbnail at once (the row it was tapped in
/// has it in memory) until the full photo comes, and the two either side are fetched while it's looked at.
struct GalleryViewer: View {
  let title: String
  let note: String
  let photos: [PageDoc.Image]
  let readers: [ReaderItem]?
  @State private var index: Int
  /// The pager's place: nil only between two photos.
  @State private var position: Int?
  @State private var pictures: ViewerPictures
  @State private var chrome = true
  @State private var zoomed = false
  /// How far it's pulled down to close, from 0 to 1.
  @State private var pull: CGFloat = 0
  @State private var reporting: ReaderItem?
  @State private var blocking: ReaderItem?
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dismiss) private var dismiss
  @Environment(\.displayScale) private var scale
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver

  init(title: String, note: String, photos: [PageDoc.Image], readers: [ReaderItem]?, index: Int) {
    self.title = title
    self.note = note
    self.photos = photos
    self.readers = readers
    _index = State(initialValue: index)
    _position = State(initialValue: index)
    _pictures = State(initialValue: ViewerPictures(photos, at: index))
  }

  /// The bars and words: hidden by a tap, never with VoiceOver on (they're what it reads).
  private var showsChrome: Bool { (chrome || voiceOver) && pull == 0 }

  var body: some View {
    NavigationStack {
      pager
        .background(Color.black.opacity(1 - pull).ignoresSafeArea())
        .overlay(alignment: .top) {
          // The bar's title and buttons readable on a light photo.
          if showsChrome {
            LinearGradient(colors: [.black.opacity(0.55), .clear], startPoint: .top, endPoint: .bottom)
              .frame(height: 120).ignoresSafeArea().allowsHitTesting(false).transition(.opacity)
          }
        }
        // Not for a photo the row no longer has (one just reported, as the viewer closes).
        .overlay(alignment: .bottom) { if showsChrome, photos.indices.contains(index) { words.transition(.opacity) } }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .primaryAction) { Button("Đóng") { close() } }
          // A reader's photo: report it, or block who sent it; then the viewer closes, and the row shows it no more.
          if let readers, readers.indices.contains(index), !handbook.safety.isOwn(readers[index]) {
            ToolbarItem(placement: .topBarLeading) { ReaderMenu(item: readers[index], reporting: $reporting, blocking: $blocking) }
          }
        }
        .toolbarBackground(.hidden, for: .navigationBar)
        .toolbarColorScheme(.dark, for: .navigationBar)
        .toolbar(showsChrome ? .visible : .hidden, for: .navigationBar)
        .statusBarHidden(!showsChrome)
        .persistentSystemOverlays(showsChrome ? .automatic : .hidden)
        .readerActions(reporting: $reporting, blocking: $blocking, inViewer: true) { close() }
        #if DEBUG
        .background { testsRead }
        #endif
        // The viewer's own: not given to each part in it, which keep theirs.
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("gallery")
        // VoiceOver's scrub (two fingers, a Z) closes it, as its "Đóng" does.
        .accessibilityAction(.escape) { close() }
    }
    // Black in light mode too: a photo looks right on it, and the bars and words are drawn for it.
    .environment(\.colorScheme, .dark)
    // The page shows through as the photo is pulled down.
    .presentationBackground(.clear)
    .onGeometryChange(for: CGFloat.self) { max($0.size.width, $0.size.height) } action: {
      pictures.side = $0 * scale
      pictures.focus(index)
    }
    // A photo reported, the viewer closed some other way than its thanks, or before the report's answer came: hidden
    // all the same.
    .onAppear { handbook.safety.viewing = true }
    .onDisappear {
      handbook.safety.viewing = false
      handbook.safety.hidePending()
      pictures.stop()
    }
  }

  private var pager: some View {
    ScrollView(.horizontal) {
      LazyHStack(spacing: 0) {
        ForEach(photos.indices, id: \.self) { i in
          page(i).containerRelativeFrame([.horizontal, .vertical])
        }
      }
      .scrollTargetLayout()
    }
    .scrollTargetBehavior(.paging)
    .scrollPosition(id: $position)
    .scrollDisabled(zoomed)
    .scrollIndicators(.hidden)
    .ignoresSafeArea()
    .onChange(of: position) { _, p in
      guard let p, p != index else { return }
      index = p
      zoomed = false
      pictures.focus(p)
    }
  }

  private func page(_ i: Int) -> some View {
    let shown = pictures.shown[i], p = photos[i]
    return ZoomablePhoto(image: shown?.full ?? shown?.thumb, aspect: CGSize(width: p.w, height: p.h), current: i == index, motion: !reduceMotion,
                         tapped: { withAnimation(.easeInOut(duration: 0.2)) { chrome.toggle() } },
                         zoomed: { if i == index { zoomed = $0 } },
                         pulled: { pull = $0 },
                         released: { withAnimation(.easeOut(duration: 0.2)) { pull = 1 } completion: { close(animated: false) } })
      // One element: its place in the gallery (its words, who took it and the counter follow, under it).
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(Text("Ảnh \(i + 1) trên \(photos.count)"))
      .accessibilityAddTraits(.isImage)
      .accessibilityIdentifier("viewer-photo")
      .overlay { if pull == 0 { state(i, shown) } }
  }

  /// While only its thumbnail is here, a small spinner; one that didn't come, a retry (and, with no thumbnail either, a
  /// photo's place, as on the page).
  @ViewBuilder private func state(_ i: Int, _ s: ViewerPictures.Shown?) -> some View {
    if let s, s.full == nil {
      if s.failed {
        VStack(spacing: 12) {
          if s.thumb == nil { Image(systemName: "photo").font(.largeTitle).foregroundStyle(.secondary).accessibilityHidden(true) }
          Button("Thử lại", systemImage: "arrow.clockwise") { pictures.retry(i) }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .controlSize(.small)
            .accessibilityIdentifier("photo-retry")
        }
      } else {
        ProgressView()
          .controlSize(.small)
          .tint(.white)
          .padding(9)
          .background(.black.opacity(0.4), in: .circle)
          .accessibilityLabel(Text("Đang tải ảnh"))
          .accessibilityIdentifier("photo-loading")
      }
    }
  }

  /// Its words over the bottom of the photo, on a dark fade that keeps them readable on any photo: the caption, who took
  /// it (smaller and quieter, its link to the photo's own page), where it is in the gallery with the gallery's note, and
  /// the strip of the gallery's photos.
  private var words: some View {
    let p = photos[index]
    return VStack(alignment: .leading, spacing: 6) {
      // Its words read once, here, not as the picture's label too.
      if let alt = p.alt, !alt.isEmpty { Text(alt).font(.subheadline).foregroundStyle(.white) }
      if let c = credit(p) { Text(c).foregroundStyle(.white.opacity(0.7)).tint(.white.opacity(0.7)) }
      Text(counter).foregroundStyle(.white.opacity(0.6))
      if photos.count > 1 { strip.padding(.top, 6) }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal)
    .padding(.top, 48)
    .padding(.bottom, 4)
    // A swipe on the fade, not on the words, still pages.
    .background(LinearGradient(colors: [.clear, .black.opacity(0.5), .black.opacity(0.8)], startPoint: .top, endPoint: .bottom)
      .ignoresSafeArea().allowsHitTesting(false))
  }

  /// "12/28 · its note": the number brighter than the note.
  private var counter: AttributedString {
    var at = AttributedString("\(index + 1)/\(photos.count)")
    at.font = .caption.weight(.semibold).monospacedDigit()
    at.foregroundColor = .white.opacity(0.85)
    var rest = AttributedString(note.isEmpty ? "" : " · \(note)")
    rest.font = .caption
    return at + rest
  }

  /// The gallery's thumbnails in a row, the one shown marked: tapped, that photo (no swiping past the ones between).
  private var strip: some View {
    ScrollViewReader { proxy in
      ScrollView(.horizontal) {
        LazyHStack(spacing: 4) {
          ForEach(photos.indices, id: \.self) { k in
            Button { position = k } label: {
              Group {
                if let t = photos[k].thumb { PageImage(src: t, ratio: 1, corner: 6) } else { RoundedRectangle(cornerRadius: 6).fill(.fill.tertiary) }
              }
              .frame(width: 40, height: 40)
              .overlay { if k == index { RoundedRectangle(cornerRadius: 6).strokeBorder(.white, lineWidth: 2) } }
              .opacity(k == index ? 1 : 0.55)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Ảnh \(k + 1) trên \(photos.count)"))
            .accessibilityAddTraits(k == index ? .isSelected : [])
            .accessibilityIdentifier("viewer-thumb")
            .id(k)
          }
        }
      }
      .scrollIndicators(.hidden)
      .frame(height: 40)
      .onAppear { proxy.scrollTo(index, anchor: .center) }
      .onChange(of: index) { withAnimation(reduceMotion ? nil : .default) { proxy.scrollTo(index, anchor: .center) } }
    }
  }

  /// Closed by its button, after a report or block, or pulled down: without the slide with Reduce Motion, or once the
  /// pull has taken the photo away.
  private func close(animated: Bool = true) {
    var t = Transaction()
    t.disablesAnimations = !animated || reduceMotion
    withTransaction(t) { dismiss() }
  }

  #if DEBUG
  /// For the UI tests (debug builds only), as the lights screen shows its frames: the photos whose full picture was
  /// fetched and those whose fetch was stopped (their places, from 1), what the one shown shows, at how many pixels on
  /// its longest side, and how many times its full photo was fetched.
  @ViewBuilder private var testsRead: some View {
    let log = PictureLog.shared
    Text(verbatim: places(log.full)).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("picture-requests")
    Text(verbatim: places(log.stopped)).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("picture-stopped")
    let s = pictures.shown[index], image = s?.full ?? s?.thumb
    Text(verbatim: s?.full != nil ? "full" : s?.thumb != nil ? "thumb" : s?.failed == true ? "failed" : "none")
      .font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("picture-shown")
    Text(verbatim: "\(Int(image.map { max($0.size.width, $0.size.height) * $0.scale } ?? 0))")
      .font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("picture-pixels")
    Text(verbatim: "\(photos.indices.contains(index) ? log.full.filter { $0 == photos[index].src }.count : 0)")
      .font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("picture-tries")
  }

  /// The places, from 1, of the photos whose full photo is among `srcs`.
  private func places(_ srcs: [String]) -> String {
    let set = Set(srcs)
    return photos.indices.filter { set.contains(photos[$0].src) }.map { "\($0 + 1)" }.joined(separator: " ")
  }
  #endif

  /// A gallery's row on its page, as the site writes it. Debug builds, with `-large-gallery`: 28 photos (each its own
  /// stand-in with `-fixed-pictures`), the first ten in the row, for the viewer's flows and for measuring it.
  static func row(title: String, note: String, photos: [PageDoc.Image], strip: [Int]) -> NativePage.Piece {
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("-large-gallery") {
      let many = (1...28).map { k in
        PageDoc.Image(src: "https://media.aquatome.com/g/many-\(k).webp", w: 1200, h: 800, alt: "Ảnh thử \(k)",
                      thumb: "https://media.aquatome.com/g/many-\(k)-480.webp", credit: PageDoc.Image.Credit(text: "Ảnh: Tác giả \(k)", licence: "CC BY 4.0", url: "https://example.org/photo/\(k)"))
      }
      return .gallery(title: title, note: note, photos: many, strip: Array(0..<10))
    }
    #endif
    return .gallery(title: title, note: note, photos: photos, strip: strip)
  }
}

/// The viewer's photos near the one shown: each one's thumbnail at once (in memory from the row, else from the phone),
/// and its full photo, the one shown first, then one and two either side. Those further away are let go of: their fetches
/// stopped, their pictures left to PageImages' memory while it has room.
@MainActor @Observable final class ViewerPictures {
  struct Shown {
    var thumb: UIImage?
    var full: UIImage?
    /// The full photo didn't come (offline, or gone from the site).
    var failed = false
  }

  private(set) var shown: [Int: Shown] = [:]
  /// The screen's longest side, in pixels: the most a full photo is decoded at, zoomed or not.
  @ObservationIgnored var side: CGFloat = 0
  @ObservationIgnored private let photos: [PageDoc.Image]
  @ObservationIgnored private var loads: [Int: Task<Void, Never>] = [:]

  init(_ photos: [PageDoc.Image], at i: Int) {
    self.photos = photos
    // The first frame shows the row's thumbnail, before anything is fetched.
    if photos.indices.contains(i) { shown[i] = Shown(thumb: photos[i].thumb.flatMap(PageImages.cached)) }
  }

  /// The one shown, then one and two either side: no further.
  nonisolated static func near(_ i: Int, count: Int) -> [Int] { [i, i + 1, i - 1, i + 2, i - 2].filter { (0..<count).contains($0) } }

  /// Shows `i`: fetches what's near it and lets go of the rest.
  func focus(_ i: Int) {
    guard side > 0 else { return }
    let near = Self.near(i, count: photos.count)
    for (k, load) in loads where !near.contains(k) {
      load.cancel()
      loads[k] = nil
    }
    for k in shown.keys where !near.contains(k) { shown[k] = nil }
    for k in near {
      var s = shown[k] ?? Shown()
      if s.thumb == nil { s.thumb = photos[k].thumb.flatMap(PageImages.cached) }
      if s.full == nil { s.full = PageImages.cached(photos[k].src, .longest(side)) }
      shown[k] = s
      if s.full == nil, !s.failed, loads[k] == nil { loads[k] = Task { await load(k) } }
    }
  }

  func retry(_ k: Int) {
    shown[k]?.failed = false
    loads[k]?.cancel()
    loads[k] = Task { await load(k) }
  }

  func stop() {
    for load in loads.values { load.cancel() }
    loads = [:]
  }

  /// Its thumbnail and its full photo at once: the thumbnail is small, and on a slow line each waits for its own answer.
  private func load(_ k: Int) async {
    async let thumb: Void = loadThumb(k)
    async let full: Void = loadFull(k)
    _ = await (thumb, full)
    // Stopped, it was taken off the list already (and another may have started since).
    if !Task.isCancelled { loads[k] = nil }
  }

  /// Its thumbnail at the screen's size, though one is shown already: the strip's is decoded at 40 points, blurred
  /// scaled up. One in memory large enough (the row's) comes at once, without a fetch.
  private func loadThumb(_ k: Int) async {
    guard let src = photos[k].thumb else { return }
    let thumb = await PageImages.image(src, .longest(side), role: .thumb)
    if shown[k]?.full == nil, let thumb { shown[k]?.thumb = thumb }
  }

  private func loadFull(_ k: Int) async {
    let full = await PageImages.image(photos[k].src, .longest(side), role: .full)
    guard !Task.isCancelled else { return }
    if let full { shown[k]?.full = full } else { shown[k]?.failed = true }
  }
}

/// A photo fitted to the screen and centred: pinched or double-tapped to zoom, tapped to show or hide what's around it,
/// pulled down to close (not while zoomed). UIKit's scroll view, which zooms as Photos does; SwiftUI's own gestures here
/// would fight the pager around it.
private struct ZoomablePhoto: UIViewRepresentable {
  let image: UIImage?
  /// The photo's own shape, so its thumbnail and the full photo take the same place.
  let aspect: CGSize
  /// The one shown: the others are zoomed back out.
  let current: Bool
  /// No Reduce Motion: the full photo fades in over its thumbnail, zooms animate, and a pull moves the photo.
  let motion: Bool
  let tapped: () -> Void
  let zoomed: (Bool) -> Void
  let pulled: (CGFloat) -> Void
  let released: () -> Void

  func makeUIView(context: Context) -> ZoomView { ZoomView() }

  func updateUIView(_ view: ZoomView, context: Context) {
    view.motion = motion
    view.tapped = tapped
    view.zoomed = zoomed
    view.pulled = pulled
    view.released = released
    view.show(image, aspect: aspect)
    if !current { view.zoomOut() }
  }
}

private final class ZoomView: UIScrollView, UIScrollViewDelegate {
  var motion = true
  var tapped: () -> Void = {}
  var zoomed: (Bool) -> Void = { _ in }
  var pulled: (CGFloat) -> Void = { _ in }
  var released: () -> Void = {}
  private let photo = UIImageView()
  private var pull: UIPanGestureRecognizer!
  private var aspect = CGSize.zero
  /// The size it was last fitted to.
  private var fitted = CGSize.zero
  private var isZoomed = false
  /// Being pulled down: the photo stays where the finger has it.
  private var isPulling = false

  init() {
    super.init(frame: .zero)
    delegate = self
    minimumZoomScale = 1
    maximumZoomScale = 4
    showsHorizontalScrollIndicator = false
    showsVerticalScrollIndicator = false
    contentInsetAdjustmentBehavior = .never
    decelerationRate = .fast
    // Not zoomed, a drag is the pager's (across) or the pull's (down).
    panGestureRecognizer.isEnabled = false
    photo.contentMode = .scaleAspectFit
    addSubview(photo)
    let double = UITapGestureRecognizer(target: self, action: #selector(doubleTapped(_:)))
    double.numberOfTapsRequired = 2
    let single = UITapGestureRecognizer(target: self, action: #selector(singleTapped))
    single.require(toFail: double)
    pull = UIPanGestureRecognizer(target: self, action: #selector(pulling(_:)))
    for g in [double, single, pull!] { addGestureRecognizer(g) }
  }

  required init?(coder: NSCoder) { fatalError() }

  func show(_ image: UIImage?, aspect: CGSize) {
    if aspect != self.aspect {
      self.aspect = aspect
      fitted = .zero
      setNeedsLayout()
    }
    guard image !== photo.image else { return }
    // The full photo over its thumbnail: a short cross-fade, none with Reduce Motion.
    if photo.image != nil, image != nil, motion, window != nil {
      UIView.transition(with: photo, duration: 0.25, options: [.transitionCrossDissolve, .allowUserInteraction]) { self.photo.image = image }
    } else {
      photo.image = image
    }
  }

  func zoomOut() {
    if zoomScale != minimumZoomScale { setZoomScale(minimumZoomScale, animated: false) }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard !isPulling else { return }
    if bounds.size != fitted { fit() }
    // Centred while it's smaller than the screen, zoomed or not.
    var f = photo.frame
    f.origin.x = f.width < bounds.width ? (bounds.width - f.width) / 2 : 0
    f.origin.y = f.height < bounds.height ? (bounds.height - f.height) / 2 : 0
    photo.frame = f
  }

  /// The photo as large as the screen lets it be, whole.
  private func fit() {
    fitted = bounds.size
    guard aspect.width > 0, aspect.height > 0, bounds.width > 0, bounds.height > 0 else { return }
    zoomScale = minimumZoomScale
    let s = min(bounds.width / aspect.width, bounds.height / aspect.height)
    photo.frame = CGRect(origin: .zero, size: CGSize(width: aspect.width * s, height: aspect.height * s))
    contentSize = photo.frame.size
  }

  override func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
    if g === pull {
      // Only down, and only when the whole photo shows: zoomed, a drag moves the photo.
      guard zoomScale <= minimumZoomScale + 0.01 else { return false }
      let v = pull.velocity(in: self)
      return v.y > abs(v.x)
    }
    return super.gestureRecognizerShouldBegin(g)
  }

  func viewForZooming(in scrollView: UIScrollView) -> UIView? { photo }

  func scrollViewDidZoom(_ scrollView: UIScrollView) {
    let z = zoomScale > minimumZoomScale + 0.01
    panGestureRecognizer.isEnabled = z
    if z != isZoomed {
      isZoomed = z
      zoomed(z)
    }
  }

  @objc private func singleTapped() { tapped() }

  @objc private func doubleTapped(_ g: UITapGestureRecognizer) {
    if zoomScale > minimumZoomScale + 0.01 {
      setZoomScale(minimumZoomScale, animated: motion)
    } else {
      // Two and a half times, around where it was tapped.
      let at = g.location(in: photo), w = bounds.width / 2.5, h = bounds.height / 2.5
      zoom(to: CGRect(x: at.x - w / 2, y: at.y - h / 2, width: w, height: h), animated: motion)
    }
  }

  @objc private func pulling(_ g: UIPanGestureRecognizer) {
    let t = g.translation(in: self)
    let progress = min(max(t.y / 400, 0), 1)
    switch g.state {
    case .began, .changed:
      isPulling = true
      // The photo follows the finger and shrinks a little; with Reduce Motion it stays, and only the black fades.
      if motion { photo.transform = CGAffineTransform(translationX: t.x, y: max(t.y, 0)).scaledBy(x: 1 - progress / 4, y: 1 - progress / 4) }
      pulled(progress)
    case .ended where t.y > 120 || g.velocity(in: self).y > 800:
      if motion {
        UIView.animate(withDuration: 0.2) {
          self.photo.transform = self.photo.transform.translatedBy(x: 0, y: self.bounds.height / 2)
          self.photo.alpha = 0
        }
      }
      released()
    case .ended, .cancelled, .failed:
      UIView.animate(withDuration: motion ? 0.25 : 0) { self.photo.transform = .identity } completion: { _ in self.isPulling = false }
      pulled(0)
    default:
      break
    }
  }
}
