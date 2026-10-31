import SwiftUI
import Tanks

/// Add a tank, or edit one: name, inside size, substrate, notes (the site's form).
struct TankForm: View {
  let editing: Tank?
  @Environment(TanksModel.self) private var tanks
  @Environment(\.dismiss) private var dismiss
  @State private var f = TankFields()
  @State private var tried = false
  @State private var failed = false

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField("Ví dụ: Bể 60 phòng khách", text: $f.name).accessibilityIdentifier("name")
        } header: {
          Text("Tên bể")
        }
        Section {
          HStack {
            Number(title: "Dài", value: $f.l).accessibilityIdentifier("l")
            Text(verbatim: "×").foregroundStyle(.secondary)
            Number(title: "Rộng", value: $f.w).accessibilityIdentifier("w")
            Text(verbatim: "×").foregroundStyle(.secondary)
            Number(title: "Cao", value: $f.h).accessibilityIdentifier("h")
          }
          if let l = f.litres, f.problem != .partialDims {
            Text("\(l.formatted(.number.precision(.fractionLength(0...(l < 100 ? 1 : 0))))) lít").foregroundStyle(.secondary)
              .accessibilityIdentifier("litres")
          }
        } header: {
          Text("Kích thước lòng bể (cm)")
        } footer: {
          if tried && f.problem == .partialDims {
            Text("Nhập đủ dài, rộng, cao (từ 1 đến 1.000 cm), hoặc để trống cả ba.").foregroundStyle(Color.warning)
              .accessibilityIdentifier("dims-error")
          }
        }
        Section {
          Picker("Nền", selection: $f.substrate) {
            Text("Chưa chọn").tag(String?.none)
            ForEach(substrates, id: \.self) { s in Text(Substrate.label(s)).tag(Optional(s)) }
          }
          .accessibilityIdentifier("substrate")
        }
        Section {
          TextField("Lịch thay nước, phân bón, CO₂…", text: $f.notes, axis: .vertical)
            .lineLimit(3...8)
            .accessibilityIdentifier("notes-field")
        } header: {
          Text("Ghi chú")
        }
        if failed {
          Text("Chưa lưu được thay đổi. Thử lại.").foregroundStyle(Color.warning)
        }
      }
      .navigationTitle(editing == nil ? "Thêm bể" : "Sửa")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Lưu bể") { save() }.disabled(f.problem == .blankName).accessibilityIdentifier("save")
        }
      }
      .onAppear { if let editing { f = TankFields(editing) } }
    }
  }

  /// The site's substrates, plus the tank's own when a newer client set one this app doesn't list (kept as it is).
  private var substrates: [String] {
    Known.substrate + (f.substrate.map { Known.substrate.contains($0) ? [] : [$0] } ?? [])
  }

  private func save() {
    tried = true
    guard f.problem == nil else { return }
    do {
      if let editing { try tanks.update(editing.id, f) } else { try tanks.add(f) }
      dismiss()
    } catch {
      failed = true
    }
  }
}

private struct Number: View {
  let title: LocalizedStringKey
  @Binding var value: Double?

  var body: some View {
    TextField(title, value: $value, format: .number)
      .keyboardType(.decimalPad)
      .multilineTextAlignment(.center)
  }
}
