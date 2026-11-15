import Foundation
import Observation
import Plugs
import SwiftUI
import Tanks

/// The owner's test of a plug's own countdown (the chief, 15 Nov), before the master button may write one, on an outlet
/// the owner picks that is on now (never CO2 or a heater), with the app open: switched off with a one-minute countdown
/// (does it come back on at 0?), then on with another (does it switch off at 0, the way CO2 will need?), then left on,
/// as it was found. What each did is kept on the phone and shown. The first countdowns the strip ever gets, with the owner
/// watching. The owner's; goes once they've tried it.
@MainActor
@Observable
final class CountdownTrial {
  enum State: Equatable {
    case idle
    case running(name: String, until: Date)
  }

  private(set) var state = State.idle
  /// The last result, kept: what the owner tells the chief.
  private(set) var result: String? = UserDefaults.standard.string(forKey: CountdownTrial.key)

  @ObservationIgnored private let switcher: Switcher
  private static let key = "master.countdownTrial"
  /// A minute; `-countdown-trial-seconds <n>` in the simulator's flows.
  private static let seconds: Int = {
    #if DEBUG
    let args = ProcessInfo.processInfo.arguments
    if let i = args.firstIndex(of: "-countdown-trial-seconds"), i + 1 < args.count, let n = Int(args[i + 1]) { return n }
    #endif
    return 60
  }()

  init(switcher: Switcher) { self.switcher = switcher }

  /// Outlets to try: on now, on a Tuya plug that lists a countdown for them, and not CO2 or a heater.
  func outlets() -> [(target: DeviceTarget, name: String)] {
    let board = switcher.plugs.board
    return switcher.tanks.store.liveDevices.filter { $0.kind == "plug" && $0.brand == "tuya" }.flatMap { p in
      p.outlets.filter { $0.role != "co2" && $0.role != "heater" }.compactMap { o -> (DeviceTarget, String)? in
        let c = DeviceCommand(device: p.id, outlet: o.code, on: false)
        guard let o = switcher.outlet(c), board.on(o.key) == true, board.hasCountdown(o.key) else { return nil }
        return (c.target, o.name)
      }
    }
  }

  /// Both ways on the one outlet: off, then a countdown (does it come back on at 0?); on, then a countdown (does it switch
  /// off at 0, as CO2 will need?); then on, as it was found, however it went.
  func run(_ target: DeviceTarget) async {
    guard state == .idle else { return }
    let off = DeviceCommand(device: target.device, outlet: target.outlet, on: false)
    let on = DeviceCommand(device: target.device, outlet: target.outlet, on: true)
    guard let o = switcher.outlet(off) else { return }
    let (key, name) = (o.key, o.name)
    let at = MasterCard.time(Date())
    // Running from here, before the first wait: a press waits for it.
    state = .running(name: name, until: Date().addingTimeInterval(TimeInterval(Self.seconds)))
    defer { state = .idle }
    // As offered now, read afresh: on, and not CO2 or a heater (a role changed since it was picked).
    await switcher.plugs.refresh()
    guard switcher.plugs.board.listError == nil, outlets().contains(where: { $0.target == target }) else {
      return keep("Thử lúc \(at): chưa thử ổ \(name) (không đọc được ổ cắm, hoặc ổ không còn bật).")
    }
    if case .failed(let line) = await switcher.set(off) { return keep("Thử lúc \(at), ổ \(name): chưa tắt được: \(line)" + (await back(key, on))) }
    let unknown = "không rõ kết quả (ổ không báo đã nhận đếm ngược, hoặc không đọc lại được)."
    // Off, then a countdown.
    guard let cameOn = await countdown(key, name) else { return keep("Thử lúc \(at), ổ \(name): \(unknown)" + (await back(key, on))) }
    let first = "Tắt rồi đếm ngược: " + (cameOn ? "bật lại khi về 0." : "vẫn tắt khi về 0.")
    if !cameOn {
      _ = await switcher.plugs.board.countdown(key, seconds: 0)
      if case .failed = await switcher.set(on) { return keep("Thử lúc \(at), ổ \(name):\n\(first)" + (await back(key, on))) }
    }
    // On, then a countdown.
    guard let stayedOn = await countdown(key, name) else { return keep("Thử lúc \(at), ổ \(name):\n\(first)\nLần hai: \(unknown)" + (await back(key, on))) }
    let second = "Bật rồi đếm ngược: " + (stayedOn ? "vẫn bật khi về 0." : "tắt khi về 0.")
    keep("Thử lúc \(at), ổ \(name):\n\(first)\n\(second)" + (await back(key, on)))
  }

  /// A countdown on the outlet, then the outlet read 10 seconds after it ends: whether it is on then; nil when the plug
  /// didn't report the countdown, or the list couldn't be read again (an old list's answer isn't the outlet's).
  private func countdown(_ key: PlugBoard.Outlet, _ name: String) async -> Bool? {
    let board = switcher.plugs.board
    guard await board.countdown(key, seconds: Self.seconds) else { return nil }
    state = .running(name: name, until: Date().addingTimeInterval(TimeInterval(Self.seconds)))
    try? await Task.sleep(for: .seconds(Self.seconds + 10))
    await switcher.plugs.refresh()
    guard board.listError == nil, let on = board.on(key) else { return nil }
    return on
  }

  /// As it was found, on every way out: a countdown still running ended (it would switch the outlet again at 0), the
  /// outlet read afresh, and switched back on from the phone if it isn't on, said so.
  private func back(_ key: PlugBoard.Outlet, _ on: DeviceCommand) async -> String {
    let board = switcher.plugs.board
    _ = await board.countdown(key, seconds: 0)
    await switcher.plugs.refresh()
    if board.listError == nil, board.on(key) == true { return "" }
    if case .failed(let line) = await switcher.set(on) { return "\nChưa bật lại được: \(line)" }
    return "\nĐiện thoại đã bật lại như lúc đầu."
  }

  private func keep(_ s: String) {
    result = s
    UserDefaults.standard.set(s, forKey: Self.key)
  }
}

/// The trial's row at the master button card's foot: an outlet, "Thử đếm ngược 1 phút", the result. Not translated:
/// the owner's, as the Love Ecology card's trial row is.
struct CountdownTrialRow: View {
  @Environment(MasterModel.self) private var master
  @Environment(PlugsModel.self) private var plugs
  @State private var picked: DeviceTarget?

  var body: some View {
    let trial = master.trial
    let outlets = trial.outlets()
    let chosen = outlets.first { $0.target == picked }
    VStack(alignment: .leading, spacing: 8) {
      Divider()
      Text(verbatim: "Thử đếm ngược của ổ cắm").font(.subheadline.weight(.semibold))
      Text(verbatim: "Tắt một ổ đang bật rồi để ổ cắm tự bật lại sau 1 phút, rồi tự tắt sau 1 phút nữa; xong thì bật lại như cũ. Giữ ứng dụng mở khoảng 3 phút.").font(.footnote).foregroundStyle(.secondary)
      if case .running(let name, let until) = trial.state {
        TimelineView(.periodic(from: .now, by: 1)) { context in
          Text(verbatim: "Ổ \(name) đang đếm ngược: còn \(max(0, Int(until.timeIntervalSince(context.date).rounded(.up)))) giây.")
        }
        .font(.footnote)
        .accessibilityIdentifier("trial-running")
      } else if outlets.isEmpty {
        Text(verbatim: "Chưa có ổ nào đang bật có đếm ngược (không tính CO2 và sưởi).").font(.footnote).foregroundStyle(.secondary)
      } else {
        Menu {
          ForEach(outlets, id: \.target) { o in Button(o.name) { picked = o.target } }
        } label: {
          Text(verbatim: chosen?.name ?? "Chọn ổ")
        }
        .accessibilityIdentifier("trial-pick")
        Button { if let chosen { Task { await master.tryCountdown(chosen.target) } } } label: {
          Text(verbatim: "Thử đếm ngược 1 phút").frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        // Not beside a press: each would read the other's switching as a hand's.
        .disabled(chosen == nil || master.busy)
        .accessibilityIdentifier("trial-run")
      }
      if let r = trial.result { Text(verbatim: r).font(.footnote).accessibilityIdentifier("trial-result") }
    }
    .task { await plugs.refresh() }
  }
}
