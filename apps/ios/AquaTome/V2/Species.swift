import Handbook
import SwiftUI

/// v1's page for a fish or plant, as v2's species page links to it ("Xem trang đầy đủ"): the whole page as the app
/// draws it, with every part v2's doesn't show yet.
struct FullPage: Hashable {
  let item: HandbookIndex.Item
}

/// A fish's or plant's page, as an app's page in the App Store: the photo across the top and its colour washing down
/// behind the name, "Thêm vào bể", the facts strip and the gallery, the colour following the photo as the gallery
/// pages; then the summary, the tank-mates shelves and the whole page one tap away.
struct SpeciesPage: View {
  let item: HandbookIndex.Item
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.colorScheme) private var scheme
  @State private var doc: PageDoc?
  @State private var colours: [String: Color] = [:]
  /// The gallery's photo in view: the hero and the colour follow it.
  @State private var shown: String?
  @State private var putting = false

  private var photos: [PageDoc.Image] {
    guard let doc else { return [] }
    var out: [PageDoc.Image] = doc.lead.map { [$0] } ?? []
    for case let .gallery(_, _, list, _, _) in doc.blocks { out += list.filter { p in !out.contains { $0.src == p.src } } }
    return out
  }

  private var hero: String? { shown ?? doc?.lead?.src ?? item.img }
  private var colour: Color { hero.flatMap { colours[$0] } ?? colours.values.first ?? PhotoColour.fallback }

  var body: some View {
    ScrollView {
      VStack(spacing: 0) {
        V2Photo(src: hero) { c in colours[hero ?? ""] = c }
          .frame(height: 420)
          .overlay(alignment: .bottom) {
            LinearGradient(colors: [colour.opacity(0), colour], startPoint: .top, endPoint: .bottom).frame(height: 140)
          }
          .overlay(alignment: .bottomTrailing) { credit }
          .animation(.easeInOut(duration: 0.35), value: hero)
        header
        FactsStrip(facts: item.facts, onDark: true).padding(.vertical, 14)
        if photos.count > 1 { gallery.padding(.bottom, 24) }
      }
      .background(colour)
      .animation(.easeInOut(duration: 0.45), value: colour)
      VStack(alignment: .leading, spacing: 28) {
        summary
        mates
        NavigationLink(value: FullPage(item: item)) {
          HStack {
            Text("Xem trang đầy đủ").font(.body.weight(.semibold))
            Spacer()
            Image(systemName: "chevron.right").foregroundStyle(.tertiary)
          }
          .padding(16)
          .background(.fill.quaternary, in: .rect(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .padding(.horizontal, 20)
      }
      .padding(.top, 24)
      .padding(.bottom, 40)
    }
    .ignoresSafeArea(edges: .top)
    .accessibilityIdentifier("v2-species")
    .toolbarBackground(.hidden, for: .navigationBar)
    .toolbar {
      ToolbarItem(placement: .topBarTrailing) {
        ShareLink(item: handbook.url(item)) { Image(systemName: "square.and.arrow.up") }
      }
    }
    .sheet(isPresented: $putting) { if let life = Life(item) { NavigationStack { PutOnTank(life: life) } } }
    .task(id: item.path) {
      doc = await handbook.doc(item)
      handbook.read(item)
    }
  }

  private var header: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(verbatim: item.name).font(.largeTitle.weight(.bold)).foregroundStyle(.white)
        .fixedSize(horizontal: false, vertical: true)
      if let sub = item.sub { Text(verbatim: sub).font(.title3).italic().foregroundStyle(.white.opacity(0.75)) }
      HStack(spacing: 12) {
        if Life(item) != nil {
          Button { putting = true } label: {
            Label("Thêm vào bể", systemImage: "plus")
              .font(.body.weight(.semibold))
              .foregroundStyle(colour)
              .padding(.horizontal, 18)
              .frame(minHeight: 44)
              .background(Capsule().fill(.white))
          }
          .buttonStyle(.plain)
          .accessibilityIdentifier("v2-add")
        }
      }
      .padding(.top, 10)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 20)
    .padding(.top, 4)
  }

  /// The photo's credit, quietly on it: the line and its licence, as the page has them.
  @ViewBuilder private var credit: some View {
    if let c = photos.first(where: { $0.src == hero })?.credit {
      Text(verbatim: c.licence.isEmpty ? c.text : "\(c.text) · \(c.licence)")
        .font(.caption2).foregroundStyle(.white.opacity(0.7))
        .padding(.horizontal, 20).padding(.bottom, 8)
    }
  }

  /// The page's photos as a carousel; the one in view takes the hero's place, and its colour the page's.
  private var gallery: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      LazyHStack(spacing: 10) {
        ForEach(photos, id: \.src) { p in
          V2Photo(src: p.thumb ?? p.src) { c in colours[p.src] = c }
            .frame(width: 260, height: 180)
            .clipShape(.rect(cornerRadius: 16, style: .continuous))
            .id(p.src)
            .accessibilityLabel(Text(verbatim: p.alt ?? item.name))
        }
      }
      .scrollTargetLayout()
    }
    .contentMargins(.horizontal, 20, for: .scrollContent)
    .scrollTargetBehavior(.viewAligned)
    .scrollPosition(id: $shown, anchor: .leading)
  }

  @ViewBuilder private var summary: some View {
    if let doc, let s = doc.blocks.lazy.compactMap({ b -> (String, String)? in
      if case let .summary(title, _, text?, _, _) = b { return (title, text) }
      return nil
    }).first {
      VStack(alignment: .leading, spacing: 8) {
        Text(verbatim: s.0).font(.title2.weight(.bold))
        Text(verbatim: s.1).font(.body).lineSpacing(3)
      }
      .padding(.horizontal, 20)
    }
  }

  /// "Nuôi chung": the fish to keep with it, then those to keep away, each with why, as shelves.
  @ViewBuilder private var mates: some View {
    if let doc, let m = doc.blocks.lazy.compactMap({ b -> PageDoc.Mates? in
      if case let .mates(m) = b { return m }
      return nil
    }).first {
      VStack(alignment: .leading, spacing: 18) {
        Text(verbatim: m.title).font(.title2.weight(.bold)).padding(.horizontal, 20)
        if let good = m.good { MatesRow(title: good.title, mates: good.items, good: true) }
        if let avoid = m.avoid { MatesRow(title: avoid.title, mates: avoid.items, good: false) }
      }
    }
  }
}

/// One side of "Nuôi chung": its fish as tiles that open their pages, why under each.
private struct MatesRow: View {
  let title: String
  let mates: [PageDoc.Mates.Mate]
  let good: Bool
  @Environment(HandbookModel.self) private var handbook

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Label { Text(verbatim: title) } icon: {
        Image(systemName: good ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(good ? .green : .red)
      }
      .font(.headline)
      .padding(.horizontal, 20)
      ScrollView(.horizontal, showsIndicators: false) {
        HStack(alignment: .top, spacing: 12) {
          ForEach(mates, id: \.path) { m in
            let item = handbook.item(at: m.path)
            NavigationLink(value: item) {
              VStack(alignment: .leading, spacing: 6) {
                V2Photo(src: m.img?.src ?? item?.img)
                  .frame(width: 150, height: 100)
                  .clipShape(.rect(cornerRadius: 14, style: .continuous))
                Text(verbatim: m.name).font(.subheadline.weight(.semibold)).lineLimit(2)
                if let why = m.why { Text(verbatim: why).font(.caption).foregroundStyle(.secondary).lineLimit(2) }
              }
              .frame(width: 150, alignment: .leading)
            }
            .buttonStyle(.plain)
            .disabled(item == nil)
          }
        }
        .padding(.horizontal, 20)
      }
    }
  }
}
