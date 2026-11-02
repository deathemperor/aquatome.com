import Foundation

/// The tank-mates tool's state from its link, as its page reads its address (apps/site/src/pages/vi/cong-cu/
/// nuoi-chung.astro): `ca=ca-neon:6,ca-dia:2`, the fish and how many of each, and `l=60&w=30&h=36`, the tank in cm.
public struct TankMatesLink: Sendable {
  public struct Size: Equatable, Sendable {
    public let l: Double, w: Double, h: Double
  }

  /// At most 6, in the link's order, each once, with how many.
  public let fish: [(item: HandbookIndex.Item, count: Int)]
  /// Only with all three sides over 0. (The site's form starts at 60 × 30 × 36 without them; the app checks no size.)
  public let size: Size?

  public static let maxFish = 6

  /// `query`: the link's, without the "?". `index`: the index's fish. A slug the index doesn't have is left out.
  public init(query: String?, fish index: [HandbookIndex.Item]) {
    let params = Self.params(query ?? "")
    let bySlug = Dictionary(index.map { (Self.slug($0), $0) }, uniquingKeysWith: { a, _ in a })
    // As the page reads them: a later number for the same fish wins, a number that isn't one is left for the default.
    var counts: [String: Int] = [:]
    var picked: [HandbookIndex.Item] = []
    for part in (params["ca"] ?? "").split(separator: ",", omittingEmptySubsequences: false) {
      let bits = part.split(separator: ":", omittingEmptySubsequences: false)
      guard let item = bySlug[String(bits[0])] else { continue }
      if bits.count > 1, let n = Self.count(String(bits[1])) { counts[item.path] = n }
      if !picked.contains(where: { $0.path == item.path }) { picked.append(item) }
    }
    fish = picked.prefix(Self.maxFish).map { ($0, counts[$0.path] ?? $0.facts.schoolMin ?? 1) }
    let sides = ["l", "w", "h"].compactMap { params[$0].flatMap(Self.number).flatMap { $0 > 0 ? $0 : nil } }
    size = sides.count == 3 ? Size(l: sides[0], w: sides[1], h: sides[2]) : nil
  }

  /// A fish's name in the tool's links: its page's last path component ("/vi/ca/ca-neon/" → "ca-neon").
  public static func slug(_ item: HandbookIndex.Item) -> String {
    item.path.split(separator: "/").last.map(String.init) ?? ""
  }

  /// How many fish a typed number (or a link's) means, as the tool's box takes it: rounded, over 0, at most 200; nil
  /// for anything else.
  public static func count(_ typed: String) -> Int? {
    guard let x = number(typed)?.rounded(.toNearestOrAwayFromZero), x > 0 else { return nil }
    return Int(min(200, x))
  }

  /// A number as the browser reads one (`Number`): spaces around it ignored; nil for none.
  private static func number(_ s: String) -> Double? {
    Double(s.trimmingCharacters(in: .whitespaces)).flatMap { $0.isNaN ? nil : $0 }
  }

  /// The query's values by name, as the page's URLSearchParams reads them: "+" a space, percent-decoded, the first of
  /// a name repeated.
  private static func params(_ query: String) -> [String: String] {
    var out: [String: String] = [:]
    for pair in query.split(separator: "&") {
      let kv = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
      let decode = { (s: Substring) in
        let plus = s.replacingOccurrences(of: "+", with: " ")
        return plus.removingPercentEncoding ?? plus
      }
      let key = decode(kv[0])
      if out[key] == nil { out[key] = kv.count > 1 ? decode(kv[1]) : "" }
    }
    return out
  }
}
