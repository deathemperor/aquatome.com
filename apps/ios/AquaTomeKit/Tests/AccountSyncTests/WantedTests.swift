import Foundation
import Testing
@testable import AccountSync
import Tanks

// Readers' demand (docs/my-tanks-sync.md): what a save put on a tank without a page, sent through the stand-in server as
// the app sends it after each save (TanksModel.change).

@MainActor @Test("A save that adds an entry sends its kind, name and scientific name once; its number changed, or the tank saved again, sends nothing")
func sendsWhatASaveAddedOnce() async throws {
  let fake = FakeAccounts()
  fake.accountsOn = false // it needs none
  let wanted = Wanted(send: { try await fake.send($0) })
  var s = TankStore()
  let id = try s.addTank(name: "Bể 60").id
  /// One save, as the app makes it: then each entry it added is sent.
  func save(_ change: (inout Tank) -> Void) async throws {
    let before = s.tank(id)
    try s.updateTank(id) { change(&$0) }
    for e in s.tank(id)!.unlistedAdded(since: before) { #expect(await wanted.send(e)) }
  }
  let fish = UnlistedEntry(kind: "fish", name: "Cá bống mắt tre", sci: "Rhinogobius duospilus", count: 3)
  try await save { $0.addUnlisted(fish) }
  #expect(fake.wanted == [["kind": .string("fish"), "name": .string("Cá bống mắt tre"), "sci": .string("Rhinogobius duospilus")]])
  try await save { $0.setUnlistedCount(fish.id, 5) }
  try await save { $0.notes = "thay nước thứ bảy" }
  #expect(fake.wanted.count == 1, "sent again")
  // No scientific name: none sent.
  try await save { $0.addUnlisted(UnlistedEntry(kind: "plant", name: "Rêu suối")) }
  #expect(fake.wanted.last == ["kind": .string("plant"), "name": .string("Rêu suối")])
  #expect(fake.wanted.count == 2)

  for r in fake.requests {
    #expect(r.httpMethod == "POST" && r.url == URL(string: "https://aquatome.com/api/v1/wanted"))
    #expect(r.value(forHTTPHeaderField: "Content-Type") == "application/json")
    // Nothing that says who sent it.
    #expect(r.value(forHTTPHeaderField: "Authorization") == nil && r.value(forHTTPHeaderField: "Cookie") == nil)
    #expect(!r.httpShouldHandleCookies)
  }
}

@MainActor @Test("A failure is dropped: nothing thrown, nothing kept to send again")
func aFailureIsDropped() async throws {
  let fake = FakeAccounts()
  fake.offline = true
  let wanted = Wanted(send: { try await fake.send($0) })
  #expect(await wanted.send(UnlistedEntry(kind: "fish", name: "Cá lạ")) == false)
  fake.offline = false
  #expect(await wanted.send(UnlistedEntry(kind: "rock", name: "Đá")) == false, "the server's 400 isn't a success")
  #expect(fake.wanted.isEmpty && fake.requests.count == 2)
}

@MainActor @Test("A tank's entries without a page go to the account and come back as the phone had them")
func entriesWithoutAPageSyncUnchanged() async throws {
  let fake = FakeAccounts()
  let api = client(fake)
  let s = try await signIn(api, "apple-1")
  var p = TankStore()
  // Stamped a minute back: an edit stamped ahead of the fake server's clock is brought back to its "now" (as the real
  // one does), and the copies would differ in updatedAt alone.
  let t0 = Date(timeIntervalSinceNow: -60)
  let id = try p.addTank(name: "Bể 60", now: t0).id
  try p.updateTank(id, now: t0.addingTimeInterval(1)) {
    $0.addUnlisted(UnlistedEntry(kind: "fish", name: "Cá bống mắt tre", sci: "Rhinogobius duospilus", count: 3))
    var later = UnlistedEntry(kind: "snail", name: "Ốc nerita")
    later.json["photoGuess"] = .object(["score": .number(0.4)])
    $0.addUnlisted(later)
  }
  let sent = p.tanks
  try await sync(api, &p, s.token)
  #expect(fake.store(of: "apple-1")?.tanks == sent)
  #expect(p.tanks == sent)
}
