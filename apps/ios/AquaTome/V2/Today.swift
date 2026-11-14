import Handbook
import SwiftUI
import Tanks

/// "Hôm nay": a day's cards, as the App Store's Today tab: a fish of the day, a guide, a story, a topic of the season,
/// the reader's own tank, a video series and what's new on the site, each from the handbook. The fish, guide and story
/// are the editors' for the day (docs/curation.md); on a date they haven't planned, the app's own (its home picks, turned
/// by the day). A card zooms into its page.
@available(iOS 18, *)
struct TodayView: View {
  @Binding var path: NavigationPath
  @Environment(HandbookModel.self) private var handbook
  @Environment(TanksModel.self) private var tanks
  @Environment(\.colorScheme) private var scheme
  @Namespace private var zoom
  @State private var refreshes = 0
  /// The day the feed is for: read at midnight, or on coming back after it, not left at yesterday's.
  @State private var today = TodayView.now
  /// No fish yet, as the day began: held, so a fish added from the card doesn't change the card under the sheet.
  @State private var heldBeginner: Bool?
  /// A post is open (`Post`): the screens opened inside it have its ✕.
  @State private var postOpen = false
  private var beginner: Bool { heldBeginner ?? tanks.tanks.allSatisfy { $0.species.isEmpty } }

  var body: some View {
    NavigationStack(path: $path) {
      ScrollView {
        VStack(alignment: .leading, spacing: 28) {
          Text(verbatim: date)
            // Plain, not a second line of capitals over the first card's own.
            .font(.subheadline).foregroundStyle(.v2Faint)
            .padding(.horizontal, 20)
            .padding(.bottom, -16)
          // The kept copy in use, or none at all, as v1's Tìm says.
          if handbook.status == .offline || handbook.status == .failed {
            StatusText().font(.footnote).padding(.horizontal, 20)
          }
          ForEach(cards) { card in
            switch card {
            case .fish(let item, let img, let box): FishOfTheDay(item: item, img: img, box: box, zoom: zoom)
            case .guide(let item, let img, let box): GuideCard(item: item, img: img, box: box, zoom: zoom)
            case .story(let item, let words): GuideCard(item: item, img: words.img, box: words.imgBox, words: words, zoom: zoom)
            case .season(let items): SeasonCard(items: items, zoom: zoom)
            case .tank(let tank): TankCard(tank: tank)
            case .firstTank: FirstTankCard()
            case .series(let item): SeriesCard(item: item, zoom: zoom)
            case .latest(let rows): LatestCard(rows: rows, zoom: zoom)
            }
          }
          if handbook.status == .loading { ProgressView().frame(maxWidth: .infinity).padding(.top, 80) }
        }
        .padding(.bottom, 32)
      }
      .v2ClearOfTheFade()
      .modifier(ClearUnderLargeTitle())
      .navigationTitle("Hôm nay")
      // Its own, not one iOS picks from what passes under the bar: a dark card there turned the bar's words and the clock
      // white on the white band. As a fish's page pins its own.
      .toolbarColorScheme(scheme, for: .navigationBar)
      .profileButton()
      .onAppear { if heldBeginner == nil { heldBeginner = beginner } }
      .v2ClearsFootGoingBack(path.count)
      .v2Destinations(zoom: zoom)
      .environment(\.v2Posts, Posts(open: $postOpen) { path = NavigationPath() })
      .onChange(of: path.count) { if path.isEmpty { postOpen = false } }
      .task { await handbook.appear() }
      .refreshable {
        await handbook.load()
        refreshes += 1
      }
      .environment(\.v2PhotoTries, refreshes)
    }
    .v2StackLinks($path)
    .onReceive(NotificationCenter.default.publisher(for: UIApplication.significantTimeChangeNotification)) { _ in
      today = TodayView.now
      heldBeginner = tanks.tanks.allSatisfy { $0.species.isEmpty }
    }
  }

  /// In the app's language, as the words around it: on a phone set to a language the app doesn't have, iOS's locale can be
  /// another of the app's (Malay, on an English phone), and `Text(_:format:)` would put that one in. The day and its month
  /// kept on one line ("8 tháng 11", not "8 tháng" over "11"), in Thai too, which has no comma before them.
  private var date: String {
    let s = today.formatted(.dateTime.weekday(.wide).day().month(.wide).locale(Locale(identifier: handbook.lang)))
    guard let day = s.firstIndex(where: \.isNumber) else { return s }
    return s[..<day] + s[day...].replacingOccurrences(of: " ", with: "\u{00A0}")
  }

  /// The reader's date. UI tests fix it (`-today 2026-11-13`), as the day's own, at noon.
  static var now: Date {
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    if let i = args.firstIndex(of: "-today"), i + 1 < args.count {
      let d = args[i + 1].split(separator: "-").compactMap { Int($0) }
      var cal = Calendar(identifier: .gregorian)
      cal.timeZone = .current
      if d.count == 3, let day = cal.date(from: DateComponents(year: d[0], month: d[1], day: d[2], hour: 12)) { return day }
    }
    #endif
    return .now
  }

  /// A fish or guide with the photo for its card and where its fish is (none: drawn without one), and a story with the
  /// editors' words.
  enum Card: Identifiable {
    case fish(HandbookIndex.Item, img: String?, box: PhotoBox?), guide(HandbookIndex.Item, img: String?, box: PhotoBox?)
    case story(HandbookIndex.Item, HandbookIndex.Home.Day.Story)
    case season([HandbookIndex.Item]), tank(Tank), firstTank
    case series(HandbookIndex.Item), latest([Latest.Row])

    var id: String {
      switch self {
      case .fish(let i, _, _): "fish" + i.path
      case .guide(let i, _, _): "guide" + i.path
      case .story(let i, _): "story" + i.path
      case .season: "season"
      case .tank(let t): "tank" + t.id
      case .firstTank: "first-tank"
      case .series(let i): "series" + i.path
      case .latest: "latest"
      }
    }

    /// The page it opens, for the one-card-a-page rule.
    var page: String? {
      switch self {
      case .fish(let i, _, _), .guide(let i, _, _), .story(let i, _): i.path
      default: nil
      }
    }
  }

  /// Today's cards: the editors' for the day, or the handbook's picks, a different one each day; then what the reader has.
  /// A page shows on one card only (its card is where it zooms from).
  private var cards: [Card] {
    let s = handbook.shelves
    let day = Calendar.current.ordinality(of: .day, in: .era, for: today) ?? 0
    // One with a photo where the shelf has any.
    func pick(_ items: [HandbookIndex.Item], _ turn: Int = 0) -> HandbookIndex.Item? {
      let photographed = items.filter { $0.img != nil }, pool = photographed.isEmpty ? items : photographed
      return pool.isEmpty ? nil : pool[(day + turn) % pool.count]
    }
    var out: [Card] = []
    if let plan = s.plan[HandbookIndex.Home.Day.key(today)] {
      // As planned: a slot left empty stays empty, as nothing passed the editors' checks for it, and each card shows the
      // photo picked for it or none, never the index's small one scaled up.
      var planned: [Card] = []
      if let f = plan.fish { planned.append(.fish(f, img: plan.img, box: plan.imgBox)) }
      if let g = plan.guide { planned.append(.guide(g, img: plan.guideImg, box: plan.guideImgBox)) }
      if let p = plan.story, let words = plan.words { planned.append(.story(p, words)) }
      var pages = Set<String>()
      out = planned.filter { $0.page.map { pages.insert($0).inserted } ?? true }
    } else {
      // A reader with no fish yet isn't first shown one that needs a very large tank.
      let easy = beginner ? s.featuredFish.filter { ($0.facts.tankCm ?? 0) <= 100 } : []
      if let f = pick(easy.isEmpty ? s.featuredFish : easy) { out.append(.fish(f, img: f.img, box: f.imgBox)) }
      if let g = pick(s.firstGuides) { out.append(.guide(g, img: g.img, box: g.imgBox)) }
    }
    // The northern winter (November to March): the well-known fish that need a heater. Vietnam's season, so Vietnamese only.
    let month = Calendar.current.component(.month, from: today)
    var shown = Set(out.compactMap(\.page))
    if handbook.lang == "vi", [11, 12, 1, 2, 3].contains(month) {
      let warm = s.featuredFish.filter { ($0.facts.tempC?.min ?? 0) >= 23 && $0.img != nil && !shown.contains($0.path) }
      if warm.count >= 2 {
        out.append(.season(Array(warm.prefix(4))))
        shown.formUnion(warm.prefix(4).map(\.path))
      }
    }
    // The reader's tank, or, with none yet, the way to add one.
    out.append(tanks.tanks.first.map { .tank($0) } ?? .firstTank)
    if let v = pick(s.all(.video), 3) { out.append(.series(v)) }
    // A page updated on two days is listed twice there, and shows on one card here.
    let latest = handbook.latest.filter { $0.item.img != nil && shown.insert($0.item.path).inserted }.prefix(3)
    if !latest.isEmpty { out.append(.latest(Array(latest))) }
    return out
  }
}

/// The words on a card above its title; `faded` on a photo's colour, not on a colour of their own (4.5:1 on white).
/// A card's round mark (a guide's book, a story's quote, a video's play), all one size: its circle grows with the text up to
/// the largest size before the accessibility ones, no further (past it, a quarter of the screen of decoration), and its
/// symbol is a share of the circle, so it sits inside at any size.
private struct CardMark: View {
  let symbol: String
  @ScaledMetric(relativeTo: .title3) private var scaled: CGFloat = 48

  var body: some View {
    let d = min(scaled, 64)
    Image(systemName: symbol).font(.system(size: d * 0.42, weight: .semibold))
      .frame(width: d, height: d)
      .background(Circle().fill(.white.opacity(0.18)))
      .accessibilityHidden(true)
  }
}

private struct Eyebrow: View {
  let text: LocalizedStringKey
  var faded = true
  var body: some View {
    Text(text).font(.footnote.weight(.bold)).textCase(.uppercase).opacity(faded ? 0.8 : 1)
  }
}

/// A fish's figures in a line: "Dễ · 24–30 °C · 15 cm".
@MainActor func factsLine(_ item: HandbookIndex.Item, _ lang: String) -> String? {
  // A breed's are on its own card, as on its page.
  let locale = Locale(identifier: lang), f = item.facts.any ? item.facts : item.card ?? item.facts
  var parts: [String] = []
  if let d = f.difficulty { parts.append(FactsCard.level(d)) }
  if let t = f.tempC { parts.append(HandbookIndex.Facts.degrees(t, locale)) }
  // A figure stays with its unit when the line wraps.
  if let s = f.sizeCm { parts.append("\(HandbookIndex.Facts.number(s, locale))\u{A0}cm") }
  return parts.isEmpty ? nil : parts.joined(separator: " · ")
}

extension HandbookIndex.Facts {
  /// "24–30 °C", whole when a line wraps: the range and its unit on one line.
  static func degrees(_ t: Range, _ locale: Locale) -> String {
    "\(range(t, locale).replacingOccurrences(of: "–", with: "\u{2060}–\u{2060}"))\u{A0}°C"
  }
}

/// The fish of the day: its photo, its colour washed over the top for its name, and its lockup on a band of that colour.
@available(iOS 18, *)
private struct FishOfTheDay: View {
  let item: HandbookIndex.Item
  /// The card's photo: the editors' for the day, or the fish's own; and where its fish is.
  let img: String?
  let box: PhotoBox?
  let zoom: Namespace.ID

  init(item: HandbookIndex.Item, img: String?, box: PhotoBox?, zoom: Namespace.ID) {
    self.item = item
    self.img = img
    self.box = box
    self.zoom = zoom
    _colour = State(initialValue: PhotoColour.cached(img) ?? PhotoColour.fallback)
  }

  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size
  @State private var colour: Color
  /// Taller with the text, so a long name at the larger sizes stays on the photo.
  @ScaledMetric(relativeTo: .largeTitle) private var height: CGFloat = 420

  var body: some View {
    VStack(spacing: 0) {
      NavigationLink(value: Post(item: item)) {
        // At the accessibility sizes a name over the photo would hide the fish: it goes above, on the photo's colour. A fish
        // with no photo has no photo's place: its name on the colour.
        if size.isAccessibilitySize || img == nil {
          VStack(spacing: 0) {
            name.frame(maxWidth: .infinity, alignment: .leading).background(colour)
            if img != nil { V2Photo(src: img, box: box, ground: colour) { colour = $0 }.frame(height: 260) }
          }
        } else {
          V2Photo(src: img, box: box, ground: colour) { colour = $0 }
            .modifier(WordsOnPhoto(colour: colour, edge: .top, height: height) { name })
            .overlay(alignment: .bottom) {
              // Long, as `WordsOnPhoto`'s: on a photo with a black ground a short one ends in a hard stripe.
              LinearGradient(colors: [colour.opacity(0), colour], startPoint: .top, endPoint: .bottom).frame(height: 120)
            }
        }
      }
      .buttonStyle(CardPress())
      .accessibilityIdentifier("v2-fish-of-the-day")
      // The band under it opens the same page: read here, one stop for VoiceOver (Lockup's `title`).
      .accessibilityValue(Text(verbatim: [item.subUnderName ?? item.kind.title, factsLine(item, handbook.lang)].compactMap { $0 }.joined(separator: ", ")))
      // The name is the card's title: under it, the fish's other name and figures, not the name and photo again.
      Lockup(item: item, title: item.subUnderName ?? item.kind.title, line: factsLine(item, handbook.lang), onDark: true, icon: false, post: true)
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(colour)
    }
    .animation(.easeInOut(duration: 0.4), value: colour)
    .v2Card()
    .matchedTransitionSource(id: item.path, in: zoom)
    .padding(.horizontal, 20)
  }

  private var name: some View {
    VStack(alignment: .leading, spacing: 4) {
      Eyebrow(text: "Gợi ý hôm nay")
      Text(verbatim: item.name).font(.system(.largeTitle, weight: .heavy)).lineLimit(size.isAccessibilitySize ? 5 : 2)
        .multilineTextAlignment(.leading)
    }
    .foregroundStyle(.white)
    .padding(20)
  }
}

/// A guide as a story's cover: its photo, 16:9, as a guide's photos mostly are (video stills, banners), and its title under
/// it on the photo's colour; the editors pick its photo for that shape (docs/curation.md). A story, the editors' page told
/// in a few words, is drawn the same, with their eyebrow, title and line under it where they wrote them.
@available(iOS 18, *)
private struct GuideCard: View {
  let item: HandbookIndex.Item
  /// The card's photo: the editors' for the day, or the guide's own; and where its fish is.
  let img: String?
  let box: PhotoBox?
  var words: HandbookIndex.Home.Day.Story?
  let zoom: Namespace.ID

  init(item: HandbookIndex.Item, img: String?, box: PhotoBox?, words: HandbookIndex.Home.Day.Story? = nil, zoom: Namespace.ID) {
    self.item = item
    self.img = img
    self.box = box
    self.words = words
    self.zoom = zoom
    // Until its photo comes, or when it doesn't, its own ground: not the tank card's green, one card twice.
    _colour = State(initialValue: PhotoColour.cached(img) ?? (words == nil ? Self.rust : Self.plum)[0])
  }

  /// A guide's ground, and a story's: each its own, so the two without a photo aren't one card twice.
  private static let rust = [Color(red: 0.48, green: 0.23, blue: 0.13), Color(red: 0.3, green: 0.13, blue: 0.08)]
  private static let plum = [Color(red: 0.36, green: 0.17, blue: 0.33), Color(red: 0.22, green: 0.1, blue: 0.21)]

  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size
  @State private var colour: Color

  var body: some View {
    NavigationLink(value: Post(item: item)) {
      Group {
        if img != nil {
          VStack(spacing: 0) {
            V2Photo(src: img, box: box, ground: colour) { colour = $0 }
              .aspectRatio(16 / 9, contentMode: .fit)
              .overlay(alignment: .bottom) {
                LinearGradient(colors: [colour.opacity(0), colour], startPoint: .top, endPoint: .bottom).frame(height: 40)
              }
            // Its words their whole height, at any size: shared with the photo, they lost lines over an empty band.
            cover.fixedSize(horizontal: false, vertical: true)
              .padding(20).frame(maxWidth: .infinity, alignment: .leading).background(colour)
          }
        } else {
          // No photo: its words on a ground of its own, not the tank card's green, under a mark of what it is, as the video
          // card's play button: a card to open, not a heading over the next. A story's ground is its own too, so a guide and
          // a story both without one aren't one card twice.
          VStack(alignment: .leading, spacing: 14) {
            // A story, the editors' words: a quote's mark, not a guide's book.
            CardMark(symbol: words != nil ? "quote.opening" : item.kind == .plant ? "leaf.fill" : item.kind == .guide ? "book.pages.fill" : "fish.fill")
            cover
          }
          .foregroundStyle(.white)
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(20)
          .background(LinearGradient(colors: words == nil ? Self.rust : Self.plum, startPoint: .topLeading, endPoint: .bottomTrailing))
        }
      }
      .animation(.easeInOut(duration: 0.4), value: colour)
      .v2Card()
    }
    .buttonStyle(CardPress())
    .matchedTransitionSource(id: item.path, in: zoom)
    .padding(.horizontal, 20)
  }

  private var cover: some View {
    VStack(alignment: .leading, spacing: 6) {
      if let eyebrow = words?.eyebrow ?? handbook.shelves.sections.first(where: { $0.key == item.section })?.label {
        Text(verbatim: eyebrow).font(.footnote.weight(.bold)).textCase(.uppercase).opacity(0.8)
      } else if item.kind == .guide {
        Eyebrow(text: "Hướng dẫn")
      } else {
        Text(verbatim: item.kind.title).font(.footnote.weight(.bold)).textCase(.uppercase).opacity(0.8)
      }
      Text(verbatim: words?.title ?? item.name).font(.system(.title, weight: .heavy)).lineLimit(size.isAccessibilitySize ? 8 : 4)
        .multilineTextAlignment(.leading)
      if let dek = words?.dek {
        // Whole: the editors' sentence, never cut mid-advice.
        Text(verbatim: dek).font(.subheadline).opacity(0.9).multilineTextAlignment(.leading)
          .fixedSize(horizontal: false, vertical: true)
      }
    }
    .foregroundStyle(.white)
  }
}

/// A topic of the season as a list card: the fish it names, each a lockup with what it needs.
@available(iOS 18, *)
private struct SeasonCard: View {
  let items: [HandbookIndex.Item]
  let zoom: Namespace.ID
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Eyebrow(text: "Miền Bắc vào đông", faded: false).foregroundStyle(Color.accentColor)
      Text("Trời trở lạnh: vài loài quen thuộc cần sưởi").font(.system(.title2, weight: .heavy))
        .fixedSize(horizontal: false, vertical: true)
      VStack(spacing: 0) {
        ForEach(items) { item in
          Lockup(item: item, line: item.facts.tempC.map { HandbookIndex.Facts.degrees($0, Locale(identifier: handbook.lang)) },
                 post: true, thumb: 52)
            .padding(.vertical, 6)
            .matchedTransitionSource(id: item.path, in: zoom)
          if item.path != items.last?.path { Divider().padding(.leading, size.isAccessibilitySize ? 0 : 64) }
        }
      }
      .padding(.top, 10)
    }
    .padding(18)
    .background(Color(.tertiarySystemBackground))
    .v2Card()
    .padding(.horizontal, 20)
  }
}

/// The reader's first tank: its name, water and what lives in it, drawn; it opens on the tanks tab.
@available(iOS 18, *)
private struct TankCard: View {
  let tank: Tank
  @Environment(\.openScreen) private var openScreen
  @Environment(\.dynamicTypeSize) private var size
  private var empty: Bool { tank.species.isEmpty && tank.plants.isEmpty }

  var body: some View {
    Button { openScreen(.tanks(tank.id)) } label: {
      VStack(alignment: .leading, spacing: 4) {
        Eyebrow(text: empty ? "Việc tiếp theo" : "Bể đang nuôi")
        Text(verbatim: tank.name).font(.system(.title2, weight: .heavy)).lineLimit(2)
        TankSketch(dims: tank.dims, fish: tank.species.reduce(0) { $0 + ($1.count ?? 1) }, plants: tank.plants.count)
          .frame(height: 140)
          .padding(.vertical, 12)
        // Down the card at the accessibility sizes, not cut across it.
        (size.isAccessibilitySize ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
                                  : AnyLayout(HStackLayout(alignment: .bottom, spacing: 24))) {
          if let l = tank.totalLitres {
            fact("Nước", litresText(l))
          }
          // An empty tank says what's next, not "0" twice.
          if empty {
            Text("Thêm cá hoặc cây đầu tiên").font(.subheadline.weight(.semibold))
          } else {
            fact("Cá", "\(tank.species.reduce(0) { $0 + ($1.count ?? 1) })")
            fact("Cây", "\(tank.plants.count)")
          }
        }
      }
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(20)
      .background(LinearGradient(colors: [Color(red: 0.12, green: 0.35, blue: 0.26), Color(red: 0.07, green: 0.22, blue: 0.16)],
                                 startPoint: .topLeading, endPoint: .bottomTrailing))
      .v2Card()
    }
    .buttonStyle(CardPress())
    .accessibilityIdentifier("v2-tank-card")
    .padding(.horizontal, 20)
  }

  private func fact(_ label: LocalizedStringKey, _ value: String) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(label).font(.caption2.weight(.semibold)).textCase(.uppercase).opacity(0.7)
      Text(verbatim: value).font(.headline)
    }
  }
}

/// With no tank yet: an empty one drawn, and the way to add the first, on the tanks tab.
@available(iOS 18, *)
private struct FirstTankCard: View {
  @Environment(\.openScreen) private var openScreen

  var body: some View {
    Button { openScreen(.tanks(nil)) } label: {
      VStack(alignment: .leading, spacing: 4) {
        Eyebrow(text: "Bể của bạn")
        Text("Thêm bể đầu tiên").font(.system(.title2, weight: .heavy))
        TankSketch(dims: nil, fish: 0).frame(height: 120).padding(.vertical, 12)
        Text("Thêm bể đầu tiên để ghi lại kích thước, nền và ghi chú.").font(.subheadline).opacity(0.85)
          .fixedSize(horizontal: false, vertical: true)
      }
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(20)
      .background(LinearGradient(colors: [Color(red: 0.12, green: 0.35, blue: 0.26), Color(red: 0.07, green: 0.22, blue: 0.16)],
                                 startPoint: .topLeading, endPoint: .bottomTrailing))
      .v2Card()
    }
    .buttonStyle(CardPress())
    .accessibilityIdentifier("v2-first-tank")
    .padding(.horizontal, 20)
  }
}

/// A tank drawn at its length to height: glass, water, sand, a few plants and its fish as small marks.
private struct TankSketch: View {
  let dims: (l: Double, w: Double, h: Double)?
  let fish: Int
  /// Its plants, up to four stems: none drawn for none.
  var plants = 0

  var body: some View {
    Canvas { ctx, size in
      let ratio = dims.map { $0.l / max($0.h, 1) } ?? 1.8
      var w = size.width, h = w / ratio
      if h > size.height { h = size.height; w = h * ratio }
      let box = CGRect(x: (size.width - w) / 2, y: size.height - h, width: w, height: h)
      ctx.fill(Path(roundedRect: box, cornerRadius: 6), with: .linearGradient(
        Gradient(colors: [Color(red: 0.55, green: 0.82, blue: 0.9).opacity(0.35), Color(red: 0.3, green: 0.65, blue: 0.75).opacity(0.5)]),
        startPoint: box.origin, endPoint: CGPoint(x: box.minX, y: box.maxY)))
      let sand = CGRect(x: box.minX, y: box.maxY - h * 0.16, width: w, height: h * 0.16)
      ctx.fill(Path(roundedRect: sand, cornerRadius: 4), with: .color(Color(red: 0.78, green: 0.64, blue: 0.42)))
      for (i, x) in [0.08, 0.82, 0.14, 0.9].prefix(min(plants, 4)).enumerated() {
        let ph = h * [0.6, 0.7, 0.45, 0.5][i]
        let stem = CGRect(x: box.minX + w * x, y: sand.minY - ph, width: 7, height: ph)
        ctx.fill(Path(roundedRect: stem, cornerRadius: 3.5), with: .color(Color(red: 0.42, green: 0.78, blue: 0.4)))
      }
      for i in 0..<min(fish, 12) {
        let x = box.minX + w * (0.3 + 0.4 * Double((i * 37) % 10) / 10), y = box.minY + h * (0.25 + 0.4 * Double((i * 53) % 10) / 10)
        ctx.fill(Path(roundedRect: CGRect(x: x, y: y, width: 12, height: 5), cornerRadius: 2.5), with: .color(.white.opacity(0.9)))
      }
      ctx.stroke(Path(roundedRect: box, cornerRadius: 6), with: .color(.white.opacity(0.6)), lineWidth: 2)
    }
    .accessibilityHidden(true)
  }
}

/// A video series, tinted with its play symbol: no thumbnail (YouTube's show faces, hands and logos, which the photo
/// rules ban), the count of its videos.
@available(iOS 18, *)
private struct SeriesCard: View {
  let item: HandbookIndex.Item
  let zoom: Namespace.ID
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    NavigationLink(value: Post(item: item)) {
      VStack(alignment: .leading, spacing: 14) {
        // Its mark first, as a guide's or a story's: under its eyebrow, wrapped at the largest text, it hung below a word.
        CardMark(symbol: "play.fill")
        Eyebrow(text: "Video hướng dẫn")
        Text(verbatim: item.name).font(.system(.title2, weight: .heavy)).lineLimit(size.isAccessibilitySize ? nil : 3).multilineTextAlignment(.leading)
        if let n = item.parts { Text("\(n) video").font(.subheadline.weight(.semibold)).opacity(0.75) }
      }
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(20)
      .background(LinearGradient(colors: [Color(red: 0.17, green: 0.23, blue: 0.4), Color(red: 0.1, green: 0.13, blue: 0.25)],
                                 startPoint: .topLeading, endPoint: .bottomTrailing))
      .v2Card()
    }
    .buttonStyle(CardPress())
    .matchedTransitionSource(id: item.path, in: zoom)
    .padding(.horizontal, 20)
  }
}

/// What's new on the site, the newest three, as a list card.
@available(iOS 18, *)
private struct LatestCard: View {
  let rows: [Latest.Row]
  let zoom: Namespace.ID
  @Environment(\.dynamicTypeSize) private var size

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(alignment: .firstTextBaseline) {
        Text("Mới cập nhật").font(.system(.title2, weight: .heavy))
        Spacer()
        if !size.isAccessibilitySize { seeAll }
      }
      VStack(spacing: 0) {
        ForEach(rows) { row in
          Lockup(item: row.item, post: true, thumb: 52).padding(.vertical, 6)
            .matchedTransitionSource(id: row.item.path, in: zoom)
          if row.id != rows.last?.id { Divider().padding(.leading, size.isAccessibilitySize ? 0 : 64) }
        }
      }
      .padding(.top, 10)
      // At the accessibility sizes its header has no room for it: at the list's end, as Khám phá's.
      if size.isAccessibilitySize { seeAll.font(.body.weight(.semibold)).padding(.top, 4) }
    }
    .padding(18)
    .background(Color(.tertiarySystemBackground))
    .v2Card()
    .padding(.horizontal, 20)
  }

  private var seeAll: some View {
    NavigationLink(value: Browse.latest) { Text("Xem tất cả").frame(minHeight: 44).contentShape(.rect) }
  }
}
