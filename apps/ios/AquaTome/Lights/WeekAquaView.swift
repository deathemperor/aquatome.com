import Chihiros
import ChihirosBLE
import SwiftUI
import Tanks
import WeekAqua

/// The Đèn tab's way to its Week Aqua screen, at the top of the Chihiros one.
struct WeekAquaEntry: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let wa = lights.weekAqua
    Button { wa.isOpen = true } label: {
      HStack(spacing: 12) {
        Image(systemName: "lightbulb.2").font(.title3).foregroundStyle(.tint).accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text("Đèn Week Aqua").font(.headline).foregroundStyle(.primary)
          Group {
            if wa.isConnected { Text("\(wa.group.count) đèn đang kết nối") } else { Text("Màu, hẹn giờ bật tắt và giờ đèn, cho đèn mã 5746") }
          }
          .font(.subheadline).foregroundStyle(.secondary)
        }
        Spacer()
        Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary).accessibilityHidden(true)
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("weekaqua")
  }
}

/// Week Aqua lights: find, connect one or a group, colour, daily timer, clock. They report nothing back, so the screen
/// shows what AquaTome last sent them.
struct WeekAquaView: View {
  @Environment(LightsModel.self) private var lights
  @State private var confirming = false

  var body: some View {
    let wa = lights.weekAqua
    ScrollView {
      VStack(alignment: .leading, spacing: 24) {
        WeekAquaCard().modifier(Panel())
        WeekAquaColour().modifier(Panel())
        WeekAquaTimer().modifier(Panel())
        WeekAquaClock().modifier(Panel())
        VStack(alignment: .leading, spacing: 8) {
          Text("AquaTome chỉ ghi vào đèn Week Aqua mã 5746. Đèn mã khác vẫn được liệt kê, nhưng không nhận gì từ ứng dụng. Đóng ứng dụng WEEK AQUA trước khi kết nối: mỗi đèn chỉ cho một máy kết nối.")
          Text("AquaTome không liên quan tới hãng Week Aqua. Các lệnh và màu có sẵn theo mã nguồn mở [ha-weekaqua](https://github.com/alokauz/ha-weekaqua) (giấy phép MIT) và những gì đèn đã nhận khi thử.")
        }
        .font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 4)
      }
      .padding()
    }
    .background(Color(.systemGroupedBackground))
    .navigationTitle("Đèn Week Aqua")
    .safeAreaInset(edge: .bottom) { WeekAquaBar(confirming: $confirming) }
    .alert("Ghi vào đèn?", isPresented: $confirming) {
      Button("Ghi màu và giờ") { Task { await wa.write() } }
      Button("Hủy", role: .cancel) {}
    } message: {
      Text("Lần ghi đầu từ AquaTome thay màu và hẹn giờ đang có trên đèn, kể cả đặt bằng ứng dụng WEEK AQUA.")
    }
    .overlay { if wa.isWriting || wa.isConnecting { ProgressView().controlSize(.large) } }
    .onChange(of: wa.notice) { if let n = wa.notice { AccessibilityNotification.Announcement(n.text).post() } }
    #if DEBUG
    .background {
      // The frames sent, for the UI tests to read (debug builds only).
      Text(verbatim: wa.sentFrames.joined(separator: " | ")).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("wa-frames")
    }
    #endif
  }
}

// MARK: The lights

private struct WeekAquaCard: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let wa = lights.weekAqua
    VStack(alignment: .leading, spacing: 12) {
      if wa.isConnected {
        Connected()
      } else if wa.isConnecting {
        HStack(spacing: 12) { ProgressView(); Text("Đang kết nối…") }.font(.title3.weight(.semibold))
        Button("Hủy") { wa.disconnect() }.buttonStyle(.bordered).controlSize(.large).accessibilityIdentifier("wa-disconnect")
      } else {
        Finding()
      }
      Text("Đèn Week Aqua không báo lại gì: AquaTome không đọc được màu hay hẹn giờ đèn đang chạy, chỉ biết những gì nó đã gửi.")
        .font(.footnote).foregroundStyle(.secondary)
        .accessibilityIdentifier("wa-no-report")
    }
  }
}

private struct Connected: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let wa = lights.weekAqua
    Text("\(wa.group.count) đèn đang kết nối").font(.title3.weight(.semibold)).accessibilityIdentifier("wa-title")
    ForEach(wa.group) { l in
      Label { Text(verbatim: "\(l.name) · …\(String(WeekAquaModel.key(l).address.suffix(4)))") } icon: { Image(systemName: "lightbulb") }
        .font(.subheadline)
    }
    Group {
      if let s = wa.lastSent {
        Text("Lần gửi cuối từ AquaTome: \(WeekAquaModel.label(s)), \(WeekAquaModel.day(s.at)).")
      } else {
        Text("AquaTome chưa gửi gì tới các đèn này.")
      }
    }
    .accessibilityIdentifier("wa-last-sent")
    if wa.sentDiffers {
      Text("Các đèn trong nhóm không cùng lần gửi cuối. Lần ghi tới sẽ đặt chúng như nhau.").font(.footnote).foregroundStyle(Color.warning)
    }
    Button("Ngắt kết nối") { wa.disconnect() }.buttonStyle(.bordered).controlSize(.large).accessibilityIdentifier("wa-disconnect")
  }
}

private struct Finding: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let wa = lights.weekAqua
    let saved = wa.savedGroups
    Group { if saved.isEmpty { Text("Kết nối đèn Week Aqua") } else { Text("Đèn đã lưu trên máy này") } }
      .font(.title3.weight(.semibold))
    ForEach(saved) { g in
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: "\(g.tank.name) · ") + Text("\(g.lights.count) đèn")
          if let s = g.lights.compactMap(\.lastSent).max(by: { $0.at < $1.at }) {
            Text(verbatim: WeekAquaModel.label(s)).font(.caption).foregroundStyle(.secondary)
          }
        }
        Spacer()
        Button("Kết nối") { Task { await wa.connect(saved: g.lights) } }.buttonStyle(.bordered).accessibilityIdentifier("wa-saved")
      }
    }
    Text("Bật các đèn, rồi tìm. Chọn một đèn, hoặc mọi đèn của một nhóm: AquaTome ghi vào cả nhóm cùng lúc.")
      .font(.subheadline).foregroundStyle(.secondary)
    Button {
      wa.isScanning ? wa.stopScan() : wa.scan()
    } label: {
      HStack { if wa.isScanning { Text("Đang tìm đèn…"); ProgressView() } else { Text("Tìm đèn") } }.frame(maxWidth: .infinity)
    }
    .buttonStyle(.bordered)
    .controlSize(.large)
    .accessibilityIdentifier("wa-scan")
    ForEach(wa.found) { l in FoundRow(light: l) }
    if !wa.found.isEmpty {
      Button { Task { await wa.connectChosen() } } label: {
        Text("Kết nối \(wa.chosen.count) đèn").frame(maxWidth: .infinity)
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.large)
      .disabled(wa.chosen.isEmpty)
      .accessibilityIdentifier("wa-connect")
    }
  }
}

/// A light found: a 5746 one can be chosen for the group; another code is listed as not supported, and can't be.
private struct FoundRow: View {
  let light: FoundLight
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let wa = lights.weekAqua
    let advert = light.weekAqua
    let tail = advert?.addressText.map { " · …\($0.suffix(4))" } ?? ""
    if advert?.isSupported == true {
      let chosen = wa.chosen.contains(light.id)
      Button { wa.toggle(light) } label: {
        HStack {
          Image(systemName: chosen ? "checkmark.circle.fill" : "circle").foregroundStyle(.tint).accessibilityHidden(true)
          VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: light.name).foregroundStyle(.primary)
            Text(verbatim: "5746\(tail)").font(.caption).foregroundStyle(.secondary)
          }
          Spacer()
        }
        .contentShape(Rectangle())
      }
      .buttonStyle(.plain)
      .frame(minHeight: 44)
      .accessibilityAddTraits(chosen ? .isSelected : [])
      .accessibilityIdentifier("wa-light")
    } else {
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: light.name)
        Group {
          if let code = advert?.code { Text("Mã \(code): chưa hỗ trợ, AquaTome không gửi gì tới đèn này.") } else {
            Text("Không rõ mã đèn: chưa hỗ trợ, AquaTome không gửi gì tới đèn này.")
          }
        }
        .font(.caption).foregroundStyle(.secondary)
      }
      .foregroundStyle(.secondary)
      .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("wa-unsupported")
    }
  }
}

// MARK: Colour

private struct WeekAquaColour: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let wa = lights.weekAqua
    VStack(alignment: .leading, spacing: 12) {
      Text("Màu và độ sáng").font(.title3.weight(.semibold))
      Text("Màu có sẵn của WEEK AQUA").font(.subheadline).foregroundStyle(.secondary)
      // Not lazy: every preset is there to VoiceOver and the tests wherever the screen is scrolled.
      Grid(horizontalSpacing: 8, verticalSpacing: 8) {
        ForEach(Array(stride(from: 0, to: WeekAquaPreset.all.count, by: 3)), id: \.self) { row in
          GridRow { ForEach(WeekAquaPreset.all[row..<min(row + 3, WeekAquaPreset.all.count)]) { p in PresetButton(preset: p) } }
        }
      }
      ChannelSlider(id: "wa-brightness", title: String(localized: "Độ sáng"), swatch: nil, value: wa.brightness) { wa.brightness = $0 }
      Text("Từng màu, ở độ sáng hết cỡ").font(.subheadline).foregroundStyle(.secondary)
      ForEach(Array(Self.channels.enumerated()), id: \.offset) { i, c in
        ChannelSlider(id: "wa-\(c.id)", title: c.title, swatch: c.swatch, value: wa.percent(i)) { wa.setChannel(i, percent: $0) }
      }
      let l = wa.levels
      Text("Sẽ gửi: đỏ \(l.red), xanh lá \(l.green), xanh dương \(l.blue), UV \(l.uv), trên thang 235.")
        .font(.footnote).foregroundStyle(.secondary).accessibilityIdentifier("wa-levels")
    }
  }

  private static let channels: [(id: String, title: String, swatch: Color)] = [
    ("red", String(localized: "Đỏ"), Channel.red.swatch), ("green", String(localized: "Xanh lá"), Channel.green.swatch),
    ("blue", String(localized: "Xanh dương"), Channel.blue.swatch), ("uv", "UV", Color(red: 0x7b / 255, green: 0x4f / 255, blue: 0xc9 / 255)),
  ]
}

/// One of WEEK AQUA's presets, marked when the colour is it.
private struct PresetButton: View {
  let preset: WeekAquaPreset
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let wa = lights.weekAqua
    let chosen = wa.preset == preset.id
    Button { wa.choose(preset) } label: { Text(verbatim: WeekAquaModel.presetName(preset.id)).frame(maxWidth: .infinity, minHeight: 32) }
      .buttonStyle(.bordered)
      .tint(chosen ? .accentColor : .secondary)
      .accessibilityAddTraits(chosen ? .isSelected : [])
      .accessibilityIdentifier("wa-preset-\(preset.id)")
  }
}

// MARK: Timer

private struct WeekAquaTimer: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    @Bindable var wa = lights.weekAqua
    VStack(alignment: .leading, spacing: 12) {
      Text("Hẹn giờ bật tắt").font(.title3.weight(.semibold))
      TimeRow(title: "Bật lúc", time: $wa.on, id: "wa-on")
      TimeRow(title: "Tắt lúc", time: $wa.off, id: "wa-off")
      let m = wa.timer.minutesOn
      Group {
        if m == 0 {
          Text("Bật và tắt cùng giờ: đèn sáng cả ngày.")
        } else if m % 60 == 0 {
          Text("Đèn sáng \(m / 60) tiếng mỗi ngày.")
        } else {
          Text("Đèn sáng \(m / 60) tiếng \(m % 60) phút mỗi ngày.")
        }
      }
      .accessibilityIdentifier("wa-hours")
      Text("Giờ tắt có thể trước giờ bật: đèn sáng qua nửa đêm.").font(.footnote).foregroundStyle(.secondary)
    }
  }
}

/// A time of day as an hour and a minute, each picked from a menu (minutes 5 apart, and the one set if it isn't).
private struct TimeRow: View {
  let title: LocalizedStringKey
  @Binding var time: TimeOfDay
  let id: String

  var body: some View {
    let minutes = Array(Set(stride(from: 0, to: 60, by: 5)).union([time.minute])).sorted()
    HStack {
      Text(title)
      Spacer()
      Picker("Giờ", selection: Binding { time.hour } set: { time = TimeOfDay(hour: $0, minute: time.minute) }) {
        ForEach(0..<24, id: \.self) { Text(verbatim: String(format: "%02d", $0)).tag($0) }
      }
      .pickerStyle(.menu)
      .accessibilityIdentifier("\(id)-hour")
      Text(verbatim: ":").accessibilityHidden(true)
      Picker("Phút", selection: Binding { time.minute } set: { time = TimeOfDay(hour: time.hour, minute: $0) }) {
        ForEach(minutes, id: \.self) { Text(verbatim: String(format: "%02d", $0)).tag($0) }
      }
      .pickerStyle(.menu)
      .accessibilityIdentifier("\(id)-minute")
    }
    .frame(minHeight: 44)
  }
}

// MARK: Clock

private struct WeekAquaClock: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let wa = lights.weekAqua
    VStack(alignment: .leading, spacing: 12) {
      Text("Giờ của đèn").font(.title3.weight(.semibold))
      Text("Đèn bật tắt theo đồng hồ của nó, mà nó không báo lại; mất điện có thể làm lệch. Mỗi lần ghi đều chỉnh đồng hồ đèn theo máy này.")
        .font(.subheadline).foregroundStyle(.secondary)
      Button { Task { await wa.setClock() } } label: { Text("Chỉnh giờ đèn theo máy này").frame(maxWidth: .infinity) }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .disabled(!wa.canSetClock)
        .accessibilityIdentifier("wa-clock")
      if wa.isConnected && wa.lastSent == nil {
        Text("Ghi màu và hẹn giờ trước: đèn chỉ nhận giờ cùng màu và hẹn giờ, theo thứ tự nó nhận.")
          .font(.footnote).foregroundStyle(.secondary)
      } else if wa.isConnected, let at = wa.devices.compactMap(\.clockSyncedAt).max() {
        Text("Chỉnh giờ lần cuối: \(WeekAquaModel.day(at)).").font(.footnote).foregroundStyle(.secondary).accessibilityIdentifier("wa-clock-at")
      }
    }
  }
}

// MARK: Writing

/// What happened, and writing the form, in view wherever the screen is scrolled.
private struct WeekAquaBar: View {
  @Binding var confirming: Bool
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let wa = lights.weekAqua
    VStack(alignment: .leading, spacing: 10) {
      if let n = wa.notice {
        Text(n.text)
          .font(.callout)
          .foregroundStyle(n.isError ? Color.warning : .primary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("wa-notice")
      }
      Button {
        if wa.writeNeedsConfirming { confirming = true } else { Task { await wa.write() } }
      } label: {
        Group {
          if wa.isConnected { Text("Ghi màu và hẹn giờ vào \(wa.group.count) đèn") } else { Text("Kết nối đèn để ghi") }
        }
        .frame(maxWidth: .infinity)
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.large)
      .disabled(!wa.canWrite)
      .accessibilityIdentifier("wa-write")
    }
    .padding(.horizontal)
    .padding(.vertical, 10)
    .background(.bar)
  }
}
