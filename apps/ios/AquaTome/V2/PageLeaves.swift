import SwiftUI
import UIKit

/// When a page starts to leave its stack (iOS's back button or its swipe from the left edge) and when it's in front again
/// (a swipe let go of). No gesture of its own. And iOS 26's swipe from the middle of a page off on its stack: the App
/// Store's pages go back by the left edge and a button only (the owner, 12 Nov).
struct PageLeaves: UIViewControllerRepresentable {
  var moved: (_ leaving: Bool) -> Void

  func makeUIViewController(context: Context) -> Holder { Holder() }
  func updateUIViewController(_ holder: Holder, context: Context) { holder.moved = moved }

  final class Holder: UIViewController {
    var moved: (Bool) -> Void = { _ in }

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      moved(false)
      if #available(iOS 26, *) { navigationController?.interactiveContentPopGestureRecognizer?.isEnabled = false }
    }

    override func viewWillDisappear(_ animated: Bool) {
      super.viewWillDisappear(animated)
      moved(true)
    }
  }
}
