import Foundation

/// A gallery's photos in rows that keep each photo's shape (docs/design/photo-grid.md): photos join a row until, stretched
/// to the screen's width, the row is no taller than 128 points on a 402-point screen, in step with the width. Every size
/// comes from the data's widths and heights, before a photo loads. Nothing is cropped.
public enum PhotoRows {
  public static let gap = 2.0

  public struct Row: Equatable, Sendable {
    /// Its photos' places in the list.
    public let photos: Range<Int>
    public let height: Double
    /// Each photo's width, in order. Together with the gaps they fill the screen, except on a last row short of it.
    public let widths: [Double]
  }

  /// The tallest a row may be on a screen this wide.
  public static func tallest(width: Double) -> Double { 128 * width / 402 }

  /// `ratios`: each photo's width over its height. The last row doesn't stretch past the tallest a row may be.
  public static func rows(ratios: [Double], width: Double) -> [Row] {
    guard width > 0 else { return [] }
    let most = tallest(width: width)
    var rows: [Row] = []
    var start = 0
    var sum = 0.0
    for (i, ratio) in ratios.enumerated() {
      sum += ratio
      let stretched = (width - gap * Double(i - start)) / sum
      let last = i == ratios.count - 1
      guard stretched <= most || last else { continue }
      let height = min(stretched, most)
      rows.append(Row(photos: start..<(i + 1), height: height, widths: ratios[start...i].map { $0 * height }))
      start = i + 1
      sum = 0
    }
    return rows
  }

  /// The row holding the photo at `place`.
  public static func row(of place: Int, in rows: [Row]) -> Int? {
    rows.firstIndex { $0.photos.contains(place) }
  }

  /// The rows past `row` the way the reader is scrolling, nearest first, up to `span` points of them: those to load
  /// before they reach the screen.
  public static func ahead(of row: Int, in rows: [Row], down: Bool, span: Double) -> [Int] {
    var out: [Int] = []
    var covered = 0.0
    var next = row + (down ? 1 : -1)
    while rows.indices.contains(next), covered < span {
      out.append(next)
      covered += rows[next].height + gap
      next += down ? 1 : -1
    }
    return out
  }

  /// A gallery's note less its count, to follow the page's name: "110 ảnh từ Wikimedia Commons, giấy phép mở." → "từ
  /// Wikimedia Commons, giấy phép mở.", in each language the site writes it (lib/gallery.ts). A note worded otherwise
  /// stays whole.
  public static func source(_ note: String) -> String {
    guard let count = note.range(of: #"^(ภาพ )?[0-9.,]+ (ảnh|foto|ภาพ) ?"#, options: .regularExpression) else { return note }
    return String(note[count.upperBound...])
  }
}
