// swift-tools-version: 6.0
// AquaTome's device code, shared by the iOS app and the tests. Keep to Swift 6.0 features: CI builds with Xcode 26.
import PackageDescription

/// Release builds optimize for size, as the app does (its project sets -Osize): the app does nothing CPU-heavy.
let small: [SwiftSetting] = [.unsafeFlags(["-Osize"], .when(configuration: .release))]

let package = Package(
  name: "AquaTomeKit",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [
    .library(name: "Chihiros", targets: ["Chihiros"]),
    .library(name: "ChihirosBLE", targets: ["ChihirosBLE"]),
    .library(name: "Tanks", targets: ["Tanks"]),
    .library(name: "Handbook", targets: ["Handbook"]),
    .library(name: "AccountSync", targets: ["AccountSync"]),
    .library(name: "Plugs", targets: ["Plugs"]),
  ],
  targets: [
    // Chihiros lights: the frames and replies (pure), no Bluetooth.
    .target(name: "Chihiros", swiftSettings: small),
    // The same over CoreBluetooth.
    .target(name: "ChihirosBLE", dependencies: ["Chihiros"], swiftSettings: small),
    // A Mac command line that drives a real light through ChihirosBLE (the iOS simulator has no Bluetooth).
    .executableTarget(name: "light-harness", dependencies: ["Chihiros", "ChihirosBLE"]),
    .testTarget(name: "ChihirosTests", dependencies: ["Chihiros"]),
    // "Bể của tôi": tanks and devices, the site's model and merge rules (docs/my-tanks-sync.md). Pure.
    .target(name: "Tanks", swiftSettings: small),
    .testTarget(name: "TanksTests", dependencies: ["Tanks"]),
    // The handbook: the site's page index for the app (/app/<lang>.json) and searching it. Pure.
    .target(name: "Handbook", swiftSettings: small),
    .testTarget(name: "HandbookTests", dependencies: ["Handbook"]),
    // Signing in to aquatome.com and syncing "Bể của tôi" with the account (protocols/accounts.openapi.json), and a
    // stand-in server for tests and the simulator. Not "Accounts": that is an Apple framework's name.
    .target(name: "AccountSync", dependencies: ["Tanks"], swiftSettings: small),
    .testTarget(name: "AccountSyncTests", dependencies: ["AccountSync", "Tanks"]),
    // Smart plugs (docs/smart-plugs.md): where they come from (`PlugSource`: Tuya's cloud with the reader's own project
    // keys), what the app shows of them and the switching rules (`PlugBoard`), and a stand-in Tuya cloud for tests and
    // the simulator.
    .target(name: "Plugs", dependencies: ["Tanks"], swiftSettings: small),
    .testTarget(name: "PlugsTests", dependencies: ["Plugs", "Tanks"]),
  ]
)
