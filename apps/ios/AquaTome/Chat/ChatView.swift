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
    .navigationTitle("Hỏi AquaTome")
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
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
  @State private var lastInView = true
  /// A section closed with its heading off the screen: back to it.
  @State private var scrollBack: String?
  /// Where the newest question's top is in the view (nil off it): near the top, the reader is still on its turn, so the
  /// first words and the keyboard going down put it back under the bar; scrolled into earlier turns or down the answer,
  /// nothing moves.
  @State private var lastTop: CGFloat?

  private var signedOut: Bool { account.user == nil }

  private func pinIfOnIt(_ proxy: ScrollViewProxy, height: CGFloat) {
    guard let id = model.thread.last?.id, let top = lastTop, top > -8, top < height * 0.4 else { return }
    withAnimation(reduceMotion ? nil : .smooth(duration: 0.3)) { proxy.scrollTo(id, anchor: .top) }
  }

  var body: some View {
    ScrollViewReader { proxy in
      GeometryReader { geo in
        ScrollView {
          VStack(alignment: .leading, spacing: 0) {
            ChatHeader(subject: model.route.subject)
            if model.thread.isEmpty { empty }
            ForEach(model.thread) { a in
              let last = a.id == model.thread.last?.id
              turn(a, last: last)
                // The newest question keeps a screen's height below it: the scroll on sending can put it under the bar,
                // and nothing that shrinks under it (the steps folding) moves it.
                .frame(minHeight: last ? geo.size.height : nil, alignment: .top)
                .onScrollVisible(last) { lastInView = $0; if $0 { newBelow = false } }
                .onGeometryChange(for: CGFloat.self) { $0.frame(in: .scrollView).minY } action: { if last { lastTop = $0 } }
            }
          }
          .padding(.horizontal)
          .padding(.bottom, 16)
        }
        .scrollDismissesKeyboard(.interactively)
        .defaultScrollAnchor(.top)
        // On the scroll view alone: around the composer too, it stood over the box's, send's and the line's own.
        .accessibilityIdentifier("chat")
        .onChange(of: model.thread.last?.id) {
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
        .onChange(of: model.thread.last?.reply.writing) { _, w in if w == true { pinIfOnIt(proxy, height: geo.size.height) } }
        .onChange(of: typing) { _, up in if !up { pinIfOnIt(proxy, height: geo.size.height) } }
        .safeAreaInset(edge: .bottom, spacing: 0) {
          ChatComposer(model: model, typing: $typing, signedOut: signedOut, newBelow: newBelow) {
            newBelow = false
            if let id = model.thread.last?.id { withAnimation { proxy.scrollTo(id, anchor: .top) } }
          }
        }
      }
    }
    .navigationDestination(item: $onSite) { WebScreen(url: $0) }
    // A light tap as a question goes; a soft one as its answer starts; a warning when one is stopped or fails.
    .sensoryFeedback(.impact(weight: .light), trigger: model.thread.count) { a, b in b > a }
    .sensoryFeedback(.impact(flexibility: .soft), trigger: model.thread.last?.reply.writing) { _, b in b == true }
    .sensoryFeedback(.warning, trigger: warned) { _, b in b }
  }

  private var warned: Bool {
    if model.stop != nil { return true }
    switch model.thread.last?.outcome { case .failed?, .lost?: return true; default: return false }
  }

  // MARK: Empty

  private var subjectName: String { ChatNames.inSentence(model.route.subject.name) }

  @ViewBuilder private var empty: some View {
    let s = model.route.subject
    VStack(alignment: .leading, spacing: 8) {
      Group {
        if s.fromPhoto { Text(s.plant ? "Hỏi gì về cây này?" : "Hỏi gì về con cá này?") } else { Text("Hỏi gì về \(subjectName)?") }
      }
      .font(.title2.weight(.bold))
      .accessibilityAddTraits(.isHeader)
      WhoAnswers(fromPhoto: s.fromPhoto)
      // Signed out, none of them could be sent: the sign-in card instead.
      if signedOut {
        ChatSignIn().padding(.top, 12)
      } else {
        Chips(items: starters, dim: model.offline || model.stop != nil) { model.send($0) }.padding(.top, 12)
      }
    }
    .padding(.top, 24)
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
      Bubble(text: a.question).id(a.id)
      switch a.outcome {
      // Asked again only under the latest question.
      case .failed(let code) where code != "cut" && !a.reply.text.isEmpty:
        // Cut off after its text began: what was read stays, the card under it.
        if let fold = Chat.fold(a.reply.steps) { foldRow(fold, a) }
        AnswerText(text: a.reply.text, whole: true, animate: false)
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
      // Waiting: each step done as it comes, above the one row that waits.
      VStack(alignment: .leading, spacing: 8) {
        ForEach(Array(r.steps.enumerated()), id: \.offset) { _, s in step(s).transition(.opacity.combined(with: .offset(y: 4))) }
        if a.outcome == .asking { Waiting() }
      }
      .animation(reduceMotion ? nil : .easeOut(duration: 0.25), value: r.steps.count)
      // As the text starts, the row closes clipped, so its fading steps never paint over the first line.
      .transition(.closing)
    } else {
      if let fold = Chat.fold(r.steps) { foldRow(fold, a) }
      if unfolded.contains(a.id) {
        VStack(alignment: .leading, spacing: 8) { ForEach(Array(r.steps.enumerated()), id: \.offset) { _, s in step(s) } }
          .padding(.leading, 4)
      }
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

  private func foldRow(_ fold: Chat.Fold, _ a: ChatModel.Asked) -> some View {
    let open = unfolded.contains(a.id)
    return Button {
      if open { unfolded.remove(a.id) } else { unfolded.insert(a.id) }
    } label: {
      HStack(alignment: .firstTextBaseline, spacing: 6) {
        Image(systemName: "checkmark.circle").foregroundStyle(.secondary).accessibilityHidden(true)
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
  @ViewBuilder private func step(_ s: Chat.Step) -> some View {
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
    if case .read(let p) = s, let u = URL(string: p.path, relativeTo: handbook.site)?.absoluteURL {
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
  @ScaledMetric private var side: CGFloat = 44

  var body: some View {
    HStack(alignment: subject.fromPhoto ? .top : .center, spacing: 12) {
      Group {
        if let img = subject.img {
          PageImage(src: img.absoluteString, ratio: 1, corner: 0)
        } else {
          Image(systemName: "photo").font(.title3).foregroundStyle(.secondary).frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(.fill.tertiary)
        }
      }
      .frame(width: side, height: side)
      .clipShape(.rect(cornerRadius: 8))
      .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        if let guesses = subject.guesses {
          Text("Về: ảnh của bạn").font(.subheadline.weight(.semibold))
          Text(guesses).font(.subheadline).foregroundStyle(.secondary)
        } else {
          Text("Về: \(subject.name)").font(.subheadline.weight(.semibold))
        }
      }
    }
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
      // Dark: a deep green with white text, not the bright tint: the answer is what the eye should go to.
      .foregroundStyle(scheme == .dark ? Color.white : Color.primary)
      .background(scheme == .dark ? Color(red: 0.11, green: 0.33, blue: 0.24) : Color.accentColor.opacity(0.16), in: .rect(cornerRadius: 18))
      .textSelection(.enabled)
      .accessibilityLabel(Text("Bạn hỏi: \(text)"))
      .accessibilityIdentifier("chat-question")
  }
}

/// The one row that waits, said once by VoiceOver as it starts.
private struct Waiting: View {
  var body: some View {
    HStack(spacing: 8) {
      ProgressView()
      Text("Đang soạn câu trả lời…").foregroundStyle(.secondary)
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
    Group {
      if still { ProgressView().controlSize(.small).transition(.opacity).accessibilityIdentifier("chat-pause") }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
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

/// Questions to tap, each a chip, wrapping onto the next line.
private struct Chips: View {
  let items: [String]
  /// Nothing can be sent now (the day used, offline): a tap puts it in the box.
  let dim: Bool
  let tap: (String) -> Void

  var body: some View {
    Wrap(spacing: 8) {
      ForEach(items, id: \.self) { q in
        Button { tap(q) } label: {
          Text(q).multilineTextAlignment(.leading).padding(.horizontal, 12).padding(.vertical, 8)
            .background(.fill.tertiary, in: .rect(cornerRadius: 16))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("chat-chip")
      }
    }
    .opacity(dim ? 0.45 : 1)
  }
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
  /// Told whether this view is on screen as the thread scrolls (iOS 18 on; before, always).
  @ViewBuilder func onScrollVisible(_ watch: Bool, _ seen: @escaping (Bool) -> Void) -> some View {
    if watch, #available(iOS 18.0, *) { onScrollVisibilityChange(threshold: 0.05, seen) } else { self }
  }
}
