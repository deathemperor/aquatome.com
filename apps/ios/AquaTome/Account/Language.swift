import Handbook
import os
import SwiftUI

/// The language the app shows now: the one it opened in, until the reader picks another in the Tài khoản sheet, which
/// applies at once (AquaTomeApp.speak). The one reader of `Bundle.main.preferredLocalizations`: the UI tests open the app
/// with `-AppleLanguages`, which isn't kept, so it starts from how the app opened, not from the choice kept. The app's
/// words look up in its .lproj (`Bundle.app`), its dates and numbers in its locale (`Locale.app`), and SwiftUI's own
/// (`Text` keys, titles, buttons, tabs, alerts) follow the root's `\.locale`, set from it.
@Observable
@MainActor
final class AppLanguageNow {
  static let shared = AppLanguageNow()
  /// The language shown.
  private(set) var site: SiteLanguage
  /// The one the app opened in: iOS's own words (search's Cancel, the share sheet, sign-in, permission prompts) stay in it
  /// until the app opens again.
  let atLaunch: SiteLanguage
  var code: String { site.code }
  /// Its locale (Locale.app), for the views: read through `site`, so they follow a change.
  var locale: Locale {
    _ = site
    return Self.locale
  }

  private init() {
    let s = SiteLanguage.served(Self.code) ?? .vietnamese
    site = s
    atLaunch = s
  }

  /// Shows `s` from now on: the lookups first, then the views that read `site`.
  func use(_ s: SiteLanguage) {
    guard s != site else { return }
    Self.now.withLock { $0 = Now(s) }
    site = s
  }

  /// What any thread reads: the code, the .lproj and the locale, set together.
  private struct Now: @unchecked Sendable {
    let code: String
    let bundle: Bundle
    let locale: Locale
    init(_ s: SiteLanguage) {
      code = s.code
      // The language's .lproj, whose strings table the catalog writes. Vietnamese, the catalog's own language, has no
      // table there: a lookup in its .lproj gives the key, which is the Vietnamese. Its .lproj is there for
      // InfoPlist.xcstrings' Vietnamese; without it, `.main` reads the language the app opened in, and
      // LanguageFlowTests' way back from Thai fails on the sheet's privacy line (Fable, 21 Nov).
      bundle = Bundle.main.path(forResource: s.code, ofType: "lproj").flatMap(Bundle.init(path:)) ?? .main
      // The phone's own locale where it's in this language (its region's dates and numbers), else the language's.
      locale = Locale.current.language.languageCode?.identifier == s.code ? .current : Locale(identifier: s.code)
    }
  }

  nonisolated private static let now = OSAllocatedUnfairLock(initialState: Now(SiteLanguage.of(Bundle.main.preferredLocalizations)))
  /// The language's code, from any thread.
  nonisolated static var code: String { now.withLock { $0.code } }
  nonisolated static var bundle: Bundle { now.withLockUnchecked { $0.bundle } }
  nonisolated static var locale: Locale { now.withLock { $0.locale } }
}

extension Bundle {
  /// The app's words in the language it shows now (AppLanguageNow): `String(localized: "…", bundle: .app)`. A lookup
  /// without it reads the language the app opened in, whatever the reader picked since (check-strings.py fails one).
  static var app: Bundle { AppLanguageNow.bundle }
}

/// "Ngôn ngữ": the app's language, as the phone gives it ("Theo máy", the default) or one the app offers (SiteLanguage's
/// served, Vietnamese first). Kept where iOS's own Settings → AquaTome → Language keeps it, the app's `AppleLanguages`,
/// so the two never disagree, and shown at once (AppLanguageNow). Kept on this phone only, not in the account.
struct AppLanguage: Hashable, Identifiable {
  /// The language; nil for "Theo máy".
  let site: SiteLanguage?

  static let key = "AppleLanguages"
  static let system = AppLanguage(site: nil)
  /// The languages offered, Vietnamese first.
  static var languages: [AppLanguage] { SiteLanguage.served.map { AppLanguage(site: $0) } }

  var id: String { site?.code ?? "" }

  /// Its name in its own language, as iOS's own lists write a language.
  var name: String { site?.name ?? "" }

  /// Text marked as its own language, the one mark an AttributedString has for it. Which voice VoiceOver then reads it in
  /// is the system's: no attribute sets that.
  func spoken(_ s: String) -> AttributedString {
    var a = AttributedString(s)
    a.languageIdentifier = site?.code
    return a
  }

  /// An offered language by an iOS language code ("id", "id-ID"); nil for any other.
  private static func offered(_ code: String) -> AppLanguage? {
    (SiteLanguage.served(code) ?? SiteLanguage.served(String(code.prefix { $0 != "-" && $0 != "_" }))).map { AppLanguage(site: $0) }
  }

  /// The choice as kept: the app's own `AppleLanguages`, not the lookup UserDefaults does, which falls through to the
  /// phone's own list and would read "Theo máy" as a language. A launch argument (the UI tests' `-AppleLanguages`) isn't
  /// kept, so it isn't read here either.
  static var stored: AppLanguage {
    guard let id = Bundle.main.bundleIdentifier,
          let list = UserDefaults.standard.persistentDomain(forName: id)?[key] as? [String] else { return .system }
    return list.first.flatMap(offered) ?? .system
  }

  /// Kept for the next launch: the language alone, or, for "Theo máy", nothing (the phone's list again).
  static func store(_ choice: AppLanguage) {
    if let code = choice.site?.code { UserDefaults.standard.set([code], forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
  }

  /// What "Theo máy" gives: the first offered language in the phone's, else Vietnamese, as iOS opens the app. An app with
  /// a language of its own is shown only that one (`Locale.preferredLanguages`, and the phone's global list reads empty
  /// from the app), so the phone's is taken when the app opens without one and kept for when it has one. Read as the app
  /// starts (AquaTomeApp), before the choice can change, so it's of how the app opened.
  static let phone: AppLanguage = {
    let kept = "phoneLanguage"
    let vi = AppLanguage(site: .vietnamese)
    guard stored == .system else { return UserDefaults.standard.string(forKey: kept).flatMap(offered) ?? vi }
    let p = Locale.preferredLanguages.lazy.compactMap(offered).first ?? vi
    UserDefaults.standard.set(p.id, forKey: kept)
    return p
  }()

  /// The language this choice shows: the phone's for "Theo máy".
  var opens: SiteLanguage { (self == .system ? Self.phone : self).site ?? .vietnamese }
}

/// The sheet's row (Ứng dụng): the choice in the system's menu, "Theo máy" first with the phone's language under it. A
/// choice is kept for iOS's Settings and shown at once.
struct LanguageRow: View {
  @Binding var choice: AppLanguage
  @Environment(\.speak) private var speak
  private let phone = AppLanguage.phone

  var body: some View {
    Picker(selection: $choice) {
      Section {
        VStack {
          Text("Theo máy")
          Text(phone.spoken(phone.name))
        }
        .tag(AppLanguage.system)
      }
      Section {
        ForEach(AppLanguage.languages) { Text($0.spoken($0.name)).tag($0) }
      }
    } label: {
      Label { Text("Ngôn ngữ") } icon: { Tile(symbol: "globe", color: .teal) }
    }
    .pickerStyle(.menu)
    .accessibilityIdentifier("language")
    .onChange(of: choice) {
      AppLanguage.store(choice)
      speak(choice.opens)
    }
  }
}

/// The section's footer once the app shows another language than it opened in: the few words iOS draws itself follow
/// only from the next open.
struct LanguageNote: View {
  @Environment(AppLanguageNow.self) private var language

  var body: some View {
    if language.site != language.atLaunch {
      Text("Vài chữ do iOS hiện (nút Hủy khi tìm, bảng chia sẻ, màn đăng nhập, câu xin quyền) sẽ theo ngôn ngữ mới từ lần mở ứng dụng sau.")
        .accessibilityIdentifier("language-note")
    }
  }
}

extension EnvironmentValues {
  /// Shows the app in a language at once (AquaTomeApp.speak).
  @Entry var speak: (SiteLanguage) -> Void = { _ in }
}
