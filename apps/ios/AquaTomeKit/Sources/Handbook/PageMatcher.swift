import Foundation

/// The page a tank's entry without a page (`unlisted`, docs/my-tanks-sync.md) is shown as, by its kind and scientific
/// name: the rule of `pageMatcher` in packages/schema/src/unlisted.ts, held to protocols/unlisted-vectors.json. A page's
/// own scientific name first, else a former name (synonym) no other page has; nothing for one word (a genus), a name
/// two pages share, or another kind of page. Only what is shown: nothing is written back to the tank.
public struct PageMatcher: Sendable {
  /// A page as the matcher reads it: its kind (`fish`, `plant`), its content id, its scientific name and the other
  /// scientific names it went by.
  public struct Page: Sendable {
    public let kind: String, id: String, sci: String?, synonyms: [String]
    public init(kind: String, id: String, sci: String?, synonyms: [String] = []) {
      self.kind = kind; self.id = id; self.sci = sci; self.synonyms = synonyms
    }
  }

  /// By `kind|sciKey`, keyed by UTF-16 code units as JavaScript compares them. nil: two pages have it, so it names neither.
  private var own: [[UInt16]: String?] = [:]
  private var former: [[UInt16]: String?] = [:]

  public init(_ pages: [Page]) {
    func add(_ m: inout [[UInt16]: String?], _ k: [UInt16], _ id: String) {
      if let was = m[k] { m[k] = .some(was == id ? id : nil) } else { m[k] = .some(id) }
    }
    for p in pages { if let s = p.sci { add(&own, Self.key(p.kind, s), p.id) } }
    for p in pages { for s in p.synonyms { let k = Self.key(p.kind, s); if own[k] == nil { add(&former, k, p.id) } } }
  }

  /// The handbook's fish and plant pages as the site's page reads them (apps/site/src/scripts/my-tanks.ts, `handbook`):
  /// the scientific name is `sub`; a plant's other names that read like scientific ones are its former names.
  public init(index items: [HandbookIndex.Item]) {
    self.init(items.compactMap { i in
      guard i.kind == .fish || i.kind == .plant, let id = i.contentId else { return nil }
      let former = i.kind == .plant ? (i.aka ?? []).filter { $0.range(of: "^[A-Z][a-z]+ [a-z]", options: .regularExpression) != nil } : []
      return Page(kind: i.kind.rawValue, id: id, sci: i.sub, synonyms: former)
    })
  }

  /// The content id of the page an entry of `kind` with scientific name `sci` is, if one is.
  public func page(kind: String, sci: String?) -> String? {
    let k = Self.sciKey(sci ?? "")
    guard k.contains(" ") else { return nil }
    let key = Array("\(kind)|\(k)".utf16)
    return (own[key] ?? former[key]) ?? nil
  }

  /// A scientific name as two are compared: NFKC, lower case, one space between words, the words `cf.` and `aff.` left
  /// out ("Corydoras cf. sterbai" is Corydoras sterbai).
  public static func sciKey(_ s: String) -> String {
    s.precomposedStringWithCompatibilityMapping.lowercased().unicodeScalars
      .split { ($0.properties.isWhitespace && $0.value != 0x85) || $0.value == 0xFEFF } // JavaScript's \s
      .map { String(String.UnicodeScalarView($0)) }
      .filter { !["cf", "cf.", "aff", "aff."].contains($0) }
      .joined(separator: " ")
  }

  private static func key(_ kind: String, _ sci: String) -> [UInt16] { Array("\(kind)|\(sciKey(sci))".utf16) }
}
