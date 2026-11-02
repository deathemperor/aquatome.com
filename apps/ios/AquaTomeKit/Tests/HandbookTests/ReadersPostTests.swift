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
  let r = Readers.post(photo: "species:betta-splendens", name: "Lan", jpeg: jpeg, site: site, token: "tok", version: "1.4", boundary: "B")
  #expect(r.httpMethod == "POST" && r.url?.absoluteString == "https://aquatome.com/_p")
  #expect(r.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
  #expect(r.value(forHTTPHeaderField: "Content-Type") == "multipart/form-data; boundary=B")
  // The form's fields, by name, as a server reads them.
  let body = try #require(r.httpBody)
  var fields: [String: Data] = [:]
  for part in body.split(separator: Data("--B".utf8)).dropLast() {
    guard let head = part.range(of: Data("\r\n\r\n".utf8)), let name = String(data: part[..<head.lowerBound], encoding: .utf8)?
      .firstMatch(of: /name="([^"]+)"/)?.1 else { continue }
    fields[String(name)] = part[head.upperBound...].dropLast(2)
  }
  #expect(fields.mapValues { String(decoding: $0, as: UTF8.self) }.filter { $0.key != "file" } == ["e": "species:betta-splendens", "name": "Lan", "consent": "1"])
  #expect(fields["file"] == jpeg)
  let s = schema("NewPhoto")
  #expect(Set(s["required"] as! [String]) == Set(fields.keys) && fields["token"] == nil)
}

@Test func eachAnswerToAPostIsReadAsTheContractWritesIt() {
  let a = { (status: Int, json: String) in Readers.answer(Data(json.utf8), status: status) }
  let shown = a(201, #"{"status":"approved","comment":{"id":"c9","name":"Lan","body":"Ổn.","helpful":false,"createdAt":"2026-11-02T10:00:00.000Z"}}"#)
  guard case let .shown(c) = shown else { Issue.record("\(shown)"); return }
  #expect(c.id == "c9" && c.body == "Ổn.")
  #expect(a(201, #"{"status":"held"}"#) == .held)
  #expect(a(201, #"{"status":"pending","id":"p9","deleteUrl":"/_p/xoa/?id=p9&t=x"}"#) == .received)
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
