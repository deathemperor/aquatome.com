import SwiftUI
import Tanks

/// "Bể của tôi": the reader's tanks and the lights on them, as on the site's page (/vi/cong-cu/be-cua-toi/).
struct TanksView: View {
  @Environment(TanksModel.self) private var tanks
  @State private var adding = false

  var body: some View {
    NavigationStack {
      Group {
        if tanks.tanks.isEmpty && tanks.problem == nil {
          ContentUnavailableView {
            Label("Chưa có bể nào", systemImage: "fish")
          } description: {
            Text("Thêm bể đầu tiên để ghi lại kích thước, nền và ghi chú.")
          } actions: {
            Button("Thêm bể đầu tiên") { adding = true }.buttonStyle(.borderedProminent).accessibilityIdentifier("add-first")
          }
        } else {
          List {
            if let p = tanks.problem { Section { ProblemText(problem: p) } }
            Section {
              ForEach(tanks.tanks) { t in
                NavigationLink(value: t.id) { TankRow(tank: t, lights: tanks.devices(in: t).count) }
                  .accessibilityIdentifier("tank")
              }
            } footer: {
              Text("Các bể lưu trên máy này, không cần tài khoản.")
            }
          }
        }
      }
      .navigationTitle("Bể của tôi")
      .navigationDestination(for: String.self) { id in TankDetail(id: id) }
      .toolbar {
        ToolbarItem(placement: .primaryAction) {
          Button { adding = true } label: { Label("Thêm bể", systemImage: "plus") }
            .disabled(!tanks.canAdd)
            .accessibilityIdentifier("add")
        }
        if let data = tanks.exportData(), !tanks.tanks.isEmpty {
          ToolbarItem(placement: .secondaryAction) {
            ShareLink(item: ExportFile(data: data), preview: SharePreview(ExportFile.name)) {
              Label("Tải bản sao (JSON)", systemImage: "square.and.arrow.up")
            }
          }
        }
      }
      .sheet(isPresented: $adding) { TankForm(editing: nil) }
    }
  }
}

private struct TankRow: View {
  let tank: Tank
  let lights: Int

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(tank.name).font(.headline)
      let f = facts(tank)
      if !f.isEmpty { Text(f.joined(separator: " · ")).font(.subheadline).foregroundStyle(.secondary) }
      if lights > 0 { Label("\(lights) đèn", systemImage: "lightbulb").font(.caption).foregroundStyle(.secondary) }
    }
    .accessibilityElement(children: .combine)
  }
}

/// The line under a tank's name: size, litres, substrate (what it has of them), as the site writes it.
func facts(_ t: Tank) -> [String] {
  var out: [String] = []
  let num = { (n: Double, digits: Int) in n.formatted(.number.precision(.fractionLength(0...digits))) }
  if let d = t.dims { out.append("\(num(d.l, 1)) × \(num(d.w, 1)) × \(num(d.h, 1)) cm") }
  if let l = t.totalLitres { out.append(String(localized: "\(num(l, l < 100 ? 1 : 0)) lít")) }
  if let s = t.substrate { out.append(Substrate.label(s)) }
  return out
}

private struct TankDetail: View {
  let id: String
  @Environment(TanksModel.self) private var tanks
  @Environment(\.dismiss) private var dismiss
  @State private var editing = false
  @State private var confirmDelete = false

  var body: some View {
    if let t = tanks.tanks.first(where: { $0.id == id }) {
      let lights = tanks.devices(in: t)
      List {
        Section("Thông tin bể") {
          let f = facts(t)
          Text(f.isEmpty ? String(localized: "Chưa có kích thước.") : f.joined(separator: " · ")).accessibilityIdentifier("facts")
          if let n = t.notes { Text(n).accessibilityIdentifier("notes") }
        }
        if !lights.isEmpty {
          Section("Đèn") { ForEach(lights) { d in LightRow(device: d) } }
        }
        Section {
          Button("Xóa bể", role: .destructive) { confirmDelete = true }.accessibilityIdentifier("delete")
        }
      }
      .navigationTitle(t.name)
      .toolbar { Button("Sửa") { editing = true }.accessibilityIdentifier("edit") }
      .sheet(isPresented: $editing) { TankForm(editing: t) }
      .confirmationDialog(
        lights.isEmpty ? String(localized: "Xóa bể “\(t.name)”?") : String(localized: "Xóa bể “\(t.name)” cùng \(lights.count) đèn đã lưu trên bể?"),
        isPresented: $confirmDelete, titleVisibility: .visible
      ) {
        Button("Xóa", role: .destructive) {
          try? tanks.delete(id)
          dismiss()
        }
      }
    } else {
      ContentUnavailableView("Bể này đã bị xóa.", systemImage: "trash")
    }
  }
}

private struct LightRow: View {
  let device: Device

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(device.nickname ?? device.model ?? device.bleName ?? String(localized: "Đèn"))
      if let s = device.schedules.first(where: { $0.id == device.activeScheduleId }) {
        let ramp = s.ramp > 0 ? " · " + String(localized: "sáng dần \(s.ramp) phút") : ""
        Text(verbatim: "\(s.on) → \(s.off)\(ramp)")
          .font(.caption).foregroundStyle(.secondary)
      } else {
        Text("Chưa lưu lịch nào cho đèn này.").font(.caption).foregroundStyle(.secondary)
      }
    }
  }
}

private struct ProblemText: View {
  let problem: TanksModel.Problem
  var body: some View {
    switch problem {
    case .newerStore: Text("Các bể trên máy này được lưu bằng bản ứng dụng mới hơn. Cập nhật AquaTome để xem và sửa.")
    case .unreadable: Text("Không đọc được các bể đã lưu trên máy này. Dữ liệu được giữ nguyên.")
    case .saveFailed: Text("Chưa lưu được thay đổi. Thử lại.")
    }
  }
}

/// The store as a file to share, named as the site names its download.
struct ExportFile: Transferable {
  static let name = "aquatome-tanks.json"
  let data: Data
  static var transferRepresentation: some TransferRepresentation {
    DataRepresentation(exportedContentType: .json) { $0.data }.suggestedFileName(name)
  }
}
