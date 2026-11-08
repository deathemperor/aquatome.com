#if DEBUG
// Tests and the simulator only: not in a release build.
import Foundation
import Tanks

/// The owner's dashboard on the stand-in server (`FakeAccounts.owner`): the replies of protocols/owner-dashboard-vectors.json,
/// which the Worker's own code wrote, and the buttons' changes made to them, so a section read again after one shows it
/// (a photo approved or removed, a page hidden or back, a kept fish-ID photo deleted, a reader's comment shown or hidden,
/// the daily report's email or notifications turned off or on), and the app section's switch. Who
/// gets in, as the Worker decides: no session the server takes, 401 `signed_out`; a session of an account that isn't the
/// owner's, 404 `not_found`. The photos' private addresses are 404 to anyone but the owner, and once the photo is gone.
@MainActor
public final class FakeOwner {
  /// The owner's accounts, by their key in FakeAccounts (an Apple sub, or `email:<address>`).
  public var owners: Set<String>
  /// The overview's reply, by its vector's name: "dashboard", "dashboard: nothing needs you" or "dashboard: the readers'
  /// beacon down".
  public var overview = "dashboard"
  /// The reports sent, each as the form it came as.
  public var reports: [Data] = []
  /// The next read of a section ends the owner's sessions first, so it answers 401: a session that ended while the
  /// dashboard was open (signed out elsewhere, or expired).
  public var sessionEndsAtNextSection = false
  /// The next read of a section answers 503 `unavailable`, as the Worker does while its storage doesn't answer.
  public var storageDownAtNextSection = false
  /// The phones the daily report's notifications go to: each token given, with its APNs (`sandbox` or `production`).
  public private(set) var pushTokens: [String: String] = [:]
  private let replies: [[String: JSON]]
  /// Each section as it is read without a query, by its key.
  private var sections: [String: JSON] = [:]
  /// The daily report's delivery, as the vectors' section shows it: email and phone notifications on, to one phone.
  private var report = (email: true, push: true)
  /// Readers' comments by id, as the Comments section and its later pages list them, in the state the owner left them.
  private var comments: [String: [String: JSON]] = [:]
  /// The comments only a later page lists, with the cursor that page is read by, until the owner moves one.
  private var later: [String: String] = [:]
  /// How many comments each state has: the Worker's counts, with the owner's moves.
  private var counts: [String: Int] = [:]
  /// The private addresses of the photos removed.
  private var removed: Set<String> = []

  /// "Đã duyệt" in the Worker's words, on a waiting photo the owner approved.
  static let approved = "Đã duyệt · đăng trong lượt duyệt tới"
  /// A small picture for every photo the server has: two squares in the dashboard's colours.
  static let picture = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAE0lEQVR4nGPQKVvMk+nCAMRAFgAalAP9u388bQAAAABJRU5ErkJggg==")!
  static let sectionsPath = "/api/owner/sections/"

  public init(vectors: JSON, owners: Set<String> = ["ui-apple"]) {
    self.owners = owners
    replies = vectors.object?["replies"]?.array?.compactMap(\.object) ?? []
    for r in replies where r["status"]?.int == 200 && r["request"]?.object?["method"]?.string == "GET" {
      guard let c = (r["request"]?.object?["path"]?.string).flatMap(URLComponents.init(string:)), let body = r["body"] else { continue }
      let key = c.path.hasPrefix(Self.sectionsPath) ? String(c.path.dropFirst(Self.sectionsPath.count)) : nil
      if let key, !key.contains("/"), c.queryItems == nil { sections[key] = body }
      // The comments the Comments section lists in each state, and those only a later page lists, by that page's cursor.
      let cursor = c.path == "/api/owner/comments" ? c.queryItems?.first { $0.name == "cursor" }?.value : nil
      let listed = cursor != nil ? body.object?["items"] : key == "binh-luan" ? Self.commentsBlock(body)?["items"] : nil
      for item in listed?.array?.compactMap(\.object) ?? [] {
        guard let id = item["id"]?.string, comments[id] == nil else { continue }
        comments[id] = item
        later[id] = cursor
      }
    }
    for f in Self.commentsBlock(sections["binh-luan"])?["filters"]?.array?.compactMap(\.object) ?? [] {
      if let state = f["state"]?.string { counts[state] = f["count"]?.int }
    }
  }

  /// The reply to a request on the owner's paths (and to any photo off the site), or nil for another path. `account`:
  /// the bearer's account, nil without a session the server takes.
  func answer(_ r: URLRequest, account: String?, endSessions: (String) -> Void) throws -> (Int, Data, String)? {
    let method = r.httpMethod ?? "GET", path = r.url?.path ?? ""
    let query = r.url.flatMap { URLComponents(url: $0, resolvingAgainstBaseURL: false)?.queryItems } ?? []
    let item = { (name: String) in query.first { $0.name == name }?.value }
    let json = { (status: Int, o: JSON) in (status, try o.data(), "application/json") }
    let error = { (status: Int, code: String) in try json(status, .object(["error": .string(code)])) }
    // A photo's public address (another host): anyone gets it.
    if r.url?.host != AccountsClient.site.host { return method == "GET" ? (200, Self.picture, "image/png") : nil }
    if path.hasPrefix("/_ab/") {
      // One a section shows, or a waiting one the overview lists.
      let shown = account.map(owners.contains) == true && !removed.contains(path) && (photos.contains { $0["src"]?.string == path } || waiting.contains(path))
      return shown ? (200, Self.picture, "image/png") : (404, Data("Not found".utf8), "text/plain")
    }
    // The owner's report (protocols/owner-feedback.openapi.json): kept here, as the site keeps it for the Mac.
    if path == "/api/feedback", method == "POST" {
      guard let account else { return try error(401, "signed_out") }
      guard owners.contains(account) else { return try error(404, "not_found") }
      reports.append(r.httpBody ?? Data())
      return try json(201, .object(["id": .string("20261108014200000-00000000-0000-4000-8000-000000000001"), "waiting": .number(Double(reports.count))]))
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
      // The Worker's own refusal of a request to this path (with this method, else another), else of one like it, else a
      // plain one.
      let refusals = self.replies.filter { $0["status"]?.int == 400 }
      let e = refusals.first { $0["request"]?.object?["path"]?.string == path && $0["request"]?.object?["method"]?.string == method }
        ?? refusals.first { $0["request"]?.object?["path"]?.string == path }
        ?? refusals.first { ($0["request"]?.object?["path"]?.string).map { self.alike($0, path) } == true }
      return try e?["body"].map { try json(400, $0) } ?? error(400, "bad_request")
    }
    let parts = path.split(separator: "/").map(String.init) // api, owner, …
    switch (method, parts.dropFirst(2).first) {
    case ("GET", "dashboard"):
      return try json(200, dashboard)
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
      guard parts.count == 4 || (parts.count == 6 && parts[4] == "tables"), var s = sections[parts[3]]?.object else { return try error(404, "not_found") }
      // A period: one the section offers (its first is as none), else the Worker's refusal of one it doesn't offer, or of
      // any on a section with none.
      let periods = s["periods"]?.array?.compactMap { $0.object?["key"]?.string } ?? []
      var period = item("period")
      if let p = period, !periods.contains(p) {
        let e = worker(400, "GET") { v in
          v.hasPrefix(Self.sectionsPath) && !v.contains("/tables/") && (self.sections[String(v.dropFirst(Self.sectionsPath.count))]?.object?["periods"] == nil) == periods.isEmpty
        }
        return try e.map { try json(400, $0) } ?? error(400, "bad_request")
      }
      if period == s["period"]?.string { period = nil }
      if let period {
        // Another it offers: as the Worker answered it, else the section as it is, for that period.
        s = got(Self.sectionsPath + parts[3], [URLQueryItem(name: "period", value: period)])?.object ?? s.merging(["period": .string(period)]) { $1 }
      }
      if parts.count == 6 {
        // A table's rows: as the Worker answered this request, else its first page as the section has it; no such table,
        // 404; a cursor the stand-in never gave, 400.
        let asked = query.filter { $0.name != "period" } + (period.map { [URLQueryItem(name: "period", value: $0)] } ?? [])
        if let rows = got(path, asked) { return try json(200, rows) }
        guard let t = s["blocks"]?.array?.compactMap(\.object).first(where: { $0["kind"]?.string == "table" && $0["id"]?.string == parts[5] }) else {
          return try json(404, worker(404, "GET") { $0.contains("/tables/") } ?? .object(["error": .string("not_found")]))
        }
        guard item("cursor") == nil else { return try json(400, worker(400, "GET") { $0.contains("/tables/") } ?? .object(["error": .string("bad_request")])) }
        var page: [String: JSON] = ["tz": s["tz"] ?? .string("Asia/Ho_Chi_Minh"), "rows": t["rows"] ?? .array([])]
        page["next"] = t["next"]
        return try json(200, .object(page))
      }
      if parts[3] == "binh-luan" {
        // The comments in the state its filter chose (none: held).
        let state = item("state") ?? "held"
        guard ["held", "shown", "hidden"].contains(state), let c = commentsSection(state) else { return try error(400, "bad_request") }
        return try json(200, c)
      }
      // The switch, flipped: its address the other way.
      let test = r.url?.query == "test=1"
      s["blocks"] = s["blocks"]?.array.map { .array($0.map { b in
        guard var o = b.object, o["kind"]?.string == "switch" else { return b }
        o["on"] = .bool(test)
        o["href"] = .string(path + (test ? "" : "?test=1"))
        return .object(o)
      }) }
      return try json(200, .object(s))
    case ("GET", "comments") where parts.count == 3:
      // A later page: as the Worker answered it, with those of its comments the owner hasn't moved; any other, 400.
      guard let cursor = item("cursor"), var page = got(path, query)?.object else {
        return try json(400, worker(400, "GET") { $0 == "/api/owner/comments" } ?? .object(["error": .string("bad_request")]))
      }
      page["items"] = .array(comments.filter { later[$0.key] == cursor }.sorted(by: Self.newestFirst).map { JSON.object($0.value) })
      return try json(200, .object(page))
    case ("POST", "comments") where parts.count == 4:
      // Shown (a held or hidden one) or hidden (a held or shown one), with the owner's reason and the buttons of its new
      // state; one the Worker no longer has, 404.
      guard let action = body?.object?["action"]?.string, action == "show" || action == "hide" else { return try refused() }
      let id = parts[3]
      guard var c = comments[id] else {
        return try json(404, worker(404, "POST") { $0.hasPrefix("/api/owner/comments/") } ?? .object(["error": .string("not_found")]))
      }
      let from = c["state"]?.string ?? "", to = action == "show" ? "shown" : "hidden"
      guard from != to else { return try json(200, done(false)) }
      let button = { (label: String, action: String, tone: String?) -> JSON in
        var b: [String: JSON] = ["label": .string(label), "method": .string("POST"), "path": .string(path), "body": .object(["action": .string(action)])]
        b["tone"] = tone.map(JSON.string)
        return .object(b)
      }
      c["state"] = .string(to)
      c["reason"] = .string(to == "shown" ? "Shown by the owner" : "Hidden by the owner")
      c["actions"] = .array(to == "shown" ? [button("Hide", "hide", "bad")] : [button("Show again", "show", nil)])
      comments[id] = c
      later[id] = nil
      counts[from] = max((counts[from] ?? 0) - 1, 0)
      counts[to, default: 0] += 1
      return try json(200, done(true))
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
    case ("GET", "report-settings"):
      // The bell's two switches, as they are now.
      return try json(200, .object(["email": .bool(report.email), "push": .bool(report.push)]))
    case ("POST", "report-settings"):
      // The daily report's email or phone notifications, or both, on or off.
      let flag = { (v: JSON?) -> Bool? in if case .bool(let on)? = v { on } else { nil } }
      guard let b = body?.object, !b.isEmpty, b.allSatisfy({ ["email", "push"].contains($0.key) && flag($0.value) != nil }) else { return try refused() }
      let before = report
      report = (flag(b["email"]) ?? report.email, flag(b["push"]) ?? report.push)
      reportShown()
      return try json(200, .object(["ok": .bool(true), "changed": .bool(report != before), "email": .bool(report.email), "push": .bool(report.push)]))
    case ("POST", "push-token"), ("DELETE", "push-token"):
      // As the Worker takes them (protocols/owner-dashboard.openapi.json): lowercase hex of 16 to 100 bytes; POST with the APNs,
      // DELETE the token alone.
      let fields: Set<String> = method == "POST" ? ["token", "environment"] : ["token"]
      guard let b = body?.object, Set(b.keys) == fields, let token = b["token"]?.string, (32...200).contains(token.count), token.count % 2 == 0,
            token.allSatisfy({ "0123456789abcdef".contains($0) }) else { return try refused() }
      if method == "POST" {
        guard let env = b["environment"]?.string, env == "sandbox" || env == "production" else { return try refused() }
        let changed = pushTokens[token] != env
        pushTokens[token] = env
        return try json(200, .object(["ok": .bool(true), "changed": .bool(changed)]))
      }
      return try json(200, .object(["ok": .bool(true), "changed": .bool(pushTokens.removeValue(forKey: token) != nil)]))
    default:
      return try error(404, "not_found")
    }
  }

  /// The overview `overview` names.
  private var dashboard: JSON { replies.first { $0["name"]?.string == overview }?["body"] ?? .null }

  /// The photos the overview says wait, as their private addresses.
  private var waiting: [String] {
    (dashboard.object?["needs"]?.array ?? []).flatMap { $0.object?["photos"]?.array ?? [] }.compactMap { $0.string.map { "/_ab/anh/" + $0 } }
  }

  /// The Comments section with its comments in `state`, newest first: as the Worker answered it in that state (else in
  /// its own), with the comments where the owner left them, each state's count with the owner's moves, and the cursor of
  /// the page that lists the rest.
  private func commentsSection(_ state: String) -> JSON? {
    guard var s = (got(Self.sectionsPath + "binh-luan", [URLQueryItem(name: "state", value: state)]) ?? sections["binh-luan"])?.object else { return nil }
    let mine = comments.filter { $0.value["state"]?.string == state }.sorted(by: Self.newestFirst)
    s["blocks"] = s["blocks"]?.array.map { .array($0.map { b in
      guard var o = b.object, o["kind"]?.string == "comments" else { return b }
      o["state"] = .string(state)
      o["filters"] = o["filters"]?.array.map { .array($0.map { f in
        guard var filter = f.object, let k = filter["state"]?.string else { return f }
        filter["count"] = .number(Double(counts[k] ?? 0))
        return .object(filter)
      }) }
      o["items"] = .array(mine.filter { later[$0.key] == nil }.map { JSON.object($0.value) })
      o["next"] = mine.lazy.compactMap { self.later[$0.key] }.first.map(JSON.string)
      return .object(o)
    }) }
    return .object(s)
  }

  /// Comments by when they were posted, the newest first (by id when at the same time, as the Worker's cursor goes).
  private static func newestFirst(_ a: (key: String, value: [String: JSON]), _ b: (key: String, value: [String: JSON])) -> Bool {
    (a.value["at"]?.string ?? "", a.key) > (b.value["at"]?.string ?? "", b.key)
  }

  /// The comments block of the Comments section.
  private static func commentsBlock(_ s: JSON?) -> [String: JSON]? {
    s?.object?["blocks"]?.array?.compactMap(\.object).first { $0["kind"]?.string == "comments" }
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

  /// The photo `id` in a section, changed by `edit` (nil: removed, and its address with it). Whether it changed.
  private func change(_ key: String, _ id: String, _ edit: ([String: JSON]) -> [String: JSON]?) -> Bool {
    var changed = false
    blocks(key, "photos") { items in
      items.compactMap { v in
        guard let o = v.object, o["id"]?.string == id else { return v }
        let after = edit(o)
        changed = after != o
        if after == nil, let src = o["src"]?.string { removed.insert(src) }
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

  /// The Worker's 200 reply to a GET of `path` with these query items, in any order.
  private func got(_ path: String, _ query: [URLQueryItem]) -> JSON? {
    replies.first { $0["status"]?.int == 200 && $0["request"]?.object?["method"]?.string == "GET" && Self.at($0["request"]?.object?["path"]?.string, path, query) }?["body"]
  }

  /// The body of the Worker's reply with `status` to a request of `method` whose path (its query left out) passes `test`.
  private func worker(_ status: Int, _ method: String, _ test: (String) -> Bool) -> JSON? {
    replies.first { r in
      guard r["status"]?.int == status, let q = r["request"]?.object, q["method"]?.string == method,
            let c = (q["path"]?.string).flatMap(URLComponents.init(string:)) else { return false }
      return test(c.path)
    }?["body"]
  }

  /// The request a vector names: its method, path and query (the same items in any order), and body.
  private func same(_ r: URLRequest, _ v: JSON?, _ body: JSON?) -> Bool {
    guard let v = v?.object, let url = r.url else { return false }
    let query = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
    return v["method"]?.string == (r.httpMethod ?? "GET") && Self.at(v["path"]?.string, url.path, query) && v["body"] == body
  }

  /// A vector's path (with its query) is `path` with these query items, in any order.
  private static func at(_ vector: String?, _ path: String, _ query: [URLQueryItem]) -> Bool {
    guard let c = vector.flatMap(URLComponents.init(string:)) else { return false }
    return c.path == path && Set(c.queryItems ?? []) == Set(query)
  }

  /// Two paths of the same endpoint: the same but for their last part (an id).
  private func alike(_ a: String, _ b: String) -> Bool {
    a == b || (a.split(separator: "/").dropLast() == b.split(separator: "/").dropLast() && a.split(separator: "/").count == b.split(separator: "/").count)
  }
}
#endif
