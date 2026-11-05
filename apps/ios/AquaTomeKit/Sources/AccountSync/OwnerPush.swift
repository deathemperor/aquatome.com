import Foundation
import Observation

/// The daily report's notifications on this phone (docs/contracts/owner-push.md, #592): the owner turns them on here, and the phone's
/// token goes to the site with the owner's session, once a launch (the site keeps one of each), while they're on and the
/// account signed in is the owner's. Turned off, or before the account signs out, the token the site has is taken back.
/// Whether the site sends any is the owner's setting there ("Báo cáo"); this is only whether this phone gets them.
@Observable
@MainActor
public final class OwnerPush {
  /// The owner turned them on, on this phone (kept across launches).
  public private(set) var wanted: Bool
  /// This launch's token from APNs, as lowercase hex.
  public private(set) var token: String?

  @ObservationIgnored private let owner: OwnerAccess
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let environment: String
  /// The token sent this launch (sent again only if APNs gives another).
  @ObservationIgnored private var sentNow: String?
  static let wantedKey = "owner.push.wanted"
  /// The token the site was last given from this phone, kept across launches: what a turn-off or a sign-out takes back.
  static let sentKey = "owner.push.sent"

  /// `environment`: the APNs this build's tokens are from, `sandbox` (a debug build) or `production` (TestFlight, the
  /// App Store).
  public init(owner: OwnerAccess, environment: String, defaults: UserDefaults = .standard) {
    self.owner = owner
    self.environment = environment
    self.defaults = defaults
    wanted = defaults.bool(forKey: Self.wantedKey)
  }

  /// The token APNs gave this launch; sent if it can be.
  public func received(_ token: Data) async {
    self.token = token.map { String(format: "%02x", $0) }.joined()
    await send()
  }

  /// Turned on (the phone's permission asked for and given) or off, on this phone.
  public func want(_ on: Bool) async {
    wanted = on
    defaults.set(on, forKey: Self.wantedKey)
    if on { await send() } else { await takeBack() }
  }

  /// What this phone's notifications need, once the owner is known (after a sign-in, each sync), and when the token
  /// comes: wanted, the token sent if it wasn't this launch; not wanted, one the site still has from a take-back that
  /// failed (offline, the server busy) taken back now.
  public func send() async {
    guard owner.isOwner == true else { return }
    guard wanted else { return await takeBack() }
    guard let token, token != sentNow else { return }
    do {
      try await owner.ask { try await $0.pushToken(token, environment: self.environment) }
      sentNow = token
      defaults.set(token, forKey: Self.sentKey)
      // Turned off while it was on its way: taken back at once.
      if !wanted { await takeBack() }
    } catch {
      // Tried again at the next launch or sync: a notification missed isn't worth a word on the screen. Only a session
      // over means more (the account is signed out, as a sync told so is).
      await ended(error)
    }
  }

  /// Before the account signs out (its session still good): the site stops sending to this phone.
  public func signingOut() async {
    await takeBack()
    sentNow = nil
  }

  private func takeBack() async {
    guard let sent = defaults.string(forKey: Self.sentKey) else { return }
    do {
      try await owner.ask { try await $0.pushToken(sent, environment: nil) }
      defaults.removeObject(forKey: Self.sentKey)
      sentNow = nil
    } catch {
      // Kept, to take back at the next sync: the site may still send to this phone until then.
      await ended(error)
    }
  }

  private func ended(_ error: Error) async {
    if case .signedOut? = error as? OwnerError { await owner.failed(error, overview: false) }
  }

  /// The page a notification opens (its `url`): only one of aquatome.com's over https; anything else opens nothing.
  nonisolated public static func page(_ info: [AnyHashable: Any], site: URL = AccountsClient.site) -> URL? {
    guard let s = info["url"] as? String, let u = URL(string: s), u.scheme?.lowercased() == "https", u.user == nil, u.port == nil,
          let host = u.host(percentEncoded: true)?.lowercased(), let ours = site.host?.lowercased(),
          host == ours || host == "www." + ours else { return nil }
    return u
  }
}
