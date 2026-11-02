import Foundation
import ImageIO
import Testing
@testable import Handbook

// protocols/talk.openapi.json: the contract the site's Worker serves for readers' comments and photos.
nonisolated(unsafe) private let contract: [String: Any] = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSONSerialization.jsonObject(with: Data(contentsOf: url.appendingPathComponent("protocols/talk.openapi.json"))) as! [String: Any]
}()
private func schema(_ name: String) -> [String: Any] {
  ((contract["components"] as! [String: Any])["schemas"] as! [String: Any])[name] as! [String: Any]
}
private func statuses(_ path: String, _ method: String) -> Set<Int> {
  let op = ((contract["paths"] as! [String: Any])[path] as! [String: Any])[method] as! [String: Any]
  return Set((op["responses"] as! [String: Any]).keys.compactMap { Int($0) })
}
private let site = URL(string: "https://aquatome.com")!

@Test func aCommentIsPostedAsTheAccountWithTheFieldsTheContractTakesAndNoTurnstileToken() throws {
  let r = Readers.post(comment: "id:species:betta-splendens", name: "Lan", body: "Nuôi đàn 10 con.", site: site, token: "tok", version: "1.4")
  #expect(r.httpMethod == "POST" && r.url?.absoluteString == "https://aquatome.com/_c")
  #expect(r.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
  #expect(r.value(forHTTPHeaderField: "User-Agent") == "AquaTome-iOS/1.4")
  #expect(r.value(forHTTPHeaderField: "Content-Type") == "application/json" && !r.httpShouldHandleCookies)
  let data = try #require(r.httpBody)
  let body = try #require(try JSONSerialization.jsonObject(with: data) as? [String: String])
  #expect(body == ["e": "id:species:betta-splendens", "name": "Lan", "body": "Nuôi đàn 10 con."])
  let s = schema("NewComment")
  #expect(Set(s["required"] as! [String]) == Set(body.keys))
  #expect(Set(body.keys).isSubset(of: (s["properties"] as! [String: Any]).keys) && body["token"] == nil)
}

@Test func aPhotoIsSentAsTheAccountAsTheFormTheContractTakesWithConsentAndNoTurnstileToken() throws {
  let jpeg = Data([0xFF, 0xD8, 0xFF, 0xD9])
  let r = Readers.post(photo: "species:betta-splendens", name: "Lan", consent: true, jpeg: jpeg, site: site, token: "tok", version: "1.4", boundary: "B")
  #expect(r.httpMethod == "POST" && r.url?.absoluteString == "https://aquatome.com/_p")
  #expect(r.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
  #expect(r.value(forHTTPHeaderField: "Content-Type") == "multipart/form-data; boundary=B")
  // The form's fields, by name, as a server reads them.
  let body = try #require(r.httpBody)
  var fields: [String: Data] = [:]
  var heads: [String: String] = [:]
  for part in body.split(separator: Data("--B".utf8)).dropLast() {
    guard let head = part.range(of: Data("\r\n\r\n".utf8)), let h = String(data: part[..<head.lowerBound], encoding: .utf8),
          let name = h.firstMatch(of: /name="([^"]+)"/)?.1 else { continue }
    fields[String(name)] = part[head.upperBound...].dropLast(2)
    heads[String(name)] = h
  }
  // A file only as a part with a filename and its type: the Worker reads no other part as one.
  #expect(heads["file"]?.contains(#"filename="photo.jpg""#) == true && heads["file"]?.contains("Content-Type: image/jpeg") == true, "\(heads)")
  #expect(fields.mapValues { String(decoding: $0, as: UTF8.self) }.filter { $0.key != "file" } == ["e": "species:betta-splendens", "name": "Lan", "consent": "1"])
  #expect(fields["file"] == jpeg)
  let s = schema("NewPhoto")
  #expect(Set(s["required"] as! [String]) == Set(fields.keys) && fields["token"] == nil)
  // Not given: not sent, as the site's form leaves out a box not ticked.
  let without = Readers.post(photo: "species:betta-splendens", name: "Lan", consent: false, jpeg: jpeg, site: site, token: "tok", version: "1.4", boundary: "B")
  let sent = String(decoding: try #require(without.httpBody), as: UTF8.self)
  #expect(!sent.contains(#"name="consent""#) && sent.contains(#"name="file""#))
}

@Test func whatTheWorkerRefusesUnreadIsToldBeforeSendingCountedAsItCounts() {
  #expect(Readers.refusal(comment: "Lan", body: "Ổn") == nil)
  #expect(Readers.refusal(comment: "  ", body: "Nuôi đàn 10 con.") == "name must be 1–40 characters")
  #expect(Readers.refusal(comment: String(repeating: "a", count: 41), body: "Nuôi đàn.") == "name must be 1–40 characters")
  #expect(Readers.refusal(comment: "Lan", body: " a ") == "comment must be 2–2000 characters")
  #expect(Readers.refusal(comment: "Lan", body: String(repeating: "ạ", count: 2000)) == nil)
  // JavaScript's length: a fish emoji is two units, so 1001 of them are 2002, one too many.
  #expect(Readers.refusal(comment: "Lan", body: String(repeating: "🐟", count: 1000)) == nil)
  #expect(Readers.refusal(comment: "Lan", body: String(repeating: "🐟", count: 1001)) == "comment must be 2–2000 characters")
  #expect(Readers.refusal(comment: String(repeating: "🐟", count: 21), body: "Nuôi đàn.") == "name must be 1–40 characters")
  #expect(Readers.refusal(photoName: "Lan") == nil)
  #expect(Readers.refusal(photoName: " ") == "bad name")
  #expect(Readers.refusal(photoName: "<b>Lan</b>") == "bad name")
  #expect(Readers.refusal(photoName: String(repeating: "a", count: 41)) == "bad name")
}

@Test func eachAnswerToAPostIsReadAsTheContractWritesIt() {
  let a = { (status: Int, json: String) in Readers.answer(Data(json.utf8), status: status) }
  let shown = a(201, #"{"status":"approved","comment":{"id":"c9","name":"Lan","body":"Ổn.","helpful":false,"createdAt":"2026-11-02T10:00:00.000Z"}}"#)
  guard case let .shown(c) = shown else { Issue.record("\(shown)"); return }
  #expect(c.id == "c9" && c.body == "Ổn.")
  #expect(a(201, #"{"status":"held"}"#) == .held)
  #expect(a(201, #"{"status":"pending","id":"p9","deleteUrl":"/_p/xoa/?id=p9&t=x"}"#) == .received(delete: "/_p/xoa/?id=p9&t=x"))
  #expect(a(401, #"{"error":"session"}"#) == .signedOut)
  #expect(a(429, #"{"error":"rate"}"#) == .refused("rate"))
  #expect(a(400, #"{"error":"bad name"}"#) == .refused("bad name"))
  #expect(a(502, "<html>") == .refused("failed"))
  // Every status read here is one the contract gives each post.
  for path in ["/_c", "/_p"] { #expect(statuses(path, "post").isSuperset(of: [201, 400, 401, 503]), "\(path)") }
  #expect(statuses("/_p", "post").contains(429))
}

@Test func aPhotoIsSentNoLargerThanTheSitesAndWithoutItsLocationOrCamera() throws {
  // A 3000 × 1500 photo with a GPS position and a camera, as a phone takes one.
  let ctx = try #require(CGContext(data: nil, width: 3000, height: 1500, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
  ctx.setFillColor(CGColor(red: 0.2, green: 0.5, blue: 0.3, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: 3000, height: 1500))
  let original = NSMutableData()
  let dest = try #require(CGImageDestinationCreateWithData(original, "public.jpeg" as CFString, 1, nil))
  CGImageDestinationAddImage(dest, try #require(ctx.makeImage()), [
    kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 10.77, kCGImagePropertyGPSLatitudeRef: "N", kCGImagePropertyGPSLongitude: 106.7, kCGImagePropertyGPSLongitudeRef: "E"],
    kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFMake: "Phone", kCGImagePropertyTIFFModel: "Camera"],
  ] as CFDictionary)
  #expect(CGImageDestinationFinalize(dest))
  let props = { (d: Data) in CGImageSourceCopyPropertiesAtIndex(CGImageSourceCreateWithData(d as CFData, nil)!, 0, nil) as! [CFString: Any] }
  #expect(props(original as Data)[kCGImagePropertyGPSDictionary] != nil, "the stand-in photo has no position to take out")
  let sent = try #require(Readers.shrink(original as Data))
  let p = props(sent)
  #expect(p[kCGImagePropertyPixelWidth] as? Int == 2000 && p[kCGImagePropertyPixelHeight] as? Int == 1000)
  #expect(p[kCGImagePropertyGPSDictionary] == nil && (p[kCGImagePropertyTIFFDictionary] as? [CFString: Any])?[kCGImagePropertyTIFFModel] == nil)
  #expect(Readers.shrink(Data("not a photo".utf8)) == nil)
}

@Test func aPhoneHEICPhotoIsSentAsAJPEG() throws {
  let ctx = try #require(CGContext(data: nil, width: 2400, height: 3200, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
  ctx.setFillColor(CGColor(red: 0.1, green: 0.3, blue: 0.6, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: 2400, height: 3200))
  let heic = NSMutableData()
  // A runner that can't write HEIC has nothing to try.
  guard let dest = CGImageDestinationCreateWithData(heic, "public.heic" as CFString, 1, nil) else { return }
  CGImageDestinationAddImage(dest, try #require(ctx.makeImage()), nil)
  guard CGImageDestinationFinalize(dest) else { return }
  let sent = try #require(Readers.shrink(heic as Data))
  #expect(sent.starts(with: [0xFF, 0xD8, 0xFF]), "not a JPEG")
  let p = CGImageSourceCopyPropertiesAtIndex(CGImageSourceCreateWithData(sent as CFData, nil)!, 0, nil) as! [CFString: Any]
  #expect(p[kCGImagePropertyPixelWidth] as? Int == 1500 && p[kCGImagePropertyPixelHeight] as? Int == 2000)
}

// Reporting a reader's comment or photo (POST /api/v1/report), for the App Store's rule on readers' content.

@Test func aReportGoesAsTheAccountOrAsTheSitesPageWithTheFieldsTheContractTakes() throws {
  let signedIn = Readers.report("comment", id: "c1", reason: "spam", site: site, token: "tok", version: "1.4")
  #expect(signedIn.httpMethod == "POST" && signedIn.url?.absoluteString == "https://aquatome.com/api/v1/report")
  #expect(signedIn.value(forHTTPHeaderField: "Authorization") == "Bearer tok" && signedIn.value(forHTTPHeaderField: "Origin") == nil)
  #expect(signedIn.value(forHTTPHeaderField: "Content-Type") == "application/json" && !signedIn.httpShouldHandleCookies)
  let sent = try #require(signedIn.httpBody)
  let body = try #require(try JSONSerialization.jsonObject(with: sent) as? [String: String])
  #expect(body == ["kind": "comment", "id": "c1", "reason": "spam"])
  let s = schema("NewReport")
  #expect(Set(s["required"] as! [String]).isSubset(of: body.keys) && Set(body.keys).isSubset(of: (s["properties"] as! [String: Any]).keys))
  #expect(((s["properties"] as! [String: Any])["kind"] as! [String: Any])["enum"] as! [String] == ["comment", "photo"])
  // Signed out: as the site's own page, same-origin; no reason given, none sent.
  let signedOut = Readers.report("photo", id: "p1", reason: nil, site: site, token: nil, version: "1.4")
  #expect(signedOut.value(forHTTPHeaderField: "Authorization") == nil && signedOut.value(forHTTPHeaderField: "Origin") == "https://aquatome.com")
  let none = try #require(signedOut.httpBody)
  #expect(try JSONSerialization.jsonObject(with: none) as? [String: String] == ["kind": "photo", "id": "p1"])
}

@Test func eachAnswerToAReportIsReadAsTheContractWritesIt() {
  #expect(statuses("/api/v1/report", "post") == [202, 400, 401, 403, 404, 429, 503])
  #expect(Readers.reported(Data(#"{"status":"received"}"#.utf8), status: 202) == .received)
  // Not public any more (another report took it off, or moderation did): what the reader wanted.
  #expect(Readers.reported(Data(#"{"error":"not found"}"#.utf8), status: 404) == .received)
  // A 404 that isn't the report's: no report endpoint (the accounts router's), accounts off, a proxy's page. Not sent.
  #expect(Readers.reported(Data(#"{"error":"not_found"}"#.utf8), status: 404) == .refused("not_found"))
  #expect(Readers.reported(Data(#"{"error":"accounts_off"}"#.utf8), status: 404) == .refused("accounts_off"))
  #expect(Readers.reported(Data("<html>Not Found</html>".utf8), status: 404) == .refused("failed"))
  #expect(Readers.reported(Data(#"{"error":"session"}"#.utf8), status: 401) == .signedOut)
  #expect(Readers.reported(Data(#"{"error":"rate"}"#.utf8), status: 429) == .refused("rate"))
  #expect(Readers.reported(Data(#"{"error":"bad report"}"#.utf8), status: 400) == .refused("bad report"))
  #expect(Readers.reported(Data("<html>".utf8), status: 502) == .refused("failed"))
  // A comment's and a photo's `author`, as the contract has it: 16 hex characters, never a name (optional until the
  // Worker sends it: the app reads none as nil).
  for kind in ["Comment", "Photo"] {
    #expect(((schema(kind)["properties"] as! [String: Any])["author"] as! [String: Any])["pattern"] as? String == "^[0-9a-f]{16}$", "\(kind)")
  }
}

@Test func blockingAPosterKeysOnTheirAuthorOrElseOnThatOnePost() {
  #expect(Readers.blockKey(author: "0f1e2d3c4b5a6978", id: "c1") == "0f1e2d3c4b5a6978")
  #expect(Readers.blockKey(author: nil, id: "c1") == "post:c1")
  // A poster's block hides all they post; a post's, that post, also once the site says who posted it.
  #expect(Readers.blocks("0f1e2d3c4b5a6978", author: "0f1e2d3c4b5a6978", id: "p9"))
  #expect(Readers.blocks("post:c1", author: "0f1e2d3c4b5a6978", id: "c1"))
  #expect(!Readers.blocks("post:c1", author: "0f1e2d3c4b5a6978", id: "c2"))
  #expect(!Readers.blocks("0f1e2d3c4b5a6978", author: nil, id: "c2"))
}
