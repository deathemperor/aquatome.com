import Chihiros
import ChihirosBLE
import SwiftUI
import Tanks

/// The lights screen, as the site's Chihiros page (/vi/cong-cu/den-chihiros/): the light card, then the schedule, which
/// can be planned before any light is connected.
struct LightsView: View {
  @Environment(LightsModel.self) private var lights
  @Environment(\.scenePhase) private var phase
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    // At the largest text sizes a bar pinned to the bottom would leave little of the screen: the write bar goes after the
    // colour instead, where the site's sits on a wide screen.
    let pinned = !size.isAccessibilitySize
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 24) {
          LightCard()
          ScheduleSection()
          ColourSection().modifier(Panel())
          if !pinned { WriteBar(pinned: false) }
          SavedSchedules()
          VStack(alignment: .leading, spacing: 8) {
            Text("Ghi lịch mới sẽ xóa các lịch đang lưu trên đèn, kể cả lịch đặt bằng ứng dụng My Chihiros, và chỉnh giờ đèn theo máy này. Giờ tắt phải trong cùng ngày (muộn nhất 00:00). Cần đèn có firmware từ bản 20.")
            Text("Hỗ trợ các đèn Bluetooth có tên bắt đầu bằng DY: \(Model.supported.joined(separator: ", ")).")
            AboutText()
          }
          .font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 4)
        }
        .padding()
      }
      .background(Color(.systemGroupedBackground))
      .navigationTitle("Đèn Chihiros")
      // What just happened, and writing what is set, stay in view wherever the screen is scrolled (the site's write bar
      // is fixed to the bottom on a phone too).
      .safeAreaInset(edge: .bottom) { VStack(spacing: 0) { NoticeBar(); if pinned { WriteBar(pinned: true) } } }
      .overlay { if lights.isBusy { ProgressView().controlSize(.large) } }
      .onChange(of: phase) { if phase == .active { lights.checkBluetooth() } }
      // What happened is said aloud too, as the site's status line is (aria-live).
      .onChange(of: lights.notice) { if let n = lights.notice { AccessibilityNotification.Announcement(n.text).post() } }
      #if DEBUG
      .background {
        // The frames sent, for the UI tests to read (debug builds only).
        Text(verbatim: lights.sentFrames.joined(separator: " | ")).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("frames")
      }
      #endif
    }
  }
}

/// A block of the screen on its own background, like a grouped list's section.
private struct Panel: ViewModifier {
  func body(content: Content) -> some View {
    content
      .padding()
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
  }
}

// MARK: The light card

private struct LightCard: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    Group {
      switch lights.card {
      case .unsupported: UnsupportedCard()
      case .idle: IdleCard()
      case .connecting: BusyCard()
      case .ready: ReadyCard()
      }
    }
    .modifier(Panel())
  }
}

private struct UnsupportedCard: View {
  @Environment(LightsModel.self) private var lights
  @Environment(\.openURL) private var openURL

  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("Chưa kết nối được đèn").font(.title3.weight(.semibold))
      Text(lights.refused == .unsupported ? "Máy này không có Bluetooth." : "AquaTome chưa được dùng Bluetooth. Bật trong Cài đặt → AquaTome → Bluetooth.")
        .accessibilityIdentifier("unsupported")
      if lights.refused != .unsupported, let url = URL(string: UIApplication.openSettingsURLString) {
        Button("Mở Cài đặt") { openURL(url) }.buttonStyle(.bordered).accessibilityIdentifier("settings")
      }
      Text("Vẫn lập lịch được ở dưới: ứng dụng nhớ lịch trên máy này để ghi vào đèn sau.")
        .font(.footnote).foregroundStyle(.secondary)
    }
  }
}

private struct IdleCard: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let saved = lights.savedLights
    VStack(alignment: .leading, spacing: 12) {
      Group {
        if lights.isLost, let d = lights.device {
          Text("Mất kết nối với \(LightsModel.title(d))")
        } else if !saved.isEmpty {
          Text("Đèn đã lưu trên máy này")
        } else {
          Text("Kết nối đèn của bạn")
        }
      }
      .font(.title3.weight(.semibold))
      .accessibilityIdentifier("card-title")

      if saved.isEmpty || lights.isLost {
        VStack(alignment: .leading, spacing: 4) {
          ForEach(Array(Self.howTo.enumerated()), id: \.offset) { i, step in
            HStack(alignment: .firstTextBaseline, spacing: 6) { Text(verbatim: "\(i + 1).").monospacedDigit(); Text(step) }
          }
        }
        .font(.subheadline).foregroundStyle(.secondary)
      }

      ForEach(saved) { d in SavedLightRow(device: d) }

      Button {
        lights.isScanning ? lights.stopScan() : lights.scan()
      } label: {
        HStack {
          if lights.isScanning { Text("Đang tìm đèn…"); ProgressView() } else if saved.isEmpty { Text("Kết nối đèn") } else { Text("Kết nối đèn khác") }
        }
        .frame(maxWidth: .infinity)
      }
      .buttonStyle(.bordered)
      .tint(saved.isEmpty ? .accentColor : .primary)
      .controlSize(.large)
      .accessibilityIdentifier("scan")

      if !lights.found.isEmpty {
        Text("Đèn tìm thấy").font(.subheadline.weight(.semibold)).padding(.top, 4)
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
              Text("Kết nối đèn")
            }
          }
          .accessibilityIdentifier("light")
        }
      }
    }
  }

  private static let howTo: [LocalizedStringKey] = [
    "Cắm điện, bật đèn.",
    "Bật Bluetooth, đứng gần đèn.",
    "Đóng ứng dụng My Chihiros trên các điện thoại khác: đèn chỉ nhận một kết nối.",
  ]
}

private struct SavedLightRow: View {
  @Environment(LightsModel.self) private var lights
  let device: Device

  var body: some View {
    let again = lights.isLost && lights.device?.id == device.id
    HStack(alignment: .center) {
      VStack(alignment: .leading, spacing: 2) {
        Text(LightsModel.title(device)).font(.headline).accessibilityIdentifier("saved-name")
        Text(verbatim: meta).font(.caption).foregroundStyle(.secondary).accessibilityIdentifier("saved-meta")
        Button("Quên đèn này") { lights.forget(device) }
          .font(.caption).buttonStyle(.borderless).tint(.secondary)
          .frame(minHeight: 44).contentShape(Rectangle())
          .accessibilityLabel(Text("Quên đèn này") + Text(verbatim: ": \(LightsModel.title(device))"))
          .accessibilityIdentifier("forget")
      }
      Spacer()
      Button {
        Task { await lights.connect(saved: device) }
      } label: {
        Text(again ? "Kết nối lại" : "Kết nối")
      }
      .buttonStyle(.bordered)
      .controlSize(.large)
      .tint(again ? .accentColor : .primary)
      .accessibilityLabel((again ? Text("Kết nối lại") : Text("Kết nối")) + Text(verbatim: ": \(LightsModel.title(device))"))
      .accessibilityIdentifier("saved-light")
    }
    .padding(.vertical, 4)
  }

  /// "WRGB II Slim · lịch 13:00–19:00 · 40%".
  private var meta: String {
    let a = device.schedules.first { $0.id == device.activeScheduleId }
    return [device.model, a.map { String(localized: "lịch \(label($0))") }].compactMap { $0 }.joined(separator: " · ")
  }
}

private struct BusyCard: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(verbatim: lights.connecting ?? "").font(.title3.weight(.semibold))
      ProgressView().frame(maxWidth: .infinity)
      Button("Hủy") { lights.disconnect() }.buttonStyle(.bordered).controlSize(.large).accessibilityIdentifier("disconnect")
    }
  }
}

private struct ReadyCard: View {
  @Environment(LightsModel.self) private var lights
  @State private var name = ""
  @FocusState private var naming: Bool

  var body: some View {
    let d = lights.device
    VStack(alignment: .leading, spacing: 14) {
      if d?.activeScheduleId == nil { SetupSteps() }

      VStack(alignment: .leading, spacing: 2) {
        TextField("Tên đèn", text: $name)
          .font(.title3.weight(.semibold))
          .frame(minHeight: 44)
          .focused($naming)
          .submitLabel(.done)
          .onSubmit { naming = false }
          .accessibilityIdentifier("nickname")
        Text(verbatim: [d?.nickname == nil ? String(localized: "Bấm vào tên để đổi") : lights.model?.name, lights.firmware.map { "firmware \($0)" }]
          .compactMap { $0 }.joined(separator: " · "))
          .font(.caption).foregroundStyle(.secondary)
          .accessibilityIdentifier("light-meta")
      }
      .onAppear { name = d?.nickname ?? lights.model?.name ?? "" }
      .onChange(of: naming) {
        guard !naming else { return }
        lights.rename(name)
        name = lights.device?.nickname ?? lights.model?.name ?? "" // emptied: the model's name again
      }

      VStack(alignment: .leading, spacing: 10) {
        ClockFact()
        // Not during a test or the preview: the screen says what the light shows (the record is for a link that drops).
        if let m = d?.manual, !lights.trying, !lights.isPlaying {
          Fact(icon: "hand.raised", warn: true) {
            Text(m.levels.allSatisfy { $0 == 0 } ? "Đèn đang tắt bằng tay, không chạy theo lịch." : "Đèn đang chỉnh tay (\(m.levels.max() ?? 0)%), không chạy theo lịch.")
          }
          .accessibilityElement(children: .combine)
          .accessibilityIdentifier("hand")
        }
        ScheduleFact()
      }

      HStack(spacing: 8) {
        quick("Tắt đèn", id: "quick-off") { await lights.quick(off: true) }
        quick("Sáng hết", id: "quick-full") { await lights.quick(off: false) }
        quick("Theo lịch", id: "quick-auto") { await lights.backToSchedule() }
          .disabled(!lights.canGoBackToSchedule)
      }
      .disabled(lights.isBusy)
      .accessibilityElement(children: .contain)
      .accessibilityLabel("Bật tắt nhanh")

      HStack {
        Spacer()
        Button("Ngắt kết nối") { lights.disconnect() }
          .font(.footnote).buttonStyle(.borderless).tint(.secondary)
          .frame(minHeight: 44).contentShape(Rectangle())
          .accessibilityIdentifier("disconnect")
      }
    }
  }

  private func quick(_ title: LocalizedStringKey, id: String, _ action: @escaping () async -> Void) -> some View {
    Button { Task { await action() } } label: { Text(title).frame(maxWidth: .infinity) }
      .buttonStyle(.bordered)
      .controlSize(.large)
      .tint(.primary)
      .accessibilityIdentifier(id)
  }
}

/// A new light (nothing written to it from AquaTome yet): the four steps to set it up.
private struct SetupSteps: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    let steps: [(Bool, LocalizedStringKey)] = [
      (true, "Kết nối đèn"),
      (lights.clock == .right, "Chỉnh giờ đèn"),
      (lights.edited, "Chọn lịch và màu"),
      (false, "Ghi lịch vào đèn"),
    ]
    VStack(alignment: .leading, spacing: 6) {
      ForEach(Array(steps.enumerated()), id: \.offset) { _, step in
        HStack(spacing: 8) {
          Image(systemName: step.0 ? "checkmark.circle.fill" : "circle")
            .foregroundStyle(step.0 ? Color.accentColor : .secondary)
            .accessibilityHidden(true)
          Text(step.1).foregroundStyle(step.0 ? .primary : .secondary)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(step.0 ? Text(step.1) + Text(verbatim: " ") + Text("(xong)") : Text(step.1))
      }
    }
    .font(.subheadline)
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color.accentColor.opacity(0.08), in: RoundedRectangle(cornerRadius: 8))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("Cài đèn mới")
    .accessibilityIdentifier("steps")
  }
}

private struct Fact<Content: View>: View {
  let icon: String
  var warn = false
  @ViewBuilder let content: Content

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Image(systemName: icon).foregroundStyle(warn ? Color.warning : Color.accentColor).accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 6) { content }
    }
    .font(.subheadline)
    .foregroundStyle(warn ? Color.warning : .primary)
  }
}

private struct ClockFact: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    Group {
      if lights.clock == .right {
        Fact(icon: "checkmark") { Text("Đồng hồ đèn đúng giờ.").accessibilityIdentifier("clock") }
      } else {
        Fact(icon: "clock", warn: true) {
          Group {
            switch lights.clock {
            case .lost: Text("Đèn mất giờ, có thể do mất điện: lịch sẽ chạy sai giờ.")
            case .off(let d): Text("Đồng hồ đèn \(d > 0 ? String(localized: "nhanh") : String(localized: "chậm")) \(span(abs(d))): lịch sẽ chạy lệch.")
            default: Text("Chưa đọc được giờ của đèn.")
            }
          }
          .accessibilityIdentifier("clock")
          Button("Chỉnh giờ đèn theo máy này") { Task { await lights.syncClock() } }
            .buttonStyle(.bordered).controlSize(.large).tint(.primary).font(.subheadline)
            .disabled(lights.isBusy || lights.trying || lights.isPlaying)
            .accessibilityIdentifier("sync-clock")
        }
      }
    }
  }
}

/// What AquaTome wrote to the light, and when: never shown as what the light runs (it may have been changed since in the
/// My Chihiros app, and the light doesn't report it).
private struct ScheduleFact: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    Fact(icon: "calendar") {
      if let a = lights.active {
        Text("Lịch \(label(a)), sáng dần \(a.ramp) phút")
        Text("Ghi từ AquaTome ngày \(day(a.savedAt)).").font(.footnote).foregroundStyle(.secondary)
      } else {
        Text("Chưa ghi lịch nào từ AquaTome.")
        Text("Lịch đặt bằng ứng dụng My Chihiros (nếu có) vẫn chạy; đèn không cho đọc lại lịch đó.").font(.footnote).foregroundStyle(.secondary)
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("saved")
  }
}

// MARK: The schedule

private struct ScheduleSection: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Lịch mỗi ngày").font(.title3.weight(.semibold))
      Text("Chọn kiểu bể để có lịch gợi ý, rồi kéo giờ bật, giờ tắt trên thanh ngày. Đèn tự bật tắt theo đồng hồ của nó, không cần điện thoại ở gần.")
        .font(.footnote).foregroundStyle(.secondary)
      PresetGrid()
      TankScene()
      Timeline().padding(.top, 8)
      Readout(schedule: lights.form)
      PreviewButton()
      ScheduleFields()
    }
    .modifier(Panel())
  }
}

/// Writing the schedule and colour to the light (the site's write bar): what will be written, the button, and why it
/// can't be yet. Pinned to the bottom of the screen, or in line with the rest at the largest text sizes.
private struct WriteBar: View {
  @Environment(LightsModel.self) private var lights
  let pinned: Bool
  @State private var confirming = false

  var body: some View {
    let f = lights.form
    let row = pinned ? AnyLayout(HStackLayout(spacing: 12)) : AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
    let content = VStack(alignment: .leading, spacing: 4) {
      row {
        Text(verbatim: f.problem == nil ? summary(f) : "")
          .font(.subheadline.weight(.semibold)).monospacedDigit()
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("summary")
        Button {
          if lights.writeNeedsConfirming { confirming = true } else { Task { await lights.writeSchedule() } }
        } label: {
          Text(lights.formIsActive ? "Đèn đang dùng lịch này" : lights.isWriting ? "Đang ghi…" : "Ghi lịch vào đèn")
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .layoutPriority(1) // its words on one line where they fit; the summary wraps first
        .disabled(!lights.canWrite)
        .accessibilityIdentifier("write")
      }
      if !lights.isConnected {
        Text("Kết nối đèn để ghi lịch. Lịch này được nhớ trên máy.").font(.footnote).foregroundStyle(.secondary)
      } else if let fw = lights.firmware, fw < 20 {
        Text("Firmware của đèn chưa hẹn giờ được từ ứng dụng. Cập nhật firmware bằng ứng dụng My Chihiros.").font(.footnote).foregroundStyle(Color.warning)
      }
    }
    Group {
      if pinned {
        content
          .padding(.horizontal)
          .padding(.vertical, 10)
          .frame(maxWidth: .infinity, alignment: .leading)
          .background(.bar)
          .overlay(alignment: .top) { Divider() }
      } else {
        content.modifier(Panel())
      }
    }
    .alert("Lịch đang lưu trên đèn, kể cả lịch đặt bằng ứng dụng My Chihiros, sẽ bị thay bằng lịch này. Ghi lịch?", isPresented: $confirming) {
      Button("Ghi lịch") { Task { await lights.writeSchedule() } }
      Button("Hủy", role: .cancel) {}
    }
  }

  /// "12:00–20:00 · 70% · 8 tiếng", as the site's.
  private func summary(_ s: Schedule) -> String {
    label(s) + " · " + String(localized: "\(s.hoursOn.formatted(.number.precision(.fractionLength(0...1)))) tiếng")
  }
}

/// The schedules written to this light from AquaTome, here or on the site (the site's "Lịch đã ghi cho đèn này"): the
/// last one written is in use, and any other opens in the form again to be written.
private struct SavedSchedules: View {
  @Environment(LightsModel.self) private var lights
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    let list = lights.savedSchedules
    // The button beside each schedule; under it at the largest text sizes.
    let row = size.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8)) : AnyLayout(HStackLayout(spacing: 12))
    if !list.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        Text("Lịch đã ghi cho đèn này").font(.title3.weight(.semibold)).accessibilityAddTraits(.isHeader).padding(.bottom, 4)
        ForEach(list) { s in
          row {
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: label(s)).font(.subheadline.weight(.semibold)).monospacedDigit()
              Text(verbatim: meta(s)).font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("saved-schedule")
            if s.id == lights.device?.activeScheduleId {
              Text("Đang dùng").font(.footnote.weight(.semibold)).foregroundStyle(Color.accentColor)
                .accessibilityIdentifier("in-use")
            } else {
              Button("Dùng lại") { lights.useSaved(s) }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .tint(.primary)
                .accessibilityLabel(Text("Dùng lại") + Text(verbatim: ": \(label(s))"))
                .accessibilityIdentifier("reuse")
            }
          }
          .padding(.vertical, 8)
          if s.id != list.last?.id { Divider() }
        }
      }
      .modifier(Panel())
    }
  }

  /// "Bể mới trồng · sáng dần 30 phút · 1/11/2026".
  private func meta(_ s: SavedSchedule) -> String {
    [s.name.flatMap { $0.isEmpty ? nil : $0 }, String(localized: "sáng dần \(s.ramp) phút"), day(s.savedAt)].compactMap { $0 }.joined(separator: " · ")
  }
}

// MARK: What just happened

private struct NoticeBar: View {
  @Environment(LightsModel.self) private var lights

  var body: some View {
    if let n = lights.notice {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        Text(n.text)
          .foregroundStyle(n.isError ? Color.warning : .primary)
          .frame(maxWidth: .infinity, alignment: .leading)
          .accessibilityIdentifier("notice")
        if let a = n.action {
          Button {
            Task { a == .undo ? await lights.undoWrite() : await lights.reconnect() }
          } label: {
            Text(a == .undo ? "Hoàn tác" : "Kết nối lại")
          }
          .buttonStyle(.bordered)
          .controlSize(.large)
          .disabled(lights.isBusy)
          .accessibilityIdentifier("notice-action")
        }
      }
      .font(.callout)
      .padding(.horizontal)
      .padding(.vertical, 10)
      .background(.bar)
    }
  }
}

private struct AboutText: View {
  var body: some View {
    Text("AquaTome không liên quan tới hãng Chihiros. Các lệnh Bluetooth theo ghi chép mã nguồn mở [chihiros-led-control](https://github.com/TheMicDiet/chihiros-led-control) (giấy phép MIT).")
  }
}

// MARK: Words

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

/// A saved schedule as the site labels it: "13:00–19:00 · 40%" (its brightest channel).
func label(_ s: SavedSchedule) -> String { "\(s.on)–\(s.off) · \(s.levels.max() ?? 0)%" }

/// The schedule being edited, labelled the same way.
func label(_ s: Schedule) -> String { "\(s.on)–\(s.off) · \(s.top)%" }

/// A day as the reader's language writes it (1/11/2026).
private func day(_ timestamp: String) -> String {
  guard let ms = Timestamp.millis(timestamp) else { return "" }
  return Date(timeIntervalSince1970: Double(ms) / 1000).formatted(.dateTime.day().month(.defaultDigits).year())
}

/// "40 phút", "7 tiếng", "1,5 tiếng".
private func span(_ minutes: Int) -> String {
  minutes < 60 ? String(localized: "\(minutes) phút")
    : String(localized: "\((Double(minutes) / 60 * 10).rounded() / 10, format: .number.precision(.fractionLength(0...1))) tiếng")
}
