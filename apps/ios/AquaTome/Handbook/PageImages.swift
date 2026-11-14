import Handbook
import ImageIO
import SwiftUI
import UIKit

/// A picture of a page the app draws, the size the page gives it before it's here. Decoded off the main thread at the
/// size it's shown, not the file's; one already in memory (scrolled back to) shows in the first frame, not after a grey
/// one. Each picture is kept with its address: a place in a row given another photo (a reader's, after one before it is
/// blocked) never shows the one before under the new one's words, even when the new one doesn't come.
struct PageImage: View {
  let src: String
  let ratio: CGFloat
  var alt: String?
  var corner: CGFloat = 10
  /// One that doesn't come stays a plain fill, with no photo symbol: a cell among hundreds in the grid.
  var plain = false
  /// A smaller copy of this picture, in memory already, to show until this one has come.
  var until: String?
  @State private var picture: (src: String, image: UIImage)?
  /// The address of the one that didn't come (offline before it was kept, or gone from the site).
  @State private var missing: String?
  /// Its size on the screen, in pixels.
  @State private var pixels = CGSize.zero
  @Environment(\.displayScale) private var scale
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  init(src: String, ratio: CGFloat, alt: String? = nil, corner: CGFloat = 10, plain: Bool = false, until: String? = nil) {
    self.src = src
    self.ratio = ratio
    self.alt = alt
    self.corner = corner
    self.plain = plain
    self.until = until
  }

  /// This address's picture: the one decoded for it here, else one in memory at any size.
  private var image: UIImage? { picture?.src == src ? picture?.image : PageImages.cached(src) ?? until.flatMap(PageImages.cached) }

  var body: some View {
    // The size, fixed with the task's id. The first layout's task (size zero) runs after the size has come; reading the
    // state live, it fetched, then the size's own task fetched again and the first was stopped: each grid cell twice.
    let px = pixels
    Rectangle().fill(.fill.tertiary)
      .aspectRatio(ratio, contentMode: .fit)
      .overlay {
        if let image {
          Image(uiImage: image).resizable().scaledToFill().transition(.opacity)
        } else if missing == src, !plain {
          // A photo's place, not an empty box.
          Image(systemName: "photo").font(.title2).foregroundStyle(.tertiary)
        }
      }
      .clipShape(.rect(cornerRadius: corner))
      // A picture bigger than its place is clipped to it, but its frame would still reach over its neighbour's, for VoiceOver and XCUITest.
      .contentShape(.rect)
      .onGeometryChange(for: CGSize.self) { $0.size } action: { pixels = CGSize(width: $0.width * scale, height: $0.height * scale) }
      .accessibilityElement()
      .accessibilityLabel(Text(verbatim: alt ?? ""))
      // No words for it: VoiceOver reads the caption under it instead (a linked one, its button, as the caption).
      .accessibilityHidden(alt == nil)
      .task(id: [src, "\(px)"]) {
        guard px.width > 0 else { return }
        let size = PageImages.Size.filling(px), src = src
        if let hit = PageImages.cached(src, size) { picture = (src, hit); return }
        let had = image != nil
        // On its way already, ahead of the reader (the photo grid): not fetched a second time.
        var loaded = await PageImages.ahead[src]?.value
        if loaded == nil { loaded = await PageImages.image(src, size) }
        guard !Task.isCancelled else { return }
        // Faded in as it comes; one in memory at a smaller size, swapped.
        if let loaded {
          withAnimation(reduceMotion || had ? nil : .easeOut(duration: 0.2)) { picture = (src, loaded) }
        } else if !had {
          missing = src
        }
      }
  }
}

/// The pictures of pages the app draws: their files kept on the phone (up to 200 MB, in the caches folder) so a page read
/// once shows them offline, and the last ones decoded kept in memory while there's room, so one scrolled or swiped back
/// to shows at once. Not bundled.
enum PageImages {
  /// What a picture is fetched for: a page's own (a row's thumbnail too), or the photo viewer's thumbnail or full photo.
  enum Role: Sendable { case page, thumb, full }

  /// How large a picture is decoded, in pixels: enough to fill a frame it's cut to, or no longer than a side (the
  /// viewer's, which fits it to the screen and zooms).
  enum Size: Sendable {
    case filling(CGSize)
    case longest(CGFloat)

    /// The longest side to decode a picture of `source` pixels at: never more than its own.
    func target(_ source: CGSize) -> CGFloat {
      let own = max(source.width, source.height)
      switch self {
      case let .filling(box): return own * min(max(box.width / source.width, box.height / source.height), 1)
      case let .longest(side): return min(own, side)
      }
    }
  }

  static let session: URLSession = {
    let c = URLSessionConfiguration.default
    let dir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appending(path: "page-images")
    c.urlCache = URLCache(memoryCapacity: 16 << 20, diskCapacity: 200 << 20, directory: dir)
    c.requestCachePolicy = .returnCacheDataElseLoad
    return URLSession(configuration: c)
  }()

  /// The pictures of pages kept for offline: in Application Support, which the system doesn't empty when the phone is
  /// short of room (the caches folder it does), and not in the phone's backup (they're the site's, read again).
  static let kept: KeptPictures = {
    var dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "kept-pictures")
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try? dir.setResourceValues(values)
    return KeptPictures(dir: dir)
  }()

  /// Decoded pictures by address, the largest of each: 40 MB, about nine of the viewer's full photos (a 1200 × 900 one
  /// is 4.3 MB decoded), emptied first when the phone runs short.
  private nonisolated(unsafe) static let memory: NSCache<NSString, Decoded> = {
    let c = NSCache<NSString, Decoded>()
    c.totalCostLimit = 40 << 20
    return c
  }()

  /// Thumbnails being fetched ahead of the reader (the photo grid), for a cell that reaches the screen first.
  @MainActor static var ahead: [String: Task<UIImage?, Never>] = [:]

  /// In memory at any size: shown at once while the right size comes.
  static func cached(_ src: String) -> UIImage? { memory.object(forKey: src as NSString)?.image }

  /// In memory, and large enough for `size`.
  static func cached(_ src: String, _ size: Size) -> UIImage? {
    guard let d = memory.object(forKey: src as NSString), d.longest >= size.target(d.source) - 1 else { return nil }
    return d.image
  }

  /// The picture at `src`, decoded for `size` off the main thread: from memory, the phone or the site; nil when none came.
  static func image(_ src: String, _ size: Size, role: Role = .page) async -> UIImage? {
    if let hit = cached(src, size) { return hit }
    guard let data = await data(src, role), !Task.isCancelled,
      let d = await Task.detached(priority: .userInitiated, operation: { Decoded(data, size) }).value else { return nil }
    if (memory.object(forKey: src as NSString)?.longest ?? 0) < d.longest { memory.setObject(d, forKey: src as NSString, cost: d.cost) }
    return d.image
  }

  /// The picture's file: kept for offline, else the site's (through the caches folder).
  private static func data(_ src: String, _ role: Role) async -> Data? {
    #if DEBUG
    await PictureLog.shared.asked(src, role)
    let args = ProcessInfo.processInfo.arguments
    // `-slow-pictures`: a full photo takes 20 s to come, so a test sees what the viewer shows while it's on its way.
    // `-slow-thumbs`: so too a page's picture (a cell's in the grid), so a test sees its fetch stopped.
    if (role == .full && args.contains("-slow-pictures")) || (role == .page && args.contains("-slow-thumbs")) {
      try? await Task.sleep(for: .seconds(20))
      if Task.isCancelled {
        await PictureLog.shared.stopped(src)
        return nil
      }
    }
    // `-fail-pictures <part>`: those whose address has it don't come, so a test sees a place with none.
    if let i = args.firstIndex(of: "-fail-pictures"), args.indices.contains(i + 1), src.contains(args[i + 1]) { return nil }
    // UI tests read no network; their screenshots (`-fixed-pictures`) show a stand-in where each photo goes.
    if args.contains("-fixed-pictures") { return fixedPicture(src, role) }
    if args.contains("-fixed-handbook") { return nil }
    #endif
    if let data = kept.data(src) { return data }
    guard let u = URL(string: src), let (data, _) = try? await session.data(from: u) else { return nil }
    return data
  }

  /// Kept on the phone now, for a page kept for offline: true when it's there.
  static func keep(_ src: String) async -> Bool {
    #if DEBUG
    if ProcessInfo.processInfo.arguments.contains("-fixed-handbook") {
      // `-slow-keep`: each picture takes 20 s to come, so a test can act while a keep is on its way.
      if ProcessInfo.processInfo.arguments.contains("-slow-keep") { try? await Task.sleep(for: .seconds(20)) }
      return true
    }
    #endif
    if kept.data(src) != nil { return true }
    guard let u = URL(string: src), let (data, r) = try? await session.data(from: u), (r as? HTTPURLResponse)?.statusCode == 200 else { return false }
    return kept.save(data, for: src)
  }

  #if DEBUG
  /// A photo's stand-in in screenshots: water colours with a few soft lights, picked by its address, the same each run. A
  /// JPEG, decoded as the site's photos are: a full photo as wide as the site's (1200 px), others half that.
  static func fixedPicture(_ src: String, _ role: Role) -> Data {
    let seed = src.unicodeScalars.reduce(UInt32(2166136261)) { ($0 ^ $1.value) &* 16777619 }
    let hue = 0.45 + CGFloat(seed % 100) / 500
    let format = UIGraphicsImageRendererFormat()
    format.scale = role == .full ? 2 : 1
    // `-wide-pictures`: a fish as long as the kuhli's photo (8:3), its ends red and blue, so a test sees whether a frame
    // shows them both.
    if ProcessInfo.processInfo.arguments.contains("-wide-pictures") {
      return UIGraphicsImageRenderer(size: CGSize(width: 800, height: 300), format: format).jpegData(withCompressionQuality: 0.9) { c in
        UIColor(red: 0.2, green: 0.55, blue: 0.3, alpha: 1).setFill()
        c.fill(CGRect(x: 0, y: 0, width: 800, height: 300))
        UIColor(red: 0.92, green: 0.1, blue: 0.1, alpha: 1).setFill()
        c.fill(CGRect(x: 0, y: 0, width: 120, height: 300))
        UIColor(red: 0.1, green: 0.2, blue: 0.95, alpha: 1).setFill()
        c.fill(CGRect(x: 680, y: 0, width: 120, height: 300))
      }
    }
    return UIGraphicsImageRenderer(size: CGSize(width: 600, height: 400), format: format).jpegData(withCompressionQuality: 0.9) { c in
      // The brightest photo there is: what stands on one has to read on it.
      if ProcessInfo.processInfo.arguments.contains("-white-pictures") {
        UIColor.white.setFill()
        c.fill(CGRect(x: 0, y: 0, width: 600, height: 400))
        return
      }
      let colors = [UIColor(hue: hue, saturation: 0.7, brightness: 0.6, alpha: 1), UIColor(hue: hue + 0.05, saturation: 0.8, brightness: 0.2, alpha: 1)]
      let gradient = CGGradient(colorsSpace: nil, colors: colors.map(\.cgColor) as CFArray, locations: nil)!
      c.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: 400), options: [])
      UIColor(white: 1, alpha: 0.12).setFill()
      for i in 0..<6 {
        let x = CGFloat(seed >> (i * 5) % 600), y = CGFloat(seed >> (i * 3) % 400), r = CGFloat(20 + seed >> i % 50)
        c.cgContext.fillEllipse(in: CGRect(x: x - r, y: y - r, width: 2 * r, height: 2 * r))
      }
    }
  }
  #endif

  /// Off the phone: a page no longer kept for offline.
  static func forget(_ src: String) {
    kept.remove(src)
    if let u = URL(string: src) { session.configuration.urlCache?.removeCachedResponse(for: URLRequest(url: u)) }
  }
}

/// A picture decoded, with its file's own size.
private final class Decoded: Sendable {
  let image: UIImage
  /// The file's picture, in pixels, upright.
  let source: CGSize

  /// `data` decoded now (not when first drawn, on the main thread), at the size `size` needs.
  init?(_ data: Data, _ size: PageImages.Size) {
    guard let file = CGImageSourceCreateWithData(data as CFData, nil),
      let p = CGImageSourceCopyPropertiesAtIndex(file, 0, nil) as? [CFString: Any],
      let w = p[kCGImagePropertyPixelWidth] as? CGFloat, let h = p[kCGImagePropertyPixelHeight] as? CGFloat, w > 0, h > 0 else { return nil }
    // EXIF orientations 5 to 8 turn it a quarter.
    source = (p[kCGImagePropertyOrientation] as? Int ?? 1) >= 5 ? CGSize(width: h, height: w) : CGSize(width: w, height: h)
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true, kCGImageSourceThumbnailMaxPixelSize: max(1, size.target(source).rounded(.up)),
    ]
    guard let cg = CGImageSourceCreateThumbnailAtIndex(file, 0, options as CFDictionary) else { return nil }
    image = UIImage(cgImage: cg)
  }

  /// Its longest side, in pixels.
  var longest: CGFloat { max(image.size.width, image.size.height) * image.scale }
  /// Its bytes in memory.
  var cost: Int { image.cgImage.map { $0.bytesPerRow * $0.height } ?? 0 }
}

#if DEBUG
/// Debug builds: the full photos fetched this run, once for each time asked, and those whose fetch was stopped on the way
/// (`-slow-pictures`), so a UI test can read what the photo viewer fetched and let go of (the viewer shows it, as the
/// lights screen shows its frames).
@MainActor @Observable final class PictureLog {
  static let shared = PictureLog()
  private(set) var full: [String] = []
  private(set) var page: [String] = []
  private(set) var stopped: [String] = []

  func asked(_ src: String, _ role: PageImages.Role) {
    if role == .full { full.append(src) }
    if role == .page { page.append(src) }
  }

  func stopped(_ src: String) { stopped.append(src) }
}
#endif
