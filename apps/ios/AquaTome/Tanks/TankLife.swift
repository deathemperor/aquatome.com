import Handbook
import SwiftUI
import Tanks

/// A fish or plant as the tank screens handle it: its page's content id (what a tank lists), its name, and whether it's a
/// fish (fish are counted).
struct Life: Identifiable, Hashable {
  let id: String
  let name: String
  let fish: Bool
  /// The site's tank-mates tool starts a fish at its school size.
  var schoolMin: Int?

  init(id: String, name: String, fish: Bool, schoolMin: Int? = nil) {
    self.id = id; self.name = name; self.fish = fish; self.schoolMin = schoolMin
  }

  /// A fish or plant page of the handbook; nil for anything else.
  init?(_ item: HandbookIndex.Item) {
    guard item.kind == .fish || item.kind == .plant, let id = item.contentId else { return nil }
    self.init(id: id, name: item.name, fish: item.kind == .fish, schoolMin: item.facts.schoolMin)
  }
}

/// A tank's fish (with how many) and plants, as the site lists them, each opening its page. Swiped, a fish's number
/// changes, or either comes off the tank; more are added from the handbook.
struct TankLifeSections: View {
  let tank: Tank
  @Environment(TanksModel.self) private var tanks
  @Environment(HandbookModel.self) private var handbook
  @State private var counting: Life?
  @State private var adding = false

  var body: some View {
    if !tank.species.isEmpty {
      Section("Cá và tép") {
        ForEach(Array(tank.species.enumerated()), id: \.offset) { _, s in
          LifeRow(id: s.id, count: s.count).swipeActions {
            Button("Xóa", role: .destructive) { try? tanks.change(tank.id) { $0.removeSpecies(s.id) } }
            Button("Số con") { counting = handbook.page(s.id).flatMap(Life.init) ?? Life(id: s.id, name: s.id, fish: true) }
          }
        }
      }
    }
    if !tank.plants.isEmpty {
      Section("Cây") {
        ForEach(Array(tank.plants.enumerated()), id: \.offset) { _, id in
          LifeRow(id: id, count: nil).swipeActions {
            Button("Xóa", role: .destructive) { try? tanks.change(tank.id) { $0.removePlant(id) } }
          }
        }
      }
    }
    Section {
      Button { adding = true } label: { Label("Thêm cá hoặc cây", systemImage: "plus") }
        .accessibilityIdentifier("add-life")
        // On the one row that's always there: a sheet on a section would be one per row.
        .sheet(isPresented: $adding) { LifePicker(tankId: tank.id) }
        .sheet(item: $counting) { life in NavigationStack { PutOnTank(life: life, tankId: tank.id) } }
    }
  }
}

/// A fish or plant on a tank: its name from the handbook (the id until the index is here), linked to its page.
private struct LifeRow: View {
  let id: String
  let count: Int?
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let label = HStack {
      Text(handbook.page(id)?.name ?? id)
      Spacer()
      if let count { Text(verbatim: "× \(count)").foregroundStyle(.secondary).monospacedDigit() }
    }
    if let page = handbook.page(id) {
      NavigationLink(value: page) { label }.accessibilityIdentifier("life")
    } else {
      label.accessibilityIdentifier("life")
    }
  }
}

/// Puts a fish (with how many) or a plant on a tank, as the site tools' "Lưu vào Bể của tôi" does: a fish already there
/// gets the new number. With `tankId`, on that tank (from its screen), then `done` (else the sheet closes); without, on
/// one of the reader's tanks or a new one, then it says where, with a way there.
struct PutOnTank: View {
  let life: Life
  var tankId: String?
  var done: (() -> Void)?
  @Environment(TanksModel.self) private var tanks
  @Environment(\.dismiss) private var dismiss
  @Environment(\.openScreen) private var openScreen
  /// The tank picked; nil for a new one.
  @State private var target: String?
  @State private var name = ""
  @State private var count = ""
  @State private var saved: Tank?
  @State private var failed = false

  var body: some View {
    Form {
      if tankId == nil {
        Section {
          Picker("Bể", selection: $target) {
            if tanks.canAdd { Text("Bể mới").tag(String?.none) }
            ForEach(tanks.tanks) { t in Text(t.name).tag(Optional(t.id)) }
          }
          .accessibilityIdentifier("put-tank")
          if target == nil {
            TextField("Tên bể", text: $name, prompt: Text("Bể mới")).accessibilityIdentifier("put-name")
              .onChange(of: name) { _, v in name = TankFields.capped(v, TankFields.nameMax) }
          }
        }
      }
      if life.fish {
        Section("Số con") {
          TextField("Số con", text: $count).keyboardType(.numberPad).accessibilityIdentifier("put-count")
        }
      }
      if let saved {
        Section {
          Text("Đã lưu vào “\(saved.name)”.").accessibilityIdentifier("put-saved")
          Button("Xem trong Bể của tôi →") {
            dismiss()
            openScreen(.tanks(saved.id))
          }
          .accessibilityIdentifier("put-open")
        }
      }
      if failed { Text("Chưa lưu được thay đổi. Thử lại.").foregroundStyle(Color.warning) }
    }
    .navigationTitle(life.name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button(saved == nil ? "Hủy" : "Xong") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) {
        Button("Lưu") { save() }.disabled((life.fish && number == nil) || (target == nil && !tanks.canAdd)).accessibilityIdentifier("put-save")
      }
    }
    .onAppear {
      target = tankId ?? tanks.tanks.first?.id
      fill()
    }
    .onChange(of: target) { fill() }
  }

  /// What's typed, when it's a number the store takes.
  private var number: Int? { Int(count.trimmingCharacters(in: .whitespaces)).flatMap { (1...maxCount).contains($0) ? $0 : nil } }

  /// The number already on the tank picked, else the tool's: the school size, or one.
  private func fill() {
    guard life.fish else { return }
    let kept = tanks.tanks.first { $0.id == target }?.species.first { $0.id == life.id }?.count
    count = String(kept ?? life.schoolMin ?? 1)
  }

  private func save() {
    let n = number
    let put: (inout Tank) -> Void = { life.fish ? $0.putSpecies(life.id, count: n) : $0.addPlant(life.id) }
    do {
      if let target {
        try tanks.change(target, put)
      } else {
        let typed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        target = try tanks.add(named: typed.isEmpty ? String(localized: "Bể mới") : typed, put).id
      }
      failed = false
    } catch {
      failed = true
      return
    }
    if tankId != nil {
      if let done { done() } else { dismiss() }
    } else {
      saved = tanks.tanks.first { $0.id == target }
    }
  }
}

/// The handbook's fish and plants, searched as the Tìm tab searches, to put one on a tank.
private struct LifePicker: View {
  let tankId: String
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var picked: Life?

  var body: some View {
    NavigationStack {
      List(handbook.life(query)) { item in
        Button { picked = Life(item) } label: {
          VStack(alignment: .leading, spacing: 2) {
            Text(item.name).foregroundStyle(.primary)
            if let sub = item.sub { Text(sub).font(.caption).italic().foregroundStyle(.secondary) }
          }
        }
        .accessibilityIdentifier("life-item")
      }
      .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: Text("Tìm loài cá, cây"))
      .navigationTitle("Thêm cá hoặc cây")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } } }
      .navigationDestination(item: $picked) { life in PutOnTank(life: life, tankId: tankId, done: { dismiss() }) }
      // The tanks tab may be the first one opened.
      .task { await handbook.appear() }
    }
  }
}
