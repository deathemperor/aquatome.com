import Handbook
import SwiftUI
import UIKit
import WebKit

/// A page's videos, played in the page in YouTube's own player (its IFrame Player API, from youtube-nocookie.com, as the
/// site plays them), not in the YouTube app. Nothing from YouTube loads before the reader presses play: until then a
/// video is its thumbnail, a video guide's its poster. One plays at a time: another pressed stops the first. A chapter or a still seeks the page's
/// player to its time, starting it there if it isn't loaded yet. Full screen moves the same web view into a cover, so
/// the video plays on without loading again; closed, it goes back to its place on the page. Only a video id as YouTube
/// gives them plays here (`PageDoc.isYouTubeId`), and only one YouTube's player takes; any other opens on YouTube, as
/// every video did before. A player let go of stops and goes at once, its web view with it: nothing keeps one to play on
/// unseen.
@MainActor @Observable
final class PagePlayer {
  /// The video loaded now, and the web view playing it.
  private(set) var id: String?
  private(set) var web: WKWebView?
  /// Its player answered: until then its thumbnail stays, with a spinner.
  private(set) var ready = false
  /// YouTube's player said it's playing: until then, and again once it has played to its end (`over`), the video's
  /// poster or thumbnail stays over it, so YouTube's own picture (often people) doesn't show.
  private(set) var playing = false
  private(set) var over = false
  /// The video that couldn't load (offline, YouTube's script blocked, or its player never came up): its thumbnail
  /// again, with a note, to try again.
  private(set) var failed: String?
  /// The videos YouTube's player refused (its owner keeps it off other sites, or it's gone): on YouTube instead.
  private(set) var refused: Set<String> = []
  var full = false
  /// Counts the times a chapter or a still asked for the video, for the page to bring it into view.
  private(set) var asked = 0
  /// A time asked for before the player was ready (a chapter tapped as it loads, its page perhaps not there yet): sought
  /// once it is.
  @ObservationIgnored private var wanted: Int?
  /// The web view's delegate, which the web view doesn't keep.
  @ObservationIgnored private var watcher: Watcher?
  /// Its page on its way, then the time limit for its player.
  @ObservationIgnored private var loading: Task<Void, Never>?

  /// How long YouTube's player may take to come up, on slow mobile data too, before its thumbnail comes back.
  static let patience = Duration.seconds(30)

  /// Pressed play: the video from `t` (seconds); the one loaded already, seeked there.
  func play(_ id: String, at t: Int, lang: String, site: URL) {
    guard PageDoc.isYouTubeId(id), !refused.contains(id) else { return }
    failed = nil
    if self.id == id, let web {
      if ready { web.evaluateJavaScript("seek(\(t))") } else { wanted = t }
      over = false
      return
    }
    // The video playing before stops with its web view.
    drop()
    let watcher = Watcher(self, page: site)
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    // The reader's tap was on the thumbnail, in the app: the player starts without another in the page.
    config.mediaTypesRequiringUserActionForPlayback = []
    // Nothing YouTube stores outlives the page.
    config.websiteDataStore = .nonPersistent()
    config.userContentController.add(watcher, name: "player")
    let web = WKWebView(frame: .zero, configuration: config)
    web.navigationDelegate = watcher
    web.uiDelegate = watcher
    web.isOpaque = false
    web.backgroundColor = .clear
    web.scrollView.isScrollEnabled = false
    web.scrollView.showsVerticalScrollIndicator = false
    web.scrollView.showsHorizontalScrollIndicator = false
    web.scrollView.contentInsetAdjustmentBehavior = .never
    (self.id, self.web, self.watcher) = (id, web, watcher)
    #if DEBUG
    Self.made.add(web)
    Self.madeCount += 1
    #endif
    let test = Self.standIn
    let html = Self.page(id, at: t, lang: lang, api: test?.api ?? #"<script src="https://www.youtube.com/iframe_api" onerror="tell('failed')"></script>"#)
    let (late, patience) = (test?.late ?? .zero, test?.patience ?? Self.patience)
    // Holding the player and its web view only while it runs: one let go of (`drop`) stops it.
    loading = Task { [weak self] in
      if late > .zero { try? await Task.sleep(for: late) }
      guard !Task.isCancelled else { return }
      // At the site's address, as the site embeds the video: YouTube's player wants to know which page it's on.
      self?.web?.loadHTMLString(html, baseURL: site)
      // YouTube's script came but its player never did: the thumbnail again, to try again.
      try? await Task.sleep(for: patience)
      guard !Task.isCancelled, let self, !self.ready else { return }
      self.drop(failed: true)
    }
  }

  /// A chapter or a still tapped: the video at its time, brought into view; one YouTube's player refused, on YouTube.
  func ask(_ id: String, at t: Int, lang: String, site: URL) {
    if refused.contains(id) {
      UIApplication.shared.open(Self.watch(id, at: t))
      return
    }
    play(id, at: t, lang: lang, site: site)
    asked += 1
  }

  /// Its place on the page went away (another page on top, another tab): paused, but not for full screen. Not ready
  /// yet, there's nothing to pause, and it would start once ready, off the screen: its thumbnail again instead.
  func leave(_ id: String) {
    guard self.id == id, !full else { return }
    if ready { web?.evaluateJavaScript("pause()") } else { drop() }
  }

  /// The web view's place on the page is gone for good (the page closed): no player, whatever still holds the page's
  /// state (SwiftUI kept a closed page's, this player with it, past the page). Matched by web view, not video: a place
  /// taken down late mustn't drop the player started since.
  func gone(_ web: WKWebView) {
    if web === self.web { drop() }
  }

  /// No player: its thumbnail again, with the note when it failed. The video paused, its page stopped and its web view
  /// let go of by everything here, so it goes now and can't play on unseen.
  private func drop(failed note: Bool = false) {
    loading?.cancel()
    if let web {
      if ready { web.evaluateJavaScript("pause()") }
      web.stopLoading()
      web.configuration.userContentController.removeScriptMessageHandler(forName: "player")
      web.navigationDelegate = nil
      web.uiDelegate = nil
      web.removeFromSuperview()
    }
    failed = note ? id : nil
    (id, web, watcher, loading, ready, wanted, full, playing, over) = (nil, nil, nil, nil, false, nil, false, false, false)
  }

  fileprivate func heard(_ message: String, from web: WKWebView) {
    guard web === self.web else { return }
    switch message {
    case "ready":
      ready = true
      if let t = wanted { web.evaluateJavaScript("seek(\(t))") }
      wanted = nil
    case "playing": (playing, over) = (true, false)
    case "ended": (playing, over) = (false, true)
    case "failed": drop(failed: true)
    case "refused":
      if let id { refused.insert(id) }
      drop()
    default: break
    }
  }

  /// iOS ended the web view's process (the app in the background a while, short of memory): the player is gone with
  /// it. Its thumbnail again, without the note (it's not the network); not loaded again, which would play from the start.
  fileprivate func ended(_ web: WKWebView) {
    if web === self.web { drop() }
  }

  /// A chapter's or a still's link, which the page's `open` hands to the player; a video that can't play here, on
  /// YouTube.
  static func link(_ id: String, at t: Int) -> URL {
    guard PageDoc.isYouTubeId(id) else { return watch(id, at: t) }
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

  /// A video on YouTube, from a moment (`at`, seconds): each player's credit, and a video that can't play in the page.
  static func watch(_ id: String, at: Int) -> URL {
    var c = URLComponents(string: "https://www.youtube.com/watch")!
    c.queryItems = [.init(name: "v", value: id)] + (at > 0 ? [.init(name: "t", value: "\(at)s")] : [])
    return c.url!
  }

  /// The player's page, as the site's (components/VideoPlayer.astro): YouTube's player from youtube-nocookie.com,
  /// playing at once, inline, from `t`, with no other channels' videos at the end, captions on and YouTube's own words
  /// in the page's language. The captions are the video's own track in that language when it has one, else its original
  /// track as it is: the site asks YouTube for a translation then, which YouTube's player refuses in WebKit (the captions
  /// went off). It tells the app when it's ready, and when YouTube refuses the video (`onError`: its owner keeps it off
  /// other sites, or it's gone). `api` loads YouTube's script, which calls `onYouTubeIframeAPIReady`. The app calls
  /// `seek` and `pause` only once the page has said it's ready.
  private static func page(_ id: String, at t: Int, lang: String, api: String) -> String {
    """
    <!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
    <style>html,body{margin:0;height:100%;background:transparent;overflow:hidden}#p{position:absolute;inset:0;width:100%;height:100%}</style>
    <div id="p"></div>
    <script>
    const lang = \(js(lang))
    const tell = m => webkit.messageHandlers.player.postMessage(m)
    let player
    function captions(p) {
      const list = p.getOption('captions', 'tracklist') ?? []
      const own = list.find(t => t.languageCode === lang) ?? list.find(t => t.languageCode?.startsWith('en')) ?? list[0]
      if (own) p.setOption('captions', 'track', {languageCode: own.languageCode})
    }
    function onYouTubeIframeAPIReady() {
      let captioned = false
      player = new YT.Player('p', {
        host: 'https://www.youtube-nocookie.com', videoId: \(js(id)), width: '100%', height: '100%',
        playerVars: {autoplay: 1, start: \(t), rel: 0, playsinline: 1, cc_load_policy: 1, cc_lang_pref: lang, hl: lang},
        events: {
          onReady: e => { e.target.playVideo(); tell('ready') },
          onError: () => tell('refused'),
          onStateChange: e => {
            if (e.data === YT.PlayerState.ENDED) tell('ended')
            if (e.data !== YT.PlayerState.PLAYING) return
            tell('playing')
            if (captioned) return
            captioned = true
            try { captions(e.target) } catch { /* captions stay as YouTube chose */ }
          },
        },
      })
    }
    function seek(t) { player.seekTo(t, true); player.playVideo() }
    function pause() { player.pauseVideo() }
    </script>
    \(api)
    """
  }

  #if DEBUG
  /// UI tests' YouTube (`-fixed-handbook`): a player that shows what it was asked, a line each, for a test to read (the
  /// video, from when, the captions' language and the player's host, then each play, seek, captions track and pause),
  /// and two links out of it, as YouTube's player has: one in its page and one to a new window ("Watch on YouTube", as
  /// its title is). The guide's video has captions in English and Vietnamese, the others in English only. A video whose
  /// id starts with `noEmbed` is refused, as YouTube refuses one its owner keeps off other sites. `-slow-player`: its page
  /// comes 5 s late (as a web view's first start can be slow) and its player 2 s after that, so a test can act before
  /// it's ready. `-silent-player`: its player never comes up. `-impatient`: the time limit for it is 3 s, not 30.
  private static var standIn: (api: String, late: Duration, patience: Duration)? {
    let args = ProcessInfo.processInfo.arguments
    guard args.contains("-fixed-handbook") else { return nil }
    let slow = args.contains("-slow-player"), silent = args.contains("-silent-player")
    let api = """
      <script>
      document.body.style.cssText = 'background:#000;color:#fff;font:13px -apple-system'
      let box
      const line = s => box.append(Object.assign(document.createElement('p'), {textContent: s, style: 'margin:2px 0'}))
      const link = (text, href, target = '') => box.append(Object.assign(document.createElement('a'), {textContent: text, href, target, style: 'color:#fff;margin-right:16px'}))
      window.YT = {PlayerState: {PLAYING: 1}, Player: function (el, o) {
        // Where YouTube's player goes, as its iframe does.
        box = document.getElementById(el)
        box.style.padding = '4px 8px'
        const refused = o.videoId.startsWith('noEmbed'), tracks = o.videoId === 'abc123XYZ_-' ? ['en', 'vi'] : ['en']
        line(refused ? 'Video unavailable' : `video ${o.videoId} from ${o.playerVars.start} · ${o.playerVars.cc_lang_pref} · ${o.host}`)
        link('YouTube', 'about:blank')
        link('Watch on YouTube', `https://www.youtube.com/watch?v=${o.videoId}`, '_blank')
        Object.assign(this, {
          seekTo: t => line(`seek ${t}`),
          playVideo: () => {
            if (refused) return o.events.onError({target: this, data: 150})
            line('play')
            o.events.onStateChange({target: this, data: YT.PlayerState.PLAYING})
          },
          pauseVideo: () => line('paused'),
          getOption: (m, k) => k === 'tracklist' ? tracks.map(languageCode => ({languageCode})) : {},
          setOption: (m, k, t) => line(`captions ${t.languageCode}${t.translationLanguage ? ' → ' + t.translationLanguage.languageCode : ''}`),
        })
        if (\(!silent)) setTimeout(() => o.events.onReady({target: this}), \(slow ? 2000 : 0))
      }}
      onYouTubeIframeAPIReady()
      </script>
      """
    return (api, slow ? .seconds(5) : .zero, args.contains("-impatient") ? .seconds(3) : patience)
  }

  /// The players' web views made, held weakly: UI tests (`-count-players`) read how many were made and how many are still
  /// alive (`PlayerCount`), to see that a player let go of goes.
  static let made = NSHashTable<WKWebView>.weakObjects()
  static var madeCount = 0
  #else
  private static let standIn: (api: String, late: Duration, patience: Duration)? = nil
  #endif
}

/// A string as a JavaScript string literal.
private func js(_ s: String) -> String { (try? JSONEncoder().encode(s)).flatMap { String(data: $0, encoding: .utf8) } ?? "''" }

/// The player's web view's delegate, telling the player without keeping it alive (the web view's configuration keeps
/// its message handlers): its messages, its links, its process.
@MainActor
private final class Watcher: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
  weak var player: PagePlayer?
  /// The player's page's address (the site's): its own load.
  let page: URL

  init(_ player: PagePlayer, page: URL) {
    self.player = player
    self.page = page
  }

  func userContentController(_ content: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let web = message.webView, let text = message.body as? String else { return }
    player?.heard(text, from: web)
  }

  /// The player's page and whatever loads inside YouTube's frame stay; anything else that would take the page's place
  /// (a link out of YouTube's player) opens outside the app.
  func webView(_ web: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
    guard let u = action.request.url else { return .cancel }
    if action.targetFrame?.isMainFrame == false || (action.navigationType == .other && u.scheme == page.scheme && u.host() == page.host()) {
      return .allow
    }
    if ["http", "https"].contains(u.scheme) { await UIApplication.shared.open(u) }
    return .cancel
  }

  /// A link YouTube opens in a new window (its title, its logo, "Watch on YouTube" for a video that can't be embedded):
  /// outside the app, no window here.
  func webView(_ web: WKWebView, createWebViewWith config: WKWebViewConfiguration, for action: WKNavigationAction,
               windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let u = action.request.url, ["http", "https"].contains(u.scheme) { UIApplication.shared.open(u) }
    return nil
  }

  func webViewWebContentProcessDidTerminate(_ web: WKWebView) { player?.ended(web) }
}

/// A video where the page puts it: its thumbnail until the reader presses play, then YouTube's player in its place, the
/// same size. Under it the way to YouTube (the video's credit, as the site's "Video gốc") and, once it plays, full
/// screen; then its caption, whose chapters seek it. A video id the player won't take, or a video YouTube's player
/// refused: its thumbnail opens YouTube. Each control names its video, as a page can have a few.
struct VideoSlot: View {
  let id: String
  let title: String
  let caption: AttributedString
  /// Its caption (its title first) straight under its picture, before the way to YouTube, as v2's row of videos has it.
  var captionUnder = false
  /// The page's own video (a video guide's, at its top): its card's photo, the poster, in the thumbnail's place, by the
  /// frame rule; with none, the poster's place in its colour. YouTube's thumbnail never shows there (the Design Lead's
  /// frames, 14 Nov).
  var head: PageDoc.Video?
  @State private var colour: Color?
  @Environment(PagePlayer.self) private var player
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openURL) private var openURL

  var body: some View {
    let outside = !PageDoc.isYouTubeId(id) || player.refused.contains(id)
    VStack(alignment: .leading, spacing: 6) {
      ZStack {
        if let web {
          PlayerHost(web: web, holds: !player.full, label: String(localized: "Video: \(title)"), name: "video-player",
                     gone: { [player, weak web] in if let web { player.gone(web) } })
        }
        if web == nil || !player.playing {
          Button {
            if outside { openURL(PagePlayer.watch(id, at: 0)) } else { player.play(id, at: 0, lang: handbook.lang, site: handbook.site) }
          } label: {
            picture
              .overlay {
                if web == nil || player.over {
                  Image(systemName: "play.circle.fill").font(.system(size: 56)).foregroundStyle(.white, .black.opacity(0.45))
                } else {
                  ProgressView().controlSize(.large).tint(.white)
                }
              }
          }
          .buttonStyle(.plain)
          .allowsHitTesting(web == nil || player.over)
          .accessibilityLabel(Text("Phát video: \(title)"))
        }
      }
      .aspectRatio(16 / 9, contentMode: .fit)
      .clipShape(.rect(cornerRadius: 10))
      if captionUnder, !caption.characters.isEmpty { Text(caption).font(.subheadline).fixedSize(horizontal: false, vertical: true) }
      HStack(spacing: 16) {
        // A link out of the app, read as one.
        Link(destination: PagePlayer.watch(id, at: 0)) {
          Label("Xem trên YouTube", systemImage: "arrow.up.right.square").frame(minHeight: 44).contentShape(.rect)
        }
        .accessibilityLabel(Text("Xem trên YouTube: \(title)"))
        .accessibilityRemoveTraits(.isButton)
        .accessibilityAddTraits(.isLink)
        Spacer(minLength: 0)
        if web != nil {
          Button { player.full = true } label: {
            Label("Toàn màn hình", systemImage: "arrow.up.left.and.arrow.down.right").frame(minHeight: 44).contentShape(.rect)
          }
          .accessibilityLabel(Text("Toàn màn hình: \(title)"))
          .accessibilityIdentifier("video-full")
        }
      }
      .font(.footnote)
      .tint(.secondary)
      if player.failed == id { Text("Không mở được video. Kiểm tra mạng rồi thử lại.").font(.footnote).foregroundStyle(Color.warning) }
      if player.refused.contains(id) { Text("Video này chỉ xem được trên YouTube.").font(.footnote).foregroundStyle(.secondary) }
      if !captionUnder, !caption.characters.isEmpty { Text(caption).font(.footnote).foregroundStyle(.secondary) }
    }
    .id(PagePlayer.anchor(id))
    .onDisappear { player.leave(id) }
    .fullScreenCover(isPresented: Binding(get: { player.full && web != nil }, set: { player.full = $0 })) {
      if let web { FullVideo(player: player, web: web, title: title).ownerScreen("video full screen") }
    }
  }

  @ViewBuilder private var picture: some View {
    if let head {
      V2Photo(src: head.poster?.src, box: head.poster?.box, ground: colour) { colour = $0 }.aspectRatio(16 / 9, contentMode: .fit)
    } else {
      PageImage(src: PageDoc.thumbnail(id), ratio: 16 / 9, corner: 0)
    }
  }

  /// The player's web view while it plays this video. Read where it's needed, not kept in a closure: a view value SwiftUI
  /// keeps (on a tab not showing) mustn't keep a web view let go of.
  private var web: WKWebView? { player.id == id ? player.web : nil }
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
  /// The player's, which keeps it: one let go of goes, even while SwiftUI keeps this value (on a tab not showing).
  weak var web: WKWebView?
  /// Whether this place has the player now: the page's while it isn't full screen, the cover's while it is.
  let holds: Bool
  let label: String
  let name: String
  var dragged: ((CGFloat, Bool) -> Void)?
  /// This place gone for good (its page closed).
  var gone: (() -> Void)?

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
    host.gone = gone
    host.adopt()
  }

  static func dismantleUIView(_ host: Host, coordinator: ()) { host.gone?() }

  final class Host: UIView, UIGestureRecognizerDelegate {
    /// The player's, which keeps it: one let go of goes, whether or not this place is drawn again.
    weak var web: WKWebView?
    var fits = false
    var dragged: ((CGFloat, Bool) -> Void)?
    var gone: (() -> Void)?

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

#if DEBUG
/// The players' web views made and those still alive, for UI tests (`-count-players`) to read: "made 2 alive 0" once
/// both are let go of. Read twice a second, as nothing says when a web view goes.
struct PlayerCount: View {
  var body: some View {
    if ProcessInfo.processInfo.arguments.contains("-count-players") {
      TimelineView(.periodic(from: .now, by: 0.5)) { _ in
        Text(verbatim: "made \(PagePlayer.madeCount) alive \(PagePlayer.made.allObjects.count)")
          .font(.system(size: 1)).opacity(0.01).allowsHitTesting(false).accessibilityIdentifier("players")
      }
    }
  }
}
#endif
