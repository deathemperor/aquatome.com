/// A page's row of photos (its gallery's, its readers', the old look's): six, then the tile or button to them all, seven
/// columns as Khám phá's shelves (the Design Lead's table of 11 Nov, after the owner's "Appstore gives up to 7 columns in
/// total"). The site's own strip keeps its eight.
public enum PhotoRow {
  public static let shown = 6

  /// The row's photos: the first six of the gallery's `strip`.
  public static func strip(_ strip: [Int]) -> [Int] { Array(strip.prefix(shown)) }
}
