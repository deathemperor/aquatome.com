import Foundation
import Testing
@testable import Telemetry

// iOS's reports (MetricKit) carry only what the privacy policy names: unexpected quits, hangs, launch time and memory,
// and crashes and hangs with their call stacks. From real-shaped reports holding every part iOS can put in one.

private func object(_ d: Data?) -> [String: Any] { d.flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:] }
private func keys(_ v: Any?) -> Set<String> { Set((v as? [String: Any])?.keys.map { $0 } ?? []) }
private let about: Set<String> = ["appBuildVersion", "osVersion", "deviceType"]
/// Words of the parts that never leave the phone, each in the samples: none is in what's sent.
private let neverSent = [
  "appVersion", "timeStamp", "regionFormat", "VN", "lowPowerModeEnabled", "isTestFlightApp", "platformArchitecture", "pid",
  "bundleIdentifier", "com.aquatome.app", "cpuMetrics", "gpuMetrics", "cellularConditionMetrics", "networkTransferMetrics",
  "locationActivityMetrics", "displayMetrics", "diskIOMetrics", "diskSpaceUsageMetrics", "animationMetrics", "applicationTimeMetrics",
  "signpostMetrics", "Handbook", "exceptionReason", "composedMessage", "formatString", "arguments", "Living room", "DYSL30A1B2C3",
  "NSInternalInconsistencyException", "terminationReason", "Segmentation", "virtualMemoryRegionInfo", "cpuExceptionDiagnostics",
  "diskWriteExceptionDiagnostics", "appLaunchDiagnostics", "totalCPUTime", "writesCaused", "launchDuration",
]

@Test("A day's measures keep the build, iOS's version and the model, and the quits, hangs, launch and memory measures; nothing else")
func keepsTheMeasuresThePolicyNames() throws {
  let all = object(metricSample)
  let sent = try #require(Diagnostic.kept(.metric, json: metricSample))
  let kept = object(sent)
  #expect(Set(kept.keys) == ["metaData", "applicationExitMetrics", "applicationResponsivenessMetrics", "applicationLaunchMetrics", "memoryMetrics"])
  #expect(keys(kept["metaData"]) == about)
  #expect((kept["metaData"] as? NSDictionary)?["deviceType"] as? String == "iPhone17,3")
  for k in kept.keys where k != "metaData" { #expect((kept[k] as? NSDictionary) == (all[k] as? NSDictionary), "\(k) changed") }
  let text = String(decoding: sent, as: UTF8.self)
  for w in neverSent { #expect(!text.contains(w), "\(w) is sent") }
}

@Test("A crash and a hang keep their call stacks, the build, iOS's version, the model and the crash's codes or the hang's length; no free text, no other diagnostics")
func keepsCrashesAndHangsWithTheirStacks() throws {
  let sent = try #require(Diagnostic.kept(.diagnostic, json: diagnosticSample()))
  let kept = object(sent)
  #expect(Set(kept.keys) == ["crashDiagnostics", "hangDiagnostics"])
  let crash = try #require((kept["crashDiagnostics"] as? [[String: Any]])?.first)
  let hang = try #require((kept["hangDiagnostics"] as? [[String: Any]])?.first)
  #expect(Set(crash.keys) == ["version", "callStackTree", "diagnosticMetaData"] && Set(hang.keys) == Set(crash.keys))
  #expect(keys(crash["diagnosticMetaData"]) == about.union(["exceptionType", "exceptionCode", "signal"]))
  #expect(keys(hang["diagnosticMetaData"]) == about.union(["hangDuration"]))
  // The stacks whole, frame within frame.
  let stack = try JSONSerialization.jsonObject(with: Data(stackSample.utf8)) as? NSDictionary
  #expect(crash["callStackTree"] as? NSDictionary == stack && hang["callStackTree"] as? NSDictionary == stack)
  let text = String(decoding: sent, as: UTF8.self)
  for w in neverSent { #expect(!text.contains(w), "\(w) is sent") }
}

@Test("A report with none of that in it isn't sent; through Telemetry, what's sent is the cut-down report")
func sendsOnlyTheCutDownReport() async throws {
  #expect(Diagnostic.kept(.diagnostic, json: Data(#"{"cpuExceptionDiagnostics":[{"version":"1.0.0"}],"timeStampBegin":"x"}"#.utf8)) == nil)
  #expect(Diagnostic.kept(.metric, json: Data(#"{"metaData":{"osVersion":"26.5"},"cpuMetrics":{}}"#.utf8)) == nil)
  #expect(Diagnostic.kept(.metric, json: Data("not json".utf8)) == nil)

  let fake = FakeCollector()
  let t = Telemetry(about: About(app: "1.0 (114)", os: "26.5", device: "iPhone17,3", lang: "vi"), readerAllows: true, file: nil,
                    site: URL(string: "https://aquatome.com")!, send: { try await fake.send($0) })
  t.siteAllows(true)
  t.diagnostic(.metric, json: metricSample)
  t.diagnostic(.diagnostic, json: diagnosticSample())
  t.diagnostic(.diagnostic, json: Data(#"{"cpuExceptionDiagnostics":[]}"#.utf8))
  await t.flush()
  #expect(fake.received.map(\.path) == ["/api/v1/app/diagnostics", "/api/v1/app/diagnostics"])
  for r in fake.received {
    let text = String(decoding: r.body, as: UTF8.self)
    for w in neverSent { #expect(!text.contains(w), "\(w) is sent") }
  }
  #expect(keys(object(fake.received[1].body)["payload"]) == ["crashDiagnostics", "hangDiagnostics"])
}

/// Every object in `v`, at every level, with a field MetricKit doesn't write (an iOS to come, or text that shouldn't
/// go): as `x-unknown`, holding a string, a number and an object in turn.
private func withUnknowns(_ v: Any) -> Any {
  if let list = v as? [Any] { return list.map(withUnknowns) }
  guard let o = v as? [String: Any] else { return v }
  var out = o.mapValues(withUnknowns)
  out["x-unknown"] = ["free text from somewhere", 42, ["x-unknown-inner": "more text"]][o.count % 3]
  return out
}

/// The value at `path` in `v` (field names, and list indexes as numbers).
private func at(_ v: Any, _ path: [Any]) -> Any? {
  path.reduce(Optional(v)) { cur, step in
    if let i = step as? Int { return (cur as? [Any]).flatMap { i < $0.count ? $0[i] : nil } }
    return (cur as? [String: Any])?[step as! String]
  }
}

@Test("Allow-listed at every level: a field MetricKit doesn't write, anywhere in a report, is dropped, and the rest is as before")
func dropsUnknownFieldsAtEveryLevel() throws {
  for (kind, sample, levels) in [
    (Diagnostic.Kind.metric, metricSample, [
      [], ["metaData"], ["applicationExitMetrics"], ["applicationExitMetrics", "foregroundExitData"], ["applicationResponsivenessMetrics"],
      ["applicationResponsivenessMetrics", "histogrammedAppHangTime"], ["applicationResponsivenessMetrics", "histogrammedAppHangTime", "histogramValue"],
      ["applicationResponsivenessMetrics", "histogrammedAppHangTime", "histogramValue", "0"], ["applicationLaunchMetrics"],
      ["memoryMetrics"], ["memoryMetrics", "averageSuspendedMemory"],
    ] as [[Any]]),
    (.diagnostic, diagnosticSample(), [
      [], ["crashDiagnostics", 0], ["crashDiagnostics", 0, "diagnosticMetaData"], ["crashDiagnostics", 0, "callStackTree"],
      ["crashDiagnostics", 0, "callStackTree", "callStacks", 0], ["crashDiagnostics", 0, "callStackTree", "callStacks", 0, "callStackRootFrames", 0],
      ["crashDiagnostics", 0, "callStackTree", "callStacks", 0, "callStackRootFrames", 0, "subFrames", 0], ["hangDiagnostics", 0],
      ["hangDiagnostics", 0, "diagnosticMetaData"], ["hangDiagnostics", 0, "callStackTree", "callStacks", 0, "callStackRootFrames", 0, "subFrames", 0],
    ] as [[Any]]),
  ] {
    let unknown = withUnknowns(try JSONSerialization.jsonObject(with: sample))
    // The field is there at each level the test names, so a deny-list (dropping only what's known to be bad) fails here.
    for level in levels { #expect((at(unknown, level) as? [String: Any])?["x-unknown"] != nil, "\(kind): none at \(level)") }
    let sent = try #require(Diagnostic.kept(kind, json: JSONSerialization.data(withJSONObject: unknown)))
    #expect(!String(decoding: sent, as: UTF8.self).contains("x-unknown"), "\(kind): an unknown field is sent")
    #expect(sent == Diagnostic.kept(kind, json: sample), "\(kind): what's known changed")
  }
}

@Test("A field of another shape than MetricKit writes is dropped: a single value only a number or a string")
func dropsFieldsOfAnotherShape() throws {
  let crash = #"{"crashDiagnostics":[{"version":"1.0.0","diagnosticMetaData":{"osVersion":"26.5","exceptionCode":{"text":"a message"},"signal":[11,"more"],"exceptionType":1}}]}"#
  let kept = object(Diagnostic.kept(.diagnostic, json: Data(crash.utf8)))
  #expect(keys(((kept["crashDiagnostics"] as? [Any])?.first as? [String: Any])?["diagnosticMetaData"]) == ["osVersion", "exceptionType"])
  let metric = #"{"memoryMetrics":{"peakMemoryUsage":{"note":"a message"},"averageSuspendedMemory":{"averageValue":"31 MB"}},"applicationExitMetrics":["x"]}"#
  #expect(String(decoding: Diagnostic.kept(.metric, json: Data(metric.utf8)) ?? Data(), as: UTF8.self) == #"{"memoryMetrics":{"averageSuspendedMemory":{"averageValue":"31 MB"}}}"#)
}

@Test("A report left with nothing is not sent: an empty section, a list of empty items, or only unknown fields")
func sendsNoEmptyReport() {
  for (kind, json) in [
    (Diagnostic.Kind.metric, #"{"metaData":{"osVersion":"26.5"},"applicationExitMetrics":{}}"#),
    (.metric, #"{"metaData":{"osVersion":"26.5"},"applicationExitMetrics":{"foregroundExitData":{}},"memoryMetrics":{"x-unknown":1}}"#),
    (.metric, #"{"applicationLaunchMetrics":{"histogrammedTimeToFirstDrawKey":{"histogramValue":{"x":{"bucketCount":1}}}}}"#),
    (.diagnostic, #"{"crashDiagnostics":[{}]}"#),
    (.diagnostic, #"{"crashDiagnostics":[{},{}],"hangDiagnostics":[{"x-unknown":"a message"}]}"#),
    (.diagnostic, #"{"hangDiagnostics":[{"callStackTree":{"callStacks":[{"callStackRootFrames":[{}]}]}}]}"#),
  ] {
    #expect(Diagnostic.kept(kind, json: Data(json.utf8)) == nil, "\(json) is sent")
  }
}
