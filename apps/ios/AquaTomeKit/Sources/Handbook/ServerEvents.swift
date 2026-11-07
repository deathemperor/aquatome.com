import Foundation

/// One server-sent event (`text/event-stream`): its name (`event:`, "message" when it gives none) and its data (its
/// `data:` lines, joined by line breaks).
public struct ServerEvent: Sendable, Equatable {
  public let name: String
  public let data: String
  public init(name: String, data: String) { self.name = name; self.data = data }
}

/// Server-sent events, as the Worker streams an answer (the chat's, protocols/chat.openapi.json): read from the
/// response's bytes as they come, by the HTML standard's rules for event streams. Generic, by the events' names: the
/// chat reads its own (Chat.event), and another stream (fish ID's) can read its.
public enum ServerEvents {
  /// A request sent for a stream: the answer's status and its bytes as they arrive. The app's session (`urlSession`), or
  /// a stand-in.
  public typealias Send = @Sendable (URLRequest) async throws -> (status: Int, bytes: AsyncThrowingStream<UInt8, any Error>)

  /// Each event in `bytes`, in order, as soon as the blank line that ends it arrives; an event the bytes end in the middle
  /// of isn't one (the standard's rule: it may be cut short). `each` returning false stops reading.
  public static func read<Bytes: AsyncSequence>(_ bytes: Bytes, _ each: (ServerEvent) async throws -> Bool) async throws where Bytes.Element == UInt8 {
    var reader = ServerEventReader()
    var line: [UInt8] = []
    // A \r ends a line, and a \n straight after it belongs to that end.
    var afterReturn = false
    for try await b in bytes {
      if b == 0x0A, afterReturn { afterReturn = false; continue }
      afterReturn = b == 0x0D
      guard b == 0x0A || b == 0x0D else { line.append(b); continue }
      let text = String(decoding: line, as: UTF8.self)
      line.removeAll(keepingCapacity: true)
      if let e = reader.read(line: text), try await !each(e) { return }
    }
  }

  /// The events of a whole stream, as `read` gives them.
  public static func events(in data: Data) async throws -> [ServerEvent] {
    var out: [ServerEvent] = []
    try await read(AsyncThrowingStream<UInt8, any Error> { c in data.forEach { c.yield($0) }; c.finish() }) { out.append($0); return true }
    return out
  }

  /// The app's session for a stream: its bytes handed on as they arrive, the request ended when they're no longer read.
  public static func urlSession(_ session: URLSession) -> Send {
    { request in
      let (bytes, response) = try await session.bytes(for: request)
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let stream = AsyncThrowingStream<UInt8, any Error> { c in
        let task = Task {
          do {
            for try await b in bytes { c.yield(b) }
            c.finish()
          } catch {
            c.finish(throwing: error)
          }
        }
        c.onTermination = { _ in task.cancel() }
      }
      return (status, stream)
    }
  }
}

/// The standard's parser: a stream's lines in, its events out.
public struct ServerEventReader: Sendable {
  private var name = ""
  private var data: [String] = []
  private var first = true

  public init() {}

  /// One line, without its line break: the event a blank line ends, if it had data.
  public mutating func read(line raw: String) -> ServerEvent? {
    // A byte order mark may open the stream.
    let line = first && raw.hasPrefix("\u{FEFF}") ? String(raw.dropFirst()) : raw
    first = false
    if line.isEmpty {
      defer { (name, data) = ("", []) }
      return data.isEmpty ? nil : ServerEvent(name: name.isEmpty ? "message" : name, data: data.joined(separator: "\n"))
    }
    // A comment (`: ping`, which keeps the connection open).
    if line.hasPrefix(":") { return nil }
    let field: Substring, value: Substring
    if let colon = line.firstIndex(of: ":") {
      field = line[..<colon]
      let rest = line[line.index(after: colon)...]
      value = rest.hasPrefix(" ") ? rest.dropFirst() : rest
    } else {
      (field, value) = (line[...], "")
    }
    switch field {
    case "event": name = String(value)
    case "data": data.append(String(value))
    default: break  // id, retry, and fields the standard ignores
    }
    return nil
  }
}
