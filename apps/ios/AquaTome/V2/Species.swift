import Handbook
import SwiftUI
import Telemetry

/// v1's page for a fish or plant, as v2's species page offers it where it holds a part this build can't draw ("Xem phần
/// này ở trang đầy đủ"): the whole page as v1 draws it, or the site's.
struct FullPage: Hashable {
  let item: HandbookIndex.Item
  /// The part it's opened for (its heading's id), where it opens.
  var at: String?
}

/// A fish's or plant's page, as an app's page in the App Store: its photo across the top and the photo's colour washing down
/// behind the name, "Thêm vào bể", the facts strip and the rest of its photos (each full screen, tapped); then the
/// summary with its common mistakes, a northern winter, the tank-mates shelves with the tank-mates tool, and the rest of
/// the page in its own order (PagePart): its sections, a long one folded to its first lines over "thêm", its breeds,
/// the guides that mention it, its videos, its readers' photos and comments, and its sources. All of it here: a part
/// this build can't draw offers v1's page at that point.
@available(iOS 18, *)
struct SpeciesPage: View {
  let item: HandbookIndex.Item

  init(item: HandbookIndex.Item) {
    self.item = item
    _colour = State(initialValue: PhotoColour.cached(item.img) ?? PhotoColour.fallback)
  }

  @Environment(HandbookModel.self) private var handbook
  @Environment(TanksModel.self) private var tanks
  @Environment(\.openScreen) private var openScreen
  @Environment(\.openURL) private var openURL
  @Environment(\.v2OpenFull) private var openFull
  /// A Hôm nay post's ✕ (`Post`), on the post and on a page opened inside it.
  @Environment(\.v2PostClose) private var closePost
  /// A post itself has no back button: the bar's room starts at the screen's edge.
  @Environment(\.v2IsPost) private var isPost
  @Environment(TelemetryModel.self) private var telemetry
  @Environment(\.scenePhase) private var phase
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.accessibilityReduceTransparency) private var opaque
  @Environment(\.v2FootGround) private var footGround
  @Environment(AccountModel.self) private var account
  @Environment(ChatStore.self) private var chat
  /// The way round a long page (PageNavigator), its title in the bar: the owner's alone for now.
  @State private var navigator = PageNavigator()
  /// This page being read, how far down and how long, as v1's page reports it (made when it first shows).
  @State private var reading: PageReading?
  @State private var doc: PageDoc?
  /// Its parts and their pieces, worked out once when it comes, not on each redraw while it scrolls.
  @State private var whole: WholeParts?
  /// Its videos' player, one at a time, as v1's page has it.
  @State private var player = PagePlayer()
  /// A word's tip shown, tapped in the text.
  @State private var tip: Tip?
  /// A page of the site's the app can't show itself, in the app.
  @State private var onSite: URL?
  /// Its parts opened past their fold ("thêm", or a chip to them).
  @State private var opened: Set<Int> = []
  /// The page has been asked for: nil after this, it didn't come (offline, and not kept).
  @State private var asked = false
  /// "Thử lại" pressed, so many times.
  @State private var retries = 0
  @Environment(\.dynamicTypeSize) private var size
  @State private var colour: Color
  @State private var putting = false
  @State private var foldMemo = FoldMemo()
  /// The gallery's photo shown full screen.
  @State private var viewing: Int?
  /// The page's photo grid (PhotoGrid), open where its way in opens it.
  @State private var gridAt: PhotoGrid.Place?
  /// Its readers' photos, as the site answered: nil until it has. Shared by its readers' part and the grid.
  @State private var readerPhotos: [Readers.Photo]?
  /// The page's first words have reached the bar: the band behind it shows.
  @State private var scrolled = false
  /// The name itself has gone under the bar: the bar says it from here, not above the name still on the page.
  @State private var nameGone = false
  /// The page's width and place, the bar's middle, its buttons' inner edges and the name's own width, for the name in the bar.
  @State private var width: CGFloat = 0
  /// The screen's height the page scrolls in, from its top under the status bar.
  @State private var viewport: CGFloat = 0
  /// The page has moved from its top: over a whole head, the band comes now, as the photo goes under the bar.
  @State private var moved = false
  @State private var origin = CGPoint.zero
  @State private var barMid: CGFloat = 0
  /// Where the bar's buttons on the right begin.
  @State private var trailStart: CGFloat = 0
  /// Saved or unsaved from the ⋯, which shows no bookmark: a tap felt (`sensoryFeedback`).
  @State private var savedFromMore = 0
  @State private var nameWidth: CGFloat = 0
  /// Whether the name in the bar sits in the room's middle, not the screen's, held from when it comes: the glass coming
  /// behind the buttons moves them a few points, which flipped a name near the limit from one to the other. Where and how
  /// wide follow the buttons as they are.
  @State private var inRoom: Bool?
  private struct BarPlace: Equatable { let x, room: CGFloat }
  /// The bar's foot on the screen.
  @State private var barFoot: CGFloat = 106
  /// Where the page's colour reaches: still under the top bar, and down into the fade over the tab bar.
  @State private var colourAt = ColourAt(top: true, foot: true)
  /// Shown, not under another page: only then may it set the colour under the tab bar. Under another, its photo can still
  /// come late and give it a colour, which would land under that page's foot.
  @State private var front = false
  /// This page, for the colour it puts under the tab bar (`FootGround`).
  @State private var me = UUID()
  private struct ColourAt: Equatable { var top, foot: Bool }

  /// The page's own photo, at the top.
  private var hero: String? { item.img ?? doc?.lead?.src }
  /// Where the fish is in `hero`: the index's for its photo, else the page's lead's. The card's photo is the head's.
  private var heroBox: PhotoBox? { item.img != nil ? item.imgBox : doc?.lead?.box }
  /// `hero`'s own shape (width over height): the photo's, once it's there, else the page's lead's (the same photo).
  @State private var heroShape: CGFloat?
  private var shape: CGFloat? { heroShape ?? doc?.lead.flatMap { $0.h > 0 ? CGFloat($0.w) / CGFloat($0.h) : nil } }
  /// The taller banner's height (`top`'s, in the scroll view): less on a small phone, so the name and figures still show
  /// under it; less again at the accessibility sizes, so "Thêm vào bể" opens above the fade over the tab bar, white, not in it.
  private var bannerHeight: CGFloat { min(420, viewport * (size.isAccessibilitySize ? 0.34 : 0.46)) }
  /// The photo's size where the banner would cut it (the frame rule says whole): the whole photo, its own shape, at the
  /// screen's width from the bar's foot, the bar and it 420 points at most, else smaller and centred; the credit and the
  /// name straight under it (Design's mock of 11 Nov, approved by the owner; the rulings of 14 Nov). None for a photo the
  /// banner holds.
  private var wholeHead: CGSize? {
    guard hero != nil, let a = shape, a > 0, width > 0, viewport > 0,
          PhotoFrame.of(aspect: a, box: heroBox, ratio: width / bannerHeight) == .whole else { return nil }
    let h = min(width / a, 420 - barFoot)
    return CGSize(width: h * a, height: h)
  }

  /// The page's other photos, its galleries' in order: the one at the top isn't repeated under it.
  private var photos: [PageDoc.Image] {
    guard let doc else { return [] }
    let top = Set([doc.lead?.src, item.img.map(V2Photo.full)].compactMap { $0 })
    var out: [PageDoc.Image] = []
    for case let .gallery(_, _, list, _, _) in doc.blocks {
      out += list.filter { p in !top.contains(V2Photo.full(p.src)) && !out.contains { $0.src == p.src } }
    }
    return out
  }

  /// Its figures from the index; a breed's from its own card, as v1's page has them.
  private var facts: HandbookIndex.Facts { item.facts.any ? item.facts : item.card ?? item.facts }

  var body: some View {
    framed
    // A Hôm nay post's ✕, at the bar's end after the bookmark and share: a toolbar of its own, inside theirs. iOS put the
    // items of a toolbar applied after theirs first, and one among them first too (27.2, 12 Nov).
    .toolbar(when: closePost != nil) {
      ToolbarItem(placement: .topBarTrailing) {
        Button { closePost?() } label: { round("xmark") }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("Đóng"))
          .accessibilityIdentifier("v2-close-post")
      }
      .v2Glass(inGlass)
    }
    // Over the photo and its colour, the bar and status bar in white. The page's own after them, never nil: iOS can keep the
    // dark one after nil, white words on the white band.
    .toolbarColorScheme(colourAt.top ? .dark : scheme, for: .navigationBar)
    .toolbar {
      // The owner's navigator on a long page: its title beside the back button, plain, in the bar so it takes a tap.
      if trying?.long == true, let trying {
        ToolbarItem(placement: .topBarLeading) {
          PageNavigatorTitle(nameInView: !nameGone, onColour: colourAt.top, onPhoto: overPhoto, navigator: trying)
            // A width of its own: offered "up to", the bar gave it next to none, "…" alone. Drawn a little wider than the bar
            // is told, into the room it keeps before the bookmark, for a section's name whole.
            .frame(width: titleWidth + 20, alignment: .leading)
            .frame(width: titleWidth, alignment: .leading)
            // The reader's text size, which the bar keeps from its items: at the accessibility sizes, the part alone, larger.
            .environment(\.dynamicTypeSize, size)
        }
        .v2Glass(false)
      }
      // Save and share in one ⋯, from the first screen, so the bar's items never change as the page scrolls (the owner,
      // 11 Nov: "2B", and "Save and share: go with your recommendation").
      ToolbarItem(placement: .topBarTrailing) {
        let saved = handbook.isSaved(item)
        Menu {
          Button(saved ? "Bỏ lưu" : "Lưu để đọc sau", systemImage: saved ? "bookmark.fill" : "bookmark") {
            handbook.toggleSaved(item)
            savedFromMore += 1
          }
          .accessibilityIdentifier("save-for-later")
          ShareLink(item: handbook.url(item)) { Label("Chia sẻ", systemImage: "square.and.arrow.up") }
        } label: {
          round("ellipsis")
            // Where the bar's middle is, and where its buttons on the right begin, for the name in it.
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).midY } action: { barMid = $0 }
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .global).minX } action: { trailStart = $0 }
        }
          .buttonStyle(.plain)
          .accessibilityLabel(Text("Thêm"))
          .accessibilityIdentifier("page-more")
      }
      .v2Glass(inGlass)
    }
    // The bookmark isn't in the bar to fill: a save from the ⋯ is felt.
    .sensoryFeedback(.success, trigger: savedFromMore)
    .v2PutOnTank(item, isPresented: $putting)
    .fullScreenCover(isPresented: Binding(get: { viewing != nil }, set: { if !$0 { viewing = nil } })) {
      GalleryViewer(note: galleryNote, photos: viewerPhotos, readers: nil, index: viewing ?? 0)
    }
    // Runs on each appearing too: nothing to do with the page here. A page that didn't come isn't one read.
    // "Thử lại" asks its photos again too.
    .environment(\.v2PhotoTries, retries)
    .task(id: "\(item.path) \(retries)") { await come() }
  }

  /// The page asked for, and worked out into its parts once.
  private func come() async {
    guard doc == nil else { return }
    // The whole index first only when it hasn't said this page's kind is drawn here: on a weak signal it holds up the page.
    if retries > 0, !handbook.drawsItself(item) { await handbook.load() }
    doc = await handbook.doc(item)
    whole = doc.map(WholeParts.init)
    asked = true
    if doc != nil { handbook.read(item) }
  }

  /// The page under its bar: the shade behind the status bar, the edge swipe back, the band, the bar's title and the
  /// navigator's list.
  private var framed: some View {
    page
    .navigationBarTitleDisplayMode(.inline)
    // The band behind the bar is the page's own (`ClearUnderTopBar`), on iOS 18 too.
    .toolbarBackground(.hidden, for: .navigationBar)
    // The page's own buttons, in the same places all the way down: on the photo and its colour, dark circles, as iOS 26's glass
    // goes light on them, under white symbols (2.4:1); glass after the colour.
    // A shade behind the status bar and the bar until the band comes: iOS's back button and the owner's Mục lục stand on the
    // photo with no circle of ours, so it holds through the bar for them (Design, 12 Nov: iOS's back on a white photo from
    // 2.4:1 to 3.5:1; `PageTop`). Under Reduce Motion it goes at once.
    .overlay(alignment: .top) {
      if hero != nil, wholeHead == nil {
        LinearGradient(stops: [.init(color: .black.opacity(PageTop.shadeOpacity), location: 0),
                               .init(color: .black.opacity(PageTop.shadeHeldOpacity), location: PageTop.shadeHeld),
                               .init(color: .clear, location: 1)], startPoint: .top, endPoint: .bottom)
          .frame(height: PageTop.shadeHeight)
          .ignoresSafeArea(edges: .top)
          .opacity(scrolled ? 0 : 1)
          .animation(reduceMotion ? nil : .easeInOut(duration: 0.2), value: scrolled)
          .allowsHitTesting(false)
      }
    }
    // Its colour off the tab as it starts to leave, iOS's edge swipe included; on again if the swipe is let go of.
    .background {
      PageLeaves { leaving in
        if !leaving { if front { standOnColour() } } else if footGround?.wrappedValue?.page == me { footGround?.wrappedValue = nil }
      }
      .frame(width: 0, height: 0)
    }
    // The band in the page's colour while that's under it, so white doesn't cut the colour; then the screen's.
    // Over a whole head, as soon as the page moves: the photo goes up under it. Not before, when its fade would lie on the
    // photo's top.
    .modifier(ClearUnderTopBar(shown: scrolled || (wholeHead != nil && moved), ground: colourAt.top ? colour : Color(.systemBackground)))
    // The name in the bar once it has left the page, on the colour too, in the bar's middle. The page's own, not iOS's
    // title: with the bar's buttons on no glass, on the colour, iOS set its title beside the back button, and moved it to
    // the middle as the glass came. Placed as iOS's is (`barName`); a name wider than the room is cut short. At the bar's
    // own size, as iOS's title is. Not read: the page's name is, as its heading.
    .overlay(alignment: .top) { barTitle }
    // Its list, dropped from under the bar, over the page and the title.
    .overlay { if let trying { PageNavigatorList(navigator: trying, top: barFoot + 6) } }
    .onChange(of: nameGone) { if nameGone, inRoom == nil { inRoom = barRoom.map { nameWidth > $0.even } } }
    .onChange(of: width) { inRoom = nil }
    // The name's width on one line, for `barName`.
    .background {
      Text(verbatim: item.name).font(.headline).dynamicTypeSize(.large).fixedSize().hidden()
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { nameWidth = $0 }
    }
  }

  /// The page itself, scrolling, with what it reports and the colour it puts under the tab bar; its bar is `body`'s.
  private var page: some View {
    ScrollViewReader { proxy in
      ScrollView {
        // One stack, the page's content: a part's place in it (PageNavigator.space) doesn't change as the page scrolls.
        VStack {
          top
          rest(proxy)
        }
        .coordinateSpace(.named(PageNavigator.space))
        .background { if let trying, let whole, let doc { PageNavigatorHook(navigator: trying, parts: navigatorParts(whole, doc)) } }
        // Links in the text, and in the lines under the name: a page the index lists opens in the app, `#id` scrolls to
        // it, a word's tip shows, a video's moment plays it here.
        .environment(\.openURL, OpenURLAction { follow($0, proxy) })
      }
      .onChange(of: player.asked) { withAnimation(reduceMotion ? nil : .default) { proxy.scrollTo(PagePlayer.anchor(player.id), anchor: .center) } }
      .onChange(of: navigator.asked) { _, asked in go(to: asked, proxy) }
    }
    .environment(player)
    .navigationDestination(item: $onSite) { WebScreen(url: $0).v2ClearOfTheFade() }
    .navigationDestination(item: $gridAt) { place in
      if let grid { PhotoGrid(gallery: grid, talk: doc?.talk, at: place, readerPhotos: $readerPhotos).ownerScreen("photos").v2ClearOfTheFade() }
    }
    .v2ClearOfTheFade()
    .ignoresSafeArea(edges: .top)
    // Once its text is in: the photo and name alone fit the screen, "read to the end" at once.
    .onScrollGeometryChange(for: Int?.self) { [loaded = doc != nil] g in
      guard loaded else { return nil }
      let share = g.contentSize.height > 0 ? 100 * g.visibleRect.maxY / g.contentSize.height : 0
      return Event.depths.last { share >= Double($0) } ?? 0
    } action: { _, mark in
      if let mark { reading?.scrolled(to: Double(mark) / 100) }
    }
    .onAppear {
      if reading == nil { reading = PageReading(path: item.path, telemetry: telemetry.telemetry) }
      reading?.shown(true)
    }
    .onDisappear { reading?.shown(false) }
    .onChange(of: phase) { reading?.inFront(phase == .active) }
    .onGeometryChange(for: CGFloat.self) { $0.safeAreaInsets.top } action: {
      barFoot = $0
      navigator.barFoot = $0
    }
    .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { width = $0 }
    .onScrollGeometryChange(for: CGFloat.self) { $0.containerSize.height } action: { _, h in viewport = h }
    .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 0.5 } action: { _, m in moved = m }
    .onGeometryChange(for: CGPoint.self) { $0.frame(in: .global).origin } action: { origin = $0 }
    .onChange(of: colourAt.foot) { if front { standOnColour() } }
    .onChange(of: colour) { if front { standOnColour() } }
    .onAppear {
      front = true
      standOnColour()
    }
    // Not over the next page's, which may have appeared first, with the same colour, or be the same fish's.
    .onDisappear {
      front = false
      if footGround?.wrappedValue?.page == me { footGround?.wrappedValue = nil }
    }
    .accessibilityIdentifier("v2-species")
    .ownerShows(item.path, as: "species")
  }

  @ViewBuilder private func headButtons(_ ask: ChatRoute?) -> some View {
    if Life(item) != nil { addButton }
    if let ask { quietAsk(ask) }
  }

  private var addButton: some View {
    Button { putting = true } label: {
      Label("Thêm vào bể", systemImage: "plus")
        .font(.body.weight(.semibold))
        // More lines at the largest text in a longer language, not shrunk.
        .lineLimit(3)
        .foregroundStyle(colour)
        .padding(.horizontal, 18)
        .padding(.vertical, size.isAccessibilitySize ? 12 : 6)
        .frame(minHeight: 44)
        // On two lines a capsule's ends curve in on the words.
        .background((size.isAccessibilitySize ? AnyShape(RoundedRectangle(cornerRadius: 22, style: .continuous)) : AnyShape(Capsule())).fill(.white))
    }
    .buttonStyle(.plain)
    // Not into a store this app must leave alone (newer, unreadable), as v1's page.
    .disabled(!tanks.canEdit)
    .opacity(tanks.canEdit ? 1 : 0.5)
    .accessibilityIdentifier("v2-add")
  }

  /// The ask, quieter beside "Thêm vào bể": white words on a capsule of white at 18% over the page's colour (4.95:1 on
  /// Akysis's grey-brown, the darkest pale of the Design Lead's measures). Its words don't repeat the name in the title
  /// just above; VoiceOver's do.
  private func quietAsk(_ route: ChatRoute) -> some View {
    NavigationLink(value: route) {
      Label(item.kind == .plant ? "Hỏi về cây này" : "Hỏi về cá này", systemImage: "bubble.left.and.text.bubble.right.fill")
        .font(.body.weight(.semibold))
        .lineLimit(3)
        .foregroundStyle(.white)
        .padding(.horizontal, 18)
        .padding(.vertical, size.isAccessibilitySize ? 12 : 6)
        .frame(minHeight: 44)
        .background((size.isAccessibilitySize ? AnyShape(RoundedRectangle(cornerRadius: 22, style: .continuous)) : AnyShape(Capsule())).fill(.white.opacity(0.18)))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(Text("Hỏi về \(ChatNames.inSentence(route.subject.name))"))
    .accessibilityIdentifier("chat-entry")
  }

  /// The photo, the name, "Thêm vào bể", the figures and the rest of its photos, on the photo's colour.
  private var top: some View {
    VStack(spacing: 0) {
      if let hero {
        let whole = wholeHead
        // A whole head starts at the bar's foot, the colour behind the status bar and the bar.
        if whole != nil { Color.clear.frame(height: barFoot) }
        // The taller banner, fading into the colour; or the whole photo under the bar, with a straight edge (`wholeHead`).
        // One photo either way, so it isn't drawn again when its shape comes.
        let banner = V2Photo(src: hero, box: heroBox, ground: colour, onGround: true, colour: { colour = $0 }, shape: { heroShape = $0 })
          .frame(width: whole?.width, height: whole?.height)
          .frame(maxWidth: .infinity)
          .containerRelativeFrame(.vertical) { h, _ in whole?.height ?? min(420, h * (size.isAccessibilitySize ? 0.34 : 0.46)) }
          .overlay(alignment: .bottom) {
            if whole == nil { LinearGradient(colors: [colour.opacity(0), colour], startPoint: .top, endPoint: .bottom).frame(height: 140) }
          }
        if let n = galleryCount {
          // With a gallery, it carries how many photos the page has, and the whole of it opens them all. A whole head's
          // count is on the colour under it, as the fish goes edge to edge (`header`).
          Button { allPhotos() } label: { banner.overlay(alignment: .bottomTrailing) { if whole == nil { PhotosBadge(count: n).padding(12) } } }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(verbatim: (doc?.lead?.alt ?? item.name) + ", ") + Text("Xem tất cả \(n) ảnh"))
            .accessibilityIdentifier("v2-lead-photo-grid")
        } else {
          banner
            .accessibilityElement()
            .accessibilityLabel(Text(verbatim: doc?.lead?.alt ?? item.name))
            .accessibilityAddTraits(.isImage)
        }
      } else {
        // No photo (a third of the fish): the page starts at the name, under its buttons, not at an empty box.
        Color.clear.frame(height: 116)
      }
      header
      // Its figures as a card, white on the colour.
      FactsCard(facts: facts, plant: item.plant, inPage: true, v2: true)
        .environment(\.colorScheme, .dark)
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
      if !photos.isEmpty { gallery.padding(.bottom, 24) }
      // Until it's asked for, the colour runs on past the screen's foot, the spinner on it: no white strip, no tab bar
      // changing, when the page comes. Not a fish with no photo: it'll have no gallery to fill the place.
      if !asked {
        ProgressView().tint(.white).padding(.vertical, 8)
        if hero != nil { Color.clear.containerRelativeFrame(.vertical) { h, _ in h / 2 } }
      }
    }
    .background(colour)
    .animation(.easeInOut(duration: 0.45), value: colour)
    // The scroll view's height stops where the fade over the tab bar starts (`v2ClearOfTheFade`).
    .onGeometryChange(for: ColourAt.self) { [barFoot] g in
      let end = g.frame(in: .scrollView).maxY
      return ColourAt(top: end > barFoot, foot: end > g.bounds(of: .scrollView)?.height ?? .infinity)
    } action: { colourAt = $0 }
  }

  /// A part chosen from the title's list: there, open, as a chip goes; its photos, their grid.
  private func go(to asked: PageNavigator.Asked?, _ proxy: ScrollViewProxy) {
    guard let asked, let whole else { return }
    if asked.id == Self.photosID { return allPhotos() }
    if let i = whole.ids.firstIndex(of: asked.id) { opened.insert(i) }
    jump(to: asked.id, proxy)
  }

  /// The name in the bar, once it has left the page; not with the owner's navigator, whose title says it (the bar's own).
  @ViewBuilder private var barTitle: some View {
    if trying?.long != true, nameGone, barMid > 0 {
      let place = barName ?? BarPlace(x: width / 2, room: max(60, width - 290))
      Text(verbatim: item.name).font(.headline).lineLimit(1).dynamicTypeSize(.large)
        .foregroundStyle(colourAt.top ? Color.white : Color.primary)
        .frame(maxWidth: place.room)
        .position(x: place.x, y: barMid - origin.y)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .accessibilityIdentifier("v2-bar-name")
    }
  }

  /// Where the name in the bar sits and how wide it may be, as iOS places its title: in the screen's middle when it fits
  /// there between the buttons, else in the middle of the room between them (`inRoom` once held). None before the
  /// buttons are measured (then 145 points are left each side).
  private var barName: BarPlace? {
    guard let r = barRoom else { return nil }
    return inRoom ?? (nameWidth > r.even) ? BarPlace(x: (r.lead + r.trail) / 2, room: r.trail - r.lead - 32) : BarPlace(x: width / 2, room: r.even)
  }

  /// The room between the bar's buttons, 16 points clear of them, their glass too: its edges, and how wide a name centred
  /// on the screen may be in it.
  private var barRoom: (lead: CGFloat, trail: CGFloat, even: CGFloat)? {
    let lead = isPost ? 16 : Self.backEnd, trail = trailStart - origin.x
    guard trailStart > 0, trail - lead > 92 else { return nil }
    return (lead, trail, 2 * (min(width / 2 - lead, trail - width / 2) - 16))
  }

  /// How wide the navigator's title may be, beside the back button: the bar less its round buttons, their margins and the
  /// room iOS keeps between them. Any wider and iOS folds the bar's items into a "⋯" of its own: with the one ⋯ on the
  /// right, back and Mục lục (27.2, 11 Nov). From the page's width alone: from the buttons' places, which move as the
  /// title comes, the bar never settled.
  private var titleWidth: CGFloat { max(80, (width > 0 ? width : 402) - 240) }

  /// iOS's back button's end: its 44-point glass circle 16 points in.
  private static let backEnd: CGFloat = 60

  private func standOnColour() {
    footGround?.wrappedValue = colourAt.foot ? FootGround(page: me, colour: colour) : nil
  }


  /// Whether the bar's buttons stand over the photo: there on dark circles of our own; once the band comes, on the page's
  /// colour and past it, in iOS's glass, as iOS's back button is (Design's parity, 13 Nov: on the colour the ⋯ was bare
  /// dots beside the back in its tinted glass).
  private var overPhoto: Bool { hero != nil && !scrolled && wholeHead == nil }
  /// Whether the bar's buttons are in iOS's glass: once the band comes, and on a page with no photo. Not over a photo, nor
  /// on the colour above a whole head, where they're white with no circle and no glass (Design's mock of 11 Nov).
  private var inGlass: Bool { hero == nil || scrolled }

  /// White on a dark circle over the photo, in a 44-point tap area; once the band comes, in iOS's glass (`v2Glass`).
  private func round(_ symbol: String) -> some View {
    Image(systemName: symbol)
      .font(.body.weight(.semibold))
      // It stays inside its circle at the largest text.
      .dynamicTypeSize(...DynamicTypeSize.xLarge)
      .foregroundStyle(colourAt.top ? Color.white : Color.primary)
      .frame(width: 44, height: 44)
      .background {
        Circle().fill(.black.opacity(overPhoto ? PageTop.ground(reduceTransparency: opaque) : 0))
          .frame(width: PageTop.disc, height: PageTop.disc)
      }
      .contentShape(Circle())
  }


  private var header: some View {
    VStack(alignment: .leading, spacing: 6) {
      if hero != nil {
        // Under a whole head, its gallery's count on the credit's line, at the left (Design, 14 Nov).
        if wholeHead != nil, let n = galleryCount {
          HStack(alignment: .firstTextBaseline, spacing: 12) {
            Button { allPhotos() } label: {
              Label { Text("\(n) ảnh") } icon: { Image(systemName: "photo.on.rectangle") }
                .font(.footnote.weight(.semibold)).foregroundStyle(.white.opacity(0.75))
                .dynamicTypeSize(...DynamicTypeSize.xxLarge)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text("Xem tất cả \(n) ảnh"))
            .accessibilityIdentifier("v2-lead-photo-count")
            leadCredit
          }
        } else {
          leadCredit
        }
      }
      Text(verbatim: item.name).font(.largeTitle.weight(.bold)).foregroundStyle(.white)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityAddTraits(.isHeader)
        .onGeometryChange(for: Bool.self) { [barFoot] in $0.frame(in: .scrollView).maxY < barFoot } action: { gone in
          withAnimation(.easeInOut(duration: 0.2)) { nameGone = gone }
        }
      if let sub = item.subUnderName { LatinName(text: sub).font(.title3).italic().foregroundStyle(.white.opacity(0.75)) }
      // Its family and where it comes from, then its other names, as the site's page has them under its name.
      if let doc, !doc.where.isEmpty { Text(styled(doc.where)).foregroundStyle(.white.opacity(0.75)).tint(.white) }
      if let aka = doc?.aka { Text(verbatim: aka).foregroundStyle(.white.opacity(0.75)) }
      // "Thêm vào bể", the page's one filled button, and the ask beside it, quieter (the owner, 12 Nov: "2 big buttons too
      // near"): a row, else one above the other at the largest text or in a longer language. Either alone where the other
      // doesn't apply. No note under the ask: the chat says who answers as it opens.
      let ask = chat.on ? ChatRoute(about: item) : nil
      if Life(item) != nil || ask != nil {
        ViewThatFits(in: .horizontal) {
          HStack(alignment: .top, spacing: 10) { headButtons(ask) }
          VStack(alignment: .leading, spacing: 10) { headButtons(ask) }
        }
        .padding(.top, 14)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
    .padding(.top, 4)
    // The first words reach the bar: the band comes now, so no words go under the status bar or the round buttons on the
    // way up, however many lines they run to.
    .onGeometryChange(for: Bool.self) { [barFoot] in $0.frame(in: .scrollView).minY < barFoot } action: { under in
      withAnimation(.easeInOut(duration: 0.2)) { scrolled = under }
    }
  }

  /// The photo's credit, quietly on it, each piece linking where it says, as on v1's page.
  private var leadCredit: some View {
    // On the colour under the photo: its licence reads at 4.5:1 whatever the photo, however many lines it wraps to. Its line
    // kept before the page comes, so the name doesn't drop when it does.
    Text(doc?.lead.flatMap { credit($0) } ?? blankLine).foregroundStyle(.white.opacity(0.75)).tint(.white).multilineTextAlignment(.trailing)
      .frame(maxWidth: .infinity, alignment: .trailing)
      // Capped: at the largest text it would outrank the name.
      .dynamicTypeSize(...DynamicTypeSize.xxLarge)
  }

  private var blankLine: AttributedString {
    var line = AttributedString(" ")
    line.font = .caption2
    return line
  }

  /// Where the galleries' photos come from and on what licences, under them full screen.
  private var galleryNote: String {
    (doc?.blocks ?? []).compactMap { if case let .gallery(_, note, _, _, _) = $0, !note.isEmpty { note } else { nil } }.joined(separator: "\n")
  }

  /// What the viewer pages through: the page's gallery whole, the top photo among them where it's one of its photos, as the
  /// grid and the count on the photo have it, so its "2/9" counts what its note's "9 ảnh" counts (the owner, 10 Nov: "1/8",
  /// then "9 ảnh"). Without a gallery, the photos under the top.
  private var viewerPhotos: [PageDoc.Image] { galleryPhotos.isEmpty ? photos : galleryPhotos }

  /// The carousel's photos, each with its place in `photos`. With a grid to open, those the page's row shows
  /// (its gallery's `strip`), so the last tile, to all of them, is a few swipes along and not a hundred.
  private var rowPhotos: [(i: Int, p: PageDoc.Image)] {
    let all = photos.enumerated().map { (i: $0.offset, p: $0.element) }
    guard galleryCount != nil else { return all }
    var shown = Set<String>()
    for case let .gallery(_, _, list, strip, _) in doc?.blocks ?? [] { shown.formUnion(strip.map { list[$0].src }) }
    let row = all.filter { shown.contains($0.p.src) }
    return Array((row.isEmpty ? all : row).prefix(PhotoRow.shown))
  }

  /// The page's other photos as a carousel, each opening full screen.
  private var gallery: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      LazyHStack(alignment: .top, spacing: 10) {
        ForEach(rowPhotos, id: \.p.src) { i, p in
          VStack(alignment: .leading, spacing: 4) {
            Button { viewing = viewerPhotos.firstIndex { V2Photo.full($0.src) == V2Photo.full(p.src) } ?? i } label: {
              V2Photo(src: p.thumb ?? p.src, box: p.box, ground: colour)
                .aspectRatio(1.6, contentMode: .fit)
                .clipShape(.rect(cornerRadius: 16, style: .continuous))
                // Its edge on a dark page, as a row's photo has, for a photo on black.
                .overlay { RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(.primary.opacity(0.08), lineWidth: 0.5) }
            }
            .buttonStyle(CardPress())
            .accessibilityLabel(Text(verbatim: p.alt ?? item.name))
            // Its credit whole, as wide as the photo, on the page's colour: the licence is never cut off.
            if let line = credit(p) {
              Text(line).foregroundStyle(.white.opacity(0.75)).tint(.white).fixedSize(horizontal: false, vertical: true)
                .dynamicTypeSize(...DynamicTypeSize.xxLarge)
            }
          }
          .containerRelativeFrame(.horizontal) { w, _ in shelfCard(w, across: 1, spacing: 10) }
        }
        // Last, all of them: the grid, as the banner opens it.
        if let n = galleryCount {
          Button { allPhotos() } label: {
            Color.white.opacity(0.14)
              .aspectRatio(1.6, contentMode: .fit)
              .overlay {
                VStack(spacing: 8) {
                  Image(systemName: "photo.on.rectangle").font(.title2)
                  Text("Xem tất cả \(n) ảnh").font(.subheadline.weight(.semibold)).multilineTextAlignment(.center)
                }
                .foregroundStyle(.white)
                .padding(12)
              }
              .clipShape(.rect(cornerRadius: 16, style: .continuous))
          }
          .buttonStyle(CardPress())
          .accessibilityIdentifier("v2-gallery-all")
          .containerRelativeFrame(.horizontal) { w, _ in shelfCard(w, across: 1, spacing: 10) }
        }
      }
      .v2YieldsToEdgeSwipe()
      .scrollTargetLayout()
    }
    .accessibilityIdentifier("v2-photos-row")
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .scrollTargetBehavior(.viewAligned)
    .v2ShelfEdge()
  }

  private var hasMates: Bool {
    doc?.blocks.contains { if case .mates = $0 { true } else { false } } == true
  }

  /// The tank-mates tool's link where the page lists no tank-mates: a paragraph of that link alone, before its summary
  /// and sections (as v1's page reads it; a breed's line naming its parents has more to it).
  private var toolLink: (text: String, href: String)? {
    guard let doc else { return nil }
    let lead = doc.blocks.firstIndex { if case .summary = $0 { true } else if case .heading = $0 { true } else { false } } ?? doc.blocks.count
    for case let .paragraph(runs) in doc.blocks[..<lead] where runs.count == 1 {
      if let href = runs[0].href { return (runs[0].text, href) }
    }
    return nil
  }

  private var hasSummary: Bool {
    doc?.blocks.contains { if case let .summary(_, items, text, _, _) = $0 { text != nil || !items.isEmpty } else { false } } == true
  }

  /// The page's answer: its paragraph, or its points where it has no paragraph.
  @ViewBuilder private var summary: some View {
    if let doc, let s = doc.blocks.lazy.compactMap({ b -> (title: String, text: String?, items: [String], mistakes: (title: String, items: [String])?, by: String?)? in
      if case let .summary(title, items, text, mistakes, by) = b { return (title, text, items, mistakes, by) }
      return nil
    }).first, s.text != nil || !s.items.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Text(verbatim: s.title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
        if let text = s.text {
          Text(verbatim: text).font(.body).lineSpacing(3)
        } else {
          ForEach(s.items, id: \.self) { bullet($0) }
        }
        if let mistakes = s.mistakes, !mistakes.items.isEmpty {
          Text(verbatim: mistakes.title).font(.headline).accessibilityAddTraits(.isHeader).padding(.top, 8)
          ForEach(mistakes.items, id: \.self) { bullet($0) }
        }
        // The page's own line: its sources are at its foot, here too.
        if let by = s.by { Text(verbatim: by).font(.footnote).foregroundStyle(.v2Faint).padding(.top, 4) }
      }
      .padding(.horizontal, 20)
    }
  }

  /// A point, its wrapped lines clear of its bullet.
  private func bullet(_ text: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: 6) {
      Text(verbatim: "•").accessibilityHidden(true)
      Text(verbatim: text)
    }
    .font(.body)
  }

  /// Whether it gets through a northern winter, as v1's page says: the question a fish's facts don't answer.
  @ViewBuilder private var climate: some View {
    if let c = doc?.blocks.lazy.compactMap({ b -> (title: String, items: [(label: String, ok: Bool, text: String)], note: String)? in
      if case let .climate(title, items, note) = b { return (title, items, note) }
      return nil
    }).first {
      VStack(alignment: .leading, spacing: 10) {
        Text(verbatim: c.title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
        ForEach(c.items.indices, id: \.self) { i in
          HStack(alignment: .firstTextBaseline, spacing: 8) {
            // A warning, not "can't keep it": what to do about it follows, and red is "Tránh"'s.
            Image(systemName: c.items[i].ok ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
              .foregroundStyle(c.items[i].ok ? Color.green : Color.warning)
              .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: c.items[i].label).font(.body.weight(.semibold))
              Text(verbatim: c.items[i].text).font(.body)
            }
          }
          .accessibilityElement(children: .combine)
        }
        if !c.note.isEmpty { Text(verbatim: c.note).font(.footnote).foregroundStyle(.v2Faint) }
      }
      .padding(.horizontal, 20)
    }
  }

  /// "Nuôi chung": its temperament and smallest school, the fish to keep with it, then those to keep away, each with
  /// why, as shelves; what they rest on, and the tank-mates tool set to it.
  @ViewBuilder private var mates: some View {
    if let doc, let m = doc.blocks.lazy.compactMap({ b -> PageDoc.Mates? in
      if case let .mates(m) = b { return m }
      return nil
    }).first {
      VStack(alignment: .leading, spacing: 18) {
        VStack(alignment: .leading, spacing: 4) {
          Text(verbatim: m.title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader)
          if let traits = FactsCard.traits(facts) { Text(traits) }
        }
        .padding(.horizontal, 20)
        if let good = m.good, !good.items.isEmpty { matesRows(good.title, good.items, good: true) }
        if let avoid = m.avoid, !avoid.items.isEmpty { matesRows(avoid.title, avoid.items, good: false) }
        // What explains the shelves straight under them, the credits last.
        VStack(alignment: .leading, spacing: 6) {
          if let note = m.note { Text(verbatim: note).font(.footnote).foregroundStyle(.v2Faint) }
          toolButton(m.tool.text, m.tool.href)
        }
        .padding(.horizontal, 20)
      }
    } else if let link = toolLink {
      toolButton(link.text, link.href).padding(.horizontal, 20)
    }
  }

  /// The tank-mates' and its breeds' photos' credits, the page's last thing and one tap away: a run of licence lines and
  /// photo numbers would be louder than the page's end, or read as a pager between two lists. The lead photo's and the
  /// gallery's stay under their photos.
  @ViewBuilder private var credits: some View {
    if let doc {
      let mates = doc.blocks.lazy.compactMap { b -> PageDoc.Mates? in if case let .mates(m) = b { m } else { nil } }.first
      let photos = ((mates?.good?.items ?? []) + (mates?.avoid?.items ?? [])).compactMap(\.img) + (whole?.cardPhotos ?? [])
      if photos.contains(where: { $0.credit != nil }) {
        DisclosureGroup {
          // Capped: at the largest text, licence lines would take the screen.
          MatesCredits(photos: photos)
            .dynamicTypeSize(...DynamicTypeSize.xxLarge)
            .frame(maxWidth: .infinity, alignment: .leading)
        } label: {
          Text("Ảnh và giấy phép").font(.footnote).foregroundStyle(.v2Faint).frame(minHeight: 44)
        }
        .disclosureGroupStyle(QuietDisclosure())
        .accessibilityIdentifier("v2-mates-credits")
        .padding(.horizontal, 20)
      }
    }
  }

  /// One side of "Nuôi chung": its fish as rows with their photos, why under each, opening their pages; their photos'
  /// credits at the page's foot.
  private func matesRows(_ title: String, _ mates: [PageDoc.Mates.Mate], good: Bool) -> some View {
    CardsPart(title: title, cards: mates.map { NativePage.Card(path: $0.path, name: $0.name, sub: $0.why, img: $0.img) }, good: good,
              open: { open($0) }, credits: false, v2: true)
      .padding(.horizontal, 20)
  }

  private func toolButton(_ text: String, _ href: String) -> some View {
    Button { open(href) } label: {
      // Its words end in their own arrow.
      Text(verbatim: text).font(.subheadline.weight(.semibold)).multilineTextAlignment(.leading)
        .frame(minHeight: 44)
        .contentShape(.rect)
    }
    .accessibilityIdentifier("v2-mates-tool")
  }

  /// A link of the page's to one of the app's screens (the tank-mates tool), as v1's page opens it.
  private func open(_ href: String) {
    guard let url = URL(string: href, relativeTo: handbook.site)?.absoluteURL else { return }
    open(url)
  }

  /// A link in the page, as v1's page follows it: one of the app's screens, a shop outside (counted), a page of the site's
  /// the app doesn't list in the app, another site in the browser.
  private func open(_ url: URL) {
    let u = url.scheme == nil ? URL(string: url.relativeString, relativeTo: handbook.site)?.absoluteURL ?? url : url
    if let screen = AppScreen.of(u, site: handbook.site, lang: handbook.lang, listed: { handbook.item(at: $0) != nil },
                                 group: { !handbook.shelves.fish(group: $0, handbook.labels).isEmpty }) {
      openScreen(screen)
    } else if ShopLink.is(u, site: handbook.site) {
      reading?.tapped(u)
      Task { await OwnCopy.open(u, site: handbook.site) }
    } else if PageRoute.of(u, site: handbook.site, mainFrame: true, newWindow: false) == .app {
      onSite = u
    } else {
      openURL(u)
    }
  }

  /// A link in the text: `#id` scrolls to it, a word's tip shows, a video's moment plays it in its place on the page (one
  /// the page doesn't show, on YouTube), the rest as `open`.
  private func follow(_ url: URL, _ proxy: ScrollViewProxy) -> OpenURLAction.Result {
    switch url.scheme {
    case "page-anchor":
      let id = String(url.absoluteString.dropFirst("page-anchor:".count)).removingPercentEncoding ?? ""
      jump(to: id, proxy)
    case "page-tip":
      tip = Tip(url)
    case "page-video":
      guard let (id, at) = PagePlayer.asked(url) else { break }
      if whole?.videos.contains(id) == true { player.ask(id, at: at, lang: handbook.lang, site: handbook.site) } else { openURL(youtube(id, at: at)) }
    default:
      open(url)
    }
    return .handled
  }

  /// Under the photos: the page that didn't come, or its parts; then the tank-mates' photos' credits.
  private func rest(_ proxy: ScrollViewProxy) -> some View {
    // All at once, as v1's page: in a lazy stack the page's layout could spin for seconds on end as parts came and went,
    // and a chip's jump landed past its part. What a part folds away isn't drawn (V2Section).
    VStack(alignment: .leading, spacing: 28) {
      if asked && doc == nil {
        VStack(alignment: .leading, spacing: 4) {
          // The handbook's status says nothing here: it stays online from launch, whatever the signal is now.
          Text("Không tải được trang. Kiểm tra kết nối mạng.").font(.footnote).foregroundStyle(.v2Faint)
          Button("Thử lại") {
            asked = false
            retries += 1
          }
          .frame(minHeight: 44)
          .accessibilityIdentifier("v2-retry")
        }
        .padding(.horizontal, 20)
      }
      if let doc, let whole {
        // For whoever hasn't the navigator: it does their job.
        if !whole.jumps.isEmpty, trying == nil { jumps(whole, proxy) }
        ForEach(shown(whole, doc), id: \.self) { i in
          // Its readers before the literature it cites and its sources, one with the part after them: none, no gap.
          if i == whole.readersAt {
            VStack(alignment: .leading, spacing: 0) {
              placed(readers(doc), Self.readersID)
              placed(part(i, whole, doc), whole.ids[i])
            }
          } else {
            placed(part(i, whole, doc), whole.ids[i])
          }
        }
        if whole.readersAt == whole.parts.count { placed(readers(doc), Self.readersID) }
      }
      credits
    }
    .padding(.top, 24)
    .padding(.bottom, 40)
    .alert(tip?.term ?? "", isPresented: Binding(get: { tip != nil }, set: { if !$0 { tip = nil } }), presenting: tip) { t in
      if let h = t.href, let u = URL(string: h) { Button("Xem thêm") { open(u) } }
      Button("Đóng", role: .cancel) {}
    } message: { t in
      Text(t.text)
    }
  }

  /// A part's place for a chip or a `#id` link, at its top: no height, so `jump` sets its top where it says.
  private func place(_ id: String) -> some View {
    Color.clear.frame(height: 0).id(id)
  }

  /// A part with its place, for a jump and, for the owner, the navigator.
  private func placed(_ part: some View, _ id: String) -> some View {
    part.background(alignment: .top) { place(id) }
      .background { if let trying { PagePlace(navigator: trying, id: id) } }
  }

  /// The photos' row in the navigator's list (their grid), and the readers' part's place.
  private static let photosID = "v2-photos", readersID = "v2-readers"
  /// The section "Nuôi chung với con gì?", by its heading's key (the site's sections.ts).
  private static let keptWithID = "muc-behaviour"

  /// The navigator, the owner's alone for now, once the page has come: the title only, no choice of it and no rail.
  private var trying: PageNavigator? { account.owner.isOwner == true && whole != nil ? navigator : nil }

  /// The parts the navigator's list has: the photos with a few of them and how many, where they have a grid; then each part
  /// with a name, in the page's order, its readers' in theirs; those after its care with how many each has.
  private func navigatorParts(_ whole: WholeParts, _ doc: PageDoc) -> [PageNavigator.Part] {
    var out: [PageNavigator.Part] = []
    if let n = galleryCount {
      out.append(.init(id: Self.photosID, name: "Ảnh", count: n, photos: true, thumbs: galleryPhotos.prefix(3).map { $0.thumb ?? $0.src }))
    }
    let readers = PageNavigator.Part(id: Self.readersID, name: "Ảnh bạn đọc", count: readerPhotos?.count, tail: true)
    // The section on what to keep it with and the tank-mates' rows after its text are one row, to the section, named over both.
    let kept = keptWith(whole, doc)
    for i in whole.parts.indices where i != kept?.rows {
      if i == whole.readersAt, doc.talk != nil { out.append(readers) }
      guard drawn(i, whole, doc), let name = partName(i, whole, doc) else { continue }
      out.append(.init(id: whole.ids[i], name: name, count: partCount(i, whole, doc), tail: tail(whole.parts[i]),
                       also: i == kept?.section ? kept.map { whole.ids[$0.rows] } : nil))
    }
    if whole.readersAt == whole.parts.count, doc.talk != nil { out.append(readers) }
    return out
  }

  /// The tank-mates' rows and the section on them, on a page with both.
  private func keptWith(_ whole: WholeParts, _ doc: PageDoc) -> (rows: Int, section: Int)? {
    guard let rows = whole.parts.indices.first(where: { if case .mates = whole.parts[$0] { drawn($0, whole, doc) } else { false } }),
          let section = whole.ids.firstIndex(of: Self.keptWithID), drawn(section, whole, doc) else { return nil }
    return (rows, section)
  }

  /// The parts the page draws, in its order: the tank-mates' rows after the text of the section on them, as the mock has them.
  private func shown(_ whole: WholeParts, _ doc: PageDoc) -> [Int] {
    var out = whole.parts.indices.filter { drawn($0, whole, doc) }
    if let kept = keptWith(whole, doc) {
      out.removeAll { $0 == kept.rows }
      if let at = out.firstIndex(of: kept.section) { out.insert(kept.rows, at: at + 1) }
    }
    return out
  }

  /// Whether a part comes after the page's care: its breeds, guides, videos and sources.
  private func tail(_ part: PagePart) -> Bool {
    switch part {
    case .cards, .pages, .videos, .trust, .refs: true
    default: false
    }
  }

  /// How many a part after the page's care has: its breeds, the guides the index lists, its videos.
  private func partCount(_ i: Int, _ whole: WholeParts, _ doc: PageDoc) -> Int? {
    switch whole.parts[i] {
    case let .cards(b): if case let .cards(_, cards) = doc.blocks[b] { return cards.count }
    case let .pages(b): if case let .pages(_, paths) = doc.blocks[b] { return paths.filter { handbook.item(at: $0) != nil }.count }
    case .videos: return whole.pieces[i].filter { if case .video = $0 { true } else { false } }.count
    default: break
    }
    return nil
  }

  /// The page's gallery, as its grid has it (the same as v1's page builds), the lead photo among its photos.
  private var grid: PhotoGrid.Gallery? {
    whole.flatMap { PhotoGrid.Gallery(pieces: $0.pieces.joined(), name: item.name) }
  }

  private var galleryPhotos: [PageDoc.Image] { grid?.photos ?? [] }

  /// How many photos the grid has, where the page has one: a gallery starts at 6.
  private var galleryCount: Int? { galleryPhotos.count >= 6 ? galleryPhotos.count : nil }

  /// All the page's photos, in their grid: from the banner, the carousel's last tile and the navigator's "Ảnh".
  private func allPhotos() {
    gridAt = .photos
  }

  /// A part's name: its heading, or the title of the block that draws it.
  private func partName(_ i: Int, _ whole: WholeParts, _ doc: PageDoc) -> String? {
    if let title = whole.titles[i] { return title }
    switch whole.parts[i] {
    case let .summary(b): if case let .summary(title, _, _, _, _) = doc.blocks[b] { return title }
    case let .climate(b): if case let .climate(title, _, _) = doc.blocks[b] { return title }
    case let .mates(b): if case let .mates(m) = doc.blocks[b] { return m.title }
    case let .cards(b): if case let .cards(title, _) = doc.blocks[b] { return title }
    case let .videos(b): if case let .videos(title, _) = doc.blocks[b] { return title }
    case let .trust(b): if case let .trust(title, _, _) = doc.blocks[b] { return title }
    case let .refs(b): if case let .refs(title, _, _, _) = doc.blocks[b] { return title }
    default: break
    }
    return nil
  }

  /// To a part (`place`) or a `#id` in the text, its top just under the bar: at the screen's top, as `.top` puts it, it
  /// was behind the bar, the page running up under it.
  private func jump(to id: String, _ proxy: ScrollViewProxy) {
    withAnimation(reduceMotion ? nil : .default) { proxy.scrollTo(id, anchor: UnitPoint(x: 0, y: viewport > 0 ? min((barFoot + 8) / viewport, 0.5) : 0)) }
  }

  /// The parts a reader comes back for, a chip each, over a long page: tapped, the page scrolls there, its part open.
  private func jumps(_ whole: WholeParts, _ proxy: ScrollViewProxy) -> some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(spacing: 8) {
        ForEach(whole.jumps.indices, id: \.self) { j in
          let to = whole.jumps[j].part
          Button {
            opened.insert(to)
            jump(to: whole.ids[to], proxy)
          } label: {
            Text(verbatim: whole.jumps[j].label).font(.subheadline.weight(.semibold))
              .padding(.horizontal, 14)
              .frame(minHeight: 44)
              .background(.fill.tertiary, in: Capsule())
          }
          .buttonStyle(.plain)
        }
      }
      .v2YieldsToEdgeSwipe()
    }
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .v2ShelfEdge()
    .accessibilityIdentifier("v2-jumps")
  }

  /// Whether a part has anything to draw: its photos are the row under the name, the tool's link is the tank-mates', a
  /// list of guides the index lists none of is nothing, nor is a heading over only what's drawn in its own place.
  private func drawn(_ i: Int, _ whole: WholeParts, _ doc: PageDoc) -> Bool {
    switch whole.parts[i] {
    case .photos: false
    case .summary: hasSummary
    case .climate, .mates: true
    case .toolLink: !hasMates && toolLink != nil
    case let .pages(b):
      if case let .pages(_, paths) = doc.blocks[b] { paths.contains { handbook.item(at: $0) != nil } } else { false }
    default: !whole.pieces[i].isEmpty
    }
  }

  /// One of the page's parts, after its photos: its answer, a winter, its tank-mates, as v2 has drawn them; its videos, a
  /// row; the rest, each under its heading, folded when long.
  @ViewBuilder private func part(_ i: Int, _ whole: WholeParts, _ doc: PageDoc) -> some View {
    switch whole.parts[i] {
    case .photos: EmptyView()
    case .summary: summary
    case .climate: climate
    // The tool's link where the page lists no tank-mates: drawn where they would be.
    case .mates: mates
    case .toolLink: mates
    case .videos: videos(i, whole)
    default: section(i, whole)
    }
  }

  private func section(_ i: Int, _ whole: WholeParts) -> some View {
    // Its sources' figures, compared, show whole: folded, the figure they disagree on is the one cut.
    let folds = if case .section = whole.parts[i] { true } else { false }
    let anchor = whole.ids[i].hasPrefix("part-") ? nil : whole.ids[i]
    return V2Section(key: whole.ids[i], memo: foldMemo, title: whole.titles[i], pieces: whole.pieces[i], folds: folds,
                     open: Binding(get: { opened.contains(i) }, set: { if $0 { opened.insert(i) } }), width: width,
                     link: { open($0) }, full: { openFull(item, anchor) })
  }

  /// Its videos, a row of them, each with its title under its picture and played in its place: down the page, five of
  /// them were three screens of YouTube.
  private func videos(_ i: Int, _ whole: WholeParts) -> some View {
    VStack(alignment: .leading, spacing: 10) {
      if let title = whole.titles[i] {
        Text(verbatim: title).font(.title2.weight(.bold)).accessibilityAddTraits(.isHeader).padding(.horizontal, 20)
      }
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 14) {
          ForEach(whole.pieces[i].indices, id: \.self) { j in
            if case let .video(id, title, caption, _) = whole.pieces[i][j] {
              VideoSlot(id: id, title: title, caption: caption, captionUnder: true)
                .containerRelativeFrame(.horizontal) { w, _ in min(w - 56, 320) }
            }
          }
        }
        .v2YieldsToEdgeSwipe()
        .scrollTargetLayout()
      }
      .contentMargins(.horizontal, 20, for: .scrollContent)
      .scrollTargetBehavior(.viewAligned)
      .v2ShelfEdge()
    }
  }

  /// Its readers' photos and comments, as v1's page has them, under v2's headings; the gap after them only when they show.
  @ViewBuilder private func readers(_ doc: PageDoc) -> some View {
    if let talk = doc.talk {
      ReadersPart(talk: talk, name: doc.title, photos: $readerPhotos, grid: galleryCount != nil ? { gridAt = .readers } : nil,
                  heading: .title2.bold(), space: (.bottom, 28))
        .padding(.horizontal, 20)
    }
  }
}

/// A row that opens what's under it, its chevron quiet and 16 in, as a list row's, not iOS's own bold one, louder than its
/// words.
private struct QuietDisclosure: DisclosureGroupStyle {
  func makeBody(configuration: Configuration) -> some View { QuietDisclosureRow(configuration: configuration) }
}

private struct QuietDisclosureRow: View {
  let configuration: DisclosureGroupStyleConfiguration
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Button { withAnimation(reduceMotion ? nil : .easeInOut(duration: 0.2)) { configuration.isExpanded.toggle() } } label: {
        HStack {
          configuration.label
          Spacer(minLength: 8)
          Image(systemName: "chevron.right").foregroundStyle(.tertiary)
            .rotationEffect(.degrees(configuration.isExpanded ? 90 : 0))
            .padding(.trailing, 16)
            .accessibilityHidden(true)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      // Open or not, as iOS's own says it.
      .accessibilityValue(Text(configuration.isExpanded ? "Đã mở rộng" : "Đã thu gọn"))
      if configuration.isExpanded { configuration.content }
    }
  }
}

/// The tank-mates' photos' credits under their shelves, as v1's page lists a row of cards' (CardsPart): one row per who
/// took them, with its line; several photos, or a photographer's page in the line, then a number for each photo's page.
private struct MatesCredits: View {
  let photos: [PageDoc.Image]
  /// Small to the eye, 44 points to the finger.
  @ScaledMetric(relativeTo: .caption2) private var number: CGFloat = 44
  private struct Row { var credit: PageDoc.Image.Credit; var urls: [URL] }

  private var rows: [Row] {
    photos.reduce(into: []) { rows, img in
      guard let c = img.credit else { return }
      let url = c.url.flatMap(URL.init(string:))
      if let i = rows.firstIndex(where: { $0.credit.text == c.text && $0.credit.licence == c.licence && $0.credit.authorUrl == c.authorUrl }) {
        if let url, !rows[i].urls.contains(url) { rows[i].urls.append(url) }
        // The one with its page, for a row of one link.
        if rows[i].credit.url == nil { rows[i].credit = c }
      } else {
        rows.append(Row(credit: c, urls: url.map { [$0] } ?? []))
      }
    }
  }

  var body: some View {
    let rows = rows
    if !rows.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        ForEach(rows.indices, id: \.self) { i in
          let row = rows[i]
          if row.urls.count <= 1 && row.credit.authorUrl == nil {
            Text(credit(row.credit))
          } else if row.urls.isEmpty {
            Text(credit(row.credit, photo: false))
          } else {
            Text(credit(row.credit, photo: false)) + Text(verbatim: " · ").font(.caption2) + Text("\(row.urls.count) ảnh").font(.caption2)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: number), spacing: 0, alignment: .leading)], alignment: .leading, spacing: 0) {
              ForEach(Array(row.urls.enumerated()), id: \.offset) { j, url in
                Link(destination: url) {
                  Text(verbatim: String(j + 1)).font(.caption2).underline().frame(maxWidth: .infinity, minHeight: 44, alignment: .leading).contentShape(.rect)
                }
                .accessibilityLabel(Text("\(row.credit.text), ảnh \(j + 1)"))
                .accessibilityRemoveTraits(.isButton)
                .accessibilityAddTraits(.isLink)
              }
            }
          }
        }
      }
      .foregroundStyle(.v2Faint).tint(Color.v2Faint)
    }
  }
}

private extension View {
  /// A toolbar's items only when `on`: after the view's other toolbars' items. On iOS 26, a fixed space first, so once the
  /// bar turns to glass iOS doesn't draw them in one capsule with the others (Design's parity, 13 Nov: the post's ✕ joined
  /// the bookmark and share past the colour; the guide post's stands apart).
  @ViewBuilder func toolbar<C: ToolbarContent>(when on: Bool, @ToolbarContentBuilder _ content: () -> C) -> some View {
    if !on {
      self
    } else if #available(iOS 26, *) {
      toolbar { ToolbarSpacer(.fixed, placement: .topBarTrailing); content() }
    } else {
      toolbar(content: content)
    }
  }
}
