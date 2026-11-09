import Handbook
import SwiftUI

/// Every photo of a page's gallery, in rows that keep each photo's shape (PhotoRows), pushed in the tab's stack: the count
/// as its title, then its readers' photos as a part of their own, outside that count (docs/design/photo-grid.md). A tap
/// opens the viewer on that list. Each row's size comes from the data, so nothing moves as photos arrive.
struct PhotoGrid: View {
  /// Where it opens.
  enum Place: Hashable { case photos, readers }

  /// A page's gallery, with the page's name.
  struct Gallery {
    let name: String
    let title: String
    let note: String
    let photos: [PageDoc.Image]

    /// The gallery of a page drawn from `pieces` (NativePage's, or v2's whole page, its parts joined), named by the
    /// page's title; nil for a page with none.
    init?(pieces: some Sequence<NativePage.Piece>) {
      var name = ""
      for p in pieces {
        if case let .text(s, _, .title) = p { name = String(s.characters) }
        if case let .gallery(title, note, photos, _) = p {
          (self.name, self.title, self.note, self.photos) = (name, title, note, photos)
          return
        }
      }
      return nil
    }
  }

  /// A row's place for a scroll to it, in either list.
  struct RowID: Hashable {
    let readers: Bool
    let row: Int
  }

  /// The viewer open on a photo of either list.
  private struct Shown: Identifiable {
    let readers: Bool
    let index: Int
    var id: String { "\(readers) \(index)" }
  }

  let gallery: Gallery
  let talk: PageDoc.Talk?
  let at: Place
  /// What the site answered, shared with the page's own part: nil until it has.
  @Binding var readerPhotos: [Readers.Photo]?
  @Environment(HandbookModel.self) private var handbook
  @Environment(AccountModel.self) private var account
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @ScaledMetric(relativeTo: .largeTitle) private var titleSize = 40.0
  @State private var shown: Shown?
  @State private var posting = false
  @State private var opened = false
  @State private var pastTitle = false
  @State private var readersUp = false

  private static let readersPart = "grid-readers"

  /// Less what the reader reported or whose poster they blocked, on this phone.
  private var shownReaders: [Readers.Photo] {
    let safety = handbook.safety
    return (readerPhotos ?? []).filter { !safety.hides(ReaderItem($0)) }
  }

  var body: some View {
    let readers = shownReaders, readerImages = readers.map(PageDoc.Image.init(reader:))
    GeometryReader { outer in
      let photoRows = PhotoRows.rows(ratios: Self.ratios(gallery.photos), width: outer.size.width)
      let readerRows = PhotoRows.rows(ratios: Self.ratios(readerImages), width: outer.size.width)
      ScrollViewReader { proxy in
        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            header(readers: readers.count)
            PhotoGridRows(rows: photoRows, photos: gallery.photos, readers: false, screen: outer.size.height) { show(false, $0) }
            if !readers.isEmpty {
              VStack(alignment: .leading, spacing: 0) {
                readersHeader(count: readers.count)
                PhotoGridRows(rows: readerRows, photos: readerImages, readers: true, screen: outer.size.height) { show(true, $0) }
                if talk?.photos != nil, account.state != .unknown, account.state != .off {
                  Button { posting = true } label: { Label("Gửi ảnh của bạn", systemImage: "plus").frame(maxWidth: .infinity) }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .controlSize(.large)
                    .padding(.horizontal)
                    .padding(.top, 16)
                    .accessibilityIdentifier("grid-post-photo")
                }
              }
              .id(Self.readersPart)
              // In the upper half of the screen, or a part too short ever to get there, its end in view.
              .onGeometryChange(for: Bool.self) { g in
                let f = g.frame(in: .scrollView), screen = outer.size.height
                return f.minY < screen / 2 || f.maxY <= screen
              } action: { readersUp = $0 }
            }
          }
          .padding(.bottom, 32)
        }
        // The one link here: down to the readers' part. At once: a slide past hundreds of photos would start and stop a
        // fetch for each.
        .environment(\.openURL, OpenURLAction { _ in
          proxy.scrollTo(Self.readersPart, anchor: .top)
          return .handled
        })
        .onAppear {
          if at == .readers, !opened { proxy.scrollTo(Self.readersPart, anchor: .top) }
          opened = true
        }
        .fullScreenCover(item: $shown) { s in
          GalleryViewer(title: s.readers ? String(localized: "Ảnh bạn đọc") : gallery.title, note: s.readers ? "" : gallery.note,
                        photos: s.readers ? readerImages : gallery.photos, readers: s.readers ? readers.map(ReaderItem.init) : nil, index: s.index) { i in
            // Behind the viewer, with no slide of its own; no scroll at all for a photo already on the screen.
            guard let row = PhotoRows.row(of: i, in: s.readers ? readerRows : photoRows) else { return }
            var t = Transaction()
            t.disablesAnimations = true
            withTransaction(t) { proxy.scrollTo(RowID(readers: s.readers, row: row)) }
          }
        }
      }
    }
    .navigationTitle(barTitle)
    .navigationBarTitleDisplayMode(.inline)
    .task {
      guard let talk else { return }
      let (_, photos) = await handbook.readers(talk)
      guard !Task.isCancelled, let photos else { return }
      readerPhotos = photos
    }
    .sheet(isPresented: $posting) {
      ReaderPost(kind: .photo, key: talk?.photos ?? "", name: gallery.name) { _ in }
    }
    #if DEBUG
    .background { testsRead }
    #endif
  }

  /// Nothing while the title shows; the count once it has scrolled away; "Ảnh bạn đọc" once their part is in the upper
  /// half of the screen or ends on it.
  private var barTitle: Text {
    guard pastTitle else { return Text(verbatim: "") }
    // Not of a part that's gone, its last photo reported.
    return readersUp && !shownReaders.isEmpty ? Text("Ảnh bạn đọc") : Text("\(gallery.photos.count) ảnh")
  }

  private func header(readers: Int) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("\(gallery.photos.count) ảnh")
        .font(.system(size: titleSize, weight: .bold, design: .serif))
        .accessibilityAddTraits(.isHeader)
        .onGeometryChange(for: Bool.self) { $0.frame(in: .scrollView).maxY < 0 } action: { pastTitle = $0 }
      Text(line(readers: readers)).font(.subheadline).foregroundStyle(.secondary)
    }
    .padding(.horizontal)
    .padding(.top, 8)
    .padding(.bottom, 12)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// The page's name, where its photos are from, and with readers' photos a link down to them.
  private func line(readers: Int) -> AttributedString {
    let source = PhotoRows.source(gallery.note)
    var out = AttributedString(source.isEmpty ? gallery.name : gallery.name + ", " + source)
    if readers > 0 {
      var link = AttributedString(String(localized: "Xem \(readers) ảnh bạn đọc gửi ↓"))
      link.link = URL(string: "aquatome-grid:readers")
      out += AttributedString(" ") + link
    }
    return out
  }

  private func readersHeader(count: Int) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      Text("Ảnh bạn đọc").font(.pageHeading).accessibilityAddTraits(.isHeader).accessibilityIdentifier("grid-readers-heading")
      Text("\(count) ảnh bạn đọc gửi, ngoài \(gallery.photos.count) ảnh ở trên.").font(.subheadline).foregroundStyle(.secondary)
    }
    .padding(.horizontal)
    .padding(.top, 28)
    .padding(.bottom, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  /// The viewer at photo `i`: sliding up, or with Reduce Motion there at once.
  private func show(_ readers: Bool, _ i: Int) {
    var t = Transaction()
    t.disablesAnimations = reduceMotion
    withTransaction(t) { shown = Shown(readers: readers, index: i) }
  }

  private static func ratios(_ photos: [PageDoc.Image]) -> [Double] { photos.map { Double($0.w) / Double($0.h) } }

  #if DEBUG
  /// For the UI tests (`-grid-log`, debug builds only): the photos whose thumbnail was fetched, those whose fetch was
  /// stopped, and those fetched more than once (their places, from 1).
  @ViewBuilder private var testsRead: some View {
    if ProcessInfo.processInfo.arguments.contains("-grid-log") {
      let log = PictureLog.shared
      Text(verbatim: places(log.page)).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("grid-requests")
      Text(verbatim: places(log.stopped)).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("grid-stopped")
      Text(verbatim: places(repeats(log.page))).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("grid-repeats")
    }
  }

  private func repeats(_ srcs: [String]) -> [String] {
    var seen = Set<String>()
    return srcs.filter { !seen.insert($0).inserted }
  }

  private func places(_ srcs: [String]) -> String {
    let set = Set(srcs)
    return gallery.photos.indices.filter { set.contains(gallery.photos[$0].thumb ?? gallery.photos[$0].src) }.map { "\($0 + 1)" }.joined(separator: " ")
  }
  #endif
}

/// One list's rows, edge to edge, each its own lazy stack at the height its photos give it. One lazy stack of them all
/// would place rows it hasn't drawn by a guess from those it has: after a jump to a row far down, or to the part below,
/// they'd land off by screens. Each photo a button named by its words and its place, loading its thumbnail at its size,
/// with a plain fill until it comes (and if it never does).
private struct PhotoGridRows: View {
  let rows: [PhotoRows.Row]
  let photos: [PageDoc.Image]
  let readers: Bool
  let screen: CGFloat
  let tapped: (Int) -> Void
  @State private var ahead = ThumbnailsAhead()
  @Environment(\.displayScale) private var scale

  var body: some View {
    VStack(alignment: .leading, spacing: PhotoRows.gap) {
      ForEach(rows.indices, id: \.self) { r in
        let row = rows[r]
        LazyVStack(alignment: .leading, spacing: 0) {
          HStack(spacing: PhotoRows.gap) {
            ForEach(row.photos, id: \.self) { place in
              cell(place, width: row.widths[place - row.photos.lowerBound], height: row.height)
            }
          }
          .onAppear { ahead.reached(r, rows: rows, photos: photos, screen: Double(screen), scale: Double(scale)) }
        }
        .frame(height: CGFloat(row.height), alignment: .top)
        .id(PhotoGrid.RowID(readers: readers, row: r))
      }
    }
    .onDisappear { ahead.stop() }
  }

  private func cell(_ place: Int, width: Double, height: Double) -> some View {
    let p = photos[place]
    return Button { tapped(place) } label: {
      PageImage(src: p.thumb ?? p.src, ratio: CGFloat(width / height), corner: 0, plain: true).frame(width: CGFloat(width), height: CGFloat(height))
    }
    .buttonStyle(.plain)
    .accessibilityLabel(label(p, place))
    .accessibilityIdentifier("\(readers ? "grid-reader" : "grid-photo")-\(place + 1)")
  }

  private func label(_ p: PageDoc.Image, _ place: Int) -> Text {
    let at = Text("Ảnh \(place + 1) trên \(photos.count)")
    guard let alt = p.alt, !alt.isEmpty else { return at }
    return Text(verbatim: alt + ", ") + at
  }
}

/// The thumbnails of the next two screens the way the reader is scrolling, nearest first and four at a time, so a steady
/// scroll meets them decoded. One whose row reaches the screen keeps going, and its cell waits for it (PageImages.ahead);
/// one left a screen behind stops.
@MainActor private final class ThumbnailsAhead {
  /// The row last looked ahead from.
  private var last = 0
  /// The rows shown since then: a layout pass shows several at once, and in no order to go by.
  private var pass: [Int] = []
  private var wanted: [(src: String, size: PageImages.Size)] = []
  private var loads: Set<String> = []
  /// Those started and not since left behind: one that didn't come isn't asked for again each time a row shows.
  private var tried: Set<String> = []

  func reached(_ row: Int, rows: [PhotoRows.Row], photos: [PageDoc.Image], screen: Double, scale: Double) {
    pass.append(row)
    guard pass.count == 1 else { return }
    Task { [weak self] in self?.look(rows: rows, photos: photos, screen: screen, scale: scale) }
  }

  func stop() {
    for src in loads {
      PageImages.ahead[src]?.cancel()
      PageImages.ahead[src] = nil
    }
    loads = []
    pass = []
    wanted = []
    tried = []
  }

  /// A pass that reaches above the last place is the reader going up, from its top row; otherwise down, from its last.
  private func look(rows: [PhotoRows.Row], photos: [PageDoc.Image], screen: Double, scale: Double) {
    guard let low = pass.min(), let high = pass.max() else { return }
    pass = []
    let down = low >= last
    last = down ? high : low
    func thumb(_ place: Int) -> String { photos[place].thumb ?? photos[place].src }
    wanted = PhotoRows.ahead(of: last, in: rows, down: down, span: 2 * screen).flatMap { r in
      zip(rows[r].photos, rows[r].widths).map { place, width in
        (src: thumb(place), size: PageImages.Size.filling(CGSize(width: width * scale, height: rows[r].height * scale)))
      }
    }
    // On the screen or still ahead.
    let near = [last] + PhotoRows.ahead(of: last, in: rows, down: !down, span: screen)
    let keep = Set(wanted.map(\.src)).union(near.flatMap { rows[$0].photos.map(thumb) })
    for src in loads where !keep.contains(src) {
      PageImages.ahead[src]?.cancel()
      PageImages.ahead[src] = nil
      loads.remove(src)
    }
    tried.formIntersection(keep)
    next()
  }

  private func next() {
    for (src, size) in wanted where loads.count < 4 && !loads.contains(src) && !tried.contains(src) {
      tried.insert(src)
      if PageImages.cached(src, size) != nil { continue }
      loads.insert(src)
      PageImages.ahead[src] = Task { [weak self] in
        let image = await PageImages.image(src, size)
        guard !Task.isCancelled else { return image }
        PageImages.ahead[src] = nil
        self?.loads.remove(src)
        self?.next()
        return image
      }
    }
  }
}

extension PageDoc.Image {
  /// A reader's photo, credited with their name.
  init(reader p: Readers.Photo) {
    self.init(src: p.url, w: p.width, h: p.height, alt: String(localized: "Ảnh của \(p.name)"), thumb: p.thumb,
              credit: Credit(text: p.name, licence: "", url: nil))
  }
}
