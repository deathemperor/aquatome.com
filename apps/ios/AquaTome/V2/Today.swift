import Handbook
import SwiftUI
import Tanks

/// "Hôm nay": a day's cards, as the App Store's Today tab: a fish of the day, a guide, a topic of the season, the
/// reader's own tank, a video series and what's new on the site, each from the handbook (its home picks, turned by the
/// day). A card zooms into its page.
@available(iOS 18, *)
struct TodayView: View {
  @Binding var path: NavigationPath
  @Environment(HandbookModel.self) private var handbook
  @Environment(TanksModel.self) private var tanks
  @Namespace private var zoom
  /// The feed scrolled under the status bar: a bar's material behind it then, none at the top.
  @State private var under = false

  var body: some View {
    NavigationStack(path: $path) {
      ScrollView {
        VStack(alignment: .leading, spacing: 28) {
          header
          // The kept copy in use, or none at all, as v1's Tìm says.
          if handbook.status == .offline || handbook.status == .failed {
            StatusText().font(.footnote).padding(.horizontal, 20)
          }
          ForEach(cards) { card in
            switch card {
            case .fish(let item): FishOfTheDay(item: item, zoom: zoom)
            case .guide(let item): GuideCard(item: item, zoom: zoom)
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
      .toolbarVisibility(.hidden, for: .navigationBar)
      // With no bar, the feed would scroll bare under the status bar: a bar's material behind it once it does.
      .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.y + $0.contentInsets.top > 4 } action: { _, u in under = u }
      .safeAreaInset(edge: .top, spacing: 0) {
        Color.clear.frame(height: 0).background(.bar.opacity(under ? 1 : 0)).animation(.easeInOut(duration: 0.2), value: under)
      }
      .v2Destinations(zoom: zoom)
      .task { await handbook.appear() }
      .refreshable { await handbook.load() }
    }
    .v2StackLinks($path)
  }

  private var header: some View {
    HStack(alignment: .bottom) {
      VStack(alignment: .leading, spacing: 2) {
        Text(Date.now, format: .dateTime.weekday(.wide).day().month(.wide))
          .font(.footnote.weight(.semibold)).textCase(.uppercase).foregroundStyle(.secondary)
        Text("Hôm nay").font(.largeTitle.weight(.bold))
      }
      Spacer()
      ProfileButton().font(.title).frame(minWidth: 44, minHeight: 44).padding(.bottom, 2)
    }
    .padding(.horizontal, 20)
    .padding(.top, 8)
  }

  enum Card: Identifiable {
    case fish(HandbookIndex.Item), guide(HandbookIndex.Item), season([HandbookIndex.Item]), tank(Tank), firstTank
    case series(HandbookIndex.Item), latest([Latest.Row])

    var id: String {
      switch self {
      case .fish(let i): "fish" + i.path
      case .guide(let i): "guide" + i.path
      case .season: "season"
      case .tank(let t): "tank" + t.id
      case .firstTank: "first-tank"
      case .series(let i): "series" + i.path
      case .latest: "latest"
      }
    }
  }

  /// Today's cards: each from the handbook's picks, a different one each day, and what the reader has. A page shows on
  /// one card only (its card is where it zooms from).
  private var cards: [Card] {
    let s = handbook.shelves
    let day = Calendar.current.ordinality(of: .day, in: .era, for: .now) ?? 0
    // One with a photo where the shelf has any.
    func pick(_ items: [HandbookIndex.Item], _ turn: Int = 0) -> HandbookIndex.Item? {
      let photographed = items.filter { $0.img != nil }, pool = photographed.isEmpty ? items : photographed
      return pool.isEmpty ? nil : pool[(day + turn) % pool.count]
    }
    var out: [Card] = []
    if let f = pick(s.featuredFish) { out.append(.fish(f)) }
    if let g = pick(s.firstGuides) { out.append(.guide(g)) }
    // The northern winter (November to March): the well-known fish that need a heater. Vietnam's season, so Vietnamese only.
    let month = Calendar.current.component(.month, from: .now)
    var shown = Set(out.compactMap { if case let .fish(i) = $0 { i.path } else if case let .guide(i) = $0 { i.path } else { nil } })
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
    let latest = handbook.latest.filter { $0.item.img != nil && !shown.contains($0.item.path) }.prefix(3)
    if !latest.isEmpty { out.append(.latest(Array(latest))) }
    return out
  }
}

/// The words on a card above its title; `faded` on a photo's colour, not on a colour of their own (4.5:1 on white).
private struct Eyebrow: View {
  let text: LocalizedStringKey
  var faded = true
  var body: some View {
    Text(text).font(.footnote.weight(.bold)).textCase(.uppercase).opacity(faded ? 0.8 : 1)
  }
}

/// A fish's figures in a line: "Dễ · 24–30 °C · 15 cm".
@MainActor func factsLine(_ item: HandbookIndex.Item, _ lang: String) -> String? {
  let locale = Locale(identifier: lang), f = item.facts
  var parts: [String] = []
  if let d = f.difficulty { parts.append(FactsCard.level(d)) }
  if let t = f.tempC { parts.append("\(HandbookIndex.Facts.range(t, locale)) °C") }
  if let s = f.sizeCm { parts.append("\(HandbookIndex.Facts.number(s, locale)) cm") }
  return parts.isEmpty ? nil : parts.joined(separator: " · ")
}

/// The fish of the day: its photo, its colour washed over the top for its name, and its lockup on a band of that colour.
@available(iOS 18, *)
private struct FishOfTheDay: View {
  let item: HandbookIndex.Item
  let zoom: Namespace.ID
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size
  @State private var colour = PhotoColour.fallback
  /// Taller with the text, so a long name at the larger sizes stays on the photo.
  @ScaledMetric(relativeTo: .largeTitle) private var height: CGFloat = 380

  var body: some View {
    VStack(spacing: 0) {
      NavigationLink(value: item) {
        V2Photo(src: item.img) { colour = $0 }
          .frame(height: min(height, 640))
          .overlay {
            // Down as far as the name goes, which at the accessibility sizes is most of the photo.
            let large = size.isAccessibilitySize
            LinearGradient(stops: [.init(color: colour.opacity(large ? 0.95 : 0.85), location: 0),
                                   .init(color: colour.opacity(large ? 0.95 : 0), location: large ? 0.7 : 0.5),
                                   .init(color: colour.opacity(0), location: large ? 0.85 : 0.5)],
                           startPoint: .top, endPoint: .bottom)
          }
          .overlay(alignment: .topLeading) {
            VStack(alignment: .leading, spacing: 4) {
              Eyebrow(text: "Gợi ý hôm nay")
              Text(verbatim: item.name).font(.system(.largeTitle, weight: .heavy)).lineLimit(size.isAccessibilitySize ? 5 : 2)
            }
            .foregroundStyle(.white)
            .padding(20)
          }
          .overlay(alignment: .bottom) {
            LinearGradient(colors: [colour.opacity(0), colour], startPoint: .top, endPoint: .bottom).frame(height: 80)
          }
      }
      .buttonStyle(CardPress())
      .accessibilityIdentifier("v2-fish-of-the-day")
      // The name is the card's title: under it, the fish's other name and figures, not the name and photo again.
      Lockup(item: item, title: item.sub ?? item.kind.title, line: factsLine(item, handbook.lang), onDark: true, icon: false)
        .padding(.horizontal, 16).padding(.vertical, 10)
        .background(colour)
    }
    .animation(.easeInOut(duration: 0.4), value: colour)
    .v2Card()
    .matchedTransitionSource(id: item.path, in: zoom)
    .padding(.horizontal, 20)
  }
}

/// A guide as a story's cover: its photo, and its title at the foot over the photo's colour.
@available(iOS 18, *)
private struct GuideCard: View {
  let item: HandbookIndex.Item
  let zoom: Namespace.ID
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.dynamicTypeSize) private var size
  @State private var colour = PhotoColour.fallback
  @ScaledMetric(relativeTo: .title) private var height: CGFloat = 420

  var body: some View {
    NavigationLink(value: item) {
      V2Photo(src: item.img) { colour = $0 }
        .frame(height: min(height, 700))
        .overlay {
          // Opaque under the words: a light photo's sand doesn't come through behind them (4.5:1 for the label).
          // Starts higher at the accessibility sizes, where the title takes most of the card.
          let large = size.isAccessibilitySize
          LinearGradient(stops: [.init(color: colour.opacity(0), location: large ? 0.05 : 0.3), .init(color: colour.opacity(0.95), location: large ? 0.25 : 0.55),
                                 .init(color: colour, location: large ? 0.35 : 0.65)], startPoint: .top, endPoint: .bottom)
        }
        .overlay(alignment: .bottomLeading) {
          VStack(alignment: .leading, spacing: 6) {
            if let section = handbook.shelves.sections.first(where: { $0.key == item.section })?.label {
              Text(verbatim: section).font(.footnote.weight(.bold)).textCase(.uppercase).opacity(0.8)
            } else {
              Eyebrow(text: "Hướng dẫn")
            }
            Text(verbatim: item.name).font(.system(.title, weight: .heavy)).lineLimit(size.isAccessibilitySize ? 8 : 4)
              .multilineTextAlignment(.leading)
          }
          .foregroundStyle(.white)
          .padding(20)
        }
        .animation(.easeInOut(duration: 0.4), value: colour)
        .v2Card()
    }
    .buttonStyle(CardPress())
    .matchedTransitionSource(id: item.path, in: zoom)
    .padding(.horizontal, 20)
  }
}

/// A topic of the season as a list card: the fish it names, each a lockup with what it needs.
@available(iOS 18, *)
private struct SeasonCard: View {
  let items: [HandbookIndex.Item]
  let zoom: Namespace.ID
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Eyebrow(text: "Miền Bắc vào đông", faded: false).foregroundStyle(Color.accentColor)
      Text("Trời trở lạnh: vài loài quen thuộc cần sưởi").font(.system(.title2, weight: .heavy))
        .fixedSize(horizontal: false, vertical: true)
      VStack(spacing: 0) {
        ForEach(items) { item in
          Lockup(item: item, line: item.facts.tempC.map { "\(HandbookIndex.Facts.range($0, Locale(identifier: handbook.lang))) °C" },
                 thumb: 52)
            .padding(.vertical, 6)
            .matchedTransitionSource(id: item.path, in: zoom)
          if item.path != items.last?.path { Divider().padding(.leading, 64) }
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
  private var empty: Bool { tank.species.isEmpty && tank.plants.isEmpty }

  var body: some View {
    Button { openScreen(.tanks(tank.id)) } label: {
      VStack(alignment: .leading, spacing: 4) {
        Eyebrow(text: empty ? "Việc tiếp theo" : "Bể đang nuôi")
        Text(verbatim: tank.name).font(.system(.title2, weight: .heavy)).lineLimit(2)
        TankSketch(dims: tank.dims, fish: tank.species.reduce(0) { $0 + ($1.count ?? 1) }, plants: tank.plants.count)
          .frame(height: 140)
          .padding(.vertical, 12)
        HStack(alignment: .bottom, spacing: 24) {
          if let l = tank.totalLitres {
            fact("Nước", "\(Int(l.rounded())) l")
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

  var body: some View {
    NavigationLink(value: item) {
      VStack(alignment: .leading, spacing: 14) {
        Eyebrow(text: "Video hướng dẫn")
        Image(systemName: "play.fill").font(.title3)
          .frame(width: 48, height: 48)
          .background(Circle().fill(.white.opacity(0.18)))
        Text(verbatim: item.name).font(.system(.title2, weight: .heavy)).lineLimit(3).multilineTextAlignment(.leading)
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

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      Eyebrow(text: "Mới trên AquaTome", faded: false).foregroundStyle(Color.accentColor)
      HStack(alignment: .firstTextBaseline) {
        Text("Mới cập nhật").font(.system(.title2, weight: .heavy))
        Spacer()
        NavigationLink(value: Browse.latest) { Text("Xem tất cả").frame(minHeight: 44).contentShape(.rect) }
      }
      VStack(spacing: 0) {
        ForEach(rows) { row in
          Lockup(item: row.item, thumb: 52).padding(.vertical, 6)
            .matchedTransitionSource(id: row.item.path, in: zoom)
          if row.id != rows.last?.id { Divider().padding(.leading, 64) }
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
