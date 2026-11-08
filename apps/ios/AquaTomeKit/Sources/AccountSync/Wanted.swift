import Foundation
import Tanks

/// Readers' demand (docs/my-tanks-sync.md, "Readers' demand"): a fish or plant put on a tank that no page has is sent
/// once, when it is first saved, so the engine writes the most-wanted pages first (apps/site/worker/wanted.ts). Only its
/// kind, name and scientific name: no tank, id, account or token. Needs no sign-in, so it isn't part of the accounts
/// contract. Best effort: never retried or kept for later, and a failure isn't shown.
public struct Wanted: Sendable {
  let base: URL
  let send: Send
  /// Whether this copy of the app is one of ours (`AccountsClient.ourCopy`), asked at each send.
  let ours: @Sendable () -> Bool

  public init(base: URL = AccountsClient.site, send: @escaping Send = AccountsClient.urlSession(), ours: @escaping @Sendable () -> Bool = { false }) {
    self.base = base
    self.send = send
    self.ours = ours
  }

  /// POST /api/v1/wanted with `{ kind, name, sci? }` as JSON, and nothing else.
  public func request(_ e: UnlistedEntry) -> URLRequest {
    var r = URLRequest(url: URL(string: "/api/v1/wanted", relativeTo: base)!.absoluteURL)
    r.httpMethod = "POST"
    r.httpShouldHandleCookies = false
    r.setValue("application/json", forHTTPHeaderField: "Content-Type")
    if ours() { r.setValue("AquaTome-iOS \(AccountsClient.ourCopy)", forHTTPHeaderField: "User-Agent") }
    var body: [String: JSON] = ["kind": .string(e.kind), "name": .string(e.name)]
    if let sci = e.sci { body["sci"] = .string(sci) }
    r.httpBody = try? JSON.object(body).data()
    return r
  }

  /// Sends one entry; whether the server took it (a 2xx). Nothing is thrown or tried again.
  @discardableResult
  public func send(_ e: UnlistedEntry) async -> Bool {
    guard let (_, res) = try? await send(request(e)) else { return false }
    return (200..<300).contains(res.statusCode)
  }
}
