import Handbook
import SwiftUI

/// A shelf of fish the reader can narrow to their tank and water, as the site's fish list does (FishFilter).
struct FishShelf: View {
  let items: [HandbookIndex.Item]
  @State private var filter = FishFilter()
  @State private var editing = false

  var body: some View {
    let s = filter.split(items)
    FilteredGrid(fit: s.fit, unsure: s.unsure, filtering: !filter.isEmpty, clear: { filter = FishFilter() },
                 why: "Những loài này còn thiếu số liệu bạn đang lọc (nhiệt độ, pH, chiều dài bể hoặc độ khó). Số đã có thì hợp, nhưng chưa đủ để nói chắc.")
      .toolbar { FilterButton(active: !filter.isEmpty) { editing = true } }
      .sheet(isPresented: $editing) { FishFilterForm(filter: $filter) }
  }
}

/// A shelf of plants the reader can narrow to their tank, as the site's plant list does (PlantFilter).
struct PlantShelf: View {
  let items: [HandbookIndex.Item]
  @State private var filter = PlantFilter()
  @State private var editing = false

  var body: some View {
    let s = filter.split(items)
    FilteredGrid(fit: s.fit, unsure: s.unsure, filtering: !filter.isEmpty, clear: { filter = PlantFilter() },
                 why: "Những cây này còn thiếu thông tin bạn đang lọc (ánh sáng, CO₂, vị trí hoặc độ khó). Thông tin đã có thì hợp, nhưng chưa đủ để nói chắc.")
      .toolbar { FilterButton(active: !filter.isEmpty) { editing = true } }
      .sheet(isPresented: $editing) { PlantFilterForm(filter: $filter) }
  }
}

/// Pages as photo cards, two or more to a row as the screen allows, drawn as they scroll into view. While filtering:
/// how many fit, then the ones that fit, then the ones a missing figure leaves unsure, with why.
private struct FilteredGrid: View {
  let fit: [HandbookIndex.Item]
  let unsure: [HandbookIndex.Item]
  let filtering: Bool
  let clear: () -> Void
  let why: LocalizedStringKey

  var body: some View {
    ScrollView {
      LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12, alignment: .top)], alignment: .leading, spacing: 16) {
        Section {
          cards(fit)
        } header: {
          if filtering {
            HStack(alignment: .firstTextBaseline) {
              count.font(.subheadline).foregroundStyle(.secondary).accessibilityIdentifier("filter-count")
              Spacer()
              Button("Xóa lọc", action: clear)
            }
          }
        }
        if !unsure.isEmpty {
          Section {
            cards(unsure)
          } header: {
            VStack(alignment: .leading, spacing: 4) {
              Text("Chưa đủ dữ liệu để chắc (\(unsure.count))").font(.headline)
              Text(why).font(.footnote).foregroundStyle(.secondary)
            }
            .padding(.top, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      }
      .padding()
    }
    .accessibilityIdentifier("shelf-pages")
    .navigationBarTitleDisplayMode(.inline)
  }

  private var count: Text {
    if fit.isEmpty && unsure.isEmpty { return Text("Không có loài nào khớp. Thử nới điều kiện lọc.") }
    return unsure.isEmpty ? Text("\(fit.count) loài phù hợp") : Text("\(fit.count) loài phù hợp · \(unsure.count) loài chưa đủ dữ liệu để chắc")
  }

  private func cards(_ items: [HandbookIndex.Item]) -> some View {
    ForEach(items) { item in NavigationLink(value: item) { Card(item: item) }.buttonStyle(.plain) }
  }
}

private struct FilterButton: ToolbarContent {
  let active: Bool
  let action: () -> Void

  var body: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) {
      Button(action: action) {
        Label("Lọc", systemImage: active ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease.circle")
      }
      .accessibilityIdentifier("filter")
    }
  }
}

/// The site's fish filter: tank length (typed, or one of the reader's tanks), temperature, pH and the hardest fish.
private struct FishFilterForm: View {
  @Binding var filter: FishFilter
  @Environment(TanksModel.self) private var tanks

  var body: some View {
    let sized = tanks.tanks.compactMap { t in t.dims.map { (id: t.id, name: t.name, cm: $0.l) } }
    FilterForm(title: "Lọc theo bể và nước", isEmpty: filter.isEmpty, clear: { filter = FishFilter() }) {
      Section {
        NumberField(title: Text("Bể dài (cm)"), value: $filter.tankCm)
        ForEach(sized, id: \.id) { t in
          let picked = filter.tankCm == t.cm
          Button { filter.tankCm = t.cm } label: {
            HStack {
              Label { Text(verbatim: t.name) } icon: { Image(systemName: "fish") }
              Spacer()
              Text(verbatim: "\(number(t.cm)) cm").foregroundStyle(.secondary)
              Image(systemName: "checkmark").foregroundStyle(.tint).opacity(picked ? 1 : 0)
            }
          }
          .foregroundStyle(.primary)
          .accessibilityAddTraits(picked ? .isSelected : [])
          .accessibilityIdentifier("my-tank")
        }
      }
      Section {
        NumberField(title: Text("Nhiệt độ (°C)"), value: $filter.tempC)
        NumberField(title: Text(verbatim: "pH"), value: $filter.ph)
        Picker("Độ khó tối đa", selection: $filter.difficultyMax) {
          Text("Bất kỳ").tag(Double?.none)
          Text("Dễ").tag(Double?(3))
          Text("Dễ và vừa").tag(Double?(5))
        }
      }
    }
  }
}

/// The site's plant filter: the tank's light, CO₂ and the hardest plant, in the site's words for each.
private struct PlantFilterForm: View {
  @Binding var filter: PlantFilter
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let labels = handbook.labels
    FilterForm(title: "Lọc theo bể của bạn", isEmpty: filter.isEmpty, clear: { filter = PlantFilter() }) {
      Picker("Ánh sáng bể", selection: $filter.light) {
        Text("Bất kỳ").tag(String?.none)
        ForEach(["low", "medium", "high"], id: \.self) { Text(verbatim: labels["light", $0] ?? $0).tag(String?($0)) }
      }
      Picker(selection: $filter.co2) {
        Text("Bất kỳ").tag(String?.none)
        Text("Không cần châm").tag(String?("none"))
        Text(verbatim: labels["co2", "required"] ?? "required").tag(String?("required"))
      } label: {
        Text(verbatim: "CO₂")
      }
      Picker("Độ khó tối đa", selection: $filter.difficultyMax) {
        Text("Bất kỳ").tag(Int?.none)
        Text("Dễ").tag(Int?(1))
        Text("Dễ và vừa").tag(Int?(2))
      }
    }
  }
}

/// A filter's sheet: its fields, with "Xóa lọc" and "Xong". The list behind it follows each change.
private struct FilterForm<Fields: View>: View {
  let title: LocalizedStringKey
  let isEmpty: Bool
  let clear: () -> Void
  @ViewBuilder let fields: Fields
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      Form { fields }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("Xóa lọc", action: clear).disabled(isEmpty) }
          ToolbarItem(placement: .confirmationAction) { Button("Xong") { dismiss() } }
        }
    }
    .presentationDetents([.medium, .large])
  }
}

/// A number typed in the reader's way (a comma or a point), empty for none.
private struct NumberField: View {
  let title: Text
  @Binding var value: Double?
  @State private var text = ""

  var body: some View {
    LabeledContent {
      TextField(text: $text, prompt: Text(verbatim: "–")) { title }
        .keyboardType(.decimalPad)
        .multilineTextAlignment(.trailing)
    } label: {
      title
    }
    .onAppear { text = value.map(number) ?? "" }
    .onChange(of: text) { value = parse(text) }
    .onChange(of: value) { if parse(text) != value { text = value.map(number) ?? "" } }
  }

  private func parse(_ s: String) -> Double? { Double(s.replacingOccurrences(of: ",", with: ".")) }
}

private func number(_ x: Double) -> String { x.formatted(.number.grouping(.never)) }
