import AccountSync
import Foundation
import StoreKit

/// Whether this copy of the app is one of ours: a debug build (the simulator, every UI test) or a TestFlight build.
/// Its web pages and wanted names then carry `AccountsClient.ourCopy`, so the site leaves them out of its reader stats.
/// A copy from the App Store never does.
enum OwnCopy {
  private static let key = "own-copy"

  static var isOurs: Bool {
    #if DEBUG
    true
    #else
    UserDefaults.standard.bool(forKey: key)
    #endif
  }

  /// Where this copy came from, asked of the App Store once a launch and kept for the next, so the pages opened before
  /// the answer use the last one. TestFlight's copies are the sandbox's; an answer that can't be verified changes nothing.
  static func check() async {
    #if !DEBUG
    guard case .verified(let t)? = try? await AppTransaction.shared else { return }
    UserDefaults.standard.set(t.environment != .production, forKey: key)
    #endif
  }
}
