import SwiftUI
import UIKit

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

/// Behind a row that scrolls sideways on a pushed page: the row's own scroll waits for iOS's swipe back from the left
/// edge to fail first. That swipe starts only at the screen's very edge, so the row scrolls as before from anywhere
/// else, and a swipe from the edge over it goes back: without it, a finger that moves at once from the edge over the
/// photos or the chips scrolled the row, 0 of 6 back (27.2, 12 Nov). Nothing set on iOS's swipe; no gesture of its own.
struct YieldsToEdgeSwipe: UIViewRepresentable {
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
      // Once the row's scroll view and the page's controller are in place.
      DispatchQueue.main.async { [weak self] in self?.yield() }
    }

    private func yield() {
      var up = superview
      while let view = up, !(view is UIScrollView) { up = view.superview }
      var next: UIResponder? = self
      while let r = next, (r as? UIViewController)?.navigationController == nil { next = r.next }
      guard let scroll = up as? UIScrollView, let edge = (next as? UIViewController)?.navigationController?.interactivePopGestureRecognizer
      else { return }
      scroll.panGestureRecognizer.require(toFail: edge)
    }
  }
}

extension View {
  /// On the content of a row that scrolls sideways on a page (`YieldsToEdgeSwipe`).
  func v2YieldsToEdgeSwipe() -> some View { background { YieldsToEdgeSwipe() } }
}
