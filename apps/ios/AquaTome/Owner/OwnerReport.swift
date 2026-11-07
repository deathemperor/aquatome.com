import AccountSync
import PhotosUI
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
  /// `place`: what's showing now, as the app's start knows it.
  func ownerReports(place: @escaping @MainActor () -> OwnerReportPlace) -> some View {
    modifier(OwnerReports(place: place))
  }
}

private struct OwnerReports: ViewModifier {
  private let place: @MainActor () -> OwnerReportPlace
  @Environment(AccountModel.self) private var account
  @State private var overlay = OwnerReportOverlay()

  init(place: @escaping @MainActor () -> OwnerReportPlace) { self.place = place }

  func body(content: Content) -> some View {
    content.onChange(of: account.owner.isOwner == true && account.user != nil, initial: true) { _, isOwner in
      overlay.show(isOwner ? account.owner : nil, place: place)
    }
  }
}

/// The picture of what's on the screen, without this feature's own windows. A web page draws too, and a sheet over the app
/// is in the window it was opened from.
@MainActor
private enum OwnerShot {
  static var appWindow: UIWindow? {
    UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }?
      .windows.first { !($0 is OwnerReportWindow) && !$0.isHidden && $0.windowLevel == .normal }
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

  private static let size = CGSize(width: 48, height: 48)
  private static let offerSize = CGSize(width: 190, height: 48)
  /// Above the tab bar, against the screen's edge.
  private static let aboveBottom: CGFloat = 120

  func show(_ owner: OwnerAccess?, place: @escaping @MainActor () -> OwnerReportPlace) {
    self.owner = owner
    here = place
    guard owner != nil else {
      buttonWindow?.isHidden = true
      buttonWindow = nil
      sheetWindow?.isHidden = true
      sheetWindow = nil
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

  private func position(_ window: UIWindow, offering: Bool) {
    guard let screen = window.windowScene?.screen.bounds else { return }
    let size = offering ? Self.offerSize : Self.size
    window.frame = CGRect(x: screen.width - size.width - 8, y: screen.height - Self.aboveBottom - size.height, width: size.width, height: size.height)
  }

  private func screenshotTaken() {
    guard sheetWindow == nil, let buttonWindow else { return }
    offered = (OwnerShot.jpeg(), here?() ?? OwnerReportPlace())
    position(buttonWindow, offering: true)
    offering = true
    offerEnds?.cancel()
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
    endOffer()
    buttonWindow?.isHidden = true
    let window = OwnerReportWindow(windowScene: scene)
    window.windowLevel = .normal + 2
    window.backgroundColor = .clear
    let root = UIViewController()
    root.view.backgroundColor = .clear
    window.rootViewController = root
    window.makeKeyAndVisible()
    sheetWindow = window
    let sheet = UIHostingController(rootView: OwnerReportSheet(owner: owner, place: shot.place, jpeg: shot.jpeg) { [weak self] in self?.closeSheet() })
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
  @State private var picked: PhotosPickerItem?
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
            PhotosPicker(selection: $picked, matching: .images) { Text(verbatim: jpeg == nil ? "Chọn ảnh" : "Chọn ảnh khác") }
          }
        }
        Section {
          LabeledContent { Text(verbatim: where_).font(.footnote).foregroundStyle(.secondary) } label: { Text(verbatim: "Gửi kèm") }
        }
        if let problem {
          Section { Text(verbatim: problem).foregroundStyle(.red).accessibilityIdentifier("owner-report-problem") }
        }
        if let sent {
          Section { Text(verbatim: sent).foregroundStyle(.green).accessibilityIdentifier("owner-report-sent") }
        }
      }
      .navigationTitle(Text(verbatim: "Báo lỗi"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button { close() } label: { Text(verbatim: "Đóng") }.accessibilityIdentifier("owner-report-close")
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
    .task { typing = true }
    .onChange(of: picked) {
      guard let picked else { return }
      Task {
        // As a JPEG, however the phone keeps it: no metadata, and any format the site takes.
        if let data = try? await picked.loadTransferable(type: Data.self), let image = UIImage(data: data), let again = image.jpegData(compressionQuality: 0.8) {
          jpeg = again
          problem = nil
        } else {
          problem = "Không đọc được ảnh này. Chọn ảnh khác nhé."
        }
      }
    }
  }

  private var where_: String {
    [place.screen, place.path, place.version].compactMap { $0 }.joined(separator: " · ")
  }

  private func send() async {
    sending = true
    problem = nil
    defer { sending = false }
    do {
      let waiting = try await owner.ask { try await $0.report(words: words, place: place, jpeg: jpeg) }
      sent = waiting > 1 ? "Đã gửi. \(waiting) báo lỗi đang chờ máy Mac nhận." : "Đã gửi."
      try? await Task.sleep(for: .seconds(waiting > 1 ? 2.5 : 0.9))
      close()
    } catch {
      problem = await say(error)
    }
  }

  private func say(_ e: Error) async -> String? {
    switch e as? OwnerError {
    case .refused("rate_limited", _)?: return "Đã gửi quá nhiều trong một giờ. Lời và ảnh vẫn còn đây, lát nữa thử lại nhé."
    case .refused("too_large", _)?: return "Ảnh quá lớn. Chọn ảnh khác nhé."
    default: return await owner.say(e, overview: false)
    }
  }
}

/// What's showing now, for a report: the app's start says the screen and the page, and the rest is the phone's.
@MainActor
enum OwnerReportHere {
  static func place(screen: String, path: String?, lang: String) -> OwnerReportPlace {
    let info = Bundle.main.infoDictionary
    let version = [info?["CFBundleShortVersionString"] as? String, (info?["CFBundleVersion"] as? String).map { "(\($0))" }].compactMap { $0 }.joined(separator: " ")
    let window = OwnerShot.appWindow
    let bounds = window?.bounds.size ?? .zero
    let scale = window?.traitCollection.displayScale ?? 0
    return OwnerReportPlace(
      screen: screen,
      path: path,
      lang: lang,
      version: version.isEmpty ? nil : version,
      theme: window?.traitCollection.userInterfaceStyle == .dark ? "dark" : "light",
      textSize: UIApplication.shared.preferredContentSizeCategory.rawValue.replacingOccurrences(of: "UICTContentSizeCategory", with: ""),
      device: "\(model) iOS \(UIDevice.current.systemVersion)",
      viewport: "\(Int(bounds.width))x\(Int(bounds.height))@\(Int(scale))x"
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
