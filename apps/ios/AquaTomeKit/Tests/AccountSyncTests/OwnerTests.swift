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
/// The vector of this name.
func named(_ name: String) -> Object { ownerReplies.first { $0["name"]?.string == name }! }
/// A reply as the client reads it, from JSONSerialization.
func dict(_ j: JSON) -> [String: Any] { try! JSONSerialization.jsonObject(with: j.data()) as! [String: Any] }
func dict(_ s: String) -> [String: Any] { try! JSONSerialization.jsonObject(with: Data(s.utf8)) as! [String: Any] }
/// The types keep no Equatable (app size), and some are classes, which print as their name only: compared field by field,
/// down through every value.
func describe(_ x: Any) -> String {
  let m = Mirror(reflecting: x)
  guard !m.children.isEmpty else { return String(reflecting: x) }
  return "\(m.subjectType)(" + m.children.map { "\($0.label ?? "_"): \(describe($0.value))" }.joined(separator: ", ") + ")"
}
func same<T>(_ a: T, _ b: T) -> Bool { describe(a) == describe(b) }
/// What a call threw, by name ("signedOut", "refused(…)"); nil when it didn't.
func failure(isolation: isolated (any Actor)? = #isolation, _ call: () async throws -> Void) async -> String? {
  do { try await call(); return nil } catch { return "\(error)" }
}
func text(_ j: JSON) -> String { String(decoding: try! j.data(), as: UTF8.self) }
func owner(_ stub: Stub, base: URL = AccountsClient.site) -> OwnerClient {
  OwnerClient(base: base, send: { try await stub.send($0) }, token: "t0k", timeZone: "Asia/Ho_Chi_Minh")
}
/// A refusal as the client throws it, written.
func refusal(_ v: Object) -> String {
  let o = v["body"]!.object!
  return "\(OwnerError.refused(o["error"]!.string!, message: o["message"]?.string))"
}

/// The request a vector names, sent through the client the way the app sends it: by the call the app makes for it (the
/// overview, a section for a period or by a filter's address, a table's rows, more comments, the report's delivery), else
/// as a button's. What the client read of a 200.
func send(_ api: OwnerClient, _ v: Object) async throws -> Any? {
  let req = v["request"]!.object!, method = req["method"]!.string!, p = req["path"]!.string!
  let c = URLComponents(string: p)!, parts = c.path.split(separator: "/").map(String.init) // api, owner, …
  let q = { (name: String) in c.queryItems?.first { $0.name == name }?.value }
  switch method {
  case "GET" where c.path == "/api/owner/dashboard": return try await api.dashboard()
  case "GET" where c.path == "/api/owner/report-settings": return try await api.reportSettings()
  case "GET" where c.path == "/api/owner/comments": return try await api.comments(q("state")!, cursor: q("cursor")!)
  case "GET" where parts.count == 6 && parts[4] == "tables": return try await api.table(parts[3], parts[5], cursor: q("cursor"), period: q("period"))
  case "GET" where q("state") != nil: return try await api.section(at: p)
  case "GET" where c.path.hasPrefix(sectionPrefix): return try await api.section(String(c.path.dropFirst(sectionPrefix.count)), period: q("period"))
  default:
    try await api.run(Owner.Action(label: "x", method: method, path: p, body: req["body"].map(dict)))
    return nil
  }
}

@Test("Every vector: the app sends its request as the vector has it (its call's method, path and query, bearer, Time-Zone, a button's body), and reads its reply as the contract says")
func everyVector() async throws {
  #expect(ownerReplies.count >= 58)
  for v in ownerReplies {
    let name = Comment(rawValue: v["name"]!.string!)
    let req = v["request"]!.object!, status = v["status"]!.int!, body = v["body"]!
    let stub = Stub([(status, text(body))])
    var error: Error?, read: Any?
    do { read = try await send(owner(stub), v) } catch let e { error = e }
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
    default: #expect(thrown == refusal(v), name)
    }
    // Only the server's storage not answering is worth trying again soon.
    #expect((error as? OwnerError)?.passes == (status == 200 ? nil : status == 503), name)

    // Each GET is one of the app's own calls, which reads its reply: the pages and the report's delivery, all of it.
    if status == 200 && req["method"]!.string == "GET" { #expect(read != nil, name) }
    if let page = read as? Owner.Page<[Owner.Link]> {
      #expect(page.items.map(\.count) == o["rows"]!.array!.map { $0.array!.count } && page.next == o["next"]?.string, name)
    } else if let page = read as? Owner.Page<Owner.Comment> {
      #expect(page.items.map(\.id) == o["items"]!.array!.map { $0.object!["id"]!.string! } && page.next == o["next"]?.string, name)
    } else if let now = read as? (email: Bool, push: Bool) {
      #expect(now.email == (o["email"] == .bool(true)) && now.push == (o["push"] == .bool(true)), name)
    }
  }
}

/// What comments hold, counted: the same from the app's reading and from the reply, or something was dropped.
func commentCounts(_ c: [Owner.Comment]) -> [String: Int] {
  ["comments": c.count, "at": c.filter { $0.at != nil }.count, "paths": c.filter { $0.path != nil }.count, "reasons": c.filter { !$0.reason.isEmpty }.count,
   "reports": c.map(\.reports.count).reduce(0, +), "actions": c.map(\.actions.count).reduce(0, +)]
}
func commentCounts(raw c: [Object]) -> [String: Int] {
  ["comments": c.count, "at": c.filter { $0["at"] != nil }.count, "paths": c.filter { $0["page"]!.object!["path"] != nil }.count,
   "reasons": c.filter { $0["reason"]!.string! != "" }.count, "reports": c.map { $0["reports"]?.array?.count ?? 0 }.reduce(0, +),
   "actions": c.map { $0["actions"]!.array!.count }.reduce(0, +)]
}

/// What a block holds, counted: the same from the app's reading and from the reply, or something was dropped.
func counts(_ b: Owner.Block) -> [String: Int] {
  switch b {
  case .heading(_, let level, let anchor): ["heading": level, "anchors": anchor == nil ? 0 : 1]
  case .figures(let f): ["figures": f.count, "meters": f.filter { $0.meter != nil }.count, "deltas": f.filter { $0.delta != nil }.count, "subs": f.filter { $0.sub != nil }.count]
  case .chart(let c): ["chart": c.series.count, "labels": c.labels.count, "readouts": c.readouts.count, "today": c.today.map { $0 + 1 } ?? 0, "whole": c.whole == nil ? 0 : 1,
                       "values": c.series.map(\.values.count).reduce(0, +)]
  case .table(let t): ["table": t.rows.count, "columns": t.columns.count, "cells": t.rows.joined().count, "links": t.rows.joined().filter { $0.to != nil }.count,
                       "subs": t.rows.joined().filter { $0.text != nil }.count, "id": t.id == nil ? 0 : 1, "folded": t.folded == nil ? 0 : 1,
                       "figure": t.figure == nil ? 0 : 1, "count": t.count ?? -1, "next": t.next == nil ? 0 : 1]
  case .note: ["note": 1]
  case .cards(let items, _, let hidden): [hidden ? "hidden" : "photos": items.count, "actions": items.map(\.actions.count).reduce(0, +)]
  case .actions(let a): ["actions": a.count, "bodies": a.filter { $0.body != nil }.count]
  case .form(let f): ["form": f.fields.count, "required": f.fields.filter(\.required).count, "body": f.body == nil ? 0 : 1]
  case .toggle(_, let on, _): ["switch": on ? 1 : 0]
  case .comments(let c): commentCounts(c.items).merging(["filters": c.filters.count, "counted": c.filters.map(\.count).reduce(0, +), "next": c.next == nil ? 0 : 1,
                                                         "empty": c.empty == nil ? 0 : 1]) { $1 }
  }
}

func counts(_ raw: JSON) -> [String: Int] {
  let o = raw.object!, kind = o["kind"]!.string!, list = { (k: String) in o[k]?.array?.compactMap(\.object) ?? [] }
  switch kind {
  case "heading": return ["heading": o["level"]!.int!, "anchors": o["anchor"] == nil ? 0 : 1]
  case "figures": let f = list("items"); return ["figures": f.count, "meters": f.filter { $0["meter"] != nil }.count, "deltas": f.filter { $0["delta"] != nil }.count, "subs": f.filter { $0["sub"] != nil }.count]
  case "chart":
    let s = list("series")
    return ["chart": s.count, "labels": o["labels"]!.array!.count, "readouts": o["readouts"]!.array!.count, "today": o["today"]?.int.map { $0 + 1 } ?? 0,
            "whole": o["whole"] == nil ? 0 : 1, "values": s.map { $0["values"]!.array!.count }.reduce(0, +)]
  case "table":
    let cells = o["rows"]!.array!.flatMap { $0.array! }.map { $0.object! }
    return ["table": o["rows"]!.array!.count, "columns": o["columns"]!.array!.count, "cells": cells.count, "links": cells.filter { $0["href"] != nil }.count,
            "subs": cells.filter { $0["sub"] != nil }.count, "id": o["id"] == nil ? 0 : 1, "folded": o["folded"] == nil ? 0 : 1, "figure": o["figure"] == nil ? 0 : 1,
            "count": o["count"]?.int ?? -1, "next": o["next"] == nil ? 0 : 1]
  case "note": return ["note": 1]
  case "actions": let a = list("actions"); return ["actions": a.count, "bodies": a.filter { $0["body"] != nil }.count]
  case "form": let f = list("fields"); return ["form": f.count, "required": f.filter { $0["required"] == .bool(true) }.count, "body": o["body"] == nil ? 0 : 1]
  case "switch": return ["switch": o["on"] == .bool(true) ? 1 : 0]
  case "comments":
    let f = list("filters")
    return commentCounts(raw: list("items")).merging(["filters": f.count, "counted": f.map { $0["count"]!.int! }.reduce(0, +), "next": o["next"] == nil ? 0 : 1,
                                                      "empty": o["empty"] == nil ? 0 : 1]) { $1 }
  default: let items = list("items"); return [kind: items.count, "actions": items.map { $0["actions"]!.array!.count }.reduce(0, +)]
  }
}

/// Where a line goes, written "key#anchor" for a section, else its address; and the same from the reply's fields.
func target(_ d: Owner.Destination?) -> String? {
  switch d {
  case .section(let k, let a)?: a.map { k + "#" + $0 } ?? k
  case .url(let u)?, .page(let u)?: u
  case nil: nil
  }
}
func target(_ o: Object) -> String? { o["section"]?.string.map { k in o["anchor"]?.string.map { k + "#" + $0 } ?? k } ?? o["url"]?.string }

/// The overview read whole, each part as the reply has it: four tiles and their bars, what needs the owner, readers who
/// found an answer, what shipped, the costs, the last days, and every page by group.
func overviewRead(_ d: Owner.Dashboard, _ o: Object, _ name: Comment) throws {
  let list = { (k: String) in o[k]?.array?.map { $0.object! } ?? [] }
  #expect(d.tz == "Asia/Ho_Chi_Minh" && d.asOf == Date(timeIntervalSince1970: 1_793_782_800), name)

  let tiles = list("tiles"), bars = tiles.map { $0["bars"]?.object }
  #expect(d.tiles.map(\.key) == ["needs", "answers", "shipped", "cost"], name)
  #expect(d.tiles.map(\.label) == tiles.map { $0["label"]!.string! } && d.tiles.map(\.value) == tiles.map { $0["value"]!.string! }, name)
  #expect(d.tiles.map(\.sub) == tiles.map { $0["sub"]?.string } && d.tiles.map(\.tone.rawValue) == tiles.map { $0["tone"]?.string ?? "plain" }, name)
  #expect(d.tiles.map { $0.delta?.text } == tiles.map { $0["delta"]?.object?["text"]?.string }, name)
  #expect(d.tiles.map { $0.bars?.values.count } == bars.map { $0?["values"]?.array?.count }, name)
  #expect(d.tiles.map { $0.bars?.readouts.map(\.title) } == bars.map { $0?["readouts"]?.array?.map { $0.object!["title"]!.string! } }, name)
  #expect(d.tiles.map { $0.bars?.today } == bars.map { $0?["today"]?.int }, name)

  // Most pressing first, each with where it's dealt with; waiting photos as their private addresses.
  let needs = list("needs")
  #expect(d.needs.map(\.kind) == needs.map { $0["kind"]!.string! } && d.needs.map(\.text) == needs.map { $0["text"]!.string! }, name)
  #expect(d.needs.map(\.sub) == needs.map { $0["sub"]?.string } && d.needs.map(\.label) == needs.map { $0["label"]?.string }, name)
  #expect(d.needs.map(\.tone.rawValue) == needs.map { $0["tone"]?.string ?? "plain" }, name)
  #expect(d.needs.map { target($0.to) } == needs.map { target($0) } && d.needs.allSatisfy { $0.to != nil }, name)
  #expect(d.needs.map(\.photos) == needs.map { ($0["photos"]?.array ?? []).map { "/_ab/anh/" + $0.string! } }, name)
  #expect(d.needsEmpty == o["needsEmpty"]!.string! && !d.needsEmpty.isEmpty, name)
  // The owner's last action: what, when, and the section it was in.
  let last = o["lastAction"]?.object
  #expect(d.lastAction?.title == last?["text"]?.string && d.lastAction?.figure == last?["when"]?.string, name)
  #expect(target(d.lastAction?.to) == last?["section"]?.string && (last == nil) == (d.lastAction == nil), name)

  let answers = o["answers"]!.object!, a = try #require(d.answers, name), chart = answers["chart"]?.object
  #expect(a.title == answers["title"]!.string! && a.note == answers["note"]?.object?["text"]?.string, name)
  #expect(a.figure?.value == answers["figure"]?.object?["value"]?.string && a.figure?.delta?.text == answers["figure"]?.object?["delta"]?.object?["text"]?.string, name)
  #expect(a.figures.map(\.label) == (answers["figures"]?.array ?? []).map { $0.object!["label"]!.string! }, name)
  #expect(a.chart?.labels == chart?["labels"]?.array?.map { $0.string! } && a.chart?.today == chart?["today"]?.int, name)
  #expect(a.chart?.readouts.map(\.detail) == chart?["readouts"]?.array?.map { $0.object!["detail"]!.string! }, name)
  if let c = a.chart {
    // Each day its label, its readout, and a value of each series.
    #expect(!c.series.isEmpty && c.readouts.count == c.count && (c.series + [c.whole].compactMap { $0 }).allSatisfy { $0.values.count == c.count }, name)
  }

  let shipped = o["shipped"]!.object!, s = try #require(d.shipped, name), lines = shipped["lines"]!.array!.map { $0.object! }
  #expect(s.title == shipped["title"]!.string! && s.lines.map(\.text) == lines.map { $0["text"]!.string! }, name)
  #expect(s.lines.map(\.area) == lines.map { $0["area"]!.string! } && s.lines.map(\.label) == lines.map { $0["label"]!.string! }, name)
  #expect(s.more?.title == shipped["link"]?.string && target(s.more?.to) == "thay-doi", name)

  let costs = o["costs"]!.object!, c = try #require(d.costs, name), keys = costs["keys"]!.object!
  #expect(c.title == costs["title"]!.string! && c.lines.map(\.value) == costs["lines"]!.array!.map { $0.object!["value"]!.string! }, name)
  #expect(c.fixed == costs["fixed"]!.array!.map { $0.string! } && c.note == costs["note"]?.string, name)
  #expect(c.keys?.title == keys["label"]?.string && c.keys?.figure == keys["text"]?.string && c.keys?.tone.rawValue == keys["tone"]?.string, name)
  #expect(target(c.keys?.to) == target(keys) && target(keys) != nil, name)

  // A row a day, newest first: its title, its figure, its other lines and the section it opens.
  let log = try #require(d.log, name), days = o["log"]!.object!["days"]!.array!.map { $0.object! }
  #expect(log.title == o["log"]!.object!["title"]!.string! && log.days.map(\.title) == days.map { $0["title"]!.string! }, name)
  #expect(log.days.map(\.figure) == days.map { $0["figure"]?.string } && log.days.map(\.text) == days.map { $0["text"]?.string }, name)
  #expect(log.days.map { target($0.to) } == days.map { target($0) }, name)

  // Every page by group, each with its figure in its tone, opening its section.
  let groups = list("pages"), pages = groups.flatMap { $0["pages"]!.array!.map { $0.object! } }, read = d.pages.flatMap(\.pages)
  #expect(d.pages.map(\.name) == groups.map { $0["name"]!.string! } && read.map(\.title) == pages.map { $0["name"]!.string! }, name)
  #expect(read.map { target($0.to) } == pages.map { $0["key"]?.string }, name)
  #expect(read.map(\.figure) == pages.map { $0["figure"]?.object?["text"]?.string }, name)
  #expect(read.map(\.tone.rawValue) == pages.map { $0["figure"]?.object?["tone"]?.string ?? "plain" }, name)
  #expect(d.sections.map(\.title) == list("sections").map { $0["name"]!.string! }, name)
}

@Test("Every block of every section, every part of the overview, and every page of a table's rows or of comments, is read into what the app draws: nothing dropped")
func nothingDropped() throws {
  var overviews = 0, keys: Set<String> = [], anchors: [String: Set<String>] = [:], headings: [String: Set<String>] = [:]
  for v in ownerReplies where v["status"]?.int == 200 && v["request"]!.object!["method"]!.string == "GET" {
    let name = Comment(rawValue: v["name"]!.string!), body = v["body"]!, o = body.object!, at = URLComponents(string: path(v))!.path
    if at == "/api/owner/dashboard" {
      overviews += 1
      let d = Owner.Dashboard(dict(body))
      try overviewRead(d, o, name)
      // Where the needs and the keys' line open their sections.
      for to in d.needs.map(\.to) + [d.costs?.keys?.to] { if case .section(let k, let a?)? = to { anchors[k, default: []].insert(a) } }
      keys.formUnion((d.pages.flatMap(\.pages) + d.sections).compactMap { if case .section(let k, _)? = $0.to { k } else { nil } })
      #expect(d.name(of: "an-trang") == "Hidden pages", name)
    } else if at == "/api/owner/comments" {
      let p = Owner.Page<Owner.Comment>(comments: dict(body))
      #expect(commentCounts(p.items) == commentCounts(raw: o["items"]!.array!.map { $0.object! }) && p.next == o["next"]?.string, name)
    } else if at.contains("/tables/") {
      let p = Owner.Page<[Owner.Link]>(rows: dict(body)), rows = o["rows"]!.array!.map { $0.array!.map { $0.object! } }
      #expect(p.items.map(\.count) == rows.map(\.count) && p.next == o["next"]?.string, name)
      #expect(p.items.joined().filter { $0.text != nil }.count == rows.joined().filter { $0["sub"] != nil }.count, name)
    } else if at.hasPrefix(sectionPrefix) {
      let s = Owner.Section(dict(body)), raw = o["blocks"]!.array!
      #expect(!s.title.isEmpty, name)
      #expect(s.blocks.map(counts) == raw.map(counts), name)
      #expect(s.periods.map(\.key) == (o["periods"]?.array ?? []).map { $0.object!["key"]!.string! } && s.period == o["period"]?.string, name)
      headings[String(at.dropFirst(sectionPrefix.count)), default: []].formUnion(s.blocks.compactMap { if case .heading(_, _, let a?) = $0 { a } else { nil } })
    }
  }
  // The five overviews: as usual, with nothing to do, with the readers' beacon down, with the AI spend near its cap, and
  // with the engine quiet.
  #expect(overviews == 5)
  // Every anchor the overview names is a heading's of its section.
  #expect(anchors["nhan-dien-ca"] == ["key"] && anchors["noi-dung"] == ["engine"])
  for (k, a) in anchors { #expect(a.isSubset(of: headings[k] ?? []), "\(k): \(a)") }
  // Every page the overview lists opens a section the vectors have, and every section they have is listed.
  #expect(keys == Set(headings.keys) && keys.count >= 14)
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
    let name = Comment(rawValue: v["name"]!.string!), body = v["body"]!, at = URLComponents(string: path(v))!.path
    if at == "/api/owner/dashboard" {
      #expect(same(Owner.Dashboard(dict(withLater(body))), Owner.Dashboard(dict(body))), name)
    } else if at == "/api/owner/comments" {
      #expect(same(Owner.Page<Owner.Comment>(comments: dict(withLater(body))), Owner.Page<Owner.Comment>(comments: dict(body))), name)
    } else if at.contains("/tables/") {
      #expect(same(Owner.Page<[Owner.Link]>(rows: dict(withLater(body))), Owner.Page<[Owner.Link]>(rows: dict(body))), name)
    } else if at.hasPrefix(sectionPrefix) {
      #expect(same(Owner.Section(dict(withLater(body))), Owner.Section(dict(body))), name)
    }
  }
  // An unknown tone is plain.
  let s = Owner.Section(dict(#"{"title":"T","blocks":[{"kind":"note","text":"n","tone":"glowing"}]}"#))
  #expect(same(s.blocks, [Owner.Block.note("n", .plain)]))
}

@Test("The overview's last days: a row a day as written, with its figure, its other lines and the section or address it opens")
func theLog() throws {
  let d = Owner.Dashboard(dict(#"""
  {"tz":"Asia/Ho_Chi_Minh","log":{"title":"The last three days","days":[
    {"title":"Today so far","figure":"23 readers","text":"11 fish ID calls ($0.11) · 2 new comments","section":"doc-gia"},
    {"title":"Yesterday","figure":"22 readers","url":"https://example.com/engine/runs"},
    {"title":"Monday 2 Nov","url":"http://example.com/"},
    {"figure":"no title"}
  ]}}
  """#))
  let log = try #require(d.log)
  #expect(log.title == "The last three days")
  // An address that isn't https opens nothing; a day without a title is left out.
  #expect(same(log.days, [
    Owner.Link(title: "Today so far", text: "11 fish ID calls ($0.11) · 2 new comments", figure: "23 readers", to: .section("doc-gia", anchor: nil)),
    Owner.Link(title: "Yesterday", figure: "22 readers", to: .url("https://example.com/engine/runs")),
    Owner.Link(title: "Monday 2 Nov"),
  ]))
  // No log: none; and an overview missing its parts reads as one with none of them.
  let bare = Owner.Dashboard(dict(#"{"tz":"UTC","sections":[]}"#))
  #expect(bare.log == nil && bare.tiles.isEmpty && bare.needs.isEmpty && bare.answers == nil && bare.shipped == nil && bare.costs == nil && bare.pages.isEmpty)
}

@Test("Bars or a chart without a readout for each day are left out (a bar with nothing to say when tapped is never drawn), and so is a waiting photo that isn't an id")
func partsLeftOut() {
  let d = Owner.Dashboard(dict(#"""
  {"tz":"UTC","tiles":[
    {"key":"answers","label":"Found an answer","value":"1","bars":{"values":[1,2],"readouts":[{"title":"1 found an answer","detail":"Mon 2 Nov"}],"today":1}},
    {"key":"needs","label":"Needs you","value":"2","bars":{"values":[1,null],"readouts":[{"title":"1","detail":"Mon 2 Nov"},{"title":"Still to come","detail":"Tue 3 Nov"}],"today":0}}],
   "needs":[{"kind":"photos","text":"2 reader photos waiting","section":"anh-ban-doc","photos":["a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d","../x"]}],
   "answers":{"title":"A","chart":{"kind":"chart","id":"answers","title":"C","labels":["Mon","Tue"],"readouts":[{"title":"1","detail":"Mon 2 Nov"}],"series":[{"label":"S","values":[1,2]}]}}}
  """#))
  #expect(d.tiles.map { $0.bars == nil } == [true, false])
  #expect(d.tiles[1].bars?.values == [1, nil] && d.tiles[1].bars?.today == 0)
  #expect(d.needs.first?.photos == ["/_ab/anh/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"])
  #expect(d.answers?.title == "A" && d.answers?.chart == nil)
}

@Test("401 is a session the server no longer takes (sign in again), 404 not the owner, 503 storage down for now (try again): each told apart, from every path")
func signedOutIsNotNotOwner() async throws {
  let action = Owner.Action(label: "Approve", method: "POST", path: "/api/owner/photos/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d", body: ["action": "approve"])
  let down = named("storage down")
  for (status, body, expected, passes) in [(401, #"{"error":"signed_out"}"#, "signedOut", false), (404, #"{"error":"not_found"}"#, "notFound", false),
                                           (503, text(down["body"]!), refusal(down), true)] {
    for call in 0..<7 {
      let stub = Stub([(status, body)])
      let api = owner(stub)
      var error: Error?
      do {
        switch call {
        case 0: _ = try await api.dashboard()
        case 1: _ = try await api.section("doc-gia")
        case 2: _ = try await api.section(at: "/api/owner/sections/ung-dung?test=1")
        case 3: _ = try await api.table("nhan-dien-ca", "t5", cursor: "50", period: "d7")
        case 4: _ = try await api.comments("held", cursor: "c")
        case 5: _ = try await api.reportSettings()
        default: try await api.run(action)
        }
      } catch let e { error = e }
      #expect(error.map { "\($0)" } == expected, "\(status) \(call)")
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

@Test("The report's delivery read, and its email turned off: each request as the contract has it, and what the server says it is now")
func reportDelivery() async throws {
  let stub = Stub([(200, text(named("the report's delivery")["body"]!)), (200, #"{"ok":true,"changed":true,"email":false,"push":false}"#),
                   (200, #"{"email":"yes","push":false}"#)])
  let api = owner(stub)
  let now = try await api.reportSettings()
  #expect(now.email && !now.push)
  #expect(try await api.reportEmail(false) == false)
  // A reply without the two switches isn't the contract's.
  #expect(await failure { _ = try await api.reportSettings() } == "badReply")
  let sent = await stub.requests
  #expect(sent.map(\.httpMethod) == ["GET", "POST", "GET"] && sent.allSatisfy { $0.url?.absoluteString == "https://aquatome.com/api/owner/report-settings" })
  #expect(sent[1].httpBody.flatMap { try? JSON.parse($0) } == .object(["email": .bool(false)]) && sent[1].value(forHTTPHeaderField: "Content-Type") == "application/json")
}

@Test("A form sends its fields (trimmed, an empty optional one left out) with its body as one object, and not while a field it needs is empty")
func forms() throws {
  let form = try #require(Owner.Section(dict(named("section an-trang")["body"]!)).blocks.compactMap { if case .form(let f) = $0 { f } else { nil } }.first)
  #expect(form.fields.map(\.name) == ["path", "note"] && form.fields.map(\.required) == [true, false] && form.submit == "Hide")
  #expect(form.action([:]) == nil && form.action(["path": "  ", "note": "sai loài"]) == nil)
  let a = try #require(form.action(["path": " /ca/ca-y/ ", "note": "sai loài"]))
  #expect(a.method == "POST" && a.path == "/api/owner/hidden" && a.label == "Hide" && !a.asks)
  #expect(a.body == #"{"hide":true,"note":"sai loài","path":"/ca/ca-y/"}"#)
  #expect(form.action(["path": "https://aquatome.com/ca/ca-y/", "note": " "])?.body == #"{"hide":true,"path":"https://aquatome.com/ca/ca-y/"}"#)
  let multiline = Owner.Section(dict(#"{"title":"T","blocks":[{"kind":"form","method":"POST","path":"/api/owner/x","submit":"Gửi","fields":[{"name":"n","label":"L","kind":"textarea"}]}]}"#))
  guard case .form(let f)? = multiline.blocks.first else { Issue.record("no form"); return }
  #expect(f.fields[0].multiline && f.body == nil && f.action([:])?.body == "{}")
  // A field of a kind the app can't draw: the form is left out, not drawn as text.
  let later = Owner.Section(dict(#"{"title":"T","blocks":[{"kind":"form","method":"POST","path":"/api/owner/x","submit":"Gửi","fields":[{"name":"n","label":"L","kind":"text"},{"name":"d","label":"Ngày","kind":"date"}]}]}"#))
  #expect(later.blocks.isEmpty)
}

@Test("Two values one field apart are not the same, a class's too: the comparison the other tests rely on looks inside")
func comparerLooksInside() {
  let section = #"""
  {"title":"T","blocks":[
    {"kind":"figures","items":[{"label":"L","value":"1","meter":0.5,"delta":{"text":"+1%","tone":"good"}}]},
    {"kind":"chart","id":"c","title":"C","labels":["Mon","Today"],"readouts":[{"title":"1 reader","detail":"Mon 2 Nov"},{"title":"2 readers","detail":"Tue 3 Nov, so far"}],
     "today":1,"series":[{"label":"S","values":[1,2]}],"missing":"M"},
    {"kind":"table","columns":["A"],"rows":[],"empty":"E","id":"t1","folded":"Fold","count":60,"next":"50"},
    {"kind":"photos","items":[{"id":"p","src":"/_ab/anh/p","caption":"c","meta":["m"],"actions":[]}]},
    {"kind":"form","method":"POST","path":"/api/owner/x","submit":"Gửi","fields":[{"name":"n","label":"L","kind":"text","placeholder":"P"}]},
    {"kind":"comments","state":"held","filters":[{"state":"held","label":"Held","count":1,"href":"/api/owner/sections/binh-luan?state=held"}],"empty":"None",
     "items":[{"id":"c1","at":"2026-11-04T07:00:00.000Z","name":"N","page":{"path":"/ca/a/","title":"A"},"text":"X","state":"held","reason":"Rsn","reports":["spam"],"actions":[]}]}
  ]}
  """#
  let original = Owner.Section(dict(section))
  #expect(original.blocks.count == 6 && same(original, Owner.Section(dict(section))))
  // One field each of Figure, Chip, Chart, Readout, Series, Table, Card, Form, Field, Comments and Comment.
  for (from, to) in [("0.5", "0.6"), ("+1%", "+2%"), (#""M""#, #""N""#), ("Tue 3 Nov", "Wed 4 Nov"), ("[1,2]", "[1,3]"), (#""E""#, #""F""#), (#""Fold""#, #""Open""#),
                     (#"["m"]"#, #"["n"]"#), (#""Gửi""#, #""Gửi đi""#), (#""P""#, #""Q""#), (#""count":1,"#, #""count":2,"#), (#""Rsn""#, #""Why""#),
                     (#"["spam"]"#, #"["rude"]"#)] {
    #expect(!same(original, Owner.Section(dict(section.replacingOccurrences(of: from, with: to)))), "\(from) → \(to)")
  }
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

/// A request sent to the stand-in as it is, with the owner's bearer: its status and its reply.
@MainActor func sentAsIs(_ fake: FakeAccounts, _ method: String, _ path: String, _ body: JSON? = nil) async throws -> (Int, JSON?) {
  var r = URLRequest(url: URL(string: path, relativeTo: AccountsClient.site)!.absoluteURL)
  r.httpMethod = method
  r.httpBody = try body?.data()
  r.setValue("Bearer " + (try await signIn(client(fake), "ui-apple")).token, forHTTPHeaderField: "Authorization")
  let (data, reply) = try await fake.send(r)
  return (reply.statusCode, try? JSON.parse(data))
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
  #expect(same(try await mine.dashboard(), Owner.Dashboard(dict(named("dashboard")["body"]!))))
  #expect(await failure { _ = try await theirs.dashboard() } == "notFound")
  let gone = OwnerClient(send: { try await fake.send($0) }, token: "never-issued")
  #expect(await failure { _ = try await gone.dashboard() } == "signedOut")
  #expect(await failure { _ = try await mine.section("no-such-section") } == "notFound")

  let src = try #require(photos(try await mine.section("anh-ban-doc")).first?.src ?? nil)
  #expect(await mine.image(src) == FakeOwner.picture)
  #expect(await theirs.image(src) == nil)
  // Its own picture, once the stand-in has it: to the owner only.
  fake.owner?.webp[src] = Data("koi".utf8)
  #expect(await mine.image(src) == Data("koi".utf8))
  #expect(await theirs.image(src) == nil)
  #expect(await gone.image(src) == nil)
  #expect(await theirs.image("https://media.aquatome.com/p/c3d4-thumb.webp") != nil)
  // Each private photo went with the owner's bearer, the public one without.
  let images = fake.requests.filter { $0.url?.path.hasPrefix("/_ab/") == true || $0.url?.host != "aquatome.com" }
  #expect(images.map { $0.value(forHTTPHeaderField: "Authorization") != nil } == [true, true, true, true, true, false])
}

@MainActor @Test("A waiting photo the overview lists is the owner's to see even where no section shows it, and no one else's")
func standInWaitingPhotos() async throws {
  // The vectors without the readers' photos section: only the overview lists the waiting ones.
  var vectors = ownerVectors.object!
  vectors["replies"] = .array(ownerReplies.filter { $0["name"]?.string != "section anh-ban-doc" }.map(JSON.object))
  let fake = FakeAccounts()
  fake.owner = FakeOwner(vectors: .object(vectors))
  let api = OwnerFakeAPI(fake: fake)
  let mine = try await api.signedIn("ui-apple"), theirs = try await api.signedIn("someone-else")
  let waiting = try await mine.dashboard().needs.flatMap(\.photos)
  #expect(waiting.count == 2)
  for src in waiting {
    #expect(await mine.image(src) != nil)
    #expect(await theirs.image(src) == nil)
  }
  #expect(await mine.image("/_ab/anh/c3d4e5f6-a7b8-4c9d-8e0f-2a3b4c5d6e7f") == nil)
}

@MainActor @Test("The stand-in's buttons change what a section read again shows: a photo approved, then removed; a page hidden, then back")
func standInButtons() async throws {
  let (_, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  var waiting = photos(try await mine.section("anh-ban-doc"))
  let first = waiting[0]
  #expect(first.actions.map(\.label) == ["Approve", "Remove"])

  try await mine.run(first.actions[0])
  waiting = photos(try await mine.section("anh-ban-doc"))
  #expect(waiting[0].actions.map(\.label) == ["Remove"])
  #expect(waiting[0].lines.last == "Approved · goes up at the next pass")
  try await mine.run(waiting[0].actions[0])
  #expect(!photos(try await mine.section("anh-ban-doc")).contains { $0.src == first.src })
  // Gone, though the overview still lists it as waiting.
  #expect(try await mine.dashboard().needs.flatMap(\.photos).contains(first.src!))
  #expect(await mine.image(first.src!) == nil)

  let shot = photos(try await mine.section("anh-nhan-dien"))[1]
  try await mine.run(shot.actions[0])
  #expect(photos(try await mine.section("anh-nhan-dien")).map(\.src) == ["/_ab/anh-nhan-dien/anh/reader-1/0b4c6a8e-1f2d-4c3b-9a8e-7d6c5b4a3f21"])

  // Hidden by the section's form, at the top as the newest, then back by its "Show again"; by a whole address too.
  let section = try await mine.section("an-trang")
  let before = hiddenPages(section)
  let form = try #require(section.blocks.compactMap { if case .form(let f) = $0 { f } else { nil } }.first)
  try await mine.run(try #require(form.action(["path": "/ca/ca-y/", "note": "sai loài"])))
  let after = try await mine.section("an-trang")
  #expect(hiddenPages(after) == ["/ca/ca-y/"] + before)
  guard case .cards(let h, _, true)? = after.blocks.last else { Issue.record("no hidden block"); return }
  #expect(h[0].lines == ["sai loài", "Wed 4 Nov, 16:00"])
  try await mine.run(h[0].actions[0])
  #expect(hiddenPages(try await mine.section("an-trang")) == before)
  try await mine.run(try #require(form.action(["path": "https://aquatome.com/ca/ca-z/"])))
  #expect(hiddenPages(try await mine.section("an-trang")) == ["/ca/ca-z/"] + before)

  // The Worker's refusal, with its message.
  let refused = await failure { try await mine.run(form.action(["path": "/"])!) }
  #expect(refused == refusal(named("hide the home page")))
  #expect(refused == "\(OwnerError.refused("not_a_page", message: "Only one page of the site can be hidden, and not the home page."))")
}

/// The Comments section's comments block, in one state by its filter's address (nil: as the section comes).
@MainActor func commentList(_ api: OwnerClient, _ state: String? = nil) async throws -> Owner.Comments {
  let s = try await (state == nil ? api.section("binh-luan") : api.section(at: "/api/owner/sections/binh-luan?state=" + state!))
  return try #require(s.blocks.lazy.compactMap { if case .comments(let c) = $0 { c } else { nil } }.first)
}
/// The comments listed, by their ids' first four characters.
func ids(_ c: Owner.Comments) -> [String] { c.items.map { String($0.id.prefix(4)) } }
/// Held, Shown and Hidden's counts.
func counted(_ c: Owner.Comments) -> [Int] { c.filters.map(\.count) }

@MainActor @Test("The stand-in's comments: shown, hidden, then shown again, each moving between the filters with their counts, with the owner's reason and the buttons of its new state; one only a later page lists too")
func standInComments() async throws {
  let (fake, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  var held = try await commentList(mine)
  #expect(held.state == "held" && held.filters.map(\.state) == ["held", "shown", "hidden"] && counted(held) == [5, 20, 2])
  #expect(ids(held) == ["0c1d", "1d2e", "5b6c"] && held.items[2].path == nil && held.items[2].page == "a page no longer on the site")
  // The rest of Held, on the page its `next` gives.
  let cursor = try #require(held.next)
  let more = try await mine.comments("held", cursor: cursor)
  #expect(more.items.map(\.id) == ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000000"] && more.next == nil)

  // Shown: off Held, on Shown by when it was posted, with the owner's reason and Hide.
  try await mine.run(try #require(held.items[0].actions.first { $0.label == "Show" }))
  held = try await commentList(mine)
  #expect(ids(held) == ["1d2e", "5b6c"] && counted(held) == [4, 21, 2] && held.next == cursor)
  var shown = try await commentList(mine, "shown")
  #expect(shown.state == "shown" && ids(shown) == ["2e3f", "0c1d", "6c7d", "7d8e"] && counted(shown) == [4, 21, 2])
  let moved = shown.items[1]
  #expect(moved.state == "shown" && moved.reason == "Shown by the owner" && moved.actions.map(\.label) == ["Hide"] && !moved.actions[0].asks)

  // Hidden: on Hidden, with Show again.
  try await mine.run(moved.actions[0])
  let hidden = try await commentList(mine, "hidden")
  #expect(ids(hidden) == ["0c1d", "3f4a", "4a5b"] && counted(hidden) == [4, 20, 3])
  #expect(hidden.items[0].reason == "Hidden by the owner" && hidden.items[0].actions.map(\.label) == ["Show again"] && !hidden.items[0].actions[0].asks)
  #expect(hidden.items[0].actions[0].path == "/api/owner/comments/" + moved.id && hidden.items[0].actions[0].body == #"{"action":"show"}"#)

  // Shown again.
  try await mine.run(hidden.items[0].actions[0])
  shown = try await commentList(mine, "shown")
  #expect(ids(shown) == ["2e3f", "0c1d", "6c7d", "7d8e"] && counted(shown) == [4, 21, 2] && shown.items[1].reason == "Shown by the owner")
  #expect(ids(try await commentList(mine, "hidden")) == ["3f4a", "4a5b"])

  // One only the later page lists, hidden: off that page, on Hidden's first; the page keeps the rest, and Held its `next`.
  try await mine.run(try #require(more.items[0].actions.first { $0.label == "Hide" }))
  #expect(try await mine.comments("held", cursor: cursor).items.map(\.id) == ["00000000-0000-4000-8000-000000000000"])
  #expect(ids(try await commentList(mine, "hidden")) == ["3f4a", "0000", "4a5b"])
  held = try await commentList(mine)
  #expect(counted(held) == [3, 21, 3] && held.next == cursor)

  // The Worker's reply: changed, as its vector has it; and not, for one already so.
  let (status, reply) = try await sentAsIs(fake, "POST", "/api/owner/comments/1d2e3f4a-5b6c-4d7e-9f8a-0b1c2d3e4f5a", .object(["action": .string("hide")]))
  #expect(status == 200 && reply == named("hide a shown comment")["body"])
  let (again, unchanged) = try await sentAsIs(fake, "POST", "/api/owner/comments/1d2e3f4a-5b6c-4d7e-9f8a-0b1c2d3e4f5a", .object(["action": .string("hide")]))
  #expect(again == 200 && unchanged == .object(["ok": .bool(true), "changed": .bool(false)]))
  #expect(counted(try await commentList(mine)) == [2, 21, 4])
}

@MainActor @Test("The stand-in refuses comments as the Worker does: one hidden more than 30 days ago can't be shown (409), one it doesn't have is 404, an action that is neither 400; nothing moves")
func standInCommentRefusals() async throws {
  let (_, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  let old = try #require(try await commentList(mine, "hidden").items.last)
  #expect(old.id == "4a5b6c7d-8e9f-4a0b-8c1d-3e4f5a6b7c8d" && old.actions.isEmpty)
  let button = { (id: String, action: String) in Owner.Action(label: "x", method: "POST", path: "/api/owner/comments/" + id, body: ["action": action]) }
  #expect(await failure { try await mine.run(button(old.id, "show")) } == refusal(named("show a comment hidden more than 30 days ago")))
  #expect(await failure { try await mine.run(button("99999999-9999-4999-8999-999999999999", "hide")) } == "notFound")
  #expect(await failure { try await mine.run(button("abcdefab-cdef-4abc-8def-abcdefabcdef", "show")) } == "notFound")
  #expect(await failure { try await mine.run(button("1d2e3f4a-5b6c-4d7e-9f8a-0b1c2d3e4f5a", "approve")) } == refusal(named("a comment action that is neither")))
  #expect(await failure { try await mine.run(button("0c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f", "delete")) } == refusal(named("a comment action that is neither")))
  #expect(ids(try await commentList(mine, "hidden")) == ["3f4a", "4a5b"])
  #expect(counted(try await commentList(mine)) == [5, 20, 2])
  // A page the stand-in never gave, or a state that isn't one: 400.
  #expect(await failure { _ = try await mine.comments("held", cursor: "x") } == "\(OwnerError.refused("bad_request", message: nil))")
  let heldNext = try #require(try await commentList(mine).next)
  #expect(await failure { _ = try await mine.comments("shown", cursor: heldNext) } == "\(OwnerError.refused("bad_request", message: nil))")
  #expect(await failure { _ = try await mine.section(at: "/api/owner/sections/binh-luan?state=deleted") } == "\(OwnerError.refused("bad_request", message: nil))")
}

@MainActor @Test("The stand-in's periods: one the section offers as the Worker answered it, its first as none; one it doesn't offer, or any on a section with none, refused in the Worker's words")
func standInPeriods() async throws {
  let (_, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  let d30 = try await mine.section("nhan-dien-ca", period: "d30")
  #expect(d30.period == "d30" && same(d30, Owner.Section(dict(named("period: fish ID, 30 days")["body"]!))))
  let first = try await mine.section("nhan-dien-ca", period: "week")
  #expect(first.period == "week" && first.periods.map(\.key) == ["week", "today", "d7", "d30", "month"])
  #expect(same(first, try await mine.section("nhan-dien-ca")))
  // One it offers that the vectors don't have: the section as it is, for that period.
  #expect(try await mine.section("nhan-dien-ca", period: "today").period == "today")
  let offers = named("a period the section doesn't offer"), none = named("a period on a section with none")
  #expect(refusal(offers) == "\(OwnerError.refused("bad_request", message: "period: one of week, today, d7, d30, month."))")
  #expect(refusal(none) == "\(OwnerError.refused("bad_request", message: "This section has no periods."))")
  for (key, period, said) in [("nhan-dien-ca", "year", offers), ("nhan-dien-ca", "d90", offers), ("an-trang", "d7", none), ("doc-gia", "d30", none),
                              ("binh-luan", "d7", none)] {
    #expect(await failure { _ = try await mine.section(key, period: period) } == refusal(said), "\(key) \(period)")
  }
}

@MainActor @Test("The stand-in's tables: a folded one's rows, a long one's first page and its last (nothing after it), read for the section's period as none; a table that isn't one 404, a cursor it never gave 400")
func standInTables() async throws {
  let (_, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  let s = try await mine.section("nhan-dien-ca")
  let tables = s.blocks.compactMap { if case .table(let t) = $0, t.id != nil { t } else { nil } }
  let folded = try #require(tables.first { $0.folded != nil }), long = try #require(tables.first { $0.folded == "Every request" })
  #expect(folded.id == "t2" && folded.rows.isEmpty && folded.count == 6 && long.id == "t8" && long.rows.isEmpty && long.count == 59)
  // Read for the section's period as it was read: its first, the same as none.
  let rows = try await mine.table("nhan-dien-ca", folded.id!, cursor: nil, period: s.period)
  #expect(same(rows, Owner.Page<[Owner.Link]>(rows: dict(named(#"table: fish ID's folded "Since 7:00, in detail""#)["body"]!))))
  #expect(rows.items.count == folded.count && rows.next == nil)
  let firstPage = try await mine.table("nhan-dien-ca", long.id!, cursor: nil, period: s.period)
  #expect(firstPage.items.count == 50 && firstPage.next == "50")
  #expect(same(firstPage, try await mine.table("nhan-dien-ca", long.id!, cursor: nil, period: nil)))
  let last = try await mine.table("nhan-dien-ca", long.id!, cursor: firstPage.next, period: s.period)
  #expect(last.items.count == long.count! - firstPage.items.count && last.next == nil)
  #expect(await failure { _ = try await mine.table("an-trang", "t9", cursor: nil, period: nil) } == "notFound")
  #expect(await failure { _ = try await mine.table("nhan-dien-ca", "t9", cursor: nil, period: nil) } == "notFound")
  let cursor = refusal(named("a table's cursor that isn't one"))
  #expect(await failure { _ = try await mine.table("affiliate", "t1", cursor: "x", period: nil) } == cursor)
  #expect(await failure { _ = try await mine.table("nhan-dien-ca", long.id!, cursor: "x", period: nil) } == cursor)
}

@MainActor @Test("The stand-in's overview is the vector `overview` names: as usual, with nothing to do, or with the readers' beacon down")
func standInOverview() async throws {
  let (fake, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  #expect(try await mine.dashboard().needs.count == 5)
  fake.owner?.overview = "dashboard: nothing needs you"
  let clear = try await mine.dashboard()
  #expect(clear.needs.isEmpty && clear.needsEmpty == "Nothing needs you right now" && clear.tiles.first?.value == "All clear")
  fake.owner?.overview = "dashboard: the readers' beacon down"
  let down = try await mine.dashboard()
  #expect(same(down, Owner.Dashboard(dict(named("dashboard: the readers' beacon down")["body"]!))))
  #expect(down.needs.map(\.kind).contains("failed") && down.answers?.chart == nil && down.answers?.note != nil)
}

@MainActor @Test("The stand-in's daily report: its email and notifications turned off and on, by the section's buttons or the bell, read back as the Worker answers them; a value that isn't true or false refused")
func standInReportSettings() async throws {
  let (fake, api) = ownerServer()
  let mine = try await api.signedIn("ui-apple")
  func shown() async throws -> (line: String?, buttons: [Owner.Action]) {
    let s = try await mine.section("bao-cao")
    return (s.blocks.compactMap { if case .note(let t, _) = $0, t.hasPrefix("Email:") { t } else { nil } }.first,
            s.blocks.flatMap { b -> [Owner.Action] in if case .actions(let a) = b { a } else { [] } })
  }
  // The bell's two switches: as the section says, both on.
  let bell = try await mine.reportSettings()
  #expect(bell.email && bell.push)
  var now = try await shown()
  #expect(now.line == "Email: on. Phone notifications: on, to 1 phone.")
  #expect(now.buttons.map(\.label) == ["Turn off email", "Turn off notifications"])
  try await mine.run(now.buttons[0])
  now = try await shown()
  #expect(now.line == "Email: off. Phone notifications: on, to 1 phone.")
  #expect(now.buttons.map(\.label) == ["Turn on email", "Turn off notifications"])
  try await mine.run(now.buttons[1])
  now = try await shown()
  #expect(now.line == "Email: off. Phone notifications: off.")
  #expect(now.buttons.map(\.label) == ["Turn on email", "Turn on notifications"])
  try await mine.run(now.buttons[0])
  #expect(try await shown().buttons.map(\.label) == ["Turn off email", "Turn on notifications"])

  // Read as the Worker answers it; turned on, what each is now and whether this request changed it.
  #expect(try await sentAsIs(fake, "GET", "/api/owner/report-settings").1 == named("the report's delivery")["body"])
  let turnOn = named("turn the report's notification on"), on = turnOn["request"]!.object!["body"]!
  let (status, answer) = try await sentAsIs(fake, "POST", "/api/owner/report-settings", on)
  #expect(status == 200 && answer == turnOn["body"])
  #expect(try await sentAsIs(fake, "POST", "/api/owner/report-settings", on).1?.object?["changed"] == .bool(false))
  #expect(try await sentAsIs(fake, "GET", "/api/owner/report-settings").1 == named("the report's delivery, its notification on")["body"])

  // The bell's email switch: off, and the section says so.
  #expect(try await mine.reportEmail(false) == false)
  let off = try await mine.reportSettings()
  #expect(!off.email && off.push)
  #expect(try await shown().line == "Email: off. Phone notifications: on, to 1 phone.")

  // Refused as the Worker refuses: not true or false, nothing named, or something else named.
  // "yes" is a vector's own request, answered as recorded; "no" reaches the stand-in's own check.
  let said = refusal(named("a report setting that isn't true or false"))
  #expect(said == "\(OwnerError.refused("bad_request", message: "email and/or push (true or false)."))")
  let bad: [[String: Any]] = [["push": "yes"], ["push": "no"], [:], ["sms": true]]
  for b in bad {
    let refused = await failure { try await mine.run(Owner.Action(label: "x", method: "POST", path: "/api/owner/report-settings", body: b)) }
    #expect(refused == said, "\(b)")
  }
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
  #expect(await failure { _ = try await mine.section("doc-gia") } == refusal(named("storage down")))
  #expect(try await mine.section("doc-gia").title == "Readers")
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

// MARK: Who sees the dashboard (OwnerAccess)

/// The account the app has signed in, as OwnerAccess asks for it, and how many times a reply signed it out.
@MainActor final class Who {
  var now: (id: String, token: String)?
  var ends = 0
  init(_ id: String) { now = (id, "token-" + id) }
}

@MainActor func access(_ who: Who, _ store: UserDefaults, _ send: @escaping Send) -> OwnerAccess {
  OwnerAccess(send: send, defaults: store, session: { who.now }, ended: { who.ends += 1; who.now = nil })
}
func store() -> UserDefaults { UserDefaults(suiteName: "owner-tests-\(UUID())")! }
let dashboardReply = text(ownerReplies.first { $0["name"]?.string == "dashboard" }!["body"]!)
let notTheOwner = #"{"error":"not_found"}"#

@MainActor @Test("Not the owner only on the Worker's 404: remembered across a launch, forgotten at a sign-out, another account, or any 200")
func notTheOwnerIsRemembered() async throws {
  let defaults = store(), who = Who("acct-a")
  // A 404 that isn't the Worker's (a page in front of it, a path not deployed yet): nothing known, asked again next time.
  let stub = Stub([(404, "<html>Not Found</html>"), (404, notTheOwner)])
  let a = access(who, defaults) { try await stub.send($0) }
  await a.check()
  #expect(a.isOwner == nil && defaults.string(forKey: OwnerAccess.notOwner) == nil)
  await a.check()
  #expect(a.isOwner == false && defaults.string(forKey: OwnerAccess.notOwner) == "acct-a")
  #expect(await stub.requests.count == 2)

  // A launch later, the same account: not asked again.
  let quiet = Stub([])
  let b = access(who, defaults) { try await quiet.send($0) }
  await b.check()
  let asked = await quiet.requests
  #expect(b.isOwner == false && asked.isEmpty)
  // Signed out: forgotten.
  who.now = nil
  await b.check()
  #expect(b.isOwner == nil && defaults.string(forKey: OwnerAccess.notOwner) == nil)

  // Another account signs in: forgotten, and that one is asked.
  defaults.set("acct-a", forKey: OwnerAccess.notOwner)
  who.now = ("acct-b", "token-b")
  let owners = Stub([(200, dashboardReply)])
  let c = access(who, defaults) { try await owners.send($0) }
  await c.check()
  #expect(c.isOwner == true && defaults.string(forKey: OwnerAccess.notOwner) == nil)

  // Remembered, then any 200 for that account: the owner's after all.
  defaults.set("acct-a", forKey: OwnerAccess.notOwner)
  who.now = ("acct-a", "token-a")
  let later = Stub([(200, dashboardReply)])
  let d = access(who, defaults) { try await later.send($0) }
  await d.check()
  #expect(d.isOwner == false)
  try await d.overview()
  #expect(d.isOwner == true && defaults.string(forKey: OwnerAccess.notOwner) == nil)
}

@MainActor @Test("A section's or a button's 404 asks the overview again, and the overview decides")
func aSectionsNotFoundAsksAgain() async throws {
  let who = Who("acct-a")
  let stub = Stub([(200, dashboardReply), (404, notTheOwner), (200, dashboardReply), (404, notTheOwner), (404, notTheOwner)])
  let a = access(who, store()) { try await stub.send($0) }
  await a.check()
  #expect(a.isOwner == true)
  // A section gone: the overview still answers, so the owner stays.
  await #expect(throws: OwnerError.self) { try await a.ask { try await $0.section("da-bo") } }
  await a.failed(OwnerError.notFound, overview: false)
  #expect(a.isOwner == true && a.dashboard != nil)
  // A button's 404, and the overview's too: not the owner any more.
  await #expect(throws: OwnerError.self) { try await a.ask { try await $0.run(Owner.Action(label: "x", method: "POST", path: "/api/owner/hidden")) } }
  await a.failed(OwnerError.notFound, overview: false)
  #expect(a.isOwner == false && a.dashboard == nil)
  #expect(await stub.requests.map { $0.url!.path } == ["/api/owner/dashboard", "/api/owner/sections/da-bo", "/api/owner/dashboard", "/api/owner/hidden",
                                                         "/api/owner/dashboard"])
}

@MainActor @Test("Another account signed in: the owner's overview, photos and answer go, and screens are told (era)")
func anotherAccountClearsEverything() async throws {
  let who = Who("acct-a")
  let stub = Stub([(200, dashboardReply)])
  let a = access(who, store()) { try await stub.send($0) }
  await a.check()
  a.pictures.setObject(NSData(), forKey: "/_ab/anh/p")
  #expect(a.isOwner == true && a.dashboard != nil)
  let era = a.era
  // The other account's check doesn't get through: what it would answer can't hide what was kept.
  await stub.failing(URLError(.notConnectedToInternet))
  who.now = ("acct-b", "token-b")
  await a.check()
  #expect(a.isOwner == nil && a.dashboard == nil && a.pictures.object(forKey: "/_ab/anh/p") == nil && a.era > era)
}

@MainActor @Test("A 401 signs the account out once, drops what was read, and keeps the row until an account signs in")
func aSessionThatEnded() async throws {
  let who = Who("acct-a")
  let stub = Stub([(200, dashboardReply), (401, #"{"error":"signed_out"}"#)])
  let a = access(who, store()) { try await stub.send($0) }
  await a.check()
  a.pictures.setObject(NSData(), forKey: "/_ab/anh/p")
  do { _ = try await a.ask { try await $0.section("doc-gia") } } catch { await a.failed(error, overview: false) }
  #expect(who.ends == 1 && who.now == nil)
  #expect(a.sessionEnded && a.isOwner == true && a.dashboard == nil && a.pictures.object(forKey: "/_ab/anh/p") == nil)
  // The check after the sign-out keeps the row.
  await a.check()
  #expect(a.sessionEnded && a.isOwner == true)
  // Signed in again, the same account: the row as before, not asked again.
  who.now = ("acct-a", "token-a2")
  await a.check()
  let sent = await stub.requests
  #expect(!a.sessionEnded && a.isOwner == true && sent.count == 2)
}

@MainActor @Test("An answer that comes after the session changed is dropped: it never makes the owner, and never signs anyone out")
func aLateAnswerIsDropped() async throws {
  let who = Who("acct-a")
  // The reply to the first account's request, arriving once another has signed in.
  let late = { (status: Int, body: String) -> Send in
    { r in
      await MainActor.run { who.now = ("acct-b", "token-b") }
      return (Data(body.utf8), HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
  }
  let a = access(who, store(), late(200, dashboardReply))
  await a.check()
  #expect(a.isOwner == nil && a.dashboard == nil)
  who.now = ("acct-a", "token-a")
  let b = access(who, store(), late(401, #"{"error":"signed_out"}"#))
  await b.check()
  #expect(who.ends == 0 && !b.sessionEnded && who.now?.id == "acct-b")
  who.now = ("acct-a", "token-a")
  let c = access(who, store(), late(404, notTheOwner))
  await c.check()
  #expect(c.isOwner == nil)
}

/// A section's own buttons (`actions`, the report's settings): each read as a button's request, with its body; one whose
/// path isn't the owner's, or with no label, is left out, and a block left with none is no block.
@Test func aSectionsOwnButtonsAreReadAsAButtonsRequest() throws {
  let section = Owner.Section(dict(.object(["key": .string("bao-cao"), "title": .string("Báo cáo"), "blocks": .array([
    .object(["kind": .string("note"), "text": .string("Email: bật. Thông báo: tắt."), "tone": .string("plain")]),
    .object(["kind": .string("actions"), "actions": .array([
      .object(["label": .string("Tắt email"), "method": .string("POST"), "path": .string("/api/owner/report-settings"),
               "body": .object(["email": .bool(false)])]),
      .object(["label": .string("Bật thông báo"), "method": .string("POST"), "path": .string("/api/owner/report-settings"),
               "body": .object(["push": .bool(true)]), "tone": .string("good")]),
      .object(["label": .string("Ra ngoài"), "method": .string("POST"), "path": .string("/api/other")]),
      .object(["method": .string("POST"), "path": .string("/api/owner/report-settings")]),
    ])]),
    .object(["kind": .string("actions"), "actions": .array([.object(["label": .string("Ra ngoài"), "method": .string("POST"), "path": .string("https://x/")])])]),
  ])])))
  #expect(section.blocks.count == 2)
  guard case .actions(let a)? = section.blocks.last else { Issue.record("no buttons"); return }
  #expect(a.map(\.label) == ["Tắt email", "Bật thông báo"])
  #expect(a.allSatisfy { $0.method == "POST" && $0.path == "/api/owner/report-settings" })
  #expect(a.map(\.body) == [#"{"email":false}"#, #"{"push":true}"#])
}
