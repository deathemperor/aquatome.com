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
    [.banner, .list, .sound]
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    guard let page = OwnerPush.page(response.notification.request.content.userInfo) else { return }
    await MainActor.run { UIApplication.shared.open(page) }
  }

  /// Asks APNs for this phone's token if the owner turned them on here and iOS lets the app show them (each launch: the
  /// token can change).
  static func register(_ push: OwnerPush) async {
    guard push.wanted, await UNUserNotificationCenter.current().notificationSettings().authorizationStatus == .authorized else { return }
    UIApplication.shared.registerForRemoteNotifications()
  }
}

/// The daily report on this phone, at the top of the dashboard's overview: turned on, iOS asks first; refused there, it
/// says where to allow them. Whether the site sends the report at all is its own setting ("Báo cáo").
struct OwnerPushRow: View {
  @Environment(AccountModel.self) private var account
  @State private var refused = false

  var body: some View {
    let push = account.push
    VStack(alignment: .leading, spacing: 6) {
      Toggle(isOn: Binding(get: { push.wanted }, set: { on in Task { await turn(on) } })) {
        Text("Nhận thông báo báo cáo trên máy này")
      }
      .accessibilityIdentifier("owner-push")
      if refused {
        Text("Thông báo của AquaTome đang tắt trong Cài đặt.").font(.footnote).foregroundStyle(.secondary)
        Button("Mở Cài đặt") {
          if let u = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(u) }
        }
        .font(.footnote)
      }
    }
  }

  private func turn(_ on: Bool) async {
    refused = false
    guard on else { return await account.push.want(false) }
    let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
    guard granted else { refused = true; return }
    await account.push.want(true)
    UIApplication.shared.registerForRemoteNotifications()
  }
}
