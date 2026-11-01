import Foundation

/// Where the reader's plugs come from (refusals are `PlugError`s): Tuya's cloud with the reader's own project keys (`TuyaPlugs`) today; another
/// way to reach them (an authorization of Smart Life for AquaTome) would be another source. `PlugBoard`, the app's
/// screens and the plug records on tanks depend only on this, never on which one is used.
public protocol PlugSource: Sendable {
  /// Whose plugs these are: answers from a source with another owner are dropped (the keys changed). Never shown.
  var owner: String { get }
  /// The plugs as they are now. Read when the reader opens or refreshes a screen, never on a timer.
  func list() async throws -> PlugList
  /// Sets one outlet once (never toggles, never retried, never queued), then reads it back: what the plug then
  /// reports, and whether that is the state asked for. Refused for a plug the last list didn't have online.
  func set(provider: String, device: String, outlet code: String, on: Bool) async throws -> Switched
}

/// An outlet as the plug reports it now.
public struct LiveOutlet: Sendable, Equatable {
  public let code: String
  /// The name the maker's app gives it.
  public let name: String?
  /// Nil when it isn't known.
  public let on: Bool?
  public init(code: String, name: String?, on: Bool?) {
    self.code = code
    self.name = name
    self.on = on
  }
}

/// One of the reader's plugs as its maker's cloud has it now: what a plug record on a tank shows.
public struct LivePlug: Sendable, Equatable, Identifiable {
  /// The maker: a plug record's `brand` ("tuya").
  public let provider: String
  /// The maker's id for the device: a plug record's `remoteId`.
  public let id: String
  /// As named in the maker's app.
  public let name: String
  public let online: Bool
  public let outlets: [LiveOutlet]
  public init(provider: String, id: String, name: String, online: Bool, outlets: [LiveOutlet]) {
    self.provider = provider
    self.id = id
    self.name = name
    self.online = online
    self.outlets = outlets
  }
}

public struct PlugList: Sendable, Equatable {
  /// Devices with at least one outlet.
  public let plugs: [LivePlug]
  /// Other devices listed (a sensor, a light), not shown: none at all means nothing is linked yet.
  public let others: Int
  public init(plugs: [LivePlug], others: Int) {
    self.plugs = plugs
    self.others = others
  }

  public func plug(provider: String, id: String) -> LivePlug? { plugs.first { $0.provider == provider && $0.id == id } }
}

/// A switch's answer: the outlet as the plug reported it after the command.
public struct Switched: Sendable, Equatable {
  /// What the plug reported last; nil if it couldn't be read.
  public let on: Bool?
  /// The plug reported the state asked for within 3 seconds.
  public let confirmed: Bool
  public init(on: Bool?, confirmed: Bool) {
    self.on = on
    self.confirmed = confirmed
  }
}

public enum PlugError: Error, Equatable, Sendable {
  /// No network, or the maker's cloud didn't answer: a command may have reached the plug.
  case offline
  /// The keys are refused: a wrong Access ID or Secret, or another data center's project.
  case badKeys
  /// The project's cloud plan (the free IoT Core trial) has run out or is unpaid: renew it in the console.
  case expired
  /// The project has no cloud plan, or isn't allowed this API (IoT Core not on).
  case notSubscribed
  /// The plan's calls are used up for now.
  case quota
  /// The maker's cloud is busy, or this app asked too often: try again in a moment.
  case busy
  /// The phone's clock is too far off for the maker's cloud to take a request.
  case clock
  /// The plug is offline: nothing sent.
  case plugOffline
  /// Not one of the reader's plugs (or not listed by the last read), or an outlet it doesn't have.
  case noSuchPlug
  /// The maker's cloud refused or failed, by its code: a command may have reached the plug.
  case maker(Int)
  /// An answer that isn't what the maker documents: a command may have reached the plug.
  case badReply

  /// Refused before anything could reach the plug: a switch that ends so is known not to have switched it.
  public var nothingSent: Bool {
    switch self {
    case .offline, .maker, .badReply: false
    case .badKeys, .expired, .notSubscribed, .quota, .busy, .clock, .plugOffline, .noSuchPlug: true
    }
  }
}
