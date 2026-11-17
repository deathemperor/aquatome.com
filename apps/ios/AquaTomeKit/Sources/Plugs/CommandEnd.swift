import Foundation

/// How one of the master button's commands ended, as its card says it: a plug's from the plug board's answer to that
/// very call (`PlugBoard.set`), the lamp's from what it broadcast. A command any of which may have reached the device
/// never ends as one not sent, whatever happened since it left: the owner signing out, the outlet's role changing, the
/// Tuya keys changing (the chief, 17 Nov). Pure; the app words each.
public enum CommandEnd: Equatable, Sendable {
  /// It went, and the device did as asked: the plug confirmed it, or every one of the lamp's recordings went out.
  case done

  // Nothing reached the device: the card may say it wasn't sent.
  /// Withdrawn before any of it went: the owner signed out since the press, or the outlet's role no longer allows it.
  case withdrawn(Withdrawal)
  /// The plug board sent nothing: its plug no longer listed online, or being switched.
  case notSent
  /// Refused before it reached the plug (the keys refused, the plan run out, the plug offline): nothing switched.
  case refused(PlugError)
  /// None of the lamp's recordings went out.
  case lampNotSent

  // Some of it may have reached the device: the card never says it wasn't sent.
  /// The list was read again and the plug still reports the other state.
  case unconfirmed
  /// It may have switched, and nothing has reported it since: its answer lost, or the keys changed on its way.
  case unknown
  /// The lamp's "on" went out and its colour didn't: the lamp is on, in a colour not known.
  case lampOnOnly(LampWhy)

  public enum Withdrawal: Equatable, Sendable {
    case signedOut
    case role
  }

  /// Why the lamp's colour didn't follow its "on".
  public enum LampWhy: Equatable, Sendable {
    /// The owner signed out after "on".
    case signedOut
    /// The lamp's own reason (Bluetooth off, or not allowed).
    case own
    /// Its broadcast didn't start, and no reason is known.
    case unknown
  }

  /// Nothing of it reached the device.
  public var nothingSent: Bool {
    switch self {
    case .withdrawn, .notSent, .refused, .lampNotSent: true
    case .done, .unconfirmed, .unknown, .lampOnOnly: false
    }
  }

  /// A plug's command, by what the board answered that call (`outcome`: nil when it sent nothing) and why it would be
  /// withdrawn now (`withdrawn`): that reason only when nothing reached the plug.
  public static func plug(_ outcome: PlugBoard.Outcome?, withdrawn: Withdrawal?) -> CommandEnd {
    switch outcome {
    case .confirmed?: return .done
    case .unconfirmed?: return .unconfirmed
    case .unknown?: return .unknown
    // A refusal the board never gives (one after which a command may have reached the plug): as an answer lost.
    case .refused(let e)? where !e.nothingSent: return .unknown
    case .refused(let e)?: return withdrawn.map(CommandEnd.withdrawn) ?? .refused(e)
    case nil: return withdrawn.map(CommandEnd.withdrawn) ?? .notSent
    }
  }

  /// The lamp's command, by whether any of its recordings went out (`sentAny`), whether it failed, whether the lamp gave
  /// its own reason (`withReason`: Bluetooth off, not allowed; not when its broadcast only didn't start, as a recording
  /// withdrawn ends) and why it would be withdrawn now: that reason when nothing went; after "on", the sign-out only in
  /// place of no reason, the lamp's own reason kept.
  public static func lamp(sentAny: Bool, failed: Bool, withReason: Bool, withdrawn: Withdrawal?) -> CommandEnd {
    guard failed else { return .done }
    guard sentAny else { return withdrawn.map(CommandEnd.withdrawn) ?? .lampNotSent }
    return .lampOnOnly(withReason ? .own : withdrawn == .signedOut ? .signedOut : .unknown)
  }
}
