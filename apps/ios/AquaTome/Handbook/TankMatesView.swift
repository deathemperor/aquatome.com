import Handbook
import SwiftUI
import Tanks

/// The tank-mates tool on a tab's stack (AppScreen.tankMates), with the fish and tank its link sets, if any.
struct TankMatesTool: Hashable {
  var query: String?
}

/// The tank-mates tool, as the site's page (/vi/cong-cu/nuoi-chung/): up to 6 kinds of fish and how many of each, set by
/// its link (TankMatesLink) and changed here, checked as a tank's fish are (TankCheckSection: the site's own code), alone
/// in the link's tank or with one of the reader's tanks, and "Lưu vào Bể của tôi" as the site's tool saves.
struct TankMatesView: View {
  let query: String?
  @Environment(HandbookModel.self) private var handbook
  @Environment(TanksModel.self) private var tanks
  @Environment(\.openScreen) private var openScreen
  @State private var chosen: [Chosen] = []
  /// The link's tank, for the fish alone and a new tank.
  @State private var size: TankMatesLink.Size?
  @State private var started = false
  @State private var picking = false
  /// The reader's tank the fish are tried with and saved to; nil for a new one.
  @State private var target: String?
  @State private var name = ""
  @State private var said: Said?

  /// A fish chosen (by its page's path): its number as typed, and the last one the tool took from it (as the site's box:
  /// one it can't read leaves the number as it was).
  private struct Chosen: Identifiable, Equatable {
    let id: String, name: String, species: String?
    var typed: String, count: Int
  }

  private enum Said: Equatable { case saved(id: String, name: String), full, failed }

  var body: some View {
    let tank = checked
    // Each part type-erased, as the volume tool's: one nested type for the whole form costs the app kilobytes of names.
    Form {
      AnyView(Section {
        ForEach($chosen) { row($0) }
        Button("Thêm loài") { picking = true }
          .disabled(chosen.count >= TankMatesLink.maxFish)
          .accessibilityIdentifier("add-mate")
      } header: {
        Text("Loài đã chọn")
      } footer: {
        hint(tank)
      })
      if !tanks.tanks.isEmpty {
        AnyView(Section {
          Picker("Bể", selection: $target) {
            Text("Bể mới").tag(String?.none)
            ForEach(tanks.tanks) { Text($0.name).tag(Optional($0.id)) }
          }
          .accessibilityIdentifier("mates-tank")
        } footer: {
          Text("Chọn một bể của bạn để kiểm tra cùng cá đang có trong bể.")
        })
      }
      TankCheckSection(tank: tank)
      if !chosen.isEmpty && tanks.canEdit { AnyView(save) }
    }
    .scrollDismissesKeyboard(.interactively)
    .navigationTitle("Kiểm tra nuôi chung")
    .sheet(isPresented: $picking) { FishPicker(chosen: Set(chosen.map(\.id)), add: add) }
    .onChange(of: handbook.count, initial: true) { start() }
    // The tool changed: what was saved is no longer what it shows.
    .onChange(of: chosen.map { "\($0.id):\($0.count)" }) { said = nil }
  }

  /// What's checked: the reader's tank picked, with these fish put on it as saving leaves it; else these fish alone, in
  /// the link's tank.
  private var checked: Tank {
    var t = tanks.tanks.first { $0.id == target } ?? Tank(json: [:])
    if t.id.isEmpty, let s = size { t.dims = (s.l, s.w, s.h) }
    put(&t)
    return t
  }

  private func put(_ t: inout Tank) {
    for f in chosen { if let id = f.species { t.putSpecies(id, count: f.count) } }
  }

  private func row(_ f: Binding<Chosen>) -> some View {
    let name = f.wrappedValue.name
    return HStack {
      Text(name).frame(maxWidth: .infinity, alignment: .leading)
      TextField("Số con", text: Binding(get: { f.wrappedValue.typed }, set: {
        f.wrappedValue.typed = $0
        if let n = TankMatesLink.count($0) { f.wrappedValue.count = n }
      }))
      .keyboardType(.numberPad)
      .multilineTextAlignment(.trailing)
      .frame(width: 56)
      .accessibilityLabel(Text("Số con \(name)"))
      .accessibilityIdentifier("mate-count")
      Text("con").foregroundStyle(.secondary).accessibilityHidden(true)
      Button { chosen.removeAll { $0.id == f.wrappedValue.id } } label: { Image(systemName: "xmark.circle.fill") }
        .buttonStyle(.borderless)
        .foregroundStyle(.secondary)
        .accessibilityLabel(Text("Bỏ \(name)"))
    }
  }

  /// What the check needs, as the site's tool says it under its list.
  @ViewBuilder private func hint(_ tank: Tank) -> some View {
    let fish = tank.species.count + tank.unlisted.filter { !$0.isPlant }.count
    if chosen.count >= TankMatesLink.maxFish { Text("Đã đủ 6 loài: bỏ bớt một loài để thêm.") }
    else if fish == 0 { Text("Thêm 2 loài trở lên để xem có nuôi chung được không.") }
    else if fish == 1 { Text("Thêm một loài nữa để so.") }
  }

  // MARK: Saving, as the site's tools save (scripts/save-to-tank.ts) and the volume tool does

  private var save: some View {
    Section {
      if target == nil {
        TextField("Tên bể", text: $name, prompt: Text(newName)).accessibilityIdentifier("mates-name")
          .capped($name, to: TankFields.nameMax)
      }
      Button("Lưu vào Bể của tôi") { saveFish() }.accessibilityIdentifier("save-mates")
      switch said {
      case let .saved(id, name)?:
        Text("Đã lưu vào “\(name)”.").accessibilityIdentifier("mates-saved")
        Button("Xem trong Bể của tôi →") { openScreen(.tanks(id)) }
      case .full?: Text("Đã đủ 50 bể: xóa bớt bể cũ để thêm.").foregroundStyle(Color.warning)
      case .failed?: Text("Chưa lưu được thay đổi. Thử lại.").foregroundStyle(Color.warning)
      case nil: EmptyView()
      }
    }
  }

  /// The fish onto the tank picked (one already there gets the new number), or onto a new tank with the link's size.
  private func saveFish() {
    do {
      let tank: Tank
      if let id = target, let kept = tanks.tanks.first(where: { $0.id == id }) {
        try tanks.change(id) { put(&$0) }
        tank = kept
      } else if tanks.tanks.count >= maxTanks {
        said = .full
        return
      } else {
        let typed = name.trimmingCharacters(in: .whitespacesAndNewlines), dims = newDims
        tank = try tanks.add(named: typed.isEmpty ? newName : typed) { t in
          put(&t)
          if let d = dims { t.dims = (d.l, d.w, d.h) }
        }
        target = tank.id
        name = ""
      }
      said = .saved(id: tank.id, name: tank.name)
    } catch {
      said = .failed
    }
  }

  /// The link's tank as a new tank takes it: sides an account takes (up to 1000 cm), as the site's tool saves.
  private var newDims: TankMatesLink.Size? {
    size.flatMap { [$0.l, $0.w, $0.h].allSatisfy { $0 <= 1000 } ? $0 : nil }
  }

  /// A new tank's name when none is typed: its size, as the site's tool names it.
  private var newName: String {
    guard let d = newDims else { return String(localized: "Bể mới") }
    let cm = { (x: Double) in x.formatted(.number.precision(.fractionLength(0...1)).rounded(rule: .toNearestOrAwayFromZero)) }
    return String(localized: "Bể \(cm(d.l)) × \(cm(d.w)) × \(cm(d.h))")
  }

  // MARK: The fish

  /// Once the index is here: the fish and tank the link sets.
  private func start() {
    guard !started, handbook.count > 0 else { return }
    started = true
    let link = TankMatesLink(query: query, fish: handbook.life("").filter { $0.kind == .fish })
    chosen = link.fish.map { Chosen(id: $0.item.path, name: $0.item.name, species: $0.item.contentId, typed: String($0.count), count: $0.count) }
    size = link.size
  }

  /// A fish picked: its school size, else one, as the site's tool starts it.
  private func add(_ item: HandbookIndex.Item) {
    guard chosen.count < TankMatesLink.maxFish, !chosen.contains(where: { $0.id == item.path }) else { return }
    let n = item.facts.schoolMin ?? 1
    chosen.append(Chosen(id: item.path, name: item.name, species: item.contentId, typed: String(n), count: n))
  }
}

/// The handbook's fish, searched as the Tìm tab searches, to add one to the tool; those already chosen are marked.
private struct FishPicker: View {
  let chosen: Set<String>
  let add: (HandbookIndex.Item) -> Void
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dismiss) private var dismiss
  @State private var query = ""

  var body: some View {
    let fish = handbook.life(query).filter { $0.kind == .fish }
    NavigationStack {
      List(fish) { item in
        let has = chosen.contains(item.path)
        Button {
          add(item)
          dismiss()
        } label: {
          ItemRow(item: item).frame(maxWidth: .infinity, alignment: .leading).overlay(alignment: .trailing) {
            if has { Text("Đã thêm").font(.caption).foregroundStyle(.secondary) }
          }
        }
        .disabled(has)
      }
      .overlay { if fish.isEmpty && !query.isEmpty { ContentUnavailableView.search(text: query) } }
      .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: Text("Gõ tên Việt hoặc tên khoa học"))
      // Scientific names are typed here, as on the site's search: not corrected, not capitalized.
      .autocorrectionDisabled()
      .textInputAutocapitalization(.never)
      .navigationTitle("Thêm loài")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } } }
    }
  }
}
