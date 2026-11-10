import Foundation
import Testing
@testable import AccountSync

/// The request a report makes, read back as the Worker reads it (apps/site/worker/feedback.ts), and each answer the
/// contract lists (protocols/owner-feedback.openapi.json).
private let place = OwnerReportPlace(screen: "handbook", path: "/vi/ca/ca-neon-vua/", lang: "vi", version: "1.4 (120)", theme: "dark",
                                     textSize: "large", device: "iPhone17,3 iOS 26.5", viewport: "402x874@3x")

private func answering(_ status: Int, _ body: String, sent: @escaping @Sendable (URLRequest) -> Void = { _ in }) -> OwnerClient {
  OwnerClient(send: { r in
    sent(r)
    return (Data(body.utf8), HTTPURLResponse(url: r.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
  }, token: "session-token", timeZone: "Asia/Ho_Chi_Minh")
}

private final class Box: @unchecked Sendable { var request: URLRequest? }

@Test("A report: the session as a bearer and no cookie, the words and where as the form's report, the screenshot as its image")
func reportRequest() async throws {
  let box = Box()
  let jpeg = Data([0xFF, 0xD8, 0xFF, 0x00, 0x0D, 0x0A, 0x2D, 0x2D])
  let waiting = try await answering(201, #"{"id":"x","waiting":2}"#) { box.request = $0 }.report(words: "Ảnh bị lệch", place: place, jpeg: jpeg)
  #expect(waiting == 2)
  let r = try #require(box.request)
  #expect(r.url?.absoluteString == "https://aquatome.com/api/feedback")
  #expect(r.httpMethod == "POST")
  #expect(r.httpShouldHandleCookies == false)
  #expect(r.value(forHTTPHeaderField: "Authorization") == "Bearer session-token")
  let type = try #require(r.value(forHTTPHeaderField: "Content-Type"))
  let boundary = try #require(type.components(separatedBy: "boundary=").last)
  #expect(type.hasPrefix("multipart/form-data; boundary="))
  let body = try #require(r.httpBody)
  // The image's bytes as they are, line ends and dashes too.
  #expect(body.range(of: Data("name=\"image\"; filename=\"screenshot.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".utf8) + jpeg + Data("\r\n--\(boundary)--\r\n".utf8)) != nil)
  let text = String(decoding: body, as: UTF8.self)
  let start = try #require(text.range(of: "name=\"report\"\r\n\r\n"))
  let end = try #require(text.range(of: "\r\n--\(boundary)", range: start.upperBound..<text.endIndex))
  let report = try #require(JSONSerialization.jsonObject(with: Data(text[start.upperBound..<end.lowerBound].utf8)) as? [String: Any])
  #expect(report["words"] as? String == "Ảnh bị lệch")
  #expect(report["where"] as? [String: String] == [
    "source": "app", "screen": "handbook", "url": "https://aquatome.com/vi/ca/ca-neon-vua/", "kind": "fish", "item": "ca-neon-vua",
    "lang": "vi", "version": "1.4 (120)", "theme": "dark", "textSize": "large", "device": "iPhone17,3 iOS 26.5", "viewport": "402x874@3x",
  ])
}

@Test("How the picture came goes with the report, and nothing's said of it when no one has")
func reportSaysHowThePictureCame() throws {
  let site = try #require(URL(string: "https://aquatome.com"))
  #expect(OwnerReportPlace(picture: "picked").fields(site: site)["picture"] == "picked")
  #expect(OwnerReportPlace(picture: "screen").fields(site: site)["picture"] == "screen")
  let chat = OwnerReportPlace(conversation: "3f2b8c1e-7a4d-4e21-9b6a-1c2d3e4f5a6b", answers: "2,3").fields(site: site)
  #expect(chat["conversation"] == "3f2b8c1e-7a4d-4e21-9b6a-1c2d3e4f5a6b")
  #expect(chat["answers"] == "2,3")
  #expect(OwnerReportPlace().fields(site: site)["picture"] == nil)
}

@Test("Words alone: the form has no image")
func reportWithoutImage() async throws {
  let box = Box()
  _ = try await answering(201, #"{"id":"x","waiting":1}"#) { box.request = $0 }.report(words: "Sai", place: OwnerReportPlace(), jpeg: nil)
  let text = String(decoding: try #require(box.request?.httpBody), as: UTF8.self)
  #expect(!text.contains("name=\"image\""))
  #expect(text.contains(#""where":{"source":"app"}"#))
}

@Test("Each refusal means what it does for the rest of the owner's client")
func reportRefusals() async throws {
  await #expect(throws: OwnerError.self) { _ = try await answering(401, #"{"error":"signed_out"}"#).report(words: "x", place: place, jpeg: nil) }
  for (status, body, expected) in [
    (401, #"{"error":"signed_out"}"#, "signedOut"),
    (404, #"{"error":"not_found"}"#, "notFound"),
    (404, "<h1>Not found</h1>", "refused http_404"), // a page in front of the Worker says nothing about who it is
    (429, #"{"error":"rate_limited"}"#, "refused rate_limited"),
    (413, #"{"error":"too_large"}"#, "refused too_large"),
    (503, #"{"error":"unavailable"}"#, "refused unavailable"),
    (201, "not json", "badReply"),
  ] as [(Int, String, String)] {
    do {
      _ = try await answering(status, body).report(words: "x", place: place, jpeg: nil)
      Issue.record("no refusal for \(status)")
    } catch let e as OwnerError {
      let got: String
      switch e {
      case .signedOut: got = "signedOut"
      case .notFound: got = "notFound"
      case .refused(let code, _): got = "refused \(code)"
      case .badReply: got = "badReply"
      case .offline: got = "offline"
      }
      #expect(got == expected, "\(status) \(body)")
    }
  }
}

@Test("No network is offline, so the sheet keeps the words and says so")
func reportOffline() async {
  let client = OwnerClient(send: { _ in throw URLError(.notConnectedToInternet) }, token: "t", timeZone: "UTC")
  do {
    _ = try await client.report(words: "x", place: place, jpeg: nil)
    Issue.record("no failure")
  } catch OwnerError.offline {
  } catch { Issue.record("\(error)") }
}

@Test("A page's kind and id from its path, in every language; a path of no kind has none")
func itemOfPath() {
  #expect(OwnerReportPlace.item(of: "/vi/ca/ca-neon-vua/")! == ("fish", "ca-neon-vua"))
  #expect(OwnerReportPlace.item(of: "/ca/ca-neon-vua/")! == ("fish", "ca-neon-vua"))
  #expect(OwnerReportPlace.item(of: "/id/ikan/x/")! == ("fish", "x"))
  #expect(OwnerReportPlace.item(of: "/th/fish/x/")! == ("fish", "x"))
  #expect(OwnerReportPlace.item(of: "/huong-dan/thay-nuoc/")! == ("guide", "thay-nuoc"))
  #expect(OwnerReportPlace.item(of: "/video/channel/PLx/")! == ("video", "PLx"))
  #expect(OwnerReportPlace.item(of: "/ca/") == nil)
  #expect(OwnerReportPlace.item(of: "/gioi-thieu/x/") == nil)
  #expect(OwnerReportPlace.item(of: nil) == nil)
}
