import Foundation
import Observation
import Tanks

/// "Bể của tôi" on this phone: the shared tank store (docs/my-tanks-sync.md), kept in Application Support. Works without
/// an account; signing in later sends these same records to the account.
@Observable
@MainActor
final class TanksModel {
  enum Problem: Equatable {
    /// The file on the phone is from a newer app (another store version): left untouched, not shown.
    case newerStore
    /// The file on the phone couldn't be read: left untouched, not shown, nothing saved over it.
    case unreadable
    case saveFailed
  }

  private(set) var store = TankStore()
  private(set) var problem: Problem?
  private let file: URL

  init(file: URL = TanksModel.defaultFile()) {
    self.file = file
    load()
  }

  var tanks: [Tank] { store.liveTanks }
  func devices(in tank: Tank) -> [Device] { store.devices(in: tank.id) }
  /// Nothing to add to while the store on the phone isn't this app's to write; after a failed save, try again.
  var canAdd: Bool { (problem == nil || problem == .saveFailed) && tanks.count < maxTanks }

  /// The store as JSON, for "Tải bản sao" (the same file the site downloads).
  func exportData() -> Data? { try? store.data() }

  // MARK: Edits: each one saved at once. A store this app can't keep whole is never written over.

  @discardableResult
  func add(_ f: TankFields) throws -> Tank {
    var s = store
    let t = try s.addTank(name: f.name)
    try s.updateTank(t.id) { f.apply(to: &$0) }
    try commit(s)
    return s.tank(t.id) ?? t
  }

  func update(_ id: String, _ f: TankFields) throws {
    var s = store
    try s.updateTank(id) { f.apply(to: &$0) }
    try commit(s)
  }

  func delete(_ id: String) throws {
    var s = store
    try s.deleteTank(id)
    try commit(s)
  }

  /// A sync's result (AccountModel): the account's store with the phone's changes since, saved as an edit is.
  func commitSynced(_ s: TankStore) throws { try commit(s) }

  // MARK: The site's pages in the app (PageBridge): they save to these same tanks

  /// The store for a page of the site, or nil while this phone's store isn't this app's to write (a page won't get a
  /// store it could save over), or the last save failed: then pages keep their own saves, and send them again with each
  /// page until one is kept.
  func storeForPages() -> String? {
    guard problem == nil, let data = try? store.data() else { return nil }
    return String(decoding: data, as: UTF8.self)
  }

  /// A store a page sent: merged record by record (the newer copy of each wins, docs/my-tanks-sync.md) and saved if it
  /// changed anything. One the app can't read (another version) is left alone.
  func mergeFromPage(_ data: Data) {
    guard problem == nil || problem == .saveFailed, let page = try? TankStore(data: data) else { return }
    let merged = TankStore.merge(kept: store, incoming: page)
    if merged != store { try? commit(merged) }
  }

  // MARK: Lights, remembered as the site's light page does (a failed save shows on this tab; the light goes on working)

  /// The tank a light met for the first time goes on, when there is none yet.
  static let newTankName = String(localized: "Bể của tôi")

  /// A Chihiros light just connected: its saved record, or a new one on the first tank.
  func metLight(bleName: String, model: String) {
    var s = store
    guard (try? s.metLight(bleName: bleName, model: model, tankName: Self.newTankName)) != nil else { return }
    try? commit(s)
  }

  /// A change to a connected light, made to its record as the store has it now (met again if its tank went).
  func changeLight(bleName: String, model: String, _ change: (inout Device) -> Void) {
    var s = store
    guard let d = try? s.metLight(bleName: bleName, model: model, tankName: Self.newTankName),
          (try? s.updateDevice(d.id) { change(&$0) }) != nil else { return }
    try? commit(s)
  }

  private func commit(_ s: TankStore) throws {
    guard problem == nil || problem == .saveFailed else { throw TankStoreError.unknownVersion }
    do {
      try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
      try s.data().write(to: file, options: .atomic)
      store = s
      problem = nil
    } catch {
      problem = .saveFailed
      throw error
    }
  }

  private func load() {
    guard FileManager.default.fileExists(atPath: file.path) else { return } // none yet
    // A file there that can't be read (or read yet) is kept as it is, like one that can't be understood.
    do { store = try TankStore(data: Data(contentsOf: file)) } catch TankStoreError.unknownVersion { problem = .newerStore } catch { problem = .unreadable }
  }

  static func defaultFile() -> URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("tanks", isDirectory: true).appendingPathComponent("store.json")
  }

  #if DEBUG
  /// UI tests: no tanks (`-reset-defaults`), then maybe a store this app must leave alone (`-seed-tanks newer`,
  /// `unreadable`), a place it can't save to (`unwritable`), a tank another client gave litres of its own (`litres`), or
  /// one with fish and plants on it (`life`).
  static func prepareForTests(_ args: [String], file: URL = defaultFile()) {
    let dir = file.deletingLastPathComponent()
    let fm = FileManager.default
    if args.contains("-reset-defaults") { try? fm.removeItem(at: dir) }
    guard let i = args.firstIndex(of: "-seed-tanks"), i + 1 < args.count else { return }
    switch args[i + 1] {
    case "newer", "unreadable", "litres", "life":
      let store = [
        "newer": #"{"v":2,"tanks":[],"devices":[]}"#,
        "unreadable": "{not json",
        "litres": #"{"v":1,"tanks":[{"id":"00000000-0000-4000-8000-000000000001","name":"Bể cũ","dims":{"l":100,"w":40,"h":50},"litres":180,"species":[],"plants":[],"createdAt":"2026-10-01T08:00:00.000Z","updatedAt":"2026-10-01T08:00:00.000Z"}],"devices":[]}"#,
        "life": #"{"v":1,"tanks":[{"id":"00000000-0000-4000-8000-000000000002","name":"Bể cá neon","species":[{"id":"paracheirodon-innesi","count":12},{"id":"loai-chua-co-trang"}],"plants":[{"id":"rotala-rotundifolia"}],"createdAt":"2026-10-01T08:00:00.000Z","updatedAt":"2026-10-01T08:00:00.000Z"}],"devices":[]}"#,
      ][args[i + 1]]!
      try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
      try? Data(store.utf8).write(to: file)
    case "unwritable":
      fm.createFile(atPath: dir.path, contents: Data()) // a file where the folder goes
    default: break
    }
  }
  #endif
}

/// What the tank form edits, as typed. A field left empty is removed from the record; keys a newer client added stay.
struct TankFields: Equatable {
  /// The site form's limits (its inputs' maxlength), within the store's.
  static let nameMax = 80
  static let notesMax = 4000

  var name = ""
  /// Inside length, width, height in cm, as typed ("64,8" or "64.8"): all three, from 1 to 1000, or none.
  var l = ""
  var w = ""
  var h = ""
  var substrate: String?
  var notes = ""

  init() {}

  init(_ t: Tank) {
    name = t.name
    if let d = t.dims { (l, w, h) = (Self.text(d.l), Self.text(d.w), Self.text(d.h)) }
    substrate = t.substrate
    notes = t.notes ?? ""
  }

  enum Problem: Equatable { case blankName, partialDims }

  var problem: Problem? {
    if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .blankName }
    if dims == nil && ![l, w, h].allSatisfy({ $0.trimmingCharacters(in: .whitespaces).isEmpty }) { return .partialDims }
    return nil
  }

  /// The size, when all three are given and in range.
  var dims: (l: Double, w: Double, h: Double)? {
    let v = [l, w, h].compactMap(Self.cm)
    return v.count == 3 ? (v[0], v[1], v[2]) : nil
  }

  /// The box of the inside size, in litres (what the form shows as it's typed).
  var litres: Double? { dims.map { $0.l * $0.w * $0.h / 1000 } }

  func apply(to t: inout Tank) {
    t.name = name.trimmingCharacters(in: .whitespacesAndNewlines)
    // Litres someone entered for the old size would no longer match a new one (as the site does).
    if let size = dims, t.dims.map({ $0.l != size.l || $0.w != size.w || $0.h != size.h }) ?? true { t.litres = nil }
    t.dims = dims
    t.substrate = substrate
    let n = notes.trimmingCharacters(in: .whitespacesAndNewlines)
    t.notes = n.isEmpty ? nil : n
  }

  /// At most `max` characters (Unicode scalars, as the store counts them).
  static func capped(_ s: String, _ max: Int) -> String {
    s.unicodeScalars.count > max ? String(String.UnicodeScalarView(s.unicodeScalars.prefix(max))) : s
  }

  private static func cm(_ s: String) -> Double? {
    let t = s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
    guard t.allSatisfy({ $0.isASCII && ($0.isNumber || $0 == ".") }), let v = Double(t), v >= 1, v <= 1000 else { return nil }
    return v
  }

  private static func text(_ v: Double) -> String { v.formatted(.number.grouping(.never).precision(.fractionLength(0...6))) }
}

/// Litres as the site writes them: one decimal under 100, whole above; halves round up, as the browser rounds.
func litresText(_ l: Double, digits: Int? = nil) -> String {
  let style = FloatingPointFormatStyle<Double>.number.rounded(rule: .toNearestOrAwayFromZero)
    .precision(.fractionLength(0...(digits ?? (l < 100 ? 1 : 0))))
  return String(localized: "\(l.formatted(style)) lít")
}

/// Substrates the site lists (Known.substrate), with its labels. A value from a newer client is shown as it is.
enum Substrate {
  static func label(_ value: String) -> String {
    switch value {
    case "soil": String(localized: "Phân nền (aqua soil)")
    case "sand": String(localized: "Cát")
    case "gravel": String(localized: "Sỏi")
    case "lava": String(localized: "Đá nham thạch")
    case "bare": String(localized: "Không trải nền")
    case "other": String(localized: "Nền khác")
    default: value
    }
  }
}
