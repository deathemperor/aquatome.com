import Chihiros
import ChihirosBLE
import SwiftUI

/// Find a light, then control it. The UX follows the site's Chihiros page (/vi/cong-cu/den-chihiros/).
struct LightsView: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    NavigationStack {
      Group {
        if lights.isConnected { LightView() } else { FindView() }
      }
      .navigationTitle("Đèn Chihiros")
      // What just happened stays in view wherever the form is scrolled.
      .safeAreaInset(edge: .bottom) {
        if let n = lights.notice {
          NoticeText(notice: n)
            .font(.callout)
            .padding(.horizontal)
            .padding(.vertical, 10)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.bar)
        }
      }
    }
  }
}

private struct FindView: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    List {
      Section {
        Text("Hẹn giờ bật tắt, chỉnh độ sáng từng màu và chỉnh giờ cho đèn Chihiros qua Bluetooth.")
        Button {
          lights.isScanning ? lights.stopScan() : lights.scan()
        } label: {
          HStack {
            Text(lights.isScanning ? "Đang tìm đèn…" : "Tìm đèn")
            if lights.isScanning { Spacer(); ProgressView() }
          }
        }
        .accessibilityIdentifier("scan")
      } footer: {
        Text("Bật đèn, bật Bluetooth và lại gần đèn. Đóng ứng dụng My Chihiros trên các máy khác: mỗi lúc đèn chỉ nhận một kết nối.")
      }

      if !lights.found.isEmpty {
        Section("Đèn tìm thấy") {
          ForEach(lights.found) { l in
            Button {
              Task { await lights.connect(l) }
            } label: {
              HStack {
                VStack(alignment: .leading) {
                  Text(Model.of(name: l.name)?.name ?? l.name).foregroundStyle(.primary)
                  Text(l.name).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                if lights.connecting == l.id { ProgressView() } else { Text("Kết nối đèn") }
              }
            }
            .disabled(lights.connecting != nil)
            .accessibilityIdentifier("light")
          }
        }
      }

      Section {
        Text("Hỗ trợ các đèn Bluetooth có tên bắt đầu bằng DY: \(Model.supported.joined(separator: ", ")).")
        AboutText()
      }
      .font(.footnote)
      .foregroundStyle(.secondary)
    }
  }
}

private struct LightView: View {
  @Environment(LightsModel.self) private var lights
  @State private var confirming = false

  var body: some View {
    @Bindable var lights = lights
    Form {
      Section("Đang chạy trên đèn") {
        SavedScheduleRow()
        if let p = lights.previous, p != lights.saved {
          Button("Khôi phục lịch trước: \(p.summary)") { Task { await lights.restorePrevious() } }
            .disabled(lights.isBusy || lights.firmware.map { $0 < 20 } ?? true)
            .accessibilityIdentifier("restore")
        }
        ClockRow()
        Button("Chỉnh giờ đèn theo máy này") { Task { await lights.syncClock() } }
          .disabled(lights.isBusy)
          .accessibilityIdentifier("sync-clock")
      }

      Section {
        PresetRow()
        TimePicker(title: "Bật lúc", time: $lights.on).accessibilityIdentifier("on")
        TimePicker(title: "Tắt lúc", time: $lights.off).accessibilityIdentifier("off")
        Stepper(value: $lights.ramp, in: 0...150, step: 5) {
          LabeledContent("Sáng dần, tối dần (phút)") { Text(verbatim: "\(lights.ramp)") }
        }
        .accessibilityIdentifier("ramp")
        ForEach(Array(lights.channels.enumerated()), id: \.offset) { i, c in
          Stepper(value: $lights.levels[i], in: 0...100, step: 5) {
            LabeledContent(c.title) { Text(verbatim: "\(lights.levels[i])%") }
          }
          .accessibilityIdentifier("level-\(i)")
        }
        HoursText(schedule: lights.form)
        Button("Ghi lịch vào đèn") { confirming = true }
          .disabled(!lights.canWrite)
          .accessibilityIdentifier("write")
      } header: {
        Text("Hẹn giờ bật tắt mỗi ngày")
      } footer: {
        Text("Ghi lịch mới sẽ xóa các lịch đang lưu trên đèn, kể cả lịch đặt bằng ứng dụng My Chihiros, và chỉnh giờ đèn theo máy này. Giờ tắt phải trong cùng ngày (muộn nhất 00:00). Cần đèn có firmware từ bản 20.")
      }

      Section {
        ForEach(Array(lights.channels.enumerated()), id: \.offset) { i, c in
          LevelSlider(id: "manual-\(i)", title: c.title, value: lights.manual[i]) { lights.setLevel(channel: i, level: $0) }
        }
      } header: {
        Text("Chỉnh tay")
      } footer: {
        Text("Kéo để đổi độ sáng ngay. Đèn chuyển sang chỉnh tay và bỏ qua lịch hẹn giờ cho tới khi bạn ghi lịch lại.")
      }

      Section {
        AboutText().font(.footnote).foregroundStyle(.secondary)
      }
    }
    .overlay { if lights.isBusy { ProgressView().controlSize(.large) } }
    .toolbar {
      Button("Ngắt kết nối") { lights.disconnect() }.accessibilityIdentifier("disconnect")
    }
    .alert("Lịch đang lưu trên đèn sẽ bị xóa và thay bằng lịch này. Ghi lịch?", isPresented: $confirming) {
      Button("Ghi lịch") { Task { await lights.writeSchedule() } }
      Button("Hủy", role: .cancel) {}
    }
  }
}

private struct SavedScheduleRow: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    LabeledContent("Lịch") {
      if let s = lights.saved {
        Text(s.summary)
      } else if lights.snapshot?.points.isEmpty ?? true {
        Text("Chưa có lịch")
      } else {
        Text("Lịch đặt bằng ứng dụng khác")
      }
    }
    .accessibilityIdentifier("saved")
  }
}

private struct ClockRow: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    if let c = lights.snapshot?.clock {
      VStack(alignment: .leading, spacing: 4) {
        LabeledContent("Giờ của đèn", value: c.isSet ? "\(c.time.description), \(Weekday.name(iso: c.weekday))" : String(localized: "chưa đặt"))
        if !c.isSet {
          Text("Đồng hồ trong đèn chưa được đặt, thường do mất điện. Đèn sẽ bật tắt sai giờ cho tới khi chỉnh lại.")
            .font(.footnote).foregroundStyle(Color.warning)
        } else if let off = lights.clockOff, off > 2 {
          Text("Đồng hồ trong đèn lệch \(off) phút so với điện thoại.")
            .font(.footnote).foregroundStyle(Color.warning)
        }
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("clock")
    }
  }
}

private struct PresetRow: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Chọn một mẫu hoặc tự nhập. Đèn tự bật tắt theo đồng hồ của nó, không cần điện thoại ở gần.")
        .font(.footnote).foregroundStyle(.secondary)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack {
          ForEach(Preset.all) { p in
            Button {
              lights.applyPreset(p)
            } label: {
              VStack(alignment: .leading) {
                Text(p.name).font(.subheadline.weight(.semibold))
                HStack(spacing: 0) { Text(verbatim: "\(p.on)–\(p.off) · "); Text("\(Int(Schedule.hoursLit(on: p.on, off: p.off))) tiếng, \(p.level)%") }
                  .font(.caption).foregroundStyle(.secondary)
              }
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("preset-\(p.id)")
          }
        }
      }
    }
  }
}

private struct HoursText: View {
  let schedule: Schedule

  var body: some View {
    Group {
      switch schedule.problem {
      case .offNotAfterOn?: Text("Giờ tắt phải sau giờ bật, trong cùng một ngày.").foregroundStyle(Color.warning)
      case .rampOutOfRange?: Text("Sáng dần, tối dần từ 0 đến 150 phút.").foregroundStyle(Color.warning)
      case .rampTooLong?: Text("Sáng dần, tối dần dài hơn nửa thời gian bật đèn.").foregroundStyle(Color.warning)
      case nil:
        let h = Double(schedule.minutesLit) / 60
        VStack(alignment: .leading) {
          Text("Đèn sáng \(h.formatted(.number.precision(.fractionLength(0...1)))) tiếng mỗi ngày.")
          if h > 8 { Text("Trên 8 tiếng dễ lên rêu.").foregroundStyle(Color.warning) }
        }
      }
    }
    .accessibilityIdentifier("hours")
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

/// Only a drag sends a level: the slider shows the model's value, so a row built again (scrolled back into view)
/// sends nothing.
private struct LevelSlider: View {
  let id: String
  let title: String
  let value: Int?
  let onChange: (Int) -> Void

  var body: some View {
    HStack {
      Text(title).frame(width: 90, alignment: .leading)
      Slider(value: Binding { Double(value ?? 70) } set: { v in if Int(v) != value { onChange(Int(v)) } }, in: 0...100, step: 1)
        .accessibilityIdentifier(id)
      Text(verbatim: value.map { "\($0)%" } ?? "–").monospacedDigit().frame(width: 48, alignment: .trailing)
        .accessibilityIdentifier("\(id)-level")
    }
  }
}

private struct NoticeText: View {
  let notice: LightsModel.Notice
  var body: some View {
    Text(notice.text)
      .foregroundStyle(notice.isError ? Color.warning : .primary)
      .accessibilityIdentifier("notice")
  }
}

private struct AboutText: View {
  var body: some View {
    Text("AquaTome không liên quan tới hãng Chihiros. Các lệnh Bluetooth theo ghi chép mã nguồn mở [chihiros-led-control](https://github.com/TheMicDiet/chihiros-led-control) (giấy phép MIT).")
  }
}

extension Channel {
  var title: String {
    switch self {
    case .red: String(localized: "Đỏ")
    case .green: String(localized: "Xanh lá")
    case .blue: String(localized: "Xanh dương")
    case .white: String(localized: "Trắng")
    }
  }
}

extension Schedule {
  /// "12:00–20:00 · 70% · ramp 30 min", in the app's language.
  var summary: String {
    String(localized: "\(on.description)–\(off.description) · \(levels.first ?? 0)% · sáng dần \(ramp) phút")
  }
}

enum Weekday {
  /// The weekday's name for an ISO weekday (1 Monday … 7 Sunday), in the app's language.
  static func name(iso: Int) -> String {
    let symbols = Calendar.current.weekdaySymbols // Sunday first
    return (1...7).contains(iso) ? symbols[iso % 7] : "?"
  }
}
