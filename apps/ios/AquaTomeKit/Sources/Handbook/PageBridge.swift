import Foundation

/// The site's pages in the app share the reader's tanks with the app. The site keeps "Bể của tôi" in
/// `localStorage['aq.tanks']` and fires `aq-tanks-changed` after each save (apps/site/src/scripts/tank-store.ts). Its
/// tools save there ("Lưu vào Bể của tôi"), so in a web view their saves would stay in the web view, apart from the
/// app's tanks.
///
/// Before a page's own scripts run, `script` (on the site's own pages only):
/// - sends the app what the web view held, if it differs from the app's store (saves made before this bridge, or ones
///   the app couldn't keep);
/// - puts the app's store in its place, so the page shows the app's tanks;
/// - sends the app the store again after each save the page makes.
///
/// While a page is open, `update` hands it the app's store each time that changes, as another tab's save would.
///
/// The app merges what it's sent, record by record (docs/my-tanks-sync.md). A store in the web view the app's can't
/// stand in for (another version, or unreadable) is sent but never written over: it's the only copy of what the app
/// couldn't read.
public enum PageBridge {
  /// The name of the app's message handler (`webkit.messageHandlers.<handler>`).
  public static let handler = "aqTanks"
  public static let key = "aq.tanks"
  public static let event = "aq-tanks-changed"

  /// The script for the start of each page. `store`: the app's store as JSON, or nil to leave the page's own (a store
  /// the app can't keep whole is never handed to a page that could save over it).
  public static func script(store: String?, site: URL) -> String {
    """
    (() => {
      \(prelude(store, site))
      const send = s => { try { webkit.messageHandlers.\(handler).postMessage(s) } catch (e) {} }
      try {
        const held = localStorage.getItem(key)
        if (held !== null && held !== seed) send(held)
        if (replaces(held)) localStorage.setItem(key, seed)
      } catch (e) {}
      addEventListener(\(literal(event)), () => { try { send(localStorage.getItem(key)) } catch (e) {} })
    })()
    """
  }

  /// The script that hands an open page the app's store as it is now (the reader changed a tank in the app, or the
  /// account brought another phone's changes), so a save in the page starts from it. The site's pages redraw on the
  /// storage event, as when another tab saves.
  public static func update(store: String, site: URL) -> String {
    """
    (() => {
      \(prelude(store, site))
      try {
        const held = localStorage.getItem(key)
        if (held === seed || !replaces(held)) return
        localStorage.setItem(key, seed)
        dispatchEvent(new StorageEvent('storage', { key }))
      } catch (e) {}
    })()
    """
  }

  /// Whether a page with this origin may change the reader's tanks: the site's own pages, over https (not an
  /// `about:`, `data:` or `blob:` page, nor an embed's).
  public static func trusts(scheme: String, host: String, site: URL) -> Bool {
    scheme.lowercased() == "https" && bare(host) == bare(site.host ?? "")
  }

  /// What both scripts start with: only on the site's own pages; the app's store may replace the page's when there is
  /// none, or it's a store of the same version.
  private static func prelude(_ store: String?, _ site: URL) -> String {
    let host = bare(site.host ?? "")
    let origins = "[\(literal("https://" + host)), \(literal("https://www." + host))]"
    return """
    if (!\(origins).includes(location.origin)) return
      const key = \(literal(key)), seed = \(store.map(literal) ?? "null")
      const version = s => { try { return JSON.parse(s).v } catch (e) { return undefined } }
      const replaces = held => seed !== null && (held === null || (version(held) !== undefined && version(held) === version(seed)))
    """
  }

  private static func bare(_ host: String) -> String {
    let h = host.lowercased()
    return h.hasPrefix("www.") ? String(h.dropFirst(4)) : h
  }

  /// A JavaScript string literal for `s`: JSON's escaping, which JavaScript reads the same.
  static func literal(_ s: String) -> String {
    let data = try! JSONSerialization.data(withJSONObject: [s], options: [.fragmentsAllowed, .withoutEscapingSlashes])
    var json = String(decoding: data, as: UTF8.self)
    json.removeFirst()
    json.removeLast()
    return json
  }
}
