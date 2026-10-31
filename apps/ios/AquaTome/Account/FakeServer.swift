#if DEBUG
import AccountSync
import Foundation
import Tanks

/// The UI tests' accounts server: `FakeAccounts`, kept in a file across launches, so a second "phone" (a launch with
/// `-reset-defaults`) signs in to the account the first one made. `-fake-accounts on` turns accounts on (off
/// otherwise); `-reset-fake-server` starts with no accounts.
@MainActor
final class FakeServer {
  private let fake: FakeAccounts
  private let file = FileManager.default.temporaryDirectory.appendingPathComponent("fake-accounts.json")

  init(_ args: [String]) {
    if args.contains("-reset-fake-server") { try? FileManager.default.removeItem(at: file) }
    fake = (try? JSON.parse(Data(contentsOf: file))).map { FakeAccounts(snapshot: $0) } ?? FakeAccounts()
    fake.accountsOn = args.firstIndex(of: "-fake-accounts").map { $0 + 1 < args.count && args[$0 + 1] == "on" } ?? false
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
