import Foundation
import Testing
@testable import Chihiros

// The vectors the site's tests use too (protocols/chihiros-vectors.json), so both send the same bytes.
struct Vectors: Decodable {
  struct Sched: Decodable {
    let on: String, off: String, ramp: Int, levels: [Int]
    var value: Schedule { Schedule(on: TimeOfDay(on)!, off: TimeOfDay(off)!, ramp: ramp, levels: levels) }
  }
  struct FrameCase: Decodable { let note: String?; let cmd: UInt8; let mode: UInt8; let params: [UInt8]; let id: UInt16; let hex: String }
  struct LevelCase: Decodable { let note: String?; let channel: Int; let level: Int; let id: UInt16; let hex: String }
  struct ModeCase: Decodable { let note: String?; let mode: UInt8; let id: UInt16; let hex: String }
  struct TimeCase: Decodable { let note: String?; let local: String; let id: UInt16; let hex: String }
  struct StatusCase: Decodable { let id: UInt16; let hex: String }
  struct ScheduleCase: Decodable { let note: String?; let schedule: Sched; let channels: Int; let id: UInt16; let hex: String }
  struct IdCase: Decodable { let note: String?; let id: UInt16; let next: UInt16 }
  struct ParamsCase: Decodable { let note: String?; let schedule: Sched; let channels: Int; let params: [UInt8] }
  struct ModelCase: Decodable { let note: String?; let name: String; let model: String?; let channels: [Channel]? }
  struct FirmwareCase: Decodable { let reply: String; let firmware: Int? }
  struct HoursCase: Decodable { let on: String; let off: String; let hours: Double }

  let frame: [FrameCase]
  let setLevel: [LevelCase]
  let setMode: [ModeCase]
  let setTime: [TimeCase]
  let askStatus: [StatusCase]
  let setSchedule: [ScheduleCase]
  let nextId: [IdCase]
  let scheduleParams: [ParamsCase]
  let modelOf: [ModelCase]
  let firmwareOf: [FirmwareCase]
  let hoursLit: [HoursCase]

  static let shared: Vectors = {
    // Tests/ChihirosTests/VectorTests.swift → the repository root, six levels up.
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<6 { url.deleteLastPathComponent() }
    let data = try! Data(contentsOf: url.appendingPathComponent("protocols/chihiros-vectors.json"))
    return try! JSONDecoder().decode(Vectors.self, from: data)
  }()
}

func hex(_ b: [UInt8]) -> String { b.map { String(format: "%02x", $0) }.joined(separator: " ") }
func bytes(_ h: String) -> [UInt8] { h.split(separator: " ").map { UInt8($0, radix: 16)! } }

let v = Vectors.shared

@Test func framesMatchTheCaptures() {
  for c in v.frame { #expect(hex(Frame.make(cmd: c.cmd, mode: c.mode, params: c.params, id: c.id)) == c.hex, "\(c.note ?? "")") }
  for c in v.setLevel { #expect(hex(Frame.setLevel(channel: c.channel, level: c.level, id: c.id)) == c.hex, "\(c.note ?? "")") }
  for c in v.setMode { #expect(hex(Frame.setMode(c.mode, id: c.id)) == c.hex, "\(c.note ?? "")") }
  for c in v.askStatus { #expect(hex(Frame.askStatus(id: c.id)) == c.hex) }
  for c in v.setSchedule {
    #expect(hex(Frame.setSchedule(c.schedule.value, channels: c.channels, id: c.id)) == c.hex, "\(c.note ?? "")")
  }
}

@Test func messageIdsSkip0x5aAndWrap() {
  for c in v.nextId { #expect(Frame.nextId(after: c.id) == c.next, "\(c.note ?? "")") }
}

@Test func clockFrameSendsTheIsoWeekday() {
  let zone = TimeZone(identifier: "Asia/Ho_Chi_Minh")!
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_US_POSIX")
  f.calendar = Calendar(identifier: .gregorian)
  f.timeZone = zone
  f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
  for c in v.setTime {
    #expect(hex(Frame.setTime(f.date(from: c.local)!, timeZone: zone, id: c.id)) == c.hex, "\(c.note ?? "")")
  }
}

@Test func schedulesAre14Bytes() {
  for c in v.scheduleParams { #expect(Frame.scheduleParams(c.schedule.value, channels: c.channels) == c.params, "\(c.note ?? "")") }
}

@Test func modelsByLongestNamePrefix() {
  for c in v.modelOf {
    let m = Model.of(name: c.name)
    #expect(m?.name == c.model, "\(c.name)")
    if let ch = c.channels { #expect(m?.channels == ch, "\(c.name)") }
  }
}

@Test func statusRepliesAndHoursOfLight() {
  for c in v.firmwareOf { #expect(Reply.firmware(bytes(c.reply)) == c.firmware) }
  for c in v.hoursLit { #expect(Schedule.hoursLit(on: TimeOfDay(c.on)!, off: TimeOfDay(c.off)!) == c.hours) }
}
