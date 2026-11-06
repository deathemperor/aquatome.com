import Foundation

// MetricKit's reports as `jsonRepresentation()` writes them, with every part iOS 26 can put in one: what the app keeps
// of them (`Diagnostic.kept`) is checked against these.

/// A day's measures (MXMetricPayload).
let metricSample = Data(#"""
{
  "appVersion": "1.0",
  "timeStampBegin": "2026-11-03 00:00:00 +0700",
  "timeStampEnd": "2026-11-03 23:59:00 +0700",
  "metaData": {
    "appBuildVersion": "114", "osVersion": "iPhone OS 26.5 (23F77)", "deviceType": "iPhone17,3", "regionFormat": "VN",
    "platformArchitecture": "arm64e", "lowPowerModeEnabled": true, "isTestFlightApp": false, "pid": 4242,
    "bundleIdentifier": "com.aquatome.app"
  },
  "applicationExitMetrics": {
    "foregroundExitData": {
      "cumulativeNormalAppExitCount": 3, "cumulativeMemoryResourceLimitExitCount": 1, "cumulativeBadAccessExitCount": 1,
      "cumulativeAbnormalExitCount": 0, "cumulativeIllegalInstructionExitCount": 0, "cumulativeAppWatchdogExitCount": 1
    },
    "backgroundExitData": {
      "cumulativeNormalAppExitCount": 5, "cumulativeMemoryPressureExitCount": 2, "cumulativeSuspendedWithLockedFileExitCount": 0,
      "cumulativeBackgroundTaskAssertionTimeoutExitCount": 1, "cumulativeCPUResourceLimitExitCount": 0
    }
  },
  "applicationResponsivenessMetrics": {
    "histogrammedAppHangTime": {
      "histogramNumBuckets": 2,
      "histogramValue": {
        "0": { "bucketCount": 4, "bucketStart": "0 ms", "bucketEnd": "100 ms" },
        "1": { "bucketCount": 1, "bucketStart": "400 ms", "bucketEnd": "500 ms" }
      }
    }
  },
  "applicationLaunchMetrics": {
    "histogrammedTimeToFirstDrawKey": { "histogramNumBuckets": 1, "histogramValue": { "0": { "bucketCount": 7, "bucketStart": "1000 ms", "bucketEnd": "1010 ms" } } },
    "histogrammedOptimizedTimeToFirstDrawKey": { "histogramNumBuckets": 1, "histogramValue": { "0": { "bucketCount": 2, "bucketStart": "600 ms", "bucketEnd": "610 ms" } } },
    "histogrammedResumeTime": { "histogramNumBuckets": 1, "histogramValue": { "0": { "bucketCount": 9, "bucketStart": "200 ms", "bucketEnd": "210 ms" } } },
    "histogrammedExtendedLaunch": { "histogramNumBuckets": 1, "histogramValue": { "0": { "bucketCount": 1, "bucketStart": "1500 ms", "bucketEnd": "1510 ms" } } }
  },
  "memoryMetrics": {
    "peakMemoryUsage": "84 MB",
    "averageSuspendedMemory": { "averageValue": "31 MB", "standardDeviation": 0, "sampleCount": 12 }
  },
  "cpuMetrics": { "cumulativeCPUTime": "112 sec", "cumulativeCPUInstructions": "1200 kiloinstructions" },
  "gpuMetrics": { "cumulativeGPUTime": "20 sec" },
  "cellularConditionMetrics": {
    "cellConditionTime": { "histogramNumBuckets": 1, "histogramValue": { "0": { "bucketCount": 20, "bucketStart": "1 bars", "bucketEnd": "1 bars" } } }
  },
  "networkTransferMetrics": {
    "cumulativeCellularDownload": "12 MB", "cumulativeWifiDownload": "80 MB", "cumulativeCellularUpload": "1 MB", "cumulativeWifiUpload": "3 MB"
  },
  "locationActivityMetrics": {
    "cumulativeBestAccuracyForNavigationTime": "0 sec", "cumulativeBestAccuracyTime": "0 sec", "cumulativeHundredMetersAccuracyTime": "0 sec",
    "cumulativeNearestTenMetersAccuracyTime": "0 sec", "cumulativeKilometerAccuracyTime": "0 sec", "cumulativeThreeKilometersAccuracyTime": "0 sec"
  },
  "displayMetrics": { "averagePixelLuminance": { "averageValue": "50 apl", "standardDeviation": 0, "sampleCount": 500 } },
  "diskIOMetrics": { "cumulativeLogicalWrites": "1300 kB" },
  "diskSpaceUsageMetrics": { "totalBinaryFileSize": "30 MB", "totalDataFileSize": "100 MB" },
  "animationMetrics": { "scrollHitchTimeRatio": "2 ms per s" },
  "applicationTimeMetrics": {
    "cumulativeForegroundTime": "700 sec", "cumulativeBackgroundTime": "40 sec", "cumulativeBackgroundAudioTime": "0 sec",
    "cumulativeBackgroundLocationTime": "0 sec"
  },
  "signpostMetrics": [
    { "signpostCategory": "Handbook", "signpostName": "open", "totalSignpostCount": 30, "signpostIntervalData": { "signpostCumulativeCPUTime": "30 ms" } }
  ]
}
"""#.utf8)

/// A call stack as MetricKit writes one: a frame of the app over one of the system's.
let stackSample = #"""
{
  "callStackPerThread": true,
  "callStacks": [
    {
      "threadAttributed": true,
      "callStackRootFrames": [
        {
          "binaryUUID": "70B89F27-1634-3580-A695-57CDB41D7743", "offsetIntoBinaryTextSegment": 165304, "sampleCount": 1,
          "binaryName": "AquaTome", "address": 7170766264,
          "subFrames": [
            { "binaryUUID": "77A62F2E-8212-30F3-84C1-E8497440ACF8", "offsetIntoBinaryTextSegment": 6948, "sampleCount": 1, "binaryName": "libdyld.dylib", "address": 7170766300 }
          ]
        }
      ]
    }
  ]
}
"""#

/// The details MetricKit puts in each diagnostic, with what's free text in them.
let diagnosticAbout = #"""
"appBuildVersion": "114", "appVersion": "1.0", "osVersion": "iPhone OS 26.5 (23F77)", "deviceType": "iPhone17,3", "regionFormat": "VN",
"platformArchitecture": "arm64e", "lowPowerModeEnabled": false, "isTestFlightApp": false, "pid": 4242, "bundleIdentifier": "com.aquatome.app"
"""#

/// A crash, a hang and the kinds of diagnostics the app doesn't send (MXDiagnosticPayload), hangs lasting `hang`.
func diagnosticSample(hang: String = "1.5 sec") -> Data {
  Data(#"""
  {
    "timeStampBegin": "2026-11-03 10:00:00 +0700",
    "timeStampEnd": "2026-11-03 10:00:00 +0700",
    "crashDiagnostics": [
      {
        "version": "1.0.0",
        "callStackTree": \#(stackSample),
        "diagnosticMetaData": {
          \#(diagnosticAbout),
          "exceptionType": 1, "exceptionCode": 0, "signal": 11,
          "terminationReason": "Namespace SIGNAL, Code 11 Segmentation fault: 11",
          "virtualMemoryRegionInfo": "0 is not in any region.  Bytes before following region: 4000000000",
          "exceptionReason": {
            "composedMessage": "Light DYSL30A1B2C3 in Living room tank did not answer",
            "formatString": "Light %@ in %@ did not answer",
            "arguments": ["DYSL30A1B2C3", "Living room tank"],
            "exceptionType": "NSInternalInconsistencyException", "className": "NSException", "exceptionName": "NSInternalInconsistencyException"
          }
        }
      }
    ],
    "hangDiagnostics": [
      { "version": "1.0.0", "callStackTree": \#(stackSample), "diagnosticMetaData": { \#(diagnosticAbout), "hangDuration": "\#(hang)" } }
    ],
    "cpuExceptionDiagnostics": [
      { "version": "1.0.0", "callStackTree": \#(stackSample), "diagnosticMetaData": { \#(diagnosticAbout), "totalCPUTime": "20 sec", "totalSampledTime": "20 sec" } }
    ],
    "diskWriteExceptionDiagnostics": [
      { "version": "1.0.0", "callStackTree": \#(stackSample), "diagnosticMetaData": { \#(diagnosticAbout), "writesCaused": "2000 MB" } }
    ],
    "appLaunchDiagnostics": [
      { "version": "1.0.0", "callStackTree": \#(stackSample), "diagnosticMetaData": { \#(diagnosticAbout), "launchDuration": "5 sec" } }
    ]
  }
  """#.utf8)
}
