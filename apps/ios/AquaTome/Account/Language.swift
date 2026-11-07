import SwiftUI

/// "Ngôn ngữ": the app's language, as the phone gives it ("Theo máy", the default) or one of the three it ships. Kept
/// where iOS's own Settings → AquaTome → Language keeps it, the app's `AppleLanguages`, so the two never disagree; iOS
/// reads it when the app opens, so a choice applies from the next time (an app can't relaunch itself). Kept on this phone
/// only, not in the account.
enum AppLanguage: String, CaseIterable, Identifiable {
  case system, vi, id, th

  static let key = "AppleLanguages"
  static let languages: [AppLanguage] = [.vi, .id, .th]

  var id: Self { self }

  /// Its name in its own language, as iOS's own lists write a language.
  var name: String {
    switch self {
    case .system: ""
    case .vi: "Tiếng Việt"
    case .id: "Bahasa Indonesia"
    case .th: "ภาษาไทย"
    }
  }

  /// The line under the section once it's chosen, in its own language (the catalog's string as that language's .lproj
  /// has it, not the one the app runs in): from the next time the app opens.
  var fromNextOpen: String {
    let own = Bundle.main.path(forResource: rawValue, ofType: "lproj").flatMap(Bundle.init(path:))
    return String(localized: "Ứng dụng sẽ dùng \(name) từ lần mở sau.", bundle: own ?? .main)
  }

  /// Text in its own language, so VoiceOver reads it in that language's voice.
  func spoken(_ s: String) -> AttributedString {
    var a = AttributedString(s)
    a.languageIdentifier = rawValue
    return a
  }

  /// The choice as kept: the app's own `AppleLanguages`, not the lookup UserDefaults does, which falls through to the
  /// phone's own list and would read "Theo máy" as a language. A launch argument (the UI tests' `-AppleLanguages`) isn't
  /// kept, so it isn't read here either.
  static var stored: AppLanguage {
    guard let id = Bundle.main.bundleIdentifier,
          let list = UserDefaults.standard.persistentDomain(forName: id)?[key] as? [String] else { return .system }
    return list.first.flatMap { AppLanguage(rawValue: String($0.prefix(2))) } ?? .system
  }

  /// Kept for the next launch: the language alone, or, for "Theo máy", nothing (the phone's list again).
  static func store(_ choice: AppLanguage) {
    if choice == .system { UserDefaults.standard.removeObject(forKey: key) } else { UserDefaults.standard.set([choice.rawValue], forKey: key) }
  }

  /// The language the app opened in (iOS's pick among the three, Vietnamese when the phone has none of them), read once.
  static let atLaunch: AppLanguage = AppLanguage(rawValue: Bundle.main.preferredLocalizations.first.map { String($0.prefix(2)) } ?? "vi") ?? .vi

  /// What "Theo máy" gives: the first of the three in the phone's languages, else Vietnamese, as iOS opens the app. An app
  /// with a language of its own is shown only that one (`Locale.preferredLanguages`, and the phone's global list reads
  /// empty from the app), so the phone's is taken when the app opens without one and kept for when it has one. Read
  /// before the choice can change (the row asks first), so it's of how the app opened.
  static let phone: AppLanguage = {
    let kept = "phoneLanguage"
    guard stored == .system else { return UserDefaults.standard.string(forKey: kept).flatMap(AppLanguage.init(rawValue:)) ?? .vi }
    let p = Locale.preferredLanguages.lazy.compactMap { AppLanguage(rawValue: String($0.prefix(2))) }.first { $0 != .system } ?? .vi
    UserDefaults.standard.set(p.rawValue, forKey: kept)
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
