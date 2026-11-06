import Testing
@testable import FishLamp

private func command(_ id: String) -> FishLamp.Command { FishLamp.loveEcology.first { $0.id == id }! }
private func hex(_ b: ArraySlice<UInt8>) -> String { b.map { String(format: "%02x", $0) }.joined(separator: " ") }

@Test func theOwnersLightHasOffOnAndEightColours() {
  #expect(FishLamp.loveEcology.map(\.id) == ["off", "on", "white", "red", "orange", "yellow", "green", "cyan", "blue", "magenta"])
  #expect(FishLamp.loveEcology.allSatisfy { $0.sent.count == 22 })
}

// What each recording says once unscrambled, as decoded from the 2026-11-06 capture: from the phone (`07`), to light 3
// (`00 03`, Fish lamp's "Aquarium Light III"; `ff ff` is its Master Control), the same app ID in every one.
@Test func eachRecordingIsTheCommandItsNameSays() {
  for c in FishLamp.loveEcology {
    #expect(hex(c.plain[1...3]) == "07 00 03", Comment(rawValue: c.id))
  }
  #expect(Set(FishLamp.loveEcology.map { hex($0.plain[4...7]) }).count == 1, "recordings from more than one Fish lamp app")
  #expect(hex(command("off").plain[8...9]) == "00 00")
  #expect(hex(command("on").plain[8...9]) == "00 01")
  // A colour: `02 07`, then its hue, saturation and value, 16 bits each (white: no saturation).
  let colours = ["white": "00 00 00 00 ff ff", "red": "00 00 ff ff ff ff", "orange": "15 40 ff ff ff ff", "yellow": "2a ab ff ff ff ff",
                 "green": "55 55 ff ff ff ff", "cyan": "80 00 ff ff ff ff", "blue": "aa aa ff ff ff ff", "magenta": "d5 55 ff ff ff ff"]
  for (id, hsv) in colours {
    #expect(hex(command(id).plain[8...15]) == "02 07 " + hsv, Comment(rawValue: id))
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
