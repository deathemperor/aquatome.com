import Foundation
import Observation

/// Who sees the owner's dashboard, and what the app keeps of it. The overview answering an account 200 says it's the
/// owner's; the Worker's 404 `not_found` says it isn't, remembered for that account until it signs out or another signs
/// in. A 401 is the session ending: the account is signed out (`ended`), what was read goes, and the row stays to say
/// so. Every request goes with the session signed in when it left, and its answer is dropped if that changed on the way.
@Observable
@MainActor
public final class OwnerAccess {
  /// nil until the overview answers this account: true, the owner's; false, not.
  public private(set) var isOwner: Bool?
  /// A reply said the session is over: the row stays, saying so, until an account signs in.
  public private(set) var sessionEnded = false
  /// The overview, as last read.
  public private(set) var dashboard: Owner.Dashboard?
  /// Changes each time what was read must go (another account, signed out, the session over): screens drop theirs.
  public private(set) var era = 0
  /// The photos shown, in memory only and bounded (each costs its pixels' bytes): the owner's private data is never
  /// written down.
  @ObservationIgnored public let pictures = NSCache<NSString, AnyObject>()

  @ObservationIgnored private let send: Send
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private let session: @MainActor () -> (id: String, token: String)?
  @ObservationIgnored private let ended: @MainActor () -> Void
  /// The account the rules last applied to.
  @ObservationIgnored private var askedFor: String?
  /// The account the overview answered not the owner's, kept across launches.
  static let notOwner = "owner.notOwner"

  /// `session`: the account signed in and its token, now. `ended`: signs it out, as a sync told its session is over does.
  public init(send: @escaping Send, defaults: UserDefaults = .standard, session: @escaping @MainActor () -> (id: String, token: String)?,
              ended: @escaping @MainActor () -> Void) {
    self.send = send
    self.defaults = defaults
    self.session = session
    self.ended = ended
    pictures.totalCostLimit = 48 << 20
  }

  /// After a sign-in, a sign-out, and each sync: asks once whether the account signed in is the owner's.
  public func check() async {
    guard let id = session()?.id else {
      // Signed out by hand: nothing kept. Signed out by a 401: the row stays, to say why.
      if !sessionEnded { forget() }
      defaults.removeObject(forKey: Self.notOwner)
      return
    }
    if id != askedFor { forget() }
    askedFor = id
    sessionEnded = false
    if let no = defaults.string(forKey: Self.notOwner) {
      if no == id { isOwner = false } else { defaults.removeObject(forKey: Self.notOwner) }
    }
    guard isOwner == nil else { return }
    do { try await overview() } catch { await failed(error, overview: true) }
  }

  /// The overview, read again.
  public func overview() async throws {
    let d = try await ask { try await $0.dashboard() }
    // A newer read started since: it decides.
    try Task.checkCancellation()
    dashboard = d
    isOwner = true
  }

  /// A request with the session signed in now. Its answer, or its failure, is dropped (CancellationError) when the
  /// session changed on the way: signed out, or another account signed in.
  public func ask<T>(_ call: (OwnerClient) async throws -> T) async throws -> T {
    guard let sent = session()?.token else { throw OwnerError.signedOut }
    do {
      let r = try await call(OwnerClient(send: send, token: sent))
      guard session()?.token == sent else { throw CancellationError() }
      // Answered: the owner's after all.
      defaults.removeObject(forKey: Self.notOwner)
      return r
    } catch _ where session()?.token != sent {
      throw CancellationError()
    }
  }

  /// A page of the site a cell links to (from "/"), as an address.
  public func page(_ href: String) -> URL? { OwnerClient(send: send, token: "").page(href) }

  /// A photo's bytes, with the session signed in now (nil when gone, not the owner's, or the session changed).
  public func image(_ src: String) async -> Data? {
    try? await ask { await $0.image(src) }
  }

  /// What a failure means for who sees what: a 401 ends the session (the row stays); the overview's 404 is not the
  /// owner; a section's or a button's 404 may be one gone, so the overview is asked again, and decides.
  public func failed(_ e: Error, overview: Bool) async {
    switch e as? OwnerError {
    case .signedOut? where session() != nil:
      // Before the account signs out, so the check that follows keeps the row.
      sessionEnded = true
      drop()
      ended()
    case .notFound? where overview:
      drop()
      isOwner = false
      if let askedFor { defaults.set(askedFor, forKey: Self.notOwner) }
    case .notFound?:
      do { try await self.overview() } catch { await failed(error, overview: true) }
    default:
      break
    }
  }

  /// What was read goes; whose it is stays known.
  private func drop() {
    dashboard = nil
    pictures.removeAllObjects()
    era += 1
  }

  private func forget() {
    drop()
    isOwner = nil
    askedFor = nil
  }
}
