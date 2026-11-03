#if DEBUG
import AccountSync
import Foundation
import Tanks

/// The UI tests' accounts server: `FakeAccounts`, kept in a file across launches, so a second "phone" (a launch with
/// `-reset-defaults`) signs in to the account the first one made. `-fake-accounts on` turns accounts on (off
/// otherwise); `-reset-fake-server` starts with no accounts; `-seed-passkey` adds `FakePasskeySignIn`'s passkey to the
/// Apple user `ui-apple`'s account, as "Thêm passkey" on aquatome.com would. It stands in for the fish-ID tool too
/// (`/api/fish-id`): `-fish-id-used N` gives each account N identifications made today already, `-fish-id-busy` uses up
/// the site's day. `-server-offline`: it can't be reached, as with no network.
@MainActor
final class FakeServer {
  private let fake: FakeAccounts
  private let file = FileManager.default.temporaryDirectory.appendingPathComponent("fake-accounts.json")

  init(_ args: [String]) {
    if args.contains("-reset-fake-server") { try? FileManager.default.removeItem(at: file) }
    fake = (try? JSON.parse(Data(contentsOf: file))).map { FakeAccounts(snapshot: $0) } ?? FakeAccounts()
    fake.accountsOn = args.firstIndex(of: "-fake-accounts").map { $0 + 1 < args.count && args[$0 + 1] == "on" } ?? false
    if args.contains("-seed-passkey") { fake.addPasskey(FakePasskeySignIn.credentialId, to: "ui-apple") }
    if let i = args.firstIndex(of: "-fish-id-used"), i + 1 < args.count, let n = Int(args[i + 1]) { fake.fishIdUsedBefore = n }
    if args.contains("-fish-id-busy") { fake.fishIdSiteLeft = 0 }
    fake.offline = args.contains("-server-offline")
    // The fixed pages' readers' comments and photos (HandbookIndex.fixtureReaders), as reports find them.
    fake.reportable.formUnion(["comment:c1", "comment:c2", "photo:p1", "photo:p2"])
  }

  func send(_ r: URLRequest) async throws -> (Data, HTTPURLResponse) {
    // As URLSession: a request from a cancelled task fails.
    if Task.isCancelled { throw URLError(.cancelled) }
    let out = try await fake.send(r)
    try? fake.snapshot.data().write(to: file, options: .atomic)
    return out
  }
}
#endif
