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

// A colour built anew from degrees and fractions is byte for byte the recording of the same colour, given its byte 0: Fish
// lamp's hue is degrees × 65535 / 360 rounded half up (60° is `2a ab`), its saturation 16 bits, its brightness one byte
// doubled. Orange is left out: Fish lamp's is `15 40`, not 30°.
@Test func aColourBuiltAnewIsTheRecordingOfTheSameColour() throws {
  let colours: [(id: String, hue: Double, saturation: Double)] = [
    ("white", 0, 0), ("red", 0, 1), ("yellow", 60, 1), ("green", 120, 1), ("cyan", 180, 1), ("blue", 240, 1), ("magenta", 300, 1),
  ]
  for c in colours {
    let r = try command(c.id)
    let built = try #require(FishLamp.colour(hue: c.hue, saturation: c.saturation, brightness: 1, sequence: r.plain[0]))
    #expect(built.sent == r.sent, Comment(rawValue: c.id))
  }
}

// Half brightness is the trial white the light took on 14 Nov. Fish lamp's sliders send brightness as a byte doubled
// (`a8 a8` for 168) and saturation in 16 bits (`a9 52`, 6 Nov). Hue goes round; saturation and brightness stop at their ends.
@Test func aColoursBrightnessAndSaturationAreOnFishLampsScales() throws {
  let white = try #require(FishLamp.trials.first { $0.id == "trial-white-half" })
  #expect(try #require(FishLamp.colour(hue: 0, saturation: 0, brightness: 0.5, sequence: 0x48)).sent == white.sent)
  let pale = try #require(FishLamp.colour(hue: 0, saturation: Double(0xa952) / 65535, brightness: 168.0 / 255, sequence: 1))
  #expect(hex(pale.plain[12...15]) == "a9 52 a8 a8")
  #expect(hex(try #require(FishLamp.colour(hue: 420, saturation: 2, brightness: -1, sequence: 1)).plain[10...15]) == "2a ab ff ff 00 00")
  #expect(hex(try #require(FishLamp.colour(hue: -60, saturation: 1, brightness: 1, sequence: 1)).plain[10...11]) == "d5 55")
}

// Byte 0 of a command built anew: under 0x80, as every byte 0 a phone has sent, never one a recording or a trial uses, and
// round all the others before any comes back.
@Test func aFreshByte0IsNoRecordingsOrTrialsAndGoesRoundTheRest() {
  let used = Set((FishLamp.loveEcology + FishLamp.trials).map { $0.plain[0] })
  var b: UInt8 = 0x7F
  var seen: [UInt8] = []
  for _ in 0..<(128 - used.count) {
    b = FishLamp.sequence(after: b)
    seen.append(b)
  }
  #expect(seen.allSatisfy { $0 < 0x80 && !used.contains($0) })
  #expect(Set(seen).count == seen.count)
  #expect(FishLamp.sequence(after: b) == seen.first)
  #expect(FishLamp.sequence(after: 0xFF) < 0x80)
}

// A slider's value goes out once the finger pauses, or at once when it lifts, and never sooner than the gap after the last
// broadcast ends, even one still on air.
@Test func aSlidersValueGoesOnPauseOrLiftAndNotBeforeTheGap() {
  let pacer = FishLamp.Pacer(pause: .milliseconds(300), gap: .seconds(2))
  let t = ContinuousClock.now
  #expect(pacer.due(moved: t, lifted: false, lastEnded: nil) == t + .milliseconds(300))
  #expect(pacer.due(moved: t, lifted: true, lastEnded: nil) == t)
  #expect(pacer.due(moved: t, lifted: true, lastEnded: t - .seconds(5)) == t)
  #expect(pacer.due(moved: t, lifted: true, lastEnded: t - .seconds(1)) == t + .seconds(1))
  #expect(pacer.due(moved: t, lifted: false, lastEnded: t + .seconds(1)) == t + .seconds(3))
}

// A swatch at the card's level: each recorded colour's own hue and saturation (orange's `15 40` too) at another brightness;
// at full brightness with its byte 0 it is the recording. On and off aren't colours.
@Test func aRecordedColourAtAnotherBrightnessKeepsItsHueAndSaturation() throws {
  for r in FishLamp.loveEcology where r.plain[8] == 0x02 {
    #expect(try #require(FishLamp.colour(like: r, brightness: 1, sequence: r.plain[0])).sent == r.sent, Comment(rawValue: r.id))
    let dim = try #require(FishLamp.colour(like: r, brightness: 0.35, sequence: 1)).plain
    #expect(dim[10...13] == r.plain[10...13], Comment(rawValue: r.id))
    #expect(hex(dim[14...15]) == "59 59", Comment(rawValue: r.id))
  }
  #expect(FishLamp.colour(like: try command("off"), brightness: 1, sequence: 1) == nil)
}
