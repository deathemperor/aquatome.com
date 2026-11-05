#if DEBUG
import AccountSync
import Foundation
import Tanks

/// The UI tests' accounts server: `FakeAccounts`, kept in a file across launches, so a second "phone" (a launch with
/// `-reset-defaults`) signs in to the account the first one made. `-fake-accounts on` turns accounts on (off
/// otherwise); `-reset-fake-server` starts with no accounts; `-seed-passkey` adds `FakePasskeySignIn`'s passkey to the
/// Apple user `ui-apple`'s account, as "Thêm passkey" on aquatome.com would; `-fake-offline` answers nothing, as with no
/// network. `-slow-post`: a reader's comment or photo takes 6 s to arrive, as on a slow network, so a test sees it
/// being sent.
@MainActor
final class FakeServer {
  private let fake: FakeAccounts
  private let slowPost: Bool
  private let file = FileManager.default.temporaryDirectory.appendingPathComponent("fake-accounts.json")
  private let offline: Bool

  init(_ args: [String]) {
    if args.contains("-reset-fake-server") { try? FileManager.default.removeItem(at: file) }
    fake = (try? JSON.parse(Data(contentsOf: file))).map { FakeAccounts(snapshot: $0) } ?? FakeAccounts()
    slowPost = args.contains("-slow-post")
    fake.accountsOn = args.firstIndex(of: "-fake-accounts").map { $0 + 1 < args.count && args[$0 + 1] == "on" } ?? false
    if args.contains("-seed-passkey") { fake.addPasskey(FakePasskeySignIn.credentialId, to: "ui-apple") }
    // The fixed pages' readers' comments and photos (HandbookIndex.fixtureReaders), as reports find them.
    fake.reportable.formUnion(["comment:c1", "comment:c2", "photo:p1", "photo:p2"])
    offline = args.contains("-fake-offline")
  }

  func send(_ r: URLRequest) async throws -> (Data, HTTPURLResponse) {
    // As URLSession: a request from a cancelled task fails.
    if Task.isCancelled { throw URLError(.cancelled) }
    if offline { throw URLError(.notConnectedToInternet) }
    if slowPost, r.httpMethod == "POST", ["/_c", "/_p"].contains(r.url?.path) { try? await Task.sleep(for: .seconds(6)) }
    let out = try await fake.send(r)
    try? fake.snapshot.data().write(to: file, options: .atomic)
    return out
  }
}
#endif
