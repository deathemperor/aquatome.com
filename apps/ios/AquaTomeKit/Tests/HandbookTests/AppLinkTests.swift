import Foundation
import Testing
@testable import Handbook

private let site = URL(string: "https://aquatome.com")!
private func link(_ s: String) -> AppLink? { AppLink.of(URL(string: s)!, site: site) }

@Test func theSitesOpenInTheAppButtonOpensThePageItNames() {
  // The site's "Mở trong ứng dụng": aquatome://open?url=<the page's address, percent-encoded>.
  #expect(link("aquatome://open?url=https%3A%2F%2Faquatome.com%2Fvi%2Fca%2Fca-neon%2F") == .page(URL(string: "https://aquatome.com/vi/ca/ca-neon/")!))
  #expect(link("aquatome://open?url=https%3A%2F%2Fwww.aquatome.com%2Fid%2Falat%2Fakuarium-saya%2F%23be-t1")
          == .page(URL(string: "https://www.aquatome.com/id/alat/akuarium-saya/#be-t1")!))
  // A page asking for more than itself keeps it (the tank-mates tool set to a fish).
  #expect(link("aquatome://open?url=https%3A%2F%2Faquatome.com%2Fvi%2Fcong-cu%2Fnuoi-chung%2F%3Fca%3Dca-neon%3A6")
          == .page(URL(string: "https://aquatome.com/vi/cong-cu/nuoi-chung/?ca=ca-neon:6")!))
  #expect(link("AQUATOME://open?url=https%3A%2F%2Faquatome.com%2F") == .page(URL(string: "https://aquatome.com/")!))
}

@Test func theBareSchemeOpensTheHome() {
  #expect(link("aquatome://") == .home)
  #expect(link("aquatome:") == .home)
  #expect(link("aquatome://open") == .home)
}

@Test func thePagesOwnAddressOpensItToo() {
  // The Smart App Banner's app-argument, a universal link.
  #expect(link("https://aquatome.com/vi/ca/ca-neon/") == .page(URL(string: "https://aquatome.com/vi/ca/ca-neon/")!))
  #expect(link("https://www.aquatome.com/vi/ca/ca-neon/") == .page(URL(string: "https://www.aquatome.com/vi/ca/ca-neon/")!))
}

@Test func anythingButTheSitesOwnPagesIsIgnored() {
  for s in ["aquatome://open?url=https%3A%2F%2Fexample.com%2F",
            "aquatome://open?url=https%3A%2F%2Faquatome.com.example.com%2F",
            "aquatome://open?url=https%3A%2F%2Faquatome.com%40example.com%2F",
            "aquatome://open?url=https%3A%2F%2Fuser%3Apass%40aquatome.com%2F",
            "aquatome://open?url=https%3A%2F%2Faquatome.com%3A8443%2F",
            "aquatome://open?url=http%3A%2F%2Faquatome.com%2Fvi%2Fca%2Fca-neon%2F",
            "aquatome://open?url=javascript%3Aalert(1)",
            "aquatome://open?url=%2Fvi%2Fca%2Fca-neon%2F",
            "aquatome://open?url=",
            "aquatome://open?page=https%3A%2F%2Faquatome.com%2F",
            "aquatome://open/more?url=https%3A%2F%2Faquatome.com%2F",
            "aquatome://other?url=https%3A%2F%2Faquatome.com%2F",
            "http://aquatome.com/vi/ca/ca-neon/",
            "https://example.com/vi/ca/ca-neon/",
            "mailto:hi@aquatome.com"] {
    #expect(link(s) == nil, "\(s)")
  }
}
