import AccountSync
import Handbook
import SwiftUI

/// A table on a card, scrolled sideways when its columns don't fit, with its rows read 50 at a time: the first come with
/// the section (or, on a folded one's page, are read when it opens), "Show 50 more" reads the next.
struct OwnerTable: View {
  let columns: [String]
  let rows: [[Owner.Link]]
  var empty: String?
  /// Its name in the section, its rows in all, and the cursor for the rows after these (nil: no more).
  let id: String?
  var count: Int?
  let next: String?
  let draw: OwnerDraw
  /// Its rows read after the first ones, and the cursor for the next (nil: no more).
  @State private var more: [[Owner.Link]] = []
  @State private var after: String??
  @State private var reading = false
  @State private var problem: String?
  @Environment(AccountModel.self) private var account

  var body: some View {
    let rows = self.rows + more, cursor = after ?? next
    VStack(alignment: .leading, spacing: 10) {
      if rows.isEmpty {
        Text(verbatim: empty ?? "").foregroundStyle(.secondary)
      } else {
        ScrollView(.horizontal) {
          Grid(alignment: .topLeading, horizontalSpacing: 16, verticalSpacing: 8) {
            GridRow {
              ForEach(columns.indices, id: \.self) { Text(verbatim: columns[$0]).font(.footnote.weight(.semibold)).foregroundStyle(.secondary) }
            }
            ForEach(rows.indices, id: \.self) { r in
              Divider().gridCellUnsizedAxes(.horizontal)
              GridRow { ForEach(rows[r].indices, id: \.self) { draw.cell(rows[r][$0]) } }
            }
          }
          .font(.callout)
        }
        .clearOfOwnerReport(.trailing)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("owner-table")
      }
      if let problem { Text(verbatim: problem).font(.footnote).foregroundStyle(.red) }
      if let id, let cursor {
        Button { Task { await read(id, cursor) } } label: {
          Text(verbatim: count.map { "Show \(min(50, $0 - rows.count)) more of \($0)" } ?? "Show 50 more")
        }
        .disabled(reading)
        .accessibilityIdentifier("owner-more")
      }
    }
    .ownerCard()
  }

  private func read(_ id: String, _ cursor: String) async {
    reading = true
    defer { reading = false }
    do {
      let page = try await account.owner.ask { [draw] in try await $0.table(draw.key, id, cursor: cursor, period: draw.period) }
      more += page.items
      after = .some(page.next)
      problem = nil
    } catch {
      problem = await account.owner.say(error, overview: false)
    }
  }
}

/// A folded table, opened: its name, its rows in all, and the period it's for.
struct OwnerTableRoute: Hashable {
  let key: String
  let id: String
  let title: String
  let columns: [String]
  let count: Int?
  let period: String?
}

/// A folded table's own page: its first 50 rows read as it opens, then 50 more at a time.
struct OwnerTableScreen: View {
  let route: OwnerTableRoute
  @Environment(AccountModel.self) private var account
  @Environment(HandbookModel.self) private var handbook
  @State private var first: Owner.Page<[Owner.Link]>?
  @State private var problem: String?

  var body: some View {
    let owner = account.owner
    let draw = OwnerDraw(key: route.key, period: route.period, working: false, run: { _ in }, send: { _ in false }, open: { _ in },
                         item: { handbook.item(at: $0) ?? handbook.item(at: "/vi" + $0) }, site: owner.page)
    ScrollView {
      VStack(alignment: .leading, spacing: 12) {
        if let problem {
          Text(verbatim: problem).foregroundStyle(.red).accessibilityIdentifier("owner-message")
        } else if let first {
          OwnerTable(columns: route.columns, rows: first.items, id: route.id, count: route.count, next: first.next, draw: draw)
        } else {
          ProgressView().frame(maxWidth: .infinity)
        }
      }
      .padding()
    }
    .clearOfOwnerReport()
    .background(Color(uiColor: .systemGroupedBackground))
    .modifier(ClearUnderTopBar(shown: true, ground: Color(.systemGroupedBackground)))
    .navigationTitle(Text(verbatim: route.title))
    .navigationBarTitleDisplayMode(.inline)
    .task {
      do {
        first = try await owner.ask { [route] in try await $0.table(route.key, route.id, cursor: nil, period: route.period) }
      } catch {
        problem = await owner.say(error, overview: false)
      }
    }
    .ownerScreen("dashboard table \(route.key)")
  }
}
