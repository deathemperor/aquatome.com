import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

/// When a page starts to leave its stack (iOS's back button or its swipe back) and when it's in front again (a swipe let go
/// of). No gesture of its own, and nothing set on iOS's: turning off iOS 26's swipe from the middle here broke its swipe
/// from the left edge for a finger that moves at once, below a fish page's photo, and didn't stop the middle one (12 Nov).
struct PageLeaves: UIViewControllerRepresentable {
  var moved: (_ leaving: Bool) -> Void

  func makeUIViewController(context: Context) -> Holder { Holder() }
  func updateUIViewController(_ holder: Holder, context: Context) { holder.moved = moved }

  final class Holder: UIViewController {
    var moved: (Bool) -> Void = { _ in }

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      moved(false)
    }

    override func viewWillDisappear(_ animated: Bool) {
      super.viewWillDisappear(animated)
      moved(true)
    }
  }
}

/// Behind a row that scrolls sideways on a page: a touch that begins within 20 points of the screen's left edge isn't
/// the row's, so iOS's swipe back takes it there as everywhere else on the page; from anywhere else the row scrolls as
/// before, with no wait (`EdgeTouch` decides at touch-down). Without it, the photos or the chips took a swipe from the
/// edge, 0 of 6 back (27.2, 12 Nov); a row waiting for iOS's swipes instead lost its rightward scroll to them (13 Nov).
/// Nothing set on iOS's swipes.
struct YieldsToEdgeSwipe: UIViewRepresentable {
  /// Off in this build: rows as iOS has them, taking a swipe that starts over them at the very edge. On, the swipe from
  /// the edge still didn't go back over a row, 0 of 12 (27.2, 13 Nov); the chief of staff's fallback ships, and the piece
  /// is reworked later.
  static let on = false
  func makeUIView(context: Context) -> Finder { Finder() }
  func updateUIView(_ view: Finder, context: Context) {}

  final class Finder: UIView {
    override init(frame: CGRect) {
      super.init(frame: frame)
      isUserInteractionEnabled = false
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      guard window != nil else { return }
      // Once the row's scroll view is in place.
      DispatchQueue.main.async { [weak self] in self?.yield() }
    }

    private func yield() {
      guard YieldsToEdgeSwipe.on else { return }
      var up = superview
      while let view = up, !(view is UIScrollView) { up = view.superview }
      guard let scroll = up as? UIScrollView, !(scroll.gestureRecognizers ?? []).contains(where: { $0 is EdgeTouch }) else { return }
      let edge = EdgeTouch(target: nil, action: nil)
      scroll.addGestureRecognizer(edge)
      scroll.panGestureRecognizer.require(toFail: edge)
    }
  }
}

/// On a row's scroll view: taken at touch-down when the touch begins within 20 points of the screen's left edge, so the
/// row's scroll, which waits for it to fail, doesn't start; let go at once otherwise. It prevents nothing else, iOS's
/// swipes included, and keeps no touch from the views under it.
final class EdgeTouch: UIGestureRecognizer {
  override init(target: Any?, action: Selector?) {
    super.init(target: target, action: action)
    cancelsTouchesInView = false
    delaysTouchesEnded = false
  }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    guard let touch = touches.first, let window = view?.window else { state = .failed; return }
    state = touch.location(in: window).x <= 20 ? .recognized : .failed
  }

  override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
}

extension View {
  /// On the content of a row that scrolls sideways on a page (`YieldsToEdgeSwipe`).
  func v2YieldsToEdgeSwipe() -> some View { background { YieldsToEdgeSwipe() } }
}
