import Handbook
import SwiftUI
import UIKit
import WebKit

/// A page's videos, played in the page in YouTube's own player (its IFrame Player API, from youtube-nocookie.com, as the
/// site plays them), not in the YouTube app. Nothing from YouTube loads before the reader presses play: until then a
/// video is its thumbnail. One plays at a time: another pressed stops the first. A chapter or a still seeks the page's
/// player to its time, starting it there if it isn't loaded yet. Full screen moves the same web view into a cover, so
/// the video plays on without loading again; closed, it goes back to its place on the page.
@MainActor @Observable
final class PagePlayer {
  /// The video loaded now, and the web view playing it.
  private(set) var id: String?
  private(set) var web: WKWebView?
  /// Its player answered: until then its thumbnail stays, with a spinner.
  private(set) var ready = false
  /// The video that couldn't load (offline, or YouTube's script blocked): its thumbnail again, with a note.
  private(set) var failed: String?
  var full = false
  /// Counts the times a chapter or a still asked for the video, for the page to bring it into view.
  private(set) var asked = 0

  /// Pressed play: the video from `t` (seconds); the one loaded already, seeked there.
  func play(_ id: String, at t: Int, lang: String, site: URL) {
    failed = nil
    if self.id == id, let web {
      web.evaluateJavaScript("seek(\(t))")
      return
    }
    // The video playing before stops with its web view.
    web?.removeFromSuperview()
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    // The reader's tap was on the thumbnail, in the app: the player starts without another in the page.
    config.mediaTypesRequiringUserActionForPlayback = []
    // Nothing YouTube stores outlives the page.
    config.websiteDataStore = .nonPersistent()
    config.userContentController.add(Messages(self), name: "player")
    let web = WKWebView(frame: .zero, configuration: config)
    web.isOpaque = false
    web.backgroundColor = .clear
    web.scrollView.isScrollEnabled = false
    web.scrollView.showsVerticalScrollIndicator = false
    web.scrollView.showsHorizontalScrollIndicator = false
    web.scrollView.contentInsetAdjustmentBehavior = .never
    (self.id, self.web, ready) = (id, web, false)
    var api = #"<script src="https://www.youtube.com/iframe_api" onerror="tell('failed')"></script>"#
    #if DEBUG
    // UI tests read no network: a stand-in for YouTube's script, which shows what the page asked of it.
    if ProcessInfo.processInfo.arguments.contains("-fixed-handbook") { api = Self.standIn }
    #endif
    // At the site's address, as the site embeds the video: YouTube's player wants to know which page it's on.
    web.loadHTMLString(Self.page(id, at: t, lang: lang, api: api), baseURL: site)
  }

  /// A chapter or a still tapped: the video at its time, brought into view.
  func ask(_ id: String, at t: Int, lang: String, site: URL) {
    play(id, at: t, lang: lang, site: site)
    asked += 1
  }

  /// Its place on the page went away (another page on top, another tab): paused, but not for full screen.
  func leave(_ id: String) {
    guard self.id == id, !full else { return }
    web?.evaluateJavaScript("pause()")
  }

  fileprivate func heard(_ message: String, from web: WKWebView) {
    guard web === self.web else { return }
    switch message {
    case "ready": ready = true
    case "failed":
      web.removeFromSuperview()
      (failed, self.id, self.web, full) = (id, nil, nil, false)
    default: break
    }
  }

  /// A chapter's or a still's link, which the page's `open` hands to the player.
  static func link(_ id: String, at t: Int) -> URL {
    var c = URLComponents()
    c.scheme = "page-video"
    c.path = id
    c.queryItems = [.init(name: "t", value: String(t))]
    return c.url!
  }

  /// The video and time a `link` asks for.
  static func asked(_ url: URL) -> (id: String, at: Int)? {
    guard let c = URLComponents(url: url, resolvingAgainstBaseURL: false), !c.path.isEmpty else { return nil }
    return (c.path, c.queryItems?.first { $0.name == "t" }?.value.flatMap(Int.init) ?? 0)
  }

  /// A video's place on the page, for the page to scroll to.
  static func anchor(_ id: String?) -> String { "video-" + (id ?? "") }

  /// The player's page, as the site's (components/VideoPlayer.astro): YouTube's player from youtube-nocookie.com,
  /// playing at once, inline, from `t`, with no other channels' videos at the end, captions on in the page's language
  /// (YouTube's translation of the original track when the video has none in it) and YouTube's own words in it too.
  /// `api` loads YouTube's script, which calls `onYouTubeIframeAPIReady`.
  private static func page(_ id: String, at t: Int, lang: String, api: String) -> String {
    """
    <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}#p{position:absolute;inset:0;width:100%;height:100%}</style>
    <div id="p"></div>
    <script>
    const lang = \(js(lang)), names = {vi: 'Tiếng Việt', id: 'Bahasa Indonesia', th: 'ภาษาไทย'}
    const tell = m => webkit.messageHandlers.player.postMessage(m)
    let player, ready = false, wanted = null
    function captions(p) {
      const list = p.getOption('captions', 'tracklist') ?? []
      if (list.some(t => t.languageCode === lang)) return p.setOption('captions', 'track', {languageCode: lang})
      const base = list.find(t => t.languageCode?.startsWith('en')) ?? list[0] ?? p.getOption('captions', 'track')
      p.setOption('captions', 'track', {languageCode: base?.languageCode || 'en', translationLanguage: {languageCode: lang, languageName: names[lang]}})
    }
    function onYouTubeIframeAPIReady() {
      let captioned = false
      player = new YT.Player('p', {
        host: 'https://www.youtube-nocookie.com', videoId: \(js(id)), width: '100%', height: '100%',
        playerVars: {autoplay: 1, start: \(t), rel: 0, playsinline: 1, cc_load_policy: 1, cc_lang_pref: lang, hl: lang},
        events: {
          onReady: e => { ready = true; if (wanted !== null) e.target.seekTo(wanted, true); e.target.playVideo(); tell('ready') },
          onStateChange: e => {
            if (e.data !== YT.PlayerState.PLAYING || captioned) return
            captioned = true
            try { captions(e.target) } catch { /* captions stay as YouTube chose */ }
          },
        },
      })
    }
    // A chapter tapped before the player is ready: there once it is.
    function seek(t) { if (ready) { player.seekTo(t, true); player.playVideo() } else wanted = t }
    function pause() { if (ready) player.pauseVideo() }
    </script>
    \(api)
    """
  }

  #if DEBUG
  /// UI tests' YouTube (`-fixed-handbook`): a player that shows what it was asked, a line each, for a test to read: the
  /// video, from when, the captions' language and the player's host, then each seek and pause.
  private static let standIn = """
    <script>
    document.body.style.cssText = 'background:#000;color:#fff;font:15px -apple-system;padding:4px 8px'
    const line = s => document.body.append(Object.assign(document.createElement('p'), {textContent: s}))
    window.YT = {PlayerState: {PLAYING: 1}, Player: function (el, o) {
      line(`video ${o.videoId} from ${o.playerVars.start} · ${o.playerVars.cc_lang_pref} · ${o.host}`)
      Object.assign(this, {seekTo: t => line(`seek ${t}`), playVideo() {}, pauseVideo: () => line('paused'), getOption: () => [], setOption() {}})
      setTimeout(() => o.events.onReady({target: this}))
    }}
    onYouTubeIframeAPIReady()
    </script>
    """
  #endif
}

/// A string as a JavaScript string literal.
private func js(_ s: String) -> String { (try? JSONEncoder().encode(s)).flatMap { String(data: $0, encoding: .utf8) } ?? "''" }

/// A video on YouTube, from a moment (`at`, seconds): each player's credit, and a still of a video its page doesn't show.
func youtube(_ id: String, at: Int) -> URL { URL(string: "https://www.youtube.com/watch?v=\(id)" + (at > 0 ? "&t=\(at)s" : ""))! }

/// The player's messages, passed on without keeping it alive (the web view's configuration keeps its handlers).
private final class Messages: NSObject, WKScriptMessageHandler {
  weak var player: PagePlayer?
  init(_ player: PagePlayer) { self.player = player }
  func userContentController(_ content: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let web = message.webView, let text = message.body as? String else { return }
    player?.heard(text, from: web)
  }
}

/// A video where the page puts it: its thumbnail until the reader presses play, then YouTube's player in its place, the
/// same size. Under it the way to YouTube (the video's credit, as the site's "Video gốc") and, once it plays, full
/// screen; then its caption, whose chapters seek it.
struct VideoSlot: View {
  let id: String
  let title: String
  let caption: AttributedString
  @Environment(PagePlayer.self) private var player
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    let web = player.id == id ? player.web : nil
    VStack(alignment: .leading, spacing: 6) {
      ZStack {
        if let web { PlayerHost(web: web, holds: !player.full, label: String(localized: "Video: \(title)"), name: "video-player") }
        if web == nil || !player.ready {
          Button { player.play(id, at: 0, lang: handbook.lang, site: handbook.site) } label: {
            PageImage(src: PageDoc.thumbnail(id), ratio: 16 / 9, corner: 0)
              .overlay {
                if web == nil {
                  Image(systemName: "play.circle.fill").font(.system(size: 56)).foregroundStyle(.white, .black.opacity(0.5))
                } else {
                  ProgressView().controlSize(.large).tint(.white)
                }
              }
          }
          .buttonStyle(.plain)
          .allowsHitTesting(web == nil)
          .accessibilityLabel(Text("Phát video: \(title)"))
        }
      }
      .aspectRatio(16 / 9, contentMode: .fit)
      .clipShape(.rect(cornerRadius: 10))
      HStack(spacing: 16) {
        // A link out of the app, read as one.
        Link(destination: youtube(id, at: 0)) { Label("Xem trên YouTube", systemImage: "arrow.up.right.square").frame(minHeight: 44).contentShape(.rect) }
          .accessibilityRemoveTraits(.isButton)
          .accessibilityAddTraits(.isLink)
        Spacer(minLength: 0)
        if web != nil {
          Button { player.full = true } label: {
            Label("Toàn màn hình", systemImage: "arrow.up.left.and.arrow.down.right").frame(minHeight: 44).contentShape(.rect)
          }
          .accessibilityIdentifier("video-full")
        }
      }
      .font(.footnote)
      .tint(.secondary)
      if player.failed == id { Text("Không mở được video. Kiểm tra mạng rồi thử lại.").font(.footnote).foregroundStyle(Color.warning) }
      if !caption.characters.isEmpty { Text(caption).font(.footnote).foregroundStyle(.secondary) }
    }
    .id(PagePlayer.anchor(id))
    .onDisappear { player.leave(id) }
    .fullScreenCover(isPresented: Binding(get: { player.full && web != nil }, set: { player.full = $0 })) {
      if let web { FullVideo(player: player, web: web, title: title) }
    }
  }
}

/// The page's player full screen, on black: the same web view, playing on. Dragged down (on the video too) or closed,
/// it goes back to its place on the page.
private struct FullVideo: View {
  let player: PagePlayer
  let web: WKWebView
  let title: String
  @State private var drop: CGFloat = 0

  var body: some View {
    ZStack(alignment: .topLeading) {
      Color.black.ignoresSafeArea()
      PlayerHost(web: web, holds: player.full, label: String(localized: "Video: \(title)"), name: "video-full-screen") { y, done in
        if !done { drop = max(0, y) } else if y > 120 { player.full = false } else { withAnimation(.spring(duration: 0.25)) { drop = 0 } }
      }
      .ignoresSafeArea()
      .offset(y: drop)
      Button { player.full = false } label: {
        Image(systemName: "xmark").font(.body.weight(.semibold)).foregroundStyle(.white).frame(width: 44, height: 44).background(.white.opacity(0.15), in: .circle)
      }
      .accessibilityLabel(Text("Thoát toàn màn hình"))
      .padding(.horizontal)
      .opacity(drop == 0 ? 1 : 0)
    }
    .statusBarHidden()
    .persistentSystemOverlays(.hidden)
    .accessibilityAction(.escape) { player.full = false }
  }
}

/// A place for the player's web view: on the page, the slot's size; in the cover, 16:9 inside the screen's safe area,
/// dragged down to close (`dragged`: how far, and whether the finger is up, with its speed counted in). The web view
/// moves into a place only while that place is on the screen, so it never leaves the window and plays on.
private struct PlayerHost: UIViewRepresentable {
  let web: WKWebView
  /// Whether this place has the player now: the page's while it isn't full screen, the cover's while it is.
  let holds: Bool
  let label: String
  let name: String
  var dragged: ((CGFloat, Bool) -> Void)?

  func makeUIView(context: Context) -> Host {
    let host = Host()
    // VoiceOver reads which video it's in, then YouTube's own controls.
    host.accessibilityContainerType = .semanticGroup
    host.accessibilityIdentifier = name
    if dragged != nil {
      let pan = UIPanGestureRecognizer(target: host, action: #selector(Host.pan))
      pan.delegate = host
      host.addGestureRecognizer(pan)
    }
    return host
  }

  func updateUIView(_ host: Host, context: Context) {
    host.accessibilityLabel = label
    host.web = holds ? web : nil
    host.fits = dragged != nil
    host.dragged = dragged
    host.adopt()
  }

  final class Host: UIView, UIGestureRecognizerDelegate {
    var web: WKWebView?
    var fits = false
    var dragged: ((CGFloat, Bool) -> Void)?

    func adopt() {
      guard window != nil, let web, web.superview !== self else { return }
      addSubview(web)
      setNeedsLayout()
    }

    override func didMoveToWindow() {
      super.didMoveToWindow()
      adopt()
    }

    override func layoutSubviews() {
      super.layoutSubviews()
      guard let web, web.superview === self else { return }
      guard fits else { return web.frame = bounds }
      let area = bounds.inset(by: safeAreaInsets)
      let w = min(area.width, area.height * 16 / 9), h = w * 9 / 16
      web.frame = CGRect(x: area.midX - w / 2, y: area.midY - h / 2, width: w, height: h)
    }

    @objc func pan(_ g: UIPanGestureRecognizer) {
      let y = g.translation(in: window).y
      switch g.state {
      case .changed: dragged?(y, false)
      case .ended: dragged?(y + g.velocity(in: window).y * 0.15, true)
      case .cancelled, .failed: dragged?(0, true)
      default: break
      }
    }

    /// Only a drag down: across, it's YouTube's (its progress bar).
    override func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
      guard let pan = g as? UIPanGestureRecognizer else { return true }
      let v = pan.velocity(in: self)
      return v.y > abs(v.x)
    }

    // Beside the web view's own touches: a tap still reaches YouTube's controls.
    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
  }
}
