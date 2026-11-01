/// Pages the reader saved to read later, and the ones read last, by their path ("/vi/huong-dan/<slug>/"): kept on the
/// phone (not in an account), newest first.
public struct ReadingList: Codable, Equatable, Sendable {
  public private(set) var saved: [String] = []
  public private(set) var recent: [String] = []
  /// The pages read last that are kept.
  public static let recentMax = 20

  public init() {}

  /// A page read: first among the recent ones, once.
  public mutating func read(_ path: String) {
    recent.removeAll { $0 == path }
    recent.insert(path, at: 0)
    if recent.count > Self.recentMax { recent.removeLast(recent.count - Self.recentMax) }
  }

  public func isSaved(_ path: String) -> Bool { saved.contains(path) }

  /// Saved (first) when it wasn't, taken off when it was.
  public mutating func toggleSaved(_ path: String) {
    if let i = saved.firstIndex(of: path) { saved.remove(at: i) } else { saved.insert(path, at: 0) }
  }
}
