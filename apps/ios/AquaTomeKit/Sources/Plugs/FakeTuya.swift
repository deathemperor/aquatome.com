#if DEBUG
// Tests and the simulator only: not in a release build.
import Foundation
import Tanks

/// Tuya's cloud, in process, as its docs describe it (the parked server route's tests have the same stand-in): a
/// project with these keys, and the devices of the Smart Life account linked to it. A request whose signature doesn't
/// check out is refused, as Tuya refuses it.
@MainActor
public final class FakeTuya {
  public struct Device: Sendable {
    public var id: String
    public var name: String
    public var online = true
    /// Its data points, as Tuya lists them (`switch_1`, `switch_led`, `countdown_1`…).
    public var status: [(code: String, value: JSON)]
    /// The names the reader gave its outlets in Smart Life; nil when they can't be read.
    public var names: [(code: String, name: String)]?
    /// Takes commands and keeps its state: a plug that doesn't switch.
    public var ignores = false
    /// Reports a new state only after this many reads of its status.
    public var lags = 0
    /// Its status can't be read back after a command.
    public var unreadable = false
    /// Tuya refuses its commands with this code (2008: command or value not supported).
    public var refuses: Int?
    /// Listed online, then offline by the time a command reaches it.
    public var dropsOff = false

    public init(id: String, name: String, online: Bool = true, status: [(code: String, value: JSON)], names: [(code: String, name: String)]? = nil) {
      self.id = id
      self.name = name
      self.online = online
      self.status = status
      self.names = names
    }
  }

  public let accessId: String
  public let accessSecret: String
  public var devices: [Device]
  /// Devices on a page of the list.
  public var pageSize = 20
  /// The list carries each device's status (it does: a device without one is asked for it).
  public var listsStatus = true
  /// Every request is answered with this Tuya error code (28841002: the project's plan has expired).
  public var failing: Int?
  /// Answers that aren't Tuya's (a gateway's error page).
  public var down = false
  /// No network: every request fails as URLSession does.
  public var offline = false
  /// Commands are carried out, and their answers lost on the way back (a timeout).
  public var losesAnswers = false
  /// A token's life, in seconds.
  public var expireTime = 7200
  /// Every request received, in order, its query and body read.
  public private(set) var log: [(method: String, path: String, body: JSON?)] = []

  private var live: Set<String> = []
  private var issued = 0
  private var pending: [String: (index: Int, value: JSON, reads: Int)] = [:]

  public init(accessId: String, accessSecret: String, devices: [Device]) {
    self.accessId = accessId
    self.accessSecret = accessSecret
    self.devices = devices
  }

  /// Ends every token, as Tuya does when one is revoked.
  public func revoke() { live = [] }
  public var commands: [JSON] { log.filter { $0.method == "POST" }.compactMap(\.body) }
  public func device(_ id: String) -> Device? { devices.first { $0.id == id } }

  public func send(_ r: URLRequest) async throws -> (Data, HTTPURLResponse) {
    if offline { throw URLError(.notConnectedToInternet) }
    let method = r.httpMethod ?? "GET", url = r.url!
    let path = url.path(percentEncoded: true), query = url.query(percentEncoded: false)
    func reply(_ o: [String: JSON], status: Int = 200) throws -> (Data, HTTPURLResponse) {
      (try JSON.object(o).data(), HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!)
    }
    let ok = { (result: JSON) in try reply(["success": .bool(true), "result": result, "t": .number(0)]) }
    let no = { (code: Int) in try reply(["success": .bool(false), "code": .number(Double(code)), "msg": .string("no")]) }
    if down { return (Data("<html>Bad gateway</html>".utf8), HTTPURLResponse(url: url, statusCode: 502, httpVersion: nil, headerFields: nil)!) }

    let h = { (k: String) in r.value(forHTTPHeaderField: k) ?? "" }
    let body = r.httpBody.map { String(decoding: $0, as: UTF8.self) } ?? ""
    guard h("client_id") == accessId else { return try no(1005) }
    let token = r.value(forHTTPHeaderField: "access_token")
    let expected = tuyaSign(id: accessId, secret: accessSecret, t: h("t"), nonce: h("nonce"), token: token, method: method,
                            path: path + (query.map { "?" + $0 } ?? ""), body: body)
    guard h("sign") == expected, h("sign_method") == "HMAC-SHA256" else { return try no(1004) }
    log.append((method, path + (query.map { "?" + $0 } ?? ""), body.isEmpty ? nil : try? JSON.parse(Data(body.utf8))))
    if let failing { return try no(failing) }

    if path == "/v1.0/token" && query == "grant_type=1" {
      issued += 1
      let t = "fake-token-\(issued)"
      live.insert(t)
      return try ok(.object(["access_token": .string(t), "expire_time": .number(Double(expireTime)), "refresh_token": .string("r"), "uid": .string("fake-project")]))
    }
    guard let token, live.contains(token) else { return try no(1010) }

    if path == "/v1.0/iot-01/associated-users/devices" {
      let from = query.flatMap { q in q.hasPrefix("last_row_key=row-") ? Int(q.dropFirst("last_row_key=row-".count)) : nil } ?? 0
      let page = Array(devices.dropFirst(from).prefix(pageSize))
      let more = from + page.count < devices.count
      return try ok(.object([
        "devices": .array(page.map { d in
          var o: [String: JSON] = ["id": .string(d.id), "name": .string(d.name), "online": .bool(d.online), "category": .string("pc"), "local_key": .string("fake-local-key")]
          if listsStatus { o["status"] = Self.json(d.status) }
          return .object(o)
        }),
        "has_more": .bool(more), "last_row_key": .string(more ? "row-\(from + page.count)" : ""), "total": .number(Double(devices.count)),
      ]))
    }
    let parts = path.split(separator: "/").map { String($0).removingPercentEncoding ?? String($0) }
    if parts.count == 4, parts[0] == "v1.0", parts[1] == "devices", parts[3] == "multiple-names" {
      guard let names = device(parts[2])?.names else { return try no(2009) }
      return try ok(.array(names.map { .object(["identifier": .string($0.code), "name": .string($0.name)]) }))
    }
    guard parts.count == 5, parts[0] == "v1.0", parts[1] == "iot-03", parts[2] == "devices", let i = devices.firstIndex(where: { $0.id == parts[3] }) else {
      return try no(1108)
    }
    if parts[4] == "status" && method == "GET" {
      if devices[i].unreadable { return try no(1106) }
      if let p = pending[devices[i].id] {
        if p.reads <= 1 { devices[i].status[p.index].value = p.value; pending[devices[i].id] = nil } else { pending[devices[i].id]!.reads -= 1 }
      }
      return try ok(Self.json(devices[i].status))
    }
    if parts[4] == "commands" && method == "POST" {
      if devices[i].dropsOff { devices[i].online = false }
      guard devices[i].online else { return try no(2001) }
      if let code = devices[i].refuses { return try no(code) }
      let commands = (try? JSON.parse(Data(body.utf8)))?.object?["commands"]?.array ?? []
      for c in commands {
        guard let code = c.object?["code"]?.string, let value = c.object?["value"], let j = devices[i].status.firstIndex(where: { $0.code == code }) else { continue }
        if devices[i].ignores { continue }
        if devices[i].lags > 0 { pending[devices[i].id] = (j, value, devices[i].lags) } else { devices[i].status[j].value = value }
      }
      if losesAnswers { throw URLError(.timedOut) }
      return try ok(.bool(true))
    }
    return try no(1108)
  }

  private static func json(_ status: [(code: String, value: JSON)]) -> JSON {
    .array(status.map { .object(["code": .string($0.code), "value": $0.value]) })
  }
}
#endif
