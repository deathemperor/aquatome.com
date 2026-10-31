// swift-tools-version: 6.0
// AquaTome's device code, shared by the iOS app and the tests. Keep to Swift 6.0 features: CI builds with Xcode 26.
import PackageDescription

let package = Package(
  name: "AquaTomeKit",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [
    .library(name: "Chihiros", targets: ["Chihiros"]),
    .library(name: "ChihirosBLE", targets: ["ChihirosBLE"]),
  ],
  targets: [
    // Chihiros lights: the frames and replies (pure), no Bluetooth.
    .target(name: "Chihiros"),
    // The same over CoreBluetooth.
    .target(name: "ChihirosBLE", dependencies: ["Chihiros"]),
    // A Mac command line that drives a real light through ChihirosBLE (the iOS simulator has no Bluetooth).
    .executableTarget(name: "light-harness", dependencies: ["Chihiros", "ChihirosBLE"]),
    .testTarget(name: "ChihirosTests", dependencies: ["Chihiros"]),
  ]
)
