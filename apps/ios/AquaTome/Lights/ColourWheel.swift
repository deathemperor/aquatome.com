import SwiftUI

/// Khác on the Love Ecology card: any colour from our own wheel, in a sheet. Brightness stays on the card: the wheel sends
/// hue and saturation at the slider's level. Not iOS's ColorPicker: its grid and spectrum mix in darkness, which here is
/// the slider's job, and it reports every change with no lift to send on.
struct ColourWheelSheet: View {
  let lamp: LoveEcologyModel
  @Environment(\.dismiss) private var dismiss
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    // At the accessibility sizes the sheet is full height, the wheel keeps its size, and the words scroll if they don't fit.
    let large = size.isAccessibilitySize
    NavigationStack {
      ScrollView {
        VStack(spacing: 0) {
          ColourWheel(start: lamp.wheel ?? .init(hue: 0, saturation: 0)) { lamp.turn(to: $0) } onLift: { lamp.lift() }
            .padding(.top, 10)
          // Nothing waits to be confirmed: each pause or lift sends, so there's no Hủy.
          Text("Ngừng kéo để gửi tới đèn. Càng vào giữa, màu càng nhạt.")
            .font(.footnote).foregroundStyle(.secondary)
            .multilineTextAlignment(large ? .leading : .center)
            .frame(maxWidth: .infinity, alignment: large ? .leading : .center)
            .padding(.top, 14)
          // The card's line, which the sheet covers.
          LampLine(lamp: lamp).padding(.top, 6)
        }
        .padding(.horizontal, 24)
        .padding(.bottom)
      }
      .scrollBounceBehavior(.basedOnSize)
      .navigationTitle("Màu khác")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        // Prominent, as Design drew it: closing is all there is to do here.
        ToolbarItem(placement: .confirmationAction) {
          if #available(iOS 26, *) {
            Button("Xong", role: .confirm) { dismiss() }.accessibilityIdentifier("wheel-done")
          } else {
            Button("Xong") { dismiss() }.accessibilityIdentifier("wheel-done")
          }
        }
      }
    }
    .presentationDetents(large ? [.large] : [.medium])
  }
}

/// Hue round the wheel, red at the top and going clockwise; saturation from white at the centre to the full colour at the
/// edge. Brightness 1: the light's level is the card's slider. VoiceOver reads it as two values to adjust.
struct ColourWheel: View {
  @State private var at: LoveEcologyModel.Wheel
  let onChange: (LoveEcologyModel.Wheel) -> Void
  let onLift: () -> Void
  /// Its size at every text size: the words around it grow instead.
  private let side: CGFloat = 240

  init(start: LoveEcologyModel.Wheel, onChange: @escaping (LoveEcologyModel.Wheel) -> Void, onLift: @escaping () -> Void) {
    _at = State(initialValue: start)
    self.onChange = onChange
    self.onLift = onLift
  }

  /// The hues every 60°, round from red back to red.
  static let hues = (0...6).map { Color(hue: Double($0 % 6) / 6, saturation: 1, brightness: 1) }

  var body: some View {
    let r = side / 2, angle = at.hue * .pi / 180
    ZStack {
      Circle().fill(AngularGradient(colors: Self.hues, center: .center, startAngle: .degrees(-90), endAngle: .degrees(270)))
      // White mixed in towards the centre in proportion: the colour at each point is that hue at that saturation.
      Circle().fill(RadialGradient(colors: [.white, .white.opacity(0)], center: .center, startRadius: 0, endRadius: r))
      Circle().fill(at.colour).frame(width: 28, height: 28)
        .overlay { Circle().strokeBorder(.white, lineWidth: 3).padding(-3) }
        .shadow(color: .black.opacity(0.35), radius: 4, y: 2)
        .offset(x: sin(angle) * at.saturation * r, y: -cos(angle) * at.saturation * r)
    }
    .frame(width: side, height: side)
    .contentShape(Circle())
    .gesture(DragGesture(minimumDistance: 0).onChanged { pick($0.location) }.onEnded { _ in onLift() })
    .accessibilityElement(children: .ignore)
    .accessibilityChildren {
      // VoiceOver's two values, each over half the wheel.
      VStack(spacing: 0) {
        Rectangle()
          .frame(width: side, height: side / 2)
          .accessibilityLabel("Sắc màu")
          .accessibilityValue(Self.name(at.hue))
          .accessibilityAdjustableAction { d in
            let step = (at.hue / 15).rounded() + (d == .increment ? 1 : -1)
            set(.init(hue: (step * 15 + 360).truncatingRemainder(dividingBy: 360), saturation: at.saturation))
          }
          .accessibilityIdentifier("wheel-hue")
        Rectangle()
          .frame(width: side, height: side / 2)
          .accessibilityLabel("Độ đậm")
          .accessibilityValue(Text(verbatim: "\(Int((at.saturation * 100).rounded()))%"))
          .accessibilityAdjustableAction { d in
            let step = (at.saturation * 10).rounded() + (d == .increment ? 1 : -1)
            set(.init(hue: at.hue, saturation: min(max(step / 10, 0), 1)))
          }
          .accessibilityIdentifier("wheel-saturation")
      }
    }
    .accessibilityIdentifier("lamp-wheel")
  }

  private func pick(_ p: CGPoint) {
    let r = side / 2, dx = p.x - r, dy = p.y - r
    let degrees = atan2(dx, -dy) * 180 / .pi
    set(.init(hue: degrees < 0 ? degrees + 360 : degrees, saturation: min(hypot(dx, dy) / r, 1)))
  }

  private func set(_ w: LoveEcologyModel.Wheel) {
    guard w != at else { return }
    at = w
    onChange(w)
  }

  /// The hue's name, in 15° steps.
  private static func name(_ hue: Double) -> String {
    names[Int((hue / 15).rounded()) % names.count]
  }

  private static let names = [
    String(localized: "đỏ", bundle: .app), String(localized: "đỏ cam", bundle: .app), String(localized: "cam", bundle: .app), String(localized: "cam vàng", bundle: .app),
    String(localized: "vàng", bundle: .app), String(localized: "vàng chanh", bundle: .app), String(localized: "xanh nõn chuối", bundle: .app), String(localized: "xanh cốm", bundle: .app),
    String(localized: "xanh lá", bundle: .app), String(localized: "xanh lá tươi", bundle: .app), String(localized: "xanh bạc hà", bundle: .app), String(localized: "xanh ngọc", bundle: .app),
    String(localized: "xanh lơ", bundle: .app), String(localized: "xanh da trời", bundle: .app), String(localized: "xanh biển", bundle: .app), String(localized: "xanh coban", bundle: .app),
    String(localized: "xanh dương", bundle: .app), String(localized: "chàm", bundle: .app), String(localized: "tím", bundle: .app), String(localized: "tím hoa cà", bundle: .app),
    String(localized: "hồng tím", bundle: .app), String(localized: "hồng sen", bundle: .app), String(localized: "hồng", bundle: .app), String(localized: "đỏ hồng", bundle: .app),
  ]
}
