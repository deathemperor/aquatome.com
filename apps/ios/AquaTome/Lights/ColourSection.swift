import Chihiros
import SwiftUI

/// The tank under the schedule, as the site's figure beside its timeline: at its brightest, or at the minute the day
/// preview has reached, with what the light does now.
struct TankScene: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let s = lights.form
    let share = lights.playMinute.map { s.level(atMinute: Int($0)) } ?? 1
    VStack(alignment: .leading, spacing: 6) {
      TankDrawing(mix: Mix(channels: lights.channels, levels: s.levels.map { Double($0) * share }))
        .clipShape(RoundedRectangle(cornerRadius: 10))
      SwiftUI.TimelineView(.everyMinute) { ctx in
        (Text(verbatim: Self.caption(s, playing: lights.playMinute, now: ctx.date)) + Text(verbatim: " ")
          + Text("Màu trên màn hình chỉ gần đúng.").foregroundStyle(.secondary))
          .font(.footnote)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("tank-now")
      }
    }
  }

  /// The site's caption: what the light does now, or at the minute the preview shows.
  static func caption(_ s: Schedule, playing minute: Double?, now: Date) -> String {
    guard s.problem == nil else { return "" }
    let c = Calendar.current.dateComponents([.hour, .minute], from: now)
    let at = minute.map { Int($0) } ?? ((c.hour ?? 0) * 60 + (c.minute ?? 0))
    let t = TimeOfDay(minutes: at).description
    let level = s.level(atMinute: at)
    let p = Int((Double(s.top) * level).rounded())
    if minute != nil {
      return t + ": " + (level > 0 ? String(localized: "sáng \(p)%") : String(localized: "đèn tắt"))
    }
    if level == 0 { return String(localized: "Bây giờ \(t): đèn tắt, bật lại lúc \(s.on.description).") }
    if level < 1 {
      let dir = at < s.on.minutes + s.ramp ? String(localized: "sáng dần") : String(localized: "tối dần")
      return String(localized: "Bây giờ \(t): đèn đang \(dir), \(p)%.")
    }
    return String(localized: "Bây giờ \(t): đèn sáng \(s.top)%.")
  }
}

/// "Xem thử cả ngày": the day in ten seconds, on the light too when one is connected; "Dừng" stops it.
struct PreviewButton: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    Button { Task { await lights.togglePreview() } } label: {
      Text(lights.isPlaying ? "Dừng" : lights.isConnected ? "Xem thử cả ngày trên đèn" : "Xem thử cả ngày").frame(maxWidth: .infinity)
    }
    .buttonStyle(.bordered)
    .controlSize(.large)
    .disabled((lights.form.problem != nil && !lights.isPlaying) || lights.isBusy) // "Dừng" always stops
    .accessibilityIdentifier("play")
  }
}

/// Colour, as on the site's page: a look, one brightness for every channel, each channel, and "Thử màu trên đèn" (the
/// light shows the colour being edited until the test ends).
struct ColourSection: View {
  @Environment(LightsModel.self) private var lights
  @State private var each = false

  var body: some View {
    let ch = lights.channels
    VStack(alignment: .leading, spacing: 12) {
      Text("Màu và độ sáng").font(.title3.weight(.semibold))
      // The tank again, in view while the colour is set (the site shows it here on a phone too).
      TankDrawing(mix: Mix(channels: ch, levels: lights.form.levels.map(Double.init)))
        .frame(maxWidth: 240)
        .clipShape(RoundedRectangle(cornerRadius: 8))
      if ch.count > 1 { Looks() }
      ChannelSlider(id: "master", title: String(localized: "Độ sáng"), swatch: nil, value: lights.form.top) { lights.setBrightness($0) }
      if ch.count > 1 {
        DisclosureGroup(isExpanded: $each) {
          ForEach(Array(ch.enumerated()), id: \.offset) { i, c in
            ChannelSlider(id: "level-\(i)", title: c.title, swatch: c.swatch, value: lights.levels[i]) { lights.setChannel(i, $0) }
          }
        } label: {
          // On the label: set on the group, the name would reach every slider in it too.
          Text("Chỉnh từng màu").foregroundStyle(.secondary).frame(minHeight: 44).accessibilityIdentifier("each")
        }
      }
      if lights.isConnected {
        Button { Task { await lights.toggleTrying() } } label: {
          Text(lights.trying ? "Thôi thử, chạy theo lịch" : "Thử màu trên đèn").frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .disabled(lights.isBusy)
        .accessibilityAddTraits(lights.trying ? .isSelected : [])
        .accessibilityIdentifier("try")
        Text("Đèn hiện đúng màu đang chỉnh. Tắt thử thì đèn chạy lại theo lịch.").font(.footnote).foregroundStyle(.secondary)
      }
    }
  }
}

/// The colour looks, each with a dot of its colour; the one the levels are is marked (as the site's pressed look).
private struct Looks: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let ch = lights.channels
    let levels = lights.form.levels
    FlowRow {
      ForEach(Look.all) { l in
        let chosen = l.matches(levels, channels: ch)
        Button { lights.applyLook(l) } label: {
          HStack(spacing: 8) {
            Circle().fill(Mix(channels: ch, levels: l.shares(ch).map { $0 * 100 }).rgb.color)
              .overlay(Circle().stroke(Color.black.opacity(0.15)))
              .frame(width: 22, height: 22)
            Text(l.name).foregroundStyle(.primary)
          }
          .padding(.leading, 8).padding(.trailing, 14)
          .frame(minHeight: 44)
          .background(Capsule().fill(Color(.tertiarySystemGroupedBackground)))
          .overlay(Capsule().stroke(chosen ? Color.accentColor : Color(.separator), lineWidth: chosen ? 2 : 1))
          .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(chosen ? .isSelected : [])
        .accessibilityIdentifier("look-\(l.id)")
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Kiểu màu")
  }
}

/// Buttons in rows, wrapping to the next row when one is full.
private struct FlowRow: Layout {
  var spacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    let rows = rows(subviews, width: width)
    let h = rows.map { r in r.map { size(subviews[$0], width).height }.max() ?? 0 }.reduce(0, +)
    return CGSize(width: proposal.width ?? 0, height: h + spacing * CGFloat(max(0, rows.count - 1)))
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for r in rows(subviews, width: bounds.width) {
      var x = bounds.minX
      let h = r.map { size(subviews[$0], bounds.width).height }.max() ?? 0
      for i in r {
        let s = size(subviews[i], bounds.width)
        subviews[i].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
        x += s.width + spacing
      }
      y += h + spacing
    }
  }

  /// Its own size, or the row's width at most (large text: its words wrap).
  private func size(_ v: LayoutSubview, _ width: CGFloat) -> CGSize {
    let s = v.sizeThatFits(.unspecified)
    return s.width <= width ? s : v.sizeThatFits(ProposedViewSize(width: width, height: nil))
  }

  private func rows(_ subviews: Subviews, width: CGFloat) -> [[Int]] {
    var rows: [[Int]] = [[]]
    var x: CGFloat = 0
    for i in subviews.indices {
      let w = size(subviews[i], width).width
      if x > 0, x + w > width { rows.append([]); x = 0 }
      rows[rows.count - 1].append(i)
      x += w + spacing
    }
    return rows
  }
}

/// One level, 0–100%, with the channel's colour: its name and value beside the slider, or above it at the largest
/// text sizes.
private struct ChannelSlider: View {
  let id: String
  let title: String
  let swatch: Color?
  let value: Int
  let onChange: (Int) -> Void
  @Environment(\.dynamicTypeSize) private var size
  @ScaledMetric private var titleWidth: CGFloat = 96
  @ScaledMetric private var valueWidth: CGFloat = 48

  var body: some View {
    let slider = Slider(value: Binding { Double(value) } set: { v in if Int(v) != value { onChange(Int(v)) } }, in: 0...100, step: 1)
      .tint(swatch ?? .accentColor)
      .accessibilityLabel(title)
      .accessibilityValue(Text(verbatim: "\(value)%"))
      .accessibilityIdentifier(id)
    let name = Text(title).accessibilityHidden(true) // the slider says it
    let shown = Text(verbatim: "\(value)%").monospacedDigit().accessibilityHidden(true)
    Group {
      if size.isAccessibilitySize {
        VStack(alignment: .leading, spacing: 4) {
          HStack { name; Spacer(); shown }
          slider
        }
      } else {
        HStack(spacing: 12) {
          name.frame(minWidth: titleWidth, alignment: .leading).fixedSize()
          slider
          shown.frame(minWidth: valueWidth, alignment: .trailing).fixedSize()
        }
      }
    }
    .frame(minHeight: 44)
  }
}

extension Look {
  var name: String {
    switch id {
    case "red": String(localized: "Cây đỏ rực")
    case "cool": String(localized: "Nước trong, mát")
    case "warm": String(localized: "Ấm, dịu mắt")
    default: String(localized: "Tự nhiên")
    }
  }
}

extension Channel {
  /// The site's swatch for the channel's slider.
  var swatch: Color {
    switch self {
    case .red: Color(red: 0xd8 / 255, green: 0x45 / 255, blue: 0x2f / 255)
    case .green: Color(red: 0x3c / 255, green: 0x9a / 255, blue: 0x52 / 255)
    case .blue: Color(red: 0x34 / 255, green: 0x66 / 255, blue: 0xd6 / 255)
    case .white: Color(red: 0xb9 / 255, green: 0xb2 / 255, blue: 0xa2 / 255)
    }
  }
}
