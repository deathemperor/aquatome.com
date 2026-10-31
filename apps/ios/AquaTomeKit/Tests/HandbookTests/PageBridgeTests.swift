#if canImport(JavaScriptCore)
import Foundation
import JavaScriptCore
import Testing
@testable import Handbook

/// A page as the script meets it: localStorage, events, and the app's message handler, in JavaScriptCore.
private final class Page {
  let js = JSContext()!
  var sent: [String?] = []

  init(holding held: String?) {
    js.exceptionHandler = { _, e in Issue.record("JavaScript: \(e?.toString() ?? "?")") }
    js.evaluateScript("""
      var store = {}, listeners = {}
      var localStorage = {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v) }
      }
      var addEventListener = (name, f) => { (listeners[name] = listeners[name] || []).push(f) }
      var dispatch = name => (listeners[name] || []).forEach(f => f())
      """)
    let post: @convention(block) (JSValue) -> Void = { [unowned self] v in self.sent.append(v.isNull ? nil : v.toString()) }
    js.setObject(["messageHandlers": ["aqTanks": ["postMessage": post]]], forKeyedSubscript: "webkit" as NSString)
    if let held { js.objectForKeyedSubscript("localStorage").invokeMethod("setItem", withArguments: ["aq.tanks", held]) }
  }

  var held: String? {
    let v = js.evaluateScript("localStorage.getItem('aq.tanks')")!
    return v.isNull ? nil : v.toString()
  }

  /// The page saves, as the site's tank-store save() does.
  func save(_ s: String) {
    js.objectForKeyedSubscript("localStorage").invokeMethod("setItem", withArguments: ["aq.tanks", s])
    js.evaluateScript("dispatch('aq-tanks-changed')")
  }
}

private let app = #"{"v":1,"tanks":[{"id":"a","name":"Bể \"60\" \\ phòng khách\n</script> 🐟"}],"devices":[]}"#

@Test func aPageGetsTheAppsTanksBeforeItsOwnScriptsRun() {
  let page = Page(holding: nil)
  page.js.evaluateScript(PageBridge.script(store: app))
  #expect(page.held == app) // quotes, backslashes, a line break, U+2028 and an emoji, all as they were
  #expect(page.sent.isEmpty, "nothing to send: the web view held nothing")
}

@Test func whatTheWebViewHeldBeforeIsSentToTheAppNotLost() {
  let earlier = #"{"v":1,"tanks":[{"id":"b","name":"Bể lưu trên trang"}],"devices":[]}"#
  let page = Page(holding: earlier)
  page.js.evaluateScript(PageBridge.script(store: app))
  #expect(page.sent == [earlier])
  #expect(page.held == app)
}

@Test func eachSaveThePageMakesIsSentToTheApp() {
  let page = Page(holding: app)
  page.js.evaluateScript(PageBridge.script(store: app))
  #expect(page.sent.isEmpty, "the same store isn't sent back")
  let saved = #"{"v":1,"tanks":[{"id":"a","name":"Bể 60"},{"id":"c","name":"Bể mới"}],"devices":[]}"#
  page.save(saved)
  #expect(page.sent == [saved])
}

@Test func aStoreTheAppCantKeepWholeIsntHandedToThePage() {
  let earlier = #"{"v":1,"tanks":[],"devices":[]}"#
  let page = Page(holding: earlier)
  page.js.evaluateScript(PageBridge.script(store: nil))
  #expect(page.held == earlier, "the page keeps its own")
}
#endif
