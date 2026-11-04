import Plugs
import SwiftUI
import Tanks

/// The outlet the connected light is plugged into, and a warning when that outlet has a timer in Smart Life that cuts its
/// power: the light's clock then stops, so it can't run its own schedule (docs/smart-plugs.md). On the light's card under
/// its clock, only with Tuya keys on this phone and a Tuya plug on the light's tank. The reader picks the outlet (one
/// named for a light is offered first, never picked for them), or says the light isn't on one, which this phone keeps;
/// its timers are read once each time the card opens, never kept.
struct LightOutletFact: View {
  @Environment(LightsModel.self) private var lights
  @Environment(TanksModel.self) private var tanks
  @Environment(PlugsModel.self) private var plugs
  @State private var timers = OutletTimers()
  /// The lights (their record ids, a line each) the reader said aren't on a smart plug: asked no more, on this phone only.
  @AppStorage("lights.notOnPlug") private var notOnPlug = ""

  var body: some View {
    if plugs.dataCenter != nil, let light = lights.device {
      let offered = tanks.store.outlets(for: light)
      if let picked = tanks.store.powerOutlet(of: light) {
        let title = name(picked)
        if case .read(let cutting)? = timers.state, !cutting.isEmpty {
          OutletFact(icon: "exclamationmark.triangle", warn: true) {
            Text("Ổ “\(title)” tự tắt lúc \(cutting.map(when).joined(separator: "; ")). Mất điện là đèn mất giờ nên không tự bật theo lịch của nó. Tắt hẹn giờ của ổ trong Smart Life để đèn tự chạy lịch.")
              .accessibilityIdentifier("outlet-warning")
          }
        }
        OutletFact(icon: "powerplug") {
          Text("Cắm vào ổ “\(title)” (\(picked.plug.nickname ?? String(localized: "Ổ cắm"))).").accessibilityIdentifier("light-outlet")
          if case .read(let cutting)? = timers.state, cutting.isEmpty {
            Text("Không thấy hẹn giờ tắt nào của ổ này trong Smart Life.").font(.footnote).foregroundStyle(.secondary)
              .accessibilityIdentifier("outlet-timers")
          } else if case .failed(let e)? = timers.state {
            Text("Chưa đọc được hẹn giờ của ổ: \(PlugProblem.text(e))").font(.footnote).foregroundStyle(.secondary)
              .accessibilityIdentifier("outlet-timers")
          }
          // A link's colour: the line's own colour would draw it as plain text.
          menu(offered, light, picked: true) { Text("Đổi ổ") }
            .buttonStyle(.borderless).font(.footnote).foregroundStyle(Color.accentColor)
            .frame(minHeight: 44).contentShape(Rectangle())
        }
        .task(id: "\(plugs.owner ?? "")|\(picked.id)") {
          await timers.open(plugs.current, provider: picked.plug.brand ?? "", device: picked.plug.remoteId ?? "", code: picked.outlet.code, at: Date())
        }
      } else if !offered.isEmpty {
        if notOnPlug.split(separator: "\n").contains(Substring(light.id)) {
          // Said not to be on one: only a quiet way to pick after all.
          menu(offered, light, picked: false) { Text("Chọn ổ cắm của đèn") }
            .buttonStyle(.borderless).font(.footnote).foregroundStyle(.secondary)
            .frame(minHeight: 44).contentShape(Rectangle())
        } else {
          OutletFact(icon: "powerplug") {
            Text("Đèn cắm vào ổ nào?").accessibilityIdentifier("outlet-question")
            Text("Chọn ổ để AquaTome xem hẹn giờ của ổ có cắt điện đèn không.").font(.footnote).foregroundStyle(.secondary)
            menu(offered, light, picked: false, asksIfOnOne: true) { Text("Chọn ổ") }
              .buttonStyle(.bordered).controlSize(.large).tint(.primary).font(.subheadline)
          }
        }
      }
    }
  }

  /// The tank's outlets, the one named for a light first and marked; the light's record keeps the one tapped. Then
  /// taking the pick back, or saying the light isn't on a smart plug.
  private func menu(_ offered: [TankOutlet], _ light: Device, picked: Bool, asksIfOnOne: Bool = false,
                    @ViewBuilder label: () -> some View) -> some View {
    let suggested = picked ? nil : tanks.store.suggestedOutlet(for: light)
    let ordered = suggested.map { s in [s] + offered.filter { $0 != s } } ?? offered
    return Menu {
      ForEach(ordered) { o in
        let item = "\(name(o)) · \(o.plug.nickname ?? String(localized: "Ổ cắm"))"
        Button(o == suggested ? String(localized: "\(item) (gợi ý)") : item) { pick(o.pick, light) }
      }
      if picked { Button("Bỏ chọn ổ", role: .destructive) { pick(nil, light) } }
      if asksIfOnOne { Button("Đèn không cắm ổ cắm Smart Life") { notOnPlug = (lines + [light.id]).joined(separator: "\n") } }
    } label: {
      label()
    }
    .menuStyle(.button)
    .accessibilityIdentifier("pick-outlet")
  }

  private var lines: [String] { notOnPlug.split(separator: "\n").map(String.init) }

  private func name(_ o: TankOutlet) -> String {
    let live = plugs.board.list?.plug(provider: o.plug.brand ?? "", id: o.plug.remoteId ?? "")?.outlets.first { $0.code == o.outlet.code }
    return o.outlet.title(number: o.number, live: live?.name)
  }

  /// Kept on the light's record; an outlet picked undoes "not on a smart plug" on this phone.
  private func pick(_ o: PowerOutlet?, _ light: Device) {
    guard let name = light.bleName, let model = lights.model else { return }
    tanks.changeLight(bleName: name, model: model.name) { $0.powerOutlet = o }
    if o != nil { notOnPlug = lines.filter { $0 != light.id }.joined(separator: "\n") }
  }

  /// "00:00 mỗi ngày", "21:00 vào Thứ Bảy, Chủ Nhật", "12:00 ngày 5/11/2026": the time as the plug keeps it, with its zone
  /// when that isn't the phone's ("00:00 mỗi ngày (giờ Asia/Tokyo)").
  private func when(_ t: PlugTimer) -> String {
    let at: String
    if t.everyDay {
      at = String(localized: "\(t.time) mỗi ngày")
    } else if t.once {
      at = t.date.map { String(localized: "\(t.time) ngày \(day($0))") } ?? t.time
    } else {
      // The days' names in the app's language, Monday first.
      var calendar = Calendar(identifier: .gregorian)
      calendar.locale = Locale(identifier: Bundle.main.preferredLocalizations.first ?? "vi")
      let names = calendar.standaloneWeekdaySymbols
      at = String(localized: "\(t.time) vào \([1, 2, 3, 4, 5, 6, 0].filter { t.days[$0] }.map { names[$0] }.joined(separator: ", "))")
    }
    guard let zone = t.timezone, t.zoneDiffers(from: .current, at: Date()) else { return at }
    return String(localized: "\(at) (giờ \(zone))")
  }

  /// Tuya's "20261105" as the reader's language writes a day; as it is when it isn't one.
  private func day(_ s: String) -> String {
    guard s.count == 8, s.allSatisfy(\.isASCII), let y = Int(s.prefix(4)), let m = Int(s.dropFirst(4).prefix(2)), let d = Int(s.suffix(2)),
          let date = Calendar(identifier: .gregorian).date(from: DateComponents(year: y, month: m, day: d)) else { return s }
    return date.formatted(.dateTime.day().month(.defaultDigits).year())
  }
}

/// A line of the light's card, drawn as its other facts are (LightsView's `Fact`): an icon, then what it says.
private struct OutletFact<Content: View>: View {
  let icon: String
  var warn = false
  @ViewBuilder let content: Content

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 8) {
      Image(systemName: icon).foregroundStyle(warn ? Color.warning : Color.accentColor).accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 6) { content }
    }
    .font(.subheadline)
    .foregroundStyle(warn ? Color.warning : .primary)
  }
}
