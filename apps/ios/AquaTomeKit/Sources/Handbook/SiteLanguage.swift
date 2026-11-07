import Foundation

/// The site's languages, a row each, as packages/schema/src/langs.ts lists them (SiteLanguageTests hold the two
/// together), with the words of the site's addresses the app reads (apps/site/src/lib/i18n.ts, SECTIONS and SUB).
/// Vietnamese first: the fallback, and the order lists show them in. A language joins with its row, not served: the app
/// offers nothing in it, and a link in it opens as the site's web page. It goes live in the app with its row served,
/// its words, and its strings in the catalog (its .lproj, named by its code).
public struct SiteLanguage: Sendable, Hashable {
  /// "vi", "id", "th": the site's code, and the app's .lproj.
  public let code: String
  /// Its own name, as its readers write it: "Bahasa Indonesia".
  public let name: String
  /// Whether the app offers it: the site serves it, and the app has its strings.
  public let served: Bool
  /// Its word for each Vietnamese segment of an address the app reads; Vietnamese's are the segments themselves.
  let words: [String: String]

  public static let all: [SiteLanguage] = [
    .init(code: "vi", name: "Tiếng Việt", served: true, words: [:]),
    .init(code: "id", name: "Bahasa Indonesia", served: true, words: [
      "cong-cu": "alat", "nhom": "kelompok", "phan-loai": "taksonomi", "nguon-goc": "asal", "gioi-thieu": "tentang",
      "lien-he": "kontak", "chinh-sach-bao-mat": "kebijakan-privasi", "the-tich-be": "volume-akuarium",
      "den-chihiros": "lampu-chihiros", "be-cua-toi": "akuarium-saya", "nuoi-chung": "kecocokan-ikan",
      "nhan-dien-ca": "kenali-ikan", "trang": "halaman",
    ]),
    .init(code: "th", name: "ภาษาไทย", served: true, words: [
      "cong-cu": "tools", "nhom": "groups", "phan-loai": "taxonomy", "nguon-goc": "origin", "gioi-thieu": "about",
      "lien-he": "contact", "chinh-sach-bao-mat": "privacy", "the-tich-be": "tank-volume", "den-chihiros": "chihiros-light",
      "be-cua-toi": "my-tanks", "nuoi-chung": "tank-mates", "nhan-dien-ca": "fish-id", "trang": "page",
    ]),
    .init(code: "ms", name: "Bahasa Melayu", served: true, words: [
      "cong-cu": "alat", "nhom": "kumpulan", "phan-loai": "taksonomi", "nguon-goc": "asal", "gioi-thieu": "tentang",
      "lien-he": "hubungi", "chinh-sach-bao-mat": "dasar-privasi", "the-tich-be": "isi-padu-tangki",
      "den-chihiros": "lampu-chihiros", "be-cua-toi": "tangki-saya", "nuoi-chung": "rakan-setangki",
      "nhan-dien-ca": "kenal-pasti-ikan", "trang": "halaman",
    ]),
  ]

  /// The languages the app offers, Vietnamese first.
  public static let served = all.filter(\.served)
  public static let vietnamese = all[0]

  /// The served language with this code; nil for any other.
  public static func served(_ code: String) -> SiteLanguage? { served.first { $0.code == code } }

  /// The app's language: the one iOS chose of the app's (`Bundle.main.preferredLocalizations`, first), by its code or
  /// its base ("id-ID" → "id"), if the app offers it; else Vietnamese.
  public static func of(_ preferred: [String]) -> SiteLanguage {
    let first = preferred.first ?? ""
    return served(first) ?? served(String(first.prefix { $0 != "-" && $0 != "_" })) ?? vietnamese
  }

  /// The language a page's path is in ("/id/ikan/x/" → Indonesian); nil for a path under no served language's prefix.
  public static func of(path: String) -> SiteLanguage? { served.first { path.hasPrefix($0.prefix) } }

  /// Its word for a Vietnamese segment: "cong-cu" → "alat".
  public func word(_ vi: String) -> String { words[vi] ?? vi }

  /// Where its pages are: "/vi/", "/id/".
  public var prefix: String { "/\(code)/" }

  /// A page of its, by the Vietnamese segments: ("cong-cu") → "/id/alat/".
  public func path(_ segments: String...) -> String { "/" + ([code] + segments.map(word)).joined(separator: "/") + "/" }
}
