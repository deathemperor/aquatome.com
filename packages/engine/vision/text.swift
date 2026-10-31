import Foundation
import Vision

// usage: swift text.swift <image>... → one JSON line per image: the text macOS Vision reads in it, each line with its
// confidence and box (0–1, from the top left): [{"t":"AQUARIUM GLASER","c":1,"x":0.17,"y":0.03,"w":0.71,"h":0.09}]; null if unreadable.
// Small text counts (a credit line is often ~1/60 of the photo's height), and no language correction, so names and URLs stay as printed.
for path in CommandLine.arguments.dropFirst() {
  let req = VNRecognizeTextRequest()
  req.recognitionLevel = .accurate
  req.usesLanguageCorrection = false
  req.minimumTextHeight = 0.012
  // Only languages this Mac's Vision has: an unknown one would fail every image.
  let supported = (try? req.supportedRecognitionLanguages()) ?? ["en-US"]
  req.recognitionLanguages = ["en-US", "vi-VT", "th-TH", "id-ID", "de-DE"].filter { supported.contains($0) }
  do {
    try VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:]).perform([req])
    let lines: [[String: Any]] = (req.results ?? []).compactMap { o in
      guard let top = o.topCandidates(1).first else { return nil }
      let b = o.boundingBox
      let r = { (v: CGFloat) in NSDecimalNumber(mantissa: UInt64(max(0, (Double(v) * 1000).rounded())), exponent: -3, isNegative: false) }
      return ["t": top.string, "c": r(CGFloat(top.confidence)), "x": r(b.minX), "y": r(1 - b.maxY), "w": r(b.width), "h": r(b.height)]
    }
    let data = try JSONSerialization.data(withJSONObject: lines)
    print(String(data: data, encoding: .utf8)!)
  } catch {
    print("null")
  }
}
