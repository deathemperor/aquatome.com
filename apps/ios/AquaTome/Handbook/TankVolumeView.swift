import Handbook
import SwiftUI
import Tanks

/// The tank volume tool on a tab's stack (AppScreen.tankVolume), with the state its link gives, if any.
struct VolumeTool: Hashable {
  var query: String?
}

/// The tank volume tool, as the site's page (/vi/cong-cu/the-tich-be/): 12 shapes, cm or inches, the litres, gallons,
/// water and glass, "Lưu vào Bể của tôi" and the ready-made tanks. The numbers are the site's
/// (AquaTomeKit Tanks/Volume.swift, protocols/volume-vectors.json). Only the controls are views: what it works out and
/// the page's text are styled text with links, as NativePage draws a page (a view per part cost this app 90 kB).
struct TankVolumeView: View {
  let query: String?
  @Environment(HandbookModel.self) private var handbook
  @Environment(TanksModel.self) private var tanks
  @Environment(\.openScreen) private var openScreen
  /// The site's choice of unit ("metric", "imperial"), remembered as its pages remember it.
  @AppStorage("units") private var units = "metric"
  @State private var form = VolumeForm()
  @State private var started = false
  /// A page of the site the app doesn't draw (the heater calculator).
  @State private var web: URL?
  /// The tank to save to; nil for a new one.
  @State private var target: String?
  @State private var name = ""
  /// What the last save did, with the way to the tank.
  @State private var said: AttributedString?
  /// A shape's button, wide enough for its name at the reader's text size.
  @ScaledMetric(relativeTo: .caption) private var shapeWidth: CGFloat = 84
  /// What it works out, to be said to VoiceOver once typing stops.
  @State private var speak: Task<Void, Never>?

  var body: some View {
    ScrollViewReader { scroll in
      // Each part type-erased: one nested type for the whole form cost this screen 9 kB of type names alone.
      Form {
        AnyView(Section("Kiểu bể (nhìn từ trên xuống, mặt áp tường ở trên)") {
          // One row, so the sizes and the litres are on the first screen.
          ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) { ForEach(TankShape.allCases, id: \.self) { shapeButton($0).id($0) } }
          }
          .accessibilityIdentifier("shapes")
          .id("top")
        })
        AnyView(sizes)
        AnyView(Section { Text(result).accessibilityIdentifier("result") })
        if case .success(let w) = form.outcome, let put = w.save, tanks.canEdit { AnyView(save(w, put)) }
        AnyView(Section { Text(page) })
      }
      .scrollDismissesKeyboard(.interactively)
      // A link's shape late in the row (the site shows all 12 at once): the row brought to it.
      .onChange(of: form.shape) { withAnimation { scroll.scrollTo(form.shape, anchor: .center) } }
      // Links in the text: a ready-made tank sets the form, the tank saved opens its tab, the heater calculator its page.
      .environment(\.openURL, OpenURLAction { url in
        switch AppScreen.of(url, site: handbook.site) {
        case .tankVolume(let q)?:
          form = q.map { VolumeForm(query: $0, inches: form.inches) } ?? VolumeForm(inches: form.inches)
          withAnimation { scroll.scrollTo("top", anchor: .top) }
        case let screen?: openScreen(screen)
        case nil: web = url
        }
        return .handled
      })
    }
    .navigationTitle("Bể bao nhiêu lít?")
    .navigationDestination(item: $web) { WebScreen(url: $0) }
    .onAppear {
      guard !started else { return }
      started = true
      form = query.map { VolumeForm(query: $0, inches: units == "imperial") } ?? VolumeForm(inches: units == "imperial")
    }
    // The tool changed: what was saved is no longer what it shows. What it now works out is said to VoiceOver a moment
    // after the typing stops, as the site's result is read (aria-live): its first line, the litres or what's wrong.
    .onChange(of: form) {
      said = nil
      speak?.cancel()
      speak = Task {
        try? await Task.sleep(for: .seconds(1))
        guard !Task.isCancelled, let first = String(result.characters).split(separator: "\n").first else { return }
        AccessibilityNotification.Announcement(String(first)).post()
      }
    }
    // The tank picked to save to, deleted on the tanks tab meanwhile: a new one, as the site's picker resets.
    .onChange(of: tanks.tanks.map(\.id)) { _, ids in if let t = target, !ids.contains(t) { target = nil } }
  }

  private var sizes: some View {
    Section {
      Picker("Đơn vị", selection: Binding(get: { form.inches }, set: { form.setInches($0); units = $0 ? "imperial" : "metric" })) {
        Text(verbatim: "cm").tag(false)
        Text(verbatim: "inch").tag(true)
      }
      .pickerStyle(.segmented)
      ForEach(form.shape.fields + ["fill"], id: \.self) { key in
        LabeledContent(label(key)) {
          TextField(label(key), text: key == "fill" ? $form.fill : Binding(get: { form.sizes[key] ?? "" }, set: { form.sizes[key] = $0 }),
                    prompt: key == "fill" ? Text("đầy bể") : nil)
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .accessibilityIdentifier(key)
        }
      }
    }
  }

  /// "Lưu vào Bể của tôi", as the site's tools save (scripts/save-to-tank.ts).
  private func save(_ w: Worked, _ put: Worked.Save) -> some View {
    Section {
      Picker("Lưu vào Bể của tôi", selection: $target) {
        Text("Bể mới").tag(String?.none)
        ForEach(tanks.tanks) { Text($0.name).tag(Optional($0.id)) }
      }
      if target == nil {
        TextField("Tên bể", text: $name, prompt: Text(defaultName(w, put))).accessibilityIdentifier("tank-name")
          .capped($name, to: TankFields.nameMax)
      }
      Button("Lưu") { save(w, put) }.accessibilityIdentifier("save-volume")
      if let said { Text(said).accessibilityIdentifier("saved") }
    }
  }

  private func shapeButton(_ s: TankShape) -> some View {
    Button { form.shape = s } label: {
      VStack(spacing: 4) {
        ShapeIcon(shape: s).stroke(lineWidth: 2).frame(width: 60, height: 40)
        Text(shapeName(s)).font(.caption).lineLimit(2, reservesSpace: true).multilineTextAlignment(.center)
      }
      .frame(width: shapeWidth)
      .padding(.vertical, 6)
      .background(form.shape == s ? AnyShapeStyle(.fill.secondary) : AnyShapeStyle(.clear), in: .rect(cornerRadius: 10))
    }
    .buttonStyle(.plain)
    .accessibilityAddTraits(form.shape == s ? .isSelected : [])
    .accessibilityIdentifier("shape")
  }

  // MARK: What it works out, as text

  private var result: AttributedString {
    switch form.outcome {
    case .failure(.missing(let key)): return line(AttributedString(localized: "Nhập \(label(key).lowercased())."), .secondary)
    case .failure(.tooLong(let pane, let side)): return line(AttributedString(localized: "\(label(pane)) phải ngắn hơn \(than(side))."), Color.warning)
    case .failure(.fill): return line(AttributedString(localized: "Mực nước phải lớn hơn 0 và không cao hơn bể."), Color.warning)
    case .success(let w):
      var big = AttributedString(localized: "\(number(w.volume.litres, 1)) lít")
      big.font = .largeTitle.bold()
      var text = big + AttributedString(" ") + line(AttributedString(localized: "(\(number(w.volume.gallons, 1)) gallon Mỹ)"), .secondary)
      if let f = w.volume.filled { text += "\n" + AttributedString(localized: "Tới mực nước: **\(number(f, 1)) lít**.") }
      let water = number(w.water, 0)
      text += "\n" + AttributedString(localized: "Nước thực tế sau khi trải nền, đặt đá lũa: khoảng **\(water) lít** (\(water) kg nước).")
      if let g = w.glass {
        if let order = g.order, let kg = w.glassKg {
          text += "\n" + AttributedString(localized: "Kính trước tối thiểu \(number(g.min, 1)) mm → đặt kính **\(order) mm**, kính nặng khoảng \(number(kg, 0)) kg.")
        } else {
          text += "\n" + line(AttributedString(localized: "Kính cần dày hơn 19 mm (tối thiểu \(number(g.min, 1)) mm): bể cỡ này cần kính dán nhiều lớp hoặc giằng, nên để thợ tính."), Color.warning)
        }
      }
      if let path = w.heaterPath(tools: handbook.language.path("cong-cu")) {
        text += "\n" + link(AttributedString(localized: "Cần sưởi bao nhiêu W cho bể này →"), path)
      }
      return text
    }
  }

  /// The page's note and its ready-made tanks, as the app draws a table: the first cell, then each other under its
  /// heading. (Its questions, for search engines, restate what the tool shows: left out, for the app's size.)
  private var page: AttributedString {
    var text = line(AttributedString(localized: "Đo lòng bể (trừ độ dày kính). Lượng nước thực tế tính bằng \(number(TankVolume.waterShare * 100, 0) + "%") thể tích, sau khi trải nền, đặt đá lũa và chừa mép trên. Độ dày kính tính cho kính thường (kính nổi, không phải kính cường lực), hệ số an toàn 3,8, chỉ áp dụng cho bể hộp; bể đặt làm nên hỏi thêm thợ."), .secondary)
    text += "\n\n" + heading(AttributedString(localized: "Bể bán sẵn: bao nhiêu lít, kính bao nhiêu mm"))
    text += "\n" + line(AttributedString(localized: "Dài × rộng × cao (cm)"), .secondary)
    let head = [String(localized: "Thể tích (lít)"), String(localized: "Nước thực tế (lít)"), String(localized: "Kính (mm)"), String(localized: "Nặng khi đầy (kg)")]
    for r in TankVolume.readyMade {
      var size = link(AttributedString("\(Int(r.l)) × \(Int(r.w)) × \(Int(r.h))"), "/vi/cong-cu/the-tich-be/?hinh=chu-nhat&l=\(Int(r.l))&w=\(Int(r.w))&h=\(Int(r.h))")
      size.font = .body.bold()
      let cells = [number(r.litres, 0), "~" + number(r.water, 0), "\(r.glass)", "~" + number(TankVolume.nearest5(r.kg), 0)]
      text += "\n\n" + size + "\n"
      for i in head.indices { text += AttributedString((i > 0 ? " · " : "") + head[i] + ": " + cells[i]) }
    }
    text += "\n\n" + line(AttributedString(localized: "Cân nặng gồm nước, kính và khoảng \("15%") thể tích là nền (cát, phân nền), chưa tính tủ. Bể từ 100 lít nên đặt trên tủ chuyên dụng, sàn chịu lực."), .secondary)
    return text
  }

  private func line(_ s: AttributedString, _ colour: Color) -> AttributedString {
    var s = s
    s.foregroundColor = colour
    return s
  }

  private func heading(_ s: AttributedString) -> AttributedString {
    var s = s
    s.font = .title3.bold()
    return s
  }

  /// A link to a path of the site.
  private func link(_ s: AttributedString, _ path: String) -> AttributedString {
    var s = s
    s.link = URL(string: path, relativeTo: handbook.site)?.absoluteURL
    return s
  }

  // MARK: Saving

  private func save(_ w: Worked, _ put: Worked.Save) {
    let change = { (t: inout Tank) in
      switch put {
      case let .dims(l, w, h): t.dims = (l, w, h); t.litres = nil
      case .litres(let x): t.litres = x; t.dims = nil
      }
    }
    do {
      let tank: Tank
      if let id = target, let kept = tanks.tanks.first(where: { $0.id == id }) {
        try tanks.change(id, change)
        tank = kept
      } else if tanks.tanks.count >= maxTanks {
        said = line(AttributedString(localized: "Đã đủ 50 bể: xóa bớt bể cũ để thêm."), Color.warning)
        return
      } else {
        let typed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        tank = try tanks.add(named: typed.isEmpty ? defaultName(w, put) : typed, change)
        target = tank.id
        name = ""
      }
      said = AttributedString(localized: "Đã lưu vào “\(tank.name)”.") + " "
        + link(AttributedString(localized: "Xem trong Bể của tôi →"), "/vi/cong-cu/be-cua-toi/#be-\(tank.id)")
    } catch {
      said = line(AttributedString(localized: "Chưa lưu được thay đổi. Thử lại."), Color.warning)
    }
  }

  /// A new tank's name when none is typed: a box by its sides, any other shape by its name and litres.
  private func defaultName(_ w: Worked, _ put: Worked.Save) -> String {
    if case let .dims(l, wd, h) = put { return String(localized: "Bể \(number(l, 1)) × \(number(wd, 1)) × \(number(h, 1))") }
    return String(localized: "\(shapeName(w.shape)), \(number(w.volume.litres, 1)) lít")
  }

  // MARK: Words

  /// A number as the site's pages write it: at most `digits` decimals, halves up, in the reader's language.
  private func number(_ x: Double, _ digits: Int) -> String {
    x.formatted(.number.precision(.fractionLength(0...digits)).rounded(rule: .toNearestOrAwayFromZero))
  }

  private func shapeName(_ s: TankShape) -> String {
    switch s {
    case .box: String(localized: "Chữ nhật")
    case .cube: String(localized: "Lập phương")
    case .hexagon: String(localized: "Lục giác")
    case .octagon: String(localized: "Bát giác")
    case .flatBackHexagon: String(localized: "Lục giác lưng phẳng")
    case .cylinder: String(localized: "Trụ tròn")
    case .halfCylinder: String(localized: "Nửa trụ")
    case .quarterCircle: String(localized: "Góc ¼ tròn")
    case .ellipse: String(localized: "Elip")
    case .cornerPentagon: String(localized: "Ngũ giác góc")
    case .lShape: String(localized: "Chữ L")
    case .cornerTriangle: String(localized: "Tam giác góc")
    }
  }

  /// A size's box, by its key in this shape.
  private func label(_ key: String) -> String {
    switch (key, form.shape) {
    case ("l", .cube): String(localized: "Cạnh")
    case ("l", _): String(localized: "Dài")
    case ("w", _): String(localized: "Rộng")
    case ("h", _): String(localized: "Cao")
    case ("f", _): String(localized: "Kính trước")
    case ("e", _): String(localized: "Kính hông")
    case ("d", .halfCylinder): String(localized: "Dài (lưng phẳng)")
    case ("d", _): String(localized: "Đường kính")
    case ("r", _), ("a", .cornerPentagon): String(localized: "Cạnh áp tường")
    case ("a", _): String(localized: "Cạnh 1")
    case ("b", .cornerPentagon): String(localized: "Cạnh ngắn")
    case ("b", _): String(localized: "Cạnh 2")
    case ("l1", _): String(localized: "Dài nhánh 1")
    case ("w1", _): String(localized: "Rộng nhánh 1")
    case ("l2", _): String(localized: "Dài nhánh 2")
    case ("w2", _): String(localized: "Rộng nhánh 2")
    default: String(localized: "Mực nước (không bắt buộc)")
    }
  }

  /// The side a pane must be shorter than, as the site's refusal names it.
  private func than(_ key: String) -> String {
    switch key {
    case "l": String(localized: "chiều dài")
    case "w": String(localized: "chiều rộng")
    case "a": String(localized: "cạnh áp tường")
    case "l1": String(localized: "dài nhánh 1")
    default: String(localized: "dài nhánh 2")
    }
  }
}

/// A shape seen from above, the wall side at the top, as the site's page draws it (a 60 × 40 box).
private struct ShapeIcon: Shape {
  let shape: TankShape

  func path(in rect: CGRect) -> Path {
    var p = Path()
    switch shape {
    case .box: p.addRect(CGRect(x: 6, y: 8, width: 48, height: 24))
    case .cube: p.addRect(CGRect(x: 14, y: 4, width: 32, height: 32))
    case .cylinder: p.addEllipse(in: CGRect(x: 15, y: 5, width: 30, height: 30))
    case .ellipse: p.addEllipse(in: CGRect(x: 6, y: 7, width: 48, height: 26))
    case .halfCylinder:
      p.move(to: CGPoint(x: 8, y: 8))
      p.addArc(center: CGPoint(x: 30, y: 8), radius: 22, startAngle: .zero, endAngle: .degrees(180), clockwise: false)
    case .quarterCircle:
      p.move(to: CGPoint(x: 12, y: 5))
      p.addArc(center: CGPoint(x: 12, y: 5), radius: 30, startAngle: .zero, endAngle: .degrees(90), clockwise: false)
    default:
      let xy: [CGFloat] = switch shape {
      case .hexagon: [4, 20, 16, 6, 44, 6, 56, 20, 44, 34, 16, 34]
      case .octagon: [16, 6, 44, 6, 54, 14, 54, 26, 44, 34, 16, 34, 6, 26, 6, 14]
      case .flatBackHexagon: [6, 6, 54, 6, 54, 18, 44, 34, 16, 34, 6, 18]
      case .cornerPentagon: [12, 5, 42, 5, 42, 16, 23, 35, 12, 35]
      case .lShape: [6, 6, 54, 6, 54, 18, 20, 18, 20, 36, 6, 36]
      default: [12, 5, 50, 5, 12, 35]
      }
      p.addLines(stride(from: 0, to: xy.count, by: 2).map { CGPoint(x: xy[$0], y: xy[$0 + 1]) })
    }
    p.closeSubpath()
    return p.applying(CGAffineTransform(translationX: rect.minX, y: rect.minY).scaledBy(x: rect.width / 60, y: rect.height / 40))
  }
}
