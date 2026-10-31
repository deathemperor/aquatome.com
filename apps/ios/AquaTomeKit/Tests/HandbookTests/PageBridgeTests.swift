#if canImport(JavaScriptCore)
import Foundation
import JavaScriptCore
import Testing
@testable import Handbook

private let site = URL(string: "https://aquatome.com")!

/// A page as the scripts meet it: its origin, localStorage, events, and the app's message handler, in JavaScriptCore.
private final class Page {
  let js = JSContext()!
  var sent: [String?] = []

  init(holding held: String?, origin: String = "https://aquatome.com") {
    js.exceptionHandler = { _, e in Issue.record("JavaScript: \(e?.toString() ?? "?")") }
    js.evaluateScript("""
      var location = { origin: \(PageBridge.literal(origin)) }
      var store = {}, listeners = {}, heard = []
      var localStorage = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v) }
      }
      var addEventListener = (name, f) => { (listeners[name] = listeners[name] || []).push(f) }
      var dispatchEvent = e => (listeners[e.type] || []).forEach(f => f(e))
      class StorageEvent { constructor(type, init) { this.type = type; this.key = init.key } }
      // The site's pages redraw when another tab saves (apps/site/src/scripts/save-to-tank.ts).
      addEventListener('storage', e => heard.push(e.key))
      """)
    let post: @convention(block) (JSValue) -> Void = { [unowned self] v in self.sent.append(v.isNull ? nil : v.toString()) }
    js.setObject(["messageHandlers": ["aqTanks": ["postMessage": post]]], forKeyedSubscript: "webkit" as NSString)
    if let held { js.objectForKeyedSubscript("localStorage").invokeMethod("setItem", withArguments: ["aq.tanks", held]) }
  }

  var held: String? {
    let v = js.evaluateScript("localStorage.getItem('aq.tanks')")!
    return v.isNull ? nil : v.toString()
  }

  /// The storage events the page heard, by key.
  var heard: [String] { js.evaluateScript("heard")!.toArray() as? [String] ?? [] }

  /// The page saves, as the site's tank-store save() does.
  func save(_ s: String) {
    js.objectForKeyedSubscript("localStorage").invokeMethod("setItem", withArguments: ["aq.tanks", s])
    js.evaluateScript("dispatchEvent({ type: 'aq-tanks-changed' })")
  }
}

/// Quotes, backslashes (a line break as JSON writes it), `</script>` and an emoji.
private let app = #"{"v":1,"tanks":[{"id":"a","name":"Bể \"60\" \\ phòng khách\n</script> 🐟"}],"devices":[]}"#
private let newer = #"{"v":2,"tanks":[{"id":"n","name":"Bể từ bản mới"}],"devices":[]}"#

@Test func aPageGetsTheAppsTanksBeforeItsOwnScriptsRun() {
  let page = Page(holding: nil)
  page.js.evaluateScript(PageBridge.script(store: app, site: site))
  #expect(page.held == app) // every character as it was
  #expect(page.sent.isEmpty, "nothing to send: the web view held nothing")
}

@Test func whatTheWebViewHeldBeforeIsSentToTheAppNotLost() {
  let earlier = #"{"v":1,"tanks":[{"id":"b","name":"Bể lưu trên trang"}],"devices":[]}"#
  let page = Page(holding: earlier)
  page.js.evaluateScript(PageBridge.script(store: app, site: site))
  #expect(page.sent == [earlier])
  #expect(page.held == app)
}

@Test func eachSaveThePageMakesIsSentToTheApp() {
  let page = Page(holding: app)
  page.js.evaluateScript(PageBridge.script(store: app, site: site))
  #expect(page.sent.isEmpty, "the same store isn't sent back")
  let saved = #"{"v":1,"tanks":[{"id":"a","name":"Bể 60"},{"id":"c","name":"Bể mới"}],"devices":[]}"#
  page.save(saved)
  #expect(page.sent == [saved])
}

@Test func aStoreTheAppCantKeepWholeIsntHandedToThePage() {
  let earlier = #"{"v":1,"tanks":[],"devices":[]}"#
  let page = Page(holding: earlier)
  page.js.evaluateScript(PageBridge.script(store: nil, site: site))
  #expect(page.held == earlier, "the page keeps its own")
  #expect(page.sent == [earlier], "and the app is sent it, to keep when it can")
}

@Test func aStoreInThePageTheAppCantReadIsSentButNotWrittenOver() {
  for held in [newer, "{not json", #"{"tanks":[]}"#] {
    let page = Page(holding: held)
    page.js.evaluateScript(PageBridge.script(store: app, site: site))
    #expect(page.sent == [held])
    #expect(page.held == held, "the only copy of what the app couldn't read")
    page.js.evaluateScript(PageBridge.update(store: app, site: site))
    #expect(page.held == held && page.heard.isEmpty)
  }
}

@Test func onlyTheSitesOwnPagesShareTheTanks() {
  for origin in ["null", "https://example.com", "http://aquatome.com", "https://www.youtube.com"] {
    let page = Page(holding: nil, origin: origin)
    page.js.evaluateScript(PageBridge.script(store: app, site: site))
    page.save(#"{"v":1,"tanks":[],"devices":[]}"#)
    page.js.evaluateScript(PageBridge.update(store: app, site: site))
    #expect(page.sent.isEmpty, "\(origin) sends the app nothing")
    #expect(page.held != app, "\(origin) is given nothing")
  }
  let www = Page(holding: nil, origin: "https://www.aquatome.com")
  www.js.evaluateScript(PageBridge.script(store: app, site: site))
  #expect(www.held == app)
}

@Test func anOpenPageGetsTheAppsChangesAndRedraws() {
  // The reader edits a tank in the app (or the account brings another phone's edit) while a tool is open: a save in
  // the page starts from the app's copy, not the one the page was opened with.
  let page = Page(holding: nil)
  page.js.evaluateScript(PageBridge.script(store: app, site: site))
  let edited = #"{"v":1,"tanks":[{"id":"a","name":"Bể 60 (đã sửa)"}],"devices":[]}"#
  page.js.evaluateScript(PageBridge.update(store: edited, site: site))
  #expect(page.held == edited)
  #expect(page.heard == ["aq.tanks"])
  page.js.evaluateScript(PageBridge.update(store: edited, site: site))
  #expect(page.heard == ["aq.tanks"], "nothing changed, nothing to redraw")
  #expect(page.sent.isEmpty, "the app's own store isn't sent back")
}

@Test func aMessageChangesTheTanksOnlyFromTheSitesOwnPagesOverHTTPS() {
  #expect(PageBridge.trusts(scheme: "https", host: "aquatome.com", site: site))
  #expect(PageBridge.trusts(scheme: "https", host: "www.aquatome.com", site: site))
  #expect(!PageBridge.trusts(scheme: "http", host: "aquatome.com", site: site))
  #expect(!PageBridge.trusts(scheme: "https", host: "example.com", site: site))
  #expect(!PageBridge.trusts(scheme: "", host: "", site: site)) // about:, data: and blob: pages have no host
  #expect(!PageBridge.trusts(scheme: "https", host: "aquatome.com.example.com", site: site))
}
#endif
