import Foundation
import Tanks

/// A timer set on a plug in its maker's app (a schedule in Smart Life): at `time`, on its days, it sets each of its
/// outlets on or off. AquaTome reads them to warn of one that cuts a light's power (a light that keeps no time without
/// power then misses its own schedule), and never writes, changes or keeps them.
public struct PlugTimer: Sendable, Equatable {
  /// One outlet's switch code, and the state the timer sets it to.
  public struct Action: Sendable, Equatable {
    public let code: String
    public let on: Bool
    public init(code: String, on: Bool) {
      self.code = code
      self.on = on
    }
  }

  public let actions: [Action]
  /// "HH:mm", in the plug's own time zone, as the maker's app shows it.
  public let time: String
  /// The days it runs, Sunday first. None: it runs once, on `date`.
  public let days: [Bool]
  /// As the maker gives it ("20261105"): for a timer that runs once, its day.
  public let date: String?
  /// Turned on in the maker's app.
  public let enabled: Bool

  public init(actions: [Action], time: String, days: [Bool], date: String?, enabled: Bool) {
    self.actions = actions
    self.time = time
    self.days = days
    self.date = date
    self.enabled = enabled
  }

  public var everyDay: Bool { days.allSatisfy { $0 } }
  public var once: Bool { !days.contains(true) }

  /// Whether it cuts this outlet's power: turned on, and switching the outlet off.
  public func cuts(_ code: String) -> Bool { enabled && actions.contains { $0.code == code && !$0.on } }
}

extension PlugTimer {
  /// Tuya's answer to /v1.0/devices/{id}/timers: a list of categories, each with groups of timers, each timer with its
  /// `functions` (`{code, value}`), `loops` (seven 0s and 1s, Sunday first), `time`, `status` (1 on, 0 off) and `date`.
  /// Read leniently: a timer it can't read, or one that switches no outlet, is left out, not the whole list. None at all
  /// may come as no list.
  static func tuya(_ result: JSON) throws -> [PlugTimer] {
    if result == .null { return [] }
    guard let categories = result.array else { throw PlugError.badReply }
    return categories.flatMap { c in
      (c.object?["groups"]?.array ?? []).flatMap { g in (g.object?["timers"]?.array ?? []).compactMap(timer) }
    }
  }

  private static func timer(_ v: JSON) -> PlugTimer? {
    guard let o = v.object, let time = o["time"]?.string, time.wholeMatch(of: /\d\d:\d\d/) != nil,
          let loops = o["loops"]?.string, loops.count == 7, loops.allSatisfy({ $0 == "0" || $0 == "1" }),
          let status = o["status"]?.int, status == 0 || status == 1 else { return nil }
    let actions = (o["functions"]?.array ?? []).compactMap { f -> Action? in
      guard let code = f.object?["code"]?.string, TuyaPlugs.isOutlet(code), case .bool(let on)? = f.object?["value"] else { return nil }
      return Action(code: code, on: on)
    }
    guard !actions.isEmpty else { return nil }
    return PlugTimer(actions: actions, time: time, days: loops.map { $0 == "1" }, date: o["date"]?.string, enabled: status == 1)
  }
}
