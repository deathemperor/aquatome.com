import AccountSync
import Handbook
import SwiftUI

/// Pushed on the Tìm tab for the fish-ID screen (AppScreen.fishId).
struct FishIdRoute: Hashable {}

/// "Đây là cá gì?": the site's fish-ID tool (apps/site/src/pages/vi/cong-cu/nhan-dien-ca.astro) as the app's own screen.
/// A photo from the library or the camera, with one fish boxed on it if the reader likes (only that part goes), sent as
/// their aquatome.com account (FishId, protocols/fishid.openapi.json) in place of the page's Turnstile check; the guesses
/// as the site shows them, each page opening in the app. Signed out, the sign-in first. Its words are the site's.
struct FishIdView: View {
  @Environment(AccountModel.self) private var account
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen
  @State private var tool = Tool.checking
  @State private var picked: PickedPhoto?
  @State private var camera = false
  @State private var library = false
  /// The photo as picked, full size: a box is cut from it.
  @State private var original: Data?
  /// The whole photo shrunk: what goes without a box, and its preview.
  @State private var whole: Data?
  @State private var preview: UIImage?
  /// Counts photos: a slower shrink of an earlier one isn't kept.
  @State private var round = 0
  @State private var boxing = false
  /// The box drawn (0…1 of the photo), and its part shrunk.
  @State private var box: CGRect?
  @State private var part: Data?
  @State private var sending = false
  /// VoiceOver's place: on what it's doing while it identifies (the button it was on goes), then on what it says after.
  @AccessibilityFocusState private var onWait: Bool
  @AccessibilityFocusState private var onSaid: Bool
  /// What the screen is doing, or why it can't, as the site's status line says it.
  @State private var said: String?
  @State private var found: FishId.Identification?
  @State private var onSite: URL?

  /// What GET says of the tool, or that the site couldn't be reached.
  enum Tool: Equatable { case checking, offline, off, resting, on(perAccount: Int?) }

  var body: some View {
    ScrollViewReader { proxy in
      List {
        Section {
          Text("Chụp hoặc chọn ảnh một con cá, tép, ốc hay cây thủy sinh. Công cụ đoán tên loài và mở hồ sơ của nó trong cẩm nang.")
        }
        tools
        if let found { results(found) }
        Section {
          Text("Ảnh không được lưu lại: ảnh được gửi tới Claude, mô hình AI của Anthropic, để nhận diện rồi bỏ đi.")
            .font(.footnote).foregroundStyle(.secondary)
          // In the browser, as the site's pages about itself open (PageRoute): a screen in the app would be left blank.
          Link("Chính sách bảo mật", destination: URL(string: String(localized: "https://aquatome.com/vi/chinh-sach-bao-mat/#nhan-dien-ca"))!)
            .font(.footnote)
        }
        Section("Chụp sao cho dễ nhận") {
          Text("Chụp ngang thân, thấy rõ vây và đuôi.")
          Text("Đến gần, để con vật chiếm phần lớn khung hình.")
          Text("Áp máy sát kính sạch cho bớt lóa và vết bẩn.")
          Text("Tắt đèn flash, bật đèn bể.")
          Text("Mỗi ảnh một con là dễ nhận nhất.")
          Text("Công cụ chỉ đoán từ ảnh và có thể nhầm giữa các loài giống nhau. Đọc hồ sơ để đối chiếu màu, vây và kích thước trước khi mua hay thả chung.")
            .font(.footnote).foregroundStyle(.secondary)
        }
      }
      .accessibilityIdentifier("fish-id")
      // The guesses come in below the photo: shown, and said, as the site's page reads them out (aria-live).
      .onChange(of: found) { _, f in
        guard let f else { return }
        withAnimation { proxy.scrollTo(f.line != nil ? "fish-id-line" : "fish-id-guess-0", anchor: .top) }
        let first = f.results.first.map { [String(localized: "Có thể là"), $0.page?.name ?? name($0)].joined(separator: " ") }
        if let s = f.line.map(text) ?? first { AccessibilityNotification.Announcement(s).post() }
      }
    }
    .navigationTitle("Đây là cá gì?")
    .navigationBarTitleDisplayMode(.inline)
    .navigationDestination(item: $onSite) { WebScreen(url: $0) }
    .onChange(of: said) { _, s in if let s { AccessibilityNotification.Announcement(s).post() } }
    // Asked once: back from a page the guesses opened, the screen is as it was.
    .task {
      guard tool == .checking else { return }
      #if DEBUG
      // UI tests can't drive the system's photo picker: a photo picked as the picker picks one.
      if Self.picksTestPhoto { picked = PickedPhoto(data: Self.testPhoto) }
      #endif
      await ask()
    }
    // Read when picked, not each time the screen shows again (back from a guess's page or from the camera), which would
    // take the guesses and the box away and cost another identification to get them back.
    .onChange(of: picked) { _, item in
      guard let item else { return }
      Task { await take { item.data } }
    }
    .task(id: box) { await cut() }
    .fullScreenCover(isPresented: $camera) {
      ImagePicker(source: .camera, picked: { data in
        camera = false
        guard let data else { return }
        // The library's photo, if one was picked, isn't kept.
        picked = nil
        Task { await take { data } }
      }, cancelled: { camera = false })
      .ignoresSafeArea()
    }
    .sheet(isPresented: $library) {
      ImagePicker(source: .photoLibrary, picked: { data in
        library = false
        picked = PickedPhoto(data: data)
      }, cancelled: { library = false })
      .ignoresSafeArea()
    }
  }

  // MARK: The tool

  @ViewBuilder private var tools: some View {
    switch tool {
    case .checking:
      Section { ProgressView().frame(maxWidth: .infinity) }
    case .offline:
      offline
    case .off:
      Section { Text("Công cụ nhận diện tạm thời chưa dùng được. Bạn tìm cá theo tên trong danh sách cá nhé.").accessibilityIdentifier("fish-id-said") }
    case .resting:
      Section { Text("Công cụ đang tạm nghỉ. Bạn quay lại sau vài giờ nhé.").accessibilityIdentifier("fish-id-said") }
    case .on:
      switch account.state {
      case .unknown:
        // The accounts server couldn't be reached.
        offline
      case .off:
        Section { Text("Tài khoản aquatome.com đang tạm tắt, nên ứng dụng chưa nhận diện được ảnh lúc này.").accessibilityIdentifier("fish-id-said") }
      case .signedOut:
        Section {
          Text("Đăng nhập tài khoản aquatome.com để nhận diện cá qua ảnh.").accessibilityIdentifier("fish-id-sign-in")
          SignInButton()
          AccountMessage()
        }
      case .signedIn:
        photo
      }
    }
  }

  private var offline: some View {
    Section {
      Text("Không có mạng: thử lại khi có mạng.").accessibilityIdentifier("fish-id-said")
      Button("Thử lại") { Task { await ask() } }
    }
  }

  @ViewBuilder private var photo: some View {
    Section {
      // While a photo is being identified, it stays the one shown: its guesses come in under it.
      if UIImagePickerController.isSourceTypeAvailable(.camera) {
        Button { camera = true } label: { Label("Chụp ảnh", systemImage: "camera") }
          .disabled(sending)
          .accessibilityIdentifier("fish-id-camera")
      }
      Button { library = true } label: { Label("Chọn ảnh có sẵn", systemImage: "photo.on.rectangle") }
        .disabled(sending)
        .accessibilityIdentifier("fish-id-library")
    } footer: {
      Text("Mẹo: chuyển đèn bể sang ánh trắng (tắt màu đỏ, hồng) và chụp gần một con cá. Ảnh cả bể thường chỉ nhận ra con nổi bật nhất.")
    }
    Section {
      if let preview {
        BoxedPhoto(image: preview, boxing: boxing && !sending, box: $box)
          .frame(maxWidth: .infinity)
          .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
        // While it's identified, the photo is the one sent: no box to change, and nothing greyed out that reads as broken.
        if !sending {
          if boxing {
            Button("Dùng cả ảnh") { boxing = false; box = nil }.accessibilityIdentifier("fish-id-whole")
          } else {
            Button("Khoanh một con cá") { boxing = true }.accessibilityIdentifier("fish-id-box")
          }
          if boxing {
            Text(boxSaid).font(.footnote).foregroundStyle(.secondary).accessibilityIdentifier("fish-id-box-said")
          }
        }
      }
      if sending {
        // In the button's place, what it's doing: a spinner and the words, as live as the wait is.
        HStack(spacing: 10) {
          ProgressView().accessibilityHidden(true)
          Text(said ?? "").accessibilityIdentifier("fish-id-said").accessibilityFocused($onWait)
        }
        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
      } else {
        // Here the reader's opt-in to keep the photo goes (`keep`), with the site's next change.
        Button { Task { await send() } } label: {
          // Its line under it runs from the row's edge, as the other rows' do, not from the centred word.
          Text("Nhận diện").frame(maxWidth: .infinity).fontWeight(.semibold)
            .alignmentGuide(.listRowSeparatorLeading) { $0[.leading] }
        }
        .disabled(sent == nil)
        .accessibilityIdentifier("fish-id-send")
        if let said { Text(said).accessibilityIdentifier("fish-id-said").accessibilityFocused($onSaid) }
      }
    }
  }

  /// What "Nhận diện" sends: the part boxed once it's cut, else the whole photo.
  private var sent: Data? { box == nil ? whole : part }

  private var boxSaid: String {
    if box == nil { return String(localized: "Kéo một khung quanh con cá trên ảnh.") }
    if part == nil { return String(localized: "Đang thu nhỏ ảnh…") }
    return String(localized: "Sẽ gửi phần trong khung. Kéo lại để khoanh chỗ khác.")
  }

  // MARK: The guesses

  @ViewBuilder private func results(_ f: FishId.Identification) -> some View {
    Section {
      if let line = f.line { Text(text(line)).id("fish-id-line").accessibilityIdentifier("fish-id-line") }
      if f.hasGuesses {
        ForEach(Array(f.results.enumerated()), id: \.offset) { i, g in GuessRow(guess: g, open: open).id("fish-id-guess-\(i)") }
      }
    } header: {
      if f.hasGuesses { Text("Có thể là") }
    }
  }

  private func text(_ line: FishId.Line) -> String {
    switch line {
    case .notFish: String(localized: "Ảnh này có vẻ không có cá, tép, ốc hay cây thủy sinh nào. Thử một ảnh khác nhé.")
    case .unclear: String(localized: "Chưa nhìn rõ để nhận diện. Thử chụp ngang thân, gần hơn, qua kính sạch và không bật flash.")
    case .onlyAGuess: String(localized: "Ảnh chưa rõ lắm, đây chỉ là phỏng đoán. Ảnh rõ hơn sẽ cho kết quả chắc hơn.")
    }
  }

  /// A page a guess names: the app's own screen for it, else its web page in the app.
  private func open(_ l: FishId.Linked) {
    guard let path = l.path, let u = URL(string: path, relativeTo: handbook.site)?.absoluteURL else { return }
    if let screen = AppScreen.of(u, site: handbook.site, lang: handbook.lang, listed: { handbook.item(at: $0) != nil }) { openScreen(screen) } else { onSite = u }
  }

  // MARK: Doing it

  /// The tool's state, then (not known yet) who is signed in.
  private func ask() async {
    tool = .checking
    let r = await account.fetch(FishId.status(site: handbook.site, version: Self.version, ownCopy: Self.ownCopy))
    // As the site's page: a state it can't read is the tool off.
    tool = r.map { r in FishId.status(r.0, status: r.1).map { $0.on ? ($0.resting ? .resting : .on(perAccount: $0.perAccount)) : .off } ?? .off } ?? .offline
    if account.state == .unknown { await account.refresh() }
  }

  /// A new photo, once `read` gives it: shrunk whole for its preview and for sending; any box, guesses and message
  /// before it go.
  private func take(_ read: () async -> Data?) async {
    round += 1
    let mine = round
    (original, whole, preview, part, box, boxing, found) = (nil, nil, nil, nil, nil, false, nil)
    said = String(localized: "Đang thu nhỏ ảnh…")
    let data = await read()
    guard mine == round else { return }
    guard let data else { return said = String(localized: "Không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.") }
    // Off the main thread: a phone's photo is tens of megapixels.
    let small = await Task.detached(priority: .userInitiated) { FishId.photo(data) }.value
    guard mine == round else { return }
    original = small == nil ? nil : data
    whole = small
    preview = small.flatMap(UIImage.init(data:))
    said = small == nil ? String(localized: "Không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.") : nil
  }

  /// The box's part, cut from the full-size photo and shrunk as the whole one is.
  private func cut() async {
    part = nil
    guard let box, let original else { return }
    let piece = await Task.detached(priority: .userInitiated) { FishId.photo(original, box: box) }.value
    guard !Task.isCancelled else { return }
    part = piece
    if piece == nil { said = String(localized: "Không đọc được ảnh này. Hãy thử một ảnh JPEG hoặc PNG khác.") }
  }

  private func send() async {
    guard let jpeg = sent, !sending else { return }
    sending = true
    onWait = true
    found = nil
    said = String(localized: "Đang nhận diện… thường mất vài giây.")
    // Done, it says so where VoiceOver is: a problem's words, or the guesses (read out as they come, onChange(of: found)).
    defer { onSaid = said != nil }
    // Claude may take up to 25 s on the Worker, and the app waits 65: past the first seconds, the screen says so.
    let longer = Task {
      try await TestGate.wait("fish-id-longer", or: .seconds(10))
      guard !Task.isCancelled else { return }
      said = String(localized: "Vẫn đang nhận diện… có thể mất đến một phút.")
    }
    let lang = handbook.lang, site = handbook.site
    var answer: (Data, Int)?, timedOut = false
    do {
      answer = try await account.send { token in
        FishId.identify(jpeg: jpeg, lang: lang, site: site, token: token, version: Self.version, ownCopy: Self.ownCopy)
      }
    } catch {
      timedOut = (error as? URLError)?.code == .timedOut
    }
    longer.cancel()
    sending = false
    // No answer in the request's time: most likely the Worker's run, not the network, so the site's words for a run that
    // failed.
    if timedOut { return said = String(localized: "Chưa nhận diện được lúc này. Thử lại sau ít phút nhé.") }
    guard let answer else { return said = String(localized: "Không có mạng: thử lại khi có mạng.") }
    switch FishId.answer(answer.0, status: answer.1) {
    case .identified(let f):
      said = nil
      found = f
    case .signedOut:
      // The account looked itself up again. Its session over, the sign-in takes the tool's place, saying so, and the
      // photo waits; still signed in (or not reached), the screen says it didn't work.
      if case .signedIn = account.state {
        said = String(localized: "Chưa nhận diện được lúc này. Thử lại sau ít phút nhé.")
      } else {
        said = nil
      }
    case let .refused(code, limit):
      said = problem(code, limit)
    }
  }

  /// The site's words for each refusal (apps/site/src/scripts/fish-id-client.ts); anything else, "try later".
  private func problem(_ code: String, _ limit: Int?) -> String {
    switch code {
    case "rate":
      // The Worker gives the limit; GET's, then its default, if not.
      let n = limit ?? { if case .on(let n) = tool { n } else { nil } }() ?? 10
      return String(localized: "Bạn đã dùng hết \(n) lượt nhận diện hôm nay. Quay lại ngày mai nhé.")
    case "busy": return String(localized: "Hôm nay công cụ đã hết lượt cho mọi người. Quay lại ngày mai nhé.")
    case "resting": return String(localized: "Công cụ đang tạm nghỉ. Bạn quay lại sau vài giờ nhé.")
    case "fish_id_off": return String(localized: "Công cụ nhận diện tạm thời chưa dùng được. Bạn tìm cá theo tên trong danh sách cá nhé.")
    case "not an image": return String(localized: "Chỉ nhận ảnh JPEG, PNG hoặc WebP.")
    case "too large": return String(localized: "Ảnh quá lớn. Chọn ảnh khác nhé.")
    default: return String(localized: "Chưa nhận diện được lúc này. Thử lại sau ít phút nhé.")
    }
  }

  private static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0" }
  /// Our own copies say so: their guesses add no wanted names (OwnCopy).
  private static var ownCopy: String? { OwnCopy.isOurs ? AccountsClient.ourCopy : nil }

  #if DEBUG
  /// `-picked-photo`: `testPhoto` picked as the screen opens.
  static let picksTestPhoto = ProcessInfo.processInfo.arguments.contains("-picked-photo")

  /// A 1600 × 1200 photo of a fish, to box and send.
  static var testPhoto: Data? {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    return UIGraphicsImageRenderer(size: CGSize(width: 1600, height: 1200), format: format).jpegData(withCompressionQuality: 0.9) { c in
      UIColor(red: 0.1, green: 0.35, blue: 0.5, alpha: 1).setFill()
      c.fill(CGRect(x: 0, y: 0, width: 1600, height: 1200))
      UIColor.systemOrange.setFill()
      c.cgContext.fillEllipse(in: CGRect(x: 500, y: 450, width: 600, height: 300))
    }
  }
  #endif
}

/// A guess's name: Claude's common name, else its scientific one.
private func name(_ g: FishId.Guess) -> String { g.commonName.isEmpty ? g.scientificName : g.commonName }

/// The photo picked, and while boxing, a box dragged on it (a finger's drag; a tap or a box too small to hold a fish
/// keeps the one before), the rest dimmed, as the site's page draws it.
private struct BoxedPhoto: View {
  let image: UIImage
  let boxing: Bool
  @Binding var box: CGRect?
  @State private var dragging: CGRect?

  var body: some View {
    Image(uiImage: image)
      .resizable()
      .scaledToFit()
      .overlay {
        GeometryReader { g in
          let shown = (dragging ?? box).map { CGRect(x: $0.minX * g.size.width, y: $0.minY * g.size.height, width: $0.width * g.size.width, height: $0.height * g.size.height) }
          ZStack {
            if let shown {
              Path { p in p.addRect(CGRect(origin: .zero, size: g.size)); p.addRect(shown) }
                .fill(.black.opacity(0.5), style: FillStyle(eoFill: true))
              Rectangle().path(in: shown).stroke(.white, style: StrokeStyle(lineWidth: 2, dash: [6, 4]))
            }
            Color.clear.contentShape(.rect)
              .gesture(drag(g.size), including: boxing ? .all : .subviews)
          }
        }
      }
      .frame(maxHeight: 300)
      .accessibilityElement()
      .accessibilityLabel(Text("Ảnh bạn chọn"))
      .accessibilityHint(boxing ? Text("Kéo một khung quanh con cá trên ảnh.") : Text(verbatim: ""))
      .accessibilityIdentifier("fish-id-photo")
  }

  private func drag(_ size: CGSize) -> some Gesture {
    DragGesture(minimumDistance: 0)
      .onChanged { v in dragging = rect(v.startLocation, v.location, size) }
      .onEnded { v in
        dragging = nil
        let r = rect(v.startLocation, v.location, size)
        // A tap, or too small to hold a fish: the box before it stays.
        if r.width * size.width >= 16 && r.height * size.height >= 16 { box = r }
      }
  }

  /// The box between two points, 0…1 of the photo.
  private func rect(_ a: CGPoint, _ b: CGPoint, _ size: CGSize) -> CGRect {
    let x0 = min(max(min(a.x, b.x) / size.width, 0), 1), x1 = min(max(max(a.x, b.x) / size.width, 0), 1)
    let y0 = min(max(min(a.y, b.y) / size.height, 0), 1), y1 = min(max(max(a.y, b.y) / size.height, 0), 1)
    return CGRect(x: x0, y: y0, width: x1 - x0, height: y1 - y0)
  }
}

/// One guess as the site's page shows it: its page's photo, how sure, the name (the page's, else Claude's), the
/// scientific name and variety, why; then the page ("Xem hồ sơ →", a breed's species beside it) or that the handbook
/// has none, and the genus's other pages, closed until opened.
private struct GuessRow: View {
  let guess: FishId.Guess
  let open: (FishId.Linked) -> Void
  @State private var picture: UIImage?
  @Environment(\.displayScale) private var scale

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      if let img = guess.page?.img {
        Group {
          if let picture { Image(uiImage: picture).resizable().scaledToFill() } else { Color.secondary.opacity(0.15) }
        }
        .frame(width: 90, height: 68)
        .clipShape(.rect(cornerRadius: 6))
        .accessibilityHidden(true)
        // Decoded for its 90 × 68 frame, as the page's own thumbnails are (PageImages).
        .task(id: img) {
          picture = await PageImages.image(img.absoluteString, .filling(CGSize(width: 90 * scale, height: 68 * scale)))
        }
      }
      VStack(alignment: .leading, spacing: 6) {
        VStack(alignment: .leading, spacing: 2) {
          Text(sure).font(.footnote.weight(.semibold)).foregroundStyle(.tint)
          Text(guess.page?.name ?? name(guess)).font(.headline)
          (Text(guess.scientificName).italic() + Text(verbatim: guess.variety.map { " · \($0)" } ?? ""))
            .font(.subheadline).foregroundStyle(.secondary)
          if !guess.reason.isEmpty { Text(guess.reason).font(.subheadline) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("fish-id-guess")
        if let page = guess.page {
          if let species = guess.species {
            if species.path != nil {
              Button("Một dòng của \(species.name)") { open(species) }.buttonStyle(.borderless)
            } else {
              Text("Một dòng của \(species.name)").font(.subheadline)
            }
          }
          if page.path != nil {
            Button { open(page) } label: {
              HStack(spacing: 4) { Text("Xem hồ sơ"); Image(systemName: "arrow.right").accessibilityHidden(true) }.fontWeight(.semibold)
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(Text("Xem hồ sơ \(page.name)"))
            .accessibilityIdentifier("fish-id-open")
          }
        } else {
          Text("Chưa có trong cẩm nang.").font(.subheadline).foregroundStyle(.secondary)
        }
        if !guess.sameGenus.isEmpty { genus }
      }
    }
    .padding(.vertical, 4)
  }

  private var sure: String {
    switch FishId.Sure(guess.confidence) {
    case .almostCertain: String(localized: "Gần như chắc chắn")
    case .quiteLike: String(localized: "Khá giống")
    case .maybe: String(localized: "Có thể")
    case .unlikely: String(localized: "Ít khả năng")
    }
  }

  /// "Không phải? N loài <Genus> khác…" under a page, "N loài <Genus> có…" under a guess with none.
  private var genus: some View {
    DisclosureGroup {
      ForEach(guess.sameGenus, id: \.self) { l in
        let label = HStack(spacing: 6) {
          Text(l.name)
          if let sci = l.sci { Text(sci).italic().font(.footnote).foregroundStyle(.secondary) }
        }
        if l.path != nil {
          Button { open(l) } label: { label }.buttonStyle(.borderless).accessibilityIdentifier("fish-id-genus-page")
        } else {
          label.accessibilityElement(children: .combine)
        }
      }
    } label: {
      let n = guess.sameGenus.count, g = Text(guess.genus).italic()
      (guess.page != nil ? Text("Không phải? \(n) loài \(g) khác trong cẩm nang") : Text("\(n) loài \(g) có trong cẩm nang"))
        .font(.subheadline.weight(.semibold))
    }
  }
}
