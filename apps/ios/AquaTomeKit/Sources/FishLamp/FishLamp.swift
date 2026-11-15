import Foundation

/// The Love Ecology light the Fish lamp app drives: by broadcast, not a connection (docs/research/aquarium-device-control.md).
/// Fish lamp sends each command as a list of 12 16-bit service UUIDs, `0x004E` first, then 22 bytes as 11 little-endian
/// UUIDs. The app plays back the owner's own recordings (`love-ecology.json`). Bytes 20–21 are a checksum (`checksum`),
/// which built commands tried on 31 Oct most likely didn't fit: with it, a built white was taken (14 Nov); whether a built
/// on or off is taken is still unknown. Pure: the app advertises the list.
public enum FishLamp {
  public struct Command: Sendable, Equatable, Identifiable {
    /// "off", "on", or a colour: "white", "red", "orange", "yellow", "green", "cyan", "blue", "magenta".
    public let id: String
    /// The 22 bytes as Fish lamp sent them (scrambled).
    public let sent: [UInt8]

    public init(id: String, sent: [UInt8]) { self.id = id; self.sent = sent }

    /// The service UUIDs to advertise, as 4 hex digits each: `004E`, then the bytes in little-endian pairs.
    public var uuids: [String] {
      ["004E"] + stride(from: 0, to: sent.count, by: 2).map { String(format: "%02X%02X", sent[$0 + 1], sent[$0]) }
    }

    /// The bytes unscrambled: `plain[0] = sent[0]`, then `plain[i] = sent[i] ^ ((sent[i-1] - (i-1)) & 0xFF)`.
    public var plain: [UInt8] { FishLamp.unscramble(sent) }
  }

  /// Unscrambled, any length (the light's echoes are 26 bytes): `plain[0] = sent[0]`, then
  /// `plain[i] = sent[i] ^ ((sent[i-1] - (i-1)) & 0xFF)`.
  public static func unscramble(_ sent: [UInt8]) -> [UInt8] {
    sent.indices.map { i in i == 0 ? sent[0] : sent[i] ^ UInt8(truncatingIfNeeded: Int(sent[i - 1]) - (i - 1)) }
  }

  /// Scrambled as Fish lamp sends: `sent[0] = plain[0]`, then `sent[i] = plain[i] ^ ((sent[i-1] - (i-1)) & 0xFF)`.
  public static func scramble(_ plain: [UInt8]) -> [UInt8] {
    var sent: [UInt8] = []
    for (i, p) in plain.enumerated() { sent.append(i == 0 ? p : p ^ UInt8(truncatingIfNeeded: Int(sent[i - 1]) - (i - 1))) }
    return sent
  }

  /// Bytes 20–21, low byte first: a CRC-16 (polynomial 0x1021, start 0xA5FF) over the plain bytes 0–19. Every recorded
  /// command carries it, and so do the light's own 22-byte frames (the 2026-11-06 capture).
  public static func checksum(_ plain: some Sequence<UInt8>) -> UInt16 {
    var c: UInt16 = 0xA5FF
    for b in plain {
      c ^= UInt16(b) << 8
      for _ in 0..<8 { c = c & 0x8000 != 0 ? (c << 1) ^ 0x1021 : c << 1 }
    }
    return c
  }

  /// Commands built anew, for the owner to try from their phone (14 Nov): whether the light takes a built colour, and a
  /// built off and on with bytes 16–19 zero or as a recording has them. Bytes 1–7 as the recorded `on` has them, a byte 0
  /// no recording uses, and the checksum.
  public static let trials: [Command] = {
    guard let on = loveEcology.first(where: { $0.id == "on" }), let off = loveEcology.first(where: { $0.id == "off" }) else { return [] }
    let make = { (id: String, b0: UInt8, body: [UInt8]) in built(id: id, [b0] + Array(on.plain[1..<8]) + body) }
    return [
      make("trial-white-half", 0x48, [0x02, 0x07, 0x00, 0x00, 0x00, 0x00, 0x80, 0x80, 0, 0, 0, 0]),
      make("trial-off", 0x49, Array(off.plain[8..<16]) + [0, 0, 0, 0]),
      make("trial-on", 0x4E, Array(on.plain[8..<16]) + [0, 0, 0, 0]),
      make("trial-off-recorded", 0x4F, Array(off.plain[8..<20])),
      make("trial-on-recorded", 0x4C, Array(on.plain[8..<20])),
    ].compactMap { $0 }
  }()

  /// A command from its plain bytes 0–19: the checksum added, then scrambled. Nil unless 20 bytes.
  public static func built(id: String, _ plain: [UInt8]) -> Command? {
    guard plain.count == 20 else { return nil }
    let c = checksum(plain)
    return Command(id: id, sent: scramble(plain + [UInt8(c & 0xFF), UInt8(c >> 8)]))
  }

  /// The owner's light's commands, in the order the app offers them: off, on, then the colours.
  public static let loveEcology: [Command] = {
    struct File: Decodable { struct C: Decodable { let id: String; let sent: String }; let commands: [C] }
    guard let url = Bundle.module.url(forResource: "love-ecology", withExtension: "json"),
          let data = try? Data(contentsOf: url), let file = try? JSONDecoder().decode(File.self, from: data) else { return [] }
    return file.commands.compactMap { c in
      let bytes = c.sent.split(separator: " ").compactMap { UInt8($0, radix: 16) }
      return bytes.count == 22 ? Command(id: c.id, sent: bytes) : nil
    }
  }()
}
