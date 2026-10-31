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
  var canAdd: Bool { problem == nil && tanks.count < maxTanks }

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
    guard let data = try? Data(contentsOf: file) else { return } // none yet
    do { store = try TankStore(data: data) } catch TankStoreError.unknownVersion { problem = .newerStore } catch { problem = .unreadable }
  }

  static func defaultFile() -> URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("tanks", isDirectory: true).appendingPathComponent("store.json")
  }
}

/// What the tank form edits. A field left empty is removed from the record; keys a newer client added stay.
struct TankFields: Equatable {
  var name = ""
  /// Inside length × width × height, cm: all three or none.
  var l: Double?
  var w: Double?
  var h: Double?
  var substrate: String?
  var notes = ""

  init() {}

  init(_ t: Tank) {
    name = t.name
    if let d = t.dims { (l, w, h) = (d.l, d.w, d.h) }
    substrate = t.substrate
    notes = t.notes ?? ""
  }

  enum Problem: Equatable { case blankName, partialDims }

  var problem: Problem? {
    if name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { return .blankName }
    let given = [l, w, h].compactMap { $0 }
    if !given.isEmpty && (given.count < 3 || given.contains { !($0 >= 1 && $0 <= 1000) }) { return .partialDims }
    return nil
  }

  /// The box of the inside size, in litres (what the tank list shows).
  var litres: Double? { if let l, let w, let h { l * w * h / 1000 } else { nil } }

  func apply(to t: inout Tank) {
    t.name = name
    if let l, let w, let h { t.dims = (l, w, h) } else { t.dims = nil }
    t.substrate = substrate
    let n = notes.trimmingCharacters(in: .whitespacesAndNewlines)
    t.notes = n.isEmpty ? nil : n
  }
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
