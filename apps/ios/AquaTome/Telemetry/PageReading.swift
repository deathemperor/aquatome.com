import Foundation
import Telemetry
import UIKit

/// A page of the site the app draws itself (NativePage), read: its view when it opens, how far down it's seen (25, 50,
/// 75 and 100%), whether it's open and on the screen 30, 60 and 180 s after it opened, and its shop links tapped, each
/// once, as the site's pages measure theirs. The site's pages shown as web pages measure themselves: their own script
/// runs in the web view, so the app doesn't count them again.
@MainActor
final class PageReading {
  private let path: String
  private let telemetry: Telemetry
  private var depths: Set<Int> = []
  private var opened = false
  private var shown = false

  init(path: String, telemetry: Telemetry) {
    self.path = path
    self.telemetry = telemetry
  }

  /// On the screen: opened, or come back to from a page over it.
  func appeared() {
    shown = true
    guard !opened else { return }
    opened = true
    telemetry.record(.view(path: path))
    Task { [weak self] in
      var waited = 0
      for s in Event.times {
        try? await Task.sleep(for: .seconds(s - waited))
        waited = s
        // Gone (the page closed): nothing more.
        guard let self else { return }
        if self.shown, UIApplication.shared.applicationState == .active { self.telemetry.record(.time(path: self.path, seconds: s)) }
      }
    }
  }

  /// Off the screen: closed, or a page opened over it.
  func disappeared() { shown = false }

  /// The share of the page seen down to, from 0 to 1.
  func scrolled(to share: Double) {
    for d in Event.depths where share * 100 >= Double(d) && !depths.contains(d) {
      depths.insert(d)
      telemetry.record(.scroll(path: path, depth: d))
    }
  }

  /// A link tapped on the page: counted when it's one of the site's shop links.
  func tapped(_ url: URL) {
    if let e = Event.aff(path: path, link: url) { telemetry.record(e) }
  }
}
