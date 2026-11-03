import SwiftUI

/// "Tài khoản": the aquatome.com account (signing in, the sync, passkeys, signing out, deleting it) and the posters the
/// reader blocks on this phone, each to let back.
struct AccountView: View {
  var body: some View {
    NavigationStack {
      List {
        AccountSection()
        BlockedSection()
      }
      .navigationTitle("Tài khoản")
    }
  }
}
