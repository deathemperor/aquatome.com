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
  @State private var running: Task<Void, Never>?
  @State private var progress = (done: 0, of: 0)
  @State private var asking = false
  @State private var told: Told?

  enum Told { case offline, noRoom, partly(Int, Int) }

  var body: some View {
    // Only the pages the app draws itself are kept: the others are web pages.
    let pages = items.filter(handbook.drawsItself)
    if !pages.isEmpty {
      Button {
        if running == nil { Task { await start(pages) } } else { stop() }
      } label: {
        if running != nil {
          // Tapped again, it stops.
          ProgressView(value: Double(progress.done), total: Double(max(progress.of, 1))).progressViewStyle(.circular)
            .accessibilityLabel(Text("Dừng tải"))
        } else if pages.allSatisfy(handbook.isKept) {
          Label("Đã tải về đọc offline", systemImage: "checkmark.circle")
        } else {
          Label("Tải về đọc offline", systemImage: "arrow.down.circle")
        }
      }
      .accessibilityIdentifier("keep-offline")
      .confirmationDialog(Text("Tải \(pages.count) bài bằng dữ liệu di động?"), isPresented: $asking, titleVisibility: .visible) {
        Button("Tải") { begin(pages) }
        Button("Hủy", role: .cancel) {}
      } message: {
        Text("Ảnh trong bài cũng được tải, có thể tới vài chục MB.")
      }
      .alert(message, isPresented: Binding { told != nil } set: { if !$0 { told = nil } }) {}
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

  private func start(_ pages: [HandbookIndex.Item]) async {
    switch await Self.plan() {
    case .go: begin(pages)
    case .ask: asking = true
    case .offline: told = .offline
    case .noRoom: told = .noRoom
    }
  }

  private func begin(_ pages: [HandbookIndex.Item]) {
    progress = (0, 0)
    running = Task {
      let n = await handbook.keep(pages) { done, of in if !Task.isCancelled { progress = (done, of) } }
      // Stopped: the button is back already, and the pages kept so far are whole.
      guard !Task.isCancelled else { return }
      running = nil
      if n < pages.count { told = .partly(n, pages.count) }
    }
  }

  private func stop() {
    running?.cancel()
    running = nil
  }

  /// The network now and the room on the phone. UI tests: `-network-cellular` is mobile data, `-low-storage` a full phone.
  private static func plan() async -> KeepPlan {
    let path = await currentPath()
    var free = try? URL.homeDirectory.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]).volumeAvailableCapacityForImportantUsage
    var expensive = path.isExpensive
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    if args.contains("-network-cellular") { expensive = true }
    if args.contains("-low-storage") { free = 0 }
    #endif
    return KeepPlan.of(online: path.status == .satisfied, expensive: expensive, constrained: path.isConstrained, freeBytes: free)
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
