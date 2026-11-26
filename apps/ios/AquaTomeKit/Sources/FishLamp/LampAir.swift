import Foundation

/// Why a broadcast to the lamp didn't start. `cut`: it was handed to Bluetooth, then replaced, stopped, or Bluetooth went
/// off or reset before Bluetooth said it had started: it may have gone out (Codex, 18 Nov). The others: nothing went.
public enum LampAirError: Error, Sendable, Equatable { case off, refused, unsupported, failed, cut }

/// Bluetooth as the air reads it.
public enum LampBluetooth: Sendable, Equatable {
  case on, off, refused, unsupported
  /// Not known yet, or resetting: wait for it.
  case notYet
}

/// The phone's Bluetooth advertiser as the air uses it: the app's CBPeripheralManager, or a test's stand-in. Its state
/// changes and its answers to a start come back through `LampAirCore.stateChanged` and `answered`.
@MainActor
public protocol LampPeripheral: AnyObject {
  var bluetooth: LampBluetooth { get }
  func startAdvertising(_ uuids: [String])
  func stopAdvertising()
}

/// The phone's broadcasts to the lamp as Bluetooth takes them; the app's BluetoothLampAir is this over CoreBluetooth.
/// One at a time: one asked while another waits for Bluetooth replaces it, and is told it didn't go. A start handed to
/// Bluetooth and not answered yet, when it is replaced, stopped, or Bluetooth goes off or resets, is told it may have
/// gone out (`.cut`), and its peripheral is let go: the next start has a new one, so a late answer from the old one is
/// never taken for another start's (Codex, 18 Nov). Each broadcast is told once: started (nil), why not, or cut.
@MainActor
public final class LampAirCore {
  public typealias Done = @MainActor (LampAirError?) -> Void

  private let make: @MainActor () -> any LampPeripheral
  private var peripheral: (any LampPeripheral)?
  /// The one last let go, kept until the next is: never released inside its own callback.
  private var retired: (any LampPeripheral)?
  /// Asked, and not handed to Bluetooth yet: Bluetooth not on yet.
  private var waiting: (uuids: [String], allowed: @MainActor () -> Bool, done: Done)?
  /// The start handed to Bluetooth and not answered yet.
  private var starting: Done?

  /// `make`: a peripheral, at the first start and after one is let go (the app's is made then, not when a screen opens).
  public init(make: @escaping @MainActor () -> any LampPeripheral) { self.make = make }

  /// Broadcasts the 16-bit service UUIDs until `stop`; `done` says whether it started. `allowed` is asked right before
  /// it is handed to Bluetooth, after any wait for it: no, and it doesn't go (`.failed`).
  public func start(_ uuids: [String], allowed: @escaping @MainActor () -> Bool, done: @escaping Done) {
    if let w = waiting {
      waiting = nil
      w.done(.failed)
    }
    cut()
    waiting = (uuids, allowed, done)
    go()
  }

  /// Ends the broadcast: one waiting for Bluetooth is told it didn't go, one handed and not answered that it may have.
  public func stop() {
    if let w = waiting {
      waiting = nil
      w.done(.failed)
    }
    cut()
    if peripheral?.bluetooth == .on { peripheral?.stopAdvertising() }
  }

  /// Bluetooth's state changed, on `p`.
  public func stateChanged(_ p: any LampPeripheral) {
    guard p === peripheral else { return }
    if p.bluetooth != .on { cut() }
    go()
  }

  /// Bluetooth answered the start handed to `p`: `started`, or an error (then nothing went).
  public func answered(_ p: any LampPeripheral, started: Bool) {
    guard p === peripheral, let done = starting else { return }
    starting = nil
    done(started ? nil : .failed)
  }

  /// The start handed to Bluetooth and not answered: told it may have gone out, and its peripheral stopped (while
  /// Bluetooth is on: off, it stops by itself) and let go.
  private func cut() {
    guard let done = starting else { return }
    starting = nil
    if peripheral?.bluetooth == .on { peripheral?.stopAdvertising() }
    retired = peripheral
    peripheral = nil
    done(.cut)
  }

  /// Hands the one waiting to Bluetooth once it is on.
  private func go() {
    guard let w = waiting, starting == nil else { return }
    let p: any LampPeripheral
    if let current = peripheral {
      p = current
    } else {
      p = make()
      peripheral = p
    }
    let refusal: LampAirError
    switch p.bluetooth {
    case .notYet: return
    case .off: refusal = .off
    case .refused: refusal = .refused
    case .unsupported: refusal = .unsupported
    case .on:
      waiting = nil
      // Asked as it is handed: what it was asked for may no longer stand after the wait (the master button's owner
      // signed out, Codex, 17 Nov).
      guard w.allowed() else { return w.done(.failed) }
      p.stopAdvertising()
      starting = w.done
      p.startAdvertising(w.uuids)
      return
    }
    waiting = nil
    w.done(refusal)
  }
}
