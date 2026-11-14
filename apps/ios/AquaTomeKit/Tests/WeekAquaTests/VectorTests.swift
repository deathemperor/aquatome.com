import Chihiros
import Foundation
import Testing
@testable import WeekAqua

// The vectors meant for the site's tests too (protocols/weekaqua-vectors.json), so both send the same bytes.
struct Vectors: Decodable {
  struct Gatt: Decodable {
    struct Case: Decodable { let note: String; let service: String; let characteristics: [String]; let write: String? }
    let discover: [String]
    let write: [Case]
  }
  struct AdvertCase: Decodable {
    let note: String; let name: String; let manufacturerData: String?
    let code: String?; let supported: Bool?; let address: String?; let isWeekAqua: Bool?
  }
  struct ClockCase: Decodable { let note: String?; let local: String; let hex: String }
  struct LevelsCase: Decodable { let note: String?; let levels: [Int]; let hex: String? }
  struct ManualCase: Decodable { let hex: String }
  struct TimerCase: Decodable { let note: String?; let on: String; let off: String; let hex: String }
  struct PresetCase: Decodable { let id: String; let levels: [Int] }
  struct BrightnessCase: Decodable { let note: String?; let preset: String; let brightness: Int; let levels: [Int] }
  struct WriteCase: Decodable { let note: String; let local: String; let levels: [Int]; let on: String; let off: String; let frames: [String] }

  let gatt: Gatt
  let advert: [AdvertCase]
  let clock: [ClockCase]
  let levels: [LevelsCase]
  let manual: ManualCase
  let timer: [TimerCase]
  let presets: [PresetCase]
  let brightness: [BrightnessCase]
  let write: [WriteCase]

  static let shared: Vectors = {
    // Tests/WeekAquaTests/VectorTests.swift → the repository root, six levels up.
    var url = URL(fileURLWithPath: #filePath)
    for _ in 0..<6 { url.deleteLastPathComponent() }
    let data = try! Data(contentsOf: url.appendingPathComponent("protocols/weekaqua-vectors.json"))
    return try! JSONDecoder().decode(Vectors.self, from: data)
  }()
}

func hex(_ b: [UInt8]) -> String { b.map { String(format: "%02x", $0) }.joined(separator: " ") }
func bytes(_ h: String) -> [UInt8] { h.split(separator: " ").map { UInt8($0, radix: 16)! } }

let v = Vectors.shared
let saigon = TimeZone(identifier: "Asia/Ho_Chi_Minh")!

/// A local time in `saigon` ("2026-11-03T21:35:07").
func local(_ text: String) -> Date {
  let f = DateFormatter()
  f.locale = Locale(identifier: "en_US_POSIX")
  f.calendar = Calendar(identifier: .gregorian)
  f.timeZone = saigon
  f.dateFormat = "yyyy-MM-dd'T'HH:mm:ss"
  return f.date(from: text)!
}

func timer(_ on: String, _ off: String) -> DailyTimer { DailyTimer(on: TimeOfDay(on)!, off: TimeOfDay(off)!) }

@Test func onlyFff2UnderFff0IsEverWritten() {
  #expect(WeekAquaGATT.servicesToDiscover == v.gatt.discover)
  #expect(!WeekAquaGATT.servicesToDiscover.contains(where: WeekAquaGATT.isFirmwareUpdate))
  for c in v.gatt.write {
    #expect(WeekAquaGATT.writeCharacteristic(service: c.service, characteristics: c.characteristics) == c.write, "\(c.note)")
  }
  #expect(WeekAquaGATT.isFirmwareUpdate(WeekAquaGATT.firmwareUpdate))
}

@Test func lightsByTheirManufacturerDataAndName() {
  for c in v.advert {
    let a = WeekAquaAdvert.of(manufacturerData: c.manufacturerData.map(bytes), name: c.name)
    if c.isWeekAqua == false { #expect(a == nil, "\(c.note)"); continue }
    #expect(a?.code == c.code, "\(c.note)")
    #expect(a?.isSupported == c.supported, "\(c.note)")
    #expect(a?.addressText == c.address, "\(c.note)")
  }
}

@Test func theClockInBcdAtThePhonesTime() {
  for c in v.clock { #expect(hex(WeekAquaFrame.clock(local(c.local), timeZone: saigon)) == c.hex, "\(c.note ?? c.local)") }
}

@Test func levelsFrom0To235AndNoOthers() {
  for c in v.levels {
    #expect(WeekAquaLevels(c.levels).map { hex(WeekAquaFrame.levels($0)) } == c.hex, "\(c.note ?? "\(c.levels)")")
  }
  #expect(WeekAquaLevels(red: 0, green: 0, blue: 0, uv: 236) == nil)
}

@Test func manualModeIsEightBytes() {
  #expect(hex(WeekAquaFrame.manual) == v.manual.hex)
}

@Test func theTimerInBcdWithWhatWeekAquaSendsInItsSeventhByte() {
  for c in v.timer { #expect(hex(WeekAquaFrame.timer(timer(c.on, c.off))) == c.hex, "\(c.note ?? "\(c.on)–\(c.off)")") }
}

@Test func bcdIsTwoDecimalDigits() {
  #expect(WeekAquaFrame.bcd(0) == 0x00)
  #expect(WeekAquaFrame.bcd(9) == 0x09)
  #expect(WeekAquaFrame.bcd(35) == 0x35)
  #expect(WeekAquaFrame.bcd(59) == 0x59)
  #expect(WeekAquaFrame.bcd(99) == 0x99)
  #expect(WeekAquaFrame.bcd(100) == nil)
  #expect(WeekAquaFrame.bcd(-1) == nil)
}

@Test func weekAquasPresetsAndTheBrightnessThatScalesThem() throws {
  #expect(WeekAquaPreset.all.map(\.id) == v.presets.map(\.id))
  for c in v.presets { #expect(WeekAquaPreset.named(c.id)?.levels.array == c.levels, "\(c.id)") }
  for c in v.brightness {
    let p = try #require(WeekAquaPreset.named(c.preset))
    #expect(p.levels.scaled(by: c.brightness).array == c.levels, "\(c.note ?? "\(c.preset) at \(c.brightness)%")")
  }
}

@Test func aWriteIsTheFiveFramesInTheirOrder() throws {
  for c in v.write {
    let s = WeekAquaSetting(levels: try #require(WeekAquaLevels(c.levels)), timer: timer(c.on, c.off))
    #expect(WeekAquaSession.frames(s, now: local(c.local), timeZone: saigon).map(hex) == c.frames, "\(c.note)")
  }
}
