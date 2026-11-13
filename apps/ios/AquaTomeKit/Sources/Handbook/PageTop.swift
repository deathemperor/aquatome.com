import Foundation

/// The top of a fish page over its photo (the owner, 11 Nov: "1A 2B"; iOS's own back button since 12 Nov): a shade behind
/// the status bar and the bar, and the ⋯ and Mục lục each on a dark ground of its own.
public enum PageTop {
  /// The shade's whole height from the screen's very top, in points: through the bar, as iOS's back button has no ground of
  /// ours (Design, 12 Nov: on a white photo it read 2.4:1 with the shade behind the clock alone, 3.5:1 with this one).
  public static let shadeHeight: Double = 180
  /// Its black: `shadeOpacity` at the top, `shadeHeldOpacity` at `shadeHeld` of its height, then fading to nothing.
  public static let shadeOpacity = 0.5
  public static let shadeHeldOpacity = 0.46
  public static let shadeHeld = 0.62
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
