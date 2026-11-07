import Handbook
import SwiftUI

/// "Ngôn ngữ": the app's language, as the phone gives it ("Theo máy", the default) or one the app offers (SiteLanguage's
/// served, Vietnamese first). Kept where iOS's own Settings → AquaTome → Language keeps it, the app's `AppleLanguages`,
/// so the two never disagree; iOS reads it when the app opens, so a choice applies from the next time (an app can't
/// relaunch itself). Kept on this phone only, not in the account.
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

  /// The line under the section once it's chosen, in its own language (the catalog's string as that language's .lproj
  /// has it, not the one the app runs in): from the next time the app opens.
  var fromNextOpen: String {
    let own = site.flatMap { Bundle.main.path(forResource: $0.code, ofType: "lproj") }.flatMap(Bundle.init(path:))
    return String(localized: "Ứng dụng sẽ dùng \(name) từ lần mở sau.", bundle: own ?? .main)
  }

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

  /// The language the app opened in (iOS's pick among those it has, Vietnamese when the phone has none of them), read
  /// once.
  static let atLaunch = AppLanguage(site: SiteLanguage.of(Bundle.main.preferredLocalizations))

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

  /// The language this choice opens the app in.
  var opens: AppLanguage { self == .system ? Self.phone : self }
}

/// The sheet's row (Ứng dụng): the choice in the system's menu, "Theo máy" first with the phone's language under it.
struct LanguageRow: View {
  @Binding var choice: AppLanguage
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
    .onChange(of: choice) { AppLanguage.store(choice) }
  }
}

/// The section's footer once the language is changed: when the app opens next, in that language. None when the choice
/// opens it as it is now.
struct LanguageNote: View {
  let choice: AppLanguage

  var body: some View {
    let next = choice.opens
    if next != AppLanguage.atLaunch {
      Text(next.spoken(next.fromNextOpen)).accessibilityIdentifier("language-note")
    }
  }
}
