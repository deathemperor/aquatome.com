import Foundation

// Which outlet powers a light (docs/smart-plugs.md): the reader picks it once from the plugs on the light's tank, and it
// is kept on the light's record as `powerOutlet`, the plug's record id and the outlet's switch code. The app reads that
// outlet's timers in the maker's app to warn of one that cuts the light's power.

/// The outlet a light is plugged into: a plug record on the light's tank, and the outlet's switch code.
public struct PowerOutlet: Sendable, Equatable {
  public let plugId: String
  public let code: String
  public init(plugId: String, code: String) {
    self.plugId = plugId
    self.code = code
  }
}

/// One outlet of a plug on a tank, as a light's card offers it.
public struct TankOutlet: Sendable, Equatable, Identifiable {
  public let plug: Device
  public let outlet: PlugOutlet
  /// Its place on the strip, from 1.
  public let number: Int
  public var id: String { plug.id + "|" + outlet.code }
  public var pick: PowerOutlet { PowerOutlet(plugId: plug.id, code: outlet.code) }
}

extension Device {
  /// Lights: the outlet it's plugged into, once the reader has picked one.
  public var powerOutlet: PowerOutlet? {
    get {
      guard let o = json["powerOutlet"]?.object, let plugId = o["plugId"]?.string, let code = o["code"]?.string else { return nil }
      return PowerOutlet(plugId: plugId, code: code)
    }
    set { set("powerOutlet", newValue.map { .object(["plugId": .string($0.plugId), "code": .string($0.code)]) }) }
  }
}

extension TankStore {
  /// What a light can be plugged into: the outlets of the plugs on its tank, in order.
  public func outlets(for light: Device) -> [TankOutlet] {
    guard light.kind == "light" else { return [] }
    return plugs(in: light.tankId).flatMap { p in p.outlets.enumerated().map { TankOutlet(plug: p, outlet: $1, number: $0 + 1) } }
  }

  /// The outlet the reader picked for this light, while that plug is still on the light's tank with that outlet.
  public func powerOutlet(of light: Device) -> TankOutlet? {
    guard let pick = light.powerOutlet else { return nil }
    return outlets(for: light).first { $0.pick == pick }
  }

  /// The outlet to offer first: the first one named for a light. Only offered; never kept until the reader picks it.
  public func suggestedOutlet(for light: Device) -> TankOutlet? { outlets(for: light).first { $0.outlet.looksLikeLight } }
}

extension PlugOutlet {
  /// Given the light role, or named for one: "light" anywhere in its name, or "đèn" as a word, ignoring case and
  /// accents, đ as d ("Đèn", "den 1", "Moonlight"; not "Garden").
  public var looksLikeLight: Bool {
    if role == "light" { return true }
    guard let label else { return false }
    let folded = label.replacingOccurrences(of: "đ", with: "d").replacingOccurrences(of: "Đ", with: "d")
      .folding(options: [.caseInsensitive, .diacriticInsensitive, .widthInsensitive], locale: nil).lowercased()
    return folded.contains("light") || folded.split { !$0.isLetter }.contains("den")
  }
}
