import Foundation

/// What's new on the site (/app/latest/<lang>.json, apps/site/src/lib/app-latest.ts): its /vi/moi-cap-nhat/ as the app
/// lists it, newest first, each entry a page the app index lists. The index names the file (`HandbookIndex.latest`)
/// where the language's site has the page.
public struct Latest: Codable, Sendable, Equatable {
  public let version: Int
  public let lang: String
  /// One per entry of the site's list: a page updated on two days is there twice.
  public let entries: [Entry]
  /// The whole list on the web.
  public let web: String

  public struct Entry: Codable, Sendable, Hashable {
    /// "2026-10-28".
    public let date: String
    /// The page's path in the app index.
    public let path: String
    /// "new", "updated", or one a newer site adds (shown with no word).
    public let action: String
    /// The source's name, as the site's list gives it.
    public let source: String

    public init(date: String, path: String, action: String, source: String) {
      self.date = date; self.path = path; self.action = action; self.source = source
    }

    public var isNew: Bool { action == "new" }
    public var isUpdate: Bool { action == "updated" }
    /// The date as the site's list writes it: "28/10/2026".
    public var shown: String { date.split(separator: "-").reversed().joined(separator: "/") }
  }

  /// An entry with its page.
  public struct Row: Identifiable, Sendable, Hashable {
    public let entry: Entry
    public let item: HandbookIndex.Item
    /// Its place in the list: a page there twice is two rows.
    public let id: Int
  }

  /// The format this app reads; another version is left unread.
  public static let supportedVersion = 1

  public init(version: Int = Latest.supportedVersion, lang: String, entries: [Entry], web: String) {
    self.version = version; self.lang = lang; self.entries = entries; self.web = web
  }

  public init(from decoder: any Decoder) throws {
    let c = try decoder.container(keyedBy: CodingKeys.self)
    version = try c.decode(Int.self, forKey: .version)
    guard version == Self.supportedVersion else {
      throw DecodingError.dataCorruptedError(forKey: .version, in: c, debugDescription: "what's new version \(version)")
    }
    lang = try c.decode(String.self, forKey: .lang)
    entries = try c.decode([Entry].self, forKey: .entries)
    web = try c.decode(String.self, forKey: .web)
  }

  private enum CodingKeys: String, CodingKey { case version, lang, entries, web }

  /// The entries with their pages (`item`: the index's page at a path), in the site's order; one whose page the index
  /// doesn't have is left out.
  public func rows(_ item: (String) -> HandbookIndex.Item?) -> [Row] {
    entries.enumerated().compactMap { i, e in item(e.path).map { Row(entry: e, item: $0, id: i) } }
  }
}

/// What's new as the site's index names it, kept on the phone as the index is: shown offline, read again with each fresh
/// index.
public struct LatestFile: Sendable {
  public typealias Fetch = @Sendable (URL) async throws -> Data

  /// What reading it came to.
  public enum Reading: Sendable, Equatable {
    /// The site's index names none: the site has no such list here.
    case noList
    case read(Latest)
    /// Not read (offline, a bad answer, a format this app can't read): what's shown stays, and the kept copy.
    case failed
    /// Left for another tab or page before it came: to read again when the tab shows.
    case interrupted
  }

  private let file: URL
  private let site: URL
  private let fetch: Fetch

  /// `file` holds the kept copy; `fetch` reads a file from the site, throwing on any answer but its content.
  public init(file: URL, site: URL, fetch: @escaping Fetch) {
    self.file = file; self.site = site; self.fetch = fetch
  }

  /// The copy on the phone, if there is one this app can read.
  public func kept() -> Latest? {
    guard let data = try? Data(contentsOf: file) else { return nil }
    return try? JSONDecoder().decode(Latest.self, from: data)
  }

  /// The file at `path` (`HandbookIndex.latest`), read from the site and kept.
  public func read(_ path: String?) async -> Reading {
    guard let path, let url = URL(string: path, relativeTo: site)?.absoluteURL else {
      try? FileManager.default.removeItem(at: file)
      return .noList
    }
    do {
      let data = try await fetch(url)
      guard let latest = try? JSONDecoder().decode(Latest.self, from: data) else { return .failed }
      try? data.write(to: file, options: .atomic)
      return .read(latest)
    } catch {
      return isInterruption(error) ? .interrupted : .failed
    }
  }
}
