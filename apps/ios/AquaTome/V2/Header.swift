import SwiftUI

extension View {
  /// A tab's first screen, as the App Store's: its title large and bold in the bar's own row, beside the account button,
  /// not under a row of its own; iOS shrinks it into the bar's middle as the page goes up.
  @available(iOS 18, *)
  func v2TabTitle(_ title: LocalizedStringKey) -> some View {
    navigationTitle(title).toolbarTitleDisplayMode(.inlineLarge)
      .toolbar { ToolbarItem(placement: .topBarTrailing) { V2AccountButton() } }
  }
}

/// The account button; the reader's fish once they've chosen one (a prototype: `ProfilePictures.swift`).
@available(iOS 18, *)
private struct V2AccountButton: View {
  @AppStorage("v2ProfilePicture") private var chosen = ""
  @Environment(\.openScreen) private var openScreen

  var body: some View {
    if let p = ProfilePicture.with(id: chosen) {
      Button { openScreen(.account) } label: {
        V2Photo(src: p.src).frame(width: 36, height: 36).clipShape(Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel(Text("Tài khoản"))
      .accessibilityIdentifier("profile")
    } else {
      ProfileButton()
    }
  }
}
