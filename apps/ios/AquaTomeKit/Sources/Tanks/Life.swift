// A tank's fish and plants, changed as the site's tools change them (apps/site/src/scripts/save-to-tank.ts): each entry
// keeps the keys a newer client gave it.

/// Fish a tank may hold of one kind, as the store allows (packages/schema/src/tanks.ts).
public let maxCount = 9999

extension Tank {
  /// A fish onto the tank: one already there gets the new number (the site's `withSpecies`), a new one goes last.
  public mutating func putSpecies(_ id: String, count: Int?) {
    var list = species
    if let i = list.firstIndex(where: { $0.id == id }) { list[i].count = count } else { list.append((id, count)) }
    species = list
  }

  public mutating func removeSpecies(_ id: String) { species.removeAll { $0.id == id } }

  /// A plant onto the tank, once.
  public mutating func addPlant(_ id: String) { if !plants.contains(id) { plants.append(id) } }

  public mutating func removePlant(_ id: String) { plants.removeAll { $0 == id } }
}
