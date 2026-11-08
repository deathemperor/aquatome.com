import AccountSync
import SwiftUI

/// Columns over days, as the site's charts: the series stacked from the baseline in their order (a negative value below
/// it), `whole` pale behind them, today lighter (the day isn't over), a day not recorded or still to come a gap. A tap on
/// a column, or a finger dragged across, picks a day, and a label over it reads that day out, in the server's words
/// (`readouts`). One series: the day picked in full colour, the others paler; several: the day picked outlined.
struct OwnerChart: View {
  let chart: Owner.Chart
  /// Its title over it (a section's); the overview's card says what it is above it.
  var titled = true
  /// The day picked: nil, today (or the last day).
  @State private var picked: Int?
  /// The label's width, to keep it inside the chart's.
  @State private var label: CGFloat = 0

  /// The columns' height, and the room over them the label takes.
  private static let columns: CGFloat = 130, room: CGFloat = 50

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      if titled { Text(verbatim: chart.unit == "usd" ? chart.title + " ($)" : chart.title).font(.subheadline.weight(.semibold)) }
      if chart.isEmpty {
        Text(verbatim: chart.empty ?? "").foregroundStyle(.secondary)
      } else {
        let (low, high) = range
        Canvas { ctx, size in draw(ctx, size, low, high) }
          .frame(height: Self.columns + Self.room)
          .overlay(alignment: .topLeading) { readout }
          .overlay(ChartTouch { picked = column(at: $0) })
          .accessibilityElement()
          .accessibilityLabel(Text(verbatim: chart.title))
          .accessibilityValue(Text(verbatim: said(shown)))
          // VoiceOver: swiping up or down reads the next or the previous day.
          .accessibilityAdjustableAction { d in
            switch d {
            case .increment: picked = min(chart.count - 1, shown + 1)
            case .decrement: picked = max(0, shown - 1)
            @unknown default: break
            }
          }
          .accessibilityIdentifier("owner-chart-columns")
        axis.font(.caption2).foregroundStyle(.secondary).accessibilityHidden(true)
        if chart.series.count > 1 || chart.whole != nil {
          // The colours' squares aren't words: VoiceOver gets the names.
          key.font(.caption).accessibilityLabel(Text(verbatim: (chart.series + [chart.whole].compactMap { $0 }).map(\.label).joined(separator: ", ")))
        }
        if let m = chart.missing, chart.series.contains(where: { $0.values.contains(nil) }) {
          Text(verbatim: "— " + m).font(.caption).foregroundStyle(.secondary)
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("owner-chart")
  }

  /// The day read out: the one picked, else today, else the last.
  private var shown: Int { min(picked ?? chart.today ?? chart.count - 1, max(chart.count - 1, 0)) }

  private func said(_ i: Int) -> String {
    chart.readouts[safe: i].map { [$0.title, $0.detail].filter { !$0.isEmpty }.joined(separator: ", ") } ?? ""
  }

  /// The label over the day picked: what it counts, then its day and the other figures, kept inside the chart.
  private var readout: some View {
    GeometryReader { g in
      let r = chart.readouts[safe: shown]
      let step = g.size.width / CGFloat(max(chart.count, 1))
      let x = min(max(step * (CGFloat(shown) + 0.5) - label / 2, 0), max(g.size.width - label, 0))
      VStack(alignment: .leading, spacing: 1) {
        Text(verbatim: r?.title ?? "").font(.footnote.weight(.semibold))
        if let d = r?.detail, !d.isEmpty { Text(verbatim: d).font(.caption2).opacity(0.85) }
      }
      .lineLimit(1)
      .foregroundStyle(Color(uiColor: .systemBackground))
      .padding(.horizontal, 9).padding(.vertical, 5)
      .background(Color.primary, in: .rect(cornerRadius: 8))
      .fixedSize()
      .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { label = $0 }
      .offset(x: x)
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("owner-chart-day")
    }
    .frame(height: Self.room - 6)
    .allowsHitTesting(false)
  }

  /// Each day's label under its column; past eight, the first and the last.
  @ViewBuilder private var axis: some View {
    if chart.count <= 8 {
      HStack(spacing: 0) {
        ForEach(chart.labels.indices, id: \.self) { i in
          Text(verbatim: chart.labels[i]).lineLimit(1).minimumScaleFactor(0.7).frame(maxWidth: .infinity)
            .fontWeight(i == shown ? .semibold : nil).foregroundStyle(i == shown ? Color.primary : .secondary)
        }
      }
    } else {
      HStack {
        Text(verbatim: chart.labels.first ?? "")
        Spacer()
        Text(verbatim: chart.labels.last ?? "")
      }
    }
  }

  /// The column under a finger `across` the chart (0…1).
  private func column(at across: CGFloat) -> Int {
    min(max(Int(across * CGFloat(chart.count)), 0), max(chart.count - 1, 0))
  }

  /// The lowest and highest the columns reach, 0 between them.
  private var range: (Double, Double) {
    var low = 0.0, high = 0.0
    for i in 0..<chart.count {
      let v = chart.series.compactMap { $0.values[safe: i] ?? nil }
      low = min(low, v.filter { $0 < 0 }.reduce(0, +))
      high = max(high, v.filter { $0 > 0 }.reduce(0, +), (chart.whole?.values[safe: i] ?? nil) ?? 0)
    }
    return (low, high > low ? high : low + 1)
  }

  private func draw(_ ctx: GraphicsContext, _ size: CGSize, _ low: Double, _ high: Double) {
    let n = chart.count, step = size.width / CGFloat(max(n, 1)), top = Self.room, height = size.height - top
    let y = { (v: Double) in top + height * CGFloat((high - v) / (high - low)) }
    let one = chart.series.count == 1
    func shade(_ i: Int) -> Double {
      let today = i == chart.today
      return one ? (i == shown ? (today ? 0.7 : 1) : today ? 0.25 : 0.4) : today ? 0.5 : 1
    }
    func rect(_ i: Int, _ from: Double, _ to: Double) -> CGRect {
      let t = y(max(from, to))
      return CGRect(x: CGFloat(i) * step + step * 0.12, y: t, width: step * 0.76, height: max(1, y(min(from, to)) - t))
    }
    for i in 0..<n {
      if let w = chart.whole?.values[safe: i] ?? nil { ctx.fill(Path(rect(i, 0, w)), with: .color(Self.whole)) }
      var up = 0.0, down = 0.0
      for (s, series) in chart.series.enumerated() {
        guard let v = series.values[safe: i] ?? nil, v != 0 else { continue }
        let r = v > 0 ? rect(i, up, up + v) : rect(i, down, down + v)
        if v > 0 { up += v } else { down += v }
        ctx.fill(Path(roundedRect: r, cornerRadius: min(3, r.width / 4)), with: .color(color(s).opacity(shade(i))))
      }
      // Several series: the day picked outlined, around all its parts.
      if !one, i == shown, up != 0 || down != 0 {
        ctx.stroke(Path(roundedRect: rect(i, down, up).insetBy(dx: -2, dy: -2), cornerRadius: 4), with: .color(.primary), lineWidth: 2)
      }
    }
    ctx.fill(Path(CGRect(x: 0, y: y(0), width: size.width, height: 0.5)), with: .color(.secondary.opacity(0.5)))
  }

  /// The series' colours, in a line.
  private var key: Text {
    var t = Text(verbatim: "")
    for s in chart.series.indices { t = t + Text(verbatim: "● ").foregroundStyle(color(s)) + Text(verbatim: chart.series[s].label + "   ") }
    if let w = chart.whole { t = t + Text(verbatim: "● ").foregroundStyle(Self.whole) + Text(verbatim: w.label) }
    return t.foregroundStyle(.secondary)
  }

  /// The chart's own colours, never orange or red (they mean waiting on the owner, and a fault): green, blue, grey;
  /// `mute` context only.
  private func color(_ s: Int) -> Color {
    switch chart.series[s].tone ?? ["s1", "s2", "s3"][min(s, 2)] {
    case "s2": .blue
    case "s3": .gray
    case "mute": Self.mute
    default: Self.green
    }
  }

  /// The app's green, as the dashboard's mockups draw it in each mode.
  static let green = Color(light: 0x2e6b4f, dark: 0x4fae84)
  static let mute = Color(light: 0xc7c7cc, dark: 0x48484a)
  static let whole = Color(light: 0xdde8e1, dark: 0x22382e)
}

/// A tile's small columns, one a day: the day picked in full colour (today's lighter), the rest paler, a day still to
/// come a faint line. A tap on one, or a finger dragged across, reads it out under them, in the server's words.
struct OwnerBars: View {
  let label: String
  let bars: Owner.Bars
  @State private var picked: Int?

  var body: some View {
    let n = bars.values.count, high = max(bars.values.compactMap { $0 }.max() ?? 0, 1)
    VStack(alignment: .leading, spacing: 4) {
      Canvas { ctx, size in
        let step = size.width / CGFloat(max(n, 1))
        for i in 0..<n {
          let x = CGFloat(i) * step + step * 0.1, w = step * 0.8
          guard let v = bars.values[i] else {
            ctx.fill(Path(CGRect(x: x, y: size.height - 2, width: w, height: 2)), with: .color(.secondary.opacity(0.25)))
            continue
          }
          let h = max(2, size.height * CGFloat(v / high))
          let full = i == picked || (picked == nil && i != bars.today)
          ctx.fill(Path(roundedRect: CGRect(x: x, y: size.height - h, width: w, height: h), cornerRadius: 2),
                   with: .color(OwnerChart.green.opacity(i == picked ? 1 : full ? 0.45 : 0.25)))
        }
      }
      .frame(height: 24)
      .overlay(ChartTouch { across in picked = min(max(Int(across * CGFloat(n)), 0), max(n - 1, 0)) })
      .accessibilityElement()
      .accessibilityLabel(Text(verbatim: label))
      .accessibilityValue(Text(verbatim: said(picked ?? bars.today ?? n - 1)))
      .accessibilityAdjustableAction { d in
        let at = picked ?? bars.today ?? n - 1
        switch d {
        case .increment: picked = min(n - 1, at + 1)
        case .decrement: picked = max(0, at - 1)
        @unknown default: break
        }
      }
      .accessibilityIdentifier("owner-bars")
      if let p = picked, let r = bars.readouts[safe: p] {
        Text(verbatim: r.title + " · " + r.detail).font(.caption2).foregroundStyle(.secondary).lineLimit(2)
          .accessibilityIdentifier("owner-bars-day")
      }
    }
  }

  private func said(_ i: Int) -> String {
    bars.readouts[safe: i].map { [$0.title, $0.detail].filter { !$0.isEmpty }.joined(separator: ", ") } ?? ""
  }
}

/// A chart's taps and sideways drags, as UIKit's recognizers take them, reported as how far across (0…1) the finger is.
/// A drag that starts up or down fails at once and the page scrolls, as anywhere else: a SwiftUI drag on a scroll
/// view's content keeps it from scrolling, even one alongside it (the flow checks both).
private struct ChartTouch: UIViewRepresentable {
  let touched: (CGFloat) -> Void

  func makeUIView(context: Context) -> UIView {
    let v = UIView()
    v.backgroundColor = .clear
    v.isAccessibilityElement = false
    v.addGestureRecognizer(UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.touch(_:))))
    let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.touch(_:)))
    pan.delegate = context.coordinator
    v.addGestureRecognizer(pan)
    return v
  }
  func updateUIView(_ v: UIView, context: Context) { context.coordinator.touched = touched }
  func makeCoordinator() -> Coordinator { Coordinator(touched) }

  @MainActor final class Coordinator: NSObject, UIGestureRecognizerDelegate {
    var touched: (CGFloat) -> Void
    init(_ touched: @escaping (CGFloat) -> Void) { self.touched = touched }
    @objc func touch(_ g: UIGestureRecognizer) {
      guard let v = g.view, v.bounds.width > 0 else { return }
      touched(min(max(g.location(in: v).x / v.bounds.width, 0), 1))
    }
    // Only a sideways drag is the chart's.
    func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
      guard let pan = g as? UIPanGestureRecognizer else { return true }
      let v = pan.velocity(in: pan.view)
      return abs(v.x) > abs(v.y)
    }
  }
}

private extension Color {
  init(light: UInt32, dark: UInt32) {
    func rgb(_ c: UInt32) -> UIColor { UIColor(red: CGFloat(c >> 16 & 0xff) / 255, green: CGFloat(c >> 8 & 0xff) / 255, blue: CGFloat(c & 0xff) / 255, alpha: 1) }
    self.init(uiColor: UIColor { $0.userInterfaceStyle == .dark ? rgb(dark) : rgb(light) })
  }
}

private extension Array {
  /// A value on a day it may have none for (a series shorter than its days).
  subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}
