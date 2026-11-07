#if DEBUG
import AccountSync
import Foundation
import Tanks

/// The UI tests' accounts server: `FakeAccounts`, kept in a file across launches, so a second "phone" (a launch with
/// `-reset-defaults`) signs in to the account the first one made. `-fake-accounts on` turns accounts on (off
/// otherwise); `-reset-fake-server` starts with no accounts; `-seed-passkey` adds `FakePasskeySignIn`'s passkey to the
/// Apple user `ui-apple`'s account, as "Thêm passkey" on aquatome.com would. It stands in for the fish-ID tool too
/// (`/api/fish-id`): `-fish-id-used N` gives each account N identifications made today already, `-fish-id-busy` uses up
/// the site's day, `-fish-id-slow` keeps an identification waiting 40 s, then fails it as a request's time running out
/// does, and `-fish-id-session-refused` refuses it the account's session (401 `session`) while the session itself holds.
/// `-server-offline`: it can't be reached, as with no network. `-slow-post`: a reader's comment or photo takes 6 s to
/// arrive, as on a slow network, so a test sees it being sent. `-fake-owner <account>` serves the owner's dashboard to
/// that account (`ui-apple`, or another, so `ui-apple` isn't the owner): the replies of
/// protocols/owner-dashboard-vectors.json, read from this checkout (the simulator runs on the Mac that built it).
/// `-owner-session-ends` ends the owner's session at the first section read, as one expiring while the dashboard is open;
/// `-owner-storage-down` answers that read 503, as the Worker does while its storage doesn't answer; `-owner-overview
/// <vector name>` answers the overview with another of its vectors ("dashboard: nothing needs you").
@MainActor
final class FakeServer {
  private let fake: FakeAccounts
  private let slowPost: Bool
  private let file = FileManager.default.temporaryDirectory.appendingPathComponent("fake-accounts.json")
  private let slowFishId: Bool
  private let fishIdRefusesSession: Bool

  init(_ args: [String]) {
    if args.contains("-reset-fake-server") { try? FileManager.default.removeItem(at: file) }
    fake = (try? JSON.parse(Data(contentsOf: file))).map { FakeAccounts(snapshot: $0) } ?? FakeAccounts()
    slowPost = args.contains("-slow-post")
    fake.accountsOn = args.firstIndex(of: "-fake-accounts").map { $0 + 1 < args.count && args[$0 + 1] == "on" } ?? false
    if args.contains("-seed-passkey") { fake.addPasskey(FakePasskeySignIn.credentialId, to: "ui-apple") }
    if let i = args.firstIndex(of: "-fake-owner"), i + 1 < args.count {
      var repo = URL(fileURLWithPath: #filePath)
      for _ in 0..<5 { repo.deleteLastPathComponent() }
      let vectors = repo.appending(path: "protocols/owner-dashboard-vectors.json")
      guard let v = try? JSON.parse(Data(contentsOf: vectors)) else { fatalError("-fake-owner: can't read \(vectors.path)") }
      fake.owner = FakeOwner(vectors: v, owners: [args[i + 1]])
      fake.owner?.sessionEndsAtNextSection = args.contains("-owner-session-ends")
      fake.owner?.storageDownAtNextSection = args.contains("-owner-storage-down")
      if let j = args.firstIndex(of: "-owner-overview"), j + 1 < args.count { fake.owner?.overview = args[j + 1] }
    }
    if let i = args.firstIndex(of: "-fish-id-used"), i + 1 < args.count, let n = Int(args[i + 1]) { fake.fishIdUsedBefore = n }
    if args.contains("-fish-id-busy") { fake.fishIdSiteLeft = 0 }
    fake.offline = args.contains("-server-offline")
    slowFishId = args.contains("-fish-id-slow")
    fishIdRefusesSession = args.contains("-fish-id-session-refused")
    // The fixed pages' readers' comments and photos (HandbookIndex.fixtureReaders), as reports find them.
    fake.reportable.formUnion(["comment:c1", "comment:c2", "photo:p1", "photo:p2"])
  }

  func send(_ r: URLRequest) async throws -> (Data, HTTPURLResponse) {
    // As URLSession: a request from a cancelled task fails.
    if Task.isCancelled { throw URLError(.cancelled) }
    if r.httpMethod == "POST", r.url?.path == "/api/fish-id" {
      if slowFishId {
        try await Task.sleep(for: .seconds(40))
        throw URLError(.timedOut)
      }
      if fishIdRefusesSession {
        return (Data(#"{"error":"session"}"#.utf8), HTTPURLResponse(url: r.url!, statusCode: 401, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
      }
    }
    if slowPost, r.httpMethod == "POST", ["/_c", "/_p"].contains(r.url?.path) { try? await Task.sleep(for: .seconds(6)) }
    let out = try await fake.send(r)
    try? fake.snapshot.data().write(to: file, options: .atomic)
    return out
  }
}
#endif
