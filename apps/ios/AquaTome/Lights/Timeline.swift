import Chihiros
import SwiftUI

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
            let c = Calendar.current.dateComponents([.hour, .minute], from: ctx.date)
            NowMark().offset(x: x(Double((c.hour ?? 0) * 60 + (c.minute ?? 0))))
          }
          // Each handle is touched on its own side of the other, and only inside the day: close together, both can
          // still be taken, and the day's edges stay free for scrolling. VoiceOver reads on, ramp, off; the ramp knob
          // is on top where they meet.
          Handle(which: .on, x: on, reach: (min(22, on), min(22, (off - on) / 2)), width: w).accessibilitySortPriority(3)
          Handle(which: .off, x: off, reach: (min(22, (off - on) / 2), min(22, w - off)), width: w).accessibilitySortPriority(1)
          RampHandle(x: x(Double(s.on.minutes + min(s.ramp, max(0, s.minutesLit) / 2))), width: w).accessibilitySortPriority(2)
        }
        .coordinateSpace(name: "day")
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

/// A dashed line down the day at the time now, labelled above it.
private struct NowMark: View {
  var body: some View {
    Path { $0.move(to: .zero); $0.addLine(to: CGPoint(x: 0, y: Timeline.height)) }
      .stroke(Color.red, style: StrokeStyle(lineWidth: 2, dash: [5, 4]))
      .frame(width: 2, height: Timeline.height)
      .overlay(alignment: .top) {
        Text("Bây giờ").font(.caption2).foregroundStyle(Color.red).fixedSize().offset(y: -18)
      }
      .allowsHitTesting(false)
      .accessibilityHidden(true)
  }
}

/// The part of a 44-point-wide handle that takes touches: `left` and `right` points either side of its line.
private struct Reach: Shape {
  let left: CGFloat
  let right: CGFloat
  func path(in r: CGRect) -> Path { Path(CGRect(x: r.midX - max(0, left), y: r.minY, width: max(0, left) + max(0, right), height: r.height)) }
}

/// The on or off time: a line with a knob. Dragged, it moves by as much as the finger does (to 15 minutes), so a touch
/// alone changes nothing; VoiceOver adjusts it 15 minutes at a time, as the site's arrow keys do.
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
    .gesture(DragGesture(minimumDistance: 4, coordinateSpace: .named("day"))
      .onChanged { v in
        let start = from ?? minute
        from = start
        lights.move(which, to: Double(start) + Double(v.translation.width / width) * Double(Day.minutes))
      }
      .onEnded { _ in from = nil })
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
      .gesture(DragGesture(minimumDistance: 4, coordinateSpace: .named("day"))
        .onChanged { v in
          let start = from ?? s.ramp
          from = start
          lights.setRamp(near: Double(start) + Double(v.translation.width / width) * Double(Day.minutes))
        }
        .onEnded { _ in from = nil })
      .accessibilityElement()
      .accessibilityLabel(Text("Sáng dần, tối dần"))
      .accessibilityValue(rampText(s.ramp))
      .accessibilityAdjustableAction { d in lights.stepRamp(up: d == .increment) }
      .accessibilityIdentifier("handle-ramp")
  }
}

/// A ramp as the menu lists it: "Không" or "30 phút".
func rampText(_ r: Int) -> Text { r == 0 ? Text("Không") : Text("\(r) phút") }
