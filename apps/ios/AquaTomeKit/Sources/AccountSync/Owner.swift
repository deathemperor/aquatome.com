import Foundation

/// The owner's dashboard (protocols/owner-dashboard.openapi.json): the site's /_ab/ pages as JSON, for the app to draw
/// itself. The server drives it, so it is read leniently: a block of a kind this app doesn't know is skipped, so is a
/// field it doesn't know, and a part missing what it needs is left out, never the whole reply. Text comes written in
/// Vietnamese, numbers and days formatted, and is shown as it comes. Read by hand from JSONSerialization's dictionaries,
/// with no Codable or synthesized conformances: every reader downloads this code, and only the owner runs it.
public enum Owner {
  /// What a text, a cell, a note or a button means: plain; muted (secondary, or an empty state); good; bad (needs the
  /// owner, failed, worse, or a button that deletes). A tone this app doesn't know is plain.
  public enum Tone: String, Sendable { case plain, muted, good, bad }

  /// Where a line goes: a section of the dashboard (scrolled to the heading `anchor` names), an address to open in the
  /// browser, or a page of the site (from "/").
  public enum Destination: Sendable {
    case section(String, anchor: String?)
    /// From "https://".
    case url(String)
    case page(String)
  }

  /// A line that may go somewhere: a to-do (with its button's label), a "Mấy ngày qua" line, a section of the overview's
  /// list, a table's cell. `text`: its second line.
  public struct Link: Sendable {
    public let title: String
    public let text: String?
    public let label: String?
    public let tone: Tone
    public let to: Destination?

    public init(title: String, text: String? = nil, label: String? = nil, tone: Tone = .plain, to: Destination? = nil) {
      self.title = title
      self.text = text
      self.label = label
      self.tone = tone
      self.to = to
    }
  }

  public struct Dashboard: Sendable {
    public let tz: String
    public let todos: [Link]
    /// Each area's card: its figure, the chip (`delta`), its last 30 days (`spark`), the section it opens.
    public let areas: [Figure]
    /// Under the areas: what their figures and chips compare.
    public let areasNote: String?
    /// "Mấy ngày qua": what happened each day, newest first, as the day is written (`at`); a quiet day one muted line.
    public let log: (title: String, days: [(at: String, entries: [Link])])?
    /// Every section, as links to them.
    public let sections: [Link]

    /// A section's name, as the dashboard lists it.
    public func name(of key: String) -> String? {
      sections.first { if case .section(key, _)? = $0.to { true } else { false } }?.title
    }
  }

  /// A chip, or a figure's change: "+18%", what it means, and what it compares with (for VoiceOver).
  public final class Chip: Sendable {
    public let text: String
    public let tone: Tone
    public let vs: String

    init(text: String, tone: Tone, vs: String) {
      self.text = text
      self.tone = tone
      self.vs = vs
    }
  }

  public struct Section: Sendable {
    public let tz: String
    public let title: String
    public let blocks: [Block]
  }

  public enum Block: Sendable {
    /// 2: a part of the section; 3: a part within it. `anchor`: the name a link opens the section at it by.
    case heading(String, level: Int, anchor: String?)
    /// KPI tiles, and the overview's area cards.
    case figures([Figure])
    case chart(Chart)
    case table(Table)
    case note(String, Tone)
    /// Photos, or (`hidden`) the pages taken off the site, each with its buttons; `empty` when there are none.
    case cards([Card], empty: String?, hidden: Bool)
    /// The overview's lines (the app's own: no reply has this kind).
    case link(Link)
    /// Fields sent as a button's request is (hiding a page).
    case form(Form)
    /// Between two forms of the section (the app's test builds or readers'): `on` or off; flipping it reads the section
    /// from `href`.
    case toggle(String, on: Bool, href: String)
  }

  public final class Form: Sendable {
    public let method: String
    public let path: String
    public let fields: [Field]
    /// Sent with the fields' values, as it is: JSON text.
    public let body: String?
    /// The button's label.
    public let submit: String

    init(method: String, path: String, fields: [Field], body: String?, submit: String) {
      self.method = method
      self.path = path
      self.fields = fields
      self.body = body
      self.submit = submit
    }

    /// The request, with the fields' values (trimmed; an empty one left out) and `body` as one JSON object; nil while a
    /// field it needs is empty.
    public func action(_ values: [String: String]) -> Action? {
      var o = (body.flatMap { try? JSONSerialization.jsonObject(with: Data($0.utf8)) } as? Dict) ?? [:]
      for f in fields {
        let v = values[f.name, default: ""].trimmingCharacters(in: .whitespacesAndNewlines)
        if v.isEmpty { if f.required { return nil } } else { o[f.name] = v }
      }
      return Action(label: submit, method: method, path: path, body: o)
    }
  }

  public final class Field: Sendable {
    public let name: String
    public let label: String
    /// Several lines.
    public let multiline: Bool
    public let required: Bool
    public let placeholder: String?

    init(name: String, label: String, multiline: Bool, required: Bool, placeholder: String?) {
      self.name = name
      self.label = label
      self.multiline = multiline
      self.required = required
      self.placeholder = placeholder
    }
  }

  public final class Figure: Sendable {
    public let label: String
    public let value: String
    public let sub: String?
    public let delta: Chip?
    /// A share of a whole, 0 to 1, drawn as a thin bar under the figure.
    public let meter: Double?
    /// An area's 30 whole days before today, oldest first: the last 7 the figure's, the 7 before them the chip's
    /// comparison; nil a day not recorded.
    public let spark: [Double?]
    /// Marked as needing a look.
    public let warn: Bool
    public let to: Destination?

    init(label: String, value: String, sub: String?, delta: Chip?, meter: Double?, spark: [Double?], warn: Bool, to: Destination?) {
      self.label = label
      self.value = value
      self.sub = sub
      self.delta = delta
      self.meter = meter
      self.spark = spark
      self.warn = warn
      self.to = to
    }
  }

  /// Columns over days, as the site's charts (apps/site/worker/admin/chart.ts): stacked from the baseline in the series'
  /// order, a negative value below it, `whole` a pale column behind them.
  public final class Chart: Sendable {
    public let title: String
    /// yyyy-mm-dd, oldest first.
    public let days: [String]
    public let series: [Series]
    public let whole: Series?
    /// "usd": dollars. nil: counts.
    public let unit: String?
    /// The last day is today, not over yet: drawn lighter.
    public let partialLast: Bool
    /// What to say when every value is 0 or missing.
    public let empty: String?
    /// Why a day without a value has none.
    public let missing: String?

    init(title: String, days: [String], series: [Series], whole: Series?, unit: String?, partialLast: Bool, empty: String?, missing: String?) {
      self.title = title
      self.days = days
      self.series = series
      self.whole = whole
      self.unit = unit
      self.partialLast = partialLast
      self.empty = empty
      self.missing = missing
    }

    /// Every value 0 or not recorded: nothing to draw.
    public var isEmpty: Bool { (series + [whole].compactMap { $0 }).allSatisfy { $0.values.allSatisfy { ($0 ?? 0) == 0 } } }
  }

  public final class Series: Sendable {
    public let label: String
    /// One a day; nil: the day wasn't recorded.
    public let values: [Double?]
    /// "s1", "s2", "s3", "bad" (the status colour) or "mute" (context only); nil: s1, s2, s3 by position.
    public let tone: String?

    init(label: String, values: [Double?], tone: String?) {
      self.label = label
      self.values = values
      self.tone = tone
    }
  }

  public final class Table: Sendable {
    public let columns: [String]
    /// A cell a column (`text`: its second line; `to`: the site's page it links to); the first names the row.
    public let rows: [[Link]]
    /// What to show when there are no rows.
    public let empty: String?
    /// Drawn closed, opened by this label.
    public let folded: String?

    init(columns: [String], rows: [[Link]], empty: String?, folded: String?) {
      self.columns = columns
      self.rows = rows
      self.empty = empty
      self.folded = folded
    }
  }

  /// A photo (its caption, the lines under it, `src`: from "/" private, fetched with the bearer, else public), or a hidden
  /// page (its path, why, since when), with its buttons.
  public final class Card: Sendable {
    public let title: String
    public let lines: [String]
    public let src: String?
    public let actions: [Action]

    init(title: String, lines: [String], src: String?, actions: [Action]) {
      self.title = title
      self.lines = lines
      self.src = src
      self.actions = actions
    }
  }

  /// A button: the request it makes, sent as it is (OwnerClient.run).
  public struct Action: Sendable {
    public let label: String
    public let method: String
    public let path: String
    /// Sent as it is: JSON text.
    public let body: String?
    public let tone: Tone

    public init(label: String, method: String, path: String, body: [String: Any]? = nil, tone: Tone = .plain) {
      self.init(label: label, method: method, path: path, json: body.flatMap(Owner.text), tone: tone)
    }

    init(label: String, method: String, path: String, json: String?, tone: Tone) {
      self.label = label
      self.method = method
      self.path = path
      self.body = json
      self.tone = tone
    }

    /// Asks before it's sent: it deletes something.
    public var asks: Bool { tone == .bad }
  }

  /// How the site writes a chart's numbers (chart.ts `fmt` and `usd`): vi-VN grouping, whole counts; money with a "$",
  /// two places, four below a cent.
  public static func number(_ n: Double, unit: String?) -> String {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "vi_VN")
    f.numberStyle = .decimal
    f.roundingMode = .halfUp
    let places = unit != "usd" ? 0 : n != 0 && abs(n) < 0.01 ? 4 : 2
    f.minimumFractionDigits = places
    f.maximumFractionDigits = places
    let s = f.string(from: n as NSNumber) ?? ""
    return unit == "usd" ? "$" + s : s
  }

  /// A chart's day as the site labels it: 2026-11-02 → 02/11.
  public static func dayLabel(_ day: String) -> String {
    day.count == 10 ? "\(day.suffix(2))/\(day.dropFirst(5).prefix(2))" : day
  }

  /// A section key as the dashboard lists them: only these characters, so it is one path segment.
  static func isKey(_ s: String) -> Bool { !s.isEmpty && s.allSatisfy { ("a"..."z").contains($0) || ("0"..."9").contains($0) || $0 == "-" } }

  /// A path on the site ("/ca/x/"), not another host ("//host/x").
  static func isSitePath(_ s: String) -> Bool { s.hasPrefix("/") && !s.hasPrefix("//") }

  static func text(_ o: [String: Any]) -> String? {
    (try? JSONSerialization.data(withJSONObject: o, options: [.sortedKeys, .withoutEscapingSlashes])).map { String(decoding: $0, as: UTF8.self) }
  }
}

// MARK: Reading

typealias Dict = [String: Any]

// One accessor a type, in place of a cast at each use: less code.
private func str(_ o: Dict, _ k: String) -> String? { o[k] as? String }
private func flag(_ o: Dict, _ k: String) -> Bool? { o[k] as? Bool }
private func obj(_ o: Dict, _ k: String) -> Dict? { o[k] as? Dict }
private func strs(_ o: Dict, _ k: String) -> [String] { o[k] as? [String] ?? [] }
private func num(_ o: Dict, _ k: String) -> Double? { (o[k] as? NSNumber)?.doubleValue }
private func list(_ o: Dict, _ k: String) -> [Dict] { (o[k] as? [Any] ?? []).compactMap { $0 as? Dict } }
private func tone(_ o: Dict) -> Owner.Tone { (str(o, "tone")).flatMap(Owner.Tone.init) ?? .plain }
/// Numbers, a day not recorded (null, or anything else) nil.
private func values(_ v: Any?) -> [Double?] { (v as? [Any] ?? []).map { ($0 as? NSNumber)?.doubleValue } }
private func chip(_ v: Any?) -> Owner.Chip? {
  guard let c = v as? Dict, let text = str(c, "text") else { return nil }
  return Owner.Chip(text: text, tone: tone(c), vs: str(c, "vs") ?? "")
}

private func destination(_ o: Dict) -> Owner.Destination? {
  if let key = str(o, "section"), Owner.isKey(key) { return .section(key, anchor: (str(o, "anchor")).flatMap { Owner.isKey($0) ? $0 : nil }) }
  if let s = str(o, "url"), s.hasPrefix("https://") { return .url(s) }
  return nil
}

/// A path a button, a form or a switch sends the account's session to: on the owner's API (under `under`), as the
/// contract has them; nil for any other, and the part is left out.
private func ownerPath(_ v: Any?, under: String = "/api/owner/") -> String? {
  guard let p = v as? String, p.hasPrefix(under), !p.contains("//"), !p.contains("..") else { return nil }
  return p
}

/// A part's buttons.
private func actions(_ o: Dict) -> [Owner.Action] {
  list(o, "actions").compactMap { a in
    guard let label = str(a, "label"), let method = str(a, "method"), method == "POST" || method == "DELETE",
          let path = ownerPath(a["path"]) else { return nil }
    return Owner.Action(label: label, method: method, path: path, json: (obj(a, "body")).flatMap(Owner.text), tone: tone(a))
  }
}

extension Owner.Dashboard {
  init(_ o: Dict) {
    tz = str(o, "tz") ?? ""
    todos = list(o, "todos").compactMap { t in
      guard let title = str(t, "title"), let text = str(t, "text") else { return nil }
      let a = obj(t, "action") ?? [:]
      return Owner.Link(title: title, text: text, label: str(a, "label"), to: destination(a))
    }
    areas = list(o, "areas").compactMap { a in
      guard let name = str(a, "name"), let fig = str(a, "fig") else { return nil }
      return Owner.Figure(label: name, value: fig, sub: str(a, "sub"), delta: chip(a["chip"]), meter: nil, spark: values(a["spark"]),
                          warn: flag(a, "warn") ?? false, to: destination(a))
    }
    areasNote = str(o, "areasNote")
    log = (obj(o, "log")).map { l in
      var days: [(at: String, entries: [Owner.Link])] = []
      for e in list(l, "entries") {
        guard let at = str(e, "at"), let text = str(e, "text") else { continue }
        let line = Owner.Link(title: text, text: str(e, "sub"), tone: tone(e), to: destination(e))
        if days.last?.at == at { days[days.count - 1].entries.append(line) } else { days.append((at, [line])) }
      }
      return (str(l, "title") ?? "", days)
    }
    sections = list(o, "sections").compactMap { s in
      guard let key = str(s, "key"), Owner.isKey(key), let name = str(s, "name") else { return nil }
      return Owner.Link(title: name, to: .section(key, anchor: nil))
    }
  }
}

extension Owner.Section {
  init(_ o: Dict) {
    tz = str(o, "tz") ?? ""
    title = str(o, "title") ?? ""
    blocks = list(o, "blocks").compactMap(block)
  }
}

/// nil: a kind this app doesn't know, or one missing what it needs; the rest of the section still comes.
private func block(_ o: Dict) -> Owner.Block? {
  let text = str(o, "text")
  switch str(o, "kind") {
  case "heading":
    return text.map { .heading($0, level: num(o, "level").map(Int.init) ?? 2, anchor: str(o, "anchor")) }
  case "note":
    return text.map { .note($0, tone(o)) }
  case "figures":
    return .figures(list(o, "items").compactMap { f in
      guard let label = str(f, "label"), let value = str(f, "value") else { return nil }
      return Owner.Figure(label: label, value: value, sub: str(f, "sub"), delta: chip(f["delta"]),
                          meter: num(f, "meter").map { min(max($0, 0), 1) }, spark: [], warn: false, to: nil)
    })
  case "chart":
    guard o["id"] is String, let title = str(o, "title") else { return nil }
    return .chart(Owner.Chart(title: title, days: strs(o, "days"), series: list(o, "series").compactMap(series),
                              whole: (obj(o, "whole")).flatMap(series), unit: str(o, "unit"), partialLast: flag(o, "partialLast") ?? false,
                              empty: str(o, "empty"), missing: str(o, "missing")))
  case "table":
    let rows = (o["rows"] as? [Any] ?? []).compactMap { r in
      (r as? [Any])?.compactMap { c -> Owner.Link? in
        guard let c = c as? Dict, let text = str(c, "text") else { return nil }
        let page = (str(c, "href")).flatMap { Owner.isSitePath($0) ? Owner.Destination.page($0) : nil }
        return Owner.Link(title: text, text: str(c, "sub"), tone: tone(c), to: page)
      }
    }
    return .table(Owner.Table(columns: strs(o, "columns"), rows: rows, empty: str(o, "empty"), folded: str(o, "folded")))
  case "photos":
    return .cards(list(o, "items").compactMap { p in
      guard p["id"] is String, let src = str(p, "src") else { return nil }
      return Owner.Card(title: str(p, "caption") ?? "", lines: strs(p, "meta"), src: src, actions: actions(p))
    }, empty: str(o, "empty"), hidden: false)
  case "hidden":
    return .cards(list(o, "items").compactMap { h in
      guard let path = str(h, "path") else { return nil }
      return Owner.Card(title: path, lines: [str(h, "note"), str(h, "since")].compactMap { $0 }, src: nil, actions: actions(h))
    }, empty: str(o, "empty"), hidden: true)
  case "form":
    guard str(o, "method") == "POST", let path = ownerPath(o["path"]), let submit = str(o, "submit") else { return nil }
    var fields: [Owner.Field] = []
    for f in list(o, "fields") {
      // A field this app can't draw (a kind it doesn't know): the whole form is left out, as a part never sent half.
      guard let name = str(f, "name"), let label = str(f, "label"), let kind = str(f, "kind"), kind == "text" || kind == "textarea" else { return nil }
      fields.append(Owner.Field(name: name, label: label, multiline: kind == "textarea", required: flag(f, "required") ?? false, placeholder: str(f, "placeholder")))
    }
    return fields.isEmpty ? nil : .form(Owner.Form(method: "POST", path: path, fields: fields, body: (obj(o, "body")).flatMap(Owner.text), submit: submit))
  case "switch":
    guard let label = str(o, "label"), let on = flag(o, "on"), let href = ownerPath(o["href"], under: "/api/owner/sections/") else { return nil }
    return .toggle(label, on: on, href: href)
  default:
    return nil
  }
}

private func series(_ o: Dict) -> Owner.Series? {
  guard let label = str(o, "label") else { return nil }
  return Owner.Series(label: label, values: values(o["values"]), tone: str(o, "tone"))
}
