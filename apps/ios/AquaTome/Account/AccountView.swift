import SwiftUI

/// "Tài khoản", the profile button's sheet (ProfileButton): the aquatome.com account (signing in, the sync, passkeys,
/// signing out, deleting it) and, for the owner's account, the dashboard; the app's settings (its icon, the anonymous
/// statistics); the posters the reader blocks on this phone, each to let back; and the site's pages about itself, in
/// the browser.
struct AccountView: View {
  @Environment(AccountModel.self) private var account
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        AccountSection()
        OwnerEntry()
        Section("Ứng dụng") {
          NavigationLink("Biểu tượng ứng dụng") { AppIconPicker() }.accessibilityIdentifier("app-icon-row")
        }
        TelemetrySwitch()
        BlockedSection()
        AboutSection()
      }
      .navigationTitle("Tài khoản")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Xong") { dismiss() }.accessibilityIdentifier("account-done") }
      }
      .ownerDashboard()
      // Not reached at launch (no network then): asked again each time the sheet opens.
      .task { if account.state == .unknown { await account.refresh() } }
    }
  }
}

/// "Về AquaTome": what the site is, how to reach it, its privacy policy. They open in the browser, as a link to them in a
/// page does (AboutTheSite).
private struct AboutSection: View {
  var body: some View {
    Section("Về AquaTome") {
      Link("Giới thiệu", destination: URL(string: String(localized: "https://aquatome.com/gioi-thieu/"))!)
        .accessibilityIdentifier("about")
      Link("Liên hệ", destination: URL(string: String(localized: "https://aquatome.com/lien-he/"))!)
        .accessibilityIdentifier("about-contact")
      Link("Chính sách bảo mật", destination: URL(string: String(localized: "https://aquatome.com/chinh-sach-bao-mat/"))!)
        .accessibilityIdentifier("about-privacy")
    }
  }
}
