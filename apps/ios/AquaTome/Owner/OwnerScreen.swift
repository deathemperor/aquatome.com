import AccountSync
import Handbook
import SwiftUI

/// The overview ("") or a section. The overview is drawn as its parts (OwnerOverview.swift), with a bell in the bar for
/// the daily report's delivery; a section block by block (OwnerBlocks.swift), with its period menu in the bar when it
/// has periods, and opens at the heading `anchor` names. A button sends its own request, asking first when it deletes
/// something, then the section is read again; a switch or a comments filter reads it from its own address. Only the
/// owner's account signed in now sees what was read: another account, a sign-out or a 401 drops it. The dashboard's own
/// words are English.
struct OwnerScreen: View {
  let key: String
  let anchor: String?
  @Environment(AccountModel.self) private var account
  @Environment(HandbookModel.self) private var handbook
  @State private var section: Owner.Section?
  /// The section's address as a switch or a filter last gave it (nil: its own).
  @State private var at: String?
  /// The period chosen in the bar's menu (nil: the section's own first).
  @State private var period: String?
  @State private var problem: String?
  /// What failed, to do again: offline, or the server's storage not answering just then.
  @State private var again: (@MainActor () async -> Void)?
  @State private var working = false
  @State private var asking: Owner.Action?
  @State private var bell = false
  @Environment(\.dynamicTypeSize) private var size
  /// The read in flight: a newer one cancels it, so an older answer never lands last.
  @State private var reading: Task<Void, Never>?

  var body: some View {
    let owner = account.owner
    let shown = owner.isOwner == true && account.user != nil
    let draw = OwnerDraw(key: key, period: section?.period, working: working, run: run, send: send, open: { at = $0 },
                         item: { handbook.item(at: $0) ?? handbook.item(at: "/vi" + $0) }, site: owner.page)
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 10) {
          if let problem {
            Text(verbatim: problem).foregroundStyle(.red).accessibilityIdentifier("owner-message")
            if let again { Button { Task { await again() } } label: { Text(verbatim: "Try again") }.buttonStyle(.bordered).accessibilityIdentifier("owner-again") }
          }
          if shown, key.isEmpty, let d = owner.dashboard {
            OwnerOverview(dashboard: d, draw: draw) { part in withAnimation { proxy.scrollTo(part, anchor: .top) } }
          } else if shown, !key.isEmpty, let s = section {
            ForEach(s.blocks.indices, id: \.self) { draw.block(s.blocks[$0]) }
          } else if shown && problem == nil {
            ProgressView().frame(maxWidth: .infinity)
          }
        }
        .padding(.horizontal)
        .padding(.bottom)
      }
      .clearOfOwnerReport()
      .background(Color(uiColor: .systemGroupedBackground))
      // Read the first time: at the heading the link named.
      .onChange(of: section == nil) { if let anchor { proxy.scrollTo(anchor, anchor: .top) } }
    }
    .navigationTitle(Text(verbatim: key.isEmpty ? "Dashboard" : section?.title ?? owner.dashboard?.name(of: key) ?? ""))
    .navigationBarTitleDisplayMode(.large)
    .toolbar {
      if key.isEmpty && shown {
        ToolbarItem(placement: .topBarTrailing) {
          Button { bell = true } label: { Image(systemName: "bell.badge") }
            .accessibilityLabel(Text(verbatim: "Daily report"))
            .accessibilityIdentifier("owner-bell")
        }
      } else if let s = section, !s.periods.isEmpty {
        ToolbarItem(placement: .topBarTrailing) {
          Menu {
            Picker(selection: Binding(get: { s.period ?? s.periods[0].key }, set: { period = $0 })) {
              ForEach(s.periods.indices, id: \.self) { Text(verbatim: s.periods[$0].label).tag(s.periods[$0].key) }
            } label: { Text(verbatim: "Period") }
          } label: {
            HStack(spacing: 4) {
              Text(verbatim: s.periods.first { $0.key == s.period }?.label ?? s.periods[0].label)
              Image(systemName: "chevron.up.chevron.down").font(.caption.weight(.semibold))
            }
          }
          .disabled(working)
          .accessibilityLabel(Text(verbatim: "Period"))
          .accessibilityValue(Text(verbatim: s.periods.first { $0.key == s.period }?.label ?? ""))
          .accessibilityIdentifier("owner-period")
        }
      }
    }
    // Two switches: a sheet of their height, the whole screen only at the largest text.
    .sheet(isPresented: $bell) { OwnerDelivery().presentationDetents(size.isAccessibilitySize ? [.large] : [.medium]) }
    .refreshable { await load() }
    .task(id: "\(at ?? "")|\(period ?? "")|\(owner.era)|\(shown)") { await load() }
    // Another account, a sign-out, the session over: what this screen read goes with it.
    .onChange(of: owner.era) { section = nil }
    .confirmationDialog(Text(verbatim: "This can't be undone."), isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }),
                        titleVisibility: .visible, presenting: asking) { a in
      Button(role: .destructive) { Task { _ = await send(a) } } label: { Text(verbatim: a.label) }
    }
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
        let s = try await account.owner.ask { [at, key, period] c in
          if let at { try await c.section(at: at) } else { try await c.section(key, period: period) }
        }
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
