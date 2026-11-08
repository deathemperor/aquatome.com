import Foundation

public enum OwnerError: Error {
  /// No network, or the server could not be reached.
  case offline
  /// 401: no session the server takes (it ended, or the token isn't the app's): the account must sign in again.
  case signedOut
  /// The Worker's 404 `not_found`. From the dashboard: this account isn't the owner's. From a section or a button: also no
  /// such section or path. A 404 without that body (a page in front of the Worker, a path not deployed yet) is
  /// `refused("http_404")`, and says nothing about who is the owner.
  case notFound
  /// Any other refusal, by its code (`http_<status>` without one), with the words to show the owner when it has some.
  case refused(String, message: String?)
  /// A reply that isn't what the contract says.
  case badReply

  /// Worth trying again soon: offline, or the server's storage not answering just then (503 `unavailable`).
  public var passes: Bool {
    switch self {
    case .offline, .refused("unavailable", _): true
    default: false
    }
  }
}

/// The owner's dashboard as the app reads it and acts on it (protocols/owner-dashboard.openapi.json), with the account's
/// app session as a bearer, and the phone's time zone, which the server writes its days and times in. Use a `Send` that
/// keeps nothing (AccountsClient.urlSession: no cookies, no cache): every reply is the owner's private data.
public struct OwnerClient: Sendable {
  let base: URL
  let send: Send
  let token: String
  let timeZone: String

  public init(base: URL = AccountsClient.site, send: @escaping Send, token: String, timeZone: String = TimeZone.current.identifier) {
    self.base = base
    self.send = send
    self.token = token
    self.timeZone = timeZone
  }

  /// The overview, which also says whether this account is the owner's (404 `notFound`: it isn't).
  public func dashboard() async throws -> Owner.Dashboard {
    Owner.Dashboard(try await call("GET", "/api/owner/dashboard"))
  }

  /// One section, by a key the dashboard lists, for one of its periods (nil: its own first).
  public func section(_ key: String, period: String? = nil) async throws -> Owner.Section {
    guard Owner.isKey(key) else { throw OwnerError.notFound }
    return Owner.Section(try await call("GET", "/api/owner/sections/" + key, query: period.map { [URLQueryItem(name: "period", value: $0)] } ?? []))
  }

  /// A folded or long table's rows, 50 at a time: from its first (`cursor` nil) or after the page before, for the
  /// section's period as it was read.
  public func table(_ key: String, _ id: String, cursor: String?, period: String?) async throws -> Owner.Page<[Owner.Link]> {
    guard Owner.isKey(key), Owner.isKey(id) else { throw OwnerError.notFound }
    let query = [cursor.map { URLQueryItem(name: "cursor", value: $0) }, period.map { URLQueryItem(name: "period", value: $0) }].compactMap { $0 }
    return Owner.Page(rows: try await call("GET", "/api/owner/sections/\(key)/tables/\(id)", query: query))
  }

  /// More comments in one state, after the page before (`cursor`: the comments block's `next`, or that page's).
  public func comments(_ state: String, cursor: String) async throws -> Owner.Page<Owner.Comment> {
    Owner.Page(comments: try await call("GET", "/api/owner/comments", query: [URLQueryItem(name: "state", value: state), URLQueryItem(name: "cursor", value: cursor)]))
  }

  /// A section by its address, as a switch gives it (with its query: "/api/owner/sections/ung-dung?test=1").
  public func section(at href: String) async throws -> Owner.Section {
    guard href.hasPrefix("/api/owner/sections/"), !href.contains("//"), !href.contains(".."), let c = URLComponents(string: href) else { throw OwnerError.notFound }
    return Owner.Section(try await call("GET", c.path, query: c.queryItems ?? []))
  }

  /// The daily report's delivery now: by email, and by notification to the owner's phones.
  public func reportSettings() async throws -> (email: Bool, push: Bool) {
    let o = try await call("GET", "/api/owner/report-settings")
    guard let email = o["email"] as? Bool, let push = o["push"] as? Bool else { throw OwnerError.badReply }
    return (email, push)
  }

  /// The daily report's email on or off: what it is now.
  public func reportEmail(_ on: Bool) async throws -> Bool {
    let o = try await call("POST", "/api/owner/report-settings", body: Owner.text(["email": on]))
    guard let email = o["email"] as? Bool else { throw OwnerError.badReply }
    return email
  }

  /// A button's request, sent exactly as it says. Done on 200; then read the section again.
  public func run(_ a: Owner.Action) async throws {
    _ = try await call(a.method, a.path, body: a.body)
  }

  /// This phone's token for the daily report's notifications given to the site with the APNs it's from, `sandbox` or
  /// `production` (`environment`), or taken back (nil): the token alone. Done on any 2xx, with or without a body.
  public func pushToken(_ token: String, environment: String?) async throws {
    let body = Owner.text(environment.map { ["token": token, "environment": $0] } ?? ["token": token])
    _ = try await call(environment == nil ? "DELETE" : "POST", "/api/owner/push-token", body: body, needsReply: false)
  }

  /// A photo's bytes, or nil when it can't be had (gone, offline, not the owner): a private one (from "/") with the bearer,
  /// a public one (a whole address) without. Kept by no one here: the `Send` caches nothing.
  public func image(_ src: String) async -> Data? {
    guard let (url, bearer) = imageURL(src) else { return nil }
    var r = URLRequest(url: url)
    r.httpShouldHandleCookies = false
    if bearer { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
    guard let (data, res) = try? await send(r), res.statusCode == 200, !data.isEmpty else { return nil }
    return data
  }

  /// Where a photo is, and whether it takes the bearer: only a path on this site does; any other host never gets it.
  func imageURL(_ src: String) -> (URL, bearer: Bool)? {
    if Owner.isSitePath(src) {
      guard let u = URL(string: src, relativeTo: base)?.absoluteURL, u.host == base.host else { return nil }
      return (u, true)
    }
    guard let u = URL(string: src), u.scheme == "https", u.host != nil else { return nil }
    return (u, false)
  }

  /// A page of the site a cell links to (from "/"), as an address.
  public func page(_ href: String) -> URL? {
    Owner.isSitePath(href) ? URL(string: href, relativeTo: base)?.absoluteURL : nil
  }

  private func call(_ method: String, _ path: String, query: [URLQueryItem] = [], body: String? = nil, needsReply: Bool = true) async throws -> Dict {
    var c = URLComponents(url: base, resolvingAgainstBaseURL: false)!
    c.path = path
    c.queryItems = query.isEmpty ? nil : query
    guard let url = c.url else { throw OwnerError.badReply }
    var r = URLRequest(url: url)
    r.httpMethod = method
    r.httpShouldHandleCookies = false
    r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    r.setValue(timeZone, forHTTPHeaderField: "Time-Zone")
    if let body {
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
      r.httpBody = Data(body.utf8)
    }
    let data: Data, res: HTTPURLResponse
    do { (data, res) = try await send(r) } catch let e as URLError { throw e.code == .cancelled ? CancellationError() : OwnerError.offline }
    let reply = (try? JSONSerialization.jsonObject(with: data)) as? Dict
    switch res.statusCode {
    case 200..<300:
      guard let reply else { if needsReply { throw OwnerError.badReply } else { return [:] } }
      return reply
    case 401: throw OwnerError.signedOut
    case 404 where reply?["error"] as? String == "not_found": throw OwnerError.notFound
    default:
      throw OwnerError.refused(reply?["error"] as? String ?? "http_\(res.statusCode)", message: reply?["message"] as? String)
    }
  }
}
