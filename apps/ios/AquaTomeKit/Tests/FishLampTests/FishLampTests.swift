import Testing
@testable import FishLamp

private func command(_ id: String) throws -> FishLamp.Command { try #require(FishLamp.loveEcology.first { $0.id == id }, Comment(rawValue: id)) }
private func hex(_ b: ArraySlice<UInt8>) -> String { b.map { String(format: "%02x", $0) }.joined(separator: " ") }

// A recording that isn't 22 bytes is dropped, so it goes missing here.
@Test func theOwnersLightHasOffOnAndEightColours() {
  #expect(FishLamp.loveEcology.map(\.id) == ["off", "on", "white", "red", "orange", "yellow", "green", "cyan", "blue", "magenta"])
}

// What each recording says once unscrambled, as decoded from the 2026-11-06 capture: from the phone (`07`), to light 3
// (`00 03`, Fish lamp's "Aquarium Light III"; `ff ff` is its Master Control), the same app ID in every one.
@Test func eachRecordingIsTheCommandItsNameSays() throws {
  for c in FishLamp.loveEcology {
    #expect(hex(c.plain[1...3]) == "07 00 03", Comment(rawValue: c.id))
  }
  #expect(Set(FishLamp.loveEcology.map { hex($0.plain[4...7]) }).count == 1, "recordings from more than one Fish lamp app")
  #expect(hex(try command("off").plain[8...9]) == "00 00")
  #expect(hex(try command("on").plain[8...9]) == "00 01")
  // A colour: `02 07`, then its hue, saturation and value, 16 bits each (white: no saturation), then 4 zeros. An on or
  // off's bytes 16–19 only the light can check.
  let colours = ["white": "00 00 00 00 ff ff", "red": "00 00 ff ff ff ff", "orange": "15 40 ff ff ff ff", "yellow": "2a ab ff ff ff ff",
                 "green": "55 55 ff ff ff ff", "cyan": "80 00 ff ff ff ff", "blue": "aa aa ff ff ff ff", "magenta": "d5 55 ff ff ff ff"]
  for (id, hsv) in colours {
    #expect(hex(try command(id).plain[8...19]) == "02 07 " + hsv + " 00 00 00 00", Comment(rawValue: id))
  }
}

@Test func aCommandIsAdvertisedAs12UUIDsTheBytesLittleEndian() {
  let c = FishLamp.Command(id: "x", sent: Array(0..<22))
  #expect(c.uuids.count == 12)
  #expect(c.uuids.first == "004E")
  #expect(Array(c.uuids[1...3]) == ["0100", "0302", "0504"])
  #expect(c.uuids.last == "1514")
}

@Test func unscramblingUndoesWhatFishLampDoes() {
  // Scrambled as Fish lamp scrambles: each byte after the first XOR (the scrambled byte before it, less its index less 1).
  let plain: [UInt8] = (0..<22).map { UInt8($0 * 7 & 0xff) }
  var sent = [plain[0]]
  for i in 1..<22 { sent.append(plain[i] ^ UInt8(truncatingIfNeeded: Int(sent[i - 1]) - (i - 1))) }
  #expect(FishLamp.Command(id: "x", sent: sent).plain == plain)
}

// Bytes 20–21 of every recording are the checksum of its bytes 0–19, and building a recording again from those 20 bytes
// gives back exactly what Fish lamp sent: on and off with their bytes 16–19 as recorded.
@Test func everyRecordingCarriesTheChecksumAndBuildsBackAsSent() throws {
  for c in FishLamp.loveEcology {
    let p = c.plain
    #expect(FishLamp.checksum(p[0..<20]) == UInt16(p[20]) | UInt16(p[21]) << 8, Comment(rawValue: c.id))
    #expect(try #require(FishLamp.built(id: c.id, Array(p[0..<20]))).sent == c.sent, Comment(rawValue: c.id))
  }
  #expect(FishLamp.built(id: "short", Array(repeating: 0, count: 19)) == nil)
}

@Test func scramblingAndUnscramblingAreEachOthersUndoing() {
  let plain: [UInt8] = (0..<26).map { UInt8($0 * 11 & 0xff) }
  #expect(FishLamp.unscramble(FishLamp.scramble(plain)) == plain)
}

// The owner's trials: each says what its name says, from the same app ID to the same light, with a byte 0 no recording
// uses and the checksum; the second off and on carry their recording's bytes 16–19.
@Test func theTrialsAreTheCommandsTheirNamesSay() throws {
  #expect(FishLamp.trials.map(\.id) == ["trial-white-half", "trial-off", "trial-on", "trial-off-recorded", "trial-on-recorded"])
  let on = try command("on"), off = try command("off")
  let recorded = Set(FishLamp.loveEcology.map { $0.plain[0] })
  for t in FishLamp.trials {
    let p = t.plain
    #expect(p[1...7] == on.plain[1...7], Comment(rawValue: t.id))
    #expect(!recorded.contains(p[0]), Comment(rawValue: t.id))
    #expect(FishLamp.checksum(p[0..<20]) == UInt16(p[20]) | UInt16(p[21]) << 8, Comment(rawValue: t.id))
  }
  let trial = { (id: String) in try #require(FishLamp.trials.first { $0.id == id }).plain }
  #expect(hex(try trial("trial-white-half")[8...19]) == "02 07 00 00 00 00 80 80 00 00 00 00")
  #expect(try trial("trial-off")[8...19] == off.plain[8...15] + [0, 0, 0, 0])
  #expect(try trial("trial-on")[8...19] == on.plain[8...15] + [0, 0, 0, 0])
  #expect(try trial("trial-off-recorded")[8...19] == off.plain[8...19])
  #expect(try trial("trial-on-recorded")[8...19] == on.plain[8...19])
}
