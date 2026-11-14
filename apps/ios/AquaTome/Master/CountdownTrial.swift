import Foundation
import Observation
import Plugs
import SwiftUI
import Tanks

/// The owner's test of a plug's own countdown (the chief, 15 Nov), before the master button may write one: an outlet the
/// owner picks, on now (never CO2 or a heater), is switched off and given a one-minute countdown with the app open, then
/// read. Whether the plug switched it back on at 0 is kept on the phone and shown; if it didn't, the phone switches it
/// back on. The first countdown the strip ever gets, with the owner watching. The owner's; goes once they've tried it.
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

  func run(_ target: DeviceTarget) async {
    guard state == .idle else { return }
    let off = DeviceCommand(device: target.device, outlet: target.outlet, on: false)
    let on = DeviceCommand(device: target.device, outlet: target.outlet, on: true)
    guard let o = switcher.outlet(off) else { return }
    let (key, name) = (o.key, o.name)
    let started = Date()
    state = .running(name: name, until: started.addingTimeInterval(TimeInterval(Self.seconds)))
    defer { state = .idle }
    if case .failed(let line) = await switcher.set(off) { return keep("Không thử được: \(line)") }
    let board = switcher.plugs.board
    guard await board.countdown(key, seconds: Self.seconds) else {
      return keep("Ổ \(name) không báo đã nhận đếm ngược." + (await back(on)))
    }
    state = .running(name: name, until: Date().addingTimeInterval(TimeInterval(Self.seconds)))
    try? await Task.sleep(for: .seconds(Self.seconds + 10))
    await switcher.plugs.refresh()
    let at = MasterCard.time(started)
    if board.on(key) == true { return keep("Thử lúc \(at): ổ \(name) bật lại khi đếm về 0.") }
    keep("Thử lúc \(at): ổ \(name) vẫn tắt khi đếm về 0." + (await back(on)))
  }

  /// Switched back on from the phone, and said so.
  private func back(_ on: DeviceCommand) async -> String {
    if case .failed(let line) = await switcher.set(on) { return " Chưa bật lại được: \(line)" }
    return " Điện thoại đã bật lại."
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
    VStack(alignment: .leading, spacing: 8) {
      Divider()
      Text(verbatim: "Thử đếm ngược của ổ cắm").font(.subheadline.weight(.semibold))
      Text(verbatim: "Tắt một ổ đang bật rồi để ổ cắm tự bật lại sau 1 phút. Giữ ứng dụng mở.").font(.footnote).foregroundStyle(.secondary)
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
          Text(verbatim: outlets.first { $0.target == picked }?.name ?? "Chọn ổ")
        }
        .accessibilityIdentifier("trial-pick")
        Button { if let picked { Task { await trial.run(picked) } } } label: {
          Text(verbatim: "Thử đếm ngược 1 phút").frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .disabled(picked == nil || master.sending)
        .accessibilityIdentifier("trial-run")
      }
      if let r = trial.result { Text(verbatim: r).font(.footnote).accessibilityIdentifier("trial-result") }
    }
    .task { await plugs.refresh() }
  }
}
