import Foundation
import ImageIO
import Testing
@testable import Handbook

// protocols/fishid.openapi.json: the contract the site's Worker serves the fish-ID tool by.
nonisolated(unsafe) private let contract: [String: Any] = {
  var url = URL(fileURLWithPath: #filePath)
  for _ in 0..<6 { url.deleteLastPathComponent() }
  return try! JSONSerialization.jsonObject(with: Data(contentsOf: url.appendingPathComponent("protocols/fishid.openapi.json"))) as! [String: Any]
}()
private func schema(_ name: String) -> [String: Any] {
  ((contract["components"] as! [String: Any])["schemas"] as! [String: Any])[name] as! [String: Any]
}
private let site = URL(string: "https://aquatome.com")!

/// A form's parts by name, as the Worker reads them: each one's head and bytes.
private func parts(_ r: URLRequest, boundary: String) throws -> [String: (head: String, data: Data)] {
  var out: [String: (head: String, data: Data)] = [:]
  for part in try #require(r.httpBody).split(separator: Data("--\(boundary)".utf8)).dropLast() {
    guard let head = part.range(of: Data("\r\n\r\n".utf8)), let h = String(data: part[..<head.lowerBound], encoding: .utf8),
          let name = h.firstMatch(of: /name="([^"]+)"/)?.1 else { continue }
    out[String(name)] = (h, Data(part[head.upperBound...].dropLast(2)))
  }
  return out
}

@Test func aPhotoIsSentAsTheAccountAsTheFormTheContractTakesWithNoOriginOrTurnstileToken() throws {
  let jpeg = Data([0xFF, 0xD8, 0xFF, 0xD9])
  let r = FishId.identify(jpeg: jpeg, lang: "th", site: site, token: "tok", version: "1.4", ownCopy: nil, boundary: "B")
  #expect(r.httpMethod == "POST" && r.url?.absoluteString == "https://aquatome.com/api/fish-id")
  #expect(r.value(forHTTPHeaderField: "Authorization") == "Bearer tok")
  #expect(r.value(forHTTPHeaderField: "Origin") == nil && r.value(forHTTPHeaderField: "Cookie") == nil && !r.httpShouldHandleCookies)
  #expect(r.value(forHTTPHeaderField: "Content-Type") == "multipart/form-data; boundary=B")
  #expect(r.value(forHTTPHeaderField: "User-Agent") == "AquaTome-iOS/1.4")
  // Claude has up to 25 s on the Worker: the app waits longer than its usual 20 s (65 s, set: unset reads URLRequest's
  // 60 and leaves the session's 20 in charge).
  #expect(r.timeoutInterval == 65)
  let p = try parts(r, boundary: "B")
  // A file only as a part with a filename and its type: the Worker reads no other part as one.
  #expect(p["file"]?.head.contains(#"filename="photo.jpg""#) == true && p["file"]?.head.contains("Content-Type: image/jpeg") == true)
  #expect(p["file"]?.data == jpeg)
  #expect(p.filter { $0.key != "file" }.mapValues { String(decoding: $0.data, as: UTF8.self) } == ["lang": "th", "from": "page"])
  // Every field one the contract takes, each value one it lists, and no Turnstile token.
  let s = schema("NewPhoto"), props = s["properties"] as! [String: [String: Any]]
  #expect(Set(s["required"] as! [String]).isSubset(of: p.keys) && Set(p.keys).isSubset(of: props.keys) && p["token"] == nil)
  for field in ["lang", "from"] {
    #expect((props[field]?["enum"] as? [String])?.contains(String(decoding: p[field]!.data, as: UTF8.self)) == true, "\(field)")
  }
  // The contract's way for the app: a bearer.
  let post = ((contract["paths"] as! [String: Any])["/api/fish-id"] as! [String: Any])["post"] as! [String: Any]
  #expect((post["security"] as? [[String: Any]])?.contains { $0["bearer"] != nil } == true)
}

@Test func ourOwnCopiesSayItSoTheirGuessesAddNoWantedName() {
  let jpeg = Data([0xFF, 0xD8, 0xFF, 0xD9])
  let ours = FishId.identify(jpeg: jpeg, lang: "vi", site: site, token: "tok", version: "1.4", ownCopy: "AquaTomeCheck/1")
  #expect(ours.value(forHTTPHeaderField: "User-Agent") == "AquaTome-iOS/1.4 AquaTomeCheck/1")
  #expect(FishId.status(site: site, version: "1.4", ownCopy: "AquaTomeCheck/1").value(forHTTPHeaderField: "User-Agent") == "AquaTome-iOS/1.4 AquaTomeCheck/1")
  let get = FishId.status(site: site, version: "1.4", ownCopy: nil)
  #expect(get.httpMethod == "GET" && get.url?.absoluteString == "https://aquatome.com/api/fish-id" && get.value(forHTTPHeaderField: "Authorization") == nil)
  #expect(get.value(forHTTPHeaderField: "User-Agent") == "AquaTome-iOS/1.4")
}

@Test func anIdentificationIsReadAsTheContractWritesIt() throws {
  let json = #"""
  {"verdict":"fish","model":"claude","results":[
   {"scientificName":"Betta splendens","commonName":"Siamese fighting fish","variety":"Halfmoon","confidence":0.82,"reason":"Vây đuôi xòe nửa vòng.",
    "page":{"id":"betta-halfmoon","kind":"breed","name":"Betta halfmoon","sci":"Betta splendens","url":"/vi/ca/betta-halfmoon/","img":"https://media.aquatome.com/a/hm.webp"},
    "species":{"id":"betta-splendens","kind":"species","name":"Cá betta","sci":"Betta splendens","url":"/vi/ca/ca-betta/"},
    "sameGenus":[{"id":"betta-imbellis","kind":"species","name":"Betta imbellis","sci":"Betta imbellis","url":"/vi/ca/betta-imbellis/"},
                 {"id":"betta-x","kind":"species","name":"Betta x","sci":"Betta x"}]},
   {"scientificName":"Betta mahachaiensis","commonName":"Mahachai betta","variety":null,"confidence":0.3,"reason":"Ánh xanh lục.",
    "sameGenus":[{"id":"betta-splendens","kind":"species","name":"Cá betta","sci":"Betta splendens","url":"https://evil.example/x","img":"http://x/y.jpg"}]},
   {"commonName":"No name","confidence":0.2,"reason":"?"}]}
  """#
  guard case .identified(let id) = FishId.answer(Data(json.utf8), status: 200) else { Issue.record("not read"); return }
  #expect(id.verdict == "fish" && id.hasGuesses && id.line == nil)
  // The one without a scientific name is left out, not the others.
  #expect(id.results.map(\.scientificName) == ["Betta splendens", "Betta mahachaiensis"])
  let hm = id.results[0]
  #expect(hm.variety == "Halfmoon" && hm.confidence == 0.82 && hm.reason == "Vây đuôi xòe nửa vòng.")
  #expect(hm.page?.path == "/vi/ca/betta-halfmoon/" && hm.page?.img?.absoluteString == "https://media.aquatome.com/a/hm.webp")
  #expect(hm.species?.name == "Cá betta" && hm.species?.path == "/vi/ca/ca-betta/")
  // A page with no address in this language is named, not linked.
  #expect(hm.sameGenus.map(\.path) == ["/vi/ca/betta-imbellis/", nil] && hm.genus == "Betta")
  let other = id.results[1]
  #expect(other.page == nil && other.variety == nil && other.genus == "Betta")
  // Only this site's own pages and our media host's photos, as the site's page shows them.
  #expect(other.sameGenus.first?.path == nil && other.sameGenus.first?.img == nil)
}

@Test func whatToSayBeforeTheGuessesOrInsteadOfThemIsTheSitesLine() {
  let read = { (json: String) -> FishId.Identification? in
    if case .identified(let i) = FishId.answer(Data(json.utf8), status: 200) { i } else { nil }
  }
  let guess = #"{"scientificName":"Danio rerio","commonName":"Zebrafish","variety":null,"confidence":0.4,"reason":"Sọc."}"#
  #expect(read(#"{"verdict":"other","results":[],"model":"m"}"#)?.line == .notFish)
  #expect(read(#"{"verdict":"other","results":[],"model":"m"}"#)?.hasGuesses == false)
  #expect(read(#"{"verdict":"unclear","results":[],"refused":true,"model":"m"}"#)?.line == .unclear)
  #expect(read(#"{"verdict":"fish","results":[],"model":"m"}"#)?.line == .unclear)
  #expect(read(#"{"verdict":"unclear","results":[\#(guess)],"model":"m"}"#)?.line == .onlyAGuess)
  #expect(read(#"{"verdict":"plant","results":[\#(guess)],"model":"m"}"#)?.line == nil)
}

@Test func howSureIsTheSitesFourWordsByItsThresholds() {
  #expect([0.95, 0.8, 0.79, 0.55, 0.54, 0.3, 0.29, 0].map(FishId.Sure.init)
    == [.almostCertain, .almostCertain, .quiteLike, .quiteLike, .maybe, .maybe, .unlikely, .unlikely])
}

@Test func eachRefusalIsReadByItsCodeWithTheReadersLimit() {
  let a = { (status: Int, json: String) in FishId.answer(Data(json.utf8), status: status) }
  #expect(a(401, #"{"error":"session"}"#) == .signedOut)
  #expect(a(429, #"{"error":"rate","limit":10}"#) == .refused("rate", limit: 10))
  #expect(a(429, #"{"error":"busy"}"#) == .refused("busy", limit: nil))
  #expect(a(503, #"{"error":"resting"}"#) == .refused("resting", limit: nil))
  #expect(a(503, #"{"error":"fish_id_off"}"#) == .refused("fish_id_off", limit: nil))
  #expect(a(415, #"{"error":"not an image"}"#) == .refused("not an image", limit: nil))
  #expect(a(413, #"{"error":"too large"}"#) == .refused("too large", limit: nil))
  #expect(a(502, #"{"error":"failed"}"#) == .refused("failed", limit: nil))
  // Not the contract's: a proxy's page, a 200 without guesses, a 401 that isn't the session's.
  #expect(a(502, "<html>") == .refused("failed", limit: nil))
  #expect(a(200, #"{"ok":true}"#) == .refused("failed", limit: nil))
  #expect(a(401, #"{"error":"other"}"#) == .refused("other", limit: nil))
  // Every error status read here is one the contract gives.
  let post = ((contract["paths"] as! [String: Any])["/api/fish-id"] as! [String: Any])["post"] as! [String: Any]
  #expect(Set((post["responses"] as! [String: Any]).keys).isSuperset(of: ["200", "401", "413", "415", "429", "502", "503"]))
}

@Test func theToolsStateIsReadFromGet() {
  let s = { (status: Int, json: String) in FishId.status(Data(json.utf8), status: status) }
  #expect(s(200, #"{"on":true,"sitekey":"k","resting":false,"perIp":10,"perAccount":10}"#) == .init(on: true, resting: false, perAccount: 10))
  #expect(s(200, #"{"on":true,"sitekey":"k","resting":true,"perIp":10,"perAccount":10}"#)?.resting == true)
  #expect(s(200, #"{"on":false}"#) == .init(on: false, resting: false, perAccount: nil))
  #expect(s(500, #"{"on":true}"#) == nil && s(200, "<html>") == nil)
  // What it reads is the contract's.
  #expect(Set((schema("Status")["properties"] as! [String: Any]).keys).isSuperset(of: ["on", "resting", "perAccount"]))
}

// MARK: The photo

/// A JPEG of `w` × `h` with a GPS position and a camera, as a phone takes one: its top half `top`, its bottom half
/// `bottom` (as stored, before any `orientation`).
private func phonePhoto(_ w: Int, _ h: Int, top: CGColor, bottom: CGColor, orientation: Int = 1) throws -> Data {
  let ctx = try #require(CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
  // A bitmap context draws from the bottom up.
  ctx.setFillColor(bottom)
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h / 2))
  ctx.setFillColor(top)
  ctx.fill(CGRect(x: 0, y: h / 2, width: w, height: h - h / 2))
  let out = NSMutableData()
  let dest = try #require(CGImageDestinationCreateWithData(out, "public.jpeg" as CFString, 1, nil))
  CGImageDestinationAddImage(dest, try #require(ctx.makeImage()), [
    kCGImagePropertyOrientation: orientation,
    kCGImagePropertyGPSDictionary: [kCGImagePropertyGPSLatitude: 10.77, kCGImagePropertyGPSLatitudeRef: "N", kCGImagePropertyGPSLongitude: 106.7, kCGImagePropertyGPSLongitudeRef: "E"],
    kCGImagePropertyTIFFDictionary: [kCGImagePropertyTIFFMake: "Phone", kCGImagePropertyTIFFModel: "Camera"],
  ] as CFDictionary)
  #expect(CGImageDestinationFinalize(dest))
  return out as Data
}
private let red = CGColor(red: 0.9, green: 0.1, blue: 0.1, alpha: 1), blue = CGColor(red: 0.1, green: 0.2, blue: 0.9, alpha: 1)
private func props(_ d: Data) -> [CFString: Any] { CGImageSourceCopyPropertiesAtIndex(CGImageSourceCreateWithData(d as CFData, nil)!, 0, nil) as! [CFString: Any] }
private func size(_ d: Data) -> (Int, Int) { (props(d)[kCGImagePropertyPixelWidth] as! Int, props(d)[kCGImagePropertyPixelHeight] as! Int) }
/// Whether the photo is more red than blue at (x, y), 0…1 from its top left.
private func redAt(_ d: Data, _ x: Double, _ y: Double) throws -> Bool {
  let image = try #require(CGImageSourceCreateImageAtIndex(CGImageSourceCreateWithData(d as CFData, nil)!, 0, nil))
  var px = [UInt8](repeating: 0, count: 4)
  let ctx = try #require(CGContext(data: &px, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                                   bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue))
  // The image moved so that the pixel at (x, y) lands on the context's one.
  ctx.draw(image, in: CGRect(x: -x * Double(image.width), y: -(1 - y) * Double(image.height), width: Double(image.width), height: Double(image.height)))
  return px[0] > px[2]
}

@Test func theWholePhotoIsSentAsTheSitesNoLargerAndWithoutItsLocationOrCamera() throws {
  let original = try phonePhoto(4000, 3000, top: red, bottom: blue)
  #expect(props(original)[kCGImagePropertyGPSDictionary] != nil, "the stand-in photo has no position to take out")
  let sent = try #require(FishId.photo(original))
  #expect(size(sent) == (1024, 768))
  let p = props(sent)
  #expect(p[kCGImagePropertyGPSDictionary] == nil && (p[kCGImagePropertyTIFFDictionary] as? [CFString: Any])?[kCGImagePropertyTIFFModel] == nil)
  // The site's JPEG quality (0.85), not the readers' photos' (0.88): the same picture comes out smaller.
  let readers = try #require(Readers.shrink(original, maxSide: 1024))
  #expect(sent.count < readers.count)
  #expect(FishId.photo(Data("not a photo".utf8)) == nil)
}

@Test func aBoxedFishIsCutFromTheFullPhotoThenShrunkAsTheSiteCutsIt() throws {
  let original = try phonePhoto(4000, 3000, top: red, bottom: blue)
  // The bottom half: 4000 × 1500 at full size, so 1024 × 384.
  let bottom = try #require(FishId.photo(original, box: CGRect(x: 0, y: 0.5, width: 1, height: 0.5)))
  #expect(size(bottom) == (1024, 384))
  #expect(try !redAt(bottom, 0.5, 0.2) && !redAt(bottom, 0.5, 0.8), "not the bottom half")
  #expect(props(bottom)[kCGImagePropertyGPSDictionary] == nil)
  // A small box keeps its own pixels, not the whole photo's shrunk: 400 × 300 of the original.
  let small = try #require(FishId.photo(original, box: CGRect(x: 0.1, y: 0.1, width: 0.1, height: 0.1)))
  #expect(size(small) == (400, 300))
  #expect(try redAt(small, 0.5, 0.5))
  // A box partly off the photo is the part on it.
  #expect(try size(#require(FishId.photo(original, box: CGRect(x: 0.75, y: 0.75, width: 0.5, height: 0.5)))) == (1000, 750))
  #expect(FishId.photo(original, box: CGRect(x: 2, y: 2, width: 0.1, height: 0.1)) == nil)
}

@Test func aBoxIsWhereTheReaderDrewItOnTheUprightPhoto() throws {
  // Stored on its side, as a phone held upright keeps it (orientation 6): the stored top shows on one side.
  let original = try phonePhoto(2000, 1000, top: red, bottom: blue, orientation: 6)
  let whole = try #require(FishId.photo(original))
  #expect(size(whole) == (512, 1024), "not upright")
  let redOnRight = try redAt(whole, 0.75, 0.5)
  #expect(try redAt(whole, 0.25, 0.5) != redOnRight, "no sides to tell apart")
  // The right half of the photo as the reader saw it: its colour, as the preview showed it there.
  let right = try #require(FishId.photo(original, box: CGRect(x: 0.5, y: 0, width: 0.5, height: 1)))
  // 500 × 2000 of the upright photo.
  #expect(size(right) == (256, 1024))
  #expect(try redAt(right, 0.5, 0.5) == redOnRight)
}
