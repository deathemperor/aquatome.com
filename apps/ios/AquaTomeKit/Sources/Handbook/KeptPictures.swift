import Foundation

/// The pictures of pages kept for reading offline, as files in a folder the system doesn't empty (Application Support,
/// not the caches folder, which it clears when the phone is short of room): one file per picture, named by a hash of
/// its address.
public struct KeptPictures: Sendable {
  public let dir: URL

  public init(dir: URL) { self.dir = dir }

  /// The picture at `src`, if it's kept.
  public func data(_ src: String) -> Data? { try? Data(contentsOf: file(src)) }

  /// Keeps the picture at `src`; true when it's on the phone.
  public func save(_ data: Data, for src: String) -> Bool {
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return (try? data.write(to: file(src), options: .atomic)) != nil
  }

  public func remove(_ src: String) { try? FileManager.default.removeItem(at: file(src)) }

  /// 64-bit FNV-1a of the address, in hex: the same name on every launch.
  private func file(_ src: String) -> URL {
    var h: UInt64 = 0xcbf2_9ce4_8422_2325
    for b in src.utf8 { h = (h ^ UInt64(b)) &* 0x0000_0100_0000_01b3 }
    return dir.appending(path: String(h, radix: 16))
  }
}
