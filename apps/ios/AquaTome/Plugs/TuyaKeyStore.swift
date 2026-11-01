import Foundation
import Plugs
import Security

/// The reader's Tuya project keys (docs/smart-plugs.md), in the Keychain: on this phone only (not in iCloud Keychain or
/// a backup restored to another phone), readable once the phone has been unlocked after a restart. Never logged, never
/// in UserDefaults, never sent anywhere but to Tuya, which the requests are signed for.
struct TuyaKeyStore {
  #if DEBUG
  /// The simulator's stand-in cloud: its made-up keys are kept in memory for the run (an unsigned simulator build, as
  /// CI's, has no Keychain), never in UserDefaults.
  var inMemory = false
  @MainActor static var memory: TuyaKeys?
  #endif

  private let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "com.aquatome.app.tuya",
    kSecAttrAccount as String: "project",
    kSecAttrSynchronizable as String: kCFBooleanFalse!,
  ]

  @MainActor
  func read() -> TuyaKeys? {
    #if DEBUG
    if inMemory { return Self.memory }
    #endif
    var q = query
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data,
          let o = try? JSONSerialization.jsonObject(with: data) as? [String: String],
          let id = o["accessId"], let secret = o["accessSecret"], let dc = o["dataCenter"].flatMap(TuyaDataCenter.init(rawValue:))
    else { return nil }
    return TuyaKeys(accessId: id, accessSecret: secret, dataCenter: dc)
  }

  @MainActor
  func save(_ keys: TuyaKeys) throws {
    #if DEBUG
    if inMemory { Self.memory = keys; return }
    #endif
    let item: [String: Any] = [
      kSecValueData as String: try JSONSerialization.data(withJSONObject: ["accessId": keys.accessId, "accessSecret": keys.accessSecret, "dataCenter": keys.dataCenter.rawValue]),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
    ]
    // Replaced in place, so keys that fail to save don't take the kept ones with them.
    var status = SecItemUpdate(query as CFDictionary, item as CFDictionary)
    if status == errSecItemNotFound { status = SecItemAdd(query.merging(item) { a, _ in a } as CFDictionary, nil) }
    guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
  }

  @MainActor
  func delete() {
    #if DEBUG
    if inMemory { Self.memory = nil; return }
    #endif
    SecItemDelete(query as CFDictionary)
  }
}
