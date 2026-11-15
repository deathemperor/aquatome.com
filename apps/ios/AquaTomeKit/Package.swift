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
    .library(name: "WeekAqua", targets: ["WeekAqua"]),
    .library(name: "Tanks", targets: ["Tanks"]),
    .library(name: "Handbook", targets: ["Handbook"]),
    .library(name: "AccountSync", targets: ["AccountSync"]),
    .library(name: "Plugs", targets: ["Plugs"]),
    .library(name: "TankCheck", targets: ["TankCheck"]),
    .library(name: "Telemetry", targets: ["Telemetry"]),
    .library(name: "FishLamp", targets: ["FishLamp"]),
  ],
  targets: [
    // Chihiros lights: the frames and replies (pure), no Bluetooth.
    .target(name: "Chihiros", swiftSettings: small),
    // The same over CoreBluetooth, for Week Aqua lights too.
    .target(name: "ChihirosBLE", dependencies: ["Chihiros", "WeekAqua"], swiftSettings: small),
    // A Mac command line that drives a real light through ChihirosBLE, and broadcasts to the Love Ecology light (the iOS
    // simulator has no Bluetooth).
    .executableTarget(name: "light-harness", dependencies: ["Chihiros", "ChihirosBLE", "FishLamp"]),
    .testTarget(name: "ChihirosTests", dependencies: ["Chihiros"]),
    // Week Aqua lights of model code 5746: the frames, the order they're sent in, and a fake light (pure), no Bluetooth.
    // Times of day are the Chihiros module's.
    .target(name: "WeekAqua", dependencies: ["Chihiros"], swiftSettings: small),
    .testTarget(name: "WeekAquaTests", dependencies: ["WeekAqua", "Chihiros"]),
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
    // A tank's fish checked as the site's tank-mates tool checks them: the site's own code, bundled into tank-check.js by
    // apps/site/scripts/app-tank-check.mjs, run in JavaScriptCore.
    .target(name: "TankCheck", dependencies: ["Handbook"], resources: [.copy("tank-check.js")], swiftSettings: small),
    .testTarget(name: "TankCheckTests", dependencies: ["TankCheck", "Handbook"]),
    // Anonymous usage events and iOS's crash and performance reports, sent to aquatome.com's own Worker as the privacy
    // policy lists them (a queue on the phone, batches, the site's and the reader's switches), and a stand-in Worker for
    // tests and the simulator.
    .target(name: "Telemetry", swiftSettings: small),
    .testTarget(name: "TelemetryTests", dependencies: ["Telemetry"]),
    // The Love Ecology light the Fish lamp app drives by broadcast: the owner's recorded commands, played back. Pure:
    // the app advertises them.
    .target(name: "FishLamp", resources: [.copy("love-ecology.json")], swiftSettings: small),
    .testTarget(name: "FishLampTests", dependencies: ["FishLamp"]),
  ]
)
