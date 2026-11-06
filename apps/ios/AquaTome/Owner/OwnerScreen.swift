import AccountSync
import Handbook
import SwiftUI

/// The overview ("") or a section, drawn block by block (OwnerBlocks.swift): the overview's to-dos, area cards, log and
/// sections are blocks too. A section opens at the heading `anchor` names. A button sends its own request, asking first
/// when it deletes something, then the section is read again; a switch reads it from its own address. Only the owner's
/// account signed in now sees what was read: another account, a sign-out or a 401 drops it.
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
  /// The read in flight: a newer one cancels it, so an older answer never lands last.
  @State private var reading: Task<Void, Never>?

  var body: some View {
    let owner = account.owner
    let shown = owner.isOwner == true && account.user != nil
    let draw = OwnerDraw(working: working, run: run, send: send, open: { at = $0 }, item: { handbook.item(at: $0) ?? handbook.item(at: "/vi" + $0) },
                         site: owner.page)
    let blocks = !shown ? nil : key.isEmpty ? overview(owner.dashboard) : section.map { $0.blocks.map { ($0, "") } }
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 12) {
          if let problem {
            Text(verbatim: problem).foregroundStyle(.red).accessibilityIdentifier("owner-message")
            if let again { Button("Thử lại") { Task { await again() } }.buttonStyle(.bordered).accessibilityIdentifier("owner-again") }
          }
          if let blocks {
            ForEach(blocks.indices, id: \.self) { draw.block(blocks[$0].0, id: blocks[$0].1) }
          } else if problem == nil && shown {
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
    .task(id: "\(at ?? "")|\(owner.era)|\(shown)") { await load() }
    // Another account, a sign-out, the session over: what this screen read goes with it.
    .onChange(of: owner.era) { section = nil }
    .confirmationDialog(Text("Không hoàn tác được."), isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }), titleVisibility: .visible,
                        presenting: asking) { a in
      Button(role: .destructive) { Task { _ = await send(a) } } label: { Text(verbatim: a.label) }
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
    reading?.cancel()
    let t = Task { await read() }
    reading = t
    await t.value
  }

  private func read() async {
    guard account.owner.isOwner == true, account.user != nil else { return }
    do {
      if key.isEmpty {
        try await account.owner.overview()
      } else {
        let s = try await account.owner.ask { [at, key] c in try await at == nil ? c.section(key) : c.section(at: at!) }
        try Task.checkCancellation()
        section = s
      }
      problem = nil
      again = nil
    } catch {
      await failed(error, overview: key.isEmpty) { await load() }
    }
  }

  private func run(_ a: Owner.Action) {
    if a.asks { asking = a } else { Task { _ = await send(a) } }
  }

  /// A button's or a form's request, then the section read again. Whether the server took it (200).
  private func send(_ a: Owner.Action) async -> Bool {
    working = true
    defer { working = false }
    do {
      try await account.owner.ask { try await $0.run(a) }
      await load()
      return true
    } catch {
      await failed(error, overview: false) { _ = await send(a) }
      return false
    }
  }

  /// Says what went wrong, and offers to do it again when that may help soon. A 401 or a 404 takes the section away.
  private func failed(_ e: Error, overview: Bool, retry: @escaping @MainActor () async -> Void) async {
    guard let said = await account.owner.say(e, overview: overview) else { return }
    switch e as? OwnerError {
    case .signedOut?, .notFound?: section = nil
    default: break
    }
    problem = said
    again = (e as? OwnerError)?.passes == true ? retry : nil
  }
}
