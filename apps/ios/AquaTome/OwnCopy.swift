import AccountSync
import Foundation
import Handbook
import StoreKit
import UIKit

/// Whether this copy of the app is one of ours: a debug build (the simulator, every UI test) or a TestFlight build.
/// Its web pages, wanted names and shop links then carry `AccountsClient.ourCopy`, so the site leaves them out of its
/// reader and click stats.
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
  /// the answer use the last one. TestFlight's copies are the sandbox's. No verified answer counts as a reader's copy,
  /// so an App Store copy installed over a TestFlight one isn't left marked when StoreKit can't answer.
  static func check() async {
    #if !DEBUG
    guard case .verified(let t)? = try? await AppTransaction.shared else { return UserDefaults.standard.removeObject(forKey: key) }
    UserDefaults.standard.set(t.environment != .production, forKey: key)
    #endif
  }

  /// A link that leaves the app, in the browser or the app that handles it. A shop link on the site goes from our
  /// copies straight to its shop (`ShopLink`), so the site doesn't count their taps as readers' clicks.
  @MainActor static func open(_ url: URL, site: URL) async {
    var to = url
    if isOurs, ShopLink.is(url, site: site) {
      to = await ShopLink.target(of: url, userAgent: "AquaTome-iOS \(AccountsClient.ourCopy)") { r in
        guard let answer = try await URLSession.shared.data(for: r, delegate: NoRedirects()).1 as? HTTPURLResponse else {
          throw URLError(.badServerResponse)
        }
        return answer
      }
    }
    _ = await UIApplication.shared.open(to)
  }
}

/// A request's redirect answered, not followed.
private final class NoRedirects: NSObject, URLSessionTaskDelegate, Sendable {
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest) async -> URLRequest? { nil }
}
