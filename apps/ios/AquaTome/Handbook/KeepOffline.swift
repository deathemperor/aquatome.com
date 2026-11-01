import Handbook
import Network
import os
import SwiftUI

/// "Tải về đọc offline" for a shelf of guides: their pages and every picture in them kept on the phone, so the shelf
/// reads offline. On mobile data or in Low Data Mode it asks first; with no network or too little room on the phone it
/// says so instead (KeepPlan). Tapped while it runs, it stops; a page is on the kept list only once it's whole
/// (KeepPages), and the list is in one place on the Tìm home, where pages are let go of.
struct KeepOffline: ToolbarContent {
  let items: [HandbookIndex.Item]

  var body: some ToolbarContent {
    ToolbarItem(placement: .topBarTrailing) { KeepOfflineButton(items: items) }
  }
}

private struct KeepOfflineButton: View {
  let items: [HandbookIndex.Item]
  @Environment(HandbookModel.self) private var handbook
  /// Looking at the network and the room: a second tap starts nothing.
  @State private var checking = false
  @State private var asking = false
  @State private var told: Told?

  enum Told { case offline, noRoom, partly(Int, Int) }

  var body: some View {
    // Only the pages the app draws itself are kept: the others are web pages.
    let pages = items.filter(handbook.drawsItself)
    // The shelf, as the model knows its keep (on its way when the shelf is left and opened again).
    let shelf = pages.map(\.path).joined(separator: "\n")
    if !pages.isEmpty {
      Button {
        if handbook.keeping[shelf] != nil { handbook.stopKeeping(shelf) } else { Task { await start(pages, shelf) } }
      } label: {
        if let p = handbook.keeping[shelf] {
          // Tapped again, it stops.
          ProgressView(value: Double(p.done), total: Double(max(p.of, 1))).progressViewStyle(.circular)
            .accessibilityLabel(Text("Dừng tải"))
        } else if pages.allSatisfy(handbook.isKept) {
          Label("Đã tải về đọc offline", systemImage: "checkmark.circle")
        } else {
          Label("Tải về đọc offline", systemImage: "arrow.down.circle")
        }
      }
      .disabled(checking)
      .accessibilityIdentifier("keep-offline")
      .confirmationDialog(Text("Tải \(pages.count) bài bằng dữ liệu di động?"), isPresented: $asking, titleVisibility: .visible) {
        Button("Tải") { handbook.startKeeping(pages, shelf: shelf) }
        Button("Hủy", role: .cancel) {}
      } message: {
        Text("Ảnh trong bài cũng được tải, có thể tới vài chục MB.")
      }
      .alert(message, isPresented: Binding { told != nil } set: { if !$0 { told = nil } }) {}
      // A keep that ended short says so: here, or when the shelf is opened again.
      .onChange(of: handbook.keeping[shelf] == nil, initial: true) { _, ended in
        if ended, let (n, of) = handbook.takeShort(shelf) { told = .partly(n, of) }
      }
    }
  }

  private var message: Text {
    switch told {
    case .offline: Text("Không có mạng. Kết nối rồi thử lại.")
    case .noRoom: Text("Máy còn ít chỗ trống. Hãy giải phóng bớt dung lượng rồi thử lại.")
    case let .partly(n, of): Text("Tải được \(n)/\(of) bài. Kiểm tra kết nối mạng rồi thử lại.")
    case nil: Text(verbatim: "")
    }
  }

  private func start(_ pages: [HandbookIndex.Item], _ shelf: String) async {
    checking = true
    defer { checking = false }
    switch await Self.plan() {
    case .go: handbook.startKeeping(pages, shelf: shelf)
    case .ask: asking = true
    case .offline: told = .offline
    case .noRoom: told = .noRoom
    }
  }

  /// The network now and the room on the phone. UI tests: `-network-cellular` is mobile data, `-low-storage` a full phone.
  private static func plan() async -> KeepPlan {
    let path = await currentPath()
    var free = try? URL.homeDirectory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage
    var online = path.status == .satisfied, expensive = path.isExpensive, constrained = path.isConstrained
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    // UI tests: Wi-Fi unless the test says otherwise, whatever the Mac's network is.
    if args.contains("-fixed-handbook") { (online, expensive, constrained) = (true, false, false) }
    if args.contains("-network-cellular") { expensive = true }
    if args.contains("-low-storage") { free = 0 }
    #endif
    return KeepPlan.of(online: online, expensive: expensive, constrained: constrained, freeBytes: free)
  }

  private static func currentPath() async -> NWPath {
    let monitor = NWPathMonitor()
    let path = await withCheckedContinuation { (c: CheckedContinuation<NWPath, Never>) in
      let once = OSAllocatedUnfairLock(initialState: false)
      monitor.pathUpdateHandler = { p in
        if once.withLock({ was in defer { was = true }; return !was }) { c.resume(returning: p) }
      }
      monitor.start(queue: .global(qos: .userInitiated))
    }
    monitor.cancel()
    return path
  }
}
