import CoreVideo
import Foundation
import Vision

// usage: swift subject.swift <image>... → one line per image: where the animal is, as macOS Vision's subject lifting finds
// it (the largest foreground instance), {"x","y","w","h"} as fractions of the image from its top-left corner; null where
// it finds none; "unreadable" where the image can't be read.
for path in CommandLine.arguments.dropFirst() {
  let req = VNGenerateForegroundInstanceMaskRequest()
  do {
    try VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:]).perform([req])
    guard let o = req.results?.first else { print("null"); continue }
    // Each instance's extent and pixel count from the mask (0 = background), the largest kept.
    let m = o.instanceMask
    CVPixelBufferLockBaseAddress(m, .readOnly)
    let w = CVPixelBufferGetWidth(m), h = CVPixelBufferGetHeight(m), row = CVPixelBufferGetBytesPerRow(m)
    let base = CVPixelBufferGetBaseAddress(m)!.assumingMemoryBound(to: UInt8.self)
    var seen: [Int: (x0: Int, y0: Int, x1: Int, y1: Int, n: Int)] = [:]
    for y in 0..<h {
      for x in 0..<w {
        let l = Int(base[y * row + x])
        if l == 0 { continue }
        let c = seen[l] ?? (x, y, x, y, 0)
        seen[l] = (min(c.x0, x), min(c.y0, y), max(c.x1, x), max(c.y1, y), c.n + 1)
      }
    }
    CVPixelBufferUnlockBaseAddress(m, .readOnly)
    guard let b = seen.values.max(by: { $0.n < $1.n }) else { print("null"); continue }
    let (fw, fh) = (Double(w), Double(h))
    print(String(format: "{\"x\":%.3f,\"y\":%.3f,\"w\":%.3f,\"h\":%.3f}", Double(b.x0) / fw, Double(b.y0) / fh,
                 Double(b.x1 - b.x0 + 1) / fw, Double(b.y1 - b.y0 + 1) / fh))
  } catch {
    print("\"unreadable\"")
  }
}
