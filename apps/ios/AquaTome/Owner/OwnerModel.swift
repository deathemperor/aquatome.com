import AccountSync
import Observation
import UIKit

/// The owner's dashboard (protocols/owner-dashboard.openapi.json): the site's /_ab/ pages, drawn by the app from the
/// server's JSON, read with the account's session. Shown only to the owner's account: the overview answering it 200 says
/// it is; 404 says it isn't, and the phone doesn't ask again for that account. A 401 is the session ending: the account
/// is signed out as a sync told so is, and the row stays, saying to sign in again. Anything else (offline, 503) asks again
/// at the next check.
@Observable
@MainActor
final class OwnerModel {
  private(set) var isOwner = false
  /// A request was told the session is over: the row stays, saying so, until an account signs in.
  private(set) var sessionEnded = false
  /// The overview, as last read.
  private(set) var dashboard: Owner.Dashboard?

  @ObservationIgnored private let send: Send
  @ObservationIgnored private unowned let account: AccountModel
  /// The account asked about, and whether it was answered.
  @ObservationIgnored private var askedFor: String?
  @ObservationIgnored private var asked = false
  /// The photos shown, in memory only: the owner's private data is never written down.
  @ObservationIgnored private var images: [String: UIImage] = [:]
  /// The account the overview answered 404 for, kept so it isn't asked again at the next launch.
  private static let notOwner = "owner.notOwner"

  init(send: @escaping Send, account: AccountModel) {
    self.send = send
    self.account = account
  }

  /// The account signed in now (when it changes, and after each sync, which also says the phone is online): asked once
  /// whether it is the owner's.
  func check() async {
    guard let id = account.user?.id else {
      // Signed out by hand: no row. Signed out by a 401: it stays, to say why.
      if !sessionEnded { forget() }
      return
    }
    if id != askedFor { forget() }
    askedFor = id
    sessionEnded = false
    guard !asked else { return }
    if UserDefaults.standard.string(forKey: Self.notOwner) == id { asked = true; return }
    await read()
  }

  /// The overview, read again.
  func overview() async throws {
    dashboard = try await client().dashboard()
    isOwner = true
    asked = true
  }

  private func read() async {
    do { try await overview() } catch { _ = said(error, overview: true) }
  }

  func client() throws -> OwnerClient {
    guard let token = account.bearer else { throw OwnerError.signedOut }
    return OwnerClient(send: send, token: token)
  }

  func image(_ src: String) async -> UIImage? {
    if let i = images[src] { return i }
    guard let c = try? client(), let data = await c.image(src), let i = UIImage(data: data) else { return nil }
    images[src] = i
    return i
  }

  /// A page of the site a cell links to.
  func page(_ href: String) -> URL? { OwnerClient(send: send, token: "").page(href) }

  /// What an error says to the owner, and what it means for the row: a 401 signs the account out (the row stays); a 404
  /// from the overview is not the owner (no row); one from a section or a button may be a section or path gone, so the
  /// overview is asked again, and decides.
  func said(_ e: Error, overview: Bool) -> String {
    switch e as? OwnerError {
    case .signedOut?:
      // Before the account signs out, so the check that follows keeps the row.
      sessionEnded = true
      if account.user != nil { account.sessionEnded() }
      return String(localized: "Phiên đăng nhập đã hết: đăng nhập lại để xem bảng điều khiển.")
    case .notFound? where overview:
      isOwner = false
      asked = true
      dashboard = nil
      if let askedFor { UserDefaults.standard.set(askedFor, forKey: Self.notOwner) }
    case .notFound?:
      Task { await read() }
    case .offline?:
      return String(localized: "Không có mạng: thử lại khi có mạng.")
    case .refused(_, let message?)?:
      return message
    default:
      break
    }
    return String(localized: "Có lỗi, chưa làm được: thử lại.")
  }

  private func forget() {
    isOwner = false
    asked = false
    askedFor = nil
    dashboard = nil
    images = [:]
  }
}
