import Foundation
import Testing
@testable import AccountSync
import Tanks

// protocols/owner-dashboard-vectors.json: the owner's dashboard as the Worker's own code answers it
// (apps/site/worker/test/owner-api.test.ts writes them), each reply with the request the app sends for it.
let ownerVectors: JSON = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSON.parse(Data(contentsOf: url.appendingPathComponent("protocols/owner-dashboard-vectors.json")))
}()
let ownerReplies = ownerVectors.object!["replies"]!.array!.map { $0.object! }
let sectionPrefix = "/api/owner/sections/"

func path(_ v: Object) -> String { v["request"]!.object!["path"]!.string! }
/// A reply as the client reads it, from JSONSerialization.
func dict(_ j: JSON) -> [String: Any] { try! JSONSerialization.jsonObject(with: j.data()) as! [String: Any] }
func dict(_ s: String) -> [String: Any] { try! JSONSerialization.jsonObject(with: Data(s.utf8)) as! [String: Any] }
/// The types keep no Equatable (app size): compared as they print, every field and value.
func same<T>(_ a: T, _ b: T) -> Bool { String(reflecting: a) == String(reflecting: b) }
/// What a call threw, by name ("signedOut", "refused(…)"); nil when it didn't.
func failure(isolation: isolated (any Actor)? = #isolation, _ call: () async throws -> Void) async -> String? {
  do { try await call(); return nil } catch { return "\(error)" }
}
func text(_ j: JSON) -> String { String(decoding: try! j.data(), as: UTF8.self) }
func owner(_ stub: Stub, base: URL = AccountsClient.site) -> OwnerClient {
  OwnerClient(base: base, send: { try await stub.send($0) }, token: "t0k", timeZone: "Asia/Ho_Chi_Minh")
}

/// The request a vector names, sent through the client the way the app sends it.
func send(_ api: OwnerClient, _ v: Object) async throws {
  let req = v["request"]!.object!, method = req["method"]!.string!, p = req["path"]!.string!
  switch method {
  case "GET" where p == "/api/owner/dashboard": _ = try await api.dashboard()
  case "GET" where p.hasPrefix(sectionPrefix): _ = try await api.section(String(p.dropFirst(sectionPrefix.count)))
  default: try await api.run(Owner.Action(label: "x", method: method, path: p, body: req["body"].map(dict)))
  }
}

@Test("Every vector: the app sends its request as the vector has it (bearer, Time-Zone, the button's method, path and body), and reads its reply as the contract says")
func everyVector() async throws {
  #expect(ownerReplies.count >= 20)
  for v in ownerReplies {
    let name = Comment(rawValue: v["name"]!.string!)
    let req = v["request"]!.object!, status = v["status"]!.int!, body = v["body"]!
    let stub = Stub([(status, text(body))])
    var error: Error?
    do { try await send(owner(stub), v) } catch let e { error = e }
    let thrown = error.map { "\($0)" }

    let sent = try #require(await stub.requests.first, name)
    #expect(sent.httpMethod == req["method"]!.string, name)
    #expect(sent.url?.absoluteString == "https://aquatome.com" + path(v), name)
    #expect(sent.value(forHTTPHeaderField: "Authorization") == "Bearer t0k", name)
    #expect(sent.value(forHTTPHeaderField: "Time-Zone") == "Asia/Ho_Chi_Minh", name)
    for (k, h) in req["headers"]?.object ?? [:] { #expect(sent.value(forHTTPHeaderField: k) == h.string, name) }
    #expect(sent.httpBody.flatMap { try? JSON.parse($0) } == req["body"], name)
    #expect(sent.value(forHTTPHeaderField: "Content-Type") == (req["body"] == nil ? nil : "application/json"), name)
    #expect(sent.value(forHTTPHeaderField: "Cookie") == nil && !sent.httpShouldHandleCookies, name)

    let o = body.object ?? [:]
    switch status {
    case 200: #expect(thrown == nil, name)
    case 401: #expect(thrown == "signedOut", name)
    case 404: #expect(thrown == "notFound", name)
    default: #expect(thrown == "\(OwnerError.refused(o["error"]!.string!, message: o["message"]?.string))", name)
    }
    // Only the server's storage not answering is worth trying again soon.
    #expect((error as? OwnerError)?.passes == (status == 200 ? nil : status == 503), name)
  }
}

/// What a block holds, counted: the same from the app's reading and from the reply, or something was dropped.
func counts(_ b: Owner.Block) -> [String: Int] {
  switch b {
  case .heading(_, let level, let anchor): ["heading": level, "anchors": anchor == nil ? 0 : 1]
  case .figures(let f): ["figures": f.count, "meters": f.filter { $0.meter != nil }.count, "deltas": f.filter { $0.delta != nil }.count, "subs": f.filter { $0.sub != nil }.count]
  case .chart(let c): ["chart": c.series.count, "days": c.days.count, "whole": c.whole == nil ? 0 : 1, "values": c.series.map(\.values.count).reduce(0, +)]
  case .table(let t): ["table": t.rows.count, "columns": t.columns.count, "cells": t.rows.joined().count, "links": t.rows.joined().filter { $0.to != nil }.count,
                       "subs": t.rows.joined().filter { $0.text != nil }.count]
  case .note: ["note": 1]
  case .cards(let items, _, let hidden): [hidden ? "hidden" : "photos": items.count, "actions": items.map(\.actions.count).reduce(0, +)]
  case .link: ["link": 1]
  case .form(let f): ["form": f.fields.count, "required": f.fields.filter(\.required).count, "body": f.body == nil ? 0 : 1]
  case .toggle(_, let on, _): ["switch": on ? 1 : 0]
  }
}

func counts(_ raw: JSON) -> [String: Int] {
  let o = raw.object!, kind = o["kind"]!.string!, list = { (k: String) in o[k]?.array?.compactMap(\.object) ?? [] }
  switch kind {
  case "heading": return ["heading": o["level"]!.int!, "anchors": o["anchor"] == nil ? 0 : 1]
  case "figures": let f = list("items"); return ["figures": f.count, "meters": f.filter { $0["meter"] != nil }.count, "deltas": f.filter { $0["delta"] != nil }.count, "subs": f.filter { $0["sub"] != nil }.count]
  case "chart": let s = list("series"); return ["chart": s.count, "days": o["days"]!.array!.count, "whole": o["whole"] == nil ? 0 : 1, "values": s.map { $0["values"]!.array!.count }.reduce(0, +)]
  case "table":
    let cells = o["rows"]!.array!.flatMap { $0.array! }.map { $0.object! }
    return ["table": o["rows"]!.array!.count, "columns": o["columns"]!.array!.count, "cells": cells.count, "links": cells.filter { $0["href"] != nil }.count,
            "subs": cells.filter { $0["sub"] != nil }.count]
  case "note": return ["note": 1]
  case "form": let f = list("fields"); return ["form": f.count, "required": f.filter { $0["required"] == .bool(true) }.count, "body": o["body"] == nil ? 0 : 1]
  case "switch": return ["switch": o["on"] == .bool(true) ? 1 : 0]
  default: let items = list("items"); return [kind: items.count, "actions": items.map { $0["actions"]!.array!.count }.reduce(0, +)]
  }
}

@Test("Every block of every section, and every part of the overview, is read into a kind the app draws: nothing dropped")
func nothingDropped() throws {
  var keys: [String] = []
  var anchors: [String: Set<String>] = [:]
  var headings: [String: Set<String>] = [:]
  for v in ownerReplies where v["status"]?.int == 200 && v["request"]!.object!["method"]!.string == "GET" {
    let name = Comment(rawValue: v["name"]!.string!), body = v["body"]!, o = body.object!
    if path(v) == "/api/owner/dashboard" {
      let d = Owner.Dashboard(dict(body))
      #expect(d.tz == "Asia/Ho_Chi_Minh")
      #expect(d.todos.count == o["todos"]!.array!.count && d.todos.allSatisfy { $0.to != nil && $0.label?.isEmpty == false })
      let areas = o["areas"]!.array!.map { $0.object! }
      #expect(d.areas.count == areas.count && d.areas.allSatisfy { $0.to != nil })
      #expect(d.areas.map(\.spark.count) == areas.map { $0["spark"]!.array!.count })
      #expect(d.areas.map { $0.spark.filter { $0 == nil }.count } == areas.map { $0["spark"]!.array!.filter { $0 == .null }.count })
      #expect(d.areas.filter { $0.delta != nil }.count == areas.filter { $0["chip"] != nil }.count)
      #expect(d.areas.filter(\.warn).count == areas.filter { $0["warn"] == .bool(true) }.count)
      #expect(d.sections.count == o["sections"]!.array!.count)
      #expect(d.areasNote == o["areasNote"]?.string && d.areasNote != nil)
      // The log by day, newest first, each day's lines in order; every line read, its second line and where it goes too.
      let entries = o["log"]!.object!["entries"]!.array!.map { $0.object! }
      let log = try #require(d.log)
      #expect(log.title == "Mấy ngày qua")
      #expect(log.days.map(\.at) == entries.map { $0["at"]!.string! }.reduce(into: []) { if $0.last != $1 { $0.append($1) } })
      let lines = log.days.flatMap(\.entries)
      #expect(lines.map(\.title) == entries.map { $0["text"]!.string! })
      #expect(lines.map(\.text) == entries.map { $0["sub"]?.string })
      #expect(lines.map { $0.to != nil } == entries.map { $0["section"] != nil || $0["url"] != nil })
      // Where each to-do and area opens its section.
      for to in d.todos.map(\.to) + d.areas.map(\.to) { if case .section(let k, let a?)? = to { anchors[k, default: []].insert(a) } }
      let raw = (o["todos"]!.array! + o["areas"]!.array!).map { $0.object!["action"]?.object ?? $0.object! }
      #expect(Set(anchors.flatMap { k, a in a.map { k + "#" + $0 } }) == Set(raw.compactMap { r in r["anchor"].map { r["section"]!.string! + "#" + $0.string! } }))
      #expect(anchors["nhan-dien-ca"] == ["key"])
      keys = d.sections.compactMap { if case .section(let k, _)? = $0.to { k } else { nil } }
      #expect(d.name(of: "an-trang") == "Ẩn trang")
    } else {
      let s = Owner.Section(dict(body)), raw = o["blocks"]!.array!
      #expect(!s.title.isEmpty, name)
      #expect(s.blocks.map(counts) == raw.map(counts), name)
      headings[String(path(v).dropFirst(sectionPrefix.count))] = Set(s.blocks.compactMap { if case .heading(_, _, let a?) = $0 { a } else { nil } })
    }
  }
  // Every anchor names a heading of its section.
  #expect(!anchors.isEmpty)
  for (k, a) in anchors { #expect(a.isSubset(of: headings[k] ?? []), "\(k): \(a)") }
  // Each section the overview lists has its vector.
  #expect(Set(keys) == Set(ownerReplies.map(path).filter { $0.hasPrefix(sectionPrefix) }.map { String($0.dropFirst(sectionPrefix.count)) }))
  #expect(keys.count == 10)
}

/// The reply with something added everywhere this app doesn't know: a field in every object (but a button's body, which
/// is sent as it is), and blocks of new kinds.
func withLater(_ v: JSON) -> JSON {
  switch v {
  case .object(var o):
    for (k, x) in o where k != "body" { o[k] = withLater(x) }
    if var blocks = o["blocks"]?.array {
      blocks.insert(.object(["kind": .string("map"), "title": .string("Bản đồ")]), at: 0)
      blocks.append(.object(["kind": .string("timeline"), "items": .array([])]))
      // A kind the app knows, missing what it needs: skipped too.
      blocks.append(.object(["kind": .string("note"), "tone": .string("bad")]))
      o["blocks"] = .array(blocks)
    }
    o["addedLater"] = .object(["x": .number(1)])
    return .object(o)
  case .array(let a): return .array(a.map(withLater))
  default: return v
  }
}

@Test("A block of a kind the app doesn't know is skipped, and so is a field it doesn't know: never an error")
func unknownIsSkipped() throws {
  for v in ownerReplies where v["status"]?.int == 200 && v["request"]!.object!["method"]!.string == "GET" {
    let name = Comment(rawValue: v["name"]!.string!), body = v["body"]!
    if path(v).hasPrefix(sectionPrefix) {
      #expect(same(Owner.Section(dict(withLater(body))), Owner.Section(dict(body))), name)
    } else {
      #expect(same(Owner.Dashboard(dict(withLater(body))), Owner.Dashboard(dict(body))), name)
    }
  }
  // An unknown tone is plain.
  let s = Owner.Section(dict(#"{"title":"T","blocks":[{"kind":"note","text":"n","tone":"glowing"}]}"#))
  #expect(same(s.blocks, [Owner.Block.note("n", .plain)]))
}

@Test("The overview's \"Mấy ngày qua\": the lines by day as written, each with its second line, tone, and the section or address it opens")
func theLog() throws {
  let d = Owner.Dashboard(dict(#"""
  {"tz":"Asia/Ho_Chi_Minh","todos":[],"areas":[],"sections":[],"log":{"title":"Mấy ngày qua","entries":[
    {"at":"Hôm nay · 04/11 · chưa hết ngày","text":"2 ảnh bạn đọc chờ duyệt","tone":"bad","section":"anh-ban-doc"},
    {"at":"Hôm nay · 04/11 · chưa hết ngày","text":"Engine chạy xong","sub":"15 bài mới","url":"https://example.com/engine/runs"},
    {"at":"Hôm qua · 03/11","text":"Không có gì mới","tone":"muted"},
    {"at":"Thứ Hai · 02/11","text":"Một địa chỉ không an toàn","url":"http://example.com/"},
    {"text":"không có ngày"}
  ]}}
  """#))
  let log = try #require(d.log)
  #expect(log.title == "Mấy ngày qua")
  #expect(log.days.map(\.at) == ["Hôm nay · 04/11 · chưa hết ngày", "Hôm qua · 03/11", "Thứ Hai · 02/11"])
  #expect(same(log.days.flatMap(\.entries), [
    Owner.Link(title: "2 ảnh bạn đọc chờ duyệt", tone: .bad, to: .section("anh-ban-doc", anchor: nil)),
    Owner.Link(title: "Engine chạy xong", text: "15 bài mới", to: .url(URL(string: "https://example.com/engine/runs")!)),
    Owner.Link(title: "Không có gì mới", tone: .muted),
    Owner.Link(title: "Một địa chỉ không an toàn"),
  ]))
  // No log: none.
  #expect(Owner.Dashboard(dict(#"{"tz":"UTC","todos":[],"areas":[],"sections":[]}"#)).log == nil)
}

@Test("401 is a session the server no longer takes (sign in again), 404 not the owner, 503 storage down for now (try again): each told apart, from every path")
func signedOutIsNotNotOwner() async throws {
  let action = Owner.Action(label: "Duyệt", method: "POST", path: "/api/owner/photos/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", body: ["action": "approve"])
  let down = "Không làm được lúc này: máy chủ không đọc hay ghi được. Thử lại sau."
  for (status, body, expected, passes) in [(401, #"{"error":"signed_out"}"#, "signedOut", false), (404, #"{"error":"not_found"}"#, "notFound", false),
                                           (503, #"{"error":"unavailable","message":"\#(down)"}"#, "\(OwnerError.refused("unavailable", message: down))", true)] {
    for call in 0..<4 {
      let stub = Stub([(status, body)])
      let api = owner(stub)
      var error: Error?
      do {
        switch call {
        case 0: _ = try await api.dashboard()
        case 1: _ = try await api.section("doc-gia")
        case 2: _ = try await api.section(at: "/api/owner/sections/ung-dung?test=1")
        default: try await api.run(action)
        }
      } catch let e { error = e }
      #expect(error.map { "\($0)" } == expected)
      #expect((error as? OwnerError)?.passes == passes)
    }
    // A private photo's address answers 404 to anyone else (signed out too): only "not available", never an error.
    let stub = Stub([(status, "Not found")])
    #expect(await owner(stub).image("/_ab/anh/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d") == nil)
  }
  // Offline is none of them, and worth trying again.
  let stub = Stub([])
  await stub.failing(URLError(.notConnectedToInternet))
  #expect(await failure { _ = try await owner(stub).dashboard() } == "offline")
  #expect(OwnerError.offline.passes)
}

@Test("A form sends its fields (trimmed, an empty optional one left out) with its body as one object, and not while a field it needs is empty")
func forms() throws {
  let v = ownerReplies.first { $0["name"]?.string == "section an-trang" }!
  let form = try #require(Owner.Section(dict(v["body"]!)).blocks.compactMap { if case .form(let f) = $0 { f } else { nil } }.first)
  #expect(form.fields.map(\.name) == ["path", "note"] && form.fields.map(\.required) == [true, false] && form.submit == "Ẩn")
  #expect(form.action([:]) == nil && form.action(["path": "  ", "note": "sai loài"]) == nil)
  let a = try #require(form.action(["path": " /ca/ca-y/ ", "note": "sai loài"]))
  #expect(a.method == "POST" && a.path == "/api/owner/hidden" && a.label == "Ẩn" && !a.asks)
  #expect(a.body == #"{"hide":true,"note":"sai loài","path":"/ca/ca-y/"}"#)
  #expect(form.action(["path": "https://aquatome.com/ca/ca-y/", "note": " "])?.body == #"{"hide":true,"path":"https://aquatome.com/ca/ca-y/"}"#)
  let multiline = Owner.Section(dict(#"{"title":"T","blocks":[{"kind":"form","method":"POST","path":"/api/owner/x","submit":"Gửi","fields":[{"name":"n","label":"L","kind":"textarea"}]}]}"#))
  guard case .form(let f)? = multiline.blocks.first else { Issue.record("no form"); return }
  #expect(f.fields[0].multiline && f.body == nil && f.action([:])?.body == "{}")
}

@Test("A photo from \"/\" is fetched from the site with the bearer; a whole address without it; any other host never gets it")
func images() async throws {
  let stub = Stub([(200, "jpeg"), (200, "webp")])
  let api = owner(stub)
  #expect(await api.image("/_ab/anh-nhan-dien/anh/anon/9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b") == Data("jpeg".utf8))
  #expect(await api.image("https://media.aquatome.com/p/c3d4-thumb.webp") == Data("webp".utf8))
  // Protocol-relative ("//host/…") and plain http are refused without a request.
  #expect(await api.image("//evil.example/_ab/anh/x") == nil)
  #expect(await api.image("http://media.aquatome.com/p/x.webp") == nil)
  let sent = await stub.requests
  #expect(sent.map(\.url?.absoluteString) == ["https://aquatome.com/_ab/anh-nhan-dien/anh/anon/9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b", "https://media.aquatome.com/p/c3d4-thumb.webp"])
  #expect(sent.map { $0.value(forHTTPHeaderField: "Authorization") } == ["Bearer t0k", nil])
  #expect(sent.allSatisfy { !$0.httpShouldHandleCookies })
  // The `Send` the app gives it keeps nothing: no cache, no cookies.
  #expect(api.page("/ca/ca-neon-vua/")?.absoluteString == "https://aquatome.com/ca/ca-neon-vua/")
  #expect(api.page("//evil.example/") == nil)
}

@Test("A button that isn't a request to the owner's paths is left out, and a link that leaves the site isn't one")
func onlyOwnerRequests() async throws {
  let photo = { (path: String, method: String) in
    #"{"kind":"photos","items":[{"id":"p","src":"/_ab/anh/p","caption":"c","meta":[],"actions":[{"label":"Gỡ","method":"\#(method)","path":"\#(path)","body":{"action":"remove"},"tone":"bad"}]}]}"#
  }
  let blocks = [photo("/api/owner/photos/p", "POST"), photo("/api/v1/account", "DELETE"), photo("/api/owner/../v1/account", "DELETE"),
                photo("//evil.example/api/owner/x", "POST"), photo("/api/owner/photos/p", "GET"),
                #"{"kind":"table","columns":["Trang"],"rows":[[{"text":"a","href":"/ca/a/"}],[{"text":"b","href":"//evil.example/"}],[{"text":"c","href":"https://evil.example/"}]]}"#]
  let s = Owner.Section(dict(#"{"title":"T","blocks":[\#(blocks.joined(separator: ","))]}"#))
  let actions = s.blocks.compactMap { b -> [Owner.Action]? in if case .cards(let items, _, _) = b { items[0].actions } else { nil } }
  #expect(actions.map(\.count) == [1, 0, 0, 0, 0])
  let a = try #require(actions[0].first)
  #expect(a.label == "Gỡ" && a.method == "POST" && a.path == "/api/owner/photos/p" && a.body == #"{"action":"remove"}"# && a.tone == .bad && a.asks)
  guard case .table(let t)? = s.blocks.last else { Issue.record("no table"); return }
  #expect(t.rows.map { if case .page(let p)? = $0[0].to { p } else { nil } } == ["/ca/a/", nil, nil])
  // A section key the dashboard couldn't have listed is never sent.
  #expect(Owner.Dashboard(dict(#"{"sections":[{"key":"../v1","name":"x"},{"key":"doc-gia","name":"Người đọc"}]}"#)).sections.map(\.title) == ["Người đọc"])
  // A form or a switch sending the session anywhere else is left out too.
  let field = #"[{"name":"path","label":"P","kind":"text"}]"#
  let forms = [
    #"{"kind":"form","method":"POST","path":"/api/owner/hidden","submit":"Ẩn","fields":"# + field + "}",
    #"{"kind":"form","method":"POST","path":"/api/v1/account","submit":"Ẩn","fields":"# + field + "}",
    #"{"kind":"form","method":"GET","path":"/api/owner/hidden","submit":"Ẩn","fields":"# + field + "}",
    #"{"kind":"form","method":"POST","path":"/api/owner/hidden","submit":"Ẩn","fields":[]}"#,
    #"{"kind":"switch","label":"S","on":false,"href":"/api/owner/sections/ung-dung?test=1"}"#,
    #"{"kind":"switch","label":"S","on":false,"href":"/api/owner/../v1/account"}"#,
    #"{"kind":"switch","label":"S","on":false,"href":"https://evil.example/api/owner/sections/x"}"#,
    #"{"kind":"switch","label":"S","on":false,"href":"/api/owner/hidden"}"#,
  ]
  let others = Owner.Section(dict(#"{"title":"T","blocks":["# + forms.joined(separator: ",") + "]}"))
  #expect(others.blocks.map(counts) == [["form": 1, "required": 0, "body": 0], ["switch": 0]])
  #expect(await failure { _ = try await owner(Stub([])).section(at: "/api/owner/sections/../../v1/account") } == "notFound")
}

@Test("A chart's numbers as the site writes them: vi-VN grouping; dollars to the cent, four places below one")
func numbers() {
  #expect(Owner.number(1234, unit: nil) == "1.234")
  #expect(Owner.number(12.5, unit: nil) == "13")
  #expect(Owner.number(-4, unit: nil) == "-4")
  #expect(Owner.number(0.11, unit: "usd") == "$0,11")
  #expect(Owner.number(0.0042, unit: "usd") == "$0,0042")
  #expect(Owner.number(0, unit: "usd") == "$0,00")
  #expect(Owner.number(1234.5, unit: "usd") == "$1.234,50")
  #expect(Owner.dayLabel("2026-11-02") == "02/11")
}

// MARK: The stand-in server

@MainActor func ownerServer() -> (FakeAccounts, OwnerFakeAPI) {
  let fake = FakeAccounts()
  fake.owner = FakeOwner(vectors: ownerVectors)
  return (fake, OwnerFakeAPI(fake: fake))
}

/// The client on the stand-in, as an account signed in with Apple.
@MainActor struct OwnerFakeAPI {
  let fake: FakeAccounts
  func signedIn(_ sub: String) async throws -> OwnerClient {
    let s = try await signIn(client(fake), sub)
    return OwnerClient(send: { try await fake.send($0) }, token: s.token, timeZone: "Asia/Ho_Chi_Minh")
  }
}

func photos(_ s: Owner.Section) -> [Owner.Card] {
  s.blocks.flatMap { b -> [Owner.Card] in if case .cards(let items, _, false) = b { items } else { [] } }
}
func hiddenPages(_ s: Owner.Section) -> [String] {
  s.blocks.flatMap { b -> [String] in if case .cards(let items, _, true) = b { items.map(\.title) } else { [] } }
}

@MainActor @Test("The stand-in answers the owner the vectors, another account 404, and no session 401; private photos only to the owner")
func standInWhoGetsIn() async throws {
  let (fake, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple"), theirs = try await api.signedIn("someone-else")
  let dashboard = ownerReplies.first { $0["name"]?.string == "dashboard" }!["body"]!
  #expect(same(try await mine.dashboard(), Owner.Dashboard(dict(dashboard))))
  #expect(await failure { _ = try await theirs.dashboard() } == "notFound")
  let gone = OwnerClient(send: { try await fake.send($0) }, token: "never-issued")
  #expect(await failure { _ = try await gone.dashboard() } == "signedOut")
  #expect(await failure { _ = try await mine.section("no-such-section") } == "notFound")

  let src = try #require(photos(try await mine.section("anh-ban-doc")).first?.src ?? nil)
  #expect(await mine.image(src) != nil)
  #expect(await theirs.image(src) == nil)
  #expect(await gone.image(src) == nil)
  #expect(await theirs.image("https://media.aquatome.com/p/c3d4-thumb.webp") != nil)
  // Each private photo went with the owner's bearer, the public one without.
  let images = fake.requests.filter { $0.url?.path.hasPrefix("/_ab/") == true || $0.url?.host != "aquatome.com" }
  #expect(images.map { $0.value(forHTTPHeaderField: "Authorization") != nil } == [true, true, true, false])
}

@MainActor @Test("The stand-in's buttons change what a section read again shows: a photo approved, then removed; a page hidden, then back")
func standInButtons() async throws {
  let (_, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  var waiting = photos(try await mine.section("anh-ban-doc"))
  let first = waiting[0]
  #expect(first.actions.map(\.label) == ["Duyệt", "Gỡ"])

  try await mine.run(first.actions[0])
  waiting = photos(try await mine.section("anh-ban-doc"))
  #expect(waiting[0].actions.map(\.label) == ["Gỡ"])
  #expect(waiting[0].lines.last == "Đã duyệt · đăng trong lượt duyệt tới")
  try await mine.run(waiting[0].actions[0])
  #expect(!photos(try await mine.section("anh-ban-doc")).contains { $0.src == first.src })
  #expect(await mine.image(first.src!) == nil)

  let shot = photos(try await mine.section("anh-nhan-dien"))[1]
  try await mine.run(shot.actions[0])
  #expect(photos(try await mine.section("anh-nhan-dien")).map(\.src) == ["/_ab/anh-nhan-dien/anh/reader-1/0b4c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21"])

  // Hidden by the section's form, at the top as the newest, then back by its "Hiện lại"; by a whole address too.
  let section = try await mine.section("an-trang")
  let before = hiddenPages(section)
  let form = try #require(section.blocks.compactMap { if case .form(let f) = $0 { f } else { nil } }.first)
  try await mine.run(try #require(form.action(["path": "/ca/ca-y/", "note": "sai loài"])))
  let after = try await mine.section("an-trang")
  #expect(hiddenPages(after) == ["/ca/ca-y/"] + before)
  guard case .cards(let h, _, true)? = after.blocks.last else { Issue.record("no hidden block"); return }
  #expect(h[0].lines == ["sai loài", "04/11 16:00"])
  try await mine.run(h[0].actions[0])
  #expect(hiddenPages(try await mine.section("an-trang")) == before)
  try await mine.run(try #require(form.action(["path": "https://aquatome.com/ca/ca-z/"])))
  #expect(hiddenPages(try await mine.section("an-trang")) == ["/ca/ca-z/"] + before)

  // The Worker's refusal, with its message.
  let refused = await failure { try await mine.run(form.action(["path": "/"])!) }
  #expect(refused == "\(OwnerError.refused("not_a_page", message: "Chỉ ẩn được một trang của trang web (không phải trang chủ)."))")
}

@MainActor @Test("The app section's switch reads it from its address: our own test builds, then readers' again")
func standInSwitch() async throws {
  let (fake, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  let toggle = { (s: Owner.Section) -> (Bool, String)? in s.blocks.lazy.compactMap { if case .toggle(_, let on, let href) = $0 { (on, href) } else { nil } }.first }
  let readers = try #require(toggle(try await mine.section("ung-dung")))
  #expect(readers.0 == false && readers.1 == "/api/owner/sections/ung-dung?test=1")
  let ours = try #require(toggle(try await mine.section(at: readers.1)))
  #expect(ours.0 == true && ours.1 == "/api/owner/sections/ung-dung")
  #expect(fake.requests.suffix(2).map(\.url?.absoluteString) == ["https://aquatome.com/api/owner/sections/ung-dung", "https://aquatome.com/api/owner/sections/ung-dung?test=1"])
}

@MainActor @Test("Storage down: the next section answers 503 with the Worker's message, and the one after it comes")
func standInStorageDown() async throws {
  let (fake, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  fake.owner?.storageDownAtNextSection = true
  #expect(await failure { _ = try await mine.section("doc-gia") } == "\(OwnerError.refused("unavailable", message: "Không làm được lúc này: máy chủ không đọc hay ghi được. Thử lại sau."))")
  #expect(try await mine.section("doc-gia").title == "Người đọc thật")
  // The dashboard isn't down: the vector of it down is the knob's, never replayed.
  _ = try await mine.dashboard()
}

@MainActor @Test("A session that ends while the dashboard is open: the next section answers 401, and the account's session is over too")
func standInSessionEnds() async throws {
  let (fake, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  _ = try await mine.dashboard()
  fake.owner?.sessionEndsAtNextSection = true
  #expect(await failure { _ = try await mine.section("doc-gia") } == "signedOut")
  #expect(await failure { _ = try await mine.dashboard() } == "signedOut")
  #expect(fake.sessionCount == 0)
}
