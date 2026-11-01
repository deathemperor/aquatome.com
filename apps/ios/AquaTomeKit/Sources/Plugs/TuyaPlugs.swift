import CryptoKit
import Foundation
import Tanks

// Tuya's cloud, called by the phone with the reader's own cloud project keys (docs/smart-plugs.md): signed requests, a
// token kept while it lasts, the devices of the Smart Life account linked to the project with their outlets, and one
// outlet switched and read back. A Swift port of the parked server route's apps/site/worker/plugs/tuya.ts.
// Nothing here logs: errors carry Tuya's code only, never a key, a token, a body or an id.

/// Where a Tuya cloud project lives (https://developer.tuya.com/en/docs/iot/api-request).
public enum TuyaDataCenter: String, CaseIterable, Sendable {
  case westernAmerica, easternAmerica, centralEurope, westernEurope, india, china

  public var host: URL {
    let s = switch self {
    case .westernAmerica: "https://openapi.tuyaus.com"
    case .easternAmerica: "https://openapi-ueaz.tuyaus.com"
    case .centralEurope: "https://openapi.tuyaeu.com"
    case .westernEurope: "https://openapi-weaz.tuyaeu.com"
    case .india: "https://openapi.tuyain.com"
    case .china: "https://openapi.tuyacn.com"
    }
    return URL(string: s)!
  }
}

/// A cloud project's keys, as its Overview page shows them, and its data center.
public struct TuyaKeys: Sendable, Equatable {
  public let accessId: String
  public let accessSecret: String
  public let dataCenter: TuyaDataCenter
  public init(accessId: String, accessSecret: String, dataCenter: TuyaDataCenter) {
    self.accessId = accessId
    self.accessSecret = accessSecret
    self.dataCenter = dataCenter
  }
}

/// Tuya's request signature: HMAC-SHA256, in uppercase hex, of the client id, the token (not for a token request), the
/// time, the nonce and the request (method, the body's SHA-256, signed headers, the path with its query sorted by key).
/// https://developer.tuya.com/en/docs/iot/new-singnature
public func tuyaSign(id: String, secret: String, t: String, nonce: String, token: String? = nil, method: String, path: String,
                     body: String = "", headers: [(String, String)] = []) -> String {
  let parts = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
  let query = parts.count > 1 ? "?" + parts[1].split(separator: "&").sorted { $0.prefix { $0 != "=" } < $1.prefix { $0 != "=" } }.joined(separator: "&") : ""
  let stringToSign = [method, hex(SHA256.hash(data: Data(body.utf8))), headers.map { "\($0):\($1)\n" }.joined(), parts[0] + query].joined(separator: "\n")
  let mac = HMAC<SHA256>.authenticationCode(for: Data((id + (token ?? "") + t + nonce + stringToSign).utf8), using: SymmetricKey(data: Data(secret.utf8)))
  return hex(mac).uppercased()
}

private func hex<D: Sequence>(_ d: D) -> String where D.Element == UInt8 { d.map { String(format: "%02x", $0) }.joined() }

/// The reader's plugs from Tuya's cloud, with their project's keys.
public actor TuyaPlugs: PlugSource {
  public typealias Send = @Sendable (URLRequest) async throws -> (Data, HTTPURLResponse)

  /// The project (its keys' digest): another project's answers aren't this one's.
  public nonisolated let owner: String
  private let keys: TuyaKeys
  private let send: Send
  private let now: @Sendable () -> Date
  private let nonce: @Sendable () -> String
  private let wait: @Sendable (Duration) async -> Void
  private var token: (value: String, until: Date)?
  /// The last list's plugs, by id: a switch goes only to one of them, listed online, with that outlet.
  private var listed: [String: LivePlug] = [:]

  /// Token expired, invalid, or in an invalid state: Tuya refuses these before acting, so a new token and once more.
  static let staleToken: Set = [1010, 1011, 1012]
  /// After a command, the outlet is read back this often, for up to this long.
  static let readEvery = 600, readFor = 3000

  public init(keys: TuyaKeys, send: @escaping Send = TuyaPlugs.urlSession(), now: @escaping @Sendable () -> Date = Date.init,
              nonce: @escaping @Sendable () -> String = { UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased() },
              wait: @escaping @Sendable (Duration) async -> Void = { try? await Task.sleep(for: $0) }) {
    self.keys = keys
    self.send = send
    self.now = now
    self.nonce = nonce
    self.wait = wait
    owner = hex(SHA256.hash(data: Data("\(keys.dataCenter.rawValue)|\(keys.accessId)|\(keys.accessSecret)".utf8)))
  }

  /// URLSession with no cookies and no cache; a maker that hasn't answered in 8 seconds counts as unreachable.
  public static func urlSession() -> Send {
    let c = URLSessionConfiguration.ephemeral
    c.httpShouldSetCookies = false
    c.httpCookieAcceptPolicy = .never
    c.httpCookieStorage = nil
    c.urlCache = nil
    c.timeoutIntervalForRequest = 8
    let session = URLSession(configuration: c)
    return { r in
      let (data, res) = try await session.data(for: r)
      guard let http = res as? HTTPURLResponse else { throw URLError(.badServerResponse) }
      return (data, http)
    }
  }

  /// The devices of the Smart Life account(s) linked to the project: those with at least one outlet, with the names
  /// the reader gave the outlets in Smart Life.
  public func list() async throws -> PlugList {
    var devices: [Object] = [], next: String?
    // Page by page while there's more (at most 50: a cursor that doesn't move ends it).
    for _ in 0..<50 {
      let page = try await call("GET", "/v1.0/iot-01/associated-users/devices", query: next.map { [("last_row_key", $0)] } ?? [])
      guard let o = page.object, let list = o["devices"]?.array else { throw PlugError.badReply }
      devices += list.compactMap(\.object)
      guard case .bool(true)? = o["has_more"], let key = o["last_row_key"]?.string, !key.isEmpty, key != next else { break }
      next = key
    }
    var plugs: [LivePlug] = [], others = 0
    for d in devices {
      guard let id = d["id"]?.string, !id.isEmpty else { others += 1; continue }
      // The list carries each device's status; one without it is asked for it.
      let status: JSON
      if let s = d["status"] { status = s } else { status = try await call("GET", "/v1.0/iot-03/devices/\(Self.segment(id))/status") }
      let outlets = Self.outlets(status)
      guard !outlets.isEmpty else { others += 1; continue }
      // The names the reader gave the outlets in Smart Life ("CO2", "Đèn"); a strip without them still lists.
      let named: [JSON]
      do { named = try await call("GET", "/v1.0/devices/\(Self.segment(id))/multiple-names").array ?? [] } catch is CancellationError { throw CancellationError() } catch { named = [] }
      let names = Dictionary(named.compactMap { n -> (String, String)? in
        guard let o = n.object, let code = o["identifier"]?.string, let name = o["name"]?.string?.trimmingCharacters(in: .whitespacesAndNewlines), !name.isEmpty else { return nil }
        return (code, name)
      }, uniquingKeysWith: { a, _ in a })
      plugs.append(LivePlug(provider: "tuya", id: id, name: d["name"]?.string ?? "", online: d["online"] == .bool(true),
                            outlets: outlets.map { LiveOutlet(code: $0.code, name: names[$0.code], on: $0.on) }))
    }
    listed = Dictionary(plugs.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
    return PlugList(plugs: plugs, others: others)
  }

  /// One command, then the outlet read back until the plug reports the state asked for (up to 3 seconds). Tuya
  /// accepting a command doesn't mean the plug switched.
  public func set(provider: String, device: String, outlet code: String, on: Bool) async throws -> Switched {
    guard provider == "tuya", let plug = listed[device], plug.outlets.contains(where: { $0.code == code }) else { throw PlugError.noSuchPlug }
    guard plug.online else { throw PlugError.plugOffline }
    _ = try await call("POST", "/v1.0/iot-03/devices/\(Self.segment(device))/commands", body: ["commands": .array([.object(["code": .string(code), "value": .bool(on)])])])
    var reported: Bool?
    var waited = 0
    repeat {
      await wait(.milliseconds(Self.readEvery))
      waited += Self.readEvery
      // One that can't be read is unknown, not refused.
      let status = try? await call("GET", "/v1.0/iot-03/devices/\(Self.segment(device))/status")
      reported = status.flatMap { Self.outlets($0).first { $0.code == code }?.on }
    } while reported != on && waited < Self.readFor
    return Switched(on: reported, confirmed: reported == on)
  }

  // MARK: Requests

  /// With the project's token; a stale one is replaced and the request asked once more.
  private func call(_ method: String, _ path: String, query: [(String, String)] = [], body: [String: JSON]? = nil) async throws -> JSON {
    do {
      return try await request(method, path, query: query, body: body, token: accessToken())
    } catch PlugError.maker(let code) where Self.staleToken.contains(code) {
      token = nil
      return try await request(method, path, query: query, body: body, token: accessToken())
    }
  }

  /// Kept until a minute before it runs out.
  private func accessToken() async throws -> String {
    if let t = token, t.until > now() { return t.value }
    let r = try await request("GET", "/v1.0/token", query: [("grant_type", "1")], body: nil, token: nil)
    guard let value = r.object?["access_token"]?.string, let seconds = r.object?["expire_time"]?.number else { throw PlugError.badReply }
    token = (value, now().addingTimeInterval(seconds - 60))
    return value
  }

  private func request(_ method: String, _ path: String, query: [(String, String)], body: [String: JSON]?, token: String?) async throws -> JSON {
    // Signed with the query as it reads, sent percent-encoded (as Tuya's own SDKs do).
    let sorted = query.sorted { $0.0 < $1.0 }
    let signed = path + (sorted.isEmpty ? "" : "?" + sorted.map { "\($0)=\($1)" }.joined(separator: "&"))
    let sent = path + (sorted.isEmpty ? "" : "?" + sorted.map { "\($0)=\(Self.segment($1))" }.joined(separator: "&"))
    let text = try body.map { String(decoding: try JSON.object($0).data(), as: UTF8.self) } ?? ""
    let t = String(Int64(now().timeIntervalSince1970 * 1000)), n = nonce()
    var r = URLRequest(url: URL(string: sent, relativeTo: keys.dataCenter.host)!.absoluteURL)
    r.httpMethod = method
    r.httpShouldHandleCookies = false
    r.setValue(keys.accessId, forHTTPHeaderField: "client_id")
    r.setValue(t, forHTTPHeaderField: "t")
    r.setValue(n, forHTTPHeaderField: "nonce")
    r.setValue("HMAC-SHA256", forHTTPHeaderField: "sign_method")
    r.setValue(tuyaSign(id: keys.accessId, secret: keys.accessSecret, t: t, nonce: n, token: token, method: method, path: signed, body: text), forHTTPHeaderField: "sign")
    if let token { r.setValue(token, forHTTPHeaderField: "access_token") }
    if body != nil {
      r.setValue("application/json", forHTTPHeaderField: "Content-Type")
      r.httpBody = Data(text.utf8)
    }
    let data: Data
    do { (data, _) = try await send(r) } catch let e as URLError { throw e.code == .cancelled ? CancellationError() : PlugError.offline }
    guard let o = (try? JSON.parse(data))?.object, case .bool(let success)? = o["success"] else { throw PlugError.badReply }
    guard success else { throw Self.error(o["code"]?.int ?? 0) }
    return o["result"] ?? .null
  }

  /// Tuya's error codes (https://developer.tuya.com/en/docs/iot/error-code) as the app tells them apart.
  static func error(_ code: Int) -> PlugError {
    switch code {
    case 1001, 1004, 1005: .badKeys // secret invalid, sign invalid, clientId invalid
    case 1013: .clock // request time is invalid
    case 28841002, 28841003, 28841102, 28841103: .expired // cloud development plan (or API subscription) expired or overdue
    case 28841001, 28841101, 28841105, 28841106: .notSubscribed // no plan, API not subscribed, project not authorized
    case 28841004, 28841104: .quota // trial edition or API quota exhausted
    case 1110, 1111, 1112, 1113: .busy // over the limit, busy, syncing, repeated too soon
    case 2001: .plugOffline // device is offline
    case 2010: .noSuchPlug // device not exist
    default: .maker(code)
    }
  }

  /// An outlet's switch: switch, switch_1…, switch_usb1… (not switch_led, a plug's indicator light), with its state.
  static func outlets(_ status: JSON) -> [(code: String, on: Bool)] {
    (status.array ?? []).compactMap { s in
      guard let o = s.object, let code = o["code"]?.string, isOutlet(code), case .bool(let on)? = o["value"] else { return nil }
      return (code, on)
    }
  }

  static func isOutlet(_ code: String) -> Bool {
    if code == "switch" { return true }
    guard code.hasPrefix("switch_") else { return false }
    var rest = code.dropFirst("switch_".count)
    if rest.hasPrefix("usb") { rest = rest.dropFirst(3) }
    return !rest.isEmpty && rest.allSatisfy { $0.isASCII && $0.isNumber }
  }

  /// A path segment or query value: everything but the unreserved characters percent-encoded.
  static func segment(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: unreserved)! }
  private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
}
