import AccountSync
import SwiftUI

/// Readers' comments in one state, under a filter by state (Held, Shown, Hidden, each with its count): each comment's
/// name, when, its text, the page it's on, why it's in this state and the readers' reports, with its buttons. Choosing a
/// filter reads the section from the filter's address; "Show 50 more" reads the next comments.
struct OwnerComments: View {
  let comments: Owner.Comments
  let draw: OwnerDraw
  @State private var more: [Owner.Comment] = []
  @State private var next: String??
  @State private var reading = false
  @State private var problem: String?
  @Environment(AccountModel.self) private var account

  var body: some View {
    let items = comments.items + more, cursor = next ?? comments.next
    VStack(alignment: .leading, spacing: 12) {
      Picker(selection: Binding(get: { comments.state }, set: { s in
        if let f = comments.filters.first(where: { $0.state == s }) { draw.open(f.href) }
      })) {
        ForEach(comments.filters.indices, id: \.self) { i in
          let f = comments.filters[i]
          Text(verbatim: "\(f.label) · \(f.count)").tag(f.state)
        }
      } label: { Text(verbatim: "Comments") }
      .pickerStyle(.segmented)
      .disabled(draw.working)
      .accessibilityIdentifier("owner-comment-filter")

      VStack(alignment: .leading, spacing: 0) {
        if items.isEmpty {
          Text(verbatim: comments.empty ?? "").foregroundStyle(.secondary).padding(16)
        }
        ForEach(items.indices, id: \.self) { i in
          if i > 0 { Divider().padding(.leading, 16) }
          comment(items[i])
        }
      }
      .ownerCard(padded: false)

      if let problem { Text(verbatim: problem).font(.footnote).foregroundStyle(.red) }
      if let cursor {
        Button { Task { await read(cursor) } } label: { Text(verbatim: "Show 50 more") }
          .disabled(reading)
          .accessibilityIdentifier("owner-more")
      }
    }
    // Another filter, or the section read again after a button: the comments read since go with the old list.
    .onChange(of: comments.state) { more = []; next = nil }
    .onChange(of: comments.items.map(\.id)) { more = []; next = nil }
  }

  private func comment(_ c: Owner.Comment) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack(alignment: .firstTextBaseline) {
        (Text(verbatim: c.name).font(.subheadline.weight(.semibold)) + Text(verbatim: c.at.map { " · " + Self.ago($0) } ?? "").font(.footnote).foregroundStyle(.secondary))
        Spacer(minLength: 8)
        // Not what the filter already says.
        if c.state != "shown", c.state != comments.state {
          let held = c.state == "held"
          Text(verbatim: held ? "Held" : "Hidden").font(.caption.weight(.semibold))
            .foregroundStyle(held ? Color.orange : .secondary)
            .padding(.horizontal, 7).padding(.vertical, 2)
            .background((held ? Color.orange : Color.secondary).opacity(0.15), in: .capsule)
        }
      }
      Text(verbatim: c.text)
      draw.go(c.path.map { Owner.Destination.page($0) }, AnyView(Text(verbatim: c.page).font(.subheadline).foregroundStyle(c.path == nil ? Color.secondary : OwnerChart.green)), "")
      if !c.reason.isEmpty {
        Label {
          Text(verbatim: c.reason).font(.footnote).foregroundStyle(.secondary)
        } icon: {
          if c.state == "held" { Image(systemName: "exclamationmark.triangle.fill").font(.footnote).foregroundStyle(.orange) }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("owner-comment-reason")
      }
      if !c.reports.isEmpty {
        Text(verbatim: "Reports: " + c.reports.map { $0.isEmpty ? "no reason given" : "“\($0)”" }.joined(separator: ", ")).font(.footnote).foregroundStyle(.secondary)
      }
      if !c.actions.isEmpty { draw.buttons(c.actions) }
    }
    .padding(16)
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("owner-comment")
  }

  private func read(_ cursor: String) async {
    reading = true
    defer { reading = false }
    do {
      let page = try await account.owner.ask { [comments] in try await $0.comments(comments.state, cursor: cursor) }
      more += page.items
      next = .some(page.next)
      problem = nil
    } catch {
      problem = await account.owner.say(error, overview: false)
    }
  }

  /// When it was posted, in English as the dashboard writes: "just now", "5 min ago", "2 h ago", "yesterday", "4 Nov".
  static func ago(_ d: Date, now: Date = .now) -> String {
    let s = now.timeIntervalSince(d)
    if s < 60 { return "just now" }
    if s < 3600 { return "\(Int(s / 60)) min ago" }
    if s < 86400 { return "\(Int(s / 3600)) h ago" }
    if s < 2 * 86400 { return "yesterday" }
    return d.formatted(.dateTime.day().month(.abbreviated).locale(Locale(identifier: "en_GB")))
  }
}
