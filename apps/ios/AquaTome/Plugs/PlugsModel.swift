import Foundation
import Observation
import Plugs

/// The reader's smart plugs (docs/smart-plugs.md): the Tuya project keys kept on this phone, the source they open
/// (Tuya's cloud, called by the phone; no AquaTome account), and the board the tank screens show. Without keys there
/// is no source, and nothing is asked of anyone.
@Observable
@MainActor
final class PlugsModel {
  let board = PlugBoard()
  /// The data center of the keys kept here; nil when there are none.
  private(set) var dataCenter: TuyaDataCenter?
  /// Whose plugs the board shows (the keys' digest): the tank screen reads the list again when it changes.
  private(set) var owner: String?

  enum Check: Equatable {
    /// The keys work; they're kept.
    case ok(PlugList)
    /// Tuya refused them, or couldn't be reached: not kept.
    case failed(PlugError)
    /// They work, but the Keychain wouldn't keep them.
    case notKept
  }

  @ObservationIgnored private let store: TuyaKeyStore
  @ObservationIgnored private let source: (TuyaKeys) -> TuyaPlugs
  @ObservationIgnored private var current: TuyaPlugs?

  init(store: TuyaKeyStore = TuyaKeyStore(), source: @escaping (TuyaKeys) -> TuyaPlugs = { TuyaPlugs(keys: $0) }) {
    self.store = store
    self.source = source
    // The Keychain outlives the app: a reinstall starts with no keys, as a first install does.
    if !UserDefaults.standard.bool(forKey: "plugs.installed") {
      store.delete()
      UserDefaults.standard.set(true, forKey: "plugs.installed")
    }
    if let keys = store.read() { use(keys) }
  }

  /// The tank screen opened, or the reader pulled to refresh.
  func refresh() async { await board.refresh(current) }

  /// Reads the list with these keys, and keeps them once they work.
  func check(_ keys: TuyaKeys) async -> Check {
    let s = source(keys)
    let list: PlugList
    do { list = try await s.list() } catch { return .failed(error as? PlugError ?? .badReply) }
    do { try store.save(keys) } catch { return .notKept }
    use(keys, s)
    return .ok(list)
  }

  /// Forgets the keys on this phone. The plug records on tanks stay; nothing is switched.
  func removeKeys() async {
    store.delete()
    current = nil
    dataCenter = nil
    owner = nil
    await board.refresh(nil)
  }

  private func use(_ keys: TuyaKeys, _ s: TuyaPlugs? = nil) {
    let s = s ?? source(keys)
    current = s
    dataCenter = keys.dataCenter
    owner = s.owner
  }

  #if DEBUG
  /// The simulator (every UI test): a stand-in Tuya cloud with made-up keys and strips, keys kept in memory, so no test
  /// reaches Tuya; `-seed-tuya-keys` starts with its keys entered. `-real-tuya` tries Tuya itself from the simulator.
  static func forSimulator(_ args: [String]) -> PlugsModel {
    let fake = FakeTuya(accessId: standInKeys.accessId, accessSecret: standInKeys.accessSecret, devices: [
      FakeTuya.Device(id: "fake-strip-1", name: "Ổ cắm bể 60", status: [("switch_1", .bool(true)), ("switch_2", .bool(false)), ("switch_3", .bool(false)), ("switch_led", .bool(true))],
                      names: [("switch_1", "Đèn"), ("switch_2", "CO2")]),
      // One that never confirms, one that drops off the network when switched.
      { var d = FakeTuya.Device(id: "fake-strip-2", name: "Ổ cắm kệ", status: [("switch_1", .bool(true))], names: [("switch_1", "Lọc")]); d.ignores = true; return d }(),
      { var d = FakeTuya.Device(id: "fake-strip-3", name: "Ổ cắm ban công", status: [("switch_1", .bool(true))], names: [("switch_1", "Sủi khí")]); d.dropsOff = true; return d }(),
      FakeTuya.Device(id: "fake-sensor", name: "Nhiệt kế", status: [("va_temperature", .number(260))]),
    ])
    let model = PlugsModel(store: TuyaKeyStore(inMemory: true)) { TuyaPlugs(keys: $0, send: { try await fake.send($0) }) }
    if args.contains("-seed-tuya-keys") {
      TuyaKeyStore.memory = standInKeys
      model.use(standInKeys)
    }
    return model
  }

  /// The stand-in project's keys, as a UI test types them.
  static let standInKeys = TuyaKeys(accessId: "fake-access-id", accessSecret: "fake-access-secret", dataCenter: .westernAmerica)
  #endif
}
