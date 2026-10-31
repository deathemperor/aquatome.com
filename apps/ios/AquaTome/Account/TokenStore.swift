import Foundation
import Security

/// The account's session token, in the Keychain: on this phone only (not in iCloud Keychain or a backup restored to
/// another phone), readable once the phone has been unlocked after a restart, so a sync in the background works.
struct TokenStore {
  #if DEBUG
  /// UI tests: an unsigned simulator build (CI's) has no Keychain access, so the token goes to UserDefaults, which
  /// `-reset-defaults` clears.
  var inDefaults = false
  private let key = "account.testToken"
  #endif

  private let query: [String: Any] = [
    kSecClass as String: kSecClassGenericPassword,
    kSecAttrService as String: "com.aquatome.app.account",
    kSecAttrAccount as String: "session",
  ]

  func read() -> String? {
    #if DEBUG
    if inDefaults { return UserDefaults.standard.string(forKey: key) }
    #endif
    var q = query
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var out: CFTypeRef?
    guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let data = out as? Data else { return nil }
    return String(data: data, encoding: .utf8)
  }

  func save(_ token: String) throws {
    #if DEBUG
    if inDefaults { UserDefaults.standard.set(token, forKey: key); return }
    #endif
    delete()
    var q = query
    q[kSecValueData as String] = Data(token.utf8)
    q[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let status = SecItemAdd(q as CFDictionary, nil)
    guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
  }

  func delete() {
    #if DEBUG
    if inDefaults { UserDefaults.standard.removeObject(forKey: key); return }
    #endif
    SecItemDelete(query as CFDictionary)
  }
}
