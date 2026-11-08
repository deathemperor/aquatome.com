import AccountSync
import Foundation
import Handbook
import UIKit

/// Whether this copy of the app is one of ours: a debug build (the simulator, every UI test) or a TestFlight build.
/// Its web pages, wanted names and shop links then carry `AccountsClient.ourCopy`, so the site leaves them out of its
/// reader and click stats.
/// A copy from the App Store never does.
enum OwnCopy {
  /// Known at once, so the first page and event of a launch carry it too.
  static var isOurs: Bool {
    #if DEBUG
    true
    #else
    AccountsClient.isOurCopy(receipt: Bundle.main.appStoreReceiptURL?.lastPathComponent)
    #endif
  }

  /// A link to the site for the browser, from our copies marked (`SiteMark`).
  static func marked(_ url: URL, site: URL) -> URL { isOurs ? SiteMark.marked(url, site: site) : url }

  /// A link that leaves the app, in the browser or the app that handles it. A shop link on the site goes from our
  /// copies straight to its shop (`ShopLink`), so the site doesn't count their taps as readers' clicks; another of the
  /// site's links goes marked.
  @MainActor static func open(_ url: URL, site: URL) async {
    var to = marked(url, site: site)
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
