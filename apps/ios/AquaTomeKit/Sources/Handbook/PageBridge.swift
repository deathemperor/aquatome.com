import Foundation

/// The site's pages in the app share the reader's tanks with the app. The site keeps "Bể của tôi" in
/// `localStorage['aq.tanks']` and fires `aq-tanks-changed` after each save (apps/site/src/scripts/tank-store.ts). Its
/// tools save there ("Lưu vào Bể của tôi"), so in a web view their saves would stay in the web view, apart from the
/// app's tanks.
///
/// Before a page's own scripts run, this script:
/// - sends the app what the web view held, if it differs from the app's store (saves made before this bridge, or in a
///   page the app couldn't reach);
/// - puts the app's store in its place, so the page shows the app's tanks;
/// - sends the app the store again after each save the page makes.
///
/// The app merges what it's sent, record by record (docs/my-tanks-sync.md).
public enum PageBridge {
  /// The name of the app's message handler (`webkit.messageHandlers.<handler>`).
  public static let handler = "aqTanks"
  public static let key = "aq.tanks"
  public static let event = "aq-tanks-changed"

  /// The script for the start of each page. `store`: the app's store as JSON, or nil to leave the page's own (a store
  /// the app can't keep whole is never handed to a page that could save over it).
  public static func script(store: String?) -> String {
    let seed = store.map(literal) ?? "null"
    return """
    (() => {
      const key = \(literal(key)), seed = \(seed)
      const send = s => { try { webkit.messageHandlers.\(handler).postMessage(s) } catch (e) {} }
      try {
        const held = localStorage.getItem(key)
        if (held !== null && held !== seed) send(held)
        if (seed !== null) localStorage.setItem(key, seed)
      } catch (e) {}
      addEventListener(\(literal(event)), () => { try { send(localStorage.getItem(key)) } catch (e) {} })
    })()
    """
  }

  /// A JavaScript string literal for `s`: JSON's escaping, which JavaScript reads the same.
  static func literal(_ s: String) -> String {
    let data = try! JSONSerialization.data(withJSONObject: [s], options: [.fragmentsAllowed, .withoutEscapingSlashes])
    var json = String(decoding: data, as: UTF8.self)
    json.removeFirst()
    json.removeLast()
    // Line and paragraph separators end a line in older JavaScript engines.
    return json.replacingOccurrences(of: "\u{2028}", with: "\\u2028").replacingOccurrences(of: "\u{2029}", with: "\\u2029")
  }
}
