import Chihiros
import SwiftUI
import UIKit.UIGestureRecognizerSubclass

/// The day from 00:00 to 24:00, as on the site's page: the light's curve, a mark at the time now, and handles for the
/// on and off times and the ramp, dragged or adjusted with VoiceOver.
struct Timeline: View {
  @Environment(LightsModel.self) private var lights
  static let height: CGFloat = 120

  var body: some View {
    let s = lights.form
    VStack(spacing: 4) {
      GeometryReader { g in
        let w = g.size.width, h = g.size.height
        let x = { (m: Double) in CGFloat(m / Double(Day.minutes)) * w }
        let (on, off) = (x(Double(s.on.minutes)), x(Double(s.offMinute)))
        ZStack(alignment: .topLeading) {
          RoundedRectangle(cornerRadius: 10).fill(Color(.tertiarySystemGroupedBackground))
          Path { p in
            for hr in stride(from: 180.0, to: 1440, by: 180) {
              p.move(to: CGPoint(x: x(hr), y: 0))
              p.addLine(to: CGPoint(x: x(hr), y: h))
            }
          }
          .stroke(Color(.separator), lineWidth: 1)
          if s.problem == nil {
            let pts = s.curve(top: Double(s.top) / 100).map { CGPoint(x: x($0.minute), y: h - CGFloat($0.level) * (h - 4)) }
            Path { $0.addLines(pts); $0.closeSubpath() }
              .fill(LinearGradient(colors: [Color.accentColor.opacity(0.32), Color.accentColor.opacity(0.06)], startPoint: .top, endPoint: .bottom))
            Path { $0.addLines(pts) }.stroke(Color.accentColor, style: StrokeStyle(lineWidth: 2, lineJoin: .round))
          }
          // Moves with the clock.
          SwiftUI.TimelineView(.everyMinute) { ctx in
            let c = Calendar.current.dateComponents([.hour, .minute], from: shownNow(ctx.date))
            NowMark(x: x(Double((c.hour ?? 0) * 60 + (c.minute ?? 0))), times: [on, off], width: w)
          }
          // Where "Xem thử cả ngày" has reached.
          if let m = lights.playMinute {
            Rectangle().fill(Color.primary).frame(width: 2, height: h).offset(x: x(m) - 1)
              .allowsHitTesting(false).accessibilityHidden(true)
          }
          // Each handle is touched on its own side of the other, and only inside the day: close together, both can
          // still be taken, and the day's edges stay free for scrolling. VoiceOver reads on, ramp, off; the ramp knob
          // is on top where they meet.
          Handle(which: .on, x: on, reach: (min(22, on), min(22, (off - on) / 2)), width: w).accessibilitySortPriority(3)
          Handle(which: .off, x: off, reach: (min(22, (off - on) / 2), min(22, w - off)), width: w).accessibilitySortPriority(1)
          RampHandle(x: x(Double(s.on.minutes + min(s.ramp, max(0, s.minutesLit) / 2))), width: w).accessibilitySortPriority(2)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("day")
      }
      .frame(height: Self.height)
      // 0h … 24h under the day, every three hours.
      GeometryReader { g in
        ForEach(0..<9) { i in
          Text(verbatim: "\(i * 3)h").font(.caption2).monospacedDigit().foregroundStyle(.secondary)
            .fixedSize()
            .position(x: min(max(g.size.width * CGFloat(i) / 8, 10), g.size.width - 12), y: 8)
        }
      }
      .frame(height: 16)
      .accessibilityHidden(true)
    }
    .padding(.top, 22) // room for the handles' times and the "now" label
  }
}

/// The time the light's screen gives as now: the clock's, or in a debug build the one `-now HH:MM` sets (the App Store's
/// screenshots, whose status bar says 9:41).
func shownNow(_ date: Date) -> Date {
  #if DEBUG
  let args = ProcessInfo.processInfo.arguments
  if let i = args.firstIndex(of: "-now"), i + 1 < args.count {
    let hm = args[i + 1].split(separator: ":").compactMap { Int($0) }
    if hm.count == 2, let d = Calendar.current.date(bySettingHour: hm[0], minute: hm[1], second: 0, of: date) { return d }
  }
  #endif
  return date
}

/// A dashed line down the day at the time now, labelled above it clear of the handles' times (`NowLabel`).
private struct NowMark: View {
  let x: CGFloat
  /// Where the on and off handles' times are centred.
  let times: [CGFloat]
  let width: CGFloat
  @State private var label: CGFloat = 0
  /// "12:00" over a handle, as wide as its words at the reader's text size.
  @ScaledMetric(relativeTo: .footnote) private var time: CGFloat = 40

  var body: some View {
    // Left out until it's been measured.
    let place = label == 0 ? .hidden : NowLabel.place(now: Double(x), label: Double(label), times: times.map(Double.init), time: Double(time), width: Double(width))
    Path { $0.move(to: CGPoint(x: 1, y: 0)); $0.addLine(to: CGPoint(x: 1, y: Timeline.height)) }
      .stroke(Color.red, style: StrokeStyle(lineWidth: 2, dash: [5, 4]))
      .frame(width: 2, height: Timeline.height)
      .overlay(alignment: .top) {
        Text("Bây giờ").font(.caption2).foregroundStyle(Color.red).fixedSize()
          .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { label = $0 }
          .offset(x: place == .before ? -(label / 2 + 3) : place == .after ? label / 2 + 3 : 0, y: -18)
          // Measured still when left out.
          .opacity(place == .hidden ? 0 : 1)
      }
      .offset(x: x - 1) // the line's middle at x
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }
}

/// A sideways drag on a handle; up or down, a drag that starts on one is the page's, and Đèn scrolls. As a SwiftUI drag,
/// even beside the page's (`simultaneousGesture`), a handle held every swipe that began on it, so Đèn stopped part-way
/// down once the Week Aqua row put the 12:00 handle where a swipe begins (14 Nov). From iOS 18 it is a UIKit gesture,
/// which gives a drag up as soon as the finger goes more up or down than sideways. The page holds still while a handle moves
/// (`LightsModel.draggingHandle`). `moved`: how far the finger has gone sideways since it touched down.
private struct SideDrag: ViewModifier {
  @Environment(LightsModel.self) private var lights
  let moved: @MainActor (CGFloat) -> Void
  let ended: @MainActor () -> Void

  func body(content: Content) -> some View {
    if #available(iOS 18.0, *) {
      content.gesture(SidePan { dx in
        if !lights.draggingHandle { lights.draggingHandle = true }
        moved(dx)
      } ended: {
        lights.draggingHandle = false
        ended()
      })
    } else {
      content.gesture(DragGesture(minimumDistance: 4).onChanged { moved($0.translation.width) }.onEnded { _ in ended() })
    }
  }
}

@available(iOS 18.0, *)
private struct SidePan: UIGestureRecognizerRepresentable {
  let moved: @MainActor (CGFloat) -> Void
  let ended: @MainActor () -> Void

  func makeUIGestureRecognizer(context: Context) -> SidewaysPan { SidewaysPan() }

  func handleUIGestureRecognizerAction(_ pan: SidewaysPan, context: Context) {
    switch pan.state {
    case .began, .changed: moved(pan.sideways)
    case .ended, .cancelled: ended()
    default: break
    }
  }
}

/// A drag decided at the finger's first 4 points, as SwiftUI's drag starts: more sideways, it begins; more up or down, it
/// fails and the page has it. UIKit's pan needs about 10 points to begin, so a short drag (half an hour) did nothing.
private final class SidewaysPan: UIGestureRecognizer {
  private var start: CGPoint?

  /// How far the finger has gone sideways since it touched down, in points.
  private(set) var sideways: CGFloat = 0

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    if start == nil { start = touches.first?.location(in: nil) }
  }

  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
    guard let s = start, let p = touches.first?.location(in: nil) else { return }
    let dx = p.x - s.x, dy = p.y - s.y
    switch state {
    case .possible:
      guard max(abs(dx), abs(dy)) >= 4 else { return }
      if abs(dy) > abs(dx) {
        state = .failed
      } else {
        sideways = dx
        state = .began
      }
    case .began, .changed:
      sideways = dx
      state = .changed
    default: break
    }
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
    state = state == .began || state == .changed ? .ended : .failed
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
    state = state == .began || state == .changed ? .cancelled : .failed
  }

  override func reset() {
    start = nil
    sideways = 0
  }
}

/// The part of a 44-point-wide handle that takes touches: `left` and `right` points either side of its line.
private struct Reach: Shape {
  let left: CGFloat
  let right: CGFloat
  func path(in r: CGRect) -> Path { Path(CGRect(x: r.midX - max(0, left), y: r.minY, width: max(0, left) + max(0, right), height: r.height)) }
}

/// The on or off time: a line with a knob. Dragged sideways, it moves by as much as the finger does (to 15 minutes), so a
/// touch alone changes nothing; VoiceOver adjusts it 15 minutes at a time, as the site's arrow keys do. A drag up or down
/// is the page's: a swipe that starts on a handle scrolls Đèn and leaves the time alone (`SideDrag`).
private struct Handle: View {
  @Environment(LightsModel.self) private var lights
  let which: Schedule.Handle
  let x: CGFloat
  let reach: (left: CGFloat, right: CGFloat)
  let width: CGFloat
  @State private var from: Int?

  var body: some View {
    let s = lights.form
    let minute = which == .on ? s.on.minutes : s.offMinute
    let time = TimeOfDay(minutes: minute).description
    ZStack {
      Rectangle().fill(Color.primary).frame(width: 2)
      Capsule().fill(Color(.systemBackground))
        .overlay(Capsule().stroke(Color.primary, lineWidth: 2))
        .frame(width: 14, height: 30)
    }
    .frame(width: 44, height: Timeline.height)
    .overlay(alignment: .top) {
      Text(verbatim: time).font(.footnote.weight(.semibold)).monospacedDigit().fixedSize().offset(y: -20)
    }
    .contentShape(Reach(left: reach.left, right: reach.right))
    .offset(x: x - 22)
    .modifier(SideDrag { dx in
      let start = from ?? minute
      from = start
      lights.move(which, to: Double(start) + Double(dx / width) * Double(Day.minutes))
    } ended: { from = nil })
    .accessibilityElement()
    .accessibilityLabel(which == .on ? Text("Giờ bật") : Text("Giờ tắt"))
    .accessibilityValue(which == .on ? Text("Bật lúc \(time)") : Text("Tắt lúc \(time)"))
    .accessibilityAdjustableAction { d in
      lights.move(which, to: Double(minute + (d == .increment ? 15 : -15)))
    }
    .accessibilityIdentifier(which == .on ? "handle-on" : "handle-off")
  }
}

/// The ramp: a knob along the top of the day where the light is full, dragged through the ramps that fit.
private struct RampHandle: View {
  @Environment(LightsModel.self) private var lights
  let x: CGFloat
  let width: CGFloat
  @State private var from: Int?

  var body: some View {
    let s = lights.form
    Circle().fill(Color.accentColor)
      .overlay(Circle().stroke(Color(.systemBackground), lineWidth: 2))
      .frame(width: 16, height: 16)
      .frame(width: 44, height: 44)
      .contentShape(Rectangle())
      .offset(x: x - 22)
      .modifier(SideDrag { dx in
        let start = from ?? s.ramp
        from = start
        lights.setRamp(near: Double(start) + Double(dx / width) * Double(Day.minutes))
      } ended: { from = nil })
      .accessibilityElement()
      .accessibilityLabel(Text("Sáng dần, tối dần"))
      .accessibilityValue(rampText(s.ramp))
      .accessibilityAdjustableAction { d in lights.stepRamp(up: d == .increment) }
      .accessibilityIdentifier("handle-ramp")
  }
}

/// A ramp as the menu lists it: "Không" or "30 phút".
func rampText(_ r: Int) -> Text { r == 0 ? Text("Không") : Text("\(r) phút") }
