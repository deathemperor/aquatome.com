import Foundation
import Testing
@testable import Telemetry

// protocols/app-telemetry.openapi.json, the contract the Worker validates against (apps/site/worker/telemetry): what
// the app sends fits it, and what the app refuses to send is what it refuses. A change on either side that the other
// doesn't follow fails here, not as events dropped in production.

nonisolated(unsafe) private let api: [String: Any] = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSONSerialization.jsonObject(with: Data(contentsOf: url.appendingPathComponent("protocols/app-telemetry.openapi.json"))) as! [String: Any]
}()

private func schema(_ name: String) -> [String: Any] { ((api["components"] as! [String: Any])["schemas"] as! [String: Any])[name] as! [String: Any] }

private func resolve(_ s: [String: Any]) -> [String: Any] {
  guard let ref = s["$ref"] as? String else { return s }
  return resolve(ref.dropFirst(2).split(separator: "/").reduce(api as Any) { ($0 as! [String: Any])[String($1)]! } as! [String: Any])
}

private func isBool(_ v: Any) -> Bool { (v as? NSNumber).map { CFGetTypeID($0) == CFBooleanGetTypeID() } ?? false }
private func isInt(_ v: Any) -> Bool { !isBool(v) && (v as? NSNumber).map { $0.doubleValue == $0.doubleValue.rounded() } ?? false }

/// What in `v` the schema refuses: none when it fits. The parts of JSON Schema the contract uses, as the Worker's own
/// tests read them (apps/site/worker/test/contract.ts).
private func misfits(_ v: Any, _ s: [String: Any], at: String = "$") -> [String] {
  let s = resolve(s)
  var out: [String] = []
  if let one = s["oneOf"] as? [[String: Any]] {
    let fits = one.filter { misfits(v, $0, at: at).isEmpty }.count
    if fits != 1 { out.append("\(at): fits \(fits) of oneOf's \(one.count), not 1") }
  }
  if let c = s["const"] as? String, v as? String != c { out.append("\(at): not \(c)") }
  if let e = s["enum"] as? [Any], !e.contains(where: { ($0 as? NSObject)?.isEqual(v) == true }) { out.append("\(at): \(v) not in \(e)") }
  switch s["type"] as? String {
  case "object":
    guard let o = v as? [String: Any] else { return out + ["\(at): not an object"] }
    let props = s["properties"] as? [String: [String: Any]] ?? [:]
    for k in s["required"] as? [String] ?? [] where o[k] == nil { out.append("\(at).\(k): missing") }
    for (k, p) in props { if let x = o[k] { out += misfits(x, p, at: "\(at).\(k)") } }
    if s["additionalProperties"] as? Bool == false { for k in o.keys where props[k] == nil { out.append("\(at).\(k): not allowed") } }
  case "array":
    guard let a = v as? [Any] else { return out + ["\(at): not an array"] }
    if a.count < s["minItems"] as? Int ?? 0 || a.count > s["maxItems"] as? Int ?? .max { out.append("\(at): \(a.count) items") }
    for (i, x) in a.enumerated() { out += misfits(x, s["items"] as? [String: Any] ?? [:], at: "\(at)[\(i)]") }
  case "string":
    guard let str = v as? String else { return out + ["\(at): not a string"] }
    let n = str.utf16.count
    if n < s["minLength"] as? Int ?? 0 || n > s["maxLength"] as? Int ?? .max { out.append("\(at): length \(n)") }
    if let p = s["pattern"] as? String, (try! NSRegularExpression(pattern: p)).firstMatch(in: str, range: NSRange(str.startIndex..., in: str)) == nil {
      out.append("\(at): \(str) doesn't match \(p)")
    }
  case "integer":
    guard isInt(v), let n = (v as? NSNumber)?.intValue else { return out + ["\(at): not an integer"] }
    if n < s["minimum"] as? Int ?? .min || n > s["maximum"] as? Int ?? .max { out.append("\(at): \(n) out of range") }
  case "boolean":
    if !isBool(v) { out.append("\(at): not a boolean") }
  default: break
  }
  return out
}

private func json(_ d: Data) -> Any { try! JSONSerialization.jsonObject(with: d) }
private func json(_ e: Event) -> Any { json(try! JSONEncoder().encode(e)) }

private let about = About(app: "1.0 (114)", os: "26.5", device: "iPhone18,3", lang: "vi")
private let session = "6f1c9a52-6d0e-4a8e-9a43-0f5a1d2c3b4e"
private let neon = "/vi/huong-dan/nuoi-ca-neon/"

/// Every kind of event the app sends, as its hooks make them.
private let sent: [Event] = [.view(path: neon), .view(path: "/th/"), .scroll(path: neon, depth: 50), .scroll(path: neon, depth: 90)]
  + Screen.allCases.map { Event.view($0) } + Event.times.map { Event.time(path: neon, seconds: $0) }
  + [.aff(path: neon, link: URL(string: "https://aquatome.com/go/shopee/?k=c%C3%A1%20neon&c=fish")!)!,
     .aff(path: neon, link: URL(string: "https://aquatome.com/go/lazada/?k=ca(neon)/1:2")!)!,
     .aff(path: neon, link: URL(string: "https://aquatome.com/go/tiki")!)!]
  + Action.allCases.flatMap { [Event.action($0, ok: true), .action($0, ok: false, kind: "timeout"), .action($0, refused: "rate_limited")] }
  + [.action(.lightConnect, error: CocoaError(.fileNoSuchFile)), .action(.fishID, ok: true, kind: "betta-splendens")]

@Test("Batches of every event the app sends fit the contract's Batch, and a report its Report")
func sentFitsTheContract() {
  for e in sent { #expect(e.fits, "\(e)") }
  var b = Batch(about, session: session, events: sent)
  for i in b.events.indices { b.events[i].at = 1000 * i }
  #expect(misfits(json(Wire.body(b)), schema("Batch")) == [])
  // A batch at its limits: 100 events, the latest `at`.
  b.events = Array(repeating: .view(path: neon), count: Wire.batchSize)
  b.events[99].at = Event.maxAt
  #expect(misfits(json(Wire.body(b)), schema("Batch")) == [])

  let payload = #"{"appVersion":"1.0","metaData":{"appBuildVersion":"114","osVersion":"iPhone OS 26.5"},"cpuMetrics":{"cumulativeCPUTime":"12 sec"}}"#
  for kind in [Diagnostic.Kind.metric, .diagnostic] {
    let body = Wire.body(Diagnostic(kind: kind, about: about, payload: payload))
    #expect(misfits(json(body), schema("Report")) == [])
  }
}

@Test("What the app refuses to send is what the contract refuses: each event, and the batch's fields made to fit")
func refusesWhatTheContractRefuses() {
  var late = Event.view(path: neon)
  late.at = Event.maxAt + 1
  let candidates: [Event] = sent + [
    .view(path: "/vi/tim/?q=ca+dia"), .view(path: "/en/fish/"), .view(path: "/vi/ca/ca-neon"), .view(path: "vi/ca/"), .view(path: "/vi//"),
    .view(path: "/vi/cá/"), .view(path: "/vi/" + String(repeating: "a", count: 196) + "/"), .view(path: "/vi/" + String(repeating: "a", count: 195) + "/"),
    .scroll(path: neon, depth: 25), .scroll(path: neon, depth: 100), .scroll(path: "/en/", depth: 50),
    .time(path: neon, seconds: 45), .time(path: neon, seconds: 0), late,
    .action(.plugSwitch, ok: false, kind: "DYSL30A1B2C3 không trả lời"), .action(.plugSwitch, ok: false, kind: String(repeating: "a", count: 41)),
    .action(.plugSwitch, ok: false, kind: "plugOffline"), .action(.lightConnect, ok: false, kind: "-x"),
  ]
  for e in candidates {
    let refused = misfits(json(e), schema("Event"))
    #expect(e.fits == refused.isEmpty, "\(e): the app says \(e.fits ? "send" : "don't send"), the contract says \(refused)")
  }
  // The batch's own fields: whatever the phone says, made to fit (else the Worker refuses the whole batch).
  for a in [about, About(app: "1.0 beta", os: "26.5 (23F77)", device: "iPhone 17", lang: "en"), About(app: "12.3.4.5 (123456789)", os: "1", device: "arm64", lang: "th")] {
    let b = Batch(a, session: session, events: [.view(path: neon)])
    #expect(misfits(json(Wire.body(b)), schema("Batch")) == [], "\(a)")
  }
  #expect(About(app: "1.0 beta", os: "x", device: "iPhone 17", lang: "en") == About(app: "0 (0)", os: "0", device: "unknown", lang: "vi"))
}

@Test("The app's own lists are the contract's: fields, action names, marks, languages, limits")
func listsAreTheContracts() {
  func props(_ name: String) -> Set<String> { Set((resolve(schema(name))["properties"] as! [String: Any]).keys) }
  #expect(Wire.batchFields == props("Batch"))
  #expect(Wire.diagnosticFields == props("Report"))
  let kinds = ["PageView", "ScreenView", "Scroll", "Time", "ShopTap", "Action"]
  #expect(Wire.eventFields == kinds.reduce(Set()) { $0.union(props($1)) })
  func values(_ name: String, _ field: String) -> [AnyHashable] { ((schema(name)["properties"] as! [String: Any])[field] as! [String: Any])["enum"] as! [AnyHashable] }
  #expect(Set(values("Action", "name")) == Set(Action.allCases.map(\.rawValue)))
  #expect(values("Scroll", "depth") as? [Int] == Event.depths)
  #expect(values("Time", "seconds") as? [Int] == Event.times)
  #expect(values("Batch", "lang") == ["vi", "id", "th"])
  #expect(Set(values("Report", "kind")) == ["metric", "diagnostic"])
  let events = (schema("Batch")["properties"] as! [String: Any])["events"] as! [String: Any]
  #expect(events["maxItems"] as? Int == Wire.batchSize)
  #expect(schema("At")["maximum"] as? Int == Event.maxAt)
  for s in Screen.allCases { #expect(misfits(s.rawValue, ((schema("ScreenView")["properties"] as! [String: Any])["screen"] as! [String: Any])) == []) }
  // The flag: a boolean at the top of /app/<lang>.json.
  #expect(((schema("AppConfig")["properties"] as! [String: Any])["telemetry"] as! [String: Any])["type"] as? String == "boolean")
}
