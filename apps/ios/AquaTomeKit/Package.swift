// swift-tools-version: 6.0
// AquaTome's device code, shared by the iOS app and the tests. Keep to Swift 6.0 features: CI builds with Xcode 26.
import PackageDescription

let package = Package(
  name: "AquaTomeKit",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [
    .library(name: "Chihiros", targets: ["Chihiros"]),
  ],
  targets: [
    // Chihiros lights: the frames and replies (pure), no Bluetooth.
    .target(name: "Chihiros"),
    .testTarget(name: "ChihirosTests", dependencies: ["Chihiros"]),
  ]
)
