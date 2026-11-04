import SwiftUI

/// "Tài khoản": the aquatome.com account (signing in, the sync, passkeys, signing out, deleting it) and the posters the
/// reader blocks on this phone, each to let back.
struct AccountView: View {
  @Environment(AccountModel.self) private var account

  var body: some View {
    NavigationStack {
      List {
        AccountSection()
        BlockedSection()
      }
      .navigationTitle("Tài khoản")
      // Not reached at launch (no network then): asked again each time the tab is opened.
      .task { if account.state == .unknown { await account.refresh() } }
    }
  }
}
