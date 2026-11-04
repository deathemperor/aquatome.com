import Foundation
import os

/// The Worker's telemetry endpoints in process (tests, the simulator), so nothing reaches aquatome.com: it keeps every
/// request it's sent, in order, and answers 202, or `status` when set (a failing server).
public final class FakeCollector: Sendable {
  public struct Received: Sendable, Equatable {
    public let path: String
    public let body: Data
    public let userAgent: String?
    public let cookie: String?
    public let authorization: String?
  }

  private let state = OSAllocatedUnfairLock(initialState: (received: [Received](), status: Int?.none))
  /// Told of each request, as it comes.
  private let told: (@Sendable (Received) -> Void)?

  public init(told: (@Sendable (Received) -> Void)? = nil) { self.told = told }

  public var received: [Received] { state.withLock { $0.received } }

  /// What it answers from now on: nil, 202; or this status (no body).
  public func answer(_ status: Int?) { state.withLock { $0.status = status } }

  public func send(_ r: URLRequest) async throws -> (Data, HTTPURLResponse) {
    let got = Received(path: r.url?.path ?? "", body: r.httpBody ?? Data(), userAgent: r.value(forHTTPHeaderField: "User-Agent"),
                       cookie: r.value(forHTTPHeaderField: "Cookie"), authorization: r.value(forHTTPHeaderField: "Authorization"))
    let status = state.withLock { s in
      s.received.append(got)
      return s.status ?? 202
    }
    told?(got)
    return (Data(), HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: nil)!)
  }
}
