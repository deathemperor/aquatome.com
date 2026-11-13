import AccountSync
import Handbook
import SwiftUI

/// The app's side of the owner's dashboard (its rules are AccountSync's OwnerAccess): what a failure says, in English as
/// the dashboard's words are, and the photos.
extension OwnerAccess {
  /// What a failure says to the owner, once `failed` has applied what it means; nil for a read a newer one replaced.
  func say(_ e: Error, overview: Bool) async -> String? {
    if e is CancellationError { return nil }
    await failed(e, overview: overview)
    switch e as? OwnerError {
    case .signedOut?: return "Your session has ended: sign in again to see the dashboard."
    case .offline?: return "No connection: try again once you're online."
    case .refused(_, let message?)?: return message
    default: return "Something went wrong and it wasn't done: try again."
    }
  }

  /// A photo at most 600 pixels a side (the grid shows it at half the screen), kept in memory while there's room.
  func picture(_ src: String) async -> UIImage? {
    if let i = pictures.object(forKey: src as NSString) as? UIImage { return i }
    let era = self.era
    guard let data = await image(src) else { return nil }
    let small = await Task.detached { Readers.shrink(data, maxSide: 600) }.value
    // Another account or a sign-out on the way: not kept.
    guard let small, let i = UIImage(data: small), era == self.era else { return nil }
    pictures.setObject(i, forKey: src as NSString, cost: Int(i.size.width * i.size.height * i.scale * i.scale) * 4)
    return i
  }
}

extension Owner.Tone {
  var color: Color {
    switch self {
    case .plain: .primary
    case .muted: .secondary
    case .good: .green
    case .wait: .orange
    case .bad: .red
    }
  }

  /// The tone in words, for VoiceOver, which can't see the colour.
  var said: String? {
    switch self {
    case .bad: "needs fixing"
    case .wait: "waiting for you"
    case .good: "good"
    default: nil
    }
  }
}
