import Foundation

/// The owner's dashboard (protocols/owner-dashboard.openapi.json): the site's /_ab/ pages as JSON, for the app to draw
/// itself. The server drives it, so it is read leniently: a block of a kind this app doesn't know is skipped, so is a
/// field it doesn't know, and a part missing what it needs is left out, never the whole reply. Text comes written,
/// numbers and days formatted, and is shown as it comes. Read by hand from JSONSerialization's dictionaries, with no
/// Codable or synthesized conformances: every reader downloads this code, and only the owner runs it.
public enum Owner {
  /// What a text, a cell, a note or a button means: plain; muted (secondary, or an empty state); good (done, or better
  /// by more than 5%); wait (waits on the owner); bad (a fault, worse by more than 5%, or a button that deletes). A tone
  /// this app doesn't know is plain.
  public enum Tone: String, Sendable { case plain, muted, good, wait, bad }

  /// Where a line goes: a section of the dashboard (scrolled to the heading `anchor` names), an address to open in the
  /// browser, or a page of the site (from "/").
  public enum Destination: Sendable {
    case section(String, anchor: String?)
    /// From "https://".
    case url(String)
    case page(String)
  }

  /// A line that may go somewhere: a page of "Every page", a day of the last three, the keys' line, a table's cell.
  /// `text`: its second line; `figure`: what it counts, on the right, in `tone`.
  public struct Link: Sendable {
    public let title: String
    public let text: String?
    public let figure: String?
    public let tone: Tone
    public let to: Destination?

    public init(title: String, text: String? = nil, figure: String? = nil, tone: Tone = .plain, to: Destination? = nil) {
      self.title = title
      self.text = text
      self.figure = figure
      self.tone = tone
      self.to = to
    }
  }

  /// The overview: four tiles, what needs the owner, readers who found an answer, what shipped, the costs, the last three
  /// days and every page, grouped.
  public struct Dashboard: Sendable {
    public let tz: String
    /// When the figures were read.
    public let asOf: Date?
    /// Needs you, Found an answer, Shipped in 24 hours, the cost: each leads to its part below.
    public let tiles: [Tile]
    /// Most pressing first.
    public let needs: [Need]
    /// The line when nothing needs the owner.
    public let needsEmpty: String
    public let answers: Answers?
    public let shipped: Shipped?
    public let costs: Costs?
    /// One row a day, newest first: its title, its figure, its other lines (`text`).
    public let log: (title: String, days: [Link])?
    /// Every page but the overview, grouped, each with its figure.
    public let pages: [(name: String, pages: [Link])]
    /// Every section, as links to them, with the names the old overview gave them.
    public let sections: [Link]

    /// A section's name: as "Every page" lists it, else as the dashboard lists it.
    public func name(of key: String) -> String? {
      let named = { (l: Link) in if case .section(key, _)? = l.to { true } else { false } }
      return (pages.flatMap(\.pages).first(where: named) ?? sections.first(where: named))?.title
    }
  }

  /// One of the overview's four tiles. `key`: the part it leads to (needs, answers, shipped, cost).
  public final class Tile: Sendable {
    public let key: String
    public let label: String
    public let value: String
    public let sub: String?
    public let tone: Tone
    public let delta: Chip?
    public let bars: Bars?

    init(key: String, label: String, value: String, sub: String?, tone: Tone, delta: Chip?, bars: Bars?) {
      self.key = key
      self.label = label
      self.value = value
      self.sub = sub
      self.tone = tone
      self.delta = delta
      self.bars = bars
    }
  }

  /// A tile's small bars, one a day, oldest first, each with what a tap on it shows; nil a day with nothing to draw.
  public final class Bars: Sendable {
    public let values: [Double?]
    public let readouts: [Readout]
    /// Today's bar, drawn lighter; the days after it are still to come.
    public let today: Int?

    init(values: [Double?], readouts: [Readout], today: Int?) {
      self.values = values
      self.readouts = readouts
      self.today = today
    }
  }

  /// What a tap on a bar shows over it, as the web page writes it: "21 found an answer", "Thu 5 Nov · 29 readers".
  public struct Readout: Sendable {
    public let title: String
    public let detail: String
  }

  /// One thing that needs the owner: `kind` for its icon (comments, photos, key, engine, moderation, failed), the line,
  /// the web's button (`label`), wait (to review) or bad (to fix), where to deal with it, and waiting photos by id.
  public final class Need: Sendable {
    public let kind: String
    public let text: String
    public let sub: String?
    public let label: String?
    public let tone: Tone
    public let to: Destination?
    /// Readers' photos waiting, as private addresses (from "/").
    public let photos: [String]

    init(kind: String, text: String, sub: String?, label: String?, tone: Tone, to: Destination?, photos: [String]) {
      self.kind = kind
      self.text = text
      self.sub = sub
      self.label = label
      self.tone = tone
      self.to = to
      self.photos = photos
    }
  }

  /// Readers who found an answer: this week's figure against the same point last week, the week by day, readers,
  /// sessions and shop clicks.
  public final class Answers: Sendable {
    public let title: String
    public let figure: Figure?
    public let chart: Chart?
    public let figures: [Figure]
    public let note: String?

    init(title: String, figure: Figure?, chart: Chart?, figures: [Figure], note: String?) {
      self.title = title
      self.figure = figure
      self.chart = chart
      self.figures = figures
      self.note = note
    }
  }

  /// The changelog's lines of the last 24 hours, newest first (`area`: site, app or engine; `label` its tag), then the
  /// row to the whole changelog (`more`).
  public final class Shipped: Sendable {
    public let title: String
    public let lines: [(area: String, label: String, text: String)]
    public let empty: String?
    public let note: String?
    public let more: Link?

    init(title: String, lines: [(area: String, label: String, text: String)], empty: String?, note: String?, more: Link?) {
      self.title = title
      self.lines = lines
      self.empty = empty
      self.note = note
      self.more = more
    }
  }

  /// What the server counts (`lines`), the fish ID keys' state (`keys`), what it doesn't count (`fixed`).
  public final class Costs: Sendable {
    public let title: String
    public let lines: [Figure]
    public let keys: Link?
    public let fixed: [String]
    public let note: String?

    init(title: String, lines: [Figure], keys: Link?, fixed: [String], note: String?) {
      self.title = title
      self.lines = lines
      self.keys = keys
      self.fixed = fixed
      self.note = note
    }
  }

  /// A figure's change: "+8% vs last week", coloured as the server says.
  public final class Chip: Sendable {
    public let text: String
    public let tone: Tone

    init(text: String, tone: Tone) {
      self.text = text
      self.tone = tone
    }
  }

  public struct Section: Sendable {
    public let tz: String
    public let title: String
    public let blocks: [Block]
    /// What the period menu offers, in its order; empty: one period, as the section's text says.
    public let periods: [(key: String, label: String)]
    /// The period every figure is for: one of `periods`.
    public let period: String?
  }

  public enum Block: Sendable {
    /// 2: a part of the section; 3: a part within it. `anchor`: the name a link opens the section at it by.
    case heading(String, level: Int, anchor: String?)
    case figures([Figure])
    case chart(Chart)
    case table(Table)
    case note(String, Tone)
    /// Photos, or (`hidden`) the pages taken off the site, each with its buttons; `empty` when there are none.
    case cards([Card], empty: String?, hidden: Bool)
    /// Buttons of their own, each sending its request (a setting's: the report by email or not).
    case actions([Action])
    /// Fields sent as a button's request is (hiding a page).
    case form(Form)
    /// Between two forms of the section (the app's test builds or readers'): `on` or off; flipping it reads the section
    /// from `href`.
    case toggle(String, on: Bool, href: String)
    /// Readers' comments in one state, under a filter by state.
    case comments(Comments)
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

    init(label: String, value: String, sub: String?, delta: Chip?, meter: Double?) {
      self.label = label
      self.value = value
      self.sub = sub
      self.delta = delta
      self.meter = meter
    }
  }

  /// Columns over days, as the site's charts (apps/site/worker/admin/chart.ts): stacked from the baseline in the series'
  /// order, a negative value below it, `whole` a pale column behind them. Each day has its axis label and what a tap on
  /// it shows, as the web page writes them.
  public final class Chart: Sendable {
    public let title: String
    public let series: [Series]
    public let whole: Series?
    /// "usd": dollars. nil: counts.
    public let unit: String?
    /// One a day, oldest first: "Thu", "Today", a week's Monday "2 Nov".
    public let labels: [String]
    public let readouts: [Readout]
    /// Today's column, drawn lighter (the day isn't over); the days after it are still to come.
    public let today: Int?
    /// What to say when every value is 0 or missing.
    public let empty: String?
    /// Why a day without a value has none.
    public let missing: String?

    init(title: String, series: [Series], whole: Series?, unit: String?, labels: [String], readouts: [Readout], today: Int?, empty: String?,
         missing: String?) {
      self.title = title
      self.series = series
      self.whole = whole
      self.unit = unit
      self.labels = labels
      self.readouts = readouts
      self.today = today
      self.empty = empty
      self.missing = missing
    }

    /// How many days it covers.
    public var count: Int { labels.count }

    /// Every value 0 or not recorded: nothing to draw.
    public var isEmpty: Bool { (series + [whole].compactMap { $0 }).allSatisfy { $0.values.allSatisfy { ($0 ?? 0) == 0 } } }
  }

  public final class Series: Sendable {
    public let label: String
    /// One a day; nil: the day wasn't recorded, or is still to come.
    public let values: [Double?]
    /// "s1", "s2", "s3" (the chart's own colours, never orange or red) or "mute" (context only); nil: s1, s2, s3 by
    /// position.
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
    /// Drawn closed, as a row named this: its rows come when it's opened (`id`).
    public let folded: String?
    /// The folded row's figure, on its right ("$0.77").
    public let figure: String?
    /// Its name in the section, to read its rows by: present when it's folded or has more to come.
    public let id: String?
    /// How many rows it has in all, when that is more than `rows` holds.
    public let count: Int?
    /// More rows to come: the cursor for the next 50.
    public let next: String?

    init(columns: [String], rows: [[Link]], empty: String?, folded: String?, figure: String?, id: String?, count: Int?, next: String?) {
      self.columns = columns
      self.rows = rows
      self.empty = empty
      self.folded = folded
      self.figure = figure
      self.id = id
      self.count = count
      self.next = next
    }
  }

  /// A page of a table's rows, or of comments: up to 50, and the cursor for the next (nil: the last page).
  public struct Page<Item: Sendable>: Sendable {
    public let items: [Item]
    public let next: String?
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

  /// Readers' comments in one `state` (held, shown, hidden), newest first, 50 at a time, under a filter by state.
  public final class Comments: Sendable {
    public let state: String
    /// Held, Shown, Hidden, each with its count and the section's address with it chosen.
    public let filters: [(state: String, label: String, count: Int, href: String)]
    public let items: [Comment]
    /// More to come: the cursor for the next 50.
    public let next: String?
    public let empty: String?

    init(state: String, filters: [(state: String, label: String, count: Int, href: String)], items: [Comment], next: String?, empty: String?) {
      self.state = state
      self.filters = filters
      self.items = items
      self.next = next
      self.empty = empty
    }
  }

  /// A reader's comment: the name they gave, when, the page it's on (`path` nil: a page the site no longer has), why it
  /// is in its state, readers' reports, and its buttons (Show, Hide, Show again).
  public final class Comment: Sendable {
    public let id: String
    public let at: Date?
    public let name: String
    public let page: String
    public let path: String?
    public let text: String
    public let state: String
    public let reason: String
    public let reports: [String]
    public let actions: [Action]

    init(id: String, at: Date?, name: String, page: String, path: String?, text: String, state: String, reason: String, reports: [String],
         actions: [Action]) {
      self.id = id
      self.at = at
      self.name = name
      self.page = page
      self.path = path
      self.text = text
      self.state = state
      self.reason = reason
      self.reports = reports
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

    /// Asks before it's sent: it deletes something for good. Not hiding a comment, which "Show again" undoes for 30 days.
    public var asks: Bool { tone == .bad && !path.hasPrefix("/api/owner/comments/") }
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
private func int(_ o: Dict, _ k: String) -> Int? { num(o, k).flatMap { $0 >= 0 && $0 == $0.rounded() ? Int($0) : nil } }
private func list(_ o: Dict, _ k: String) -> [Dict] { (o[k] as? [Any] ?? []).compactMap { $0 as? Dict } }
private func tone(_ o: Dict) -> Owner.Tone { (str(o, "tone")).flatMap(Owner.Tone.init) ?? .plain }
/// Numbers, a day not recorded (null, or anything else) nil.
private func values(_ v: Any?) -> [Double?] { (v as? [Any] ?? []).map { ($0 as? NSNumber)?.doubleValue } }
/// A time as the server writes it (UTC, with or without its milliseconds).
private func date(_ o: Dict, _ k: String) -> Date? {
  guard let s = str(o, k) else { return nil }
  return (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(s)) ?? (try? Date.ISO8601FormatStyle().parse(s))
}
private func chip(_ v: Any?) -> Owner.Chip? {
  guard let c = v as? Dict, let text = str(c, "text") else { return nil }
  return Owner.Chip(text: text, tone: tone(c))
}
/// A note's text: a Note block's, or a plain string.
private func note(_ v: Any?) -> String? { (v as? String) ?? (v as? Dict).flatMap { str($0, "text") } }

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

private func figure(_ f: Dict) -> Owner.Figure? {
  guard let label = str(f, "label"), let value = str(f, "value") else { return nil }
  return Owner.Figure(label: label, value: value, sub: str(f, "sub"), delta: chip(f["delta"]), meter: num(f, "meter").map { min(max($0, 0), 1) })
}

private func readouts(_ o: Dict) -> [Owner.Readout] {
  list(o, "readouts").map { Owner.Readout(title: str($0, "title") ?? "", detail: str($0, "detail") ?? "") }
}

extension Owner.Dashboard {
  init(_ o: Dict) {
    tz = str(o, "tz") ?? ""
    asOf = date(o, "asOf")
    tiles = list(o, "tiles").compactMap { t in
      guard let key = str(t, "key"), let label = str(t, "label"), let value = str(t, "value") else { return nil }
      let bars = (obj(t, "bars")).map { b in Owner.Bars(values: values(b["values"]), readouts: readouts(b), today: int(b, "today")) }
      return Owner.Tile(key: key, label: label, value: value, sub: str(t, "sub"), tone: tone(t), delta: chip(t["delta"]),
                        bars: bars.flatMap { $0.values.isEmpty || $0.readouts.count != $0.values.count ? nil : $0 })
    }
    needs = list(o, "needs").compactMap { n in
      guard let kind = str(n, "kind"), let text = str(n, "text") else { return nil }
      let photos = strs(n, "photos").filter { Owner.isKey($0) }.map { "/_ab/anh/" + $0 }
      return Owner.Need(kind: kind, text: text, sub: str(n, "sub"), label: str(n, "label"), tone: tone(n), to: destination(n), photos: photos)
    }
    needsEmpty = str(o, "needsEmpty") ?? ""
    answers = (obj(o, "answers")).flatMap { a in
      str(a, "title").map { title in
        Owner.Answers(title: title, figure: (obj(a, "figure")).flatMap(figure), chart: (obj(a, "chart")).flatMap(chart),
                      figures: list(a, "figures").compactMap(figure), note: note(a["note"]))
      }
    }
    shipped = (obj(o, "shipped")).flatMap { s in
      str(s, "title").map { title in
        let lines = list(s, "lines").compactMap { l -> (area: String, label: String, text: String)? in
          guard let area = str(l, "area"), let label = str(l, "label"), let text = str(l, "text") else { return nil }
          return (area, label, text)
        }
        let more = (str(s, "link")).flatMap { link in destination(s).map { Owner.Link(title: link, to: $0) } }
        return Owner.Shipped(title: title, lines: lines, empty: str(s, "empty"), note: note(s["note"]), more: more)
      }
    }
    costs = (obj(o, "costs")).flatMap { c in
      str(c, "title").map { title in
        let keys = (obj(c, "keys")).flatMap { k in
          str(k, "label").map { Owner.Link(title: $0, figure: str(k, "text"), tone: tone(k), to: destination(k)) }
        }
        return Owner.Costs(title: title, lines: list(c, "lines").compactMap(figure), keys: keys, fixed: strs(c, "fixed"), note: note(c["note"]))
      }
    }
    log = (obj(o, "log")).map { l in
      (str(l, "title") ?? "", list(l, "days").compactMap { d in
        guard let title = str(d, "title") else { return nil }
        return Owner.Link(title: title, text: str(d, "text"), figure: str(d, "figure"), to: destination(d))
      })
    }
    pages = list(o, "pages").compactMap { g in
      guard let name = str(g, "name") else { return nil }
      return (name, list(g, "pages").compactMap { p in
        guard let key = str(p, "key"), Owner.isKey(key), let title = str(p, "name") else { return nil }
        let f = obj(p, "figure") ?? [:]
        return Owner.Link(title: title, figure: str(f, "text"), tone: tone(f), to: .section(key, anchor: nil))
      })
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
    let offered = list(o, "periods").compactMap { p -> (key: String, label: String)? in
      guard let key = str(p, "key"), Owner.isKey(key), let label = str(p, "label") else { return nil }
      return (key, label)
    }
    periods = offered
    period = (str(o, "period")).flatMap { p in offered.contains { $0.key == p } ? p : nil }
  }
}

extension Owner.Page<[Owner.Link]> {
  /// A table's next rows (TablePage).
  init(rows o: Dict) {
    self.init(items: rows(o["rows"]), next: str(o, "next"))
  }
}

extension Owner.Page<Owner.Comment> {
  /// More comments (CommentsPage).
  init(comments o: Dict) {
    self.init(items: list(o, "items").compactMap(comment), next: str(o, "next"))
  }
}

/// A table's rows: a cell a column, the first naming the row.
private func rows(_ v: Any?) -> [[Owner.Link]] {
  (v as? [Any] ?? []).compactMap { r in
    (r as? [Any])?.compactMap { c -> Owner.Link? in
      guard let c = c as? Dict, let text = str(c, "text") else { return nil }
      let page = (str(c, "href")).flatMap { Owner.isSitePath($0) ? Owner.Destination.page($0) : nil }
      return Owner.Link(title: text, text: str(c, "sub"), tone: tone(c), to: page)
    }
  }
}

private func comment(_ c: Dict) -> Owner.Comment? {
  guard let id = str(c, "id"), Owner.isKey(id), let name = str(c, "name"), let text = str(c, "text"), let state = str(c, "state"),
        let page = obj(c, "page"), let title = str(page, "title") else { return nil }
  return Owner.Comment(id: id, at: date(c, "at"), name: name, page: title, path: (str(page, "path")).flatMap { Owner.isSitePath($0) ? $0 : nil },
                       text: text, state: state, reason: str(c, "reason") ?? "", reports: strs(c, "reports"), actions: actions(c))
}

private func chart(_ o: Dict) -> Owner.Chart? {
  guard o["id"] is String, let title = str(o, "title") else { return nil }
  let labels = strs(o, "labels"), said = readouts(o)
  // Each day its label and its readout, or no chart: a column with nothing to say when tapped is never drawn.
  guard !labels.isEmpty, said.count == labels.count else { return nil }
  let today = int(o, "today") ?? (flag(o, "partialLast") == true ? labels.count - 1 : nil)
  return Owner.Chart(title: title, series: list(o, "series").compactMap(series), whole: (obj(o, "whole")).flatMap(series), unit: str(o, "unit"),
                     labels: labels, readouts: said, today: today.flatMap { $0 < labels.count ? $0 : nil }, empty: str(o, "empty"),
                     missing: str(o, "missing"))
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
    return .figures(list(o, "items").compactMap(figure))
  case "chart":
    return chart(o).map { .chart($0) }
  case "table":
    let id = (str(o, "id")).flatMap { Owner.isKey($0) ? $0 : nil }
    return .table(Owner.Table(columns: strs(o, "columns"), rows: rows(o["rows"]), empty: str(o, "empty"), folded: id == nil ? nil : str(o, "folded"),
                              figure: str(o, "figure"), id: id, count: int(o, "count"), next: id == nil ? nil : str(o, "next")))
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
  case "actions":
    let a = actions(o)
    return a.isEmpty ? nil : .actions(a)
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
  case "comments":
    guard let state = str(o, "state") else { return nil }
    let filters = list(o, "filters").compactMap { f -> (state: String, label: String, count: Int, href: String)? in
      guard let s = str(f, "state"), let label = str(f, "label"), let href = ownerPath(f["href"], under: "/api/owner/sections/") else { return nil }
      return (s, label, int(f, "count") ?? 0, href)
    }
    return .comments(Owner.Comments(state: state, filters: filters, items: list(o, "items").compactMap(comment), next: str(o, "next"),
                                    empty: str(o, "empty")))
  default:
    return nil
  }
}

private func series(_ o: Dict) -> Owner.Series? {
  guard let label = str(o, "label") else { return nil }
  return Owner.Series(label: label, values: values(o["values"]), tone: str(o, "tone"))
}
