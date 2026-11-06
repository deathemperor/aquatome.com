import SwiftUI

/// "Bảng điều khiển": a row only for the owner's account. One view, with `ownerDashboard()` on the navigation stack it's
/// in, to move with the account wherever the app shows it.
struct OwnerEntry: View {
  @Environment(AccountModel.self) private var account

  var body: some View {
    if account.owner.isOwner == true {
      Section {
        NavigationLink(value: OwnerRoute(key: "", anchor: nil)) {
          account.owner.sessionEnded
            ? Text("Bảng điều khiển") + Text(verbatim: "\n") + Text("Phiên đăng nhập đã hết: đăng nhập lại để xem bảng điều khiển.").font(.footnote).foregroundStyle(.red)
            : Text("Bảng điều khiển")
        }
        .accessibilityIdentifier("owner-dashboard")
      }
    }
  }
}

/// A screen of the dashboard: a section by its key (at a heading's anchor), or the overview ("").
struct OwnerRoute: Hashable {
  let key: String
  let anchor: String?
}

extension View {
  /// On the navigation stack that shows OwnerEntry: where the dashboard opens, and the check of the account signed in
  /// (when it changes, and after each sync, which also says the phone is online again).
  func ownerDashboard(_ account: AccountModel) -> some View {
    navigationDestination(for: OwnerRoute.self) { OwnerScreen(key: $0.key, anchor: $0.anchor) }
      .task(id: "\(account.user?.id ?? "")|\(account.syncs)") { await account.owner.check() }
  }
}
