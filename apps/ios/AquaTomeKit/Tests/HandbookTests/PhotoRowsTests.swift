import Testing
@testable import Handbook

private func close(_ a: Double, _ b: Double) -> Bool { abs(a - b) < 0.001 }

@Suite struct PhotoRowsTests {
  /// Shapes as a gallery has them: landscape mostly, some upright, a panorama.
  private let ratios = [1.5, 1.33, 0.75, 1, 1.78, 1.5, 0.8, 3.2, 1.5, 1.2, 0.67, 1.33, 1.5, 1.5, 1, 1.78, 0.75]

  @Test func aRowStopsTakingPhotosOnceItIsNoTallerThanTheMost() {
    let rows = PhotoRows.rows(ratios: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5], width: 402)
    // Two at 3:2 would stand 133 points tall on a 402-point screen; a third brings them to 88.
    #expect(rows.map(\.photos) == [0..<3, 3..<6])
    #expect(close(rows[0].height, 398.0 / 4.5))
  }

  @Test func everyRowButTheLastFillsTheWidthAndNoneIsTallerThanTheMost() {
    let rows = PhotoRows.rows(ratios: ratios, width: 402)
    for row in rows {
      #expect(row.height <= 128.001)
      #expect(row.widths.count == row.photos.count)
    }
    for row in rows.dropLast() {
      let filled = row.widths.reduce(0, +) + PhotoRows.gap * Double(row.widths.count - 1)
      #expect(close(filled, 402))
    }
  }

  @Test func eachPhotoKeepsItsShape() {
    let rows = PhotoRows.rows(ratios: ratios, width: 402)
    #expect(rows.flatMap { Array($0.photos) } == Array(ratios.indices))
    for row in rows {
      for (place, width) in zip(row.photos, row.widths) { #expect(close(width / row.height, ratios[place])) }
    }
  }

  @Test func theLastRowDoesNotStretchPastTheMost() {
    let rows = PhotoRows.rows(ratios: [1.5, 1.5, 1.5, 1.5], width: 402)
    let last = rows[rows.count - 1]
    #expect(last.photos == 3..<4)
    #expect(last.height == 128)
    #expect(close(last.widths[0], 192))
  }

  @Test func aLastRowThatFitsStillFillsTheWidth() {
    let rows = PhotoRows.rows(ratios: [1.5, 1.5, 1.5], width: 402)
    #expect(rows.count == 1)
    #expect(close(rows[0].widths.reduce(0, +) + 2 * PhotoRows.gap, 402))
  }

  @Test func theMostScalesWithTheWidthSoAWiderScreenBreaksTheSameRows() {
    #expect(PhotoRows.tallest(width: 402) == 128)
    #expect(close(PhotoRows.tallest(width: 804), 256))
    let wide = PhotoRows.rows(ratios: [1, 1, 1, 1, 1, 1, 1], width: 804)
    #expect(wide[0].photos == PhotoRows.rows(ratios: [1, 1, 1, 1, 1, 1, 1], width: 402)[0].photos)
  }

  @Test func aPanoramaIsARowOfItsOwn() {
    let rows = PhotoRows.rows(ratios: [6, 1, 1, 1, 1], width: 402)
    #expect(rows[0].photos == 0..<1)
    #expect(close(rows[0].height, 67))
  }

  @Test func nothingToLayOut() {
    #expect(PhotoRows.rows(ratios: [], width: 402).isEmpty)
    // Before the screen's width is known.
    #expect(PhotoRows.rows(ratios: ratios, width: 0).isEmpty)
  }

  @Test func aPhotoIsFoundInItsRow() {
    let rows = PhotoRows.rows(ratios: [1.5, 1.5, 1.5, 1.5, 1.5, 1.5], width: 402)
    #expect(PhotoRows.row(of: 0, in: rows) == 0)
    #expect(PhotoRows.row(of: 2, in: rows) == 0)
    #expect(PhotoRows.row(of: 3, in: rows) == 1)
    #expect(PhotoRows.row(of: 6, in: rows) == nil)
  }

  @Test func aheadIsTheNextRowsTheWayTheReaderScrolls() {
    let rows = PhotoRows.rows(ratios: Array(repeating: 1.5, count: 60), width: 402)
    // Rows of about 88 + 2 points: two rows' height asks for the second too, and no more.
    #expect(PhotoRows.ahead(of: 5, in: rows, down: true, span: 180) == [6, 7])
    #expect(PhotoRows.ahead(of: 5, in: rows, down: false, span: 180) == [4, 3])
    // Up to the ends and no further.
    #expect(PhotoRows.ahead(of: 19, in: rows, down: true, span: 1000) == [])
    #expect(PhotoRows.ahead(of: 1, in: rows, down: false, span: 1000) == [0])
  }

  @Test(arguments: [
    ("110 ảnh từ Wikimedia Commons, iNaturalist và Unsplash, giấy phép mở.", "từ Wikimedia Commons, iNaturalist và Unsplash, giấy phép mở."),
    ("7 ảnh từ iNaturalist.", "từ iNaturalist."),
    ("110 foto dari iNaturalist, berlisensi terbuka.", "dari iNaturalist, berlisensi terbuka."),
    ("110 foto dari iNaturalist, berlesen terbuka.", "dari iNaturalist, berlesen terbuka."),
    ("ภาพ 110 ภาพจาก iNaturalist ใช้สัญญาอนุญาตแบบเปิด", "จาก iNaturalist ใช้สัญญาอนุญาตแบบเปิด"),
    // Worded otherwise: whole.
    ("Ảnh từ iNaturalist.", "Ảnh từ iNaturalist."),
    ("", ""),
  ])
  func aNoteLessItsCount(note: String, source: String) {
    #expect(PhotoRows.source(note) == source)
  }
}
