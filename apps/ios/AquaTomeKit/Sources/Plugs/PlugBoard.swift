import Foundation
import Observation

/// The reader's plugs as the app shows them, and switching one outlet, by the rules of docs/smart-plugs.md, from
/// whichever `PlugSource` the app has:
///
/// - The list is read when asked (a screen opening, pull to refresh), never on a timer.
/// - A switch goes only when `set` is called (the reader's tap), to a plug listed online, one at a time per outlet. It
///   sets a state, never toggles, and is never sent again or queued.
/// - An outlet shows what the plug last reported: the latest of the list and this phone's switch answers, never what was
///   asked. A switch the plug didn't confirm, or whose answer was lost (the maker's error, no network), reads the list
///   again once; the outlet is unknown until something reports it.
/// - Nothing here is stored: the plug records on tanks hold no state.
@Observable
@MainActor
public final class PlugBoard {
  public struct Outlet: Hashable, Sendable {
    public let provider: String
    public let device: String
    public let code: String
    public init(provider: String, device: String, code: String) {
      self.provider = provider
      self.device = device
      self.code = code
    }
  }

  /// How an outlet's last switch from this phone went.
  public enum Outcome: Equatable, Sendable {
    /// The plug reported the state asked for (in the switch's answer or when the list was read again).
    case confirmed
    /// The list was read again and the plug still reports another state.
    case unconfirmed
    /// It may have switched and nothing has reported it since (the maker's error, or the answer lost).
    case unknown
    /// Refused before anything reached the plug: nothing switched.
    case refused(PlugError)
  }

  /// The last list read, nil until one is.
  public private(set) var list: PlugList?
  /// The last read failed: why.
  public private(set) var listError: PlugError?
  /// Outlets being switched now.
  public private(set) var switching: Set<Outlet> = []
  /// Lists being read now.
  private var reading = 0
  public var loading: Bool { reading > 0 }

  /// Where the list comes from: answers from one with another owner (the keys changed since) are dropped.
  private var source: (any PlugSource)?
  /// Counts list reads started and switch answers, to know which is newer.
  private var tick = 0
  private var listAt = 0
  /// Outlets as switch answers reported them, and plugs a switch found offline, since the list: until a list read
  /// started after them.
  private var reported: [Outlet: (on: Bool?, at: Int)] = [:]
  private var foundOffline: [String: Int] = [:]
  private var outcomes: [Outlet: (outcome: Outcome, at: Int)] = [:]

  public init() {}

  /// The outlet as last reported; nil when it isn't known (not listed, or a switch's answer lost).
  public func on(_ o: Outlet) -> Bool? {
    if let r = reported[o] { return r.on }
    return list?.plug(provider: o.provider, id: o.device)?.outlets.first { $0.code == o.code }?.on
  }

  /// Whether the plug is online; nil when it isn't listed.
  public func online(provider: String, device: String) -> Bool? {
    guard let p = list?.plug(provider: provider, id: device) else { return nil }
    return foundOffline[provider + "|" + device] == nil && p.online
  }

  public func outcome(_ o: Outlet) -> Outcome? { outcomes[o]?.outcome }

  /// Reads the list (the screen opened, or the reader pulled to refresh), from this source from now on. The notes on
  /// earlier switches go: what is shown from here is what the list says. No source (no keys): nothing shown.
  public func refresh(_ source: (any PlugSource)?) async {
    guard let source else { return forget() }
    if source.owner != self.source?.owner { forget() }
    self.source = source
    if let started = await read(source) { outcomes = outcomes.filter { $0.value.at > started } }
  }

  /// Sets one outlet, on the reader's tap. Not sent while it's being switched already, or unless its plug is listed
  /// online.
  public func set(_ o: Outlet, on: Bool) async {
    guard let source, !switching.contains(o), online(provider: o.provider, device: o.device) == true else { return }
    let owner = source.owner
    switching.insert(o)
    defer { switching.remove(o) }
    outcomes[o] = nil
    do {
      let r = try await source.set(provider: o.provider, device: o.device, outlet: o.code, on: on)
      guard owner == self.source?.owner else { return }
      tick += 1
      reported[o] = (r.on, tick)
      if r.confirmed { return note(o, .confirmed) }
    } catch is CancellationError {
      return
    } catch let e as PlugError where e.nothingSent {
      guard owner == self.source?.owner else { return }
      if e == .plugOffline {
        tick += 1
        foundOffline[o.provider + "|" + o.device] = tick
      }
      return note(o, .refused(e))
    } catch {
      // The maker's error, no network, or an answer this app can't read: the command may have reached the plug.
      guard owner == self.source?.owner else { return }
      tick += 1
      reported[o] = (nil, tick)
    }
    // Not confirmed: the list once more (never the switch), then what the plug reports.
    _ = await read(source)
    guard owner == self.source?.owner else { return }
    let now = self.on(o)
    note(o, now == on ? .confirmed : now == nil ? .unknown : .unconfirmed)
  }

  /// One list read; when it's the newest answer, it replaces what switch answers reported before it started. Its start,
  /// or nil when it failed or was dropped.
  private func read(_ source: any PlugSource) async -> Int? {
    tick += 1
    let started = tick
    reading += 1
    defer { reading -= 1 }
    do {
      let l = try await source.list()
      guard source.owner == self.source?.owner, started > listAt else { return nil }
      listAt = started
      list = l
      listError = nil
      reported = reported.filter { $0.value.at > started }
      foundOffline = foundOffline.filter { $0.value > started }
      return started
    } catch is CancellationError {
      return nil
    } catch {
      if source.owner == self.source?.owner { listError = error as? PlugError ?? .badReply }
      return nil
    }
  }

  private func note(_ o: Outlet, _ outcome: Outcome) {
    tick += 1
    outcomes[o] = (outcome, tick)
  }

  private func forget() {
    source = nil
    list = nil
    listError = nil
    reported = [:]
    foundOffline = [:]
    outcomes = [:]
    listAt = 0
  }
}
