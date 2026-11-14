import Chihiros
import ChihirosBLE
import Plugs
import Tanks
import Telemetry

extension Event.Kind {
  /// An error, for the app's anonymous telemetry, by its case alone: never its text or what it holds (a light's name, a
  /// maker's code, a tank's problems). An error the app has no case for here is `other`. A new case in one of these
  /// errors doesn't build until it's given one here.
  init(_ error: any Error) {
    switch error {
    case let e as BluetoothError:
      self = switch e {
      case .unauthorized: .unauthorized
      case .poweredOff: .poweredOff
      case .unsupported: .unsupported
      case .timeout: .timeout
      case .notFound: .notFound
      case .disconnected: .disconnected
      case .noUART: .noUART
      case .failed: .failed
      case .busy: .busy
      // A Week Aqua light of a code the app doesn't drive; one with no service to write to, as a light with no UART.
      case .notSupported: .unsupportedModel
      case .noWeekAquaService: .noUART
      }
    case let e as SessionError:
      self = switch e {
      case .firmwareTooOld: .firmwareTooOld
      case .noStatus: .noStatus
      }
    #if DEBUG
    // The stand-in light's own error (the kit has it in debug builds only).
    case is FakeLightError: self = .disconnected
    #endif
    case let e as PlugError:
      self = switch e {
      case .offline: .offline
      case .badKeys: .badKeys
      case .expired: .expired
      case .notSubscribed: .notSubscribed
      case .quota: .quota
      case .busy: .busy
      case .clock: .clock
      case .noAccess: .noAccess
      case .plugOffline: .plugOffline
      case .noSuchPlug: .noSuchPlug
      case .maker: .maker
      case .badReply: .badReply
      }
    case let e as TankStoreError:
      self = switch e {
      case .unknownVersion: .unknownVersion
      case .notAStore: .notAStore
      case .tooManyTanks: .tooManyTanks
      case .tooManyDevices: .tooManyDevices
      case .blankName: .blankName
      case .notFound: .notFound
      case .invalid: .invalid
      }
    default: self = .other
    }
  }
}
