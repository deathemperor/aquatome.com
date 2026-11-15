import SwiftUI

/// The profile button, at the top right of each tab: the account and the app's settings, in one sheet (AccountView), as
/// the App Store's is. In the bar's text colour, filled once signed in; a red dot for a fault, seen from any tab (a sync
/// that failed, a session that ended and isn't seen yet), none for no network: the changes wait on the phone.
struct ProfileButton: View {
  /// In a tab's header (`TabHeader`), not a bar: its own 36-point circle, in a 44-point tap.
  var inPage = false
  @Environment(AccountModel.self) private var account
  @Environment(\.openScreen) private var openScreen

  var body: some View {
    let fault = account.fault
    Button { openScreen(.account) } label: {
      // The account's fish once one's chosen (ProfilePictures).
      AccountPictureMark(size: inPage ? 36 : 32) {
        Image(systemName: account.user == nil ? "person.crop.circle" : "person.crop.circle.fill")
          .font(inPage ? .system(size: 36, weight: .light) : nil)
          .foregroundStyle(.primary)
      }
        .overlay(alignment: .topTrailing) {
          // Ringed in the bar's colour: it holds on a red fish too.
          if fault {
            Circle().fill(.red).frame(width: 9, height: 9).padding(2).background(Color(.systemBackground), in: .circle)
              .offset(x: 4, y: -4)
          }
        }
        .frame(minWidth: inPage ? 44 : nil, minHeight: inPage ? 44 : nil)
        .contentShape(.rect)
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
  @ViewBuilder func profileButton() -> some View {
    if #available(iOS 26, *) {
      // Its own glass circle, after the tab's other buttons (the account sheet's spec): the space is what parts them.
      toolbar {
        ToolbarSpacer(.fixed, placement: .topBarTrailing)
        ToolbarItem(placement: .topBarTrailing) { ProfileButton() }
      }
    } else {
      toolbar { ToolbarItem(placement: .topBarTrailing) { ProfileButton() } }
    }
  }
}
