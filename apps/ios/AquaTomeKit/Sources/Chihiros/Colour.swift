import Foundation

// What a light setting looks like on screen, as the site's page draws it (apps/site/src/scripts/light-view.ts): the
// colour the channels mix to, a tank lit by it; and the colour looks (den-chihiros.astro's LOOKS).

/// A colour on screen, 0–255 each.
public struct RGB: Sendable, Equatable {
  public var r: Int, g: Int, b: Int
  public init(_ r: Int, _ g: Int, _ b: Int) { self.r = r; self.g = g; self.b = b }
  public var parts: [Int] { [r, g, b] }
  public init(parts p: [Int]) { self.init(p[0], p[1], p[2]) }
}

/// What a setting looks like: the colour the channels mix to (brightest part at 255) and how bright it is, 0–1.
public struct Mix: Sendable, Equatable {
  public let rgb: RGB
  public let power: Double

  // Roughly the colour each kind of LED gives; the screen can only hint at the real light.
  static let led: [Channel: [Double]] = [.red: [255, 48, 40], .green: [40, 230, 80], .blue: [50, 80, 255], .white: [255, 240, 220]]
  // Brightest the sum gets with red, green and blue all at 100 (a white channel can go past it: capped).
  static let full = 375.0

  public init(channels: [Channel], levels: [Double]) {
    var sum = [0.0, 0, 0]
    for (i, c) in channels.enumerated() {
      let l = i < levels.count ? levels[i] : 0
      for k in 0..<3 { sum[k] += (Mix.led[c]![k] * l) / 100 }
    }
    let top = sum.max() ?? 0
    if top == 0 { rgb = RGB(0, 0, 0); power = 0; return }
    rgb = RGB(parts: sum.map { Int(($0 / top * 255).rounded()) })
    power = min(1, top / Mix.full)
  }

  init(rgb: RGB, power: Double) { self.rgb = rgb; self.power = power }

  /// As the eye sees it: on a curve, so 40% of the LEDs' power looks well over a third as bright (the page lights its
  /// tank with this).
  public var seen: Mix { Mix(rgb: rgb, power: power.squareRoot()) }

  /// A surface of colour `base` under this light: the light's colour filters it, its power brightens it. Power is taken
  /// as given (the page passes the square root: the eye sees light on a curve).
  public func lit(_ base: RGB, ambient: Double = 0.12) -> RGB {
    let p = ambient + (1 - ambient) * power
    return RGB(parts: zip(base.parts, rgb.parts).map { b, l in Int((Double(b) * (ambient + (1 - ambient) * Double(l) / 255) * p).rounded()) })
  }
}

/// Colour looks: shares of the brightest channel for red, green, blue and white (the site's list).
public struct Look: Sendable, Identifiable {
  public let id: String
  public let mix: [Double] // red, green, blue, white
  public static let all = [
    Look(id: "natural", mix: [1, 1, 1, 1]),
    Look(id: "red", mix: [1, 0.8, 0.75, 0.8]),
    Look(id: "cool", mix: [0.7, 0.85, 1, 0.9]),
    Look(id: "warm", mix: [1, 0.8, 0.5, 0.7]),
  ]
  /// This look's shares for a light's channels.
  public func shares(_ channels: [Channel]) -> [Double] {
    channels.map { mix[[Channel.red, .green, .blue, .white].firstIndex(of: $0)!] }
  }
  /// The levels for `channels` at brightness `top` (0 → 70, as the site does).
  public func levels(_ channels: [Channel], top: Int) -> [Int] {
    let t = top == 0 ? 70 : top
    return shares(channels).map { Int(($0 * Double(t)).rounded()) }
  }
  /// Whether `levels` are this look (each within 1).
  public func matches(_ levels: [Int], channels: [Channel]) -> Bool {
    let top = levels.max() ?? 0
    return top > 0 && zip(self.levels(channels, top: top), levels).allSatisfy { abs($0 - $1) <= 1 }
  }
}
