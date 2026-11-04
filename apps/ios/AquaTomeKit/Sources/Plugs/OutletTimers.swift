import Foundation
import Observation

/// What a light's card shows of the timers on the outlet the light is plugged into (docs/smart-plugs.md): read once when
/// the card opens, or when another outlet is picked; never again while the card stays open, never on a timer, never kept.
/// A new card (the light connected again) is a new read.
@Observable
@MainActor
public final class OutletTimers {
  public enum State: Equatable, Sendable {
    /// The timers that cut the outlet's power from now on; none, when the read found none.
    case read([PlugTimer])
    /// The read failed: why.
    case failed(PlugError)
  }

  /// Nil until a read answers, and without keys.
  public private(set) var state: State?
  /// The source's owner and the outlet last asked about: asked again, nothing is sent.
  @ObservationIgnored private var asked: String?

  public init() {}

  public func open(_ source: (any PlugSource)?, provider: String, device: String, code: String, at now: Date) async {
    guard let source else {
      asked = nil
      state = nil
      return
    }
    let key = [source.owner, provider, device, code].joined(separator: "|")
    guard key != asked else { return }
    asked = key
    state = nil
    do {
      let timers = try await source.timers(provider: provider, device: device)
      guard asked == key else { return } // another outlet picked meanwhile
      state = .read(timers.filter { $0.cuts(code, at: now) })
    } catch is CancellationError {
      if asked == key { asked = nil } // the card closed before the answer: nothing read
    } catch {
      guard asked == key else { return }
      state = .failed(error as? PlugError ?? .badReply)
    }
  }
}
