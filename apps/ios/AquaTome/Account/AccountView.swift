import Handbook
import SwiftUI
import UIKit

/// "Tài khoản", the profile button's sheet (ProfileButton), laid out as iOS's settings are: the aquatome.com account
/// (signing in, the sync, a passkey) and, for the owner's account, the dashboard; the app (its icon, its appearance, the
/// pages kept to read offline); privacy (the anonymous statistics, the posters the reader blocks on this phone); the site's pages
/// about itself, in the browser; signing out and deleting the account; the app's version.
struct AccountView: View {
  @Environment(AccountModel.self) private var account
  @Environment(\.dismiss) private var dismiss

  var body: some View {
    NavigationStack {
      List {
        AccountSection()
        OwnerEntry()
        AppSection()
        if #available(iOS 18, *) { OldLookSection() }
        PrivacySection()
        AboutSection()
        LeaveSection()
        Section {} footer: {
          Text(verbatim: Self.version)
            .frame(maxWidth: .infinity)
            .accessibilityIdentifier("app-version")
        }
      }
      .navigationTitle("Tài khoản")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) { Button("Xong") { dismiss() }.accessibilityIdentifier("account-done") }
      }
      .ownerDashboard()
      // Not reached at launch (no network then): asked again each time the sheet opens.
      .task { if account.state == .unknown { await account.refresh() } }
      .onAppear { account.sheetOpened() }
      // A session that ends while the sheet is open is seen here: no dot for it after closing.
      .onChange(of: account.endedWays) { account.sheetOpened() }
      #if DEBUG
      .background { AppearanceProbe(id: "appearance-sheet") }
      #endif
    }
  }

  /// "AquaTome 1.0 (231)".
  static var version: String {
    let info = Bundle.main.infoDictionary
    return "AquaTome \(info?["CFBundleShortVersionString"] as? String ?? "") (\(info?["CFBundleVersion"] as? String ?? ""))"
  }
}

/// A settings row's symbol: white on a rounded square of its colour, as iOS's settings draw them, growing with the text
/// up to half again, so it doesn't sit small beside the largest words.
struct Tile: View {
  /// The app's green as its light appearance has it, in the dark too: the dark one's mint is too light under white.
  static let green = Color(red: 0x2F / 255, green: 0x6B / 255, blue: 0x4F / 255)

  let symbol: String
  let color: Color
  @ScaledMetric(relativeTo: .body) private var scaled: CGFloat = 29

  var body: some View {
    let side = min(scaled, 44)
    Image(systemName: symbol)
      .font(.system(size: side * 15 / 29, weight: .semibold))
      .foregroundStyle(.white)
      .frame(width: side, height: side)
      .background(color, in: .rect(cornerRadius: side * 7 / 29, style: .continuous))
      .accessibilityHidden(true)
  }
}

/// "Ứng dụng": the app's icon (the current one beside it), its appearance, and the pages kept to read offline, how many,
/// which opens their shelf on the Tìm tab, where pages open.
private struct AppSection: View {
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen

  var body: some View {
    Section("Ứng dụng") {
      NavigationLink { AppIconPicker() } label: {
        Label { Text("Biểu tượng ứng dụng") } icon: { CurrentIcon() }
      }
      .accessibilityIdentifier("app-icon-row")
      AppearanceRow()
      let kept = handbook.keptItems.count
      if kept > 0 {
        Button { openScreen(.kept) } label: {
          LabeledContent {
            HStack(spacing: 6) {
              Text("\(kept) trang")
              Image(systemName: "chevron.forward").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary).accessibilityHidden(true)
            }
          } label: {
            Label { Text("Đã tải để đọc offline").foregroundStyle(.primary) } icon: { Tile(symbol: "book.closed.fill", color: .blue) }
          }
        }
        .accessibilityIdentifier("kept-row")
      }
    }
  }
}

/// The old look (V2Switch), for a reader who'd rather have it: a group of its own under "Ứng dụng", apart from its
/// "Giao diện" (light or dark), which shares its word, with what it brings back said under it. None on iOS 17, which has
/// the old look alone.
@available(iOS 18, *)
private struct OldLookSection: View {
  @AppStorage(V2Switch.key) private var v2 = V2Switch.byDefault

  var body: some View {
    Section {
      Toggle(isOn: Binding { !v2 } set: { v2 = !$0 }) {
        Label { Text("Dùng giao diện cũ") } icon: { Tile(symbol: "clock.arrow.circlepath", color: .gray) }
      }
      .accessibilityIdentifier("old-look-switch")
    } footer: {
      Text("Bật để các tab và trang trở lại như trước khi ứng dụng đổi giao diện.")
    }
  }
}

/// The app's icon as the reader set it, the size of a settings row's symbol.
private struct CurrentIcon: View {
  /// As a Tile, growing with the text up to half again.
  @ScaledMetric(relativeTo: .body) private var scaled: CGFloat = 29

  var body: some View {
    let name = UIApplication.shared.alternateIconName.map { String($0.dropFirst("AppIcon-".count)) } ?? "default"
    let side = min(scaled, 44)
    if let image = UIImage(named: "AppIconPreview-" + name) ?? UIImage(named: "AppIconPreview-default") {
      Image(uiImage: image).resizable().frame(width: side, height: side).clipShape(.rect(cornerRadius: side * 7 / 29, style: .continuous))
        .accessibilityHidden(true)
    } else {
      Tile(symbol: "app.fill", color: .gray)
    }
  }
}

/// "Quyền riêng tư": the anonymous statistics' switch, and, once anyone is blocked, the posters blocked on this phone,
/// how many, each to let back on their own page. What the statistics never hold, and the privacy policy, under them.
private struct PrivacySection: View {
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    Section {
      TelemetrySwitch()
      let blocked = handbook.safety.blocked.count
      if blocked > 0 {
        NavigationLink { BlockedPage() } label: {
          LabeledContent {
            Text(blocked, format: .number)
          } label: {
            Label { Text("Người đã chặn") } icon: { Tile(symbol: "hand.raised.fill", color: .gray) }
          }
        }
        .accessibilityIdentifier("blocked-row")
      }
    } header: {
      Text("Quyền riêng tư")
    } footer: {
      Text.linked(String(localized: "Thống kê không gồm tài khoản, tên bể, nội dung tìm kiếm hay ảnh."),
                  String(localized: "Chính sách bảo mật"),
                  URL(string: String(localized: "https://aquatome.com/vi/chinh-sach-bao-mat/#thong-ke-ung-dung"))!)
    }
  }
}

/// "Về AquaTome": what the site is, how to reach it, its privacy policy. They open in the browser, as a link to them in a
/// page does (AboutTheSite).
private struct AboutSection: View {
  var body: some View {
    Section("Về AquaTome") {
      out("Giới thiệu", URL(string: String(localized: "https://aquatome.com/gioi-thieu/"))!, id: "about")
      out("Liên hệ", URL(string: String(localized: "https://aquatome.com/lien-he/"))!, id: "about-contact")
      out("Chính sách bảo mật", URL(string: String(localized: "https://aquatome.com/chinh-sach-bao-mat/"))!, id: "about-privacy")
    }
  }

  /// A page in the browser: its name, and an arrow out.
  private func out(_ name: LocalizedStringKey, _ url: URL, id: String) -> some View {
    Link(destination: url) {
      HStack {
        Text(name)
        Spacer()
        Image(systemName: "arrow.up.right").font(.footnote.weight(.semibold)).foregroundStyle(.tertiary).accessibilityHidden(true)
      }
    }
    // The page's name in the text's colour, as a settings row: the arrow says it leaves the app.
    .tint(.primary)
    .accessibilityIdentifier(id)
  }
}

extension Text {
  /// A sentence, then a link at its end (a footer's "Chính sách bảo mật"), in the tint.
  static func linked(_ sentence: String, _ title: String, _ url: URL) -> Text {
    var link = AttributedString(title)
    link.link = url
    return Text(AttributedString(sentence + " ") + link)
  }
}
