import Foundation
import Vision

// usage: swift faces.swift <image>... → one line per image: the number of human faces macOS Vision finds (-1 if unreadable).
for path in CommandLine.arguments.dropFirst() {
  let req = VNDetectFaceRectanglesRequest()
  do {
    try VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:]).perform([req])
    print(req.results?.count ?? 0)
  } catch {
    print(-1)
  }
}
