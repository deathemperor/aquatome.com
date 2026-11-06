import Foundation

/// The Love Ecology light the Fish lamp app drives: by broadcast, not a connection (docs/research/aquarium-device-control.md).
/// Fish lamp sends each command as a list of 12 16-bit service UUIDs, `0x004E` first, then 22 bytes as 11 little-endian
/// UUIDs. The light takes a recorded command played back, not one built (bytes 16–21 look like a signature), so the app
/// plays back the owner's own recordings (`love-ecology.json`). Pure: the app advertises the list.
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

    /// The bytes unscrambled: byte 0 as is, each later one XOR (the byte before it, less its index less one).
    public var plain: [UInt8] {
      sent.indices.map { i in i == 0 ? sent[0] : sent[i] ^ UInt8(truncatingIfNeeded: Int(sent[i - 1]) - (i - 1)) }
    }
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
