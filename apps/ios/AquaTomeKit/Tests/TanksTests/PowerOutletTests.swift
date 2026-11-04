import Foundation
import Testing
@testable import Tanks

// Which outlet powers a light: picked by the reader from the plugs on the light's tank, kept on the light's record.

/// A tank with a light, a strip of three outlets (the first named "Đèn" in Smart Life) and, on another tank, a strip
/// with an outlet named "Light".
private func setUp() throws -> (TankStore, light: Device, strip: Device, other: Device) {
  var s = TankStore()
  let t = try s.addTank(name: "Bể 60", now: t0)
  let light = try s.metLight(bleName: "DYNWRGB0BEEF", model: "WRGB II", tankName: "Bể", now: t0)
  let u = try s.addTank(name: "Bể khác", now: t0)
  let strip = try s.addPlug(tankId: t.id, brand: "tuya", remoteId: "fake-strip-1", name: "Ổ cắm bể 60",
                            outlets: [("switch_1", "Đèn"), ("switch_2", "CO2"), ("switch_3", nil)], now: t0)
  let other = try s.addPlug(tankId: u.id, brand: "tuya", remoteId: "fake-strip-2", name: "Ổ cắm kệ", outlets: [("switch_1", "Light")], now: t0)
  return (s, light, strip, other)
}

@Test func aLightIsOfferedTheOutletsOfThePlugsOnItsTankOnly() throws {
  let (s, light, strip, _) = try setUp()
  let offered = s.outlets(for: light)
  #expect(offered.map(\.plug.id) == [strip.id, strip.id, strip.id])
  #expect(offered.map(\.outlet.code) == ["switch_1", "switch_2", "switch_3"] && offered.map(\.number) == [1, 2, 3])
  #expect(s.outlets(for: strip).isEmpty, "a plug offered outlets to plug into")
}

@Test func theOutletPickedIsKeptOnTheLightsRecordAndValid() throws {
  let f = try setUp()
  var s = f.0
  let (light, strip, other) = (f.light, f.strip, f.other)
  #expect(s.powerOutlet(of: light) == nil, "an outlet assumed before the reader picked one")
  try s.updateDevice(light.id, now: t0) { $0.powerOutlet = PowerOutlet(plugId: strip.id, code: "switch_1") }
  let l = try #require(s.device(light.id))
  #expect(l.json["powerOutlet"] == .object(["plugId": .string(strip.id), "code": .string("switch_1")]))
  #expect(Validate.store(s.value) == [])
  #expect(s.powerOutlet(of: l)?.outlet.code == "switch_1" && s.powerOutlet(of: l)?.plug.id == strip.id)
  // A plug on another tank, an outlet the strip doesn't have, or a plug taken off the tank: no outlet picked.
  for pick in [PowerOutlet(plugId: other.id, code: "switch_1"), PowerOutlet(plugId: strip.id, code: "switch_9")] {
    try s.updateDevice(light.id, now: t0) { $0.powerOutlet = pick }
    #expect(s.powerOutlet(of: try #require(s.device(light.id))) == nil)
  }
  try s.updateDevice(light.id, now: t0) { $0.powerOutlet = PowerOutlet(plugId: strip.id, code: "switch_1") }
  try s.deleteDevice(strip.id, now: t0)
  #expect(s.powerOutlet(of: try #require(s.device(light.id))) == nil)
  // Cleared: the key goes.
  try s.updateDevice(light.id, now: t0) { $0.powerOutlet = nil }
  #expect(s.device(light.id)?.json["powerOutlet"] == nil)
}

@Test func aPickTheSchemaRefusesLeavesTheStoreAsItWas() throws {
  let f = try setUp()
  var s = f.0
  let light = f.light
  let before = s
  #expect(throws: TankStoreError.self) { try s.updateDevice(light.id, now: t0) { $0.powerOutlet = PowerOutlet(plugId: "fake-strip-1", code: "switch_1") } }
  #expect(throws: TankStoreError.self) { try s.updateDevice(light.id, now: t0) { $0.powerOutlet = PowerOutlet(plugId: newRecordId(), code: "") } }
  #expect(s == before)
}

@Test func anOutletNamedForALightIsSuggestedNeverPicked() throws {
  let (s, light, strip, _) = try setUp()
  #expect(s.suggestedOutlet(for: light)?.outlet.code == "switch_1" && s.suggestedOutlet(for: light)?.plug.id == strip.id)
  #expect(s.powerOutlet(of: light) == nil)
  // Ignoring case and accents, đ as d; "light" anywhere in the name; "đèn" as a word, not inside another.
  for name in ["Đèn", "đèn bể", "ĐÈN", "Den", "den1", "Light", "LIGHTS", "Moonlight", "Đèn LED"] {
    #expect(PlugOutlet(code: "switch_1", label: name).looksLikeLight, "\(name) not taken for a light")
  }
  for name in ["CO2", "Lọc", "Garden", "Golden", "Sưởi"] {
    #expect(!PlugOutlet(code: "switch_1", label: name).looksLikeLight, "\(name) taken for a light")
  }
  // What the reader said it powers.
  var o = PlugOutlet(code: "switch_3")
  #expect(!o.looksLikeLight)
  o.role = "light"
  #expect(o.looksLikeLight)
  // None named for a light: nothing suggested.
  var t = TankStore()
  let tank = try t.addTank(name: "Bể", now: t0)
  let l = try t.metLight(bleName: "DYNWRGB0BEEF", model: "WRGB II", tankName: "Bể", now: t0)
  try t.addPlug(tankId: tank.id, brand: "tuya", remoteId: "fake-strip-1", name: "Ổ", outlets: [("switch_1", "CO2")], now: t0)
  #expect(t.suggestedOutlet(for: l) == nil && t.outlets(for: l).count == 1)
}
