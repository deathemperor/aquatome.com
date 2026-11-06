import Foundation
import Handbook
import JavaScriptCore
import os

/// A tank's fish checked as the site's tank-mates tool (/vi/cong-cu/nuoi-chung/) checks the fish chosen there: the
/// same verdict, warnings and stocking, in the tool's words. It is the site's own code (apps/site/src/scripts/
/// tank-check.ts, bundled into tank-check.js by apps/site/scripts/app-tank-check.mjs) run in JavaScriptCore, not a port;
/// protocols/tankmates-vectors.json holds the site and the app to the same answers.
public struct TankCheck: Decodable, Equatable, Sendable {
  public struct Verdict: Decodable, Equatable, Sendable {
    /// "no", "care", "unsure" (nothing clashes in the data there is) or "yes".
    public let level: String
    /// The tool's sentence: "Không nên nuôi chung: Cá đĩa có thể ăn Cá neon."
    public let text: String
  }
  public struct Stocking: Decodable, Equatable, Sendable {
    /// How full the tank is with fish, as the tool's meter reads it.
    public let percent: Double
    /// "light", "ok", "full" or "over".
    public let level: String
    public let text: String
    /// Schools too small, a tank too short for one of them, fish of unknown size.
    public let notes: [String]
  }
  /// Whether the fish can share a tank (two or more).
  public let verdict: Verdict?
  /// Who may eat whom, temperaments.
  public let warnings: [String]
  /// For a tank with a size.
  public let stocking: Stocking?
  /// For a tank with no length to check against (no size, or only litres): the longest tank any of them needs.
  public let minTank: String?
  /// When no fish has a size: no meter (it would read 0%), only the fish it couldn't count.
  public let unsized: String?
  /// The fish without a page (a tank's entries without one), named in one line: none of the checks counts them.
  public let unchecked: String?

  /// A row of the tank: its name, its figures from the handbook, how many when the tank says, and what the check counts
  /// it as (`key`): its page's content id, or for a breed that is a form of a species (the index's `of`), the species',
  /// with the species' figures and its name as `species`. The site's code makes the rows with one key one fish
  /// (tank-check.ts `oneFishEach`): their numbers added up, never fewer than the school size while a row gives none.
  public struct Fish: Encodable, Equatable, Sendable {
    public let name: String
    public let facts: HandbookIndex.Facts
    public let count: Int?
    public let key: String?
    public let species: String?
    public init(name: String, facts: HandbookIndex.Facts, count: Int?, key: String? = nil, species: String? = nil) {
      self.name = name; self.facts = facts; self.count = count; self.key = key; self.species = species
    }

    enum CodingKeys: String, CodingKey { case name, count, key, species }
    /// The figures beside the name, as the site's code reads a species.
    public func encode(to encoder: any Encoder) throws {
      var c = encoder.container(keyedBy: CodingKeys.self)
      try c.encode(name, forKey: .name)
      try c.encodeIfPresent(count, forKey: .count)
      try c.encodeIfPresent(key, forKey: .key)
      try c.encodeIfPresent(species, forKey: .species)
      try facts.encode(to: encoder)
    }
  }

  /// The tank's inside size in cm, and its own litres; either, both or neither.
  public struct Size: Encodable, Equatable, Sendable {
    public struct Dims: Encodable, Equatable, Sendable {
      public let l: Double, w: Double, h: Double
      public init(l: Double, w: Double, h: Double) { self.l = l; self.w = w; self.h = h }
    }
    public let dims: Dims?
    public let litres: Double?
    public init(dims: Dims? = nil, litres: Double? = nil) { self.dims = dims; self.litres = litres }
  }
}

/// Runs the site's check in one language ("vi", "id", "th"), with the site's translations. A JavaScript context: keep
/// one to one actor.
public final class TankChecker {
  private let context = JSContext()!
  private let lang: String
  private static let log = Logger(subsystem: "com.aquatome.app", category: "tank-check")

  public init(lang: String) {
    self.lang = lang
    // The site's code throwing on what the app sends is a bug to see, not a check quietly missing.
    context.exceptionHandler = { _, e in
      Self.log.error("tank check threw: \(e?.toString() ?? "", privacy: .public)")
      #if DEBUG
      assertionFailure("tank check: \(e?.toString() ?? "")")
      #endif
    }
    let script = Bundle.module.url(forResource: "tank-check", withExtension: "js").flatMap { try? String(contentsOf: $0, encoding: .utf8) }
    context.evaluateScript(script ?? "")
  }

  /// The check of these fish in a tank of this size. `unlisted`: the names of the tank's fish without a page, which the
  /// check can't count (no figures) and names instead.
  public func check(_ fish: [TankCheck.Fish], size: TankCheck.Size, unlisted: [String] = []) -> TankCheck? {
    struct Input: Encodable { let lang: String; let fish: [TankCheck.Fish]; let size: TankCheck.Size; let unlisted: [String] }
    guard let input = try? JSONEncoder().encode(Input(lang: lang, fish: fish, size: size, unlisted: unlisted)),
          let out = context.objectForKeyedSubscript("aqTankCheck")?.call(withArguments: [String(decoding: input, as: UTF8.self)]),
          out.isString, let json = out.toString() else { return nil }
    do {
      return try JSONDecoder().decode(TankCheck.self, from: Data(json.utf8))
    } catch {
      Self.log.error("tank check answered what the app can't read: \(error, privacy: .public)")
      return nil
    }
  }
}
