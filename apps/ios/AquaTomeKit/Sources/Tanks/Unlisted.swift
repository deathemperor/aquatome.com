// A tank's fish and plants the handbook has no page for yet (`unlisted`, docs/my-tanks-sync.md, "Entries without a
// page"): kept as the reader named them. Which page one is shown as is the handbook's to say (Handbook's PageMatcher);
// nothing is written back here.

/// Entries without a page on one tank (MAX_UNLISTED in packages/schema/src/tanks.ts).
public let maxUnlisted = 100

/// A fish or plant on a tank by its name. A JSON object underneath, so keys a newer client gave it stay.
public struct UnlistedEntry: Sendable, Equatable, Identifiable {
  public var json: Object
  public init(json: Object) { self.json = json }

  /// A new entry, as the site's form makes one: the name trimmed, the scientific name trimmed with single spaces and
  /// left out when blank, a count only for what isn't a plant. Typed on a tank, or (later) a photo's guess.
  public init(kind: String, name: String, sci: String? = nil, count: Int? = nil) {
    json = ["id": .string(newRecordId()), "kind": .string(kind), "name": .string(TankStore.trim(name))]
    let s = sci.map { String(String.UnicodeScalarView($0.unicodeScalars.split(whereSeparator: \.isJavaScriptSpace).joined(separator: [" "]))) }
    if let s, !s.isEmpty { json["sci"] = .string(s) }
    if kind != "plant" { self.count = count }
  }

  public var id: String { json["id"]?.string ?? "" }
  /// `fish` or `plant` (Known.unlistedKind), or a kind a newer client wrote: shown as it is, and kept.
  public var kind: String { json["kind"]?.string ?? "" }
  public var name: String { json["name"]?.string ?? "" }
  /// The scientific name, when the reader gave one: what links the entry to a page once one has it.
  public var sci: String? { json["sci"]?.string }
  /// How many (not for plants); nil for no number.
  public var count: Int? {
    get { json["count"]?.int }
    set { json["count"] = newValue.map { .number(Double($0)) } }
  }
  /// A plant goes with the tank's plants; anything else (a kind from a newer client too) with its fish, as on the site.
  public var isPlant: Bool { kind == "plant" }
}

extension Tank {
  /// What the handbook has no page for, in the order added. Left out of the record when there is none.
  public var unlisted: [UnlistedEntry] {
    get { (json["unlisted"]?.array ?? []).compactMap { $0.object.map(UnlistedEntry.init(json:)) } }
    set { json["unlisted"] = newValue.isEmpty ? nil : .array(newValue.map { .object($0.json) }) }
  }

  /// An entry without a page onto the tank, last.
  public mutating func addUnlisted(_ e: UnlistedEntry) { unlisted.append(e) }

  public mutating func removeUnlisted(_ id: String) { unlisted.removeAll { $0.id == id } }

  /// An entry's number (nil: none), its other keys kept.
  public mutating func setUnlistedCount(_ id: String, _ count: Int?) {
    var list = unlisted
    guard let i = list.firstIndex(where: { $0.id == id }) else { return }
    list[i].count = count
    unlisted = list
  }

  /// The entries this tank has that `before` (the same tank before a change, nil for a new tank) didn't: what a save
  /// added, and so what may be counted as wanted (docs/my-tanks-sync.md, "Readers' demand"). A count changed is not new.
  public func unlistedAdded(since before: Tank?) -> [UnlistedEntry] {
    let had = Set((before?.unlisted ?? []).map { Array($0.id.utf16) })
    return unlisted.filter { !had.contains(Array($0.id.utf16)) }
  }
}
