import SwiftUI
import UIKit

/// One photo, from the camera or the library, as data (nil: one that can't be read). UIKit's picker for both, not PhotosUI's
/// `PhotosPicker`: an app that links PhotosUI loads it and the Photos frameworks under it at every launch, about 4 MB
/// more memory for a picker most launches never open (the fish fling's peak, one Mac: 83.1 MB with it, 79.0 without).
/// UIKit's loads them only when it opens, and needs no permission for the library. Its library is marked "to be
/// deprecated, use PHPicker" with no version, unchanged since iOS 14, and gives no warning.
struct ImagePicker: UIViewControllerRepresentable {
  let source: UIImagePickerController.SourceType
  let picked: (Data?) -> Void
  /// Closed without one.
  let cancelled: () -> Void

  func makeUIViewController(context: Context) -> UIImagePickerController {
    let c = UIImagePickerController()
    c.sourceType = source
    c.mediaTypes = ["public.image"]
    c.delegate = context.coordinator
    return c
  }
  func updateUIViewController(_ c: UIImagePickerController, context: Context) {}
  func makeCoordinator() -> Coordinator { Coordinator(picked, cancelled) }

  final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let picked: (Data?) -> Void, cancelled: () -> Void
    init(_ picked: @escaping (Data?) -> Void, _ cancelled: @escaping () -> Void) { (self.picked, self.cancelled) = (picked, cancelled) }
    // The library's photo as its file has it (a copy, JPEG); the camera's as taken. Its orientation goes with the JPEG,
    // and is applied as it's shrunk.
    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
      if let url = info[.imageURL] as? URL, let data = try? Data(contentsOf: url) { return picked(data) }
      picked((info[.originalImage] as? UIImage)?.jpegData(compressionQuality: 0.9))
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { cancelled() }
  }
}

/// A photo picked: a new one each time, even the same photo again.
struct PickedPhoto: Equatable {
  let id = UUID()
  let data: Data?
  static func == (a: Self, b: Self) -> Bool { a.id == b.id }
}
