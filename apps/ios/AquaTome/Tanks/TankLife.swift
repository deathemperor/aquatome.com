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

/// A sheet of the tank's fish and plants: the handbook's list to add one, a fish's number, or the number of an entry
/// without a page.
enum LifeSheet: Identifiable {
  case add
  case count(Life)
  case unlisted(UnlistedEntry)
  var id: String {
    switch self {
    case .add: "add"
    case .count(let l): "count:\(l.id)"
    case .unlisted(let e): "unlisted:\(e.id)"
    }
  }
}

/// What a `LifeSheet` shows, on the tank `tankId`. The tank's screen presents it from its list, which is always there
/// (a sheet on a row would wait for that row to be drawn).
struct LifeSheetView: View {
  let sheet: LifeSheet
  let tankId: String
  var body: some View {
    switch sheet {
    case .add: LifePicker(tankId: tankId)
    case .count(let life): NavigationStack { PutOnTank(life: life, tankId: tankId) }
    case .unlisted(let entry): NavigationStack { UnlistedCount(entry: entry, tankId: tankId) }
    }
  }
}

/// A tank's fish (with how many) and plants, as the site lists them, each opening its page; after them, what the
/// handbook has no page for (`unlisted`). Swiped, a fish's number changes, or either comes off the tank; more are added
/// from the handbook, or by name (`sheet`, presented by the tank's screen).
struct TankLifeSections: View {
  let tank: Tank
  @Binding var sheet: LifeSheet?
  @Environment(TanksModel.self) private var tanks
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    // As the site sorts them: a plant with the plants, anything else (a kind from a newer client too) with the fish.
    let fish = tank.unlisted.filter { !$0.isPlant }, plants = tank.unlisted.filter(\.isPlant)
    if !tank.species.isEmpty || !fish.isEmpty {
      Section("Cá và tép") {
        ForEach(Array(tank.species.enumerated()), id: \.offset) { _, s in
          LifeRow(id: s.id, count: s.count).swipeActions {
            Button("Xóa", role: .destructive) { try? tanks.change(tank.id) { $0.removeSpecies(s.id) } }
            Button("Số con") { sheet = .count(handbook.page(s.id).flatMap(Life.init) ?? Life(id: s.id, name: s.id, fish: true)) }
          }
        }
        ForEach(Array(fish.enumerated()), id: \.offset) { _, e in
          UnlistedRow(entry: e).swipeActions {
            Button("Xóa", role: .destructive) { try? tanks.change(tank.id) { $0.removeUnlisted(e.id) } }
            Button("Số con") { sheet = .unlisted(e) }
          }
        }
      }
    }
    if !tank.plants.isEmpty || !plants.isEmpty {
      Section("Cây") {
        ForEach(Array(tank.plants.enumerated()), id: \.offset) { _, id in
          LifeRow(id: id, count: nil).swipeActions {
            Button("Xóa", role: .destructive) { try? tanks.change(tank.id) { $0.removePlant(id) } }
          }
        }
        ForEach(Array(plants.enumerated()), id: \.offset) { _, e in
          UnlistedRow(entry: e).swipeActions {
            Button("Xóa", role: .destructive) { try? tanks.change(tank.id) { $0.removeUnlisted(e.id) } }
          }
        }
      }
    }
    Section {
      Button { sheet = .add } label: { Label("Thêm cá hoặc cây", systemImage: "plus") }
        .accessibilityIdentifier("add-life")
        .accessibilityValue(wantedForTests)
    }
  }

  /// The UI tests read here what the stand-in server took as wanted, a body a line; nothing for VoiceOver in a release
  /// build.
  private var wantedForTests: String {
    #if DEBUG
    tanks.wantedForTests.joined(separator: "\n")
    #else
    ""
    #endif
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

/// What the handbook has no page for, on a tank: shown as the page that has its scientific name once there is one (with
/// the entry's number), else by its name, marked "chưa có trang" in a dashed chip as the site marks it, VoiceOver too.
private struct UnlistedRow: View {
  let entry: UnlistedEntry
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    if let page = handbook.page(for: entry) {
      NavigationLink(value: page) {
        HStack {
          Text(page.name)
          Spacer()
          if let count = entry.count { Text(verbatim: "× \(count)").foregroundStyle(.secondary).monospacedDigit() }
        }
      }
      .accessibilityIdentifier("life")
    } else {
      HStack {
        VStack(alignment: .leading, spacing: 2) {
          Text(verbatim: entry.name)
          if let sci = entry.sci { Text(verbatim: sci).font(.caption).italic().foregroundStyle(.secondary) }
        }
        Spacer()
        if let count = entry.count { Text(verbatim: "× \(count)").foregroundStyle(.secondary).monospacedDigit() }
        Text("chưa có trang")
          .font(.caption).foregroundStyle(.secondary)
          .padding(.horizontal, 8).padding(.vertical, 3)
          .overlay(Capsule().strokeBorder(.secondary, style: StrokeStyle(lineWidth: 1, dash: [3, 3])))
      }
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("life")
    }
  }
}

/// The number of an entry without a page, changed as a fish's is; left empty, the tank says no number, as on the site.
struct UnlistedCount: View {
  let entry: UnlistedEntry
  let tankId: String
  @Environment(TanksModel.self) private var tanks
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dismiss) private var dismiss
  @State private var count = ""
  @State private var failed = false

  var body: some View {
    Form {
      Section("Số con") {
        TextField("Số con (nếu muốn)", text: $count).keyboardType(.numberPad).accessibilityIdentifier("put-count")
      }
      if failed { Text("Chưa lưu được thay đổi. Thử lại.").foregroundStyle(Color.warning) }
    }
    .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
    .navigationTitle(handbook.page(for: entry)?.name ?? entry.name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
      ToolbarItem(placement: .confirmationAction) {
        Button("Lưu") { save() }.disabled(!typed.isEmpty && number == nil).accessibilityIdentifier("put-save")
      }
    }
    .onAppear { count = entry.count.map(String.init) ?? "" }
  }

  private var typed: String { count.trimmingCharacters(in: .whitespaces) }
  private var number: Int? { Int(typed).flatMap { (1...maxCount).contains($0) ? $0 : nil } }

  private func save() {
    do {
      try tanks.change(tankId) { $0.setUnlistedCount(entry.id, number) }
      dismiss()
    } catch {
      failed = true
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
  /// Opens the tank it was put on. The sheet's owner does it, once the sheet has closed: changing the tab and its stack as a
  /// sheet closes over them is a race (the owner saw a blank tank after it, 7 Nov; the tests couldn't reproduce it).
  var open: ((String) -> Void)?
  @Environment(TanksModel.self) private var tanks
  @Environment(\.dismiss) private var dismiss
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
            CappedField(title: "Tên bể", prompt: "Bể mới", text: $name, max: TankFields.nameMax, id: "put-name")
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
          Button("Xem trong Bể của tôi →") { open?(saved.id) }
            .accessibilityIdentifier("put-open")
        }
      }
      if failed { Text("Chưa lưu được thay đổi. Thử lại.").foregroundStyle(Color.warning) }
    }
    .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
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
    .ownerScreen("put-on-tank")
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

/// The handbook's fish and plants, searched as the Tìm tab searches, to put one on a tank. The last row adds what was
/// typed without a page, as the site's search ends (offline too: the handbook isn't needed for that).
struct LifePicker: View {
  let tankId: String
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""
  @State private var picked: Life?
  /// What was typed, to add without a page.
  @State private var named: String?

  var body: some View {
    let typed = query.trimmingCharacters(in: .whitespacesAndNewlines)
    NavigationStack {
      List {
        ForEach(handbook.life(query)) { item in
          Button { picked = Life(item) } label: {
            VStack(alignment: .leading, spacing: 2) {
              Text(item.name).foregroundStyle(.primary)
              if let sub = item.subUnderName { Text(sub).font(.caption).italic().foregroundStyle(.secondary) }
            }
          }
          .accessibilityIdentifier("life-item")
        }
        if typed.count >= 2 {
          Button { named = typed } label: { Text("Thêm “\(typed)” (chưa có trong cẩm nang)") }
            .accessibilityIdentifier("life-new")
        }
      }
      .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: Text("Tìm loài cá, cây"))
      // Scientific names are typed here, as on the site's search: not corrected, not capitalized.
      .autocorrectionDisabled()
      .textInputAutocapitalization(.never)
      .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
      .navigationTitle("Thêm cá hoặc cây")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } } }
      .navigationDestination(item: $picked) { life in PutOnTank(life: life, tankId: tankId, done: { dismiss() }) }
      .navigationDestination(item: $named) { name in
        NewUnlisted(name: name, sci: NewUnlisted.readsAsScientific(name) ? name : nil, tankId: tankId, done: { dismiss() })
          .ownerScreen("new-unlisted")
      }
      .refreshable { await handbook.load() }
      // Until the index is here (the tanks tab may be the first one opened), or when it can't be; not over what was
      // typed, which can still be added by name.
      .overlay {
        if typed.isEmpty {
          if handbook.status == .loading { ProgressView() }
          else if handbook.status == .failed { ContentUnavailableView("Không tải được cẩm nang. Kiểm tra kết nối mạng rồi kéo xuống để thử lại.", systemImage: "wifi.slash") }
        }
      }
      // The tanks tab may be the first one opened.
      .task { await handbook.appear() }
    }
  }
}

/// Something the handbook has no page for, put on the tank by its name, as the site's form asks it: fish or plant, the
/// scientific name if known (what shows it as its page once the handbook has one), how many. Opened with what was
/// typed; a photo's guess can open it the same way, with its names and kind.
struct NewUnlisted: View {
  let tankId: String
  var done: () -> Void
  /// The name it was opened with.
  private let typed: String
  @Environment(TanksModel.self) private var tanks
  @State private var kind: String
  @State private var name: String
  @State private var sci: String
  @State private var count = ""
  @State private var failed = false

  init(name: String, sci: String? = nil, kind: String = "fish", tankId: String, done: @escaping () -> Void) {
    typed = name
    _name = State(initialValue: name)
    _sci = State(initialValue: sci ?? "")
    _kind = State(initialValue: kind)
    self.tankId = tankId
    self.done = done
  }

  /// Typed like a scientific name ("Rhinogobius duospilus"): taken as the scientific name too, as the site's form does.
  static func readsAsScientific(_ s: String) -> Bool {
    s.range(of: #"^[A-Z][a-z]+ (?:(?:cf|aff)\.? )?[a-z]+$"#, options: .regularExpression) != nil
  }

  var body: some View {
    Form {
      Section {
        Text("\(Text(verbatim: typed).bold()) chưa có trang trong cẩm nang. Vẫn thêm vào bể được: khi có trang, bể sẽ hiện trang đó.")
      }
      // A segmented picker doesn't show its own label, so the section's header says what it chooses, for VoiceOver too.
      Section("Đây là") {
        Picker("Đây là", selection: $kind) {
          Text("Cá, tép hoặc ốc").tag("fish")
          Text("Cây").tag("plant")
        }
        .pickerStyle(.segmented)
        .accessibilityIdentifier("new-kind")
      }
      Section {
        CappedField(title: "Tên", text: $name, max: TankFields.nameMax, id: "new-name")
        CappedField(title: "Tên khoa học (nếu biết)", prompt: "Ví dụ: Rhinogobius duospilus", text: $sci, max: 120, id: "new-sci", plain: true)
        if kind != "plant" {
          TextField("Số con (nếu muốn)", text: $count).keyboardType(.numberPad).accessibilityIdentifier("new-count")
        }
      }
      if full { Text("Đã đủ \(maxUnlisted) loài chưa có trang trên bể này.").foregroundStyle(Color.warning) }
      if failed { Text("Chưa lưu được thay đổi. Thử lại.").foregroundStyle(Color.warning) }
    }
    .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
    .navigationTitle(typed)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        Button("Thêm vào bể") { save() }
          .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || badCount || full)
          .accessibilityIdentifier("new-save")
      }
    }
  }

  private var full: Bool { (tanks.tanks.first { $0.id == tankId }?.unlisted.count ?? 0) >= maxUnlisted }
  /// No number is fine; one typed must be one the store takes.
  private var number: Int? { Int(count.trimmingCharacters(in: .whitespaces)).flatMap { (1...maxCount).contains($0) ? $0 : nil } }
  private var badCount: Bool { kind != "plant" && !count.trimmingCharacters(in: .whitespaces).isEmpty && number == nil }

  private func save() {
    let e = UnlistedEntry(kind: kind, name: name, sci: sci, count: number)
    do {
      // Saved, then sent as wanted when no page has it (TanksModel).
      try tanks.change(tankId) { $0.addUnlisted(e) }
      done()
    } catch {
      failed = true
    }
  }
}
