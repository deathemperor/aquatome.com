import Handbook
import SwiftUI

/// The app's v2 (the App Store's approach: editorial cards that open into their pages, artwork-led shelves, colour drawn
/// from the photos), behind "Giao diện mới (thử nghiệm)" in the Tài khoản sheet: `v2` in UserDefaults, off by default.
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
          .environment(\.v2OpenFull) { item in
            if todayOwnFrom == nil { todayOwnFrom = todayPath.count }
            todayPath.append(FullPage(item: item))
          }
          .v2ClearUnderTabBar()
      }
      Tab("Khám phá", systemImage: "square.grid.2x2", value: Pick.browse) {
        BrowseHome(path: $handbookPath, front: selection == .browse)
          .environment(\.v2OpenFull) { item in
            if ownFrom == nil { ownFrom = handbookPath.count }
            handbookPath.append(FullPage(item: item))
          }
          .v2ClearUnderTabBar()
      }
      // v1's screens: a fade of a set height, as their ends have no room for one that grows with the text.
      Tab("Bể của tôi", systemImage: "fish", value: Pick.tanks) {
        TanksView(path: $tanksPath).v2ClearUnderTabBar(on: Color(.systemGroupedBackground), fade: V2Fade.height)
      }
      Tab("Đèn", systemImage: "lightbulb", value: Pick.lights) { LightsView().v2ClearUnderTabBar(on: Color(.systemGroupedBackground), fade: 10) }
      Tab(value: Pick.search, role: .search) {
        HandbookView(path: $searchPath).v2StackLinks($searchPath).v2ClearUnderTabBar(on: Color(.systemGroupedBackground), fade: V2Fade.height)
      }
    }
    // The owner's: no band behind the tab bar, and nothing through its glass (ClearUnderTabBar on each tab).
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

/// Whether this build offers v2's switch: debug and TestFlight builds, not the App Store's, until the owner says so.
enum V2Switch {
  static var offered: Bool {
    #if DEBUG
    true
    #else
    Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt"
    #endif
  }
}

@available(iOS 18, *)
extension View {
  /// The pages, shelves and tools a v2 stack opens; a page from a card or shelf zooms out of it (`zoom`, the card's
  /// `matchedTransitionSource`). A fish opens v2's page, the others v1's.
  func v2Destinations(zoom: Namespace.ID) -> some View { modifier(Destinations(zoom: zoom)) }

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

/// A tab's screens fade out just above the tab bar, so nothing shows through its glass or around it (the owner: words
/// through the bar). iOS's own edges can't do it: the soft one leaves the words legible in the glass, and the hard one cuts
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

  func body(content: Content) -> some View {
    if #available(iOS 26, *) {
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
  /// A fish's whole page (v1's, FullPage) pushed on the stack in front ("Xem trang đầy đủ"), counted for switching back
  /// to v1 (V2Root).
  @Entry var v2OpenFull: (HandbookIndex.Item) -> Void = { _ in }
  /// What the tab stands on under its bar and fade, for a page whose colour reaches them (ClearUnderTabBar).
  @Entry var v2FootGround: Binding<FootGround?>?
  /// How many times the screen has been asked again ("Thử lại", a pull to refresh): a photo that didn't come tries again.
  @Entry var v2PhotoTries = 0
}

/// The colour a page has the tab stand on, and whose it is: two pages can have the same one. Whose by the page itself, not
/// its fish: the same fish can be open twice, one over the other (a link to it from outside).
struct FootGround: Equatable {
  let page: UUID
  let colour: Color
}

@available(iOS 18, *)
private struct Destinations: ViewModifier {
  let zoom: Namespace.ID
  @Environment(HandbookModel.self) private var handbook

  func body(content: Content) -> some View {
    content
      .navigationDestination(for: HandbookIndex.Item.self) { item in
        Group {
          if item.kind == .fish { SpeciesPage(item: item) } else { PageView(item: item, url: handbook.url(item)).v2ClearOfTheFade() }
        }
        .navigationTransition(.zoom(sourceID: item.path, in: zoom))
      }
      .navigationDestination(for: FullPage.self) { PageView(item: $0.item, url: handbook.url($0.item)).v2ClearOfTheFade() }
      .navigationDestination(for: Browse.self) { BrowseView(browse: $0).v2ClearOfTheFade() }
      .navigationDestination(for: VolumeTool.self) { TankVolumeView(query: $0.query).v2ClearOfTheFade() }
      .navigationDestination(for: FishIdRoute.self) { _ in FishIdView().v2ClearOfTheFade() }
      // Not clear of the fade: the chat hides the tab bar, and its box sits at the foot of the screen.
      .navigationDestination(for: ChatRoute.self) { ChatView(route: $0) }
      .navigationDestination(for: SitePage.self) { WebScreen(url: $0.url).v2ClearOfTheFade() }
      .navigationDestination(for: TankMatesTool.self) { TankMatesView(query: $0.query).v2ClearOfTheFade() }
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
