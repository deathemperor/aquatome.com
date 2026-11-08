import SwiftUI

/// Khám phá's movement: three directions to choose from, one at a time by `-v2-motion <name>` while they're tried; none
/// by default.
/// - `hero`: the top cards turn by themselves, a slow pan over the photo in front; a touch stops them for a while.
/// - `scroll`: nothing moves on its own; cards rise as they come up the screen, the top cards settle as they slide in,
///   and photos shift a little inside their cards with the scroll.
/// - `still`: the big photos drift slowly while on screen.
/// None of it with Reduce Motion; nothing that moves on its own in Low Power Mode. Only transforms (scale, offset,
/// opacity), which the GPU does without drawing the page again.
enum V2Motion: String {
  case none, hero, scroll, still

  static let chosen: V2Motion = {
    let a = ProcessInfo.processInfo.arguments
    guard let i = a.firstIndex(of: "-v2-motion"), i + 1 < a.count else { return .none }
    return V2Motion(rawValue: a[i + 1]) ?? .none
  }()
}

/// Low Power Mode, as it changes.
@MainActor @Observable
final class LowPower {
  static let shared = LowPower()
  private(set) var on = ProcessInfo.processInfo.isLowPowerModeEnabled

  private init() {
    NotificationCenter.default.addObserver(forName: .NSProcessInfoPowerStateDidChange, object: nil, queue: .main) { _ in
      MainActor.assumeIsolated { LowPower.shared.on = ProcessInfo.processInfo.isLowPowerModeEnabled }
    }
  }
}

extension View {
  /// A slow pan over a photo, there and back, 9 seconds each way, while `on`; larger by enough that its edges never show.
  func v2Drift(_ on: Bool, delay: Double = 0) -> some View { modifier(Drift(on: on, delay: delay)) }

  /// Rises into place as it comes up the screen, once, when `on`.
  func v2RiseIn(_ on: Bool) -> some View {
    scrollTransition(.animated(.smooth(duration: 0.5)), axis: .vertical) { c, phase in
      let below = on && phase == .bottomTrailing
      return c.opacity(below ? 0.2 : 1).offset(y: below ? 36 : 0).scaleEffect(below ? 0.96 : 1)
    }
  }

  /// Settles as it slides into a sideways shelf, with the finger, when `on`.
  func v2SlideIn(_ on: Bool) -> some View {
    scrollTransition(axis: .horizontal) { c, phase in
      c.scaleEffect(on && !phase.isIdentity ? 0.93 : 1).opacity(on && !phase.isIdentity ? 0.75 : 1)
    }
  }

  /// A photo shifting a little inside its card with the page's scroll, when `on`: a third of the page's speed, at most
  /// 14 points, the photo 12% larger to cover it.
  func v2Parallax(_ on: Bool) -> some View {
    visualEffect { c, p in
      let y = on ? max(-14, min(14, -p.frame(in: .scrollView(axis: .vertical)).midY * 0.03 + 12)) : 0
      return c.scaleEffect(on ? 1.12 : 1).offset(y: y)
    }
  }
}

private struct Drift: ViewModifier {
  let on: Bool
  let delay: Double
  @State private var there = false

  func body(content: Content) -> some View {
    content
      .scaleEffect(on ? (there ? 1.12 : 1.06) : 1)
      .offset(x: on ? (there ? -9 : 9) : 0)
      .onChange(of: on, initial: true) { _, on in
        if on {
          withAnimation(.easeInOut(duration: 9).repeatForever(autoreverses: true).delay(delay)) { there = true }
        } else {
          withAnimation(.easeOut(duration: 0.4)) { there = false }
        }
      }
  }
}
