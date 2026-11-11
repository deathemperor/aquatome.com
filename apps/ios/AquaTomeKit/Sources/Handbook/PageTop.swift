import Foundation

/// The top of a fish page over its photo (the owner, 11 Nov: "1A 2B"): a shade only behind the status bar, and the bar's
/// round buttons and Mục lục each on a dark ground of its own.
public enum PageTop {
  /// The shade's whole height from the screen's very top, in points: behind the clock, not half the photo.
  public static let shadeHeight: Double = 64
  /// Its black, held from the top to `shadeHeld` of its height, then fading to nothing. With none, the clock read 1.9:1 on
  /// a green photo; with it, 3.4:1 on a fish shot on white.
  public static let shadeOpacity = 0.45
  public static let shadeHeld = 0.6
  /// The circle behind back and ⋯ over the photo, in its 44-point tap area.
  public static let disc: Double = 36
  /// Mục lục's capsule over the photo: its least height, the room each side of its words, and what it adds to their height
  /// at the accessibility sizes.
  public static let capsule: Double = 36
  public static let capsuleSide: Double = 12
  public static let capsuleAround: Double = 10
  /// The circles' and the capsule's black: 45% the floor (25% read 2.2:1 on a white photo), 70% under Reduce Transparency.
  public static func ground(reduceTransparency: Bool) -> Double { reduceTransparency ? 0.7 : 0.45 }
}
