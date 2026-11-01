import Chihiros
import SwiftUI

/// The site's tank (pages/vi/cong-cu/den-chihiros.astro, the `.scene` SVG, 320 × 190) under a setting, as its
/// paintTank lights it: the lamp glows in the mix's colour, a cone of its light falls on the water, and every surface
/// is filtered by it (`Mix.lit`). Off, it says so.
struct TankDrawing: View {
  let mix: Mix

  var body: some View {
    let light = mix.seen
    Canvas { ctx, size in
      let k = min(size.width / 320, size.height / 190)
      ctx.translateBy(x: (size.width - 320 * k) / 2, y: (size.height - 190 * k) / 2)
      ctx.scaleBy(x: k, y: k)
      ctx.fill(Path(CGRect(x: 0, y: 0, width: 320, height: 190)), with: .color(Self.room))
      let lamp = light.power > 0
        ? RGB(parts: light.rgb.parts.map { Int((42 + Double($0 - 42) * min(1, light.power * 1.3)).rounded()) })
        : RGB(42, 47, 44)
      ctx.fill(Path(roundedRect: CGRect(x: 34, y: 14, width: 252, height: 7), cornerRadius: 3.5), with: .color(lamp.color))
      ctx.fill(Self.cone, with: .linearGradient(
        Gradient(colors: [light.rgb.color.opacity(0.55 * light.power), light.rgb.color.opacity(0)]),
        startPoint: CGPoint(x: 0, y: 21), endPoint: CGPoint(x: 0, y: 176)))
      ctx.fill(Path(CGRect(x: 22, y: 40, width: 276, height: 136)), with: .linearGradient(
        Gradient(colors: [light.lit(RGB(120, 190, 190), ambient: 0.08).color, light.lit(RGB(40, 90, 90), ambient: 0.08).color]),
        startPoint: CGPoint(x: 0, y: 40), endPoint: CGPoint(x: 0, y: 176)))
      let stroke = StrokeStyle(lineWidth: 5, lineCap: .round)
      ctx.stroke(Self.stems, with: .color(light.lit(RGB(70, 170, 80)).color), style: stroke)
      ctx.stroke(Self.red, with: .color(light.lit(RGB(200, 70, 60)).color), style: stroke)
      ctx.fill(Self.leaves, with: .color(light.lit(RGB(50, 140, 70)).color))
      ctx.fill(Self.fish, with: .color(light.lit(RGB(90, 160, 255)).color))
      ctx.fill(Self.carpet, with: .color(light.lit(RGB(90, 180, 70)).color))
      ctx.fill(Path(CGRect(x: 22, y: 158, width: 276, height: 18)), with: .color(light.lit(RGB(90, 62, 40)).color))
      ctx.stroke(Path(CGRect(x: 22, y: 40, width: 276, height: 136)), with: .color(.white.opacity(0.22)), lineWidth: 1.5)
      if mix.power < 0.005 {
        ctx.draw(Text("Đèn tắt").font(.system(size: 13, weight: .medium)).foregroundStyle(.white.opacity(0.6)), at: CGPoint(x: 160, y: 100))
      }
    }
    .aspectRatio(320 / 190, contentMode: .fit)
    .accessibilityHidden(true)
  }

  private static let room = Color(red: 13 / 255, green: 21 / 255, blue: 19 / 255)
  private static let cone = shape("M40 21 L280 21 L298 176 L22 176 Z")
  private static let stems = shape("M64 150 C60 120 70 95 66 62 M74 150 C78 118 70 92 78 70 M84 150 C82 126 90 104 88 80 M248 150 C252 116 242 88 250 58 M258 150 C256 120 264 100 260 74")
  private static let red = shape("M210 150 C206 124 216 104 212 84 M220 150 C224 126 216 110 222 92 M230 150 C228 130 236 114 232 98")
  private static let leaves = shape("M110 150 C102 128 112 112 124 104 C122 122 118 136 116 150 Z M128 150 C130 124 146 112 158 110 C150 126 140 138 136 150 Z M164 150 C160 132 170 120 182 116 C178 132 172 142 170 150 Z")
  private static let fish = shape("M150 72 l18 -5 v10 z M168 72 c4 -6 18 -6 22 0 c-4 6 -18 6 -22 0 z M118 92 l14 -4 v8 z M132 92 c3 -5 14 -5 17 0 c-3 5 -14 5 -17 0 z")
  private static let carpet = shape("M22 156 C70 148 120 154 170 149 C220 145 260 152 298 147 L298 160 L22 160 Z")

  /// An SVG path (the commands the drawing uses: M L C l v c Z/z) in the 320 × 190 box.
  static func shape(_ d: String) -> Path {
    var p = Path()
    var cur = CGPoint.zero, start = CGPoint.zero
    var cmd: Character = "M"
    var nums: [CGFloat] = []
    let tokens = d.replacingOccurrences(of: "-", with: " -").split(whereSeparator: { $0 == " " || $0 == "," })
    func flush() {
      var n = nums[...]
      func take(_ k: Int) -> [CGFloat]? { guard n.count >= k else { return nil }; defer { n = n.dropFirst(k) }; return Array(n.prefix(k)) }
      repeat {
        switch cmd {
        case "M": guard let v = take(2) else { return }; cur = CGPoint(x: v[0], y: v[1]); start = cur; p.move(to: cur); cmd = "L"
        case "L": guard let v = take(2) else { return }; cur = CGPoint(x: v[0], y: v[1]); p.addLine(to: cur)
        case "l": guard let v = take(2) else { return }; cur = CGPoint(x: cur.x + v[0], y: cur.y + v[1]); p.addLine(to: cur)
        case "v": guard let v = take(1) else { return }; cur.y += v[0]; p.addLine(to: cur)
        case "C": guard let v = take(6) else { return }
          cur = CGPoint(x: v[4], y: v[5]); p.addCurve(to: cur, control1: CGPoint(x: v[0], y: v[1]), control2: CGPoint(x: v[2], y: v[3]))
        case "c": guard let v = take(6) else { return }
          let o = cur; cur = CGPoint(x: o.x + v[4], y: o.y + v[5])
          p.addCurve(to: cur, control1: CGPoint(x: o.x + v[0], y: o.y + v[1]), control2: CGPoint(x: o.x + v[2], y: o.y + v[3]))
        default: return
        }
      } while !n.isEmpty
    }
    for t in tokens {
      if let c = t.first, c.isLetter {
        if !nums.isEmpty { flush(); nums = [] }
        cmd = c
        if c == "Z" || c == "z" { p.closeSubpath(); cur = start }
        let rest = t.dropFirst()
        if !rest.isEmpty, let v = Double(rest) { nums.append(CGFloat(v)) }
      } else if let v = Double(t) { nums.append(CGFloat(v)) }
    }
    if !nums.isEmpty { flush() }
    return p
  }
}

extension RGB {
  var color: Color { Color(red: Double(r) / 255, green: Double(g) / 255, blue: Double(b) / 255) }
}
