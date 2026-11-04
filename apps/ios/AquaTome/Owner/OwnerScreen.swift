import AccountSync
import Handbook
import SwiftUI

/// The overview ("") or a section, drawn block by block (OwnerBlocks.swift): the overview's to-dos, area cards, log and
/// sections are blocks too. A section opens at the heading `anchor` names. A button sends its own request, asking first
/// when it deletes something, then the section is read again; a switch reads it from its own address.
struct OwnerScreen: View {
  let key: String
  let anchor: String?
  @Environment(AccountModel.self) private var account
  @Environment(HandbookModel.self) private var handbook
  @State private var section: Owner.Section?
  /// The section's address as a switch last gave it (nil: its own).
  @State private var at: String?
  @State private var problem: String?
  /// What failed, to do again: offline, or the server's storage not answering just then.
  @State private var again: (@MainActor () async -> Void)?
  @State private var working = false
  @State private var asking: Owner.Action?

  var body: some View {
    let owner = account.owner
    let draw = OwnerDraw(working: working, run: run, open: { at = $0 }, item: { handbook.item(at: $0) ?? handbook.item(at: "/vi" + $0) }, site: owner.page)
    let blocks = key.isEmpty ? overview(owner.dashboard) : section.map { $0.blocks.map { ($0, "") } }
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          if let problem {
            Text(verbatim: problem).foregroundStyle(.red).accessibilityIdentifier("owner-message")
            if let again { Button("Thử lại") { Task { await again() } }.buttonStyle(.bordered).accessibilityIdentifier("owner-again") }
          }
          if let blocks {
            ForEach(blocks.indices, id: \.self) { draw.block(blocks[$0].0, id: blocks[$0].1) }
          } else if problem == nil {
            ProgressView().frame(maxWidth: .infinity)
          }
        }
        .padding()
      }
      // Read the first time: at the heading the link named.
      .onChange(of: section == nil) { if let anchor { proxy.scrollTo(anchor, anchor: .top) } }
    }
    .navigationTitle(key.isEmpty ? String(localized: "Bảng điều khiển") : section?.title ?? owner.dashboard?.name(of: key) ?? "")
    .navigationBarTitleDisplayMode(.inline)
    .refreshable { await load() }
    .task(id: at) { await load() }
    .confirmationDialog(Text("Không hoàn tác được."), isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }), titleVisibility: .visible,
                        presenting: asking) { a in
      Button(role: .destructive) { Task { await send(a) } } label: { Text(verbatim: a.label) }
    }
  }

  /// The overview, as blocks (with the identifiers the UI tests find them by).
  private func overview(_ d: Owner.Dashboard?) -> [(Owner.Block, String)]? {
    guard let d else { return nil }
    var out: [(Owner.Block, String)] = [(.heading(String(localized: "Cần bạn"), level: 2, anchor: nil), "")]
    out += d.todos.isEmpty ? [(.note(String(localized: "Không có việc gì cần bạn lúc này."), .muted), "")] : d.todos.map { (.link($0), "owner-todo") }
    out.append((.figures(d.areas), "owner-area"))
    if let n = d.areasNote { out.append((.note(n, .muted), "")) }
    if let log = d.log, !log.days.isEmpty {
      out.append((.heading(log.title, level: 2, anchor: nil), ""))
      for day in log.days { out += [(.heading(day.at, level: 3, anchor: nil), "")] + day.entries.map { (.link($0), "owner-log") } }
    }
    out.append((.heading(String(localized: "Các mục"), level: 2, anchor: nil), ""))
    return out + d.sections.map { (.link($0), "owner-section") }
  }

  private func load() async {
    do {
      if key.isEmpty {
        try await account.owner.overview()
      } else if let at {
        section = try await account.owner.client().section(at: at)
      } else {
        section = try await account.owner.client().section(key)
      }
      problem = nil
      again = nil
    } catch {
      failed(error, overview: key.isEmpty) { await load() }
    }
  }

  private func run(_ a: Owner.Action) {
    if a.asks { asking = a } else { Task { await send(a) } }
  }

  private func send(_ a: Owner.Action) async {
    working = true
    defer { working = false }
    do {
      try await account.owner.client().run(a)
      await load()
    } catch {
      failed(error, overview: false) { await send(a) }
    }
  }

  /// Says what went wrong, and offers to do it again when that may help soon.
  private func failed(_ e: Error, overview: Bool, retry: @escaping @MainActor () async -> Void) {
    if e is CancellationError { return }
    problem = account.owner.said(e, overview: overview)
    again = (e as? OwnerError)?.passes == true ? retry : nil
  }
}
