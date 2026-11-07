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
      }
      Tab("Khám phá", systemImage: "square.grid.2x2", value: Pick.browse) {
        BrowseHome(path: $handbookPath)
          .environment(\.v2OpenFull) { item in
            if ownFrom == nil { ownFrom = handbookPath.count }
            handbookPath.append(FullPage(item: item))
          }
      }
      Tab("Bể của tôi", systemImage: "fish", value: Pick.tanks) { TanksView(path: $tanksPath) }
      Tab("Đèn", systemImage: "lightbulb", value: Pick.lights) { LightsView() }
      Tab(value: Pick.search, role: .search) { HandbookView(path: $searchPath).v2StackLinks($searchPath) }
    }
    // The owner's: the bar stays whole on every screen, on the soft edge, no band behind it. The same two values go on
    // AquaTomeApp's Group for v1 too; these two lines go when they do.
    .v2WholeTabBar()
    // A link opening a tab or a page (AquaTomeApp.open): its tab here. A page pushed on the handbook's stack shows on
    // Khám phá, whichever tab was in front; one on the tanks' stack, on Bể của tôi.
    .onChange(of: tab) { follow(tab) }
    .onChange(of: handbookPath.count) { old, new in
      if new > old { selection = .browse }
      if let f = ownFrom, new <= f { ownFrom = nil }
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
  @ViewBuilder func v2WholeTabBar() -> some View {
    if #available(iOS 26, *) { tabBarMinimizeBehavior(.never).scrollEdgeEffectStyle(.soft, for: .bottom) } else { self }
  }
}

extension EnvironmentValues {
  /// A fish's whole page (v1's, FullPage) pushed on the stack in front ("Xem trang đầy đủ"), counted for switching back
  /// to v1 (V2Root).
  @Entry var v2OpenFull: (HandbookIndex.Item) -> Void = { _ in }
}

@available(iOS 18, *)
private struct Destinations: ViewModifier {
  let zoom: Namespace.ID
  @Environment(HandbookModel.self) private var handbook

  func body(content: Content) -> some View {
    content
      .navigationDestination(for: HandbookIndex.Item.self) { item in
        Group {
          if item.kind == .fish { SpeciesPage(item: item) } else { PageView(item: item, url: handbook.url(item)) }
        }
        .navigationTransition(.zoom(sourceID: item.path, in: zoom))
      }
      .navigationDestination(for: FullPage.self) { PageView(item: $0.item, url: handbook.url($0.item)) }
      .navigationDestination(for: Browse.self) { BrowseView(browse: $0) }
      .navigationDestination(for: VolumeTool.self) { TankVolumeView(query: $0.query) }
      .navigationDestination(for: FishIdRoute.self) { _ in FishIdView() }
      .navigationDestination(for: SitePage.self) { WebScreen(url: $0.url) }
      .navigationDestination(for: TankMatesTool.self) { TankMatesView(query: $0.query) }
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
