import Plugs
import SwiftUI
import Tanks

/// The master button's settings (Design Lead's master/spec.md): its name, what each device does when it's pressed, what
/// ends it, and deleting it. iOS's grouped list in a sheet; nothing is kept until Xong.
struct MasterSheet: View {
  @Environment(MasterModel.self) private var master
  @Environment(TanksModel.self) private var tanks
  @Environment(PlugsModel.self) private var plugs
  @Environment(LightsModel.self) private var lights
  @Environment(\.dismiss) private var dismiss
  @State private var draft: MasterButton
  @State private var path: [Screen] = []
  @State private var confirmingDelete = false
  private let isNew: Bool

  enum Screen: Hashable {
    case step(DeviceTarget)
    case add
  }

  init(button: MasterButton?) {
    _draft = State(initialValue: button ?? MasterButton(name: MasterModel.defaultName))
    isNew = button == nil
  }

  var body: some View {
    NavigationStack(path: $path) {
      Form {
        Section("Tên") {
          TextField(MasterModel.defaultName, text: $draft.name).accessibilityIdentifier("master-name-field")
        }
        Section {
          ForEach(draft.steps, id: \.target) { s in
            NavigationLink(value: Screen.step(s.target)) { StepRow(step: s) }
              .accessibilityIdentifier("master-step-\(s.isLamp ? "lamp" : master.switcher.name(s))")
          }
          .onDelete { draft.steps.remove(atOffsets: $0) }
          NavigationLink(value: Screen.add) {
            Label { Text("Thêm thiết bị") } icon: { Image(systemName: "plus") }.foregroundStyle(Color.accentColor)
          }
          .accessibilityIdentifier("master-add")
        } header: {
          Text("Khi bấm")
        } footer: {
          if co2On {
            Label { Text("CO2 bật ngoài giờ đèn sáng (\(lights.on.description)–\(lights.off.description)): cây không dùng hết, cá có thể thiếu khí.") }
              icon: { Image(systemName: "exclamationmark.triangle.fill") }
              .foregroundStyle(.orange)
              .accessibilityIdentifier("master-co2-warning")
          }
        }
        Section {
          ForEach([60, 120, nil] as [Int?], id: \.self) { m in
            Button { draft.minutes = m } label: {
              HStack {
                Text(verbatim: m.map { String(localized: "Sau \($0 / 60) giờ") } ?? String(localized: "Khi tôi bấm Kết thúc")).foregroundStyle(.primary)
                Spacer()
                if draft.minutes == m { Image(systemName: "checkmark").foregroundStyle(Color.accentColor).accessibilityHidden(true) }
              }
            }
            .accessibilityAddTraits(draft.minutes == m ? .isSelected : [])
            .accessibilityIdentifier("master-end-\(m.map { String($0) } ?? "tap")")
          }
        } header: {
          Text("Kết thúc")
        } footer: {
          Text("Khi kết thúc, ổ cắm có hẹn giờ tự trở lại. Đèn và phần còn lại do điện thoại trả lại: cần ở gần đèn.")
        }
        if !isNew {
          Section {
            Button(role: .destructive) { confirmingDelete = true } label: { Text("Xóa nút").frame(maxWidth: .infinity) }
              .accessibilityIdentifier("master-delete")
              .confirmationDialog(String(localized: "Xóa nút “\(draft.name)”?"), isPresented: $confirmingDelete, titleVisibility: .visible) {
                Button("Xóa nút", role: .destructive) {
                  master.delete()
                  dismiss()
                }
              }
          }
        }
      }
      .navigationTitle("Nút tổng")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Xong") {
            var b = draft
            let name = b.name.trimmingCharacters(in: .whitespacesAndNewlines)
            b.name = name.isEmpty ? MasterModel.defaultName : String(name.prefix(40))
            master.save(b)
            dismiss()
          }
          .bold()
          .disabled(draft.steps.isEmpty)
          .accessibilityIdentifier("master-done")
        }
      }
      .navigationDestination(for: Screen.self) { screen in
        switch screen {
        case .step(let t): StepChoice(draft: $draft, target: t)
        case .add: AddDevice(draft: $draft, path: $path)
        }
      }
    }
    .task { await plugs.refresh() }
  }

  /// A step turns on an outlet that powers CO2.
  private var co2On: Bool {
    draft.steps.contains { s in s.on && s.outlet != nil && master.role(s) == "co2" }
  }
}

/// A step in the list: the device's square, its name, and what it does.
private struct StepRow: View {
  @Environment(MasterModel.self) private var master
  let step: DeviceCommand

  var body: some View {
    HStack(spacing: 12) {
      DeviceSquare(lamp: step.isLamp)
      VStack(alignment: .leading, spacing: 2) {
        Text(verbatim: master.switcher.name(step))
        Text(verbatim: Self.does(step)).font(.subheadline).foregroundStyle(.secondary)
      }
    }
  }

  /// "Bật · Trắng", "Tắt"; "Ổ cắm · Bật".
  static func does(_ s: DeviceCommand) -> String {
    let state = s.on ? String(localized: "Bật") : String(localized: "Tắt")
    if !s.isLamp { return String(localized: "Ổ cắm") + " · " + state }
    return [state, s.colour.map(LampColour.name)].compactMap { $0 }.joined(separator: " · ")
  }
}

/// The device's icon in its 30-point square: the lamp in the tint, an outlet in grey.
private struct DeviceSquare: View {
  let lamp: Bool
  var body: some View {
    Image(systemName: lamp ? "lightbulb.fill" : "power")
      .font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
      .frame(width: 30, height: 30)
      .background(lamp ? Color.accentColor : Color(.systemGray), in: RoundedRectangle(cornerRadius: 7))
      .accessibilityHidden(true)
  }
}

/// What one device does when the button is pressed. Turning off a filter, a heater or an air pump asks again.
private struct StepChoice: View {
  @Environment(MasterModel.self) private var master
  @Binding var draft: MasterButton
  let target: DeviceTarget
  @State private var asking = false

  var body: some View {
    if let i = draft.steps.firstIndex(where: { $0.target == target }) {
      let s = draft.steps[i]
      Form {
        Section(master.switcher.name(s)) {
          if s.isLamp {
            row(String(localized: "Bật"), chosen: s.on && s.colour == nil) { set(on: true, colour: nil) }
            row(String(localized: "Tắt"), chosen: !s.on) { set(on: false, colour: nil) }
          } else {
            row(String(localized: "Bật"), chosen: s.on) { set(on: true, colour: nil) }
            row(String(localized: "Tắt"), chosen: !s.on) {
              if MasterModel.asksAgain.contains(master.role(s) ?? "") { asking = true } else { set(on: false, colour: nil) }
            }
          }
        }
        if s.isLamp {
          Section("Bật với màu") {
            ForEach(DeviceCommand.colours, id: \.self) { c in
              row(LampColour.name(c), swatch: LampColour.look(c), chosen: s.on && s.colour == c) { set(on: true, colour: c) }
            }
          }
        }
      }
      .navigationTitle(s.isLamp ? String(localized: "Đèn") : String(localized: "Ổ cắm"))
      .navigationBarTitleDisplayMode(.inline)
      .confirmationDialog(MasterModel.secondAsk(master.role(s)).title, isPresented: $asking, titleVisibility: .visible) {
        Button(MasterModel.secondAsk(master.role(s)).yes, role: .destructive) { set(on: false, colour: nil) }
          .accessibilityIdentifier("master-turn-off-anyway")
        Button("Hủy", role: .cancel) {}
      } message: {
        Text(verbatim: MasterModel.secondAsk(master.role(s)).why)
      }
    }
  }

  private func set(on: Bool, colour: String?) {
    guard let i = draft.steps.firstIndex(where: { $0.target == target }) else { return }
    draft.steps[i].on = on
    draft.steps[i].colour = colour
  }

  private func row(_ title: String, swatch: Color? = nil, chosen: Bool, _ pick: @escaping () -> Void) -> some View {
    Button(action: pick) {
      HStack(spacing: 12) {
        if let swatch { Circle().fill(swatch).frame(width: 22, height: 22).overlay { Circle().strokeBorder(.primary.opacity(0.3)) } }
        Text(verbatim: title).foregroundStyle(.primary)
        Spacer()
        if chosen { Image(systemName: "checkmark").foregroundStyle(Color.accentColor).accessibilityHidden(true) }
      }
    }
    .accessibilityAddTraits(chosen ? .isSelected : [])
    .accessibilityIdentifier("master-choice-\(title)")
  }
}

/// "Thêm thiết bị": the Love Ecology lamp and the Tuya plugs' outlets on the reader's tanks, those not in the button yet.
private struct AddDevice: View {
  @Environment(MasterModel.self) private var master
  @Environment(TanksModel.self) private var tanks
  @Binding var draft: MasterButton
  @Binding var path: [MasterSheet.Screen]

  var body: some View {
    let taken = Set(draft.steps.map(\.target))
    let lampFree = tanks.store.loveEcology.map { !taken.contains(DeviceTarget(device: $0.id, outlet: nil)) } ?? true
    let outlets = master.outlets().filter { !taken.contains($0.target) }
    Form {
      if lampFree {
        Section("Đèn") {
          Button { addLamp() } label: {
            HStack(spacing: 12) { DeviceSquare(lamp: true); Text("Đèn Love Ecology").foregroundStyle(.primary) }
          }
          .accessibilityIdentifier("master-add-lamp")
        }
      }
      Section {
        ForEach(outlets, id: \.target) { o in
          Button { add(DeviceCommand(device: o.target.device, outlet: o.target.outlet, on: o.role != "fan")) } label: {
            HStack(spacing: 12) {
              DeviceSquare(lamp: false)
              VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: o.name).foregroundStyle(.primary)
                Text(verbatim: o.place).font(.subheadline).foregroundStyle(.secondary)
              }
            }
          }
          .accessibilityIdentifier("master-add-\(o.name)")
        }
      } header: {
        Text("Ổ cắm")
      } footer: {
        if outlets.isEmpty { Text("Thêm ổ cắm Tuya vào bể trong Bể của tôi để chọn ở đây.") }
      }
    }
    .navigationTitle("Thêm thiết bị")
    .navigationBarTitleDisplayMode(.inline)
  }

  private func addLamp() {
    guard let d = tanks.keepLoveEcology() else { return }
    add(DeviceCommand(device: d.id, on: true, colour: "white"))
  }

  private func add(_ c: DeviceCommand) {
    draft.steps.append(c)
    path.removeAll()
  }
}

/// The lamp's recorded colours, as its card names and shows them.
enum LampColour {
  static func name(_ id: String) -> String {
    switch id {
    case "white": String(localized: "Trắng")
    case "red": String(localized: "Đỏ")
    case "orange": String(localized: "Cam")
    case "yellow": String(localized: "Vàng")
    case "green": String(localized: "Xanh lá")
    case "cyan": String(localized: "Xanh lơ")
    case "blue": String(localized: "Xanh dương")
    case "magenta": String(localized: "Hồng tím")
    default: id
    }
  }

  static func look(_ id: String) -> Color {
    let hue: [String: Double] = ["red": 0, "orange": 30, "yellow": 60, "green": 120, "cyan": 180, "blue": 240, "magenta": 300]
    return hue[id].map { Color(hue: $0 / 360, saturation: 1, brightness: 1) } ?? .white
  }
}

extension MasterModel {
  /// Turning these off asks a second time: a filter, a heater or an air pump off for long can harm the fish.
  static let asksAgain: Set = ["filter", "heater", "air"]

  /// The outlet's role, from its record.
  func role(_ c: DeviceCommand) -> String? {
    guard let code = c.outlet else { return nil }
    return switcher.tanks.store.device(c.device)?.outlets.first { $0.code == code }?.role
  }

  static func secondAsk(_ role: String?) -> (title: String, why: String, yes: String) {
    switch role {
    case "heater": (String(localized: "Tắt sưởi trong lúc chạy nút?"),
                    String(localized: "Nước có thể lạnh đi khi sưởi tắt lâu. Nút sẽ bật lại sưởi khi kết thúc."),
                    String(localized: "Vẫn tắt sưởi"))
    case "air": (String(localized: "Tắt sủi khí trong lúc chạy nút?"),
                 String(localized: "Nước có thể thiếu khí, nhất là ban đêm. Nút sẽ bật lại sủi khí khi kết thúc."),
                 String(localized: "Vẫn tắt sủi khí"))
    default: (String(localized: "Tắt lọc trong lúc chạy nút?"),
              String(localized: "Lọc ngừng lâu, nước thiếu khí và vi sinh trong lọc yếu đi. Nút sẽ bật lại lọc khi kết thúc."),
              String(localized: "Vẫn tắt lọc"))
    }
  }

  /// The Tuya plugs' outlets on the reader's tanks: what the button can add.
  struct OfferedOutlet {
    let target: DeviceTarget
    let name: String
    /// "Ổ cắm bể 60 · Bể 60".
    let place: String
    let role: String?
  }

  func outlets() -> [OfferedOutlet] {
    let store = switcher.tanks.store
    return store.liveDevices.filter { $0.kind == "plug" && $0.brand == "tuya" }.flatMap { p in
      p.outlets.map { o in
        let c = DeviceCommand(device: p.id, outlet: o.code, on: true)
        let place = [p.nickname, store.tank(p.tankId)?.name].compactMap { $0 }.joined(separator: " · ")
        return OfferedOutlet(target: c.target, name: switcher.name(c), place: place, role: o.role)
      }
    }
  }
}
