import Chihiros
import SwiftUI

/// Presets by tank type, each with why; the one the form is, is marked (as the site's pressed preset).
struct PresetGrid: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    // A grid, not a sideways strip: every preset in view at once (and not lazy: each one is there to find).
    Grid(horizontalSpacing: 8, verticalSpacing: 8) {
      ForEach(Array(stride(from: 0, to: Preset.all.count, by: 2)), id: \.self) { i in
        GridRow(alignment: .top) {
          ForEach(Preset.all[i..<min(i + 2, Preset.all.count)]) { p in button(p) }
        }
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Lịch mẫu")
  }

  private func button(_ p: Preset) -> some View {
    let chosen = lights.matches(p)
    return Button { lights.applyPreset(p) } label: {
      VStack(alignment: .leading, spacing: 2) {
        Text(p.name).font(.subheadline.weight(.semibold)).foregroundStyle(.primary)
        Text(verbatim: "\(p.on)–\(p.off) · \(p.level)%").font(.caption).monospacedDigit().foregroundStyle(.secondary)
        Text(p.why).font(.caption).foregroundStyle(.secondary)
      }
      .frame(maxWidth: .infinity, minHeight: 44, alignment: .topLeading)
      .padding(10)
      .background(RoundedRectangle(cornerRadius: 8).fill(Color(.tertiarySystemGroupedBackground)))
      .overlay(RoundedRectangle(cornerRadius: 8).stroke(chosen ? Color.accentColor : Color(.separator), lineWidth: chosen ? 2 : 1))
      .contentShape(RoundedRectangle(cornerRadius: 8))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(chosen ? .isSelected : [])
    .accessibilityIdentifier("preset-\(p.id)")
  }
}

/// Hours lit and the advice, or what's wrong with the times, as the site's readout under the day. VoiceOver hears it
/// change, as the site's live region is heard, after what it is reading.
struct Readout: View {
  let schedule: Schedule

  var body: some View {
    let w = Self.words(schedule)
    (Text(verbatim: w.plain) + Text(verbatim: w.warning ?? "").foregroundStyle(Color.warning))
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityIdentifier("hours")
      .onChange(of: w.plain + (w.warning ?? "")) { _, said in
        var a = AttributedString(said)
        a.accessibilitySpeechAnnouncementPriority = .low
        AccessibilityNotification.Announcement(a).post()
      }
  }

  /// What it says: plain words, then any in the warning colour.
  static func words(_ s: Schedule) -> (plain: String, warning: String?) {
    switch s.problem {
    case .offNotAfterOn?: return ("", String(localized: "Giờ tắt phải sau giờ bật, trong cùng một ngày."))
    case .rampOutOfRange?: return ("", String(localized: "Sáng dần, tối dần từ 0 đến 150 phút."))
    case .rampTooLong?: return ("", String(localized: "Sáng dần, tối dần dài hơn nửa thời gian bật đèn."))
    case nil:
      let h = s.hoursOn
      let full = Double(max(0, s.minutesLit - s.ramp * 2)) / 60
      let lit = String(localized: "Đèn sáng \(hours(h)) tiếng mỗi ngày")
        + (s.ramp > 0 ? String(localized: ", sáng hẳn \(hours(full)) tiếng") : "") + ". "
      if h > 8 { return (lit, String(localized: "Trên 8 tiếng dễ lên rêu.")) }
      return (lit + (h < 5 ? String(localized: "Dưới 5 tiếng, cây trồng lớn chậm.") : String(localized: "6–8 tiếng là vừa cho bể thủy sinh.")), nil)
    }
  }

  /// "8", "7,5": to one decimal, in the reader's language.
  private static func hours(_ h: Double) -> String { h.formatted(.number.precision(.fractionLength(0...1))) }
}

/// The exact times and the ramp, following the timeline (the site's fields under it).
struct ScheduleFields: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    @Bindable var lights = lights
    // The site's ramps, and one not in the list (an older schedule) so it still shows.
    let ramps = Set(Schedule.ramps + [lights.ramp]).sorted()
    VStack(spacing: 8) {
      TimePicker(title: "Bật lúc", time: $lights.on).accessibilityIdentifier("on")
      TimePicker(title: "Tắt lúc", time: $lights.off).accessibilityIdentifier("off")
      HStack {
        // Read once, by the menu itself.
        Text("Sáng dần, tối dần").accessibilityHidden(true)
        Spacer()
        Picker(selection: $lights.ramp) {
          ForEach(ramps, id: \.self) { r in rampText(r).tag(r) }
        } label: {
          Text("Sáng dần, tối dần")
        }
        .pickerStyle(.menu)
        .accessibilityIdentifier("ramp")
      }
      .frame(minHeight: 44)
    }
  }
}

private struct TimePicker: View {
  let title: LocalizedStringKey
  @Binding var time: TimeOfDay

  var body: some View {
    DatePicker(title, selection: Binding {
      Calendar.current.date(bySettingHour: time.hour, minute: time.minute, second: 0, of: Date()) ?? Date()
    } set: {
      let c = Calendar.current.dateComponents([.hour, .minute], from: $0)
      time = TimeOfDay(hour: c.hour ?? 0, minute: c.minute ?? 0)
    }, displayedComponents: .hourAndMinute)
  }
}
