import SwiftUI

/// The profile button, at the top right of each tab: the account and the app's settings, in one sheet (AccountView), as
/// the App Store's is. In the bar's text colour, filled once signed in; a red dot for a fault, seen from any tab (a sync
/// that failed, a session that ended and isn't seen yet), none for no network: the changes wait on the phone.
struct ProfileButton: View {
  @Environment(AccountModel.self) private var account
  @Environment(\.openScreen) private var openScreen

  var body: some View {
    let fault = account.fault
    Button { openScreen(.account) } label: {
      Image(systemName: account.user == nil ? "person.crop.circle" : "person.crop.circle.fill")
        .foregroundStyle(.primary)
        .overlay(alignment: .topTrailing) {
          if fault { Circle().fill(.red).frame(width: 9, height: 9).offset(x: 2, y: -2) }
        }
    }
    .accessibilityLabel(Text("Tài khoản"))
    .accessibilityValue(fault
      ? (account.endedWays != nil ? Text("cần đăng nhập lại") : Text("đồng bộ lỗi"))
      : account.user != nil ? Text("đã đăng nhập") : Text(verbatim: ""))
    .accessibilityIdentifier("profile")
  }
}

extension View {
  /// On a tab's first screen, inside its navigation stack: the profile button at the top right.
  func profileButton() -> some View {
    toolbar { ToolbarItem(placement: .topBarTrailing) { ProfileButton() } }
  }
}
