import AccountSync
import Foundation
import Handbook
import Network
import Observation

/// What a chat is about: its header, its empty screen and its starters. A species', breed's or plant's page, or fish
/// ID's result (the reader's photo, which never goes to the chat: only its guesses).
struct ChatSubject: Hashable, Codable {
  /// A fish (species or breed) or a plant: the empty screen's words and starters.
  let plant: Bool
  /// The page's name ("Cá neon xanh"); from fish ID, the first guess's.
  let name: String
  /// Its scientific name; from fish ID, none (the guesses say what it may be).
  let sci: String?
  /// Its photo; from fish ID, none (the reader's own isn't kept).
  let img: URL?
  /// From fish ID: its guesses as it words them ("Gần như chắc chắn Cá betta (cá xiêm), có thể Cá betta imbellis").
  let guesses: String?
  /// From fish ID: the second guess's name, which a starter asks how to tell apart.
  let second: String?

  var fromPhoto: Bool { guesses != nil }
}

/// The chat screen's route: where it starts, and what it's about.
struct ChatRoute: Hashable {
  let start: Chat.Start
  let subject: ChatSubject
}

extension ChatRoute {
  /// A row of the list reopened: what it's about, by the page's current name and photo where the handbook still has it
  /// (the list's are in the language it was asked in). Fish ID's photo never left the phone.
  init(row: Chat.Row, page: (String) -> HandbookIndex.Item?) {
    let about = row.first.about, item = about.flatMap { page($0.id) }
    let name = item?.name ?? about?.name
    // Fish ID's as it worded them when it asked.
    if row.first.from == .fishId {
      let guesses = (row.first.identified?.results ?? []).prefix(3).map { g in (name: g.id.flatMap(page)?.name ?? g.scientificName, confidence: g.confidence) }
      self.init(start: row.start, subject: ChatSubject(plant: row.first.identified?.verdict == "plant", name: guesses.first?.name ?? name ?? "AquaTome", sci: nil, img: nil,
                                                       guesses: guesses.isEmpty ? name ?? "AquaTome" : FishIdView.worded(guesses), second: guesses.dropFirst().first?.name))
      return
    }
    self.init(start: row.start, subject: ChatSubject(plant: about?.kind == "plant", name: name ?? "AquaTome", sci: item?.sub, img: item?.img.flatMap(URL.init(string:)) ?? about?.img,
                                                     guesses: nil, second: nil))
  }
}

/// The chat as GET /api/chat last said, for the entries (a species page's "Hỏi về …", fish ID's row): asked when the app
/// comes to the front, not by each page. And the one conversation the app keeps: the latest, reopened from the same page
/// or fish ID result within its 24 hours, by the same account.
@Observable
@MainActor
final class ChatStore {
  /// Whether chat is on: no entry shows until GET says so.
  private(set) var on = false
  private(set) var maxChars = 500

  /// A question was refused as too long at this limit: the Worker's own, until its status next says.
  func tooLong(over limit: Int) { maxChars = limit }
  /// Questions a day for an account, for the day-used card.
  private(set) var perAccount: Int?
  /// The reader has earlier conversations: the history button lights.
  private(set) var hasPast = false
  @ObservationIgnored private var current: ChatModel?
  /// Asked again when the reader signs in or out (follow).
  @ObservationIgnored private var following = false

  /// Whether the signed-in reader has any conversation to list.
  func lookForPast(account: AccountModel, site: URL) async {
    guard account.user != nil else {
      hasPast = false
      return
    }
    guard let (data, status) = try? await account.send({ Chat.conversations(limit: 1, site: site, token: $0, version: ChatModel.version, ownCopy: ChatModel.ownCopy) }),
          let page = Chat.history(data, status: status) else { return }
    hasPast = !page.rows.isEmpty
    // A conversation in the list, from any phone, is the reader's first answer had.
    if hasPast { ChatModel.hadAnswer = true }
  }

  /// A question answered: there's something to list now.
  func answered() { hasPast = true }

  /// Conversations the reader just hid: not offered, and not brought back from what's kept on the phone.
  func hid(_ ids: [UUID]) {
    current?.hid(ids)
    ChatModel.forgetKept(holding: ids)
  }

  /// A row of the list opened in the chat screen: read back, then the current chat. Nil when it can't be read, or when the
  /// reader asked something in the chat meanwhile: that stands. Words in the box stay there.
  func open(_ row: Chat.Row, account: AccountModel, site: URL, lang: String, page: (String) -> HandbookIndex.Item?) async -> ChatModel? {
    let before = current?.thread.last?.id
    guard let past = await ChatModel.read(row, account: account, site: site), current?.thread.last?.id == before else { return nil }
    let draft = current?.draft ?? ""
    current?.leave()
    let m = ChatModel(route: ChatRoute(row: row, page: page), account: account, site: site, lang: lang, store: self)
    current = m
    m.fill(row, past)
    m.draft = draft
    return m
  }

  /// Whether chat is on, asked as the account when signed in: it may be on for some accounts alone (the owner's, at
  /// first), so it's asked again when the reader signs in or out.
  func refresh(account: AccountModel, site: URL) async {
    follow(account, site: site)
    func get(_ token: String?) -> URLRequest { Chat.status(site: site, version: ChatModel.version, ownCopy: ChatModel.ownCopy, token: token) }
    var answer: (Data, Int)?
    if account.user != nil { answer = (try? await account.send { get($0) }) ?? nil } else { answer = await account.fetch(get(nil)) }
    guard let (data, status) = answer else { return }
    let s = Chat.status(data, status: status)
    on = s.map { $0.on } ?? false
    maxChars = s?.maxChars ?? 500
    perAccount = s?.perAccount
  }

  /// The app went to the background or came back: the latest chat's stream stops, and its question is asked again
  /// with its key, whichever screen is showing.
  func inFront(_ front: Bool) {
    if front { current?.resume() } else { current?.leave() }
  }

  func isCurrent(_ m: ChatModel) -> Bool { current === m }

  /// The account signed in or out (or seen again): asked again, once per change, wherever the reader did it.
  private func follow(_ account: AccountModel, site: URL) {
    guard !following else { return }
    following = true
    withObservationTracking { _ = account.user?.id } onChange: { [weak self] in
      Task { @MainActor in
        self?.following = false
        await self?.refresh(account: account, site: site)
      }
    }
  }

  /// The chat for `route`: the open one when it's the same start, by the same account, within its 24 hours; else the one
  /// kept on the phone, on the same terms (the app was closed meanwhile); else a new one.
  func model(for route: ChatRoute, account: AccountModel, site: URL, lang: String) -> ChatModel {
    if let current, current.route == route, current.continues(account: account.user?.id) { return current }
    let m = ChatModel(route: route, account: account, site: site, lang: lang, store: self)
    current = m
    return m
  }
}

/// One chat: its questions, each with its answer as it streams (Chat.Reply), asked as the reader's account in one
/// conversation (Chat.Conversation), and what stops a question before it goes (signed out, the day used, offline).
@Observable
@MainActor
final class ChatModel {
  /// One question and its answer.
  struct Asked: Identifiable {
    enum Outcome: Equatable {
      case asking
      case answered
      /// Its stream ended in an error (`failed`, `unavailable`, `resting`), or was cut short (`cut`).
      case failed(String)
      /// Asked again with its key past its conversation's 24 hours (410): its answer can't be had.
      case lost
    }
    let id: UUID
    let question: String
    /// Its Idempotency-Key: the same again only for a retry that should get the same turn.
    var key: UUID
    var reply = Chat.Reply()
    var outcome = Outcome.asking
    /// A new conversation starts with it: the divider above it.
    var anew = false
    /// Its answer came back after the app had left it (resent with its key): drawn whole.
    var resumed = false
    /// The connection went while the phone said it was up: asked again by itself, once.
    var redialed = false
    /// The stream's last event's data (`done` or `error`), kept with the conversation.
    var last: String?
    /// When it was asked: on the first question of a conversation reopened from the list, shown above it.
    var at: Date?
  }

  /// A question just stopped, said under the box for a few seconds. `returned`: its words went back into the box.
  struct Stopped: Equatable {
    let id = UUID()
    let returned: Bool
  }

  /// What stops a question before it goes, shown over the box; the question stays in the box. (Signed out is the
  /// account's own state: its card shows while there's no account, and goes once one signs in.)
  enum Stop: Equatable {
    /// The reader's day used, with its limit.
    case rate(Int?)
    /// The site's day used.
    case busy
    case off
  }

  let route: ChatRoute
  private(set) var thread: [Asked] = []
  /// The box's text.
  var draft = ""
  private(set) var stop: Stop?
  /// No network: the path says so, or a question just couldn't go.
  var offline: Bool { pathOffline || couldntSend }
  /// The network is down as far as the phone knows: send is off.
  private(set) var pathOffline = false
  private(set) var couldntSend = false
  /// The stop is on its way to the Worker: the wait's last row says so.
  var stopping: Bool { stoppingFor != nil && stoppingFor == thread.last?.id }
  private(set) var stopped: Stopped?
  /// The question the stop is for.
  private var stoppingFor: UUID?
  /// Questions the reader has sent: the tap as one goes.
  private(set) var sent = 0
  /// The latest earlier conversation about this page, offered under the starters.
  private(set) var earlier: Chat.Row?
  /// That one is the conversation just left for a new one.
  private(set) var earlierJustNow = false
  /// The conversations on screen, and those they carry on: their row in the list says "Đang mở", and has no swipe.
  private(set) var onScreen: Set<UUID> = []
  /// The reader left the conversation for a new one: coming back to the screen doesn't reopen it.
  @ObservationIgnored private var leftForNew = false
  /// How many times this question was told the one before it is still running.
  @ObservationIgnored private var waitedForLast = 0

  @ObservationIgnored private let account: AccountModel
  @ObservationIgnored private let site: URL
  @ObservationIgnored private let lang: String
  @ObservationIgnored private weak var store: ChatStore?
  @ObservationIgnored private var conversation: Chat.Conversation? {
    didSet { if let conversation { noteOnScreen(conversation) } }
  }
  @ObservationIgnored private var running: Task<Void, Never>?
  /// Which ask `running` is: an ask started from inside another (a 410's new conversation) outlives the one that started it.
  @ObservationIgnored private var runId = UUID()
  @ObservationIgnored private let path = NWPathMonitor()

  init(route: ChatRoute, account: AccountModel, site: URL, lang: String, store: ChatStore) {
    self.route = route
    self.account = account
    self.site = site
    self.lang = lang
    self.store = store
    if let k = Self.kept(), k.start == route.start, let user = account.user?.id, !k.conversation.ended(account: user, now: .now) {
      conversation = k.conversation
      noteOnScreen(k.conversation)
      thread = k.thread.map(\.asked)
    }
    #if DEBUG
    // The UI tests' "no network": the simulator's own path is up, so it isn't watched.
    if ProcessInfo.processInfo.arguments.contains("-chat-path-offline") {
      pathOffline = true
      return
    }
    // `-chat-drops`: FakeChat says when the connection goes and comes back.
    if ProcessInfo.processInfo.arguments.contains("-chat-drops") {
      _ = NotificationCenter.default.addObserver(forName: FakeChat.pathChanged, object: nil, queue: .main) { [weak self] n in
        let down = n.object as? Bool == true
        Task { @MainActor in self?.pathChanged(down: down) }
      }
      return
    }
    #endif
    path.pathUpdateHandler = { [weak self] p in
      let down = p.status != .satisfied
      Task { @MainActor in self?.pathChanged(down: down) }
    }
    path.start(queue: .global(qos: .utility))
  }

  deinit { path.cancel() }

  private func pathChanged(down: Bool) {
    let back = pathOffline && !down
    pathOffline = down
    guard back else { return }
    // Back online: a question that couldn't go can now, and an answer the connection took is asked for with its key.
    couldntSend = false
    resume()
  }

  private func noteOnScreen(_ c: Chat.Conversation) {
    onScreen.insert(c.id)
    if let k = c.continues { onScreen.insert(k) }
  }

  /// The latest question is still being answered, or its answer was cut short (its run may still be going on): send
  /// stays off (a second question would be 409) until it's answered or asked again.
  var answering: Bool { [.asking, .failed("cut")].contains(thread.last?.outcome) }
  /// From the moment a question is sent until the first piece of text: once text has begun, the answer finishes.
  var stoppable: Bool { thread.last?.outcome == .asking && thread.last?.reply.writing == false }
  var maxChars: Int { store?.maxChars ?? 500 }
  var perAccount: Int? { store?.perAccount }

  /// Whether this chat goes on for the reader now signed in (`user`): the same account, within its conversation's 24 hours.
  func continues(account user: String?) -> Bool {
    guard let conversation else { return true }
    return user.map { !conversation.ended(account: $0, now: .now) } ?? false
  }

  // MARK: Asking

  /// Sends the box's text, or `suggestion` (a chip tapped). Offline, a suggestion goes into the box, unsent.
  func send(_ suggestion: String? = nil) {
    let q = (suggestion ?? draft).trimmingCharacters(in: .whitespacesAndNewlines)
    guard !q.isEmpty, !answering else { return }
    if offline, let suggestion {
      draft = suggestion
      return
    }
    // In characters as the reader sees them, as the box counts and the Worker does (Thai's marks and an emoji are one
    // each): counted in UTF-16 units, a question the box let go did nothing when sent.
    guard !pathOffline, q.count <= maxChars else { return }
    guard let user = account.user?.id else {
      if let suggestion { draft = suggestion }
      return
    }
    stop = nil
    couldntSend = false
    sent += 1
    waitedForLast = 0
    let anew = startIfNeeded(user)
    // A chip tapped leaves what the reader was writing in the box.
    if suggestion == nil { draft = "" }
    thread.append(Asked(id: UUID(), question: q, key: UUID(), anew: anew))
    ask(thread.count - 1)
  }

  /// A new conversation when there's none, or the one there is has ended for `user` (another account, or 24 hours on):
  /// true when one starts after earlier questions (the divider).
  private func startIfNeeded(_ user: String) -> Bool {
    if let c = conversation, !c.ended(account: user, now: .now) {
      // A new conversation whose first question was stopped, its divider gone with it: this question brings it back. Not
      // when one that failed still shows the divider.
      let sinceAnswered = thread.reversed().prefix { $0.outcome != .answered }
      return c.turns == 0 && thread.contains { $0.outcome == .answered } && !sinceAnswered.contains(where: \.anew)
    }
    conversation = conversation?.next(account: user) ?? Chat.Conversation(account: user)
    return thread.contains { $0.outcome == .answered }
  }

  /// "Thử lại" / "Hỏi lại" under a failed question's bubble: asked again there, with a new key (the same would get the
  /// kept error), or the same one for an answer cut short (it gets the turn, counted once). After its answer was lost,
  /// in a new conversation.
  func retry(_ id: UUID) {
    guard let i = thread.firstIndex(where: { $0.id == id }), i == thread.count - 1, thread[i].outcome != .asking,
          let user = account.user?.id else { return }
    switch thread[i].outcome {
    case .failed("cut"):
      // Asked again with its key: past its 24 hours, its answer is lost, not asked anew.
      thread[i].resumed = true
      thread[i].reply = Chat.Reply()
      thread[i].outcome = .asking
      ask(i)
      return
    case .lost:
      conversation = conversation?.next(account: user) ?? Chat.Conversation(account: user)
      thread[i].anew = thread[..<i].contains { $0.outcome == .answered }
      thread[i].key = UUID()
    default:
      conversation?.failed()
      thread[i].key = UUID()
    }
    thread[i].reply = Chat.Reply()
    thread[i].outcome = .asking
    thread[i].resumed = false
    ask(i)
  }

  /// Back in front (or the chat opened again after the app was closed, or the connection back) with a question still
  /// being answered: asked again with its key, which gets the answer that landed meanwhile, counted once. What was read
  /// stays: the Worker answers a key it has seen with the `done` alone.
  func resume() {
    guard running == nil, let i = thread.indices.last, thread[i].outcome == .asking else { return }
    thread[i].resumed = true
    ask(i)
  }

  /// Leaving for the background: the stream stops; the question's key is kept, to ask again on return.
  func leave() {
    running?.cancel()
    running = nil
  }

  /// The new-conversation button: the thread gone at once, the next question in a new conversation that carries nothing
  /// on. The one left is in the list, and offered under the starters.
  func startOver() {
    let had = thread.contains { $0.outcome == .answered }
    leave()
    thread = []
    conversation = nil
    stop = nil
    stopped = nil
    stoppingFor = nil
    onScreen = []
    leftForNew = true
    keep()
    earlier = nil
    guard had else { return }
    earlierJustNow = true
    Task { await lookBack(reopen: false) }
  }

  // MARK: Stopping

  /// The stop button: asks the Worker to stop the question. Whichever comes first ends it here: this call's answer, or the
  /// question's own request or stream saying `cancelled`. Too late, or no answer: the question goes on, and lands.
  func stopAsking() {
    guard stoppable, !stopping, let last = thread.last else { return }
    stoppingFor = last.id
    cancel(last.id, key: last.key)
  }

  private func cancel(_ id: UUID, key: UUID) {
    Task {
      let answer = try? await account.send { Chat.cancel(key: key, site: self.site, token: $0, version: Self.version, ownCopy: Self.ownCopy) }
      // Asked again under a new key meanwhile (a 410's new conversation, a retry): that's the one to stop.
      if stoppingFor == id, let i = index(id), thread[i].outcome == .asking, thread[i].key != key {
        cancel(id, key: thread[i].key)
        return
      }
      if stoppingFor == id { stoppingFor = nil }
      if let answer, Chat.stopped(answer.0, status: answer.1) == .cancelled, let i = index(id), thread[i].key == key { halted(id) }
    }
  }

  /// Stopped: nothing of it kept, not counted. Its words go back into the box, or with something typed there, they go.
  /// A conversation left with no question shows its empty screen again, and a divider opened for it goes with it.
  private func halted(_ id: UUID) {
    guard let i = index(id) else { return }
    if stoppingFor == id { stoppingFor = nil }
    running?.cancel()
    running = nil
    let q = thread.remove(at: i).question
    let returned = draft.isEmpty
    if returned { draft = q }
    conversation?.failed()
    keep()
    let said = Stopped(returned: returned)
    stopped = said
    Task {
      try? await Task.sleep(for: .seconds(4))
      if stopped == said { stopped = nil }
    }
  }

  // MARK: Past conversations

  /// A row's conversations, read back in its order. Nil when one can't be read.
  static func read(_ row: Chat.Row, account: AccountModel, site: URL) async -> [Chat.Past]? {
    var out: [Chat.Past] = []
    for c in row.conversations {
      guard let (data, status) = try? await account.send({ Chat.conversation(c.id, site: site, token: $0, version: version, ownCopy: ownCopy) }),
            let past = Chat.past(data, status: status) else { return nil }
      out.append(past)
    }
    return out
  }

  /// This chat is now that row: its questions as they were answered, a divider where one conversation carried on another,
  /// the next question going on in its last while that's open, else in a new one that continues it.
  func fill(_ row: Chat.Row, _ past: [Chat.Past]) {
    guard let user = account.user?.id else { return }
    leave()
    onScreen = Set(row.conversations.map(\.id))
    conversation = Chat.Conversation(reopening: row.last, account: user)
    thread = past.enumerated().flatMap { k, p in
      p.turns.enumerated().map { j, t in
        var a = Asked(id: UUID(), question: t.question, key: UUID(), anew: k > 0 && j == 0, last: t.data)
        a.outcome = .answered
        a.resumed = true
        a.reply.take(.done(t.turn))
        if k == 0 && j == 0 { a.at = t.asked }
        return a
      }
    }
    earlier = nil
    stop = nil
    stopped = nil
    stoppingFor = nil
    keep()
  }

  /// A page's chat with nothing on screen: its latest conversation about the page, reopened while it's open, else offered
  /// under the starters. Never fish ID's: a photo's chat always starts fresh.
  func lookBack(reopen: Bool = true) async {
    let reopen = reopen && !leftForNew
    guard thread.isEmpty, route.start.from == .species, let about = route.start.about, account.user != nil else {
      earlier = nil
      return
    }
    guard let (data, status) = try? await account.send({ Chat.conversations(limit: 1, about: about, site: self.site, token: $0, version: Self.version, ownCopy: Self.ownCopy) }),
          let page = Chat.history(data, status: status), thread.isEmpty else { return }
    guard let row = page.rows.first else {
      earlier = nil
      return
    }
    if reopen, row.last.open, let past = await Self.read(row, account: account, site: site), thread.isEmpty {
      fill(row, past)
      return
    }
    if reopen { earlierJustNow = false }
    earlier = row
  }

  /// Conversations the reader hid from the list: no longer offered here.
  func hid(_ ids: [UUID]) {
    if ids.contains(where: { earlier?.holds($0) == true }) { earlier = nil }
  }

  /// What's kept on the phone, when it's one of these conversations.
  static func forgetKept(holding ids: [UUID]) {
    guard let k = kept(), ids.contains(k.conversation.id) || k.conversation.continues.map(ids.contains) == true else { return }
    try? FileManager.default.removeItem(at: file)
  }

  /// Asked again in a moment; leaving the screen meanwhile stops it, as it does a stream.
  private func again(_ id: UUID, after wait: Duration) {
    let run = UUID()
    runId = run
    running = Task { [weak self] in
      try? await Task.sleep(for: wait)
      guard !Task.isCancelled, let self, let i = self.index(id), self.thread[i].outcome == .asking else { return }
      self.ask(i)
    }
  }

  private func ask(_ i: Int) {
    let id = thread[i].id, run = UUID()
    runId = run
    running = Task { [weak self] in
      await self?.run(id)
      if self?.runId == run { self?.running = nil }
    }
  }

  private func run(_ id: UUID) async {
    guard let i = thread.firstIndex(where: { $0.id == id }), var c = conversation else { return }
    let item = thread[i]
    c.asked(at: .now)
    conversation = c
    keep()
    let first = c.turns == 0
    // Claude may read the reader's tanks: the account has them first.
    if first && !item.resumed { await account.sync() }
    // Left, or started over, meanwhile: the question waits, or is gone.
    guard !Task.isCancelled, index(id) != nil else { return }
    let ask = { (token: String) in
      Chat.ask(item.question, conversation: c.id, lang: self.lang, start: first ? self.route.start : nil, continues: first ? c.continues : nil, key: item.key, site: self.site,
               token: token, version: Self.version, ownCopy: Self.ownCopy)
    }
    var admitted = false
    do {
      guard let (response, bytes) = try await account.stream(ask) else {
        unsend(id, nil)
        return
      }
      guard response.statusCode == 200, response.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("text/event-stream") == true else {
        let body = try await ServerEvents.collect(bytes)
        refused(id, Chat.refusal(body, status: response.statusCode))
        return
      }
      // Taken: the question counts, and its run goes on whatever happens to the stream.
      admitted = true
      try await ServerEvents.read(bytes) { [weak self] e in
        guard let self, let event = Chat.event(e) else { return true }
        return self.take(event, data: e.data, id)
      }
      // The stream ended with no `done` or `error`: cut short.
      if let i = index(id), thread[i].outcome == .asking, !Task.isCancelled { thread[i].outcome = .failed("cut"); keep() }
    } catch {
      // Left for the background (the stream stopped): the question waits, to be asked again on return.
      if Task.isCancelled || (error as? URLError)?.code == .cancelled { return }
      guard let i = index(id) else { return }
      let gone = Self.noNetwork(error)
      // Never taken (no answer at all): it didn't go. Taken, it's asked again with its key.
      if gone && !admitted && !thread[i].resumed {
        couldntSend = true
        unsend(id, nil)
      } else if gone && pathOffline {
        // The wait stays as it is, with the pill over the box: back online, `pathChanged` asks again.
        return
      } else if gone && !thread[i].redialed {
        // The phone still says it's up: only a blip, or the path hasn't said yet.
        thread[i].redialed = true
        thread[i].resumed = true
        again(id, after: .seconds(1))
      } else {
        thread[i].outcome = .failed("cut")
        keep()
      }
    }
  }

  /// One event of `id`'s stream: false once it ends the answer.
  private func take(_ e: Chat.Event, data: String, _ id: UUID) -> Bool {
    guard let i = index(id) else { return false }
    if case .error("cancelled") = e {
      halted(id)
      return false
    }
    thread[i].reply.take(e)
    switch e {
    case .done(let t):
      thread[i].outcome = .answered
      Self.hadAnswer = true
      thread[i].last = data
      store?.answered()
      // A turn numbered 1 over earlier turns: the Worker no longer held them.
      if conversation?.answered(n: t.n) == true, i > 0 { thread[i].anew = true }
      keep()
      return false
    case .error(let code):
      thread[i].outcome = .failed(code)
      thread[i].last = data
      conversation?.failed()
      keep()
      return false
    default:
      return true
    }
  }

  private func refused(_ id: UUID, _ r: Chat.Refusal) {
    guard let i = index(id) else { return }
    switch r {
    case .signedOut:
      // The session is over: the account says so (its card), the question back in the box.
      unsend(id, nil)
      Task { await account.refresh() }
    case .refused("rate", let limit):
      unsend(id, .rate(limit ?? perAccount))
    case .refused("busy", _):
      unsend(id, .busy)
    case .refused("chat_off", _):
      unsend(id, .off)
    case .refused("cancelled", _):
      halted(id)
    case .refused("answering", _) where waitedForLast < 20:
      // The conversation's last question is still being answered (left and reopened while it ran, up to half a minute):
      // this one waits for it, then goes. It hasn't been taken, so it isn't another question.
      waitedForLast += 1
      again(id, after: .seconds(3))
    case .refused("too long", let limit):
      // Longer than the Worker takes, though the box let it go: back in the box, which says the Worker's limit.
      if let limit { store?.tooLong(over: limit) }
      unsend(id, nil)
    case .refused("ended", _) where thread[i].resumed:
      thread[i].outcome = .lost
      conversation?.failed()
      keep()
    case .refused("ended", _):
      // Past the conversation's 24 hours or its questions: the same question in a new one, with where the chat started.
      guard let c = conversation else { return }
      conversation = c.next(account: c.account)
      thread[i].anew = thread[..<i].contains { $0.outcome == .answered }
      thread[i].key = UUID()
      ask(i)
    case .refused(let code, _):
      // `failed` (502): Claude's answer our side couldn't use, counted. Any other refusal comes before a question is
      // taken, and isn't.
      thread[i].outcome = .failed(code == "failed" ? "failed" : "unavailable")
      conversation?.failed()
      keep()
    }
  }

  /// "Sửa và hỏi lại": a question asked put back in the box, above any words already there; sending it is a new question
  /// (in an ended conversation, a new conversation), and the one above stays as it was.
  func editAgain(_ question: String) {
    draft = draft.isEmpty ? question : question + "\n" + draft
  }

  /// A question that didn't go: its bubble gone, its words back in the box.
  private func unsend(_ id: UUID, _ why: Stop?) {
    guard let i = index(id) else { return }
    let q = thread.remove(at: i).question
    if draft.isEmpty { draft = q }
    conversation?.failed()
    stop = why
    keep()
  }

  private func index(_ id: UUID) -> Int? { thread.firstIndex { $0.id == id } }

  private static func noNetwork(_ e: Error) -> Bool {
    guard let u = e as? URLError else { return false }
    return [.notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed, .dataNotAllowed,
            .internationalRoamingOff].contains(u.code)
  }

  static var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0" }
  /// Our own copies say so (OwnCopy).
  static var ownCopy: String? { OwnCopy.isOurs ? AccountsClient.ourCopy : nil }

  // MARK: Kept on the phone

  /// This phone has had an answer: the empty screen then says only that Claude, an AI, answers from the handbook.
  static var hadAnswer: Bool {
    get { UserDefaults.standard.bool(forKey: "chat-had-answer") }
    set { UserDefaults.standard.set(newValue, forKey: "chat-had-answer") }
  }

  /// The latest chat, kept so a question being answered when the app closed is asked again (with its key) when it
  /// opens again, and its conversation goes on: the conversation, and each question with its answer's last event.
  private struct Kept: Codable {
    struct Item: Codable {
      let question: String
      let key: UUID
      /// "asking", "answered", "lost", or the failure's code.
      let outcome: String
      let anew: Bool
      let last: String?
      let at: Date?
      /// An answer cut off after its text began: the text read, so it comes back with its card (not counted), not as a
      /// counted failure with no text.
      let text: String?
      /// The wait's first line of an answer that broke after it, so it comes back as cut off (not counted). An answered
      /// turn's line is its `done`'s, and one `done` took back isn't kept.
      let opening: String?

      var asked: Asked {
        var a = Asked(id: UUID(), question: question, key: key, anew: anew, last: last, at: at)
        a.outcome = switch outcome { case "asking": .asking; case "answered": .answered; case "lost": .lost; default: .failed(outcome) }
        if let opening { a.reply.take(.opening(opening)) }
        if let text { a.reply.take(.text(text)) }
        if let last, let e = Chat.event(ServerEvent(name: outcome == "answered" ? "done" : "error", data: last)) { a.reply.take(e) }
        return a
      }
    }
    let start: Chat.Start
    let conversation: Chat.Conversation
    let thread: [Item]
  }

  static let file = URL.applicationSupportDirectory.appending(path: "chat.json")

  private static func kept() -> Kept? { (try? Data(contentsOf: file)).flatMap { try? JSONDecoder().decode(Kept.self, from: $0) } }

  private func keep() {
    // A chat no longer the latest (another opened since) leaves the latest's kept.
    guard store?.isCurrent(self) != false else { return }
    guard let conversation, !thread.isEmpty else {
      try? FileManager.default.removeItem(at: Self.file)
      return
    }
    let items = thread.map { a in
      let o = switch a.outcome { case .asking: "asking"; case .answered: "answered"; case .lost: "lost"; case .failed(let c): c }
      let failed = if case .failed = a.outcome { true } else { false }
      let cut: String? = failed && a.reply.writing ? a.reply.text : nil
      return Kept.Item(question: a.question, key: a.key, outcome: o, anew: a.anew, last: a.last, at: a.at, text: cut, opening: failed ? a.reply.opening : nil)
    }
    try? FileManager.default.createDirectory(at: Self.file.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? JSONEncoder().encode(Kept(start: route.start, conversation: conversation, thread: items)).write(to: Self.file, options: .atomic)
  }
}
