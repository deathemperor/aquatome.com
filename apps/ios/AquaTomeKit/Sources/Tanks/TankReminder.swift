import Foundation

/// A task the keeper scheduled for one tank. Completing a recurring task keeps its chosen time of day and
/// counts the next interval from the day it was done.
public struct TankReminder: Codable, Equatable, Identifiable, Sendable {
  public enum Kind: String, Codable, CaseIterable, Sendable {
    case waterChange, trim, testCycling, heater, chiller, breeding
  }

  public enum Repeat: String, Codable, CaseIterable, Sendable {
    case once, daily, weekly, monthly, yearly

    fileprivate var unit: Calendar.Component? {
      switch self {
      case .once: nil
      case .daily: .day
      case .weekly: .weekOfYear
      case .monthly: .month
      case .yearly: .year
      }
    }
  }

  public let id: UUID
  public let tankID: String
  public var kind: Kind
  public var due: Date
  public var interval: Repeat
  public var notify: Bool
  public private(set) var lastDone: Date?

  public init(tankID: String, due: Date) {
    id = UUID()
    self.tankID = tankID
    self.due = due
    kind = .waterChange
    interval = .once
    notify = false
  }

  public var finished: Bool { interval == .once && lastDone != nil }

  public mutating func complete(at now: Date, in calendar: Calendar) {
    guard !finished else { return }
    lastDone = now
    guard let unit = interval.unit,
          let nextDay = calendar.date(byAdding: unit, value: 1, to: now) else { return }
    let time = calendar.dateComponents([.hour, .minute], from: due)
    due = calendar.date(bySettingHour: time.hour ?? 0, minute: time.minute ?? 0, second: 0, of: nextDay,
                        matchingPolicy: .nextTime) ?? nextDay
  }

  /// Editing a completed one-off creates a new due date while keeping the task's identity.
  public mutating func reopen() { lastDone = nil }
}
