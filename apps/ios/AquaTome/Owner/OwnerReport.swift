import AccountSync
import Handbook
import SwiftUI
import UIKit

/// The owner's report from the app: a button that stays on every screen, and an offer after a normal iPhone screenshot.
/// Each opens a sheet with what was on the screen and where they were; the words come by the keyboard's dictation key, and
/// a send goes to the site (`OwnerClient.report`), which holds it for the Mac. Only the account the dashboard answers as
/// the owner's sees any of it, and the site checks that itself.
///
/// The button and the sheet are windows of their own over the app, so they show over any screen or sheet, stay out of
/// the picture, and ask nothing of the screens under them. The button's window is its own size: the rest of the screen,
/// the status bar's looks included, stays the app's.
extension View {
  /// A scroll view's end clear of the report button, which floats over every screen of the owner's (the Design Lead,
  /// 8 Nov): its last row ends above the button, and with `.trailing`, a wide table's last column scrolls out from under it.
  func clearOfOwnerReport(_ edges: Edge.Set = .bottom) -> some View {
    contentMargins(.bottom, edges.contains(.bottom) ? OwnerReportOverlay.aboveBottom + OwnerReportOverlay.size.height + 8 : 0, for: .scrollContent)
      .contentMargins(.trailing, edges.contains(.trailing) ? OwnerReportOverlay.size.width + 16 : 0, for: .scrollContent)
  }

  /// `place`: what's showing now, as the app's start knows it.
  func ownerReports(place: @escaping @MainActor () -> OwnerReportPlace) -> some View {
    modifier(OwnerReports(place: place))
  }
}

private struct OwnerReports: ViewModifier {
  private let place: @MainActor () -> OwnerReportPlace
  @Environment(AccountModel.self) private var account
  @Environment(\.scenePhase) private var phase
  @State private var overlay = OwnerReportOverlay()

  init(place: @escaping @MainActor () -> OwnerReportPlace) { self.place = place }

  func body(content: Content) -> some View {
    content
      .onChange(of: account.owner.isOwner == true && account.user != nil, initial: true) { _, isOwner in
        overlay.show(isOwner ? account.owner : nil, place: place)
      }
      // The screen turned, or the app's share of it changed.
      .onGeometryChange(for: CGSize.self) { $0.size } action: { _ in overlay.fit() }
      // iOS's own preview of a screenshot can cover the app: the offer's seconds wait for it.
      .onChange(of: phase) { overlay.offerTime(running: phase == .active) }
  }
}

/// The picture of what's on the screen, without this feature's own windows. A web page draws too, and a sheet over the app
/// is in the window it was opened from.
@MainActor
private enum OwnerShot {
  /// With iOS's own preview of a screenshot over the app, its scene is still there, only not active.
  static var appWindow: UIWindow? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first { $0.activationState == .foregroundInactive }
    return scene?.windows.first { !($0 is OwnerReportWindow) && !$0.isHidden && $0.windowLevel == .normal }
  }

  static func jpeg() -> Data? {
    guard let window = appWindow, window.bounds.width > 0 else { return nil }
    let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in
      window.drawHierarchy(in: window.bounds, afterScreenUpdates: false)
    }
    return image.jpegData(compressionQuality: 0.8)
  }
}

/// A window of this feature's: the one thing `OwnerShot` leaves out.
private final class OwnerReportWindow: UIWindow {}

@MainActor
@Observable
private final class OwnerReportOverlay {
  /// A screenshot was just taken: the button offers it in words, for a few seconds.
  fileprivate var offering = false
  private var owner: OwnerAccess?
  private var here: (@MainActor () -> OwnerReportPlace)?
  private var buttonWindow: OwnerReportWindow?
  private var sheetWindow: OwnerReportWindow?
  /// What the screenshot showed and where, kept for the seconds it's on offer.
  private var offered: (jpeg: Data?, place: OwnerReportPlace)?
  private var offerEnds: Task<Void, Never>?
  private var watching: NSObjectProtocol?

  fileprivate static let size = CGSize(width: 48, height: 48)
  private static let offerSize = CGSize(width: 190, height: 48)
  /// Above the tab bar and a pinned bar over it (the Lights' write bar), against the screen's edge.
  fileprivate static let aboveBottom: CGFloat = 180

  func show(_ owner: OwnerAccess?, place: @escaping @MainActor () -> OwnerReportPlace) {
    self.owner = owner
    here = place
    guard let owner else {
      buttonWindow?.isHidden = true
      buttonWindow = nil
      // A sheet stays: a session ending under a send is what it's there to say, with their words still in it, and nothing
      // else in the app can be reached under it. The site refuses what it sends now.
      if let watching { NotificationCenter.default.removeObserver(watching) }
      watching = nil
      return
    }
    guard buttonWindow == nil, let scene = OwnerShot.appWindow?.windowScene ?? activeScene else {
      if buttonWindow == nil { retry(owner, place: place) }
      return
    }
    let window = OwnerReportWindow(windowScene: scene)
    window.windowLevel = .normal + 1
    window.backgroundColor = .clear
    let host = UIHostingController(rootView: OwnerReportButton(overlay: self))
    host.view.backgroundColor = .clear
    window.rootViewController = host
    window.isHidden = false
    buttonWindow = window
    position(window, offering: false)
    watching = NotificationCenter.default.addObserver(forName: UIApplication.userDidTakeScreenshotNotification, object: nil, queue: .main) { [weak self] _ in
      MainActor.assumeIsolated { self?.screenshotTaken() }
    }
    #if DEBUG
    // UI tests can't take a real screenshot: `-owner-screenshot-after <seconds>` posts what iOS does.
    let args = ProcessInfo.processInfo.arguments
    if let i = args.firstIndex(of: "-owner-screenshot-after"), i + 1 < args.count, let s = Double(args[i + 1]) {
      Task { try? await Task.sleep(for: .seconds(s)); NotificationCenter.default.post(name: UIApplication.userDidTakeScreenshotNotification, object: nil) }
    }
    #endif
  }

  private var activeScene: UIWindowScene? {
    UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
  }

  /// The owner is known before the app's first window is up, at some launches.
  private func retry(_ owner: OwnerAccess, place: @escaping @MainActor () -> OwnerReportPlace) {
    Task {
      try? await Task.sleep(for: .seconds(1))
      if self.owner === owner { show(owner, place: place) }
    }
  }

  fileprivate func fit() {
    if let buttonWindow { position(buttonWindow, offering: offering) }
  }

  private func position(_ window: UIWindow, offering: Bool) {
    guard let screen = window.windowScene?.coordinateSpace.bounds else { return }
    let size = offering ? Self.offerSize : Self.size
    window.frame = CGRect(x: screen.width - size.width - 8, y: screen.height - Self.aboveBottom - size.height, width: size.width, height: size.height)
  }

  private func screenshotTaken() {
    guard sheetWindow == nil, let buttonWindow else { return }
    offered = (OwnerShot.jpeg(), here?() ?? OwnerReportPlace())
    position(buttonWindow, offering: true)
    offering = true
    offerTime(running: UIApplication.shared.applicationState == .active)
  }

  /// The offer's seconds run only while the app can be seen, and start again when it can.
  fileprivate func offerTime(running: Bool) {
    guard offering else { return }
    offerEnds?.cancel()
    guard running else { return }
    offerEnds = Task { [weak self] in
      try? await Task.sleep(for: .seconds(8))
      guard !Task.isCancelled else { return }
      self?.endOffer()
    }
  }

  private func endOffer() {
    offerEnds?.cancel()
    offered = nil
    offering = false
    if let buttonWindow { position(buttonWindow, offering: false) }
  }

  /// A tap on the button: the picture taken now, or the screenshot's while it's on offer.
  fileprivate func tapped() {
    guard let owner, let scene = buttonWindow?.windowScene, sheetWindow == nil else { return }
    let shot = offered ?? (OwnerShot.jpeg(), here?() ?? OwnerReportPlace())
    // Couldn't draw it then: the screen is what it was, or close to it.
    let jpeg = shot.jpeg ?? OwnerShot.jpeg()
    endOffer()
    buttonWindow?.isHidden = true
    let window = OwnerReportWindow(windowScene: scene)
    window.windowLevel = .normal + 2
    window.backgroundColor = .clear
    // Light or dark as the app is set, which a new window doesn't take by itself.
    window.overrideUserInterfaceStyle = OwnerShot.appWindow?.overrideUserInterfaceStyle ?? .unspecified
    let root = UIViewController()
    root.view.backgroundColor = .clear
    window.rootViewController = root
    window.makeKeyAndVisible()
    sheetWindow = window
    let sheet = UIHostingController(rootView: OwnerReportSheet(owner: owner, place: shot.place, jpeg: jpeg) { [weak self] in self?.closeSheet() })
    sheet.isModalInPresentation = true
    root.present(sheet, animated: true)
  }

  private func closeSheet() {
    let window = sheetWindow
    window?.rootViewController?.dismiss(animated: true) { [weak self] in
      window?.isHidden = true
      self?.sheetWindow = nil
      self?.buttonWindow?.isHidden = false
      OwnerShot.appWindow?.makeKey()
    }
  }
}

private struct OwnerReportButton: View {
  let overlay: OwnerReportOverlay

  var body: some View {
    Button { overlay.tapped() } label: {
      HStack(spacing: 6) {
        Image(systemName: "exclamationmark.bubble.fill").font(.system(size: 18))
        if overlay.offering { Text(verbatim: "Báo lỗi màn hình này").font(.footnote.weight(.semibold)).lineLimit(1) }
      }
      .foregroundStyle(.white)
      .padding(.horizontal, overlay.offering ? 12 : 0)
      .frame(minWidth: 44, minHeight: 44)
      .background(Color(red: 0.18, green: 0.42, blue: 0.31).opacity(overlay.offering ? 1 : 0.75), in: .capsule)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .trailing)
    .accessibilityLabel(Text(verbatim: "Báo lỗi màn hình này"))
    .accessibilityValue(Text(verbatim: overlay.offering ? "ảnh vừa chụp" : ""))
    .accessibilityIdentifier("owner-report")
  }
}

private struct OwnerReportSheet: View {
  private let owner: OwnerAccess
  private let place: OwnerReportPlace
  private let close: () -> Void
  @State private var jpeg: Data?
  @State private var words = ""
  /// The phone's photo library is open (ImagePicker: not PhotosUI, which every reader's launch would pay for).
  @State private var library = false
  /// The picture is one they picked, not this screen drawn.
  @State private var theirs = false
  @State private var sending = false
  @State private var problem: String?
  @State private var sent: String?
  @FocusState private var typing: Bool

  init(owner: OwnerAccess, place: OwnerReportPlace, jpeg: Data?, close: @escaping () -> Void) {
    self.owner = owner
    self.place = place
    self.close = close
    _jpeg = State(initialValue: jpeg)
  }

  private var canSend: Bool { !sending && sent == nil && (jpeg != nil || !words.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) }

  var body: some View {
    NavigationStack {
      Form {
        Section {
          TextField(text: $words, prompt: Text(verbatim: "Nói hoặc gõ: chỗ nào sai?"), axis: .vertical) { Text(verbatim: "Chỗ nào sai") }
            .lineLimit(3...8)
            .focused($typing)
            .accessibilityIdentifier("owner-report-words")
        }
        Section {
          HStack(spacing: 12) {
            if let jpeg, let image = UIImage(data: jpeg) {
              Image(uiImage: image).resizable().scaledToFit().frame(height: 120)
                .clipShape(.rect(cornerRadius: 6))
                .accessibilityLabel(Text(verbatim: "Ảnh sẽ gửi kèm"))
                .accessibilityIdentifier("owner-report-image")
            }
            Button { library = true } label: { Text(verbatim: "Chọn ảnh vừa chụp") }
              .accessibilityIdentifier("owner-report-pick")
          }
        }
        Section {
          LabeledContent {
            Text(verbatim: where_).font(.footnote).foregroundStyle(.secondary).accessibilityIdentifier("owner-report-where")
          } label: { Text(verbatim: "Gửi kèm") }
        }
        if let problem {
          Section { Text(verbatim: problem).foregroundStyle(.red).accessibilityIdentifier("owner-report-problem") }
        }
        if let sent {
          Section { Text(verbatim: sent).foregroundStyle(.green).accessibilityIdentifier("owner-report-sent") }
        }
      }
      .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
      .navigationTitle(Text(verbatim: "Báo lỗi"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button { close() } label: { Text(verbatim: "Đóng") }
            .disabled(sending) // a report on its way can't be taken back
            .accessibilityIdentifier("owner-report-close")
        }
        ToolbarItem(placement: .confirmationAction) {
          Button { Task { await send() } } label: {
            if sending { ProgressView() } else { Text(verbatim: problem == nil ? "Gửi" : "Gửi lại").fontWeight(.semibold) }
          }
          .disabled(!canSend)
          .accessibilityIdentifier("owner-report-send")
        }
      }
    }
    .onAppear { typing = true }
    .sheet(isPresented: $library) {
      ImagePicker(source: .photoLibrary, picked: { data in
        library = false
        Task { await take(data) }
      }, cancelled: { library = false })
      .ignoresSafeArea()
    }
  }

  /// A photo they picked, as the app sends any photo: no metadata, any format the site takes, and a size it does.
  private func take(_ data: Data?) async {
    if let data, let small = await Task.detached(operation: { Readers.shrinkForReport(data) }).value {
      jpeg = small
      theirs = true
      problem = nil
    } else {
      problem = "Không đọc được ảnh này. Chọn ảnh khác nhé."
    }
  }

  private var where_: String {
    [place.screen, place.path, place.conversation, place.answers.map { "câu \($0)" }, place.version].compactMap { $0 }.joined(separator: " · ")
  }

  private func send() async {
    sending = true
    problem = nil
    typing = false // what comes back shows under the words, where the keyboard would cover it
    defer { sending = false }
    var place = place
    place.picture = jpeg == nil ? nil : theirs ? "picked" : "screen"
    do {
      let waiting = try await owner.ask { [place] in try await $0.report(words: words, place: place, jpeg: jpeg) }
      sent = waiting > 1 ? "Đã gửi. \(waiting) báo lỗi đang chờ máy Mac nhận." : "Đã gửi."
      try? await Task.sleep(for: .seconds(waiting > 1 ? 2.5 : 0.9))
      close()
    } catch {
      problem = await say(error)
    }
  }

  private func say(_ e: Error) async -> String? {
    if e is CancellationError { return nil }
    await owner.failed(e, overview: false)
    return (e as? OwnerError)?.reportProblem ?? "Chưa gửi được. Lời và ảnh vẫn còn đây, thử lại nhé."
  }
}

/// What a report names as showing: v2's tab in front (V2Root), then each screen standing on it, as one line in each screen
/// says while it's up. A screen pushed takes the place of the one under it, whose `onDisappear` comes; a sheet stands on it.
@MainActor
enum OwnerShowing {
  struct Screen {
    let id: UUID
    let name: String
    let path: String?
  }

  /// The chat on the screen: the conversation as the bucket has it, and the numbers of the answers showing.
  struct Chat: Equatable {
    let conversation: String
    let answers: [Int]
  }

  fileprivate static var v2Tab: String?
  fileprivate static var screens: [Screen] = []
  fileprivate static var chat: Chat?
}

/// Its own id: the same fish on two tabs' stacks are two screens, and one going mustn't take the other's name with it.
private struct OwnerScreenName: ViewModifier {
  let name: String
  let path: String?
  @State private var id = UUID()

  func body(content: Content) -> some View {
    content
      .onAppear {
        OwnerShowing.screens.removeAll { $0.id == id }
        OwnerShowing.screens.append(OwnerShowing.Screen(id: id, name: name, path: path))
      }
      .onDisappear { OwnerShowing.screens.removeAll { $0.id == id } }
  }
}

/// A chat under a page pushed over it, or on another tab, stays alive and its answer keeps coming: only the chat in front says so.
private struct OwnerChatShown: ViewModifier {
  let chat: OwnerShowing.Chat?
  @State private var shown = false

  func body(content: Content) -> some View {
    content
      .onChange(of: chat) { if shown { OwnerShowing.chat = chat } }
      .onAppear { shown = true; OwnerShowing.chat = chat }
      .onDisappear { shown = false; OwnerShowing.chat = nil }
  }
}

extension View {
  /// A screen's name in a report while it's up: "chat", "tool fish-id", "sheet tank-form".
  func ownerScreen(_ name: String, path: String? = nil) -> some View { modifier(OwnerScreenName(name: name, path: path)) }

  /// A page of the handbook's: its name in a report is the view that draws it and the page's slug, and its path gives the item.
  func ownerShows(_ path: String, as view: String) -> some View {
    ownerScreen([view, path.split(separator: "/").last.map(String.init)].compactMap { $0 }.joined(separator: " "), path: path)
  }

  /// v2's tab in front, by its name, for a report; nil once v1 is back.
  func ownerShowsTab(_ tab: String) -> some View {
    onChange(of: tab, initial: true) { OwnerShowing.v2Tab = tab }
      .onDisappear { OwnerShowing.v2Tab = nil }
  }

  /// The chat's conversation and the answers on the screen, while it's up.
  func ownerShowsChat(_ chat: OwnerShowing.Chat?) -> some View { modifier(OwnerChatShown(chat: chat)) }
}

/// What's showing now, for a report: the app's start says its tab, the hooks above the rest of the way up to the screen in
/// front, and the rest is the phone's. The screen reads as "v2 today / chat ca-neon" or "handbook / fish page ca-neon".
@MainActor
enum OwnerReportHere {
  /// As long as the Worker's check on a screen's name takes.
  private static let longest = 200

  static func place(tab: String, lang: String) -> OwnerReportPlace {
    let base = OwnerShowing.v2Tab.map { "v2 \($0)" } ?? tab
    let top = OwnerShowing.screens.last
    let whole = ([base] + OwnerShowing.screens.map(\.name)).joined(separator: " / ")
    // Deep and long: the tab and the screen in front. Anything the Worker's check would refuse goes, not the whole name.
    let name = whole.count <= longest ? whole : [base, top?.name].compactMap { $0 }.joined(separator: " / ")
    let screen = String(name.map { $0.isASCII && ($0.isLetter || $0.isNumber || " _./-".contains($0)) ? $0 : "-" }.prefix(longest))
    let info = Bundle.main.infoDictionary
    let version = [info?["CFBundleShortVersionString"] as? String, (info?["CFBundleVersion"] as? String).map { "(\($0))" }].compactMap { $0 }.joined(separator: " ")
    let window = OwnerShot.appWindow
    let bounds = window?.bounds.size ?? .zero
    let scale = window?.traitCollection.displayScale ?? 0
    return OwnerReportPlace(
      screen: screen,
      path: top?.path,
      lang: lang,
      version: version.isEmpty ? nil : version,
      theme: window?.traitCollection.userInterfaceStyle == .dark ? "dark" : "light",
      textSize: UIApplication.shared.preferredContentSizeCategory.rawValue.replacingOccurrences(of: "UICTContentSizeCategory", with: ""),
      device: "\(model) iOS \(UIDevice.current.systemVersion)",
      viewport: "\(Int(bounds.width))x\(Int(bounds.height))@\(Int(scale))x",
      conversation: OwnerShowing.chat?.conversation,
      answers: OwnerShowing.chat.flatMap { $0.answers.isEmpty ? nil : $0.answers.map(String.init).joined(separator: ",") }
    )
  }

  /// The phone's model, as "iPhone17,3"; the simulator's, the model it runs as.
  private static var model: String {
    #if targetEnvironment(simulator)
    return ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] ?? "simulator"
    #else
    var u = utsname()
    uname(&u)
    return withUnsafeBytes(of: &u.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
    #endif
  }
}
