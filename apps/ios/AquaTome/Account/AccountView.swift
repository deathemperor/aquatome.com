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
      // The first card close under the title, as the mock.
      .contentMargins(.top, 14, for: .scrollContent)
      .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
      .navigationTitle("Tài khoản")
      .navigationBarTitleDisplayMode(.inline)
      .modifier(RowLabel())
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
    // On the stack, not its first screen: the pages pushed onto it read their environment from here.
    .environment(\.closeAccountSheet, { dismiss() })
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
  /// Dark grey, a little lighter in the dark, where the card under it is grey too.
  static let graphite = Color(UIColor { $0.userInterfaceStyle == .dark
    ? UIColor(red: 0x61 / 255, green: 0x63 / 255, blue: 0x65 / 255, alpha: 1)
    : UIColor(red: 0x3A / 255, green: 0x3A / 255, blue: 0x3B / 255, alpha: 1) })

  let symbol: String
  let color: Color
  @ScaledMetric(relativeTo: .body) private var scaled: CGFloat = 29

  var body: some View {
    let side = min(scaled, 44)
    Image(systemName: symbol)
      .font(.system(size: side * 12 / 29, weight: .semibold))
      .foregroundStyle(.white)
      .frame(width: side, height: side)
      .background(color, in: .rect(cornerRadius: side * 7 / 29, style: .continuous))
      .accessibilityHidden(true)
  }
}

/// "Ứng dụng": the app's icon (the current one beside it), its appearance and language, and the pages kept to read offline, how many,
/// which opens their shelf on the Tìm tab, where pages open.
private struct AppSection: View {
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen

  /// "Ngôn ngữ" as kept, which the section's footer reads too.
  @State private var language = AppLanguage.stored

  var body: some View {
    Section {
      NavigationLink { AppIconPicker().accountSheetDone() } label: {
        Label { Text("Biểu tượng ứng dụng") } icon: { CurrentIcon() }
      }
      .accessibilityIdentifier("app-icon-row")
      AppearanceRow()
      LanguageRow(choice: $language)
      let kept = handbook.keptItems.count
      if kept > 0 {
        Button { openScreen(.kept) } label: {
          LabeledContent {
            HStack(spacing: 6) {
              // Colours by name: a button's hierarchical ones are shades of the tint.
              Text("\(kept) trang").foregroundStyle(Color.secondary)
              Image(systemName: "chevron.forward").font(.footnote.weight(.semibold)).foregroundStyle(Color(.tertiaryLabel)).accessibilityHidden(true)
            }
          } label: {
            Label { Text("Đã tải để đọc offline").foregroundStyle(Color.primary) } icon: { Tile(symbol: "book.closed.fill", color: .blue) }
          }
        }
        .accessibilityIdentifier("kept-row")
      }
    } header: {
      Text("Ứng dụng").font(.subheadline.weight(.semibold))
    } footer: {
      LanguageNote(choice: language)
    }
  }
}

/// The old look (V2Switch), for a reader who'd rather have it: a group of its own under "Ứng dụng", apart from its
/// "Giao diện" (light or dark), which shares its word, with what it brings back said under it. None on iOS 17, which has
/// the old look alone.
@available(iOS 18, *)
private struct OldLookSection: View {
  @AppStorage(V2Switch.key) private var v2 = V2Switch.byDefault
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    Section {
      Toggle(isOn: Binding { !v2 } set: { v2 = !$0 }) {
        let icon = Tile(symbol: "clock.arrow.circlepath", color: .gray)
        // At the accessibility sizes the icon over the words, as the account's card has it: beside them, a longer
        // language's first word ("Gunakan") broke in two.
        if size.isAccessibilitySize {
          VStack(alignment: .leading, spacing: 8) { icon; Text("Dùng giao diện cũ") }
        } else {
          Label { Text("Dùng giao diện cũ") } icon: { icon }
        }
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
        NavigationLink { BlockedPage().accountSheetDone() } label: {
          LabeledContent {
            Text(blocked, format: .number)
          } label: {
            Label { Text("Người đã chặn") } icon: { Tile(symbol: "hand.raised.fill", color: .gray) }
          }
        }
        .accessibilityIdentifier("blocked-row")
      }
    } header: {
      Text("Quyền riêng tư").font(.subheadline.weight(.semibold))
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
    Section {
      out("Giới thiệu", URL(string: String(localized: "https://aquatome.com/gioi-thieu/"))!, id: "about")
      out("Liên hệ", URL(string: String(localized: "https://aquatome.com/lien-he/"))!, id: "about-contact")
      out("Chính sách bảo mật", URL(string: String(localized: "https://aquatome.com/chinh-sach-bao-mat/"))!, id: "about-privacy")
    } header: {
      Text("Về AquaTome").font(.subheadline.weight(.semibold))
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

extension EnvironmentValues {
  /// Closes the Tài khoản sheet from a page pushed inside it, where the page's own dismiss would only go back.
  @Entry var closeAccountSheet: (() -> Void)?
}

extension View {
  /// "Xong" on a page pushed inside the Tài khoản sheet, as on its first screen. Nothing where the page opens elsewhere.
  func accountSheetDone() -> some View { modifier(AccountSheetDone()) }
}

private struct AccountSheetDone: ViewModifier {
  @Environment(\.closeAccountSheet) private var close

  func body(content: Content) -> some View {
    content.toolbar {
      if let close {
        ToolbarItem(placement: .confirmationAction) { Button("Xong") { close() }.accessibilityIdentifier("account-done") }
      }
    }
  }
}

/// At the accessibility sizes a row's words keep their own column beside its icon when they wrap, as the mock has them,
/// not running back under it. A switch's label needs it on the label itself: the list's doesn't reach inside a switch.
struct RowLabel: ViewModifier {
  @Environment(\.dynamicTypeSize) private var size

  func body(content: Content) -> some View {
    if size.isAccessibilitySize { content.labelStyle(Hanging()) } else { content }
  }

  private struct Hanging: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
      HStack(alignment: .firstTextBaseline, spacing: 14) {
        configuration.icon
        configuration.title
          .fixedSize(horizontal: false, vertical: true)
          .alignmentGuide(.listRowSeparatorLeading) { $0[.leading] }
      }
    }
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
