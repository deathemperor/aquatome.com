import Foundation
import Testing
@testable import Handbook

// protocols/photo-crop-vectors.json and protocols/whole-frame-vectors.json: the cases the site's tests write from its own
// rule (packages/schema/test/photo-crop-vectors.test.ts, apps/site/test/app-whole-photos.test.ts). The app decides alike,
// with the same one number for the cut.

private func vectors(_ name: String) throws -> [String: Any] {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  let data = try Data(contentsOf: url.appendingPathComponent("protocols/\(name)"))
  return try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any])
}

@Test func theCutIsTheSitesOneNumber() throws {
  #expect(try vectors("photo-crop-vectors.json")["cut"] as? Double == PhotoFrame.cut)
}

@Test func eachFrameKeepsTheFishAsTheSitesRuleDoes() throws {
  let file = try vectors("photo-crop-vectors.json")
  let tolerance = try #require(file["tolerance"] as? Double)
  let cases = try #require(file["cases"] as? [[String: Any]])
  #expect(!cases.isEmpty)
  for c in cases {
    let note = c["note"] as? String ?? "?"
    let w = try #require(c["w"] as? Double), h = try #require(c["h"] as? Double), ratio = try #require(c["ratio"] as? Double)
    let box = (c["box"] as? [String: Double]).map { PhotoBox(x: $0["x"] ?? 0, y: $0["y"] ?? 0, w: $0["w"] ?? 0, h: $0["h"] ?? 0) }
    let frame = try #require(c["frame"] as? [String: Any])
    let got = PhotoFrame.of(aspect: w / h, box: box, ratio: ratio)
    if frame["fit"] as? String == "whole" {
      #expect(got == .whole, "\(note): \(got)")
    } else {
      let x = try #require(frame["x"] as? Double), y = try #require(frame["y"] as? Double)
      guard case let .cover(gx, gy) = got else { Issue.record("\(note): whole, not cover at \(x), \(y)"); continue }
      #expect(abs(gx - x) <= tolerance && abs(gy - y) <= tolerance, "\(note): \(gx), \(gy), not \(x), \(y)")
    }
  }
}

@Test func aWholePhotosGroundIsTheSitesMatOrBlur() throws {
  let file = try vectors("whole-frame-vectors.json")
  #expect(file["strip"] as? Double == PhotoFrame.strip)
  let cases = try #require(file["cases"] as? [[String: Any]])
  #expect(!cases.isEmpty)
  for c in cases {
    let note = c["note"] as? String ?? "?"
    let w = try #require(c["w"] as? Double), h = try #require(c["h"] as? Double), ratio = try #require(c["ratio"] as? Double)
    #expect(PhotoFrame.ground(aspect: w / h, ratio: ratio).rawValue == c["ground"] as? String, "\(note)")
  }
}

// Cards and heads (Design's frames.md, 14 Nov): no cut, and the fish clear of each edge the frame adds by 2% of that side,
// never under 4 points. A photo twice as wide as it's tall, in a square frame: the window is half of it.

@Test func aCardMovesOntoAFishTheListsWouldCutByAFinTip() {
  // Centred, the window (0.25 to 0.75) cuts 0.01 of the fish's 0.46: within the lists' 5%, so they keep it centred.
  let fish = PhotoBox(x: 0.24, y: 0.3, w: 0.46, h: 0.4)
  #expect(PhotoFrame.of(aspect: 2, box: fish, ratio: 1) == .cover(x: 0.5, y: 0.5))
  // A 400-point card wants 8 points (0.01 of the photo) on each side: moved to 0.22, 0.01 clear of both ends.
  guard case let .cover(x, y) = PhotoFrame.clear(aspect: 2, box: fish, width: 400, height: 400) else {
    Issue.record("whole, not moved"); return
  }
  #expect(abs(x - 0.44) < 1e-9 && y == 0.5)
}

@Test func aFishTooLongToClearBothEdgesShowsWhole() {
  // 0.49 of the photo, in a window of 0.5 that needs 0.01 a side: the lists take it, moved onto it with 0.005 to spare
  // at each end; a card can't.
  let fish = PhotoBox(x: 0.2, y: 0.3, w: 0.49, h: 0.4)
  #expect(PhotoFrame.of(aspect: 2, box: fish, ratio: 1) != .whole)
  #expect(PhotoFrame.clear(aspect: 2, box: fish, width: 400, height: 400) == .whole)
}

@Test func aFishThePhotoCutsWithNoClearingWindowKeepsTheListsFrame() {
  // Reaching the photo's top, too long to clear the edges a square adds: the lists' frame, which here cuts nothing.
  let top = PhotoBox(x: 0.2, y: 0, w: 0.49, h: 0.6)
  #expect(PhotoFrame.clear(aspect: 2, box: top, width: 400, height: 400) == PhotoFrame.of(aspect: 2, box: top, ratio: 1))
  #expect(PhotoFrame.clear(aspect: 2, box: top, width: 400, height: 400) != .whole)
  // From the photo's left edge to 0.6: no window cuts 5% or less, so whole, as the lists show it: what was shot.
  let left = PhotoBox(x: 0, y: 0.3, w: 0.6, h: 0.4)
  #expect(PhotoFrame.of(aspect: 2, box: left, ratio: 1) == .whole)
  #expect(PhotoFrame.clear(aspect: 2, box: left, width: 400, height: 400) == .whole)
}

@Test func aSmallFrameKeepsFourPointsNotTwoPercent() {
  // 0.005 of room a side: a 400-point card's 8 points (0.01 of the photo) is clear centred; a 100-point one's 2% is only
  // 2 points, so it keeps 4 (0.02 of the photo), which neither centred nor moved leaves.
  let near = PhotoBox(x: 0.265, y: 0.3, w: 0.47, h: 0.4)  // 0.265 to 0.735
  #expect(PhotoFrame.clear(aspect: 2, box: near, width: 400, height: 400) == .cover(x: 0.5, y: 0.5))
  #expect(PhotoFrame.clear(aspect: 2, box: near, width: 100, height: 100) == .whole)
}

@Test func aFishThePhotoItselfCutsTakesTheClearingMoveToThatEdge() {
  // Its tail at the photo's own left edge: the window moved to that edge clears the one edge the frame adds.
  let fish = PhotoBox(x: 0.004, y: 0.3, w: 0.45, h: 0.4)
  #expect(PhotoFrame.clear(aspect: 2, box: fish, width: 400, height: 400) == .cover(x: 0, y: 0.5))
}

@Test func aTallPhotosCardClearsTheTopAndBottomItAdds() {
  // Half as wide as it's tall in a square frame: the window is half its height, cut top and bottom.
  let fish = PhotoBox(x: 0.2, y: 0.24, w: 0.6, h: 0.46)
  #expect(PhotoFrame.of(aspect: 0.5, box: fish, ratio: 1) == .cover(x: 0.5, y: 0.5))
  guard case let .cover(x, y) = PhotoFrame.clear(aspect: 0.5, box: fish, width: 400, height: 400) else {
    Issue.record("whole, not moved"); return
  }
  #expect(x == 0.5 && abs(y - 0.44) < 1e-9)
}

@Test func eachCardAndHeadFramesAsTheSharedCasesSay() throws {
  let file = try vectors("photo-crop-vectors.json")
  let tolerance = try #require(file["tolerance"] as? Double)
  let section = try #require(file["clear"] as? [String: Any])
  #expect(section["share"] as? Double == PhotoFrame.clearShare && section["points"] as? Double == PhotoFrame.clearPoints)
  #expect(section["ownEdge"] as? Double == PhotoFrame.ownEdge)
  let cases = try #require(section["cases"] as? [[String: Any]])
  #expect(!cases.isEmpty)
  for c in cases {
    let note = c["note"] as? String ?? "?"
    let w = try #require(c["w"] as? Double), h = try #require(c["h"] as? Double)
    let width = try #require(c["width"] as? Double), height = try #require(c["height"] as? Double)
    let box = (c["box"] as? [String: Double]).map { PhotoBox(x: $0["x"] ?? 0, y: $0["y"] ?? 0, w: $0["w"] ?? 0, h: $0["h"] ?? 0) }
    let frame = try #require(c["frame"] as? [String: Any])
    let got = PhotoFrame.clear(aspect: w / h, box: box, width: width, height: height)
    if frame["fit"] as? String == "whole" {
      #expect(got == .whole, "\(note): \(got)")
    } else {
      let x = try #require(frame["x"] as? Double), y = try #require(frame["y"] as? Double)
      guard case let .cover(gx, gy) = got else { Issue.record("\(note): whole, not cover at \(x), \(y)"); continue }
      #expect(abs(gx - x) <= tolerance && abs(gy - y) <= tolerance, "\(note): \(gx), \(gy), not \(x), \(y)")
    }
  }
}
