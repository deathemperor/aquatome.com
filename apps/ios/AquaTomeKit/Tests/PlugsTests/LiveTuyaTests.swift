import Foundation
import Testing
@testable import Plugs

// A hands-on check against Tuya's real cloud, read-only, for the owner's own project: run with AQUATOME_TUYA_LIVE=1 and
// TUYA_ACCESS_ID, TUYA_ACCESS_SECRET (and TUYA_DATA_CENTER, westernAmerica by default) in the environment. It reads
// the list once and switches nothing (the outlets switch mains power on real tanks). It prints counts only: never a
// key, a token, an id or a name. Skipped everywhere else, CI included.

let live = ProcessInfo.processInfo.environment

@Test(.enabled(if: live["AQUATOME_TUYA_LIVE"] == "1" && live["TUYA_ACCESS_ID"] != nil && live["TUYA_ACCESS_SECRET"] != nil))
func liveListRead() async throws {
  let keys = TuyaKeys(accessId: live["TUYA_ACCESS_ID"]!, accessSecret: live["TUYA_ACCESS_SECRET"]!,
                      dataCenter: live["TUYA_DATA_CENTER"].flatMap(TuyaDataCenter.init(rawValue:)) ?? .westernAmerica)
  let paths = Paths()
  let send = TuyaPlugs.urlSession()
  let l = try await TuyaPlugs(keys: keys, send: { r in
    #expect(r.httpMethod == "GET", "the live check sent something other than a read")
    guard r.httpMethod == "GET" else { throw URLError(.cancelled) }
    await paths.add(r.url!.path)
    return try await send(r)
  }).list()
  let p = await paths.all
  let outlets = l.plugs.flatMap(\.outlets)
  print("""
    live: \(l.plugs.count) plugs (\(l.plugs.filter(\.online).count) online), \(outlets.count) outlets (\(outlets.filter { $0.on == true }.count) on, \
    \(outlets.filter { $0.name != nil }.count) named), \(l.others) other devices; requests: \(p.filter { $0.hasSuffix("/associated-users/devices") }.count) list pages, \
    \(p.filter { $0.hasSuffix("/status") }.count) status reads, \(p.filter { $0.hasSuffix("/multiple-names") }.count) name reads
    """)
}

actor Paths {
  private(set) var all: [String] = []
  func add(_ p: String) { all.append(p) }
}
