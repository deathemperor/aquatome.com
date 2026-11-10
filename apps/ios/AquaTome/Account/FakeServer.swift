#if DEBUG
import AccountSync
import Foundation
import Tanks

/// The UI tests' accounts server: `FakeAccounts`, kept in a file across launches, so a second "phone" (a launch with
/// `-reset-defaults`) signs in to the account the first one made. `-fake-accounts on` turns accounts on (off
/// otherwise); `-reset-fake-server` starts with no accounts; `-seed-passkey` adds `FakePasskeySignIn`'s passkey to the
/// Apple user `ui-apple`'s account, as "Thêm passkey" on aquatome.com would. It stands in for the fish-ID tool too
/// (`/api/fish-id`): `-fish-id-used N` gives each account N identifications made today already, `-fish-id-busy` uses up
/// the site's day, `-fish-id-slow` keeps an identification waiting 40 s (with `-test-gates`, until the test opens
/// `fish-id-answer`), then fails it as a request's time running out does, and `-fish-id-session-refused` refuses it the account's session (401 `session`) while the session itself holds.
/// `-server-offline`: it can't be reached, as with no network. `-slow-session`: who is signed in is answered after 15 s,
/// as on a slow network, so a test can close the Tài khoản sheet while it's asked. `-session-fails`: who is signed in is
/// answered 500, as a server fault. `-sync-busy N`: the next N syncs answer 409 busy (the app
/// tries one 4 times); `-sync-refuses`: every record a sync sends is refused; `-sync-full`: syncs answer 422 too_many;
/// `-sync-newer-store`: syncs answer with a store from a newer app; `-end-sessions <account>`: that account's sessions end, as signing out on another device does. `-slow-post`: a reader's comment or photo takes 6 s to
/// arrive, as on a slow network, so a test sees it being sent. `-fake-owner <account>` serves the owner's dashboard to
/// that account (`ui-apple`, or another, so `ui-apple` isn't the owner): the replies of
/// protocols/owner-dashboard-vectors.json, read from this checkout (the simulator runs on the Mac that built it).
/// `-owner-session-ends` ends the owner's session at the first section read, as one expiring while the dashboard is open;
/// `-owner-storage-down` answers that read 503, as the Worker does while its storage doesn't answer; `-owner-overview
/// <vector name>` answers the overview with another of its vectors ("dashboard: nothing needs you"). The chat is FakeChat's.
@MainActor
final class FakeServer {
  private let fake: FakeAccounts
  private let slowPost: Bool
  private let slowSession: Bool
  private let sessionFails: Bool
  private let file = FileManager.default.temporaryDirectory.appendingPathComponent("fake-accounts.json")
  private let slowFishId: Bool
  private let fishIdRefusesSession: Bool
  private var chat: FakeChat!

  init(_ args: [String]) {
    if args.contains("-reset-fake-server") { try? FileManager.default.removeItem(at: file) }
    fake = (try? JSON.parse(Data(contentsOf: file))).map { FakeAccounts(snapshot: $0) } ?? FakeAccounts()
    slowPost = args.contains("-slow-post")
    slowSession = args.contains("-slow-session")
    sessionFails = args.contains("-session-fails")
    fake.accountsOn = args.firstIndex(of: "-fake-accounts").map { $0 + 1 < args.count && args[$0 + 1] == "on" } ?? false
    if args.contains("-seed-passkey") { fake.addPasskey(FakePasskeySignIn.credentialId, to: "ui-apple") }
    if let i = args.firstIndex(of: "-fake-owner"), i + 1 < args.count {
      var repo = URL(fileURLWithPath: #filePath)
      for _ in 0..<5 { repo.deleteLastPathComponent() }
      let vectors = repo.appending(path: "protocols/owner-dashboard-vectors.json")
      guard let v = try? JSON.parse(Data(contentsOf: vectors)) else { fatalError("-fake-owner: can't read \(vectors.path)") }
      fake.owner = FakeOwner(vectors: v, owners: [args[i + 1]])
      // The sample's two waiting photos, as the site's checks serve them (apps/site/e2e/dashboard-charts.spec.ts).
      for (id, file) in [("a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", "koi"), ("b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e", "halfmoon")] {
        let photo = repo.appending(path: "apps/site/e2e/photos/reader-photo-\(file).webp")
        guard let d = try? Data(contentsOf: photo) else { fatalError("-fake-owner: can't read \(photo.path)") }
        fake.owner?.webp["/_ab/anh/" + id] = d
      }
      fake.owner?.sessionEndsAtNextSection = args.contains("-owner-session-ends")
      fake.owner?.storageDownAtNextSection = args.contains("-owner-storage-down")
      if let j = args.firstIndex(of: "-owner-overview"), j + 1 < args.count { fake.owner?.overview = args[j + 1] }
    }
    if let i = args.firstIndex(of: "-fish-id-used"), i + 1 < args.count, let n = Int(args[i + 1]) { fake.fishIdUsedBefore = n }
    if args.contains("-fish-id-busy") { fake.fishIdSiteLeft = 0 }
    fake.offline = args.contains("-server-offline")
    if let i = args.firstIndex(of: "-sync-busy"), i + 1 < args.count, let n = Int(args[i + 1]) { fake.busy = n }
    fake.refuseEvery = args.contains("-sync-refuses")
    fake.full = args.contains("-sync-full")
    fake.newerStore = args.contains("-sync-newer-store")
    if let i = args.firstIndex(of: "-end-sessions"), i + 1 < args.count { fake.endSessions(of: args[i + 1]) }
    slowFishId = args.contains("-fish-id-slow")
    fishIdRefusesSession = args.contains("-fish-id-session-refused")
    // The fixed pages' readers' comments and photos (HandbookIndex.fixtureReaders), as reports find them.
    fake.reportable.formUnion(["comment:c1", "comment:c2", "photo:p1", "photo:p2"])
    chat = FakeChat(args) { [fake] in fake.account(bearer: $0) }
  }

  /// A request for a stream (the chat's question): its answer and bytes, as they come.
  func stream(_ r: URLRequest) async throws -> FakeChat.Answer {
    if Task.isCancelled { throw URLError(.cancelled) }
    if fake.offline { throw URLError(.notConnectedToInternet) }
    return try chat.ask(r)
  }

  func send(_ r: URLRequest) async throws -> (Data, HTTPURLResponse) {
    // As URLSession: a request from a cancelled task fails.
    if Task.isCancelled { throw URLError(.cancelled) }
    if r.httpMethod == "POST", r.url?.path == "/api/fish-id" {
      if slowFishId {
        try await TestGate.wait("fish-id-answer", or: .seconds(40))
        throw URLError(.timedOut)
      }
      if fishIdRefusesSession {
        return (Data(#"{"error":"session"}"#.utf8), HTTPURLResponse(url: r.url!, statusCode: 401, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
      }
    }
    if slowPost, r.httpMethod == "POST", ["/_c", "/_p"].contains(r.url?.path) { try? await Task.sleep(for: .seconds(6)) }
    // A request whose task is cancelled meanwhile fails as cancelled, as URLSession's does.
    if slowSession, r.url?.path == "/api/v1/session" { try await Task.sleep(for: .seconds(15)) }
    if let answer = chat.status(r) ?? chat.answer(r) {
      if fake.offline { throw URLError(.notConnectedToInternet) }
      if r.url?.path == "/api/chat/cancel", ProcessInfo.processInfo.arguments.contains("-chat-cancel-late") { try await Task.sleep(for: .seconds(3)) }
      return answer
    }
    if sessionFails, r.url?.path == "/api/v1/session" {
      return (Data(#"{"error":"internal"}"#.utf8), HTTPURLResponse(url: r.url!, statusCode: 500, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
    }
    let out = try await fake.send(r)
    try? fake.snapshot.data().write(to: file, options: .atomic)
    return out
  }
}
#endif
