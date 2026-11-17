import Handbook
import SwiftUI
import UIKit

/// The app's v2 (the App Store's approach: editorial cards that open into their pages, artwork-led shelves, colour drawn
/// from the photos): the app's look, unless the reader turns the old one on in the Tài khoản sheet (V2Switch).
/// It runs on the app's own models (AquaTomeApp's environment), so switching back and forth keeps the tanks, the
/// account and the pages kept and saved. Its tabs: Hôm nay; Khám phá, the handbook's shelves, where links from pages and
/// from outside the app open (v1's Tìm tab, `handbookPath`); Bể của tôi and Đèn, v1's own; and Tìm, the search tab
/// (v1's Tìm screen as it is, its search and its lists; a fish found there opens v1's page).
@available(iOS 18, *)
struct V2Root: View {
  /// v1's tab: the app's links set it (AquaTomeApp.open), and v2 follows; v2 sets it for the tabs both have.
  @Binding var tab: AquaTomeApp.Tab
  @Binding var handbookPath: NavigationPath
  @Binding var tanksPath: NavigationPath
  @State private var selection = Pick.today
  @State private var todayPath = NavigationPath()
  @State private var searchPath = NavigationPath()
  @Environment(HandbookModel.self) private var handbook
  /// Where the first of v2's own screens (FullPage) sits on `handbookPath`, which v1 shares, and on Hôm nay's: v1 has no
  /// screen for it, so switching back cuts the path there.
  @State private var ownFrom: Int?
  @State private var todayOwnFrom: Int?

  enum Pick: Hashable { case today, browse, tanks, lights, search }

  var body: some View {
    TabView(selection: $selection) {
      Tab("Hôm nay", systemImage: "sparkles", value: Pick.today) {
        TodayView(path: $todayPath)
          .environment(\.v2OpenFull) { item, at in
            if todayOwnFrom == nil { todayOwnFrom = todayPath.count }
            todayPath.append(FullPage(item: item, at: at))
          }
          .v2ClearUnderTabBar()
      }
      Tab("Khám phá", systemImage: "square.grid.2x2", value: Pick.browse) {
        BrowseHome(path: $handbookPath, front: selection == .browse)
          .environment(\.v2OpenFull) { item, at in
            if ownFrom == nil { ownFrom = handbookPath.count }
            handbookPath.append(FullPage(item: item, at: at))
          }
          .v2ClearUnderTabBar()
      }
      // v1's screens: a fade of a set height, as their ends have no room for one that grows with the text.
      Tab("Bể của tôi", systemImage: "fish", value: Pick.tanks) {
        TanksView(path: $tanksPath).v2ClearUnderTabBar(on: Color(.systemGroupedBackground), fade: V2Fade.height)
      }
      Tab("Đèn", systemImage: "lightbulb", value: Pick.lights) { LightsView().v2ClearUnderTabBar(on: Color(.systemGroupedBackground), fade: 10) }
      Tab(value: Pick.search, role: .search) {
        HandbookView(path: $searchPath).v2StackLinks($searchPath)
          .environment(\.v2Pages, true)
          .environment(\.v2OpenFull) { item, at in searchPath.append(FullPage(item: item, at: at)) }
          .v2ClearUnderTabBar(on: Color(.systemGroupedBackground), fade: V2Fade.height)
      }
    }
    // The owner's: no band behind the tab bar, and nothing through its glass (ClearUnderTabBar on each tab), unless the
    // owner is trying the page through it (TabBarGlass).
    .v2NoBottomEdge()
    // A link opening a tab or a page (AquaTomeApp.open): its tab here. A page pushed on the handbook's stack shows on
    // Khám phá, whichever tab was in front; one on the tanks' stack, on Bể của tôi.
    .onChange(of: tab) { follow(tab) }
    // From another tab this stack changes only by a link (the kept pages' row replaces it, whatever its length).
    .onChange(of: handbookPath) { _, new in
      if !new.isEmpty { selection = .browse }
      if let f = ownFrom, new.count <= f { ownFrom = nil }
    }
    .onChange(of: todayPath.count) { if let f = todayOwnFrom, todayPath.count <= f { todayOwnFrom = nil } }
    .onChange(of: tanksPath) { if !tanksPath.isEmpty { selection = .tanks } }
    .onChange(of: selection) {
      switch selection {
      case .browse, .today, .search: if tab != .handbook { tab = .handbook }
      case .tanks: tab = .tanks
      case .lights: tab = .lights
      }
    }
    .onAppear { follow(tab) }
    // "Tìm trong cẩm nang" in a chat open on any of the stacks: the search tab at its top, holding the words.
    .onChange(of: handbook.searchAsked) {
      todayPath = NavigationPath()
      searchPath = NavigationPath()
      selection = .search
    }
    .ownerShowsTab("\(selection)")
    // Switched back to v1: its Tìm tab shows `handbookPath`, up to the first screen only v2 draws; with nothing open on
    // Khám phá, what Hôm nay had open, or else the search tab (which pushes only v1's own screens).
    .onDisappear {
      if let f = ownFrom, handbookPath.count > f { handbookPath.removeLast(handbookPath.count - f) }
      if let f = todayOwnFrom, todayPath.count > f { todayPath.removeLast(todayPath.count - f) }
      if handbookPath.isEmpty { handbookPath = todayPath.isEmpty ? searchPath : todayPath }
    }
    // The app's home from outside (`aquatome://`, the site's home): AquaTomeApp empties Khám phá's stack, which v2 can't
    // tell from no change; v2's home is Hôm nay, at its top.
    .onOpenURL { url in
      guard AppLink.of(url, site: handbook.site) == .home else { return }
      todayPath = NavigationPath()
      searchPath = NavigationPath()
      selection = .today
    }
  }

  private func follow(_ tab: AquaTomeApp.Tab) {
    switch tab {
    case .tanks: selection = .tanks
    case .lights: selection = .lights
    case .handbook: if selection == .tanks || selection == .lights { selection = .browse }
    }
  }
}

/// v2 or the old look. v2 is the app's look for everyone (the owner, 2026-11-08), installs from before too: on unless
/// the reader turned it off by hand (a stored false), where it stays off. The Tài khoản sheet's switch offers the old
/// look back; iOS 17 has the old look alone, as v2 needs iOS 18. `-v2 NO` gives a launch the old look, `-v2 YES` v2.
enum V2Switch {
  /// The UserDefaults key, and its value where the reader never set it.
  static let key = "v2"
  static let byDefault = true
}

@available(iOS 18, *)
extension View {
  /// The pages, shelves and tools a v2 stack opens. A fish opens v2's page, the others v1's.
  func v2Destinations() -> some View { modifier(Destinations()) }

  /// Links in the pages of a v2 stack (a page's link to another, a group, a tool) push on that stack, not on Khám phá's;
  /// the app's own tabs (tanks, lights, the account) open as everywhere.
  func v2StackLinks(_ path: Binding<NavigationPath>) -> some View { modifier(StackLinks(path: path)) }
}

private extension View {
  /// iOS's own edge off, for the fade (ClearUnderTabBar). The bar stays whole by the app's Group (`tabBarNeverMinimizes`).
  @ViewBuilder func v2NoBottomEdge() -> some View {
    if #available(iOS 26, *) { scrollEdgeEffectHidden(true, for: .bottom) } else { self }
  }

  /// `ground`: what the tab's pages stand on, if it isn't the screen's own (a grouped list's grey), so the fade doesn't
  /// show a lighter band.
  /// `fade` shorter where a pinned footer of v1's ends just above the bar; otherwise it grows with the text.
  func v2ClearUnderTabBar(on ground: Color = .clear, fade: CGFloat? = nil) -> some View {
    modifier(ClearUnderTabBar(ground: ground, fade: fade))
  }
}

enum V2Fade {
  static let height: CGFloat = 24
  /// iOS stops growing a large title short of the largest text, so how far it takes to go up stops too.
  static let largeTitleAtMost: CGFloat = 72
}

extension View {
  /// A stack whose page may stand the tab on its colour: clear as it goes back to its first screen, which has none, not once
  /// the page has gone (a tab's second tap). A page's own back clears its colour itself, so the one it goes back to keeps
  /// its own: cleared here, a fish's page under another's would lose it, as it sets it before this runs.
  func v2ClearsFootGoingBack(_ depth: Int) -> some View { modifier(ClearsFootGoingBack(depth: depth)) }

  /// A scroll view of v2's own: its end stops above the fade over the tab bar, not in it.
  func v2ClearOfTheFade() -> some View { modifier(ClearOfTheFade()) }
}

private struct ClearsFootGoingBack: ViewModifier {
  let depth: Int
  @Environment(\.v2FootGround) private var footGround

  func body(content: Content) -> some View {
    content.onChange(of: depth) { _, new in if new == 0 { footGround?.wrappedValue = nil } }
  }
}

private struct ClearOfTheFade: ViewModifier {
  @ScaledMetric(relativeTo: .body) private var fade = V2Fade.height
  func body(content: Content) -> some View { content.safeAreaPadding(.bottom, fade) }
}

/// The owner's trial of the tab bar as the App Store's (11 Nov: "Try bottom bar glass effect like Appstore's"): the page
/// runs under the bar and shows through its glass, with no edge and no fade. Theirs alone, on from the build it came in;
/// off in Tài khoản → Ứng dụng brings the fade back at once. Everyone else keeps the fade.
enum TabBarGlass {
  static let key = "tabBarGlassTrial"
}

/// A tab's screens fade out just above the tab bar, so nothing shows through its glass or around it (the owner: words
/// through the bar). For the owner trying it (TabBarGlass), the page passes under the bar instead, on its ground. iOS's own edges can't do it: the soft one leaves the words legible in the glass, and the hard one cuts
/// them on a line with a band under it. A tab's own, not each page's: it holds for every page of the tab, v1's too.
private struct ClearUnderTabBar: ViewModifier {
  let ground: Color
  /// The fade's height, if it's a set one. Short: v1's pinned controls end just above it. v2's own pages end above it
  /// (`v2ClearOfTheFade`); an inset out here doesn't reach inside a navigation stack.
  let fade: CGFloat?
  /// Otherwise as tall as a line of the text, near enough: a line at the largest size is gone before the glass.
  @ScaledMetric(relativeTo: .body) private var scaled = V2Fade.height
  /// What a page asks to stand on while its colour reaches the bar (`v2FootGround`): the colour runs on under the bar,
  /// with no white fog between.
  @State private var footGround: FootGround?
  /// The bar's height with what's under it. Not the keyboard's: above that, nothing is under a bar.
  @State private var bar: CGFloat = 0
  @AppStorage(TabBarGlass.key) private var trial = true
  @Environment(AccountModel.self) private var account

  func body(content: Content) -> some View {
    if #available(iOS 26, *), trial, account.owner.isOwner == true, account.user != nil {
      // Through the glass: no mask and nothing over the bar's place, the ground still behind it all.
      content
        .environment(\.v2FootGround, $footGround)
        .background { (footGround?.colour ?? ground).ignoresSafeArea().animation(.easeInOut(duration: 0.2), value: footGround) }
    } else if #available(iOS 26, *) {
      content
        .environment(\.v2FootGround, $footGround)
        .background {
          Color.clear.ignoresSafeArea(.keyboard).onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.bottom } action: { bar = $0 }
        }
        .mask {
          VStack(spacing: 0) {
            Color.black
            // A bar at the foot of the screen; an iPad's is at the top, with only the home indicator's inset here.
            if bar >= 49 {
              LinearGradient(colors: [.black, .clear], startPoint: .top, endPoint: .bottom).frame(height: fade ?? scaled)
              Color.clear.frame(height: bar)
            }
          }
          .ignoresSafeArea()
        }
        .background { (footGround?.colour ?? ground).ignoresSafeArea().animation(.easeInOut(duration: 0.2), value: footGround) }
        // A mask hides what's under it but leaves it live: a tap beside or under the bar stops here, not on a card that
        // can't be seen. VoiceOver still reaches what's hidden, and scrolls it into view.
        .overlay {
          if bar >= 49 {
            VStack(spacing: 0) {
              Spacer(minLength: 0)
              Color.clear.contentShape(.rect).frame(height: bar).onTapGesture {}.accessibilityHidden(true)
            }
            .ignoresSafeArea()
          }
        }
    } else {
      content
    }
  }
}

extension EnvironmentValues {
  /// A fish's or plant's page as v1 draws it (FullPage), pushed on the stack in front where v2's holds a part it can't draw
  /// ("Xem phần này ở trang đầy đủ"), counted for switching back to v1 (V2Root).
  @Entry var v2OpenFull: (HandbookIndex.Item, _ at: String?) -> Void = { _, _ in }
  /// On v2's search tab, whose screen is v1's (HandbookView): a fish's or plant's page opens as v2 draws it there too.
  @Entry var v2Pages = false
  /// What the tab stands on under its bar and fade, for a page whose colour reaches them (ClearUnderTabBar).
  @Entry var v2FootGround: Binding<FootGround?>?
  /// Hôm nay's posts (`Post`), on Hôm nay's stack; nil on the others.
  @Entry var v2Posts: Posts?
  /// How many times the screen has been asked again ("Thử lại", a pull to refresh): a photo that didn't come tries again.
  @Entry var v2PhotoTries = 0
}

/// The colour a page has the tab stand on, and whose it is: two pages can have the same one. Whose by the page itself, not
/// its fish: the same fish can be open twice, one over the other (a link to it from outside).
struct FootGround: Equatable {
  let page: UUID
  let colour: Color
}

/// A page a Hôm nay card opens: a post, as the App Store's Today stories (the owner, 12 Nov: "for today posts they only
/// support left edge swipe and close button"). It's pushed full screen, with iOS's back drawn as ✕ (`PostBack`), so iOS's
/// swipe from the left edge takes it back at any speed. A page opened from inside it has iOS's own back button, and no
/// tab bar either (spec-post-push.md, 13 Nov).
struct Post: Hashable {
  let item: HandbookIndex.Item
}

/// A list a Hôm nay card opens ("Mới cập nhật"'s "Xem tất cả"), a post as its pages are (spec-post-push.md).
struct PostList: Hashable {
  let browse: Browse
}

/// Hôm nay's posts: whether one is open.
struct Posts {
  var open: Binding<Bool>
}

@available(iOS 18, *)
private struct Destinations: ViewModifier {
  @Environment(HandbookModel.self) private var handbook
  /// Hôm nay's stack only.
  @Environment(\.v2Posts) private var posts

  func body(content: Content) -> some View {
    content
      // Pushed with iOS's own push and back button: its swipe from the left edge follows the finger, as in Settings.
      .navigationDestination(for: HandbookIndex.Item.self) { page($0).modifier(ClosesPost(posts: posts, always: false)) }
      // A post is pushed as any page (spec-post-push.md, 13 Nov): iOS's push and pop, which go back at any speed, where the
      // zoom's swipe ignored a quick one. Its way out is iOS's own back button, drawn as ✕ (`PostBack`).
      .navigationDestination(for: Post.self) { post in
        page(post.item)
          .background(PostBack())
          .modifier(ClosesPost(posts: posts, always: true))
          .onAppear { posts?.open.wrappedValue = true }
      }
      .navigationDestination(for: PostList.self) { post in
        BrowseView(browse: post.browse).v2ClearOfTheFade()
          .background(PostBack())
          .modifier(ClosesPost(posts: posts, always: true))
          .onAppear { posts?.open.wrappedValue = true }
      }
      .navigationDestination(for: FullPage.self) {
        PageView(item: $0.item, url: handbook.url($0.item), at: $0.at).v2ClearOfTheFade().modifier(ClosesPost(posts: posts, always: false))
      }
      .navigationDestination(for: Browse.self) { BrowseView(browse: $0).v2ClearOfTheFade().modifier(ClosesPost(posts: posts, always: false)) }
      .navigationDestination(for: ChipRoute.self) { ChipPage(shelf: $0.shelf).v2ClearOfTheFade().modifier(ClosesPost(posts: posts, always: false)) }
      .navigationDestination(for: VolumeTool.self) { TankVolumeView(query: $0.query).v2ClearOfTheFade().modifier(ClosesPost(posts: posts, always: false)) }
      .navigationDestination(for: FishIdRoute.self) { _ in FishIdView().v2ClearOfTheFade().modifier(ClosesPost(posts: posts, always: false)) }
      // Not clear of the fade: the chat hides the tab bar, and its box sits at the foot of the screen.
      .navigationDestination(for: ChatRoute.self) { ChatView(route: $0).modifier(ClosesPost(posts: posts, always: false)) }
      .navigationDestination(for: SitePage.self) { WebScreen(url: $0.url).v2ClearOfTheFade().modifier(ClosesPost(posts: posts, always: false)) }
      .navigationDestination(for: TankMatesTool.self) { TankMatesView(query: $0.query).v2ClearOfTheFade().modifier(ClosesPost(posts: posts, always: false)) }
  }

  /// A fish's or a plant's page is v2's own, the whole page; the others v1's.
  @ViewBuilder private func page(_ item: HandbookIndex.Item) -> some View {
    if item.kind == .fish || item.kind == .plant {
      SpeciesPage(item: item)
    } else {
      PageView(item: item, url: handbook.url(item)).v2ClearOfTheFade()
    }
  }
}

private struct ClosesPost: ViewModifier {
  let posts: Posts?
  let always: Bool

  func body(content: Content) -> some View {
    // Full screen: no tab bar on a post, nor on a page pushed inside it (spec-post-push.md).
    if let posts, always || posts.open.wrappedValue {
      content.toolbar(.hidden, for: .tabBar)
    } else {
      content
    }
  }
}

/// A post's way out (spec-post-push.md, 13 Nov): iOS's own back button, its glass circle, its place and its swipe, with ✕
/// for its symbol and read "Đóng". Set on the post's own item, so a page pushed inside the post keeps iOS's chevron; the
/// title the back reads is Hôm nay's, so Hôm nay's back title is "Đóng", shown as the symbol alone.
private struct PostBack: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> Holder { Holder() }
  func updateUIViewController(_ holder: Holder, context: Context) { holder.apply() }

  final class Holder: UIViewController {
    /// Hôm nay's back item as it was before the post set its own: put back once the post has gone, so a page pushed on
    /// Hôm nay that isn't a post never reads "Đóng" (Design, 17 Nov).
    private weak var below: UINavigationItem?
    private var was: (item: UIBarButtonItem?, title: String?, mode: UINavigationItem.BackButtonDisplayMode)?

    override func viewWillAppear(_ animated: Bool) {
      super.viewWillAppear(animated)
      apply()
    }

    override func viewDidDisappear(_ animated: Bool) {
      super.viewDidDisappear(animated)
      // Gone, not covered by a page inside it: no longer on its stack.
      guard let post = screen(), post.navigationController?.viewControllers.contains(post) != true,
            let below, let was else { return }
      below.backBarButtonItem = was.item
      below.backButtonTitle = was.title
      below.backButtonDisplayMode = was.mode
      self.was = nil
    }

    /// The screen the post is on: the controller this sits in that the navigation stack holds.
    private func screen() -> UIViewController? {
      var screen: UIViewController? = self
      while let s = screen, !(s.parent is UINavigationController) { screen = s.parent }
      return screen
    }

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      apply()
    }

    func apply() {
      guard let post = screen(), let nav = post.navigationController, let at = nav.viewControllers.firstIndex(of: post), at > 0 else { return }
      let below = nav.viewControllers[at - 1].navigationItem
      if was == nil {
        was = (below.backBarButtonItem, below.backButtonTitle, below.backButtonDisplayMode)
        self.below = below
      }
      let close = String(localized: "Đóng")
      #if DEBUG
      // PROBE, not for merge (15 Nov): iOS's minimal back reads "Quay lại", not the title. `-post-back item|view`.
      let way = UserDefaults.standard.string(forKey: "post-back") ?? "item"
      #else
      let way = "item"
      #endif
      if way == "item" {
        // The back's own item, so VoiceOver reads it as the ✕ it's drawn as; the title isn't shown (minimal).
        if below.backBarButtonItem?.accessibilityLabel != close {
          let item = UIBarButtonItem(title: close, style: .plain, target: nil, action: nil)
          item.accessibilityLabel = close
          below.backBarButtonItem = item
        }
      } else {
        below.backButtonTitle = close
        DispatchQueue.main.async {
          Self.views(in: nav.navigationBar).first { $0.accessibilityIdentifier == "BackButton" }?.accessibilityLabel = close
        }
      }
      below.backButtonDisplayMode = .minimal
      let x = UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(weight: .semibold))
      func closing(_ a: UINavigationBarAppearance?) -> UINavigationBarAppearance {
        let b = (a ?? nav.navigationBar.standardAppearance).copy()
        b.setBackIndicatorImage(x, transitionMaskImage: x)
        return b
      }
      let item = post.navigationItem
      item.standardAppearance = closing(item.standardAppearance)
      item.scrollEdgeAppearance = closing(item.scrollEdgeAppearance ?? item.standardAppearance)
      item.compactAppearance = closing(item.compactAppearance ?? item.standardAppearance)
    }

    private static func views(in v: UIView) -> [UIView] { [v] + v.subviews.flatMap { views(in: $0) } }
  }
}

private struct StackLinks: ViewModifier {
  @Binding var path: NavigationPath
  @Environment(\.openScreen) private var parent
  @Environment(HandbookModel.self) private var handbook

  func body(content: Content) -> some View {
    content
      .environment(\.openScreen) { screen in
        switch screen {
        case .page(let p): if let item = handbook.item(at: p) { path.append(item) }
        case .group(let g): path.append(Browse.fish(g))
        case .tankVolume(let q): path.append(VolumeTool(query: q))
        case .tankMates(let q): path.append(TankMatesTool(query: q))
        case .fishId: path.append(FishIdRoute())
        default: parent(screen)
        }
      }
  }
}
