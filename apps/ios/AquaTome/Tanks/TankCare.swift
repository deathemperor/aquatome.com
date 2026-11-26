import SwiftUI
import Tanks
import UserNotifications

/// Reminders belong to this installation. A synced or deleted tank can disappear while a notice is pending.
@MainActor @Observable
final class TankCare {
  nonisolated static let noticePrefix = "tank.care."
  nonisolated static let tankKey = "tank"
  private static let storage = "tanks.reminders.v1"

  private(set) var items: [TankReminder] = []
  private(set) var unreadable = false
  private(set) var notificationsOff = false
  private(set) var authorizationFailed = false
  private(set) var schedulingFailed = false
  private(set) var notification: TankReminder?
  @ObservationIgnored private let defaults: UserDefaults
  @ObservationIgnored private var tankNames: [String: String] = [:]
  @ObservationIgnored private var scheduling: Task<Void, Never>?
  @ObservationIgnored private var askingPermission: Task<Void, Never>?
  @ObservationIgnored private var refreshID = UUID()
  #if DEBUG
  let testsPermission = ProcessInfo.processInfo.arguments.contains("-fake-tank-reminder-permission")
  private(set) var permissionRequests = 0
  #endif

  init(defaults: UserDefaults = .standard) {
    self.defaults = defaults
    guard let saved = defaults.data(forKey: Self.storage) else { return }
    do { items = try JSONDecoder().decode([TankReminder].self, from: saved) }
    catch { unreadable = true }
  }

  func save(_ item: TankReminder, tanks: [Tank]) throws {
    guard tanks.contains(where: { $0.id == item.tankID }) else { throw SaveError.missingTank }
    try replace(items.filter { $0.id != item.id } + [item])
    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [Self.noticeID(item)])
    refresh(tanks: tanks)
    if item.notify && !item.finished {
      requestPermission()
      #if DEBUG
      // Match a sync arriving while the opt-in is waiting for iOS.
      if testsPermission { refresh(tanks: tanks) }
      #endif
    }
  }

  func openFromNotification(tankID: String, reminderID: UUID) {
    notification = items.first { $0.id == reminderID && $0.tankID == tankID }
  }

  func takeNotification(for tankID: String) -> TankReminder? {
    guard let notification, notification.tankID == tankID else { return nil }
    self.notification = nil
    return notification
  }

  func remove(_ item: TankReminder, tanks: [Tank]) throws {
    try replace(items.filter { $0.id != item.id })
    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [Self.noticeID(item)])
    refresh(tanks: tanks)
  }

  func tankDeleted(_ id: String, tanks: [Tank]) {
    // An unreadable preferences value is left alone. Refresh still cancels notices for the missing tank.
    let gone = items.filter { $0.tankID == id }
    if !gone.isEmpty {
      try? replace(items.filter { $0.tankID != id })
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: gone.map(Self.noticeID))
    }
    refresh(tanks: tanks)
  }

  private enum SaveError: Error { case missingTank, unreadable }

  private func replace(_ next: [TankReminder]) throws {
    guard !unreadable else { throw SaveError.unreadable }
    defaults.set(try JSONEncoder().encode(next), forKey: Self.storage)
    items = next
  }

  private static func noticeID(_ item: TankReminder) -> String { noticePrefix + item.id.uuidString }

  func refresh(tanks: [Tank]) {
    tankNames = Dictionary(tanks.map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
    reconcileNotices()
  }

  private var wanted: [TankReminder] {
    items.filter { $0.notify && !$0.finished && tankNames[$0.tankID] != nil }
  }

  func requestPermission() {
    guard askingPermission == nil else { return }
    // This task belongs to the user's opt-in. An ordinary sync can replace the schedule without replacing the prompt.
    askingPermission = Task {
      let center = UNUserNotificationCenter.current()
      do {
        if await permissionStatus(center) == .notDetermined, !wanted.isEmpty {
          try await authorize(center)
        }
        authorizationFailed = false
      } catch {
        authorizationFailed = true
      }
      askingPermission = nil
      reconcileNotices()
    }
  }

  private func reconcileNotices() {
    scheduling?.cancel()
    let current = UUID()
    refreshID = current
    let names = tankNames
    let active = wanted
    let detached = items.filter { names[$0.tankID] == nil }.map(Self.noticeID)
    scheduling = Task {
      let center = UNUserNotificationCenter.current()
      let permission = await permissionStatus(center)
      let pending = await center.pendingNotificationRequests()
      guard !Task.isCancelled else { return }

      let allowed = permission == .authorized || permission == .provisional || permission == .ephemeral
      notificationsOff = !active.isEmpty && permission == .denied
      authorizationFailed = !active.isEmpty && permission == .notDetermined && askingPermission == nil
      schedulingFailed = false
      let now = Date()
      let future = allowed ? active.filter { $0.due > now }.sorted { $0.due < $1.due } : []
      let ids = Set(future.map(Self.noticeID))
      let obsolete = pending.map(\.identifier).filter { $0.hasPrefix(Self.noticePrefix) && !ids.contains($0) }
      center.removePendingNotificationRequests(withIdentifiers: obsolete)
      center.removeDeliveredNotifications(withIdentifiers: detached)
      for item in future {
        // Add by stable id. Submitting on the main actor keeps a later refresh or cancel ordered after this one.
        let content = UNMutableNotificationContent()
        content.title = String(localized: item.kind.title.inApp)
        content.body = names[item.tankID] ?? ""
        content.userInfo = [Self.tankKey: item.tankID]
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: max(1, item.due.timeIntervalSince(now)), repeats: false)
        center.add(UNNotificationRequest(identifier: Self.noticeID(item), content: content, trigger: trigger)) { error in
          guard error != nil else { return }
          Task { @MainActor [weak self] in
            if self?.refreshID == current { self?.schedulingFailed = true }
          }
        }
      }
    }
  }

  private func permissionStatus(_ center: UNUserNotificationCenter) async -> UNAuthorizationStatus {
    #if DEBUG
    if testsPermission { return permissionRequests < 2 ? .notDetermined : .denied }
    #endif
    return await center.notificationSettings().authorizationStatus
  }

  private func authorize(_ center: UNUserNotificationCenter) async throws {
    #if DEBUG
    if testsPermission {
      permissionRequests += 1
      if permissionRequests == 1 { throw PermissionTestError.unavailable }
      return
    }
    #endif
    _ = try await center.requestAuthorization(options: [.alert, .sound])
  }

  #if DEBUG
  private enum PermissionTestError: Error { case unavailable }
  #endif
}

struct TankCareSection: View {
  let tank: Tank
  @Environment(TanksModel.self) private var tanks
  @Environment(\.openURL) private var openURL
  @State private var editing: TankReminder?
  @State private var nextEditor: TankReminder?

  var body: some View {
    let care = tanks.care
    let items = care.items.filter { $0.tankID == tank.id }
      .sorted { ($0.finished ? 1 : 0, $0.due, $0.id.uuidString) < ($1.finished ? 1 : 0, $1.due, $1.id.uuidString) }
    Section {
      ForEach(items) { item in
        Button { editing = item } label: {
          VStack(alignment: .leading, spacing: 4) {
            Text(item.kind.title.inApp).foregroundStyle(.primary)
            if item.finished {
              Text("Đã làm").font(.subheadline).foregroundStyle(.secondary)
            } else {
              Text(item.due.formatted(.dateTime.day().month().year().hour().minute().locale(.app)))
                .font(.subheadline).foregroundStyle(item.due < .now ? Color.warning : .secondary)
            }
          }
          .accessibilityElement(children: .combine)
        }
        .accessibilityIdentifier("tank-reminder")
      }
      if care.unreadable {
        Text("Không đọc được lời nhắc trên máy này.").foregroundStyle(Color.warning)
      } else {
        Button {
          editing = TankReminder(tankID: tank.id, due: Calendar.current.date(byAdding: .day, value: 1, to: .now) ?? .now)
        } label: {
          Label("Thêm lời nhắc", systemImage: "plus")
        }
        .accessibilityIdentifier("tank-reminder-add")
      }
    } header: {
      Text("Việc cần làm")
    } footer: {
      Text("Lời nhắc lưu trên máy này.")
      if items.contains(where: { $0.notify && !$0.finished }) {
        if care.notificationsOff {
          Text("AquaTome chưa được phép gửi thông báo.")
          Button("Mở Cài đặt") {
            if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
          }
        } else if care.authorizationFailed {
          Text("Chưa xin được quyền gửi thông báo.")
          Button("Thử lại") { care.requestPermission() }.accessibilityIdentifier("tank-reminder-permission-retry")
        }
        if care.schedulingFailed { Text("Chưa lên lịch được thông báo. Mở lại ứng dụng để thử lại.") }
      }
    }
    .onChange(of: care.notification, initial: true) {
      guard let target = care.takeNotification(for: tank.id), editing?.id != target.id else { return }
      if nextEditor != nil {
        nextEditor = target
      } else if editing == nil {
        editing = target
      } else {
        nextEditor = target
        editing = nil
      }
    }
    .sheet(item: $editing, onDismiss: {
      if let nextEditor {
        self.nextEditor = nil
        editing = nextEditor
      }
    }) { item in
      TankReminderEditor(item: item, saved: items.contains(where: { $0.id == item.id }))
    }
  }
}

private struct TankReminderEditor: View {
  @Environment(TanksModel.self) private var tanks
  @Environment(\.dismiss) private var dismiss
  @State var item: TankReminder
  let saved: Bool
  @State private var failed = false
  @State private var deleting = false

  var body: some View {
    NavigationStack {
      Form {
        Picker("Việc cần làm", selection: $item.kind) {
          ForEach(TankReminder.Kind.allCases, id: \.self) { kind in Text(kind.title.inApp).tag(kind) }
        }
        .accessibilityIdentifier("tank-reminder-kind")
        DatePicker("Ngày nhắc", selection: $item.due)
        Picker("Nhắc lại sau khi làm", selection: $item.interval) {
          ForEach(TankReminder.Repeat.allCases, id: \.self) { interval in Text(interval.title.inApp).tag(interval) }
        }
        .accessibilityIdentifier("tank-reminder-repeat")
        Toggle("Nhắc qua thông báo", isOn: $item.notify)
          .accessibilityIdentifier("tank-reminder-notify")
        if let last = item.lastDone {
          LabeledContent("Lần làm gần nhất", value: last.formatted(.dateTime.day().month().year().hour().minute().locale(.app)))
        }
        if saved {
          Section {
            if !item.finished {
              Button("Đã làm") {
                var completed = item
                completed.complete(at: .now, in: .current)
                finish { try tanks.care.save(completed, tanks: tanks.tanks) }
              }
              .accessibilityIdentifier("tank-reminder-done")
            }
            Button("Xóa lời nhắc", role: .destructive) { deleting = true }
              .confirmationDialog("Xóa lời nhắc?", isPresented: $deleting, titleVisibility: .visible) {
                Button("Xóa", role: .destructive) {
                  finish { try tanks.care.remove(item, tanks: tanks.tanks) }
                }
              }
          }
        }
        if failed { Text("Chưa lưu được lời nhắc. Thử lại.").foregroundStyle(Color.warning) }
        #if DEBUG
        if tanks.care.testsPermission,
           let other = tanks.care.items.first(where: { $0.tankID == item.tankID && $0.id != item.id }) {
          Button {
            tanks.care.openFromNotification(tankID: other.tankID, reminderID: other.id)
          } label: { Text(verbatim: "Open other reminder") }
          .accessibilityIdentifier("tank-reminder-test-notification")
        }
        #endif
      }
      .navigationTitle("Lời nhắc")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) { Button("Hủy") { dismiss() } }
        ToolbarItem(placement: .confirmationAction) {
          Button("Lưu") {
            if item.finished { item.reopen() }
            finish { try tanks.care.save(item, tanks: tanks.tanks) }
          }
          .disabled(item.due <= .now)
          .accessibilityIdentifier("tank-reminder-save")
        }
      }
    }
  }

  private func finish(_ change: () throws -> Void) {
    do { try change(); dismiss() }
    catch { failed = true }
  }
}

private extension TankReminder.Kind {
  var title: LocalizedStringResource {
    switch self {
    case .waterChange: "Thay nước"
    case .trim: "Cắt tỉa cây"
    case .testCycling: "Đo amoniac và nitrit"
    case .heater: "Kiểm tra sưởi"
    case .chiller: "Kiểm tra máy làm mát"
    case .breeding: "Chuẩn bị mùa sinh sản"
    }
  }
}

private extension TankReminder.Repeat {
  var title: LocalizedStringResource {
    switch self {
    case .once: "Một lần"
    case .daily: "Hằng ngày"
    case .weekly: "Hằng tuần"
    case .monthly: "Hằng tháng"
    case .yearly: "Hằng năm"
    }
  }
}
