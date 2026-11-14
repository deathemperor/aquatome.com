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
  /// The chat about this fish (a species or breed) or plant.
  init?(about item: HandbookIndex.Item) {
    guard [.fish, .plant].contains(item.kind), let id = item.contentId else { return nil }
    self.init(start: Chat.Start(from: .species, about: id),
              subject: ChatSubject(plant: item.kind == .plant, name: item.name, sci: item.subUnderName, img: item.img.flatMap(URL.init(string:)), guesses: nil, second: nil))
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
  @ObservationIgnored private var current: ChatModel?
  /// Asked again when the reader signs in or out (follow).
  @ObservationIgnored private var following = false

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
    /// The stream's last event's data (`done` or `error`), kept with the conversation.
    var last: String?
  }

  /// For the owner's report: this conversation as the bucket has it, and the answers on the screen by their numbers (`visible`
  /// says which turns are; before iOS 18 it's empty, and the newest is taken as the one showing).
  func onScreen(_ visible: [UUID: Bool]) -> OwnerShowing.Chat? {
    guard let id = conversation?.id else { return nil }
    let newest = thread.last?.id
    return OwnerShowing.Chat(conversation: id.uuidString.lowercased(), answers: thread.compactMap { (visible[$0.id] ?? ($0.id == newest)) ? $0.reply.turn?.n : nil })
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

  @ObservationIgnored private let account: AccountModel
  @ObservationIgnored private let site: URL
  @ObservationIgnored private let lang: String
  @ObservationIgnored private weak var store: ChatStore?
  @ObservationIgnored private var conversation: Chat.Conversation?
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
      thread = k.thread.map(\.asked)
    }
    #if DEBUG
    // The UI tests' "no network": the simulator's own path is up, so it isn't watched.
    if ProcessInfo.processInfo.arguments.contains("-chat-path-offline") {
      pathOffline = true
      return
    }
    #endif
    path.pathUpdateHandler = { [weak self] p in
      let down = p.status != .satisfied
      Task { @MainActor in
        guard let self else { return }
        // Back online: a question that couldn't go can now.
        if self.pathOffline && !down { self.couldntSend = false }
        self.pathOffline = down
      }
    }
    path.start(queue: .global(qos: .utility))
  }

  deinit { path.cancel() }

  /// The latest question is still being answered, or its answer was cut short (its run may still be going on): send
  /// stays off (a second question would be 409) until it's answered or asked again.
  var answering: Bool { [.asking, .failed("cut")].contains(thread.last?.outcome) }
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
    let anew = startIfNeeded(user)
    // A chip tapped leaves what the reader was writing in the box.
    if suggestion == nil { draft = "" }
    thread.append(Asked(id: UUID(), question: q, key: UUID(), anew: anew))
    ask(thread.count - 1)
  }

  /// A new conversation when there's none, or the one there is has ended for `user` (another account, or 24 hours on):
  /// true when one starts after earlier questions (the divider).
  private func startIfNeeded(_ user: String) -> Bool {
    if let c = conversation, !c.ended(account: user, now: .now) { return false }
    conversation = Chat.Conversation(account: user)
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
      conversation = Chat.Conversation(account: user)
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

  /// Back in front (or the chat opened again after the app was closed) with a question still being answered: asked
  /// again with its key, which gets the answer that landed meanwhile, counted once.
  func resume() {
    guard running == nil, let i = thread.indices.last, thread[i].outcome == .asking else { return }
    thread[i].reply = Chat.Reply()
    thread[i].resumed = true
    ask(i)
  }

  /// Leaving for the background: the stream stops; the question's key is kept, to ask again on return.
  func leave() {
    running?.cancel()
    running = nil
  }

  /// "Bắt đầu cuộc mới": the thread gone, the next question in a new conversation.
  func startOver() {
    leave()
    thread = []
    conversation = nil
    stop = nil
    keep()
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
      Chat.ask(item.question, conversation: c.id, lang: self.lang, start: first ? self.route.start : nil, key: item.key, site: self.site,
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
      // Never taken (no answer at all): it didn't go. Taken, it's asked again with its key.
      if !admitted && Self.noNetwork(error) && !thread[i].resumed {
        couldntSend = true
        unsend(id, nil)
      } else {
        thread[i].outcome = .failed("cut")
        keep()
      }
    }
  }

  /// One event of `id`'s stream: false once it ends the answer.
  private func take(_ e: Chat.Event, data: String, _ id: UUID) -> Bool {
    guard let i = index(id) else { return false }
    thread[i].reply.take(e)
    switch e {
    case .done(let t):
      thread[i].outcome = .answered
      Self.hadAnswer = true
      thread[i].last = data
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
      guard let user = conversation?.account else { return }
      conversation = Chat.Conversation(account: user)
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
      /// An answer cut off after its text began: the text read, so it comes back with its card (not counted), not as a
      /// counted failure with no text.
      let text: String?

      var asked: Asked {
        var a = Asked(id: UUID(), question: question, key: key, anew: anew, last: last)
        a.outcome = switch outcome { case "asking": .asking; case "answered": .answered; case "lost": .lost; default: .failed(outcome) }
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
      let cut: String? = if case .failed = a.outcome, a.reply.writing { a.reply.text } else { nil }
      return Kept.Item(question: a.question, key: a.key, outcome: o, anew: a.anew, last: a.last, text: cut)
    }
    try? FileManager.default.createDirectory(at: Self.file.deletingLastPathComponent(), withIntermediateDirectories: true)
    try? JSONEncoder().encode(Kept(start: route.start, conversation: conversation, thread: items)).write(to: Self.file, options: .atomic)
  }
}
