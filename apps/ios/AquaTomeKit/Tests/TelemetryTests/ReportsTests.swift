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
