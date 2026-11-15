import SwiftUI
import Tanks

/// The master button's card, first on Đèn (Design Lead's master/spec.md and board, 14 Nov): none yet, ready, sending,
/// running (the whole card in the tint, seen from across the room) and what didn't go. The owner's account alone, as the
/// Love Ecology lamp's card is: the lamp is theirs.
struct MasterCard: View {
  @Environment(AccountModel.self) private var account
  @Environment(MasterModel.self) private var master
  @Environment(\.colorScheme) private var scheme
  @Environment(\.accessibilityVoiceOverEnabled) private var voiceOver
  @Environment(\.dynamicTypeSize) private var size
  @State private var editing = false

  var body: some View {
    if account.owner.isOwner == true, account.user != nil {
      card
        .sheet(isPresented: $editing) { MasterSheet(button: master.button) }
        #if DEBUG
        .background {
          // What went out, for the UI tests to read (debug builds only).
          Text(verbatim: master.log.joined(separator: " | ")).font(.system(size: 1)).opacity(0.01).accessibilityIdentifier("master-log")
        }
        #endif
    }
  }

  @ViewBuilder private var card: some View {
    if let run = master.run, run.isRunning {
      running(run)
    } else if let b = master.button {
      ready(b)
    } else {
      VStack(alignment: .leading, spacing: 12) {
        Text("Nút tổng").font(.title3.weight(.semibold))
        Text("Một chạm bật đèn, tắt quạt và CO2… cùng lúc, rồi trả lại như cũ khi hết giờ. Bạn chọn nút làm gì.")
          .font(.subheadline).foregroundStyle(.secondary)
        Button { editing = true } label: { Text("Tạo nút tổng").frame(maxWidth: .infinity) }
          .buttonStyle(.bordered).controlSize(.large)
          .accessibilityIdentifier("master-create")
        // A button deleted while its press still owed something: that stays.
        problems
        putBack
        CountdownTrialRow()
      }
      .modifier(Panel())
    }
  }

  private func ready(_ b: MasterButton) -> some View {
    let summary = master.summary(b.steps) + " · " + Self.length(b.minutes)
    return VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .firstTextBaseline) {
        Text(verbatim: b.name).font(.title3.weight(.semibold)).accessibilityIdentifier("master-name")
        Spacer()
        Button("Sửa") { editing = true }.font(.subheadline).disabled(master.sending).accessibilityIdentifier("master-edit")
      }
      Text(verbatim: summary).font(.subheadline).foregroundStyle(.secondary).accessibilityIdentifier("master-summary")
      Button { Task { await master.start() } } label: { sendingOr(Text("Bắt đầu"), colour: ink) }
      .buttonStyle(Filled(fill: .accentColor, words: ink, keepsLook: master.sending))
      .disabled(master.sending || b.steps.isEmpty || master.trial.state != .idle)
      .accessibilityIdentifier("master-start")
      problems
      putBack
      // What the last end left as it was: nothing failed, so not in the warning's style.
      if !master.notes.isEmpty {
        VStack(alignment: .leading, spacing: 4) { ForEach(master.notes, id: \.self) { Text(verbatim: $0) } }
          .font(.footnote).foregroundStyle(.secondary)
          .accessibilityElement(children: .combine)
          .accessibilityIdentifier("master-notes")
      }
      CountdownTrialRow()
    }
    .modifier(Panel())
    // VoiceOver reads it as one ("Ngắm bể, Đèn sáng, CO2 bật, quạt tắt, 2 giờ"), Bắt đầu and Sửa its actions.
    .modifier(OneElement(on: voiceOver, label: b.name + ", " + summary.replacingOccurrences(of: " · ", with: ", ")) {
      Task { await master.start() }
    } edit: { editing = true })
  }

  private func running(_ run: MasterRun) -> some View {
    TimelineView(.periodic(from: run.started, by: 1)) { context in
      VStack(alignment: .leading, spacing: 8) {
        // Side by side while both fit on one line; at the larger text the name on its own line, "Đang chạy" under it (the
        // board; the Design Lead, 15 Nov).
        let name = Text(verbatim: master.button?.name ?? MasterModel.defaultName).font(.title3.weight(.semibold))
        let state = Text("Đang chạy").font(.subheadline)
        ViewThatFits(in: .horizontal) {
          HStack(alignment: .firstTextBaseline) { name; Spacer(); state }
          VStack(alignment: .leading, spacing: 4) { name; state }
        }
        VStack(alignment: .leading, spacing: 0) {
          if let left = run.left(at: context.date) {
            Text("còn").font(.subheadline)
            Text(verbatim: Self.clock(left)).font(.system(size: size.isAccessibilitySize ? 64 : 44, weight: .semibold).monospacedDigit())
              .lineLimit(1).minimumScaleFactor(0.5)
              .accessibilityLabel(Self.spoken(left))
              .accessibilityIdentifier("master-left")
          } else {
            Text("từ").font(.subheadline)
            Text(verbatim: Self.time(run.started)).font(.system(size: size.isAccessibilitySize ? 64 : 44, weight: .semibold).monospacedDigit())
              .lineLimit(1).minimumScaleFactor(0.5)
              .accessibilityIdentifier("master-since")
          }
        }
        Text(verbatim: master.summary(run.steps) + " · " + (run.ends.map { String(localized: "kết thúc lúc \(Self.time($0))", bundle: .app) } ?? String(localized: "đến khi bạn bấm Kết thúc", bundle: .app)))
          .font(.subheadline).opacity(0.85)
          .accessibilityIdentifier("master-summary")
        Button { Task { await master.finish(byReader: true) } } label: { sendingOr(Text("Kết thúc"), colour: .accentColor) }
        .buttonStyle(Filled(fill: ink, words: .accentColor, keepsLook: master.sending))
        .disabled(master.sending)
        .accessibilityIdentifier("master-end")
        problems
      }
      .foregroundStyle(ink)
      .padding()
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color.accentColor, in: RoundedRectangle(cornerRadius: 12))
    }
  }

  /// "Trả lại", while something didn't come back.
  @ViewBuilder private var putBack: some View {
    if master.run?.pending.contains(where: { $0.problem != nil }) == true {
      Button { Task { await master.finish(byReader: true) } } label: { Text("Trả lại").frame(maxWidth: .infinity) }
        .buttonStyle(.bordered).controlSize(.large).disabled(master.sending)
        .accessibilityIdentifier("master-put-back")
    }
  }

  /// The tint's words: dark on mint in dark, white on green in light.
  private var ink: Color { scheme == .dark ? Color(red: 0, green: 0x24 / 255, blue: 0x1B / 255) : .white }

  /// The button's words, or "Đang gửi…" with a spinner while steps go out.
  @ViewBuilder private func sendingOr(_ words: Text, colour: Color) -> some View {
    if master.sending {
      // The spinner in the words' colour too: the button, disabled meanwhile, would grey it (the Design Lead, 15 Nov).
      HStack(spacing: 8) { ProgressView().tint(colour).environment(\.isEnabled, true); Text("Đang gửi…") }
    } else {
      words
    }
  }

  /// What didn't go, one line each, under the button: the steps that failed, then what hasn't come back.
  @ViewBuilder private var problems: some View {
    let all = master.refusal + (master.run?.failed.map(\.line) ?? []) + (master.run?.pending.compactMap(\.problem) ?? [])
    // Once each: several put-backs can share a line (the tanks not read).
    let lines = all.reduce(into: [String]()) { if !$0.contains($1) { $0.append($1) } }
    if !lines.isEmpty {
      VStack(alignment: .leading, spacing: 4) {
        ForEach(lines, id: \.self) { line in
          Label { Text(verbatim: line) } icon: { Image(systemName: "exclamationmark.triangle.fill") }
        }
      }
      .font(.footnote)
      .accessibilityElement(children: .combine)
      .accessibilityIdentifier("master-problems")
    }
  }

  /// "1 giờ", "2 giờ", or until Kết thúc.
  static func length(_ minutes: Int?) -> String {
    guard let m = minutes else { return String(localized: "đến khi bạn bấm Kết thúc", bundle: .app) }
    return m % 60 == 0 ? String(localized: "\(m / 60) giờ", bundle: .app) : String(localized: "\(m) phút", bundle: .app)
  }

  /// The time left as the card shows it: hours and minutes ("1:20"), the minute rounded up; the last minute by the second.
  static func clock(_ left: TimeInterval) -> String {
    let s = Int(left.rounded(.up))
    if s < 60 { return String(localized: "\(s) giây", bundle: .app) }
    let m = (s + 59) / 60
    return String(format: "%d:%02d", m / 60, m % 60)
  }

  /// VoiceOver's: "còn 1 giờ 20 phút".
  static func spoken(_ left: TimeInterval) -> String {
    let s = Int(left.rounded(.up))
    if s < 60 { return String(localized: "còn \(s) giây", bundle: .app) }
    let m = (s + 59) / 60
    if m < 60 { return String(localized: "còn \(m) phút", bundle: .app) }
    return m % 60 == 0 ? String(localized: "còn \(m / 60) giờ", bundle: .app) : String(localized: "còn \(m / 60) giờ \(m % 60) phút", bundle: .app)
  }

  /// "21:02", as Đèn writes times, whatever the phone's 12- or 24-hour setting.
  static func time(_ d: Date) -> String {
    let t = Calendar.current.dateComponents([.hour, .minute], from: d)
    return String(format: "%02d:%02d", t.hour ?? 0, t.minute ?? 0)
  }
}

/// The card's filled buttons, "Bắt đầu" and "Kết thúc": one colour on another, semibold, full width, 50 pt tall,
/// growing with the text. While steps go out the button takes no taps but keeps its colours, so "Đang gửi…" and its
/// spinner stay readable (the Design Lead, 15 Nov); disabled otherwise, it greys as iOS's do.
private struct Filled: ButtonStyle {
  let fill: Color
  let words: Color
  let keepsLook: Bool
  @Environment(\.isEnabled) private var enabled

  func makeBody(configuration: Configuration) -> some View {
    let greyed = !enabled && !keepsLook
    configuration.label
      .font(.headline)
      .multilineTextAlignment(.center)
      .foregroundStyle(greyed ? Color.secondary : words)
      .tint(greyed ? Color.secondary : words)
      .padding(.vertical, 12)
      .frame(maxWidth: .infinity, minHeight: 50)
      .background(greyed ? Color(.tertiarySystemFill) : fill, in: Capsule())
      .opacity(configuration.isPressed ? 0.8 : 1)
  }
}

/// The ready card as one VoiceOver element, with its buttons as actions; as it is otherwise.
private struct OneElement: ViewModifier {
  let on: Bool
  let label: String
  let start: () -> Void
  let edit: () -> Void

  func body(content: Content) -> some View {
    if on {
      content
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text(verbatim: label))
        .accessibilityAction(named: Text("Bắt đầu"), start)
        .accessibilityAction(named: Text("Sửa"), edit)
    } else {
      content
    }
  }
}

extension MasterModel {
  /// What the steps do, in a line: "Đèn sáng, CO2 bật, quạt tắt".
  func summary(_ steps: [DeviceCommand]) -> String {
    steps.enumerated().map { i, s in
      let said = s.isLamp ? (s.on ? String(localized: "Đèn sáng", bundle: .app) : String(localized: "Đèn tắt", bundle: .app))
        : (s.on ? String(localized: "\(switcher.name(s)) bật", bundle: .app) : String(localized: "\(switcher.name(s)) tắt", bundle: .app))
      return i == 0 ? said : Self.lowerFirst(said)
    }.joined(separator: ", ")
  }

  /// "Quạt tắt" → "quạt tắt" after the first; "CO2 bật" stays.
  static func lowerFirst(_ s: String) -> String {
    guard let f = s.first, let second = s.dropFirst().first, second.isLowercase || second == " " else { return s }
    return f.lowercased() + s.dropFirst()
  }

}
