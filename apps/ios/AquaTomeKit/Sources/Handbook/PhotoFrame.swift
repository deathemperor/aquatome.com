import Foundation

/// How a frame shows a photo so the whole animal is in it (the chief of staff, 13 Nov): the site's rule (`frameOf`,
/// packages/schema/src/image-geometry.ts), decided at the size the frame is drawn. Centred, as before, where that cuts
/// `cut` of the fish or less; else the window moved onto the fish, where that does; else the photo whole. No box: centred.
/// Its cases are protocols/photo-crop-vectors.json, which the tests hold it to.
public enum PhotoFrame: Equatable, Sendable {
  /// Covering the frame, its window placed at `x`, `y` (0 to 1, as CSS object-position: its offset over the room it has).
  case cover(x: Double, y: Double)
  /// The photo whole, centred, the rest of the frame filled (`ground`).
  case whole

  /// How much of the fish's length a frame may cut and still show it whole: fin tips. One number, the site's
  /// `SUBJECT_CUT`, which the tests hold to the shared cases' `cut`: set to 0 there and here the same day.
  public static let cut = 0.05
  /// So the last bit of a window's edge can't turn exactly `cut` into more (`SUBJECT_SLACK`).
  static let slack = 1e-9

  /// For a photo `aspect` wide (its width over its height) with its fish at `box`, in a frame `ratio` wide.
  public static func of(aspect: Double, box: PhotoBox?, ratio: Double) -> PhotoFrame {
    guard let box, box.w > 0, box.h > 0, aspect > 0, ratio > 0 else { return .cover(x: 0.5, y: 0.5) }
    // A window of the frame's shape cuts one side of the photo only: along it, the window's share, and where the fish
    // starts and ends.
    let across = aspect > ratio
    let (span, a, b) = across ? (ratio / aspect, box.x, box.x + box.w) : (aspect / ratio, box.y, box.y + box.h)
    func lost(_ at: Double) -> Double { (max(0, at - a) + max(0, b - at - span)) / (b - a) }
    let centred = (1 - span) / 2, moved = min(max((a + b - span) / 2, 0), 1 - span)
    guard let at = [centred, moved].first(where: { lost($0) <= cut + slack }) else { return .whole }
    let place = span < 1 ? at / (1 - span) : 0.5
    return across ? .cover(x: place, y: 0.5) : .cover(x: 0.5, y: place)
  }

  /// What fills the rest of a frame around a photo shown whole: the frame's own ground (the mat), or the same photo
  /// blurred behind it.
  public enum Ground: String, Sendable { case mat, blur }

  /// A strip left over on two sides, as a share of the frame's side it lies across, under which the mat fills it.
  public static let strip = 0.08

  /// The site's rule for whole tiles (protocols/whole-frame-vectors.json): each strip under `strip` of its side takes the
  /// mat; one that wide or wider, the photo blurred (Design's frames.md, 13 Nov).
  public static func ground(aspect: Double, ratio: Double) -> Ground {
    guard aspect > 0, ratio > 0 else { return .mat }
    return (1 - min(aspect, ratio) / max(aspect, ratio)) / 2 < strip ? .mat : .blur
  }
}
