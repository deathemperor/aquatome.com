import SwiftUI

/// The profile button, at the top right of each tab: the account and the app's settings, in one sheet (AccountView), as
/// the App Store's is. Filled once signed in; a dot while the account has a problem to tell (a sync that failed, a
/// session that ended), seen from any tab.
struct ProfileButton: View {
  @Environment(AccountModel.self) private var account
  @Environment(\.openScreen) private var openScreen

  var body: some View {
    let problem = account.message?.bad == true
    Button { openScreen(.account) } label: {
      Image(systemName: account.user == nil ? "person.crop.circle" : "person.crop.circle.fill")
        .overlay(alignment: .topTrailing) {
          if problem { Circle().fill(.red).frame(width: 8, height: 8).offset(x: 2, y: -2) }
        }
    }
    .accessibilityLabel(Text("Tài khoản"))
    .accessibilityValue(problem ? Text("Có vấn đề cần xem") : Text(verbatim: ""))
    .accessibilityIdentifier("profile")
  }
}

extension View {
  /// On a tab's first screen, inside its navigation stack: the profile button at the top right.
  func profileButton() -> some View {
    toolbar { ToolbarItem(placement: .topBarTrailing) { ProfileButton() } }
  }
}
