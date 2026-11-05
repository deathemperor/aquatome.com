#if DEBUG
// Tests and the simulator only: not in a release build.
import Foundation
import Tanks

/// The owner's dashboard on the stand-in server (`FakeAccounts.owner`): the replies of protocols/owner-dashboard-vectors.json,
/// which the Worker's own code wrote, and the buttons' changes made to them, so a section read again after one shows it
/// (a photo approved or removed, a page hidden or back, a kept fish-ID photo deleted, the daily report's email or
/// notifications turned off or on), and the app section's switch. Who
/// gets in, as the Worker decides: no session the server takes, 401 `signed_out`; a session of an account that isn't the
/// owner's, 404 `not_found`. The photos' private addresses are 404 to anyone but the owner, and once the photo is gone.
@MainActor
public final class FakeOwner {
  /// The owner's accounts, by their key in FakeAccounts (an Apple sub, or `email:<address>`).
  public var owners: Set<String>
  /// The next read of a section ends the owner's sessions first, so it answers 401: a session that ended while the
  /// dashboard was open (signed out elsewhere, or expired).
  public var sessionEndsAtNextSection = false
  /// The next read of a section answers 503 `unavailable`, as the Worker does while its storage doesn't answer.
  public var storageDownAtNextSection = false
  /// The phones the daily report's notifications go to: each token given, with its APNs (`sandbox` or `production`).
  public private(set) var pushTokens: [String: String] = [:]
  private let replies: [[String: JSON]]
  private var sections: [String: JSON] = [:]
  /// The daily report's delivery, as the vectors' section shows it: email and phone notifications on, to one phone.
  private var report = (email: true, push: true)

  /// "Đã duyệt" in the Worker's words, on a waiting photo the owner approved.
  static let approved = "Đã duyệt · đăng trong lượt duyệt tới"
  /// A small picture for every photo the server has: two squares in the dashboard's colours.
  static let picture = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGPQKVvMk+nCAMRAFgAalAP9u388bQAAAABJRU5ErkJggg==")!

  public init(vectors: JSON, owners: Set<String> = ["ui-apple"]) {
    self.owners = owners
    replies = vectors.object?["replies"]?.array?.compactMap(\.object) ?? []
    for r in replies {
      guard r["status"]?.int == 200, let req = r["request"]?.object, req["method"]?.string == "GET",
            let path = req["path"]?.string, path.hasPrefix("/api/owner/sections/") else { continue }
      sections[String(path.dropFirst("/api/owner/sections/".count))] = r["body"]
    }
  }

  /// The reply to a request on the owner's paths (and to any photo off the site), or nil for another path. `account`:
  /// the bearer's account, nil without a session the server takes.
  func answer(_ r: URLRequest, account: String?, endSessions: (String) -> Void) throws -> (Int, Data, String)? {
    let method = r.httpMethod ?? "GET", path = r.url?.path ?? ""
    let json = { (status: Int, o: JSON) in (status, try o.data(), "application/json") }
    let error = { (status: Int, code: String) in try json(status, .object(["error": .string(code)])) }
    // A photo's public address (another host): anyone gets it.
    if r.url?.host != AccountsClient.site.host { return method == "GET" ? (200, Self.picture, "image/png") : nil }
    if path.hasPrefix("/_ab/") {
      let shown = account.map(owners.contains) == true && photos.contains { $0["src"]?.string == path }
      return shown ? (200, Self.picture, "image/png") : (404, Data("Not found".utf8), "text/plain")
    }
    guard path.hasPrefix("/api/owner/") else { return nil }
    guard let account else { return try error(401, "signed_out") }
    guard owners.contains(account) else { return try error(404, "not_found") }
    let body = r.httpBody.flatMap { try? JSON.parse($0) }
    // A refusal the Worker gave this very request (not who asks, decided above, nor its storage down: a knob's).
    if let e = replies.first(where: { $0["status"]?.int.map { (400..<500).contains($0) && $0 != 401 && $0 != 404 } == true && same(r, $0["request"], body) }),
       let b = e["body"] {
      return try json(e["status"]!.int!, b)
    }
    let refused = { () throws -> (Int, Data, String) in
      // The Worker's own refusal of a request to this path, else of one like it, else a plain one.
      let refusals = self.replies.filter { $0["status"]?.int == 400 }
      let e = refusals.first { $0["request"]?.object?["path"]?.string == path }
        ?? refusals.first { ($0["request"]?.object?["path"]?.string).map { self.alike($0, path) } == true }
      return try e?["body"].map { try json(400, $0) } ?? error(400, "bad_request")
    }
    let parts = path.split(separator: "/").map(String.init) // api, owner, …
    switch (method, parts.dropFirst(2).first) {
    case ("GET", "dashboard"):
      return try json(200, replies.first { $0["name"]?.string == "dashboard" }?["body"] ?? .null)
    case ("GET", "sections"):
      if sessionEndsAtNextSection {
        sessionEndsAtNextSection = false
        endSessions(account)
        return try error(401, "signed_out")
      }
      if storageDownAtNextSection {
        storageDownAtNextSection = false
        return try json(503, replies.first { $0["status"]?.int == 503 }?["body"] ?? .null)
      }
      guard parts.count == 4, var s = sections[parts[3]]?.object else { return try error(404, "not_found") }
      // The switch, flipped: its address the other way.
      let test = r.url?.query == "test=1"
      s["blocks"] = s["blocks"]?.array.map { .array($0.map { b in
        guard var o = b.object, o["kind"]?.string == "switch" else { return b }
        o["on"] = .bool(test)
        o["href"] = .string(path + (test ? "" : "?test=1"))
        return .object(o)
      }) }
      return try json(200, .object(s))
    case ("POST", "photos") where parts.count == 4:
      let id = parts[3]
      switch body?.object?["action"]?.string {
      case "approve": return try json(200, done(change("anh-ban-doc", id) { item in
        var actions = item["actions"]?.array ?? []
        guard let i = actions.firstIndex(where: { $0.object?["body"]?.object?["action"]?.string == "approve" }) else { return item }
        actions.remove(at: i)
        var o = item
        o["actions"] = .array(actions)
        o["meta"] = .array((item["meta"]?.array ?? []) + [.string(Self.approved)])
        return o
      }))
      case "remove": return try json(200, done(change("anh-ban-doc", id) { _ in nil }))
      default: return try refused()
      }
    case ("DELETE", "fishid-shots") where parts.count == 5:
      return try json(200, done(change("anh-nhan-dien", parts[4]) { _ in nil }))
    case ("POST", "hidden"):
      // A page by its path or its whole address.
      guard let b = body?.object, case .bool(let hide)? = b["hide"], var page = b["path"]?.string.flatMap({ URLComponents(string: $0)?.path }) else { return try refused() }
      if !page.hasSuffix("/") { page += "/" }
      guard page.hasPrefix("/"), !["/", "/id/", "/th/"].contains(page) else { return try refused() }
      hidden(page, hide ? b["note"]?.string.map { String($0.prefix(200)) } ?? "" : nil)
      return try json(200, .object(["ok": .bool(true), "path": .string(page), "hidden": .bool(hide)]))
    case ("POST", "report-settings"):
      // The daily report's email or phone notifications, or both, on or off.
      let flag = { (v: JSON?) -> Bool? in if case .bool(let on)? = v { on } else { nil } }
      guard let b = body?.object, !b.isEmpty, b.allSatisfy({ ["email", "push"].contains($0.key) && flag($0.value) != nil }) else { return try refused() }
      let before = report
      report = (flag(b["email"]) ?? report.email, flag(b["push"]) ?? report.push)
      reportShown()
      return try json(200, .object(["ok": .bool(true), "changed": .bool(report != before), "email": .bool(report.email), "push": .bool(report.push)]))
    case ("POST", "push-token"), ("DELETE", "push-token"):
      guard let b = body?.object, let token = b["token"]?.string, !token.isEmpty, let env = b["environment"]?.string,
            env == "sandbox" || env == "production" else { return try refused() }
      if method == "POST" { pushTokens[token] = env } else { pushTokens[token] = nil }
      return try json(200, .object(["ok": .bool(true)]))
    default:
      return try error(404, "not_found")
    }
  }

  /// The daily report's section ("bao-cao") after a change: its delivery line and its two buttons, in the Worker's
  /// words (daily/page.ts).
  private func reportShown() {
    guard var s = sections["bao-cao"]?.object, let blocks = s["blocks"]?.array else { return }
    let phone = report.push ? "đang bật, gửi đến 1 điện thoại." : "đang tắt."
    let button = { (label: String, key: String, on: Bool) -> JSON in
      .object(["label": .string(label), "method": .string("POST"), "path": .string("/api/owner/report-settings"), "body": .object([key: .bool(on)])])
    }
    s["blocks"] = .array(blocks.map { b in
      guard var o = b.object else { return b }
      if o["kind"]?.string == "note", o["text"]?.string?.hasPrefix("Email:") == true {
        o["text"] = .string("Email: \(report.email ? "đang bật" : "đang tắt"). Thông báo trên điện thoại: \(phone)")
      } else if o["kind"]?.string == "actions", o["actions"]?.array?.first?.object?["path"]?.string == "/api/owner/report-settings" {
        o["actions"] = .array([button(report.email ? "Tắt email" : "Bật email", "email", !report.email),
                               button(report.push ? "Tắt thông báo" : "Bật thông báo", "push", !report.push)])
      }
      return .object(o)
    })
    sections["bao-cao"] = .object(s)
  }

  /// Every photo the sections show.
  private var photos: [[String: JSON]] {
    sections.values.flatMap { s in (s.object?["blocks"]?.array ?? []).filter { $0.object?["kind"]?.string == "photos" }.flatMap { $0.object?["items"]?.array ?? [] } }
      .compactMap(\.object)
  }

  private func done(_ changed: Bool) -> JSON { .object(["ok": .bool(true), "changed": .bool(changed)]) }

  /// The photo `id` in a section, changed by `edit` (nil: removed). Whether it changed.
  private func change(_ key: String, _ id: String, _ edit: ([String: JSON]) -> [String: JSON]?) -> Bool {
    var changed = false
    blocks(key, "photos") { items in
      items.compactMap { v in
        guard let o = v.object, o["id"]?.string == id else { return v }
        let after = edit(o)
        changed = after != o
        return after.map(JSON.object)
      }
    }
    return changed
  }

  /// Hides a page (`note`: why, "" for none), at the top of the list as the newest, or brings it back (nil).
  private func hidden(_ page: String, _ note: String?) {
    blocks("an-trang", "hidden") { items in
      var out = items.filter { $0.object?["path"]?.string != page }
      if let note {
        let back: [String: JSON] = ["label": .string("Hiện lại"), "method": .string("POST"), "path": .string("/api/owner/hidden"),
                                    "body": .object(["path": .string(page), "hide": .bool(false)])]
        var o: [String: JSON] = ["path": .string(page), "since": .string("04/11 16:00"), "actions": .array([.object(back)])]
        if !note.isEmpty { o["note"] = .string(note) }
        out.insert(.object(o), at: 0)
      }
      return out
    }
  }

  /// The items of a section's blocks of one kind, changed.
  private func blocks(_ key: String, _ kind: String, _ edit: ([JSON]) -> [JSON]) {
    guard var s = sections[key]?.object, let blocks = s["blocks"]?.array else { return }
    s["blocks"] = .array(blocks.map { b in
      guard var o = b.object, o["kind"]?.string == kind else { return b }
      o["items"] = .array(edit(o["items"]?.array ?? []))
      return .object(o)
    })
    sections[key] = .object(s)
  }

  /// The request a vector names: its method, path and body.
  private func same(_ r: URLRequest, _ v: JSON?, _ body: JSON?) -> Bool {
    guard let v = v?.object else { return false }
    return v["method"]?.string == (r.httpMethod ?? "GET") && v["path"]?.string == r.url?.path && v["body"] == body
  }

  /// Two paths of the same endpoint: the same but for their last part (an id).
  private func alike(_ a: String, _ b: String) -> Bool {
    a == b || (a.split(separator: "/").dropLast() == b.split(separator: "/").dropLast() && a.split(separator: "/").count == b.split(separator: "/").count)
  }
}
#endif
