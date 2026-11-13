import Foundation

/// This install's id: random (a UUID v4), made the first time events go to the queue with both switches on, kept in
/// UserDefaults (not the keychain, so it goes when the app is deleted, as the privacy policy says) and made anew after
/// 13 months, as the site's visitor code is. Sent only in a batch of events (`Batch.install`), never in another request,
/// never beside the account. The reader's switch off deletes it, so on again starts a new one.
/// Unchecked: UserDefaults isn't marked Sendable, but Apple documents it as safe to use from any thread.
public struct Install: @unchecked Sendable {
  static let idKey = "telemetry.install"
  static let madeKey = "telemetry.install.made"
  private let defaults: UserDefaults
  private let today: @Sendable () -> Date

  public init(defaults: UserDefaults = .standard, today: @escaping @Sendable () -> Date = { Date() }) {
    self.defaults = defaults
    self.today = today
  }

  /// The id, made now when there's none, or the one there is was made 13 months ago or more.
  func id() -> String {
    let now = today()
    if let id = defaults.string(forKey: Self.idKey), let made = defaults.object(forKey: Self.madeKey) as? Date,
       let renewed = Calendar(identifier: .gregorian).date(byAdding: .month, value: 13, to: made), now < renewed {
      return id
    }
    let id = UUID().uuidString.lowercased()
    defaults.set(id, forKey: Self.idKey)
    defaults.set(now, forKey: Self.madeKey)
    return id
  }

  /// Deleted: the reader turned telemetry off.
  func forget() {
    defaults.removeObject(forKey: Self.idKey)
    defaults.removeObject(forKey: Self.madeKey)
  }
}
