import Plugs
import SwiftUI
import Tanks

/// "Thêm ổ cắm": one of the account's plugs (as last listed) put on this tank, then its outlets named. A plug already
/// on a tank isn't offered: a strip is on one tank.
struct AddPlug: View {
  let tankId: String
  @Environment(PlugsModel.self) private var plugs
  @Environment(TanksModel.self) private var tanks
  @Environment(\.dismiss) private var dismiss
  @State private var added: String?
  @State private var failed = false

  var body: some View {
    NavigationStack {
      List {
        let free = (plugs.board.list?.plugs ?? []).filter { tanks.tankOf(plug: $0.provider, $0.id) == nil }
        Section {
          if free.isEmpty { Text("Mọi ổ cắm trong dự án Tuya đã ở trên một bể.").foregroundStyle(.secondary) }
          ForEach(free) { p in
            Button { add(p) } label: {
              VStack(alignment: .leading, spacing: 2) {
                Text(p.name.isEmpty ? String(localized: "Ổ cắm") : p.name)
                Text(p.online ? String(localized: "\(p.outlets.count) ổ") : String(localized: "\(p.outlets.count) ổ · Mất kết nối"))
                  .font(.caption).foregroundStyle(.secondary)
              }
            }
            .accessibilityIdentifier("plug-choice")
          }
          if failed { Text("Chưa lưu được thay đổi. Thử lại.").foregroundStyle(.red) }
        } footer: {
          Text("Các ổ cắm trong dự án Tuya của bạn.")
        }
      }
      .navigationTitle("Thêm ổ cắm")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } } }
      .navigationDestination(item: $added) { id in PlugForm(deviceId: id) { dismiss() } }
    }
  }

  private func add(_ p: LivePlug) {
    do {
      added = try tanks.addPlug(tankId: tankId, brand: p.provider, remoteId: p.id, name: p.name, outlets: p.outlets.map { ($0.code, $0.name) }).id
    } catch {
      failed = true
    }
  }
}

/// A plug on a tank: what each outlet powers and the reader's name for it, or taking it off the tank. Nothing here
/// switches anything.
struct PlugForm: View {
  let deviceId: String
  let done: () -> Void
  @Environment(TanksModel.self) private var tanks
  @Environment(PlugsModel.self) private var plugs
  @State private var outlets: [PlugOutlet]?
  @State private var confirmRemove = false
  @State private var failed = false

  var body: some View {
    if let d = tanks.store.device(deviceId) {
      Form {
        ForEach(Array((outlets ?? d.outlets).enumerated()), id: \.element.code) { i, o in
          Section(header(i, o, d)) {
            Picker("Cắm gì", selection: role(i, d)) {
              Text("Chưa chọn").tag(String?.none)
              ForEach(Known.outletRole + (o.role.map { Known.outletRole.contains($0) ? [] : [$0] } ?? []), id: \.self) { r in
                Text(OutletRole.label(r)).tag(String?.some(r))
              }
            }
            .accessibilityIdentifier("role-\(o.code)")
            TextField("Tên (không bắt buộc)", text: label(i, d))
              .accessibilityIdentifier("label-\(o.code)")
          }
        }
        if failed { Text("Chưa lưu được thay đổi. Thử lại.").foregroundStyle(.red) }
        Section {
          Button("Gỡ khỏi bể", role: .destructive) { confirmRemove = true }.accessibilityIdentifier("remove-plug")
        } footer: {
          Text("Gỡ khỏi bể không bật tắt gì: ổ cắm vẫn chạy như cũ và vẫn ở trong Smart Life.")
        }
      }
      .navigationTitle(d.nickname ?? String(localized: "Ổ cắm"))
      .navigationBarTitleDisplayMode(.inline)
      .navigationBarBackButtonHidden()
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Hủy") { done() } }
        ToolbarItem(placement: .confirmationAction) { Button("Lưu") { save(d) }.accessibilityIdentifier("save-plug") }
      }
      .confirmationDialog(String(localized: "Gỡ “\(d.nickname ?? String(localized: "Ổ cắm"))” khỏi bể?"), isPresented: $confirmRemove, titleVisibility: .visible) {
        Button("Gỡ khỏi bể", role: .destructive) {
          do { try tanks.removePlug(deviceId); done() } catch { failed = true }
        }
        .accessibilityIdentifier("confirm-remove-plug")
      }
    } else {
      ContentUnavailableView("Ổ cắm này đã được gỡ khỏi bể.", systemImage: "trash")
    }
  }

  /// The outlet's number on the strip, and the maker's name for it when it has one.
  private func header(_ i: Int, _ o: PlugOutlet, _ d: Device) -> String {
    let name = plugs.board.list?.plug(provider: d.brand ?? "", id: d.remoteId ?? "")?.outlets.first { $0.code == o.code }?.name
    return name.map { String(localized: "Ổ \(i + 1) · \($0)") } ?? String(localized: "Ổ \(i + 1)")
  }

  private func role(_ i: Int, _ d: Device) -> Binding<String?> {
    Binding(get: { (outlets ?? d.outlets)[i].role }, set: { v in edit(d) { $0[i].role = v } })
  }

  private func label(_ i: Int, _ d: Device) -> Binding<String> {
    Binding(get: { (outlets ?? d.outlets)[i].label ?? "" }, set: { v in edit(d) { $0[i].label = TankFields.capped(v, 40) } })
  }

  private func edit(_ d: Device, _ change: (inout [PlugOutlet]) -> Void) {
    var o = outlets ?? d.outlets
    change(&o)
    outlets = o
  }

  private func save(_ d: Device) {
    // A label of only spaces is no label.
    let cleaned = (outlets ?? d.outlets).map { o in
      var o = o
      let t = o.label?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      o.label = t.isEmpty ? nil : t
      return o
    }
    do {
      try tanks.updatePlug(deviceId, outlets: cleaned)
      done()
    } catch {
      failed = true
    }
  }
}
