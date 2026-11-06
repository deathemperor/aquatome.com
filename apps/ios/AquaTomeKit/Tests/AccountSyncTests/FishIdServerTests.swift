import Foundation
import Testing
@testable import AccountSync
import Tanks

// protocols/fishid.openapi.json: the fish-ID tool the stand-in serves, held to the contract as the site's tests hold the
// Worker to it (apps/site/worker/test/contract.ts): every answer's status is one the contract lists, its body has the
// contract's shape, and an error's code is one the status names.
nonisolated(unsafe) let fishIdContract: [String: Any] = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSONSerialization.jsonObject(with: Data(contentsOf: url.appendingPathComponent("protocols/fishid.openapi.json"))) as! [String: Any]
}()

/// What in `v` the schema refuses: none when it conforms (contract.ts `misfits`).
func misfits(_ v: Any, _ schema: [String: Any], in api: [String: Any], at: String = "$") -> [String] {
  var s = schema
  while let ref = s["$ref"] as? String {
    s = ref.dropFirst(2).split(separator: "/").reduce(api as Any) { ($0 as? [String: Any])?[String($1)] as Any } as? [String: Any] ?? [:]
  }
  var out: [String] = []
  let types = (s["type"] as? [String]) ?? (s["type"] as? String).map { [$0] } ?? []
  if v is NSNull && types.contains("null") { return out }
  if let c = s["const"], !(c as AnyObject).isEqual(v) { out.append("\(at): \(v) is not \(c)") }
  if let e = s["enum"] as? [AnyObject], !e.contains(where: { $0.isEqual(v) }) { out.append("\(at): \(v) is not one of \(e)") }
  // JSONSerialization reads true and false as numbers too: a boolean is told by its own class.
  let isBool = (v as? NSNumber).map { CFGetTypeID($0) == CFBooleanGetTypeID() } ?? false
  switch types.first(where: { $0 != "null" }) {
  case "object":
    guard let o = v as? [String: Any] else { return out + ["\(at): not an object"] }
    let props = s["properties"] as? [String: [String: Any]] ?? [:]
    for k in s["required"] as? [String] ?? [] where o[k] == nil { out.append("\(at).\(k): missing") }
    for (k, p) in props { if let x = o[k] { out += misfits(x, p, in: api, at: "\(at).\(k)") } }
    if s["additionalProperties"] as? Bool == false { for k in o.keys where props[k] == nil { out.append("\(at).\(k): not allowed") } }
  case "array":
    guard let a = v as? [Any] else { return out + ["\(at): not an array"] }
    for (i, x) in a.enumerated() { out += misfits(x, s["items"] as? [String: Any] ?? [:], in: api, at: "\(at)[\(i)]") }
  case "string":
    if !(v is String) { out.append("\(at): not a string") }
  case "integer":
    if isBool || (v as? NSNumber).map({ $0.doubleValue.rounded() != $0.doubleValue || $0.doubleValue < (s["minimum"] as? Double ?? -.infinity) }) ?? true {
      out.append("\(at): not an integer")
    }
  case "number":
    if isBool || (v as? NSNumber).map({ $0.doubleValue < (s["minimum"] as? Double ?? -.infinity) }) ?? true { out.append("\(at): not a number") }
  case "boolean":
    if !isBool { out.append("\(at): not a boolean") }
  default: break
  }
  return out
}

/// The stand-in's answer to `r`, checked against the contract: its status and body.
@MainActor func fishId(_ fake: FakeAccounts, _ r: URLRequest) async throws -> (Int, [String: Any]) {
  let (data, res) = try await fake.send(r)
  let body = try #require(try JSONSerialization.jsonObject(with: data) as? [String: Any], "\(res.statusCode) isn't JSON")
  let op = try #require(((fishIdContract["paths"] as? [String: Any])?["/api/fish-id"] as? [String: Any])?[r.httpMethod!.lowercased()] as? [String: Any])
  let answer = try #require((op["responses"] as? [String: Any])?[String(res.statusCode)] as? [String: Any], "\(res.statusCode) \(body) is not in the contract")
  let schema = ((answer["content"] as? [String: Any])?["application/json"] as? [String: Any])?["schema"] as? [String: Any] ?? [:]
  #expect(misfits(body, schema, in: fishIdContract) == [], "\(res.statusCode) \(body)")
  if res.statusCode >= 400 {
    let codes = (answer["description"] as! String).replacing("Error: ", with: "").components(separatedBy: " | ").map { $0.replacing(#/ \(.*\)$/#, with: "") }
    #expect(codes.contains(body["error"] as? String ?? ""), "\(res.statusCode) \(body)")
  }
  return (res.statusCode, body)
}

/// A photo sent the app's way (a bearer) or the page's (none), as a form with `fields` and a file part.
func identify(token: String?, fields: [String: String] = ["lang": "vi", "from": "page"], file: Data?, filename: String? = "photo.jpg", origin: String? = nil) -> URLRequest {
  var r = URLRequest(url: URL(string: "https://aquatome.com/api/fish-id")!)
  r.httpMethod = "POST"
  if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
  if let origin { r.setValue(origin, forHTTPHeaderField: "Origin") }
  r.setValue("multipart/form-data; boundary=B", forHTTPHeaderField: "Content-Type")
  var body = Data(fields.map { "--B\r\nContent-Disposition: form-data; name=\"\($0.key)\"\r\n\r\n\($0.value)\r\n" }.joined().utf8)
  if let file {
    body += Data("--B\r\nContent-Disposition: form-data; name=\"file\"\(filename.map { "; filename=\"\($0)\"\r\nContent-Type: image/jpeg" } ?? "")\r\n\r\n".utf8)
    body += file + Data("\r\n".utf8)
  }
  r.httpBody = body + Data("--B--\r\n".utf8)
  return r
}

private let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10]) + Data("JFIF".utf8)

@MainActor @Test("The fish-ID stand-in answers as the Worker does, by the contract: the tool's state, an identification as the account, then each refusal in the Worker's order")
func fishIdStandIn() async throws {
  let fake = FakeAccounts()
  let s = try await signIn(client(fake), "apple-1")
  let get = URLRequest(url: URL(string: "https://aquatome.com/api/fish-id")!)
  let (_, status) = try await fishId(fake, get)
  #expect(status["on"] as? Bool == true && status["perAccount"] as? Int == 10 && status["resting"] as? Bool == false)

  let (code, found) = try await fishId(fake, identify(token: s.token, file: jpeg))
  #expect(code == 200 && found["verdict"] as? String == "fish")
  let first = try #require((found["results"] as? [[String: Any]])?.first)
  #expect((first["page"] as? [String: Any])?["url"] as? String == "/vi/ca/ca-neon/")
  #expect(fake.identifications.map(\.account) == ["apple-1"] && fake.identifications[0].fields["lang"] == "vi")

  // A bearer gone is refused before anything else, even with a Turnstile token: never the page's way.
  #expect(try await fishId(fake, identify(token: "gone", fields: ["token": "t"], file: jpeg)).1["error"] as? String == "session")
  #expect(try await fishId(fake, identify(token: "", file: jpeg)).1["error"] as? String == "session")
  // The page's way: same-origin, with a Turnstile token.
  #expect(try await fishId(fake, identify(token: nil, file: jpeg, origin: "https://evil.example")).1["error"] as? String == "cross-origin")
  #expect(try await fishId(fake, identify(token: nil, file: jpeg)).1["error"] as? String == "turnstile")
  #expect(try await fishId(fake, identify(token: nil, fields: ["token": "t"], file: jpeg)).0 == 200)
  // The form.
  #expect(try await fishId(fake, identify(token: s.token, file: nil)).1["error"] as? String == "no file")
  #expect(try await fishId(fake, identify(token: s.token, file: jpeg, filename: nil)).1["error"] as? String == "no file", "a part with no filename isn't a file")
  #expect(try await fishId(fake, identify(token: s.token, file: Data("jpeg".utf8))).1["error"] as? String == "not an image")
  #expect(try await fishId(fake, identify(token: s.token, file: jpeg + Data(count: 1_600_000))).0 == 413)

  // The account's day, then the site's, then the keys: each only once the one before it lets the photo through.
  fake.fishIdUsedBefore = 9
  let (limited, rate) = try await fishId(fake, identify(token: s.token, file: jpeg))
  #expect(limited == 429 && rate["error"] as? String == "rate" && rate["limit"] as? Int == 10)
  let other = try await signIn(client(fake), "apple-2")
  fake.fishIdSiteLeft = 0
  #expect(try await fishId(fake, identify(token: other.token, file: jpeg)).1["error"] as? String == "busy")
  fake.fishIdSiteLeft = 5
  fake.fishIdResting = true
  #expect(try await fishId(fake, identify(token: other.token, file: jpeg)).1["error"] as? String == "resting")
  #expect(try await fishId(fake, get).1["resting"] as? Bool == true)
  fake.fishIdResting = false
  #expect(try await fishId(fake, identify(token: other.token, file: jpeg)).0 == 200, "another account on the same day")
  fake.fishIdOn = false
  #expect(try await fishId(fake, identify(token: other.token, file: jpeg)).1["error"] as? String == "fish_id_off")
  #expect(try await fishId(fake, get).1.keys.sorted() == ["on"])
}

@MainActor @Test("Every kind of identification the Worker gives, as the stand-in can be set to answer, has the contract's shape")
func fishIdAnswersHaveTheContractsShape() async throws {
  let fake = FakeAccounts()
  let s = try await signIn(client(fake), "apple-1")
  let breed: [String: JSON] = ["scientificName": .string("Betta splendens"), "commonName": .string("Betta"), "variety": .string("Halfmoon"),
                               "confidence": .number(0.8), "reason": .string("Vây."),
                               "page": .object(["id": .string("betta-halfmoon"), "kind": .string("breed"), "name": .string("Betta halfmoon")]),
                               "species": .object(["id": .string("betta-splendens"), "kind": .string("species"), "name": .string("Cá betta"), "url": .string("/vi/ca/ca-betta/")])]
  let answers: [[String: JSON]] = [
    FakeAccounts.fishIdGuesses(photo: "1×1"),
    ["verdict": .string("other"), "results": .array([]), "model": .string("m")],
    ["verdict": .string("unclear"), "results": .array([]), "refused": .bool(true), "model": .string("m")],
    ["verdict": .string("fish"), "results": .array([.object(breed)]), "model": .string("m")],
  ]
  for a in answers {
    fake.fishIdAnswer = { _ in a }
    #expect(try await fishId(fake, identify(token: s.token, file: jpeg)).0 == 200)
  }
  // And the checker catches what the contract refuses.
  let schema = ["$ref": "#/components/schemas/Identification"]
  #expect(!misfits(["verdict": "maybe", "results": [], "model": "m"], schema, in: fishIdContract).isEmpty)
  #expect(!misfits(["verdict": "fish", "results": [["scientificName": "X"]], "model": "m"], schema, in: fishIdContract).isEmpty)
  #expect(!misfits(["verdict": "fish", "results": [], "model": "m", "extra": 1], schema, in: fishIdContract).isEmpty)
  #expect(!misfits(["verdict": "unclear", "results": [], "model": "m", "refused": false], schema, in: fishIdContract).isEmpty)
}
