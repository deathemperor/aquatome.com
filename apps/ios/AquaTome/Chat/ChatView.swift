import Handbook
import SwiftUI

/// The chat screen, "Hỏi AquaTome" (docs/design/chat.md): pushed from a species' page or fish ID's result, asking as the
/// reader's account (ChatModel). What it's about at the top; empty, who answers and from what, three starters; then each
/// question as a bubble, the steps the agent takes above a "Đang soạn câu trả lời…" row, folding into one row when the
/// text starts, the text as it streams, then the next questions as chips. The newest question keeps a screen's height
/// below it, so the one scroll on sending puts it under the bar and the answer fills in beneath it.
struct ChatView: View {
  let route: ChatRoute
  @Environment(ChatStore.self) private var store
  @Environment(AccountModel.self) private var account
  @Environment(HandbookModel.self) private var handbook
  @State private var model: ChatModel?
  @State private var confirming = false

  var body: some View {
    Group {
      if let model { ChatThread(model: model) } else { Color.clear }
    }
    // The cards and chips stand on it, and the box fades into it.
    .background(Color(uiColor: .systemGroupedBackground).ignoresSafeArea())
    .navigationTitle("Hỏi AquaTome")
    .navigationBarTitleDisplayMode(.inline)
    // The box and its line sit at the foot of the screen.
    .toolbar(.hidden, for: .tabBar)
    .toolbar {
      ToolbarItem(placement: .principal) { Text("Hỏi AquaTome").font(.system(.headline, design: .serif).weight(.bold)) }
      ToolbarItem(placement: .topBarTrailing) {
        Button { confirming = true } label: { Label("Cuộc trò chuyện mới", systemImage: "square.and.pencil") }
          .disabled(model?.thread.isEmpty != false)
          .accessibilityIdentifier("chat-new")
      }
    }
    // No list of earlier chats yet: the one closing can't be opened again.
    .confirmationDialog("Bắt đầu cuộc mới?", isPresented: $confirming, titleVisibility: .visible) {
      Button("Bắt đầu cuộc mới", role: .destructive) { model?.startOver() }
    } message: {
      Text("Cuộc này sẽ không mở lại được.")
    }
    .onAppear {
      if model == nil { model = store.model(for: route, account: account, site: handbook.site, lang: handbook.lang) }
      // A question still being answered when the app last closed: asked again with its key.
      model?.resume()
    }
  }
}

private struct ChatThread: View {
  @Bindable var model: ChatModel
  @Environment(AccountModel.self) private var account
  @Environment(HandbookModel.self) private var handbook
  @Environment(\.openScreen) private var openScreen
  @Environment(\.dynamicTypeSize) private var size
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @FocusState private var typing: Bool
  /// The step lists opened under their fold rows.
  @State private var unfolded: Set<UUID> = []
  /// A page a step names, when the app can't show it itself: its web page.
  @State private var onSite: URL?
  /// The reader is up the thread while an answer lands: "Câu trả lời mới ↓" over the box.
  @State private var newBelow = false
  /// Each turn on the screen or not, by its question (iOS 18 on). Watched on every turn, not just the newest: a watch
  /// added and taken away as a turn stops being the newest made it a new view, losing what it held (a question opened
  /// with "Xem thêm" closed again).
  @State private var visible: [UUID: Bool] = [:]
  private var lastInView: Bool { model.thread.last.map { visible[$0.id] ?? true } ?? true }
  /// A section closed with its heading off the screen: back to it.
  @State private var scrollBack: String?
  /// Where the newest question's top is in the view (nil off it): near the top, the reader is still on its turn, so the
  /// first words and the keyboard going down put it back under the bar; scrolled into earlier turns or down the answer,
  /// nothing moves.
  @State private var lastTop: CGFloat?
  /// The box's height, with what's over it: the screen above it is what the reader sees.
  @State private var boxHeight: CGFloat = 0
  /// The newest turn's own height, without the room kept below it.
  @State private var lastContent: CGFloat = 0
  /// The view's height with the keyboard down, which the newest turn's room keeps with the keyboard up: shrinking with the
  /// keyboard, it brought the thread's end up under the question, which dropped with the "Về:" card back over it.
  @State private var restHeight: CGFloat = 0
  /// Where the row that waits ends in the view, while it shows.
  @State private var waitEnd: CGFloat?
  /// The reader has scrolled since the newest question went (iOS 18 on).
  @State private var readerMoved = false
  /// The empty screen's blocks in the scroll's content, for where it rests over the box.
  @State private var blocks = EmptyBlocks()
  /// How far the empty screen is placed.
  @State private var placed: CGFloat = 0
  /// Where the reader had it as the keyboard came up: where the keyboard going takes it back.
  @State private var restPlace: CGFloat = 0
  /// How far the empty screen has scrolled.
  @State private var scrolled: CGFloat = 0
  /// The box's height with nothing in it.
  @State private var emptyBox: CGFloat = 0

  private var signedOut: Bool { account.user == nil }

  private func pinIfOnIt(_ proxy: ScrollViewProxy, height: CGFloat) {
    // Up with the row that waits (`keepWaitAboveBox`), the question is off the top with the reader still on its turn.
    let followed = waitEnd.map { abs($0 - (height - boxHeight)) < 12 } == true
    guard let id = model.thread.last?.id, let top = lastTop, followed || (top > -8 && top < height * 0.4) else { return }
    withAnimation(reduceMotion ? nil : .smooth(duration: 0.3)) { proxy.scrollTo(id, anchor: .top) }
  }

  /// The first line or a step arrived and pushed the row that waits under the box: the view goes up with it, unless the
  /// reader has scrolled during this wait. Read a moment later: the row's place reaches us after the layout.
  private func keepWaitAboveBox(_ proxy: ScrollViewProxy, bottom: CGFloat) {
    guard !readerMoved else { return }
    Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(80))
      guard !readerMoved, let end = waitEnd, end > bottom else { return }
      withAnimation(reduceMotion ? nil : .easeOut(duration: 0.25)) { proxy.scrollTo(Self.waiting, anchor: .bottom) }
    }
  }

  /// The empty screen over the box: the least move, with the keyboard, that puts the box's edge in a gap (`Chat.place`),
  /// found line by line from one line up. The keyboard going takes it back to where the reader had it; a draft of more
  /// than one line settles where the taller box cuts nothing.
  private func placeEmpty(height: CGFloat) {
    guard model.thread.isEmpty, !blocks.all.isEmpty, boxHeight > 0 else { return }
    let one = emptyBox > 0 ? emptyBox : boxHeight
    var target = restPlace
    if typing || boxHeight > one + 1 {
      let line = UIFont.preferredFont(forTextStyle: .body).lineHeight
      let heights = stride(from: one, to: boxHeight, by: line).map { $0 } + [boxHeight]
      target = CGFloat(Chat.place(blocks.all.values.sorted { $0.top < $1.top }, boxTops: heights.map { Double(height - $0) }, from: Double(restPlace)))
    }
    guard abs(target - placed) > 0.5 else { return }
    withAnimation(reduceMotion ? nil : .smooth(duration: 0.3)) { placed = target }
  }

  /// What the wait has shown so far, to notice the next line of it.
  private var waited: Int { model.thread.last.map { $0.reply.steps.count + ($0.reply.opening == nil ? 0 : 1) } ?? 0 }

  var body: some View {
    ScrollViewReader { proxy in
      GeometryReader { geo in
        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            if !startsAtTitle { ChatHeader(subject: model.route.subject).emptyBlock(.card, 0, into: blocks) }
            if model.thread.isEmpty { empty }
            ForEach(model.thread) { a in
              let last = a.id == model.thread.last?.id
              turn(a, last: last)
                .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { if last { lastContent = $0 } }
                // The newest question keeps a screen's height below it: the scroll on sending can put it under the bar,
                // and nothing that shrinks under it (the steps folding) moves it.
                .frame(minHeight: last ? max(restHeight, geo.size.height) : nil, alignment: .top)
                .onScrollVisible { v in
                  visible[a.id] = v
                  if v, a.id == model.thread.last?.id { newBelow = false }
                }
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .scrollView).minY } action: { if last { lastTop = $0 } }
            }
            // The thread's very end, for the round ↓: an answer can be taller than the screen.
            Color.clear.frame(height: 0).id(Self.end)
          }
          .padding(.horizontal)
          .padding(.bottom, 16)
          .coordinateSpace(name: Self.content)
          .onGeometryChange(for: CGFloat.self) { -$0.frame(in: .scrollView).minY } action: { scrolled = $0 }
          // The empty screen over the box, by what `placeEmpty` moved it.
          .offset(y: model.thread.isEmpty ? restPlace - placed : 0)
        }
        .scrollDismissesKeyboard(.interactively)
        .modifier(WhenReaderScrolls { readerMoved = true })
        .defaultScrollAnchor(.top)
        // On the scroll view alone: around the composer too, it stood over the box's, send's and the line's own.
        .accessibilityIdentifier("chat")
        .onChange(of: model.thread.last?.id) {
          waitEnd = nil
          readerMoved = false
          guard let id = model.thread.last?.id else { return }
          Task { @MainActor in withAnimation(reduceMotion ? nil : .smooth(duration: 0.35)) { proxy.scrollTo(id, anchor: .top) } }
        }
        .onChange(of: model.thread.last?.outcome) { _, o in if o == .answered, !lastInView { newBelow = true } }
        .onChange(of: scrollBack) { _, id in
          guard let id else { return }
          scrollBack = nil
          withAnimation(reduceMotion ? nil : .smooth(duration: 0.35)) { proxy.scrollTo(id, anchor: .top) }
        }
        // The first words, and the keyboard going down (an answer that came with it up, at the largest text): the question
        // back under the bar, with the keyboard's own glide, unless the reader has scrolled off its turn.
        .onChange(of: model.thread.last?.reply.writing) { _, w in
          if w == true { pinIfOnIt(proxy, height: geo.size.height); waitEnd = nil }
        }
        .onChange(of: waited) { keepWaitAboveBox(proxy, bottom: geo.size.height - boxHeight) }
        .onChange(of: geo.size.height, initial: true) { _, h in
          if !typing { restHeight = h }
          placeEmpty(height: h)
        }
        .onChange(of: typing) { _, up in
          if up {
            restPlace = max(0, scrolled)
            placed = restPlace
          } else {
            pinIfOnIt(proxy, height: geo.size.height)
          }
          placeEmpty(height: geo.size.height)
        }
        .onChange(of: boxHeight) {
          if model.draft.isEmpty { emptyBox = boxHeight }
          placeEmpty(height: geo.size.height)
        }
        .onChange(of: model.thread.isEmpty) { placed = 0; restPlace = 0 }
        .onChange(of: signedOut) { blocks.all = [:] }
        .safeAreaInset(edge: .bottom, spacing: 0) {
          // The newest question below the box: the reader is in earlier turns, its turn (a screen at least) all below.
          let farUp = !model.thread.isEmpty && (lastTop ?? 0) > geo.size.height - boxHeight
          ChatComposer(model: model, typing: $typing, signedOut: signedOut, newBelow: newBelow, farUp: farUp) {
            newBelow = false
            if let id = model.thread.last?.id { withAnimation { proxy.scrollTo(id, anchor: .top) } }
          } toEnd: {
            // A last turn that fits above the box goes under the bar, where it sat when answered; a taller one to its end.
            withAnimation(reduceMotion ? nil : .smooth(duration: 0.35)) {
              if lastContent <= geo.size.height - boxHeight, let id = model.thread.last?.id {
                proxy.scrollTo(id, anchor: .top)
              } else {
                proxy.scrollTo(Self.end, anchor: .bottom)
              }
            }
          }
          .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { boxHeight = $0 }
        }
      }
    }
    .navigationDestination(item: $onSite) { WebScreen(url: $0) }
    // A light tap as a question goes; a soft one as its answer starts; a warning when one is stopped or fails.
    .sensoryFeedback(.impact(weight: .light), trigger: model.thread.count) { a, b in b > a }
    .sensoryFeedback(.impact(flexibility: .soft), trigger: model.thread.last?.reply.writing) { _, b in b == true }
    .sensoryFeedback(.warning, trigger: warned) { _, b in b }
  }

  /// "Sửa và hỏi lại": the question back in the box, keyboard up, unless the day is refused (nothing can be sent).
  private func editAgain(_ question: String) {
    model.editAgain(question)
    if model.stop == nil { typing = true }
  }

  private static let end = "chat-end"
  private static let waiting = "chat-waiting"
  fileprivate static let content = "chat-content"

  private var warned: Bool {
    if model.stop != nil { return true }
    switch model.thread.last?.outcome { case .failed?, .lost?: return true; default: return false }
  }

  // MARK: Empty

  private var subjectName: String { ChatNames.inSentence(model.route.subject.name) }
  /// The largest text, empty: the title names the fish, so its card goes and the first starters clear the box. A
  /// photo's card stays, since "Hỏi gì về con cá này?" names none.
  private var startsAtTitle: Bool { size.isAccessibilitySize && model.thread.isEmpty && !model.route.subject.fromPhoto }

  @ViewBuilder private var empty: some View {
    let s = model.route.subject
    VStack(alignment: .leading, spacing: 8) {
      Group {
        if s.fromPhoto { Text(s.plant ? "Hỏi gì về cây này?" : "Hỏi gì về con cá này?") } else { Text("Hỏi gì về \(subjectName)?") }
      }
      .font(.title2.weight(.bold))
      .accessibilityAddTraits(.isHeader)
      .emptyBlock(.title, 1, into: blocks)
      WhoAnswers(fromPhoto: s.fromPhoto).emptyBlock(.line, 2, into: blocks)
      // Signed out, none of them could be sent: the sign-in card instead. At the first letter typed the starters fade,
      // and come back when the box is empty: the title and the line about who answers are left, so the box has nothing
      // to cut as it grows.
      if signedOut {
        ChatSignIn().padding(.top, 12).emptyBlock(.starter, 3, into: blocks)
      } else {
        // Faded, not gone: the screen's place counts them, so a box emptied again sits where a fresh tap does.
        Chips(items: starters, stacked: true, dim: model.offline || model.stop != nil, placed: { i, r in
          blocks.all[3 + i] = Chat.EmptyBlock(.starter, top: Double(r.minY), height: Double(r.height))
        }) { model.send($0) }
        .padding(.top, size.isAccessibilitySize ? 2 : 12)
        .opacity(model.draft.isEmpty ? 1 : 0)
        .allowsHitTesting(model.draft.isEmpty)
        .accessibilityHidden(!model.draft.isEmpty)
      }
    }
    .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: model.draft.isEmpty)
    .padding(.top, startsAtTitle ? 0 : 24)
    .transition(.opacity)
  }

  /// The app's own first questions, by what the chat is about.
  private var starters: [String] {
    let s = model.route.subject
    if s.plant {
      return [String(localized: "Có cần CO₂ không?"), String(localized: "Trồng ở đâu trong bể?"), String(localized: "Có dễ trồng không?")]
    }
    let third = s.second.map { String(localized: "Làm sao phân biệt với \(ChatNames.inSentence($0))?") } ?? String(localized: "Có dễ nuôi không?")
    return [String(localized: "Nuôi chung với cá gì được?"), String(localized: "Bể bao nhiêu lít là đủ?"), third]
  }

  // MARK: A question and its answer

  @ViewBuilder private func turn(_ a: ChatModel.Asked, last: Bool) -> some View {
    VStack(alignment: .leading, spacing: 12) {
      if a.anew { NewConversation() }
      // Its answer still on its way, only copied: editing it then is the stop (#767), so nothing is asked twice.
      Bubble(text: a.question, editAgain: last && model.answering ? nil : { editAgain(a.question) }).id(a.id)
      switch a.outcome {
      // Asked again only under the latest question.
      case .failed(let code) where code != "cut" && (!a.reply.text.isEmpty || a.reply.opening != nil):
        // Cut off after its text began, or after the wait's first line: the box folded as at the first words, what was
        // read stays, the card under it (the Worker gives the question back).
        if let fold = Chat.fold(a.reply.steps) { foldRow(fold, a) }
        unfoldedList(a)
        if !a.reply.text.isEmpty { AnswerText(text: a.reply.text, whole: true, animate: false) }
        CutOffCard(again: last ? { model.retry(a.id) } : nil).transition(.opacity)
      case .failed(let code):
        FailedCard(code: code, perAccount: model.perAccount, again: last ? { model.retry(a.id) } : nil).transition(.opacity)
      case .lost:
        LostCard(again: last ? { model.retry(a.id) } : nil).transition(.opacity)
      case .asking, .answered:
        answer(a, last: last)
      }
    }
    .padding(.top, 20)
    .animation(reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.3), value: a.outcome)
    .animation(reduceMotion ? .easeInOut(duration: 0.2) : .smooth(duration: 0.3), value: a.reply.writing)
  }

  @ViewBuilder private func answer(_ a: ChatModel.Asked, last: Bool) -> some View {
    let r = a.reply
    if !r.writing {
      // Waiting: the first line, then each step done as it comes, above the one row that waits.
      VStack(alignment: .leading, spacing: 8) {
        // Always first, even after a step that came before it; it fades in and the rows under it move down on one curve.
        if let line = r.opening { openingLine(line).transition(.opacity) }
        ForEach(Array(r.steps.enumerated()), id: \.offset) { _, s in step(s, opens: false).transition(.opacity.combined(with: .offset(y: 4))) }
        if a.outcome == .asking {
          Waiting()
            .id(Self.waiting)
            .onGeometryChange(for: CGFloat.self) { $0.frame(in: .scrollView).maxY } action: { waitEnd = $0 }
        }
      }
      .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: r.steps.count)
      .animation(reduceMotion ? nil : .easeOut(duration: 0.2), value: r.opening)
      // Read once as it comes, without cutting in: no haptic (the soft one stays with the first words).
      .onChange(of: r.opening) { old, new in if old == nil, let new { Self.politely(new) } }
      // As the text starts, the row closes clipped, so its fading steps never paint over the first line.
      .transition(.closing)
    } else {
      if let fold = Chat.fold(r.steps) { foldRow(fold, a) }
      unfoldedList(a)
      AnswerText(text: r.text, whole: r.turn != nil, animate: !a.resumed && !r.whole && !reduceMotion)
      if r.turn == nil, a.outcome == .asking { Pause(text: r.text) }
      if let t = r.turn {
        if !t.covered {
          Text("Đã ghi lại câu hỏi để cẩm nang viết thêm.").font(.footnote).foregroundStyle(.secondary)
        }
        // Once the text is whole: the blocks it leans on, then the next questions.
        if !t.blocks.isEmpty {
          ChatBlocks(blocks: t.blocks, about: model.route.start.about, covered: t.covered, staggered: !a.resumed && !r.whole && !reduceMotion, turn: a.id,
                     reveal: { scrollBack = $0 }) { path in
            if let u = URL(string: path, relativeTo: handbook.site)?.absoluteURL { open(u) }
          }
        }
        if last, !t.suggestions.isEmpty {
          Chips(items: t.suggestions, dim: model.offline || model.stop != nil) { model.send($0) }
            .padding(.top, 4)
            .transition(.opacity.combined(with: .offset(y: 4)))
        }
      }
    }
  }

  /// The fold row opened: the wait's first line first, then the steps.
  @ViewBuilder private func unfoldedList(_ a: ChatModel.Asked) -> some View {
    if unfolded.contains(a.id) {
      VStack(alignment: .leading, spacing: 8) {
        if let line = a.reply.opening { openingLine(line) }
        ForEach(Array(a.reply.steps.enumerated()), id: \.offset) { _, s in step(s, opens: true) }
      }
      .padding(.leading, 4)
    }
  }

  /// The wait's first line (docs/design/chat.md, "The first line"): the steps' type, the box's full width, no glyph, plain
  /// text. The answer's text, body size and primary under no box, never looks like it.
  private func openingLine(_ line: String) -> some View {
    Text(verbatim: line).font(.subheadline).foregroundStyle(.secondary)
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityIdentifier("chat-opening")
  }

  /// A polite announcement: spoken once what's being said ends, not over it.
  static func politely(_ line: String) {
    var words = AttributedString(line)
    words.accessibilitySpeechAnnouncementPriority = .low
    AccessibilityNotification.Announcement(words).post()
  }

  private func foldRow(_ fold: Chat.Fold, _ a: ChatModel.Asked) -> some View {
    let open = unfolded.contains(a.id)
    return Button {
      if open { unfolded.remove(a.id) } else { unfolded.insert(a.id) }
    } label: {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Image(systemName: "book.closed.fill").font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)
        Text(Self.label(fold)).multilineTextAlignment(.leading)
        Image(systemName: "chevron.down").font(.caption.weight(.semibold)).rotationEffect(.degrees(open ? 180 : 0)).foregroundStyle(.tertiary)
          .accessibilityHidden(true)
      }
      .font(.subheadline)
      .foregroundStyle(.secondary)
    }
    .buttonStyle(.plain)
    .accessibilityIdentifier("chat-fold")
    .accessibilityValue(open ? Text("Đang mở") : Text("Đang đóng"))
    .transition(.opacity)
  }

  static func label(_ fold: Chat.Fold) -> String {
    switch fold {
    case .pages(let n): String(localized: "Đã đọc \(n) trang trong cẩm nang")
    case .searched: String(localized: "Đã tìm trong cẩm nang")
    case .tanks: String(localized: "Đã xem bể của bạn")
    case .mates: String(localized: "Đã kiểm tra nuôi chung")
    }
  }

  /// A step, done: a page read opens it; a search is Claude's own words.
  /// One step, grey; `opens`, in the fold's opened list, a page read is a tinted link to it.
  @ViewBuilder private func step(_ s: Chat.Step, opens: Bool) -> some View {
    let line = HStack(alignment: .firstTextBaseline, spacing: 6) {
      Image(systemName: "checkmark").font(.caption.weight(.semibold)).foregroundStyle(.secondary).accessibilityHidden(true)
      switch s {
      case .search(let q): Text("Đã tìm “\(q)”")
      case .read(let p): Text("Đã đọc \(p.title)")
      case .tanks: Text("Đã xem bể của bạn")
      case .mates: Text("Đã kiểm tra nuôi chung")
      }
    }
    .font(.subheadline)
    .foregroundStyle(.secondary)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("chat-step")
    if opens, case .read(let p) = s, let u = URL(string: p.path, relativeTo: handbook.site)?.absoluteURL {
      Button { open(u) } label: { line.foregroundStyle(.tint) }.buttonStyle(.plain)
    } else {
      line
    }
  }

  private func open(_ u: URL) {
    guard let screen = AppScreen.of(u, site: handbook.site, lang: handbook.lang, listed: { handbook.item(at: $0) != nil }) else {
      onSite = u
      return
    }
    if case .page(let path) = screen, let heading = u.fragment(percentEncoded: false) { handbook.openingAt = (path, heading) }
    openScreen(screen)
  }
}

/// What the chat is about: the page's photo and name; from fish ID, the reader's photo stays on the phone, and its guesses
/// as fish ID words them.
private struct ChatHeader: View {
  let subject: ChatSubject
  @ScaledMetric private var width: CGFloat = 52
  @ScaledMetric private var height: CGFloat = 40
  @ScaledMetric(relativeTo: .subheadline) private var small: CGFloat = 14
  @Environment(\.dynamicTypeSize) private var size
  private var ax: Bool { size.isAccessibilitySize }
  private var nameFont: Font { ax ? .system(size: 30, weight: .semibold) : .callout.weight(.semibold) }
  private var subFont: Font { .system(size: ax ? 26 : small) }

  var body: some View {
    HStack(alignment: subject.fromPhoto ? .top : .center, spacing: 12) {
      Group {
        if let img = subject.img {
          PageImage(src: img.absoluteString, ratio: 1, corner: 0)
        } else {
          // The species has no photo: what it is, not a picture that failed to load.
          Image(systemName: subject.plant ? "leaf.fill" : "fish.fill").font(.title3).foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.fill.tertiary)
        }
      }
      .frame(width: ax ? 80 : width, height: ax ? 62 : subject.fromPhoto ? width : height)
      .clipShape(.rect(cornerRadius: 10))
      .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 0) {
        if let guesses = subject.guesses {
          Text("Về: ảnh của bạn").font(nameFont)
          Text(guesses).font(subFont).foregroundStyle(.secondary)
        } else {
          Text("Về: \(subject.name)").font(nameFont)
          if let sci = subject.sci { Text(verbatim: sci).font(subFont).italic().foregroundStyle(.secondary) }
        }
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Color(uiColor: .secondarySystemGroupedBackground), in: .rect(cornerRadius: 18))
    .padding(.top, 12)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("chat-about")
  }
}

/// Who answers and from what: the whole line until this phone has had an answer, then only that Claude, an AI, answers
/// from the handbook (each answer's general-knowledge mark says the rest). Read as the empty screen first draws, so a
/// line on screen never changes in front of the reader. A no-break space keeps "(AI)" from standing alone on a line.
private struct WhoAnswers: View {
  let fromPhoto: Bool
  @State private var short = ChatModel.hadAnswer

  var body: some View {
    Group {
      switch (short, fromPhoto) {
      case (false, false):
        Text("Claude (AI của Anthropic) trả lời theo cẩm nang AquaTome, chỗ nào cẩm nang chưa nói đến thì dùng kiến thức chung về nuôi cá.")
      case (false, true):
        Text("Claude (AI của Anthropic) trả lời theo cẩm nang AquaTome, chỗ nào cẩm nang chưa nói đến thì dùng kiến thức chung về nuôi cá. AquaTome không gửi ảnh của bạn kèm câu hỏi.")
      case (true, false):
        Text("Claude\u{00A0}(AI) trả lời theo cẩm nang AquaTome.")
      case (true, true):
        Text("Claude\u{00A0}(AI) trả lời theo cẩm nang AquaTome. AquaTome không gửi ảnh của bạn kèm câu hỏi.")
      }
    }
    .foregroundStyle(.secondary)
  }
}

/// The reader's question, at the trailing side: a long one shows its first six lines, and "Xem thêm" under it opens it
/// whole.
private struct Bubble: View {
  let text: String
  /// "Sửa và hỏi lại" in its long-press menu; nil, only "Sao chép".
  let editAgain: (() -> Void)?
  @Environment(\.colorScheme) private var scheme
  @State private var whole = false
  /// The question's height in full, and as shown: taller in full, six lines cut it.
  @State private var full: CGFloat = 0
  @State private var shown: CGFloat = 0

  var body: some View {
    VStack(alignment: .trailing, spacing: 4) {
      bubble
      if !whole, full > shown + 1 {
        Button { withAnimation(.smooth(duration: 0.3)) { whole = true } } label: { Text("Xem thêm").font(.subheadline) }
          .buttonStyle(.plain)
          .foregroundStyle(.tint)
          .accessibilityIdentifier("chat-more")
      }
    }
    .frame(maxWidth: .infinity, alignment: .trailing)
    .padding(.leading, 48)
  }

  private var bubble: some View {
    Text(text)
      .lineLimit(whole ? nil : 6)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { shown = $0 }
      .background {
        Text(text).fixedSize(horizontal: false, vertical: true).hidden()
          .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { full = $0 }
      }
      .padding(.horizontal, 14)
      .padding(.vertical, 9)
      // Dark: a deep green, not the bright tint: the answer is what the eye should go to.
      .foregroundStyle(.white)
      .background(scheme == .dark ? Color(red: 0x24 / 255, green: 0x58 / 255, blue: 0x4A / 255) : Color.accentColor, in: Self.shape)
      // Long-pressed, the bubble lifts with a short menu by it, as Messages does; VoiceOver offers the same as its actions.
      .contentShape(.contextMenuPreview, Self.shape)
      .contextMenu { menu }
      .accessibilityLabel(Text("Bạn hỏi: \(text)"))
      .accessibilityActions { menu }
      .accessibilityIdentifier("chat-question")
  }

  /// Its corner by the reader's edge small, as a speech bubble's.
  private static let shape = UnevenRoundedRectangle(cornerRadii: .init(topLeading: 20, bottomLeading: 20, bottomTrailing: 6, topTrailing: 20))

  @ViewBuilder private var menu: some View {
    Button("Sao chép", systemImage: "doc.on.doc") { UIPasteboard.general.string = text }
    if let editAgain { Button("Sửa và hỏi lại", systemImage: "pencil", action: editAgain) }
  }
}

/// The one row that waits, said once by VoiceOver as it starts.
private struct Waiting: View {
  var body: some View {
    HStack(spacing: 8) {
      ProgressView()
      Text("Đang soạn câu trả lời…")
    }
    .font(.subheadline)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("chat-wait")
    .transition(.opacity)
    .onAppear { AccessibilityNotification.Announcement(String(localized: "Đang soạn câu trả lời")).post() }
  }
}

/// The answer's text: its parts, numbered steps as a list (the number in its own column, a wrapped line hanging under
/// its own words). VoiceOver reads it once, whole; until then it isn't read piece by piece.
private struct AnswerText: View {
  let text: String
  let whole: Bool
  /// Each piece fades in as it comes; drawn at once when it came whole (back from the background) or under Reduce
  /// Motion.
  let animate: Bool
  @ScaledMetric private var number: CGFloat = 22
  /// The pieces still fading in (Chat.Pieces): only their opacity moves, so the words already there stay still.
  @State private var pieces = Chat.Pieces()

  private enum Drawn {
    case text(Text)
    case list([(n: Int, text: Text, words: String)])
  }

  var body: some View {
    TimelineView(.animation(paused: pieces.isEmpty)) { time in
      VStack(alignment: .leading, spacing: 12) {
        ForEach(Array(drawn(at: time.date).enumerated()), id: \.offset) { _, p in
          switch p {
          case .text(let t):
            t.frame(maxWidth: .infinity, alignment: .leading)
          case .list(let items):
            VStack(alignment: .leading, spacing: 6) {
              ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                  Text(verbatim: "\(item.n).").monospacedDigit().frame(minWidth: number, alignment: .trailing)
                  item.text.frame(maxWidth: .infinity, alignment: .leading)
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(item.words))
                .accessibilityValue(Text("\(i + 1) trên \(items.count)"))
              }
            }
          }
        }
      }
    }
    .textSelection(.enabled)
    .onChange(of: text) { old, new in pieces.changed(from: old, to: new, at: .now, fading: animate && !whole) }
    // The last fade over: the redrawing stops.
    .task(id: pieces.newest) {
      guard !pieces.isEmpty else { return }
      try? await Task.sleep(for: .seconds(Chat.Pieces.fade))
      pieces.settle(at: .now)
    }
    .accessibilityElement(children: .contain)
    .accessibilityHidden(!whole)
    .accessibilityIdentifier("chat-answer")
    .onChange(of: whole) { _, w in if w { AccessibilityNotification.Announcement(text).post() } }
  }

  /// The text's parts as drawn at `now`, each piece still fading in at its own opacity.
  private func drawn(at now: Date) -> [Drawn] {
    let parts = Chat.paragraphs(text, streaming: !whole)
    let words = parts.flatMap { p -> [String] in
      switch p {
      case .text(let s): [s]
      case .list(let items): items.map(\.text)
      }
    }
    var runs = pieces.runs(of: words, in: text, at: now).makeIterator()
    func next() -> Text {
      (runs.next() ?? []).reduce(Text(verbatim: "")) { t, r in
        let piece = Text(verbatim: r.words)
        return t + (r.opacity < 1 ? piece.foregroundStyle(Color.primary.opacity(r.opacity)) : piece)
      }
    }
    return parts.map { p in
      switch p {
      case .text: .text(next())
      case .list(let items): .list(items.map { (n: $0.n, text: next(), words: $0.text) })
      }
    }
  }
}

/// No piece for 0.3 s before `done` (Claude writing the cards and suggestions, the Worker saving): the wait's spinner,
/// with no words, under the last line, so the answer doesn't look finished while nothing moves. `done` takes it away (the
/// first card takes its place).
private struct Pause: View {
  let text: String
  @State private var still = false

  var body: some View {
    // A view even before the spinner shows: SwiftUI runs no task on an empty one, so the spinner never came. The spinner
    // lies over the room under the last line, so it takes no space and nothing moves as it comes or goes.
    Color.clear.frame(height: 0)
      .frame(maxWidth: .infinity, alignment: .leading)
      .overlay(alignment: .topLeading) {
        if still { ProgressView().controlSize(.small).transition(.opacity).accessibilityIdentifier("chat-pause") }
      }
      .task(id: text) {
        still = false
        try? await Task.sleep(for: .seconds(0.3))
        if !Task.isCancelled { withAnimation(.easeOut(duration: 0.15)) { still = true } }
      }
  }
}

/// A row closing: its height goes to nothing with it clipped, as it fades.
private struct Closing: ViewModifier {
  let closed: Bool
  func body(content: Content) -> some View {
    content.frame(height: closed ? 0 : nil, alignment: .top).clipped().opacity(closed ? 0 : 1)
  }
}

extension AnyTransition {
  fileprivate static var closing: AnyTransition { .modifier(active: Closing(closed: true), identity: Closing(closed: false)) }
}

/// A new conversation starts here: Claude no longer has the questions above.
private struct NewConversation: View {
  var body: some View {
    VStack(spacing: 2) {
      HStack {
        line
        Text("Cuộc trò chuyện mới").font(.footnote.weight(.semibold))
        line
      }
      Text("Claude không nhớ những gì ở trên").font(.footnote)
    }
    .foregroundStyle(.secondary)
    .frame(maxWidth: .infinity)
    .padding(.vertical, 8)
    .accessibilityElement(children: .combine)
    .accessibilityIdentifier("chat-new-conversation")
    .transition(.opacity)
  }

  private var line: some View { Rectangle().fill(.separator).frame(height: 1) }
}

/// A question sent that got no answer: whether it counted, and asking again under it.
private struct FailedCard: View {
  let code: String
  let perAccount: Int?
  let again: (() -> Void)?

  var body: some View {
    // `failed`: our side couldn't use Claude's answer, and it counts; else Claude couldn't be reached, or the answer was
    // cut short (asked again with its key, it isn't counted twice).
    let counted = code == "failed"
    ChatCard(icon: "exclamationmark.triangle", title: counted ? Text("Không nhận được câu trả lời") : Text("Chưa trả lời được câu này")) {
      if counted {
        if let perAccount { Text("Câu này vẫn bị tính vào \(perAccount) câu hôm nay.") } else { Text("Câu này vẫn được tính vào số câu hôm nay.") }
      } else {
        Text("Chưa kết nối được với Claude. Câu này không bị tính.")
      }
    } action: {
      if let again { Button(action: again) { counted ? Text("Hỏi lại · tính thêm 1 câu") : Text("Thử lại") }.accessibilityIdentifier("chat-again") }
    }
    .accessibilityIdentifier("chat-failed")
  }
}

/// An answer cut off after its text began (the text stays above it). The Worker gives the question back for any error
/// once text has gone out, so it isn't counted: only a finished answer counts. Asked again, the text and its row go and
/// the wait starts under the same bubble.
private struct CutOffCard: View {
  let again: (() -> Void)?

  var body: some View {
    ChatCard(icon: "exclamationmark.triangle", title: Text("Câu trả lời bị ngắt giữa chừng")) {
      Text("Câu hỏi này không bị tính.")
    } action: {
      if let again { Button(action: again) { Text("Hỏi lại") }.accessibilityIdentifier("chat-again") }
    }
    .accessibilityIdentifier("chat-cut-off")
  }
}

/// A question asked again after the app had left it, past its conversation's 24 hours: its answer can't be had.
private struct LostCard: View {
  let again: (() -> Void)?
  var body: some View {
    ChatCard(icon: "clock.badge.exclamationmark", title: Text("Không lấy lại được câu trả lời này")) {
      EmptyView()
    } action: {
      if let again { Button("Hỏi lại", action: again).accessibilityIdentifier("chat-again") }
    }
    .accessibilityIdentifier("chat-lost")
  }
}

/// A card under a question or over the box: a title, what to know, what to do.
struct ChatCard<Words: View, Actions: View>: View {
  let icon: String
  let title: Text
  @ViewBuilder let text: Words
  @ViewBuilder let action: Actions

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Label { title.font(.subheadline.weight(.semibold)) } icon: { Image(systemName: icon).foregroundStyle(.orange) }
      text.font(.subheadline).foregroundStyle(.secondary)
      action.font(.subheadline.weight(.semibold)).padding(.top, 2)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .background(.fill.quaternary, in: .rect(cornerRadius: 14))
    .accessibilityElement(children: .contain)
  }
}

/// Signed out, or the session ended: signing in takes the starters' place; nothing can be sent.
struct ChatSignIn: View {
  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text("Đăng nhập để hỏi").font(.headline)
      Text("Câu hỏi được lưu với tài khoản aquatome.com của bạn.").font(.subheadline).foregroundStyle(.secondary)
      SignInButton()
      AccountMessage()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .background(.fill.quaternary, in: .rect(cornerRadius: 14))
    .accessibilityElement(children: .contain)
    .accessibilityIdentifier("chat-sign-in")
  }
}

/// Questions to tap, each a chip: one to a row (`stacked`, the starters), or wrapping onto the next line.
private struct Chips: View {
  let items: [String]
  var stacked = false
  /// Nothing can be sent now (the day used, offline): a tap puts it in the box.
  let dim: Bool
  /// Each one's place in the chat's content (the empty screen's starters).
  var placed: ((Int, CGRect) -> Void)? = nil
  let tap: (String) -> Void

  var body: some View {
    Group {
      if stacked {
        VStack(alignment: .leading, spacing: 8) { chips }
      } else {
        Wrap(spacing: 8) { chips }
      }
    }
    .opacity(dim ? 0.45 : 1)
  }

  private var chips: some View {
    ForEach(Array(items.enumerated()), id: \.element) { i, q in
      Button { tap(q) } label: {
        Text(q).multilineTextAlignment(.leading).font(.callout.weight(.medium)).foregroundStyle(.tint)
          .padding(.horizontal, 14).padding(.vertical, 10)
          .background(Color(uiColor: .secondarySystemGroupedBackground), in: .rect(cornerRadius: 20))
          .overlay { RoundedRectangle(cornerRadius: 20).strokeBorder(Color.chatHairline, lineWidth: 0.5) }
      }
      .buttonStyle(.plain)
      .accessibilityIdentifier("chat-chip")
      .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(ChatThread.content)) } action: { placed?(i, $0) }
    }
  }
}

/// Calls `action` as the reader starts dragging a scroll view, where iOS can say (18 on).
private struct WhenReaderScrolls: ViewModifier {
  let action: () -> Void

  func body(content: Content) -> some View {
    if #available(iOS 18, *) {
      content.onScrollPhaseChange { _, new in if new == .interacting { action() } }
    } else {
      content
    }
  }
}

/// The empty screen's blocks, each reporting its own place. A box, not a `State` dictionary: reports landing in one update
/// each wrote over the last, leaving only the starters.
@MainActor private final class EmptyBlocks {
  var all: [Int: Chat.EmptyBlock] = [:]
}

private extension View {
  /// Reports this block's place in the chat's content, for where the empty screen rests over the box.
  func emptyBlock(_ kind: Chat.EmptyBlock.Kind, _ i: Int, into blocks: EmptyBlocks) -> some View {
    onGeometryChange(for: CGRect.self) { $0.frame(in: .named(ChatThread.content)) } action: {
      blocks.all[i] = Chat.EmptyBlock(kind, top: Double($0.minY), height: Double($0.height))
    }
  }
}

extension Color {
  /// The hairline round a chip and the box.
  static let chatHairline = Color(uiColor: UIColor { $0.userInterfaceStyle == .dark ? UIColor(white: 1, alpha: 0.08) : UIColor(white: 0, alpha: 0.06) })
}

/// Views in rows, each row as many as fit.
private struct Wrap: Layout {
  var spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    var x: CGFloat = 0, y: CGFloat = 0, row: CGFloat = 0, widest: CGFloat = 0
    for s in subviews {
      let size = s.sizeThatFits(ProposedViewSize(width: width, height: nil))
      if x > 0 && x + size.width > width { y += row + spacing; x = 0; row = 0 }
      x += size.width + spacing
      row = max(row, size.height)
      widest = max(widest, x - spacing)
    }
    return CGSize(width: min(widest, width), height: y + row)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var x = bounds.minX, y = bounds.minY, row: CGFloat = 0
    for s in subviews {
      let size = s.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
      if x > bounds.minX && x + size.width > bounds.maxX { y += row + spacing; x = bounds.minX; row = 0 }
      s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: min(size.width, bounds.width), height: size.height))
      x += size.width + spacing
      row = max(row, size.height)
    }
  }
}

extension View {
  /// Told whether this view is on screen as the thread scrolls (iOS 18 on; before, never told).
  @ViewBuilder func onScrollVisible(_ seen: @escaping (Bool) -> Void) -> some View {
    if #available(iOS 18.0, *) { onScrollVisibilityChange(threshold: 0.05, seen) } else { self }
  }
}
