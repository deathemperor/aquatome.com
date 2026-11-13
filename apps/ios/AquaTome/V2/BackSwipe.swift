import SwiftUI
import UIKit

/// Behind a page that opens with iOS's zoom and hides iOS's back button (iOS 26 on). iOS's zoom takes the page back on a swipe
/// from anywhere, but starts nothing for a fast flick from the very edge, or for the fastest ones elsewhere: those are here.
/// Says when the page starts to leave, and when it's back in front (a swipe let go of).
@available(iOS 26, *)
struct PageSwipes: UIViewControllerRepresentable {
  var moved: (_ leaving: Bool) -> Void
  var flickedBack: () -> Void

  func makeUIViewController(context: Context) -> Holder { Holder() }
  func updateUIViewController(_ holder: Holder, context: Context) {
    holder.moved = moved
    holder.flickedBack = flickedBack
  }

  final class Holder: UIViewController, UIGestureRecognizerDelegate {
    var moved: (Bool) -> Void = { _ in }
    var flickedBack: () -> Void = {}
    private var edge: UIPanGestureRecognizer?
    private var fromEdge = false

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      moved(false)
      guard edge == nil, let nav = navigationController?.view else { return }
      let pan = UIPanGestureRecognizer(target: self, action: #selector(panned))
      pan.cancelsTouchesInView = false
      pan.delegate = self
      nav.addGestureRecognizer(pan)
      edge = pan
    }

    // Off as the page leaves, iOS's own swipe taking it included; a swipe let go of comes back through `viewDidAppear`.
    override func viewWillDisappear(_ animated: Bool) {
      super.viewWillDisappear(animated)
      moved(true)
      if let edge { edge.view?.removeGestureRecognizer(edge) }
      edge = nil
    }

    @objc private func panned(_ pan: UIPanGestureRecognizer) {
      guard pan.state == .ended else { return }
      let across = pan.translation(in: pan.view), speed = pan.velocity(in: pan.view).x
      // From the edge, as the swipe before iOS 26 went; elsewhere, only a flick: iOS's zoom has every slower swipe.
      if across.x > 60, across.x > abs(across.y) * 2, speed >= (fromEdge ? 0 : 600) { flickedBack() }
    }

    // From the very edge, whatever is under it; elsewhere, not from what scrolls sideways (the photos, the chips), as in the App Store.
    func gestureRecognizer(_ gesture: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
      fromEdge = touch.location(in: gesture.view).x < 16
      if fromEdge { return true }
      var under = touch.view
      while let v = under {
        if let s = v as? UIScrollView, s.isScrollEnabled, s.contentSize.width > s.bounds.width + 1 { return false }
        under = v.superview
      }
      return true
    }

    func gestureRecognizer(_: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith _: UIGestureRecognizer) -> Bool { true }
  }
}
