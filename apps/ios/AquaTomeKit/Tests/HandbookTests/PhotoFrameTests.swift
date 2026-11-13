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
