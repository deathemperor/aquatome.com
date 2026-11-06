import Foundation
import Telemetry

/// A page of the site the app draws itself (NativePage), read, with the site beacon's marks: how far down it's seen
/// (50 and 90%), how long it has been on the screen with the app in front (30, 60 and 180 s), and its shop links
/// tapped; each mark once while the page is open. Its view is the handbook's (HandbookModel.read), as for a web page.
@MainActor
final class PageReading {
  private let path: String
  private let telemetry: Telemetry
  private var depths: Set<Int> = []
  private var times = Event.times
  /// On the screen (not under a page opened over it), and the app in front.
  private var shown = false
  private var inFront = true
  /// Time counted before the stretch on screen now, and when that began.
  private var counted = Duration.zero
  private var since: ContinuousClock.Instant?
  private var next: Task<Void, Never>?

  init(path: String, telemetry: Telemetry) {
    self.path = path
    self.telemetry = telemetry
  }

  /// On the screen, or off it (closed, or a page opened over it).
  func shown(_ on: Bool) { shown = on; count() }

  /// The app in front, or not.
  func inFront(_ on: Bool) { inFront = on; count() }

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

  /// Starts or stops the clock, and waits for the next mark while it runs.
  private func count() {
    let running = shown && inFront
    if running, since == nil {
      since = .now
      wait()
    } else if !running, let s = since {
      counted += s.duration(to: .now)
      since = nil
      next?.cancel()
      next = nil
    }
  }

  private func wait() {
    guard let mark = times.first, let since else { return }
    let left = Duration.seconds(mark) - counted - since.duration(to: .now)
    next = Task { [weak self] in
      try? await Task.sleep(for: left)
      guard !Task.isCancelled, let self else { return }
      self.times.removeFirst()
      self.telemetry.record(.time(path: self.path, seconds: mark))
      self.wait()
    }
  }
}
