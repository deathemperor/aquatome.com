import AccountSync
import SwiftUI
import UserNotifications

/// The daily report's notifications (OwnerPush): APNs' token for this phone, and a tap on one opening its report, a page
/// of aquatome.com, in the browser for now (the report is a page of the site's dashboard, not a section of the app's).
final class OwnerNotifications: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  /// What APNs' token is given to (the app's start sets it).
  var received: ((Data) -> Void)?

  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    UNUserNotificationCenter.current().delegate = self
    return true
  }

  func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
    received?(deviceToken)
  }

  // No token (the simulator, no network): nothing said; asked again at the next launch.
  func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {}

  // The app in front: shown as it is outside it.
  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async
    -> UNNotificationPresentationOptions {
    [.banner, .list]
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    guard let page = OwnerPush.page(response.notification.request.content.userInfo) else { return }
    await MainActor.run { UIApplication.shared.open(OwnCopy.marked(page, site: AccountsClient.site)) }
  }

  /// Asks APNs for this phone's token if the owner turned them on here and iOS lets the app show them (each launch: the
  /// token can change).
  static func register(_ push: OwnerPush) async {
    guard push.wanted, await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .authorized else { return }
    UIApplication.shared.registerForRemoteNotifications()
  }
}

/// The daily report's delivery, from the overview's bell: by email, and by notification on this phone. Turning this
/// phone's on turns the site's notifications on too when they're off, so it gets them; turning it off is this phone's
/// alone. In English, as the dashboard's words are.
struct OwnerDelivery: View {
  @Environment(AccountModel.self) private var account
  @Environment(\.dismiss) private var dismiss
  @State private var email: Bool?
  @State private var push: Bool?
  @State private var working = false
  @State private var problem: String?

  var body: some View {
    NavigationStack {
      Form {
        Section {
          Toggle(isOn: Binding(get: { email ?? false }, set: { on in Task { await set { email = try await $0.reportEmail(on) } } })) { Text(verbatim: "Email") }
            .disabled(email == nil || working)
            .accessibilityIdentifier("owner-email")
          OwnerPushRow(siteOff: push == false) { await set { c in
            try await c.run(Owner.Action(label: "", method: "POST", path: "/api/owner/report-settings", body: ["push": true]))
            push = true
          } }
        } footer: {
          Text(verbatim: "Every morning at 7:00, Vietnam time.")
        }
        if let problem { Text(verbatim: problem).foregroundStyle(.red).accessibilityIdentifier("owner-message") }
      }
      .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
      .navigationTitle(Text(verbatim: "Daily report"))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar { ToolbarItem(placement: .confirmationAction) { Button { dismiss() } label: { Text(verbatim: "Done") } } }
      .task {
        await set { c in
          let now = try await c.reportSettings()
          email = now.email
          push = now.push
        }
      }
    }
  }

  private func set(_ call: @escaping @MainActor (OwnerClient) async throws -> Void) async {
    working = true
    defer { working = false }
    do {
      try await account.owner.ask { try await call($0) }
      problem = nil
    } catch {
      problem = await account.owner.say(error, overview: false)
    }
  }
}

/// The daily report on this phone: turned on, iOS asks first; refused there, or turned off since in Settings, it says
/// where to allow them. `siteOff`: the site sends no phone notifications at all, so turning this on turns them on there
/// (`siteOn`).
struct OwnerPushRow: View {
  var siteOff = false
  var siteOn: @MainActor () async -> Void = {}
  @Environment(AccountModel.self) private var account
  @Environment(\.scenePhase) private var phase
  @State private var refused = false

  var body: some View {
    let push = account.push
    VStack(alignment: .leading, spacing: 6) {
      Toggle(isOn: Binding(get: { push.wanted && !siteOff }, set: { on in Task { await turn(on) } })) {
        Text(verbatim: "Notifications on this phone")
      }
      .accessibilityIdentifier("owner-push")
      if refused {
        Text(verbatim: "AquaTome's notifications are off in Settings.").font(.footnote).foregroundStyle(.secondary)
        Button { if let u = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(u) } } label: { Text(verbatim: "Open Settings") }
          .font(.footnote)
      }
    }
    // On here, but not allowed in Settings (since): the site sends, iOS shows nothing.
    .task(id: phase) {
      guard phase == .active else { return }
      let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
      refused = account.push.wanted && status == .denied
    }
  }

  private func turn(_ on: Bool) async {
    refused = false
    guard on else { return await account.push.want(false) }
    let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert])) ?? false
    guard granted else { refused = true; return }
    await account.push.want(true)
    UIApplication.shared.registerForRemoteNotifications()
    if siteOff { await siteOn() }
  }
}
